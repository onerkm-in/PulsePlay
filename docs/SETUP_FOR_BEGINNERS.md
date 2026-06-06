# PulsePlay — Setup for Beginners (explain-it-simply guide)

> A plain-language, step-by-step guide to **configuring** and **hosting** PulsePlay —
> written so a non-expert can follow it. For the terse, reference version see
> [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md). For per-connector detail see
> [CONNECTOR_REQUIREMENTS.md](CONNECTOR_REQUIREMENTS.md). For external blockers see
> [BLOCKERS.md](BLOCKERS.md).

---

# PART 0 — Deployer Intake Sheet (what to provide)

> **PulsePlay is modular — you do NOT need every connector.** Pick only the block(s) you want.
> Each block below is **independent and self-contained**: if you only want Power BI, fill Block B
> and ignore Block A entirely (and vice-versa). Nothing here depends on anything in another block.
>
> **Validated end-to-end so far: Databricks (Block A) and Power BI (Block B).** The other AI
> connectors (Block C) are wired and available but **not yet thoroughly tested** in this dev cycle —
> treat them as opt-in extras.
>
> **How to fill:** put each value into a `proxy/config.json` profile **or** the matching env var
> (`PROXY_PROFILE_<NAME>_<FIELD>`) — env is preferred for hosting. Real values **never** get
> committed; the repo only ships placeholders.

## Block 0 — Baseline (always needed, tiny)

| What to provide | Owner |
|---|---|
| A machine or host to run it on (laptop for dev; Databricks Apps or Azure App Service for hosting) | You |
| Node 20+ installed (local dev only) | You |
| Decide the auth posture for hosting (platform-gated vs IdP) — see Block D | You / security |

> Pick **at least one** of Block A / B / C below so there's a brain to talk to. Then pick a host (Block D) only when you go beyond local.

## Block A — Databricks ✅ validated  *(skip if not using Databricks)*

**Shared (needed for any Databricks path):**

| Value | Placeholder | Who owns it |
|---|---|---|
| Workspace URL | `https://YOUR_WORKSPACE.cloud.databricks.com` | Databricks workspace admin / you |
| Token (PAT) — or OAuth-M2M service principal | `dapi_YOUR_PAT_TOKEN_HERE` | Databricks workspace admin |

**A1 — Foundation Model** *(simplest; works on free tier):*

| Value | Placeholder | Who owns it |
|---|---|---|
| Serving-endpoint name (must exist in the workspace) | `YOUR_FOUNDATION_MODEL_ENDPOINT` | Databricks ML / data platform owner |

**A2 — Genie** *(real numbers from your tables):*

| Value | Placeholder | Who owns it |
|---|---|---|
| Genie space ID (one per space) | `YOUR_GENIE_SPACE_ID` | Genie space / data owner |
| SQL warehouse ID (must be able to start) | `YOUR_SQL_WAREHOUSE_ID` | Databricks admin |

> ⚠️ Genie needs a runnable warehouse. On free-edition Databricks, serverless is often disabled —
> ask the admin to enable serverless **or** bind the spaces to a classic SQL warehouse.

## Block B — Power BI ✅ validated  *(skip if not using Power BI)*

**B1 — Semantic-model Q&A** *(capacity-free; recommended):*

| Value | Placeholder | Who owns it |
|---|---|---|
| Azure AD tenant ID | `YOUR_AAD_TENANT_GUID` | Azure / Entra admin |
| Service-principal (app) client ID | `YOUR_SERVICE_PRINCIPAL_CLIENT_ID` | Azure / Entra admin |
| Service-principal client secret | `YOUR_SERVICE_PRINCIPAL_CLIENT_SECRET` | Azure / Entra admin |
| Power BI workspace GUID | `YOUR_POWERBI_WORKSPACE_GUID` | Power BI workspace owner |
| Power BI dataset (semantic model) GUID | `YOUR_POWERBI_DATASET_GUID` | Power BI dataset owner |
| Tenant toggle: "Service principals can use Power BI APIs" = ON | — (a setting, not a value) | Power BI / Fabric admin |
| Service principal added to the workspace as **Member** | — (an access grant) | Power BI workspace owner |

**B2 — Report-visual embed** *(optional; needs paid capacity):*

