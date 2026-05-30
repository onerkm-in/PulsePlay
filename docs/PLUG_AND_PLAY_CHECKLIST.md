# PulsePlay Plug-and-Play Setup Checklist

> **Goal:** PulsePlay should be plug-and-play. With the host platform + org credentials in hand, you fill in a known set of config values and the system is live — no bespoke configuration archaeology. This checklist is the distilled "what do I need" for each supported host and each connector.
>
> **Status legend:** ✅ validated 2026-05-29 · 🟡 prepared/partially validated · ⬜ not yet done
>
> Source-of-truth files: host wiring lives in `app.yaml` (Databricks Apps) and [DEPLOY_AZURE_APP_SERVICE.md](DEPLOY_AZURE_APP_SERVICE.md) (Azure). Proxy config shapes are in [`proxy/config.example.json`](../proxy/config.example.json) (`_doc_envProfiles` documents the env-var convention).

---

## 0. The one idea

The proxy is fully **config/credentials driven**. Every environment-specific value (workspace hosts, IDs, tokens, secrets) is either a `proxy/config.json` profile field **or** an environment variable of the form `PROXY_PROFILE_<NAME>_<FIELD>` (env wins, and can add profiles that aren't in config.json). So "going live" = supply credentials + a handful of non-secret IDs. Nothing is hardcoded in app code.

---

## 1. Connector credential matrix — what the org must supply

Pick the connector(s) you want active; supply its row. (Profile `type` selects the connector.)

| Connector | `type` | Required fields | Secret? |
|---|---|---|---|
| **Databricks Genie** (default) | _(none)_ | `host`, `token` (PAT) **or** `authMode:oauth-m2m`+`clientId`+`clientSecret`, `spaceId`, `warehouseId` | token/secret |
| **Foundation Model** | `foundation-model` | `host`, `token`, `foundationModelEndpoint` | token |
| **Supervisor (local fan-out)** | `supervisor-local` | `synthesisEndpoint`, optional `spaces[]` | — |
| **Supervisor (served agent)** | `supervisor` | `host`, `endpoint`, `token` | token |
| **Azure OpenAI (analytics)** | _(profile w/ AOAI fields)_ | `azureOpenAiEndpoint`, `azureOpenAiKey`, `azureOpenAiDeployment`, `azureOpenAiApiVersion`; + Databricks `host`+`token`+`warehouseId` for SQL exec | key/token |
| **Power BI semantic-model** (Q&A, no LLM) | `powerbi-semantic-model` | `aadTenantId`, `aadClientId`, `aadClientSecret` (SP), `powerbiGroupId`, `powerbiDatasetId` | clientSecret |
| **Power BI embed token** (render report) | _(any profile)_ | `powerBiClientId`, `powerBiClientSecret`, `powerBiTenantId` (+ request supplies `groupId`/`reportId`) | clientSecret |
| **Databricks AI/BI dashboard** | adapter `databricks-aibi` | proxy mints token via `/assistant/embed-token/databricks-aibi`: needs SP creds + `aadiDashboardId`/`workspaceId` | clientSecret |

**Env-var note (plug-and-play wrinkle, verified 2026-05-29):** SP creds map cleanly to env vars (`PROXY_PROFILE_<NAME>_POWER_BI_CLIENT_ID` / `_POWER_BI_CLIENT_SECRET` / `_POWER_BI_TENANT_ID`), and the semantic-model path accepts those `powerBi*` names as fallbacks for `aad*`. But `powerbiGroupId` / `powerbiDatasetId` have **no documented env mapping** in `_doc_envProfiles` — for a pure-env deploy these still come from a shipped `config.json`, OR add them to the env field map. (Improvement candidate for full plug-and-play.)

---

## 2. Host target A — Databricks Apps ✅ (live precedent: `app.yaml`)

| Requirement | Value / source |
|---|---|
| Build command | `app.yaml` `command`: install playground deps → `npm run build` → install proxy deps → `node server.js` |
| Static serving | `STATIC_DIR=playground/dist` (env) |
| Auth posture | `PROXY_AUTH_MODE=none` — Databricks Apps gates the URL with platform auth |
| Profiles | `PROXY_PROFILE_<NAME>_*` env entries (HOST, TOKEN, SPACE_ID, WAREHOUSE_ID, TYPE, FOUNDATION_MODEL_ENDPOINT, …) |
| Secrets | Databricks secret scope (`app.yaml` `resources`: scope `pulseplay`, key `databricks_pat`, referenced via `valueFrom`) |
| To re-establish | Set the secret scope value + the `PROXY_PROFILE_*` env entries, redeploy. That's it. |

**Known gotcha:** the live AWS Free-Edition workspace has a **daily App-runtime cap** — apps auto-stop and may refuse restart once the cap is hit (see HANDOVER 2026-05-28).

---

## 3. Host target B — Azure App Service (F1 Free, $0) 🟡

**Plan:** one Linux F1 web app serving the built React app + the proxy from one origin (mirrors the Databricks Apps shape). **F1 = $0** (never consumes credit); limits: 60 CPU-min/day, 1 GB RAM, no Always On (cold starts). Do **not** pick a paid SKU.

| Requirement | Value | Status |
|---|---|---|
| Runtime | Linux, Node LTS (`NODE\|20-lts` or `22-lts`) | ⬜ |
| Package | Curated ZIP: `proxy/` (+ its `node_modules`) and `playground/dist/` as siblings at app root | 🟡 (build validated) |
| Build-on-deploy | `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (build locally — keeps F1 CPU free) | ⬜ |
| Startup command | `node proxy/server.js` | 🟡 (validated locally) |
| `STATIC_DIR` | `playground/dist` (proxy resolves to repo-root-relative) | ✅ validated locally |
| `PROXY_INLINE_CREDENTIALS_MODE` | `off` | ✅ |
| `PROXY_AUTH_MODE` | `none` for the first proof **behind Easy Auth**; do **not** set `NODE_ENV=production` (the proxy refuses `auth=none` in prod) | 🟡 |
| Profiles + secrets | App settings: `PROXY_PROFILE_*` (+ `POWER_BI_CLIENT_ID/SECRET/TENANT_ID`). App settings are encrypted at rest (free). Key Vault optional (skipped for $0). | ⬜ |
| TLS to upstreams | Only if the runtime needs an enterprise root: `NODE_OPTIONS=--use-system-ca`. (Azure's own runtime trusts public CAs — not needed there; needed **locally** because of Norton, see §5.) | n/a on Azure |
| Edge auth | **Entra Easy Auth** ("require authentication") so the public `*.azurewebsites.net` URL is org-only | ⬜ |
| Provisioning route | Node + `--use-system-ca` reaches `management.azure.com` (TLS OK). `az` is Norton-blocked; `azd` not installed; MCP can set app settings + read but not create. → **Node ARM provisioning script** (device-code → ARM token → RG + F1 plan + web app). | 🟡 route confirmed |

**Local production-shape smoke ✅ (2026-05-29):** built `playground/dist`, ran `PORT=7011 STATIC_DIR=playground/dist node proxy/server.js` → `/health`, `/__diag/static` (`exists:true`), `/api/assistant/profiles`, and `/` (serves the SPA) all green.

---

## 4. Power BI connector setup ✅ (done 2026-05-29)

One service principal serves both the semantic-model Q&A and embed-token paths.

1. **Create the SP** — `node --use-system-ca scripts/create-pbi-service-principal.mjs --tenant <id> --profile powerbi-dwd` (device-code; creates app+SP+secret, writes `aadClientId`/`aadClientSecret` + flips `authMode:service-principal`). Mirror into `powerBiClientId/Secret/TenantId` for the embed route.
2. **Tenant gate (admin, Power BI/Fabric admin portal):** enable **"Service principals can call Fabric public APIs"** — in unified-Fabric tenants this **replaces** the legacy "Allow service principals to use Power BI APIs". Apply to the org or a security group containing the SP.
3. **Workspace access:** add the SP as **Member** of the target workspace.
4. **Capacity (rendering only):** report *rendering* needs the workspace on capacity (Fabric trial / **Premium**). Q&A (`executeQueries`) needs **no** capacity. Prod runs on the org's existing **Premium** capacity — no code change (embed path is capacity-agnostic). Don't provision paid Embedded capacity in dev.
5. **Verify:** `node --use-system-ca scripts/verify-pbi-sp.mjs` → lists datasets + reports as the SP. Secret expires 6 months out — re-run before then.

---

## 5. Local/dev TLS prerequisite (this machine)

Norton Web/Mail Shield intercepts TLS; Node's bundled CA rejects it (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Run **every** Node process that calls Microsoft/Azure/Power BI endpoints — the proxy and the `scripts/*-pbi-*.mjs` — with **`node --use-system-ca …`** (Node 22+/24 trusts the Windows cert store where the Norton root lives). `az` (Python/certifi) can't be fixed this way; use the Node device-code scripts instead. **Not needed on Azure/Databricks runtimes** (they trust public CAs).

---

## 5b. Challenges & known limitations (from 2026-05-29 code-review)

The dev-convenience scripts ran end-to-end, but a recall-mode review surfaced re-run / diagnosability hazards. These are **acceptable for one-shot dev use**; in enterprise these steps are manual + multi-team (see §0), so they don't apply the same way. Documented so they're not surprises:

- **`enable-azure-easyauth.mjs` is non-idempotent** — each run creates a *new* Entra app registration + client secret (no get-by-displayName reuse). Re-running accumulates orphaned app registrations. Mitigation: run once; to rotate, delete the old registration or add reuse logic before re-running.
- **`provision-azure-appservice.mjs` base app-settings PUT is full-replace**, not GET-merge-PUT. Re-running provision *after* Easy Auth is configured will clobber `MICROSOFT_PROVIDER_AUTHENTICATION_SECRET` and break auth. Mitigation: don't re-run provision after easyauth; or change it to merge.
- **`enable-azure-easyauth.mjs` SP-create `catch` swallows all errors** as "already exists" — a genuine failure (insufficient Graph rights, throttling) → authsettingsV2 references an app with no SP → silent runtime auth failure.
- **`deploy-azure-zip.mjs` is fire-and-forget** — Kudu `zipdeploy` 202 = *queued*, not succeeded; no `/api/deployments/latest` poll. A failed build reports "DEPLOYED". Also **no `zip.length>0` guard** — an empty zip could wipe site content.
- **Easy Auth secret expires in 6 months** (2026-11-29) — Easy Auth breaks tenant-wide on expiry; re-running creates a duplicate app (see first bullet). Track the rotation date.
- **`--app` must be passed on every provision re-run** — otherwise a new random app name is generated and `.azure-appservice.json` is overwritten, orphaning the first app.
- **Proxy env-mapping change is clean** — no suffix-collision (verified across all 78 field keys); hyphen/underscore profile-name normalization correct.

## 6. Smoke checklist (any host)

| URL | Expected |
|---|---|
| `/health` | JSON, lists profiles, no secret values |
| `/__diag/static` | `exists:true`, `index_html_exists:true` |
| `/api/assistant/profiles` | profile list via same-origin `/api` strip |
| `/` | SPA loads (`<title>PulsePlay</title>`) |
| one Q&A | `POST /api/assistant/conversations/start` `{assistantProfile, content}` → `COMPLETED` |
