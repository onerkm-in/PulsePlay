# DX1 — Launcher / Runtime Contract

> **Status:** locked 2026-05-21 as DX1a. **Scope:** the contract a future DX1b implementation must satisfy. **Not a build instruction.** No runtime code lives here.
>
> **Lineage:** [ADR-0010 — Artifact Strategy](adr/0010-artifact-strategy.md) locked the ecosystem decision: PulsePlay is one repo / one download, with the desktop artifact as a packaged local runtime launcher (not a native UI shell). This doc is the implementation contract for that decision.

---

## 1. Purpose

The desktop EXE is a **packaged local runtime launcher** for the existing PulsePlay React web app. It exists so an author/analyst/DPM can double-click one file and get the same PulsePlay experience they would get from a deployed install, without installing Node, npm, a proxy service, or admin tooling.

It is **not** a second native UI shell. The React app stays the canonical UI surface. The launcher's only UI obligation is the OS-level chrome around browser launch (a tray-less terminal/console window is acceptable for DX1; richer UX is a DX3 concern).

It is **not** a production server. The recon-disclaimer rule from ADR-0010 applies: every first-launch and every Settings → System screen in EXE mode MUST surface a "local recon — not for shared deployments" callout. Multi-user hosting is a non-goal.

## 2. User flow (the five steps)

1. **Double-click the packaged EXE.** First launch creates the colocated `PulsePlayData/` folder beside the EXE.
2. **The launcher starts two services on random loopback ports**, bound only to `127.0.0.1`:
   - the **bundled app server**, which serves the pre-built PulsePlay React app (the `playground/dist/` output) and proxies `/api/*` to the proxy port
   - the **bundled proxy**, which is the unchanged `proxy/server.js` started with the right env vars and `config.json` baked into the package
3. **The launcher generates a one-time launch token**, writes it into the launch URL only (never the file system), and parks it in process memory for the proxy to validate.
4. **The launcher opens a private/incognito browser window** at the launch URL. Preference order is documented in §6. The browser receives the token via URL fragment (not query string), so server logs and browser history do not capture it.
5. **The user works in the React app as usual.** Durable **Save Changes** writes go through the local runtime's `/runtime/*` endpoints into `PulsePlayData/` — not into the private browser's session-scoped storage. When the user closes the browser window, the launcher detects loss-of-heartbeat and cleans up (see §10).

## 3. Process model

Two child processes, supervised by the launcher:

| Process | Source | Notes |
|---|---|---|
| Bundled app server | new `enablers/desktop/runtime/app-server.{js,mjs}` (DX1b) | Static-files for `playground/dist/`; proxies `/api/*` → proxy port; serves `/runtime/*` Save Changes endpoints; serves `/launch/<token>` redirect |
| Bundled proxy | unchanged `proxy/server.js` started with desktop env | Same code, same routes, same governance; binds 127.0.0.1:<random>; the launcher passes the desktop client identity via `X-Pulse-Client: pulseplay-desktop` middleware injected on the app-server proxy hop |

A single Node process with both servers running on different ports inside it is acceptable for DX1b. A two-process supervisor is acceptable too. The packaging choice in DX1c determines which is simpler to wrap. **No "lite proxy" variant.** ADR-0010 forbids it.

The launcher (parent process) owns: port discovery, token generation, browser launch, heartbeat watchdog, shutdown orchestration, and writing logs to `PulsePlayData/logs/`.

## 4. Port discovery

Both services bind random ephemeral ports on `127.0.0.1`. The launcher discovers free ports by binding `127.0.0.1:0`, reading back the OS-assigned port, then closing and re-opening on that port from the child process — the classic "ephemeral handoff" pattern. Acceptable on Windows / macOS / Linux.

Two non-negotiable rules:

- **Never bind to `0.0.0.0` or the network address.** Authors on shared corporate networks would otherwise expose the launcher to LAN traffic, defeating the point of a local recon tool.
- **Never reuse a fixed port between sessions.** Two concurrent EXE runs on the same machine MUST coexist on different ports. The launcher writes the chosen port pair to `PulsePlayData/runtime/lock.json` for the lifetime of the session and clears it on exit.

If the OS refuses to assign a port after 5 attempts (rare; usually means firewall lockdown), the launcher exits with a clear error message and a `runtime/logs/launch-error.txt` write.

## 5. Launch token

A 256-bit random token generated per session. Lifetime = launcher process lifetime.