| Value | Placeholder | Who owns it |
|---|---|---|
| Premium / Fabric capacity on the workspace (a Fabric trial works) | — (a capacity assignment) | Power BI / Fabric admin |
| Report GUID | `YOUR_POWERBI_REPORT_GUID` | Power BI report owner |

## Block C — Other AI connectors ⏳ optional, less battle-tested  *(skip unless you want them)*

| Connector | Values | Who owns it |
|---|---|---|
| Azure OpenAI | endpoint, key, deployment name | Azure subscription owner |
| AWS Bedrock | AWS credentials + region | AWS account owner |

> These are available but not yet thoroughly validated in this dev cycle — opt-in extras.

## Block D — Hosting choice ⛅ pick ONE when you go beyond local  *(skip for laptop dev)*

**D1 — Databricks Apps** *(login handled by the platform):*

| What | Owner |
|---|---|
| Premium workspace with Databricks Apps + serverless enabled | Databricks workspace admin |
| A secret scope holding the token | Databricks admin / you |
| Databricks CLI installed + `databricks auth login` | You |

**D2 — Azure App Service** *(you own the login):*

| What | Owner |
|---|---|
| App Service (Linux, Node 20 LTS) | Azure subscription owner |
| Easy Auth (Microsoft Entra) | Azure / Entra admin |
| Key Vault + app managed identity (`Key Vault Secrets User`) | Azure admin |

> Full step-by-step for each block is in the matching part below (Part 3 = connectors, Parts 11–12 = hosting).

---

## The mental model (read once)

PulsePlay is like a **TV (the screen) + a remote (the AI brain)**:

- **The screen** shows your dashboards (Power BI, Tableau, …) → the **BI vendor (Y axis)**.
- **The brain** answers your questions → the **connector (X axis)**.

Two programs run together:

| Piece | What it is | Plain words |
|---|---|---|
| **proxy** (`proxy/server.js`) | A small server | The "switchboard" that holds secret keys and calls Databricks/Power BI for you. Secrets live **only here**, never in the browser. |
| **playground** (`playground/`) | The web page | The app you click around in. |

You almost never edit code. You edit **one config file**: `proxy/config.json` (or use
environment variables — same thing). The connector picker lists **every profile**
automatically: add a profile → a new brain appears; remove it → it's gone.

---

# PART 1 — Run locally with NO credentials (prove it boots)

Two terminals (PowerShell).

**Terminal 1 — proxy:**
```powershell
cd D:\Working_Folder\Projects\PulsePlay\proxy
npm install                          # first time only
$env:PORT=7000; node --use-system-ca server.js
```

**Terminal 2 — web page:**
```powershell
cd D:\Working_Folder\Projects\PulsePlay\playground
npm install                          # first time only
npm run dev                          # → http://127.0.0.1:7001
```

Open **http://127.0.0.1:7001**.

> ⚠️ **#1 mistake:** forget `$env:PORT=7000` and every `/api/*` call returns HTTP 500.
> The web page is hardwired to find the proxy on port **7000**.
>
> 💡 `--use-system-ca` is only needed behind a corporate/AV TLS filter (certificate errors).

---

# PART 2 — How configuration works (the one file)

```powershell
cd D:\Working_Folder\Projects\PulsePlay\proxy
copy config.example.json config.json   # only if you don't have a config.json yet
```

Shape:
```json
{ "profiles": { "myFirstBrain": { ... }, "mySecondBrain": { ... } } }
```

> 🔒 **Golden rule:** the repo tracks **`config.example.json`** (placeholder-only template);
> your real **`config.json` is gitignored**, so you can safely paste local credentials into it —
> Git will not see it. For hosted/shared environments prefer **env vars**
> (`PROXY_PROFILE_<NAME>_<FIELD>`), Azure Key Vault, or Databricks secret scopes instead of a
> file. Env wins over file if both are set. **Never commit real secrets** (and never un-ignore
> `config.json`).

---

# PART 3 — Configure each brain (connector)

Ordered easiest-and-most-likely-to-work-first. **Pick only the ones you need — every connector is
fully independent; adding or skipping one never affects the others.** Databricks (3A/3B) and Power BI
(3C/3D) are the validated paths; 3E/3F are optional extras.

