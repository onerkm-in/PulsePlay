# DX1b — Decisions (Open Questions Resolved)

> Resolves the five intentionally-open questions in [`docs/DX1_LAUNCHER_CONTRACT.md`](../../docs/DX1_LAUNCHER_CONTRACT.md) §18. These become the load-bearing assumptions for the DX1b implementation.

## 1. App-server framework — **`express`**

Already in `proxy/package.json` dependencies (`^4.21.2`). Reusing it keeps the runtime dependency surface to the existing two-package set (`express`, `jose`, `js-yaml`) plus one new one for the proxy hop (`http-proxy-middleware`).

Alternatives considered:

- `fastify` — faster, but adds a fresh dependency tree for negligible gain at desktop scale (one user, one connection).
- Hand-rolled `node:http` — viable for `/runtime/*` alone, but the `/api/*` reverse-proxy hop and streaming bodies (SSE / NDJSON used by Foundation Model + Supervisor routes) want a proven middleware. `http-proxy-middleware` handles both, including websocket upgrade if a future cycle needs it.

## 2. Packaging tool — **`@yao-pkg/pkg`** (DX1b proof)

`vercel/pkg` was deprecated in 2023. The community fork `@yao-pkg/pkg` is the active maintained successor and is the path of least surprise for DX1b's Windows packaging proof: it bundles the launcher + `proxy/server.js` + `playground/dist/` + `node_modules` into a single `PulsePlay.exe`.

Alternatives considered:

- `node --experimental-sea-config` (Node 20+ Single Executable Application) — Node-native, smaller binary, no third-party. But SEA does NOT bundle adjacent files; we'd need a `PulsePlay.exe` + `proxy/` + `playground/dist/` shipped together. **Promoted to a DX1c upgrade target** once the contract is observably working with `@yao-pkg/pkg`.
- `nexe` — similar to pkg, less momentum, no clear advantage.

Why not "pick SEA now and ship adjacent files":

- The contract's §16 acceptance signal says "Download a single ZIP / installer / `.exe`" — a single binary is closer to that bar than a folder of files even if both are wrapped in a ZIP.
- The launcher's child-process spawn for the proxy works either way; the packaging tool decides whether `proxy/server.js` is bundled or sits beside the EXE.

## 3. Heartbeat delivery — **`fetch("/runtime/heartbeat")` on `setInterval`**

`POST /runtime/heartbeat` every 15s from the React app. The browser's `setInterval` is throttled in background tabs (modern browsers throttle to ~60s minimum after a tab is hidden for ~5 min), so the 45s server timeout WILL trip in background mode — that is the intended behavior. If the user backgrounds the EXE's tab for 45s+, treat it as session ended and clean up.

Alternatives considered:

- WebSocket — adds an ongoing connection and a dependency. Heartbeat is one-direction; HTTP is fine.
- Server-Sent Events the other direction — wrong direction for a liveness signal.
- `navigator.sendBeacon` — fire-and-forget, no response, can't tell us about server health. Could supplement on `pagehide` for clean shutdown, but is not the primary heartbeat.

## 4. Token strength — **256-bit via `crypto.randomBytes(32).toString("base64url")`**

Matches the contract's recommendation. Single string, URL-safe, 43 characters when base64url-encoded. Lifetime = launcher process lifetime; never persisted to disk; lives only in the launcher's in-memory map and the browser's `sessionStorage`.

## 5. Recon-disclaimer dismissal — **per-session by default; "don't show again on this machine" checkbox writes to `state.json`**

Default: every first-launch screen and every Settings → System screen displays the disclaimer. Per-session dismissal is achieved by closing the disclaimer in the UI (it doesn't reappear within the same browser session).

A "don't show again on this machine" checkbox writes to `PulsePlayData/profiles/<active>/state.json` under `desktop.reconDisclaimerDismissed: <epoch-ms>`. Setting cleared on profile reset. The Settings → System screen always shows the disclaimer (separately from the dismissable per-launch banner), so the user can always re-read the policy.

Why not "always sticky-dismissed once dismissed":

- The disclaimer is a deliberate friction point. If a user shares the EXE with someone else, that recipient sees the disclaimer at least once.
- The "don't show again" checkbox is the escape hatch for the author who runs the EXE daily and doesn't want noise.

---

## Locked constants (referenced by `runtime/config.mjs`)

| Constant | Value | Source |
|---|---|---|
| `HEARTBEAT_INTERVAL_MS` | 15000 | contract §10 |
| `HEARTBEAT_TIMEOUT_MS` | 45000 | contract §10 |
| `TOKEN_BYTES` | 32 (256-bit) | contract §5 + decision 4 |
| `PORT_BIND_HOST` | `"127.0.0.1"` | contract §4 |
| `PORT_RETRY_COUNT` | 5 | contract §4 |
| `LOG_FILE_BYTES_MAX` | 10 * 1024 * 1024 (10 MB) | contract §12 |
| `LOG_FILE_ROTATION_COUNT` | 5 | contract §12 |
| `DESKTOP_CLIENT_HEADER` | `"X-Pulse-Client"` | PX1 + contract §7 |
| `DESKTOP_CLIENT_VALUE` | `"pulseplay-desktop"` | PX1 + contract §7 |
| `LAUNCH_TOKEN_HEADER` | `"X-PulsePlay-Launch-Token"` | contract §5 |