- The launcher **does not** persist the token to disk. It lives in process memory and in the launch URL fragment only.
- The browser receives it via `http://127.0.0.1:<app-port>/launch#token=<token>`. URL fragments are not sent to servers and do not appear in standard server logs; the React app reads `location.hash`, sets a `pulseplay:desktop-launch-token` in `sessionStorage`, and clears the hash via `history.replaceState`.
- Every subsequent request from the React app to the app server's `/runtime/*` endpoints carries `X-PulsePlay-Launch-Token: <token>` (header, not cookie). The app server validates against the in-memory token and rejects mismatches with 401 + a non-leaky error body.
- The proxy is unaware of the token. The app server is the trust boundary; the proxy already binds to 127.0.0.1 and inherits desktop client identity via the app server's reverse-proxy injection.

Token rotation across multiple `PulsePlay.exe` invocations is automatic (one token per process). There is no "forgot my token" recovery — the user closes the browser, double-clicks the EXE again, gets a new session.

## 6. Browser launch matrix

Preference order (from ADR-0010 §Desktop EXE Position):

| Rank | Browser | Windows command | macOS command | Linux command | Private flag |
|---|---|---|---|---|---|
| 1 | Chrome | `chrome.exe --incognito --new-window <url>` | `open -na "Google Chrome" --args --incognito --new-window <url>` | `google-chrome --incognito --new-window <url>` | `--incognito` |
| 2 | Edge | `msedge.exe --inprivate --new-window <url>` | `open -na "Microsoft Edge" --args --inprivate --new-window <url>` | `microsoft-edge --inprivate --new-window <url>` | `--inprivate` |
| 3 | Firefox | `firefox.exe -private-window <url>` | `open -na Firefox --args -private-window <url>` | `firefox -private-window <url>` | `-private-window` |
| 4 | Brave | `brave.exe --incognito --new-window <url>` | `open -na "Brave Browser" --args --incognito --new-window <url>` | `brave-browser --incognito --new-window <url>` | `--incognito` |
| 5 | Default browser | OS default | `open <url>` | `xdg-open <url>` | none — log a clear warning |

Detection uses standard registry / `which` / Spotlight probes. The launcher emits a single line per attempt to `runtime/logs/launch.log`:

```text
[launch] tried=chrome  outcome=spawned  pid=<n>
[launch] tried=edge    outcome=not-found
```

When all four private-capable browsers fail, the launcher **must** log `tried=default  outcome=spawned  WARNING=private-mode-not-guaranteed` and the React app **must** render a top-bar callout: "Browser may not be in private mode. Some preferences will persist." DX1b ships this fallback path; DX2 may add a "do not launch unless private" hard-mode toggle in Settings → System.

## 7. Same-origin / `/api` model

The app server runs the same `/api/*` → proxy-port rewrite that the Vite dev server runs (see [`playground/vite.config.ts`](../playground/vite.config.ts) `server.proxy`). Same prefix strip (`^/api → ""`), same `changeOrigin: true` semantics. This means the React app's existing `fetch("/api/...")` calls work unchanged in the EXE — no `VITE_API_BASE_URL` toggle, no environment-switching code path.

Same-origin policy benefits:

- No CORS preflight headaches.
- `sessionStorage` is per-origin; the token-in-sessionStorage scheme works.
- The bundled proxy keeps its 127.0.0.1-only bind because the only client reaching it is the app server, not the browser.

The app server injects `X-Pulse-Client: pulseplay-desktop`, `X-Pulse-Client-Version: <build-version>`, and `X-Pulse-Request-Id: <uuid>` on every proxy hop, matching the PX1 client contract (already normalized in `proxy/lib/pulseClientContext.js`).

## 8. Save Changes endpoints (`/runtime/*`)

The React app gets a new `desktopRuntimeClient` (added in DX1b) that detects EXE mode by the presence of `sessionStorage['pulseplay:desktop-launch-token']` and routes durable writes through these endpoints:

| Endpoint | Verb | Body | Reads/Writes |
|---|---|---|---|
| `/runtime/state` | `GET` | — | Returns the merged Settings state from `PulsePlayData/profiles/<active>/state.json` |
| `/runtime/state` | `PUT` | `{ scope: "settings" \| "layout" \| "wizard", patch: <json-patch> }` | Applies patch to the active profile's state file atomically (write-temp-then-rename) |
| `/runtime/profile/active` | `GET` / `PUT` | `{ name: string }` | Reads/writes which profile is active |
| `/runtime/profiles` | `GET` | — | Lists profiles in `PulsePlayData/profiles/` |
| `/runtime/profile` | `POST` | `{ name, copyFrom?: string }` | Creates a profile from blank or a clone |
| `/runtime/profile/<name>` | `DELETE` | — | Deletes a profile after a confirmation token round-trip (the app server returns a one-shot confirm token on first DELETE attempt; the React app re-DELETEs with `X-Confirm-Token: <t>` to actually delete) |
| `/runtime/secrets` | `PUT` | `{ key: string, value: string }` | DX2 hardens: writes to encrypted `PulsePlayData/secrets.enc`. **DX1b ships an unencrypted JSON at-risk surface**; the React app shows a Settings → System warning chip until DX2 lands. |
| `/runtime/logs/recent` | `GET` | — | Returns the last 1000 lines of `PulsePlayData/logs/proxy.log` and `runtime.log` for the in-app log viewer (already exists in `playground/src/components/ProxyLogPanel.tsx`) |
| `/runtime/version` | `GET` | — | Returns launcher build version + bundled proxy version + bundled app build hash for the recon-disclaimer screen |

Every `/runtime/*` request validates `X-PulsePlay-Launch-Token` before reading or writing. All writes are atomic (`write tmpfile → rename`) to survive a launcher crash mid-write.

**The React app's existing Settings Save Bar** ([`playground/src/settings/SettingsSaveBar.tsx`](../playground/src/settings/SettingsSaveBar.tsx)) is the integration point: in browser mode, it writes to `localStorage`; in EXE mode, the `desktopRuntimeClient` intercepts and `PUT`s to `/runtime/state`. The existing UI does not change. (Wiring lives in DX1b.)

## 9. `PulsePlayData/` layout

Mirrors the ADR-0010 candidate layout, locked here:

```text
PulsePlay.exe                  # the packaged launcher
PulsePlayData/
  config.json                  # non-secret runtime config (proxy port floor, log retention, etc.)
  secrets.enc                  # DX2: encrypted secrets store (proxy keys, embed tokens). DX1b writes unencrypted secrets.json with a Settings warning.
  profiles/
    default/
      state.json               # the active settings/layout/wizard merged state
      packs/                   # per-profile pack overrides (mirrors playground's pack model)
      cache/                   # discovery cache, allowlist cache (TTL-managed; non-secret)
    <other-profile>/
      ...
  logs/
    launch.log                 # browser-launch attempt audit
    runtime.log                # app-server + Save Changes audit
    proxy.log                  # bundled proxy log (already a proxy concern, just relocated)
  runtime/
    lock.json                  # session port pair + pid; cleared on exit
    last-error.txt             # last fatal error message, if any
```

Encryption boundary is the `secrets.enc` file and (DX2) optionally the `state.json` per profile. DX1b ships unencrypted writes for everything to keep the contract observable; DX2 turns on encryption-at-rest with platform-specific key storage (DPAPI on Windows, Keychain on macOS, libsecret on Linux).

## 10. Lifecycle and shutdown

Browser-close detection is fundamentally lossy (no portable "did the user close the tab" hook). The launcher uses a **client heartbeat** model:

- The React app sends `POST /runtime/heartbeat` every 15s while alive.
- The launcher considers the session dead after 45s without a heartbeat.
- On dead-session detection, the launcher: (a) sends `SIGTERM` to both child processes, (b) writes `[shutdown] reason=heartbeat-timeout` to `runtime.log`, (c) clears `runtime/lock.json`, (d) exits with code 0.

Explicit shutdown paths:

- React app's Settings → System has a **"Quit PulsePlay"** button that `POST`s `/runtime/quit` with the launch token. The launcher cleans up the same way and exits 0.
- Closing the console window the launcher started in MUST also clean up. Windows: handle `CTRL_CLOSE_EVENT`. macOS/Linux: handle `SIGINT`/`SIGTERM`/`SIGHUP`.
- If the launcher crashes, the next launch detects `lock.json` exists, checks if the pid in it is alive, and either inherits a healthy session (multi-tab scenario) or reaps the stale lock and starts fresh.

## 11. Security and threat model

The threat model is **single-user local recon**, not "harden against attackers on the same machine." A hostile process on the same machine can already read the user's home directory and inspect 127.0.0.1 traffic. The launcher does not pretend to defend against that. It DOES defend against:

| Risk | Mitigation |
|---|---|
| Browser sends token in URL query → server logs leak it | Token rides in URL **fragment** only; React app moves it to `sessionStorage` and clears the hash |
| Another app on the box probes random 127.0.0.1 ports and finds ours | Every `/runtime/*` request validates the token; the proxy is behind the app server and not exposed to the browser |
| LAN host scans port 8787 | Bind 127.0.0.1 explicitly; never 0.0.0.0; reject `Host:` headers that aren't loopback |
| Secrets in plaintext on disk | DX2 ships at-rest encryption; DX1b ships an in-app warning chip |
| Click-the-EXE → silent malware-style "double-click ran code" surprise | Recon disclaimer on first launch; in-app log of "started bundled proxy on port X, bundled app on port Y, opened Chrome incognito" so the user can see what happened |
| Token leaks via screen share | Out of scope — the user controls screen sharing. The launch URL is one of many places this risk shows up. |

The **recon disclaimer** is a hard-locked UX rule: every Settings → System screen and every first-launch screen in EXE mode (`X-Pulse-Client: pulseplay-desktop` is the runtime signal) shows a callout reading:

> ⚠ **Local recon mode.** This is a packaged local runtime for inspecting and experimenting with PulsePlay on your own machine. Do not share screenshots that include the launch URL, profile names, or proxy logs. Do not use this build to serve other users.

## 12. Logging and redaction

Three logs live in `PulsePlayData/logs/`:

| Log | Source | Redaction |
|---|---|---|
| `launch.log` | launcher | None — only browser detection results and launch outcomes |
| `runtime.log` | app server | `X-PulsePlay-Launch-Token` redacted to `***`; `X-PulsePlay-Key` redacted; `Authorization` headers redacted; `secrets.json` values never logged |
| `proxy.log` | bundled proxy | Already redacted by `proxy/server.js`'s existing audit middleware (`pulseClientContext.js` + the per-route audit context) |

DX1b uses naive `log4js`-style rotation (10 MB × 5 files). DX2 introduces structured JSON logs + a single recon-friendly text view in the React app via `/runtime/logs/recent`.

## 13. Cross-platform stance

DX1 is **Windows-first**. The contract above is portable in principle (the browser matrix and `PulsePlayData/` shape are OS-agnostic), but DX1b's acceptance signal is Windows-only. macOS and Linux launchers are explicit DX3 (or DX4) concerns; the DX1b/DX1c packaging path MUST NOT bake in Windows-only assumptions in the runtime contract (path separators, process spawn semantics, etc.), but it MAY use a Windows-only packaging wrapper.

## 14. Out of scope for DX1 (deferred to DX2 / DX3)