## 3A. Databricks Foundation Model ⭐ (start here — works on free tier)

A ready-made AI model (Llama/Claude) Databricks hosts. Simplest brain (no warehouse needed).

**You need:** workspace URL, a token (PAT), a model endpoint name.

1. **Workspace URL** — the address bar in Databricks, up to `.net`.
2. **PAT:** email (top-right) → **Settings → Developer → Access tokens → Generate** (starts `dapi...`, shown once).
   - *No "Access tokens" option?* Ask your **Databricks workspace admin** to enable PATs.
3. **Endpoint name:** **Machine Learning → Serving**. Free edition has e.g.
   `databricks-meta-llama-3-3-70b-instruct`, `databricks-meta-llama-3-1-8b-instruct`,
   `databricks-claude-opus-4-8`. **NO `*-405b`.** Wrong name = `404 ENDPOINT_NOT_FOUND`.

```json
"foundation": {
  "type": "foundation-model",
  "host": "https://adb-YOURNUMBER.11.azuredatabricks.net",
  "token": "dapi_YOUR_PAT_HERE",
  "foundationModelEndpoint": "databricks-meta-llama-3-3-70b-instruct",
  "displayName": "Foundation Model — Llama 3.3 70B"
}
```

> ⚠️ FM makes *words*, not measured numbers — the app shows an "Illustrative — not grounded
> in your data" badge. For **real numbers** use Genie or Power BI below.

## 3B. Databricks Genie (real data answers — free-tier catch)

Writes SQL, runs it on your real tables, returns real numbers.

**You need:** workspace URL + PAT, a **Genie space ID**, a **SQL warehouse ID**.

1. **Genie space:** Databricks → **Genie** → open/create a space. ID is the `01f...` in the URL.
2. **Warehouse:** **SQL → SQL Warehouses** → must be **running** (green) → copy its ID.

```json
"sales": {
  "host": "https://adb-YOURNUMBER.11.azuredatabricks.net",
  "token": "dapi_YOUR_PAT_HERE",
  "spaceId": "01f...",
  "warehouseId": "YOUR_WAREHOUSE_ID",
  "displayName": "Genie: Sales",
  "dataDomain": "sales performance data"
}
```

> ⚠️ **Free-tier catch:** free Databricks has **Serverless Compute disabled** → Genie returns
> *"Cannot start warehouse … Serverless Compute disabled."* **Not a PulsePlay bug.**
> **Ask your Databricks admin:** *"Enable Serverless Compute, or create a classic SQL warehouse
> and bind my Genie spaces to it."* Code is ready — it works the moment they do.

## 3C. Power BI — semantic-model Q&A ⭐ (no paid capacity)

Plain-English questions answered with deterministic DAX. No AI model, no Premium needed.

**You need:** an **Azure AD app registration** (robot identity) + secret, plus workspace + dataset IDs.

1. **App registration:** Azure Portal → **Microsoft Entra ID → App registrations → New**. Copy
   **Application (client) ID** + **Directory (tenant) ID**.
2. **Client secret:** that app → **Certificates & secrets → New client secret** → copy the **Value** (shown once).
3. **Allow SPs in Power BI:** **Power BI Admin portal → Tenant settings → "Service principals can use
   Power BI APIs" → Enable.** *(Needs a Power BI/Fabric admin.)*
4. **Add the robot to the workspace:** Power BI → **Workspace → Manage access → Add** → give **Member**.
5. **GUIDs:** workspace URL has `.../groups/<WORKSPACE_GUID>/...`; dataset settings URL has the **dataset GUID**.

```json
"powerbiSales": {
  "type": "powerbi-semantic-model",
  "displayName": "Power BI: Sales Semantic Model",
  "dataDomain": "Sales performance",
  "aadTenantId": "YOUR_TENANT_GUID",
  "aadClientId": "YOUR_APP_CLIENT_ID",
  "aadClientSecret": "YOUR_CLIENT_SECRET_VALUE",
  "powerbiGroupId": "YOUR_WORKSPACE_GUID",
  "powerbiDatasetId": "YOUR_DATASET_GUID"
}
```

