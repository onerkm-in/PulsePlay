# PulsePlay — GitHub Copilot repo instructions

These instructions are auto-loaded by GitHub Copilot. They make first-time setup
on a fresh clone fluid. Keep answers concrete and prefer the canonical commands
below over inventing new ones.

## What this project is
PulsePlay is a React web app (the **host**) that embeds any BI tool as a guest
and pairs it with an AI assistant. Two independent axes:
- **Y — BI vendor** (`bi-adapters/<vendor>/`): Power BI is a real `powerbi-client`
  adapter + a native ECharts renderer; Tableau/Qlik/Looker are iframe stubs.
- **X — AI connector** (`proxy/` profiles): Genie / Azure OpenAI / Bedrock /
  Foundation Model / Supervisor / ResponsesAgent / Power BI semantic-model.

It is NOT a Power BI custom visual and has no `pbiviz` build. Vite is the bundler.

## Canonical run sequence (memorize the ports)
Proxy on `127.0.0.1:7000`, playground dev server on `127.0.0.1:7001`.

```powershell
# Terminal 1 — proxy
cd proxy
npm install                       # if npm fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE: $env:NODE_OPTIONS="--use-system-ca"
copy config.example.json config.json   # first time only; then fill <YOUR_*> values
$env:PORT=7000; node server.js    # PORT=7000 is REQUIRED (see trap)

# Terminal 2 — playground
cd playground
npm install
npm run dev                       # http://127.0.0.1:7001
```

### ⚠️ The #1 trap — always set PORT=7000
The Vite dev server proxies `/api/*` → `http://127.0.0.1:7000` (see
`playground/vite.config.ts`). The proxy's own default port constant is still
`8787` for backward compat, so if you start it with a bare `node server.js`,
**every `/api/*` call returns HTTP 500**. Always start it with `$env:PORT=7000`.

## Configuration wiring (the one file)
- The repo tracks **`proxy/config.example.json`** — a placeholder-only template.
- Your real **`proxy/config.json` is gitignored** — safe to put local credentials in it.
- Copy example → `config.json`, fill the `<YOUR_*>` values, restart the proxy.
- For hosted/shared use, prefer env vars (`PROXY_PROFILE_<NAME>_<FIELD>`),
  Azure Key Vault, or Databricks secret scopes. Env wins over file.
- **Never commit `config.json` or real secrets, and never un-ignore it.** Placeholders
  only in tracked files (`config.example.json`, `app.yaml`).
- Full walkthrough: `docs/SETUP_FOR_BEGINNERS.md`. Every backend's fields +
  OAuth M2M: `docs/PROXY_REFERENCE.md`. Hosting: `docs/DEPLOYMENT_GUIDE.md`.

## Verify it works
```powershell
cd proxy && npm test            # jest — expect all green (~1243 tests)
cd playground && npm run lint && npm run test   # tsc --noEmit + vitest (~1926 tests)
node playground/scripts/smoke-all-screens.mjs   # credential-free UI smoke (needs both servers up)
```

## Key directories
- `playground/` — Vite + React frontend (the host shell, surfaces, settings)
- `bi-adapters/` — Y-axis BI vendor adapters (contract: `playground/src/biPanel/BIAdapter.ts`)
- `proxy/` — Express connector-agnostic backbone (`proxy/server.js`, `proxy/lib/*`)
- `databricks-agents/` — Mosaic AI Supervisor agent template
- `enablers/` — sibling deliverables: `pulse-pbi` (PBI custom visual) + `desktop` (Electron)
- `docs/` — architecture, deployment, setup, ADRs; `docs/HANDOVER.md` is the change log

## Conventions / gotchas
- Free-tier reality on the reference accounts: only Foundation Model + Power BI
  semantic-model (deterministic DAX) work live; Genie/Supervisor are blocked
  upstream (serverless disabled). See `docs/BLOCKERS.md`.
- Windows/Node 24: `npm install` may need `$env:NODE_OPTIONS="--use-system-ca"`.
  Tests themselves do not need it.
- Don't claim a BI vendor is "integrated" unless its adapter has a real SDK +
  event/command bridge (only Power BI + native do today).
- When helping set up: walk the user through the canonical run sequence above,
  confirm `PORT=7000`, confirm `config.json` exists and is filled, then run the
  verify commands. If a surface shows backend errors with a fresh config, that's
  expected until real credentials are supplied.