- At-rest encryption of `secrets.enc` and per-profile state (DX2)
- TTL / clear-on-quit for `PulsePlayData/cache/` (DX2)
- Tray icon, dock icon, single-instance enforcement (DX3)
- Auto-update / signed releases (DX3)
- macOS / Linux launcher binaries (DX3+)
- Bundled Chromium fallback when no system browser is installed (DX3+; explicitly rejected for DX1 per ADR-0010 — that's the Electron path)
- Multi-profile concurrent sessions in one launcher (DX2+)

## 15. Implementation choice criteria (decided in DX1b)

The launcher is wrapped exactly once. Three candidates, ranked by simplest-first:

| Wrapper | Pros | Cons | Pick when |
|---|---|---|---|
| **Node + `pkg` or `nexe`** (default) | Single-binary; the bundled proxy is already Node; one runtime to debug | Larger binary (~60 MB); pkg lifecycle a bit dated | Default. Pick unless one of the other rows wins on a hard requirement. |
| **PowerShell + bundled `node.exe`** | No packaging step; trivial to debug | Windows-only; user sees a console window; needs `node.exe` in `PulsePlayData/runtime/` | If `pkg`/`nexe` build pipeline becomes infeasible AND we accept Windows-only for DX1 |
| **Tauri** | Mature single-binary; tray icon, lifecycle, OS integration; smaller than Electron | Rust toolchain dependency; we don't need a WebView (the browser IS our UI); over-engineered for the launcher role | Pick only when `pkg`/`nexe` fail AND we need tray icon, signing, or OS integration that PowerShell can't provide |

DX1b decision is a one-line ADR-0011 (or a 2-paragraph addendum to ADR-0010) with the chosen row and the reason. ADR-0010's "Tauri only as fallback" rule already prevents accidental adoption.

## 16. Acceptance signal for DX1b (the next slice)

DX1b is "shipped" when a fresh Windows 11 machine with no Node, no npm, and no PulsePlay clone can:

1. Download a single ZIP / installer / `.exe`.
2. Double-click it.
3. Land in a private/incognito browser with the React app rendered and the AISidebar showing a "Ready" pill.
4. Open Settings → AI, fill in a proxy profile, click **Save Changes**, and see the change persist after a full quit-and-relaunch cycle (the assertion that `/runtime/state` actually wrote to `PulsePlayData/profiles/default/state.json`).
5. Quit via Settings → System → "Quit PulsePlay" and see the launcher exit cleanly with no orphan Node processes.

A DX1b smoke runner under `enablers/desktop/scripts/` should automate steps 2-5 against a packaged build.

## 17. Tripwires

- **Private browsers may block `localStorage` writes** (depends on browser/version). The React app's Settings code path **must** treat `localStorage` writes as best-effort in EXE mode and rely on `/runtime/state` for durability. DX1b must not regress this — the existing `localStorage`-only Save semantics break in private windows.
- **The bundled proxy's `config.json`** must be the **packaged** copy, not the user-editable one. Authors editing `PulsePlayData/config.json` should affect runtime knobs only, not connector behavior; connector profiles live in the proxy's bundled config. The exact split is decided in DX1c (packaging) but the boundary is locked here.
- **`pulseClientContext.js` already normalizes `pulseplay-desktop`.** DX1b just has to send the header. Do not invent a new client identity string.
- **Heartbeat timing is conservative on purpose.** Private browsers may throttle background tabs aggressively; 15s heartbeat + 45s timeout survives 2 missed beats. Tightening this for "faster cleanup" is a DX2 concern, not DX1b.
- **`runtime/lock.json` is not a cross-process mutex.** Two simultaneous EXE launches succeed and coexist on different ports. The lock file is for *crash-recovery* and *port reuse*, not single-instance enforcement.
- **Do not put Save Changes payloads into the proxy.** The proxy is connector logic. `/runtime/*` is the app server's responsibility. Mixing them couples desktop-runtime persistence to proxy lifecycle and breaks the "same proxy code, deployed or bundled" invariant from ADR-0010.

## 18. Open questions (resolve in DX1b)

These are not blockers for the contract lock; they are decisions DX1b's first commit should make:

1. **App-server framework.** `express` (already a proxy dep), `fastify`, or hand-rolled `http`? Express keeps the dep surface minimal.
2. **Packaging tool.** `pkg`, `nexe`, or `node --experimental-sea-config`. Stability vs binary size vs Node version pinning.
3. **Heartbeat delivery.** `fetch("/runtime/heartbeat")` from a `setInterval`, or a WebSocket? Simpler is better for DX1b.
4. **Token strength.** 256-bit random via `crypto.randomBytes(32).toString("base64url")` is the recommendation; confirm in DX1b.
5. **Recon-disclaimer dismissal.** Per-session vs persistent. Per-session is safer (user re-sees on every launch); persistent is friendlier. Default: per-session, with a "don't show again on this machine" checkbox stored under `PulsePlayData/profiles/<active>/state.json`.

---

## Cross-references

- [ADR-0010 — PulsePlay Ecosystem Artifact Strategy](adr/0010-artifact-strategy.md) — the ecosystem-level decision this contract implements
- [`enablers/desktop/README.md`](../enablers/desktop/README.md) — enabler-folder intro and DX1 status
- [`docs/PULSE_SYNC.md`](PULSE_SYNC.md) §"Tier 3.5 - Desktop EXE Cascade" — what PulsePlay changes affect the future EXE
- [`docs/HOSTING_OPTIONS.md`](HOSTING_OPTIONS.md) — the deployed-hosting choices that DX1 is intentionally *not* (recon, not hosting)
- [`proxy/lib/pulseClientContext.js`](../proxy/lib/pulseClientContext.js) — PX1 client identity normalization (`pulseplay-desktop` is already recognized)
- [`playground/vite.config.ts`](../playground/vite.config.ts) — the `/api → proxy` rewrite pattern the launcher's app server replicates
- [`playground/src/settings/SettingsSaveBar.tsx`](../playground/src/settings/SettingsSaveBar.tsx) — the UI integration point for Save Changes in EXE mode
