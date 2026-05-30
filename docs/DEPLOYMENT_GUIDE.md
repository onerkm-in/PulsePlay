# PulsePlay — Deployment & Run Guide

> **Start here.** One front-door for: configure → run locally → host (Azure App Service or Databricks Apps) → connect the data/AI services → **what goes wrong & how to fix it** → free→prod. Written from the lived experience of getting all three free-tier services (Azure, Databricks, Power BI) actually connected.
>
> Deeper references: [DEPLOY_AZURE_APP_SERVICE.md](DEPLOY_AZURE_APP_SERVICE.md), [DEPLOY_DATABRICKS_APP.md](DEPLOY_DATABRICKS_APP.md), [DEPLOY_MVP_0.2.md](DEPLOY_MVP_0.2.md), [PLUG_AND_PLAY_CHECKLIST.md](PLUG_AND_PLAY_CHECKLIST.md), [HOSTING_OPTIONS.md](HOSTING_OPTIONS.md), [CICD.md](CICD.md). CI/CD pipelines: [.github/workflows/](../.github/workflows/).

## 0. What PulsePlay is (deployment shape)

PulsePlay ships as **one origin**: an Express **proxy** (`proxy/server.js`) that also serves the **Vite-built React SPA** (`playground/dist`) as static files. The browser calls `/api/*` → the proxy strips `/api` and serves its own `/assistant/*`, `/sql/*`, `/foundation/*` routes, which talk to the AI/BI backends (Databricks Genie, Power BI, Azure OpenAI, Bedrock, …).

**Plug-and-play principle:** the code is fixed; you make it live by supplying **configuration** (env vars / `config.json`) — connector profiles + auth. Swap an org's creds and the same build runs against their estate.