> ✅ Capacity-free — best bet for *real Power BI numbers* without paying.
> 💡 Alternative auth (no tenant-admin gymnastics): `authMode: "user-refresh"` +
> `node scripts/get-pbi-user-refresh-token.mjs --tenant <id> --profile <name> --write` (device-code flow).

## 3D. Power BI — report visual on the canvas (needs paid capacity)

Rendering a real interactive report **visual** needs **Premium/Fabric capacity** (a **Fabric trial**
works). **Ask your Power BI/Fabric admin:** *"Assign my workspace to Premium/Fabric capacity."*
Until then, use 3C. (Code is ready — no change needed once capacity exists.)

## 3E. Azure OpenAI (optional)

Two modes: **chat** (conversation) and **analytics** (writes SQL → runs on Databricks → narrates).

```json
"azureChat": {
  "azureOpenAiEndpoint": "https://YOUR_AOAI.openai.azure.com",
  "azureOpenAiKey": "YOUR_AZURE_OPENAI_KEY",
  "azureOpenAiDeployment": "gpt-4o",
  "azureOpenAiApiVersion": "2024-02-01",
  "displayName": "Azure OpenAI Chat"
}
```
> **Ask your Azure subscription owner** to provision Azure OpenAI + deploy a model. Note: on
> Databricks Apps free edition, outbound to Azure OpenAI may be blocked (allow-listed egress).

## 3F. Supervisor (optional)

A "team lead" that asks several Genie spaces at once and merges answers. Depends on Genie → blocked
by the same free-tier warehouse issue until that's fixed.

```json
"supervisor": {
  "type": "supervisor-local",
  "displayName": "Supervisor",
  "agentName": "PulsePlay Supervisor",
  "spaces": ["sales", "operations"],
  "synthesisEndpoint": "databricks-meta-llama-3-3-70b-instruct"
}
```

---

# PART 4 — Who to call for what

| Stuck on… | Who | Ask them exactly |
|---|---|---|
| Can't make a Databricks PAT | Databricks workspace admin | "Enable PATs for me, or give me an OAuth service principal." |
| Genie "Serverless disabled" | Databricks account admin | "Enable Serverless Compute, or create a classic SQL warehouse and bind my Genie spaces." |
| Power BI SP won't connect | Power BI / Fabric admin | "Enable 'Service principals can use Power BI APIs' and add my app to the allowed group." |
| PBI report visual won't render | Power BI / Fabric admin | "Assign my workspace to Premium/Fabric capacity (trial is fine)." |
| Azure OpenAI not available | Azure subscription owner | "Provision Azure OpenAI + deploy gpt-4o; share endpoint + key." |
| `npm install` cert errors | Your IT/Security team | "Your TLS filter breaks Node; I need the corporate root CA trusted." |

---

# PART 5 — Verify a brain is live

1. Open the app, pick the connector, ask a simple question.
2. Watch the **live-verification chip** on the connector card (honest green/red).
3. Read the proxy terminal: `400 warehouse` = Genie free-tier; `404 ENDPOINT_NOT_FOUND` = wrong FM name;
   `401/403` = bad token / missing permission.

---

# PART 6 — BI-side enablers (the dashboards you look at)

8 surface types (`bi-adapters/`): `powerbi`, `native`, `databricks-aibi`, `databricks-genie`,
`generic-iframe` (any URL), and `tableau`/`qlik`/`looker` (iframe fallback for now). Pick with the
**Vendor Picker**, fill the **Embed Config Form**. No code editing.

**Power BI embed modes (easiest → most powerful):**

| Mode | Plain words | Who to ask |
|---|---|---|
| **0. Secure embed link** ⭐ | Paste the link from Power BI → File → Embed report → Website or portal. | Nobody. |
| **1. SSO (User-Owns-Data)** | Log in with your own MS account; see only what you're allowed. Needs AAD client+tenant ID. | Azure admin. |
| **2. Backend (Service Principal)** | Proxy mints a token; browser never sees the secret. | Power BI admin. |
| **3. Manual paste** | Dev/lab only; hidden unless `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true`. | You. |

> ⭐ Start with Mode 0. (Interactive report **visual** still needs Premium/Fabric capacity — see 3D.)

Other vendors / generic: pick vendor, paste the dashboard URL.

---

