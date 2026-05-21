# Desktop — PulsePlay Packaged Local Runtime Enabler

> **What this is.** The future packaged-EXE artifact lane for PulsePlay, per [ADR-0010 — PulsePlay Ecosystem Artifact Strategy](../../docs/adr/0010-artifact-strategy.md). When DX1b ships, this folder will hold the launcher source, app server, packaging config, and smoke runner that produce a single-file desktop recon tool.
>
> **What this is not.** A second native UI shell. The React app stays the canonical UI surface; the launcher's only job is to start the bundled services and open a private browser pointed at them. See [`docs/DX1_LAUNCHER_CONTRACT.md`](../../docs/DX1_LAUNCHER_CONTRACT.md) for the locked contract.

---

## Status — 2026-05-21

**DX1a + DX1b shipped.** The contract at [`docs/DX1_LAUNCHER_CONTRACT.md`](../../docs/DX1_LAUNCHER_CONTRACT.md) is locked AND its first runtime implementation lives in this folder under [`runtime/`](./runtime/), [`tests/`](./tests/), and [`scripts/`](./scripts/). Run `npm run smoke` to boot the launcher and exercise every endpoint end-to-end. Producing a single `.exe` is the DX1c next step — see [`PACKAGING.md`](./PACKAGING.md).

| Slice | Scope | Status |
|---|---|---|
| **DX1a** | Launcher contract spec, enabler folder skeleton, ledger updates | shipped 2026-05-21 |
| **DX1b** | Node launcher + app server + /runtime/* + browser launch matrix + heartbeat watchdog + React-side desktopRuntimeClient + end-to-end smoke + persistence proof | **shipped 2026-05-21** |
| **DX1c** | Execute [`PACKAGING.md`](./PACKAGING.md) recipe (esbuild + @yao-pkg/pkg), fill packaged-mode `resolvePaths()` branch, run smoke against the binary, wizard-variant recon disclaimer, optional signing | queued |
| **DX2** | At-rest encryption for `PulsePlayData/secrets.enc` + state.json | queued |
| **DX3** | macOS / Linux launchers, tray icon, single-instance, auto-update | deferred |

### Quick start (dev mode)

```bash
cd enablers/desktop
npm install
npm run dev          # launches with --dev; opens a private browser
npm test             # 45/45 node:test (dataStore, appServer, watchdog,
                     #  lockFile, portDiscovery, browserLaunch)
npm run smoke        # boots launcher + asserts every /runtime/* endpoint
npm run smoke:persistence   # second run: prior session's state survived
```

`playground/dist` must be built first (`cd playground && npm run build`) so the launcher has something to serve. The smoke runner asserts a real `/api/health` round-trip through the bundled proxy, so `proxy/config.json` must exist.

---

## How the desktop EXE relates to the rest of PulsePlay

```text
PulsePlay/
  playground/                  # PulsePlay web app (the React UI the launcher opens)
  proxy/                       # shared proxy code (the launcher bundles this verbatim)
  bi-adapters/                 # PulsePlay BI adapter implementations
  enablers/
    pulse-pbi/                 # Power BI custom visual enabler
    desktop/                   # ← this folder (DX1b will add launcher + app server here)
  docs/
    DX1_LAUNCHER_CONTRACT.md   # the locked launcher/runtime contract
```

The desktop enabler is one of three artifact lanes ADR-0010 commits to: the web app deployed to a host, the Pulse PBI custom visual, and the packaged desktop launcher. **Same proxy code in all three** — the desktop EXE bundles `proxy/server.js` unchanged; there is no "lite proxy" variant.

---

## What the launcher will do (one-paragraph summary)

Double-click `PulsePlay.exe`. The launcher starts the bundled app server and the bundled proxy on random `127.0.0.1` ports, generates a one-time launch token, opens Chrome incognito (or Edge InPrivate / Firefox private / Brave / default browser, in that fallback order) at `http://127.0.0.1:<app-port>/launch#token=<token>`, and watches for a heartbeat. The React app reads the token from the URL fragment, parks it in `sessionStorage`, and routes durable Save Changes through `/runtime/state` into a colocated `PulsePlayData/` folder. When the heartbeat stops for 45s, the launcher cleans up and exits. Full details in [`docs/DX1_LAUNCHER_CONTRACT.md`](../../docs/DX1_LAUNCHER_CONTRACT.md).

---

## Recon disclaimer

The desktop EXE is a **recon tool for authors / analysts / DPMs**, not a production server. ADR-0010 §Desktop EXE Position and the contract's §11 lock this rule:

- First-launch screen displays a "Local recon mode — not for shared deployments" callout.
- Settings → System in EXE mode (detected by `X-Pulse-Client: pulseplay-desktop`) displays the same callout.
- The contract forbids `0.0.0.0` binds, multi-user hosting assumptions, and shipping a "lite" proxy.

If you find yourself wanting to use the EXE as a real deployment, you want one of the hosting options in [`docs/HOSTING_OPTIONS.md`](../../docs/HOSTING_OPTIONS.md) instead.

---

## What NOT to do here

- ❌ Do not add code under this folder until DX1b begins. DX1a is a doc-only lock so the contract is reviewable in isolation.
- ❌ Do not fork the proxy. The launcher bundles `proxy/server.js` byte-for-byte; any "desktop-only proxy tweak" is a change to the shared `proxy/` code path with the cascade discipline in [`docs/PULSE_SYNC.md`](../../docs/PULSE_SYNC.md) §"Tier 3.5 - Desktop EXE Cascade".
- ❌ Do not introduce a Tauri WebView just to render the React app. The browser is the intended UI surface; the contract's §15 covers when Tauri is the right wrapper choice (it's the third-choice fallback, not the default).
- ❌ Do not relax the recon disclaimer. It is a hard-locked UX rule, not a preference.

---

## Related docs

- [`docs/DX1_LAUNCHER_CONTRACT.md`](../../docs/DX1_LAUNCHER_CONTRACT.md) — the locked launcher/runtime contract (canonical source)
- [`docs/adr/0010-artifact-strategy.md`](../../docs/adr/0010-artifact-strategy.md) — the ecosystem decision this enabler implements
- [`docs/PULSE_SYNC.md`](../../docs/PULSE_SYNC.md) — what PulsePlay changes cascade to this enabler
- [`docs/HOSTING_OPTIONS.md`](../../docs/HOSTING_OPTIONS.md) — the deployed-hosting choices the EXE is intentionally *not*
- [`enablers/pulse-pbi/README.md`](../pulse-pbi/README.md) — sibling enabler that follows the same folder-convention pattern