**Accounts used here are all FREE dev/test tiers** (Azure $200-credit/F1, Databricks Free Edition, Power BI free/Pro) — to *prove the build connects and works on real services*, not for production load. See [Section 8: free→prod](#8-free--prod-transition).

---

## 1. Prerequisites

- **Node 20+** (local dev uses 22/24; deploy targets run Node 20/22). Proxy `engines: >=18`.
- The three service accounts as needed: **Databricks** (Genie space + SQL warehouse), **Power BI** (workspace + semantic model, + an Entra service principal), **Azure** (subscription, for App Service hosting).
- For local TLS behind an intercepting proxy (Norton/corporate): Node 22+ so you can pass `--use-system-ca`.

---

## 2. Configure (the one thing you actually edit)

All configuration is **connector profiles** + a few proxy switches. Two equivalent sources, env wins:

1. **`proxy/config.json`** — a `profiles` map (copy `proxy/config.example.json`). Good for local dev. **Never commit real secrets** — keep `YOUR_*` placeholders and gitignore your real `config.json`.
2. **Env vars** — `PROXY_PROFILE_<NAME>_<FIELD>` (e.g. `PROXY_PROFILE_DEFAULT_TOKEN`, `PROXY_PROFILE_POWERBI_DWD_AADCLIENTSECRET`). Preferred for hosting (App Service settings / Databricks `app.yaml` / Key Vault). This is how you de-secret `config.json`.

### Load-bearing proxy switches

| Setting | Local dev | Hosted (prod-ish) | Why |
|---|---|---|---|
| `PORT` | `7000` (locked — see §3) | **injected by host** — proxy reads `process.env.PORT` (falls back to `8787`); never hardcode | App Service / Databricks inject `PORT`; binding the wrong port = 502/health-check fail |
| `STATIC_DIR` | unset (dev server serves the SPA) | `playground/dist` (relative to **repo root**, not `../playground/dist`) | wrong value → `/` 404s or returns proxy JSON |
| `NODE_ENV` | unset | `production` **only after auth is settled** | production trips hard security gates (allowlist/CORS/inline-creds/auth) |
| `PROXY_AUTH_MODE` | `none` | `idp` / `shared-key` / `idp-or-shared-key` (NOT `none`) | `NODE_ENV=production` + `none` **refuses to start** |
| `PROXY_INLINE_CREDENTIALS_MODE` | default ok | `off` | keeps secrets out of `/__diag/env` |
| `PROXY_CORS_ORIGIN` | `*` ok | pin to your exact origin | prod refuses `*` |
| `NODE_OPTIONS` | `--use-system-ca` (if behind a TLS-intercepting proxy) | not needed on cloud (public CAs) | else Databricks/PBI calls fail cert validation |

> **Power BI env-mapping gap:** most fields map via `PROXY_PROFILE_*`, but `powerbiGroupId` / `powerbiDatasetId` currently have **no env mapping** — put those (non-secret) in the shipped `config.json`. (Tracked in PLUG_AND_PLAY_CHECKLIST §1.)

### Minimal "go-live" config

A working `powerbi-semantic-model` profile (no-LLM DAX Q&A — the cheapest, capacity-free BI path) needs: `type: "powerbi-semantic-model"`, `aadTenantId`, `aadClientId`, `aadClientSecret`, `powerbiGroupId`, `powerbiDatasetId`. A Genie profile needs: `host`, `spaceId`, `warehouseId`, and a token (PAT) or OAuth-M2M (`clientId`/`clientSecret`). Keep **all** auth options available (PAT, OAuth-M2M SP, user-refresh, embed-token) — don't prune.

---

## 3. Run locally (canonical sequence)

**Ports are LOCKED** (hardwired in `playground/vite.config.ts`): proxy `127.0.0.1:7000`, dev server `127.0.0.1:7001`. The Vite dev server proxies `/api/*` → `127.0.0.1:7000`. **Start the proxy without `PORT=7000` and every `/api/*` call returns HTTP 500.**

```powershell
# Terminal 1 — proxy on 7000. Add --use-system-ca if your TLS chain is intercepted.
cd D:\Working_Folder\Projects\PulsePlay\proxy
npm install                              # first time only
$env:PORT=7000; node --use-system-ca server.js

# Terminal 2 — dev server on 7001
cd D:\Working_Folder\Projects\PulsePlay\playground
npm install                              # first time only
npm run dev                              # → http://127.0.0.1:7001
```

**Tests / build (what CI gates):**
```powershell
cd proxy        ; npm test               # jest (1166)
cd playground   ; npm run lint           # tsc --noEmit
                  npm run test           # vitest (1842, incl. bi-adapters)
                  npm run build          # tsc -b && vite build → playground/dist
```

If a local smoke against Genie returns "no access token" / cert errors → you started the proxy **without** `--use-system-ca` (see Troubleshooting). A clean run resolves Genie e2e (real SQL, live data).

---

## 4. Host on Azure App Service (F1 free)

**Live example:** `pulseplay-onedata-dev.azurewebsites.net` (F1 + Entra Easy Auth, org-only).

**Build once on CI/your machine, deploy the artifact — never build on the F1 box** (it has a 60 CPU-min/day budget).

1. **Build the combined artifact** (monorepo = two installs, no root `package.json`):
   ```bash
   npm --prefix playground ci && npm --prefix playground run build      # → playground/dist
   npm --prefix proxy ci --omit=dev
   ```
2. **Stage a curated zip** — include `proxy/` (server.js, lib, package*.json, node_modules, config.example.json) + `playground/dist`. **Exclude** `config.json`, `.env`, `docs/evidence`, exports. ZIP contents must be at the **app root** (no extra top-level folder).
3. **App settings** (Portal → Configuration, or `az webapp config appsettings set`):
   - `STATIC_DIR=playground/dist`
   - `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (don't let Oryx build on the box — burns CPU quota, fragile)
   - `PROXY_AUTH_MODE=none` behind Easy Auth (or `idp`/`shared-key` for a public edge) — **do not** set `NODE_ENV=production` while `PROXY_AUTH_MODE=none` (proxy refuses to start)
   - `PROXY_INLINE_CREDENTIALS_MODE=off`
   - your `PROXY_PROFILE_*` secrets (→ migrate to Key Vault references + managed identity for prod)
   - **Startup Command** `node proxy/server.js` if Oryx doesn't auto-detect the entrypoint
4. **Easy Auth (Entra)** as the edge gate. For the combined SPA+API: set the unauthenticated action to **HTTP 401 (not 302)** or exclude `/api/*` — otherwise SPA `fetch('/api/...')` follows a login redirect and gets HTML. Read the user from the injected `X-MS-CLIENT-PRINCIPAL` header; don't run your own Entra middleware on top.
5. **Deploy + smoke:** `curl -fsS https://<app>.azurewebsites.net/health` and `/__diag/static` (should see `index.html`). Note: F1 **sleeps after ~20 min idle** (no Always-On) → warm it before a demo.

CI deploy skeleton (manual, OIDC, cost-safe): [.github/workflows/deploy-azure.yml](../.github/workflows/deploy-azure.yml), setup in [CICD.md](CICD.md).

---

## 5. Host on Databricks Apps (Free Edition)

**Manifest:** [proxy/app.yaml](../proxy/app.yaml) (`command: ["npm","run","start"]` + env). The app reads `process.env.PORT` (Databricks injects it).

1. **Commit both lockfiles** (`proxy` + `playground`) — `npm ci` needs them.
2. **Configure `app.yaml` env:** literal profiles via `value:`; secrets via app **resources / secret scopes** (`valueFrom:`). Don't mix `valueFrom` and literal `PROXY_PROFILE_*` for the same profile (binding confusion). Add `NODE_OPTIONS=--use-system-ca` only if the runtime chain needs it (cloud usually doesn't).
3. **Deploy** via `databricks bundle deploy` then **`databricks bundle run`** (deploy alone does **not** restart — it keeps serving old code), or the Apps UI. **Pin a commit**, not a branch (some deploy reference fields are silently stripped).
4. **Verify resources actually bound:** `databricks apps get <app> -o json` — a raw `apps deploy` ignores the top-level `resources:` block (`resources: null`). Configure resources via UI or full PATCH if needed.
5. **Auth:** the app URL sits behind **Databricks OAuth** (every viewer logs in; Free Edition = OTP/Google/MS only, **no SSO, can't be public**). `PROXY_AUTH_MODE=none` is fine because the platform gates the URL.
6. **Logs:** `databricks apps logs <app>` needs **OAuth U2M** login (a PAT is insufficient) — `databricks auth login`, or read logs in the workspace UI.

**Free Edition caps to plan around:** max **3 apps/account**; apps **auto-stop after 24h** (restart before a demo); a daily fair-usage quota can shut down *all* workspace compute until reset; **outbound internet is allow-listed** (in-workspace Genie/Foundation Model are fine, but external clouds like Azure OpenAI/Bedrock may be blocked — test each connector on-platform). Free Edition is **proof-only, not sustained runtime**.

CI deploy skeleton: [.github/workflows/deploy-databricks.yml](../.github/workflows/deploy-databricks.yml). **One-time prereq:** add an `app` resource block to [databricks.yml](../databricks.yml) + `databricks bundle deployment bind` before CD works.

---

## 6. Connect the data/AI services

### Databricks Genie
- Profile: `host`, `spaceId`, `warehouseId` + auth (PAT, or OAuth-M2M SP `clientId`/`clientSecret`, or user-refresh device-code).
- **Verified working e2e** (real answer + generated SQL, in the browser). The earlier "no access token configured" was a **local TLS** red herring → fixed by `--use-system-ca`.
- **Genie Agent/Deep-Research mode is UI-only** — the REST flag `force_deep_research_planning` is silently ignored. Use the **Foundation Model** serving endpoint (`/foundation/section`) for deeper reasoning.

### Power BI
- **Service principal setup (one-time):** enable tenant setting **"Service principals can call Fabric/Power BI APIs"**; add the SP as a **Member** of the workspace. Verify with `node --use-system-ca scripts/verify-pbi-sp.mjs`.
- **Semantic-model Q&A (`executeQueries` / deterministic DAX) — the free path:** **needs NO capacity** — works on any Pro workspace. Requirements: tenant setting **"Dataset Execute Queries REST API"** enabled, SP/user has dataset **Read + Build**, scope `Dataset.Read.All`. Limits: 1 query/call, ≤100k rows, 120 req/min/user, DAX only. *(This powers Ask Pulse + AI Insights on PBI — free.)*
- **Report VISUAL render (embed):** the report iframe **requires capacity** (Fabric trial = ~free for a window, then Premium/F-SKU = paid). On a free account it renders only during a Fabric trial. **Don't provision paid capacity without sign-off.** *(Verified rendering on a Fabric trial; the embed path is capacity-agnostic in code — renders free on the org's Premium in prod, no code change.)*
- **Embed token ~1h** (tied to the Entra token). Proxy mints server-side (cache key includes report/dataset/RLS-identity, refresh 60s before expiry); the iframe must call `report.setAccessToken(newToken)` before expiry — **never reload the iframe**, never cache the token in the browser.
- **SP can't do RLS/SSO datasets** — use a master user / user-owns-data if RLS is needed (RLS forwarding is future work).
- **Power BI Q&A (Microsoft NLP) retires 2026-12-31** — already superseded by the semantic-model DAX path.

### Azure OpenAI / Bedrock (other connectors)
- Per-profile creds via `PROXY_PROFILE_*`. On **Databricks Free Edition**, confirm the outbound host is reachable (allow-list) before relying on it.

---

## 7. Troubleshooting — what may go wrong & how to tackle it

> Self-serve table. Find your symptom → apply the fix.

### Local run
| Symptom | Cause | Fix |
|---|---|---|
| Every `/api/*` call → **HTTP 500** from Vite | proxy not on port 7000 | start proxy with `PORT=7000` (ports are locked in `vite.config.ts`) |
| Genie/PBI/Databricks calls fail with **cert / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`** | TLS-intercepting proxy (Norton/corp) vs Node's bundled CA | run Node with `--use-system-ca` (or `NODE_EXTRA_CA_CERTS=<root.pem>`). **Not a code bug.** |
| "No access token configured" in AI Insights/Ask Pulse | same TLS issue (token fetch failed) — a red herring | `--use-system-ca`; then Genie/PBI resolve e2e |
| `npm install` at repo root installs nothing useful | no root `package.json` | install per package: `npm --prefix proxy i`, `npm --prefix playground i` |

### Azure App Service (F1)
| Symptom | Cause | Fix |
|---|---|---|
| `/` blank or default page | SPA not built / not packaged, or Oryx couldn't detect entrypoint | build `playground/dist` locally + include in zip; set Startup Command `node proxy/server.js` |
| `/` returns proxy **JSON 500**, not HTML | wrong `STATIC_DIR` | `STATIC_DIR=playground/dist` (relative to repo root, **not** `../playground/dist`) |
| Proxy logs **`FATAL: PROXY_AUTH_MODE=none is refused`** | `NODE_ENV=production` + `PROXY_AUTH_MODE=none` | don't set `NODE_ENV=production` until auth chosen; or pick `idp`/`shared-key` |
| SPA `fetch('/api/...')` returns **HTML / login page** | Easy Auth returns **302 redirect** on API routes | set unauthenticated action to **401**, or exclude `/api/*` from Easy Auth |
| **HTTP 403 "Web app stopped (Quota exceeded)"** | F1 **60 CPU-min/day** exhausted (often by on-box build) | `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, build off-box; wait for daily reset; or scale to B1 |
| Slow first request after idle | F1 has **no Always-On** (~20 min sleep) | warm the URL before a demo; prod → B1+ Always-On |
| Streaming/SSE responses **stall after the first chunk** | **SSE needs Basic tier**; F1 can't sustain it | fall back to buffered JSON on F1, or scale to **B1+** for streaming |
| Files deployed under a nested folder; startup misses them | zip had an extra top-level folder | zip **contents** at root, no `repo-name/` parent |
| Easy Auth breaks tenant-wide ~6 months in | Entra app-registration **secret expired** | rotate the secret + update app settings; re-running the provision script orphans registrations (non-idempotent) — always pass `--app <name>` |

### Databricks Apps (Free Edition)
| Symptom | Cause | Fix |
|---|---|---|
| App serves **old code** after deploy | `bundle deploy` doesn't restart | run **`databricks bundle run`** (or restart in UI) after deploy |
| `databricks apps get` shows **`resources: null`** | raw `apps deploy` ignores `app.yaml` top-level `resources:` | bind via UI / full PATCH; always verify after deploy |
| App **silently stopped** | Free Edition **24h auto-stop** | restart from the app page before use |
| App + notebooks + warehouse all **dark** for the day | Free Edition daily fair-usage **quota exhausted** | wait for reset; run demos early; don't run heavy jobs alongside |
| External connector (Azure OpenAI/Bedrock) **connection errors** | Free Edition **outbound allow-list** | verify the host is reachable on-platform; in-workspace Genie/FM are fine |
| `databricks apps logs` complains about token | logs need **OAuth U2M**, not PAT | `databricks auth login`; or read logs in the workspace UI |
| `DATABRICKS_TOKEN` not present | Free Edition doesn't inject it | supply creds via `PROXY_PROFILE_*` / app resources — don't code against `DATABRICKS_TOKEN` |

### Power BI
| Symptom | Cause | Fix |
|---|---|---|
| Embedded report **blank / "capacity unavailable"** | render needs **capacity** (Fabric trial/Premium) | use a Fabric trial (free window) or org Premium; **don't** provision paid capacity without OK. Q&A/DAX path needs no capacity |
| Report goes blank after **~1h** | embed token expired | proxy re-mints; iframe must call `report.setAccessToken()` before expiry (don't reload the iframe) |
| Q&A/semantic-model call → `DatasetExecuteQueriesError` / 401 | tenant setting off, or SP lacks workspace membership / Build perm | enable "SP can call PBI APIs" + "Dataset Execute Queries REST API"; add SP as workspace **Member** with dataset **Read+Build** |
| RLS rows wrong / SP token rejected on RLS dataset | **SP can't do RLS/SSO** | master user / user-owns-data; RLS forwarding is future work |
| Report won't mount — "Fabric features not enabled" | `fabricEnabled: false` rejects Direct Lake/Fabric-only reports | use classic Import/DirectQuery reports |

### Proxy security / config (production)
| Symptom | Cause | Fix |
|---|---|---|
| Secrets visible in `/__diag/env` shape | `PROXY_INLINE_CREDENTIALS_MODE` default | set `=off` (auto-pinned when `PROXY_SHARED_KEY`/`WEBSITE_SITE_NAME` present) |
| CORS allows any origin | `PROXY_CORS_ORIGIN=*` | pin to your exact origin (prod refuses `*`) |
| Secrets committed in `config.json` | plaintext config in git | env vars only for secrets (`PROXY_PROFILE_*_TOKEN/_CLIENTSECRET`); gitignore real `config.json` |

---

## 8. Free → prod transition

What must change when leaving the free dev tiers:

**Azure App Service** — scale **F1 → B1+** (removes 60-min quota, enables Always-On, makes **SSE/streaming reliable**, enables custom-domain SSL); secrets → **Key Vault + managed identity**; build in CI (never on-box); Easy Auth → real Entra SSO with `/api/*` returning 401; bind custom domain.

**Databricks** — Free Edition → **trial/paid workspace** (removes 24h auto-stop, daily quota, 3-app cap, outbound allow-list); OTP login → **org SSO/SCIM**; secrets → **secret scopes / Unity Catalog**.

**Power BI** — keep the **executeQueries semantic-model path on Pro** (free even in prod); for customer-facing visual render, provision a **Fabric F-SKU** (cost-gated — explicit OK required); wire `setAccessToken` refresh; decide RLS strategy.

**Prod-only gotchas** that don't show on free dev: RLS/OLS bugs (free demo uses one identity), embed-token refresh failures (sessions > 1h), outbound-network blocks under load, per-user rate limits (PBI 120 req/min, Databricks concurrency).

---

## 9. The 10 pitfalls (one-line index)

1. **Ports 7000/7001 locked** — proxy without `PORT=7000` → all `/api/*` 500.
2. **`--use-system-ca`** — local TLS interception breaks Genie/PBI/Databricks calls.
3. **`NODE_ENV=production` + `PROXY_AUTH_MODE=none`** → refuses to start.
4. **`STATIC_DIR=playground/dist`** (repo-root-relative, not `../`).
5. **Monorepo build** — two installs (playground then proxy); no root build.
6. **PBI embed token ~1h** + **render needs capacity** (Q&A/DAX does not).
7. **Databricks Free** — 3-app/24h auto-stop + daily quota + outbound allow-list.
8. **Easy Auth** — 401-not-302 for `/api`; secret expires ~6 months; scripts non-idempotent.
9. **Genie Agent Mode UI-only** — use Foundation Model endpoint.
10. **`powerbiGroupId`/`powerbiDatasetId`** have no env mapping — put them in `config.json`.