# PART 7 — Feature-flag enablers (toggles in Settings, per-browser)

| Flag | Default | Enables |
|---|---|---|
| `dashboardAutoSeed` | **ON** | Auto-pins starter charts when the Dashboard is empty + a Power BI connector is bound. |
| `multiConnectorPanes` | **OFF** | Show multiple connectors at once in separate panes (side-by-side). Turn on only for comparison. |

Change them in **Settings** (no file edit, no restart).

---

# PART 8 — Proxy / operational enablers (server switches)

Set as env vars. Local dev usually needs only `PORT=7000`.

| Switch | Local | Hosted | Why |
|---|---|---|---|
| `PORT` | `7000` | injected by host | Wrong value = 500/502. |
| `STATIC_DIR` | unset | `playground/dist` (not `../playground/dist`) | Serve the web page. |
| `PROXY_AUTH_MODE` | `none` | `idp` / `shared-key` (NOT `none` if public) | Who may call the proxy. |
| `NODE_ENV` | unset | `production` **only after auth settled** | `production` + `none` = refuses to start (on purpose). |
| `PROXY_INLINE_CREDENTIALS_MODE` | default | `off` | Keep secrets out of diagnostics. |
| `PROXY_CORS_ORIGIN` | `*` | your exact origin | Prod refuses `*`. |
| `NODE_OPTIONS` | `--use-system-ca` if TLS-intercepted | usually not needed | Trust corporate cert. |

---

# PART 9 — The allowlist (governance enabler)

In `config.json` under `"allowlist"`. With `allowlistEnforcement: "strict"` the proxy **refuses**
anything not listed. **Rule of thumb:** every ID in a profile must also appear in the allowlist
(workspaces, datasets, tenants, Genie spaces) or strict mode blocks it. Your **data governance owner**
approves this list.

---

# PART 10 — Vite (web-page) env enablers

`playground/.env` (optional): `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true` shows the manual-token PBI
mode (dev only). Not needed for normal use.

---

# HOSTING — universal rules (both targets)

> Local = two programs in two terminals. **Hosted = one program**: the proxy also serves the built web
> page from `playground/dist` via `STATIC_DIR`. The browser calls `/api/*` on that same address.

1. **Build the web page first** (`npm run build` → `playground/dist`). Don't build at runtime.
2. **Set `STATIC_DIR=playground/dist`** (exactly — not `../playground/dist`).
3. **Never hardcode the port** — the proxy reads `process.env.PORT` (host injects it).
4. **Never commit `config.json`/secrets** — supply as host env vars / secret store. The repo's
   `npm run validate-deploy` gate blocks unfilled placeholders.

---

# PART 11 — Host on Databricks Apps (closest to your data)

Choose when users live in Databricks. Platform handles login (Databricks OAuth).

**Prerequisites:**

| What | Who |
|---|---|
| Premium workspace, Apps enabled + serverless | Databricks workspace admin |
| CLI installed + `databricks auth login` (OAuth, not just PAT) | You |
| Repo pushed to GitHub (✅ already) | You |
| Secret scope holding the token | Databricks admin / you |
| Resource IDs (warehouse, Genie space(s), FM endpoint) | Data owner |

**Config files:**
- `proxy/app.yaml` — start command + env. Keep `PROXY_AUTH_MODE=none` (platform gates URL) and
  `STATIC_DIR=playground/dist`. Fill any `ENTER_...` placeholders or the validate gate blocks deploy.
- `databricks.yml` — names the app + target workspace. One-time: add an `app` resource block +
  `databricks bundle deployment bind` (see CICD.md).

**Deploy:**
```powershell
cd proxy ; npm test
cd ..\playground ; npm run lint ; npm run test ; npm run build
git push origin main
databricks bundle deploy --target dev
databricks bundle run pulseplay_app --target dev   # MUST run — deploy alone does NOT restart
```
> ⚠️ Gotchas: (1) `deploy` alone keeps serving old code — also `bundle run`. (2) Pin a **commit SHA**,
> not a branch. (3) Verify `databricks apps get pulseplay-dev -o json` — if `resources: null`, secrets
> aren't bound; fix in UI + redeploy.

**Verify** in a logged-in browser (not curl): `/`, `/health`, `/__diag/static`, `/__diag/env`, then one real question.

> Free-Edition caps: 3 apps max, auto-stop after 24h, allow-listed egress (external Azure OpenAI/Bedrock may be blocked).

---

# PART 12 — Host on Azure App Service (a normal web URL)

Choose for a standard `https://<app>.azurewebsites.net` URL. **You own the login** (Easy Auth at the
edge; proxy auth is separate).

**Prerequisites:**

| What | Who |
|---|---|
| App Service (Linux, Node 20 LTS) | Azure subscription owner |
| Easy Auth (Microsoft Entra) | Azure / Entra admin |
| Key Vault + app managed identity (`Key Vault Secrets User`) | Azure admin |
| Connector secrets | You |

**App settings (Portal → Configuration):**

| Setting | Value |
|---|---|
| `STATIC_DIR` | `playground/dist` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (build in CI, not on the box) |
| `PROXY_AUTH_MODE` | `none` (behind Easy Auth) |
| `NODE_ENV` | leave unset until auth settled |
| `PROXY_INLINE_CREDENTIALS_MODE` | `off` |
| `PROXY_CORS_ORIGIN` | `https://<app>.azurewebsites.net` |
| `PROXY_PROFILE_*` | profiles (token = Key Vault ref) |
| Startup Command | `node proxy/server.js` |

Key Vault reference: `PROXY_PROFILE_DEFAULT_TOKEN=@Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/<name>/)`

**Deploy:**
```powershell
npm --prefix playground ci ; npm --prefix playground run build
npm --prefix proxy ci --omit=dev
# Stage a curated zip: proxy/ (server.js, lib, package*, node_modules, config.example.json) + playground/dist.
# EXCLUDE config.json/.env/docs. ZIP contents at the ROOT (no extra top folder).
# Deploy via az webapp deploy or the GitHub workflow.
```
> ⚠️ Gotchas: (1) Easy Auth + `/api/*` → set unauthenticated action to **HTTP 401, not 302**, or the
> SPA's `fetch` follows a login redirect and gets HTML. (2) ZIP contents at the root. (3) F1 sleeps after
> ~20 min idle — warm before a demo.

**Verify:** `curl https://<app>.azurewebsites.net/health` + `/__diag/static`, then sign in and ask one question.

---

# PART 13 — Automated CI/CD (wired, inert until setup)

Both deploys are GitHub Actions, **manual-trigger**, deploy-only (stays $0), OIDC (no stored secrets):

| Workflow | Does | Turn on |
|---|---|---|
| `.github/workflows/deploy-azure.yml` | build + test + curated zip + deploy + smoke `/health` | set `AZURE_CLIENT_ID`/`TENANT_ID`/`SUBSCRIPTION_ID`, create `azure-dev` env w/ reviewer |
| `.github/workflows/deploy-databricks.yml` | build + test + `validate-deploy` + `bundle deploy` + `bundle run` | set `DATABRICKS_HOST`/`CLIENT_ID`, create `databricks-dev` env, one-time `bundle deployment bind` |

See [CICD.md](CICD.md).

---

# PART 14 — Which host? + auth one-liner

| | Databricks Apps | Azure App Service |
|---|---|---|
| Login | built-in (Databricks OAuth) | you wire Easy Auth (Entra) |
| Best for | users in Databricks, data-proximity | a normal web URL, non-DB users |
| Secrets | secret scopes / app resources | Key Vault references |
| Free reality | 3 apps, auto-stop 24h, allow-listed egress | F1 sleeps, 60 CPU-min/day |

**Auth one-liner:** Databricks Apps → `PROXY_AUTH_MODE=none` is fine (platform gates URL). Azure /
anything public → never `none` for production; Easy Auth at the edge, and don't set `NODE_ENV=production`
until auth is settled.

---

# Recommended order (free accounts, proving it works)

1. Local production-shape smoke: `STATIC_DIR=playground/dist`, `node proxy/server.js`, hit `/health` + `/__diag/static`.
2. **Databricks Apps** deploy (Foundation Model works there today; login is free) — fastest real-cloud proof.
3. **Azure App Service** F1 as a second proof for a public-style URL.
4. Wire the **CI workflows** once both manual deploys succeed.
