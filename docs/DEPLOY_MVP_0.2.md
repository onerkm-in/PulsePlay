# PulsePlay MVP 0.2 — Deployer Checklist

> **Purpose.** Everything you need to deploy PulsePlay MVP 0.2 (Genie + Supervisor + Power BI Premium, no Fabric) into a managed-organization environment. **No code changes required** — the MVP 0.2 functional + security core is shipped and tested. Adding more Genie spaces, more Supervisor fan-outs, more Power BI workspaces, more AAD tenants, or extra AI connector types (Azure OpenAI, AWS Bedrock, Mosaic Foundation Model) is a `proxy/config.json` edit, not a code change.
>
> **Scope.** The MVP 0.2 deployment cell: Power BI (Premium workspace, no Fabric) + Databricks Genie (direct + Supervisor multi-space) + CPG/FMCG knowledge pack. For other BI vendors (Tableau / Qlik / Looker as first-class providers), see [SETTINGS_SPEC.md § 16 Phase 9b](SETTINGS_SPEC.md). For Fabric features (Direct Lake / Dataflow Gen2 / semantic-link), see Phase 10.
>
> **Companion docs:** [SETTINGS_SPEC.md](SETTINGS_SPEC.md), [SECURITY.md](SECURITY.md), [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md), [PROXY_REFERENCE.md](PROXY_REFERENCE.md), [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md).
>
> **What you DO need to do:** populate `proxy/config.json`, set production env vars, deploy the proxy on an org-internal host, deploy the playground bundle behind your IdP-gated edge, run the smoke.
>
> **What you DON'T need to do:** write any code. Every code path the MVP 0.2 cell needs is already shipped.

---

## 0. Prerequisites

Before touching `proxy/config.json`, confirm with your platform team that these exist:

| Asset | Owned by | What we need from them |
|---|---|---|
| **Azure AD tenant** | Identity team | Tenant GUID. **MUST** be the only tenant in `allowlist.aadTenants` (closes L1). |
| **Azure AD app registration** (SPA) for Power BI SSO | Identity / BI admins | Client ID + redirect URI = playground deploy origin. Delegated permission `Power BI Service → Report.Read.All` granted. |
| **Azure AD service principal** for proxy-issued embed tokens | Identity / BI admins | Client ID + client secret in vault. Granted member role on every workspace in `allowlist.powerbiWorkspaces`. |
| **Power BI Premium capacity** | BI capacity admins | Workspace GUIDs of every Premium workspace authors can embed from. (Pro / Free workspaces won't work for embed-token issuance.) |
| **Databricks Genie space(s)** | Data platform team | Space ID per Genie space. Workspace host. Service-principal client ID + secret with `CAN_USE` on each space. |
| **(Optional) Mosaic AI Supervisor agent** | Data platform team | Serving endpoint URL OR list of constituent space profile names (for `supervisor-local`). |
| **(Optional) Azure OpenAI / AWS Bedrock / Foundation Model endpoint** | Data/AI platform | Endpoint URL + key. Only needed if you want the "AI analytics" path or non-Genie inference. |
| **PulsePack content directory** | This repo's `pulsepacks/cpg-fmcg/` | Already present in repo; no action needed unless you author a new pack. |
| **IdP integration** (JWKS endpoint) | Identity team | JWKS URL + issuer + audience for `PROXY_IDP_*` env vars. |
| **Vault** (Key Vault / HashiCorp Vault / Secrets Manager) | Security team | A path to read SP secrets / API keys from. |
| **TLS termination + reverse proxy** | Platform team | Behind corporate VPN / Zero Trust. **127.0.0.1 dev bind is dev-only** (ADR-0002). |

If any are missing, the deployment is **blocked on platform team**, not on code work.

---

## 1. `proxy/config.json` — copy from example, fill placeholders

Start from [proxy/config.example.json](../proxy/config.example.json). Replace every `YOUR_*` placeholder. Everything below is configuration only; no code changes.

### 1.1 Top-level shape

```jsonc
{
    "port": 8787,
    "feedbackLog": "feedback.log",
    "allowlistEnforcement": "strict",
    "allowlist": { /* § 1.2 below */ },
    "profiles":  { /* § 1.3 below */ }
}
```

`port` defaults to 8787. `allowlistEnforcement` MUST be `"strict"` for production — the proxy refuses to start otherwise.

### 1.2 `allowlist` (the load-bearing org gate)

This block is the source of truth for what the deployment allows. Every PulsePlay defense-in-depth layer reads from it.

```jsonc
"allowlist": {
    "biProviders": ["powerbi"],
    "embedOrigins": {
        "powerbi": ["app.powerbi.com"]
    },
    "powerbiWorkspaces": [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002"
    ],
    "powerbiReports": [],
    "aadTenants": ["YOUR_ORG_AAD_TENANT_GUID"],
    "aiProfiles": {
        "default": ["sales-genie", "marketing-genie", "org-supervisor"],
        "byGroup": {
            "app.pulseplay.users.finance":   ["finance-genie"],
            "app.pulseplay.users.executive": ["org-supervisor"]
        }
    },
    "genieSpaces": [
        "01ef1234-1111-1111-1111-111111111111",
        "01ef1234-2222-2222-2222-222222222222"
    ],
    "supervisorProfiles": ["org-supervisor"],
    "packs": ["cpg-fmcg"],
    "knowledgeSources": [],
    "license": {
        "powerbi": {
            "minTier": "Premium",
            "allowedTiers": ["Premium P1", "Premium P2", "Premium P3", "PPU"],
            "embedSku": ["EM1", "EM2", "EM3"],
            "fabricEnabled": false
        }
    }
}
```

#### Field-by-field

| Field | What to put | Why |
|---|---|---|
| `biProviders` | `["powerbi"]` for MVP 0.2 | Hides Tableau / Qlik / Looker / generic-iframe from the UI |
| `embedOrigins.powerbi` | `["app.powerbi.com"]` | Browser-side iframe origin gate + CSP `frame-src` source |
| `powerbiWorkspaces` | Lowercased GUIDs of every authorized workspace | Proxy refuses embed-token mint for any other workspace |
| `powerbiReports` | Empty for "any report in allowed workspaces", or a tight list of report GUIDs to lock specific reports | Optional finer-grained gate |
| `aadTenants` | Your org's single tenant GUID (lowercased) | Closes L1 — `pbiAuth.signInAndPrepareEmbed` refuses any other tenant |
| `aiProfiles.default` | Profile names everyone with `app.pulseplay.users` can see | Filters `/assistant/profiles` per user |
| `aiProfiles.byGroup` | Per-IdP-group additions on top of `default` | E.g. finance users get a finance-only Genie space |
| `genieSpaces` | Space IDs of every Genie space referenced by any profile | Defense in depth for L4 |
| `supervisorProfiles` | Names of profiles whose `type` is `supervisor` or `supervisor-local` | Shown with the "Supervisor" badge in Settings; fan-out table renders for these |
| `packs` | `["cpg-fmcg"]` for MVP 0.2 | Hides any future pack directory you haven't authorized |
| `knowledgeSources` | `[]` (post-MVP-0.2) | Reserved for Phase 3 governed retrieval |
| `license.powerbi.minTier` | `"Premium"` | Surfaces in Settings › System › License posture |
| `license.powerbi.allowedTiers` | The set the deployment licenses | Same |
| `license.powerbi.embedSku` | The Embedded SKU your capacity uses | Same |
| `license.powerbi.fabricEnabled` | `false` for MVP 0.2 | UI surfaces the no-Fabric diagnostic; adapter refuses Fabric-only reports |

### 1.3 `profiles` (one entry per AI brain you expose)

Profiles are connector configurations. Adding a new profile = new entry here. The proxy already supports every type listed below — no code change.

#### 1.3.1 Direct Genie space (the bread-and-butter MVP 0.2 profile)

```jsonc
"sales-genie": {
    "host": "https://adb-WORKSPACE_ID.REGION.azuredatabricks.net",
    "authMode": "oauth-m2m",
    "clientId":     "YOUR_GENIE_SP_CLIENT_ID",
    "clientSecret": "YOUR_GENIE_SP_CLIENT_SECRET",
    "spaceId":     "01ef1234-1111-1111-1111-111111111111",
    "warehouseId": "OPTIONAL_SQL_WAREHOUSE_ID",
    "displayName": "Sales helper",
    "dataDomain":  "sales data",
    "suggestedQuestions": [
        "What were the top 3 categories by profit margin last quarter?",
        "Which region declined most in revenue year-over-year?"
    ]
}
```

**Recommended:** use `authMode: "oauth-m2m"` (SP via OAuth client credentials, auto-rotating tokens) in production. PATs are dev-only.

#### 1.3.2 Supervisor over multiple Genie spaces

The "fans across multiple Genie spaces" pattern. The proxy already routes this.

```jsonc
"org-supervisor": {
    "type": "supervisor-local",
    "agentName": "PulsePlay Supervisor",
    "synthesisEndpoint": "databricks-meta-llama-3.1-405b-instruct",
    "spaces": ["sales-genie", "marketing-genie", "supply-genie"],
    "crossDomainNotes": [
        "Numbers from the operations source are monthly aggregates rounded to 2 decimals; line-level orders may differ by <1%."
    ]
}
```

**Or:** if you've deployed a real Mosaic AI Supervisor Agent serving endpoint, point at it instead:

```jsonc
"org-supervisor-prod": {
    "type": "supervisor",
    "host":       "https://dbc-xxx.cloud.databricks.com",
    "endpoint":   "/serving-endpoints/pulseplay-supervisor-agent/invocations",
    "agentName":  "PulsePlay Supervisor Agent",
    "token":      "PAT_OR_SP_TOKEN_WITH_CAN_USE",
    "displayName":"PulsePlay Supervisor (production)",
    "dataDomain": "all helper data"
}
```

#### 1.3.3 Azure OpenAI (analytics mode — LLM-for-SQL → Databricks-for-exec)

```jsonc
"finance-analytics": {
    "azureOpenAiEndpoint":   "https://YOUR_AOAI.openai.azure.com",
    "azureOpenAiKey":        "YOUR_AZURE_OPENAI_KEY",
    "azureOpenAiDeployment": "gpt-4o",
    "azureOpenAiApiVersion": "2024-02-01",
    "mode": "analytics",
    "host":        "https://adb-WORKSPACE.REGION.azuredatabricks.net",
    "token":       "dapi_PAT_FOR_SQL_EXEC",
    "warehouseId": "YOUR_SQL_WAREHOUSE_ID",
    "schemaContext": "TABLE main.finance.fct_journal (...)\nTABLE main.finance.dim_account (...)"
}
```

Without `mode: "analytics"` and `schemaContext`, this is chat-only.

#### 1.3.4 Mosaic AI Foundation Model (Llama 3.1, etc.)

```jsonc
"foundation-405b": {
    "type": "foundation-model",
    "host":  "https://adb-WORKSPACE.REGION.azuredatabricks.net",
    "token": "dapi_PAT_OR_USE_AUTHMODE_OAUTH_M2M",
    "foundationModelEndpoint": "databricks-meta-llama-3-1-405b-instruct",
    "displayName": "Foundation Model — Llama 3.1 405B"
}
```

#### 1.3.5 AWS Bedrock

The proxy supports a Bedrock profile shape too. See `proxy/config.example.json` for the exact field set (it varies by Bedrock SDK version your platform team has standardized on).

---

## 2. Environment variables (production hardening)

The proxy refuses to start in `NODE_ENV=production` unless these are set correctly.

### 2.1 Required

| Env var | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Trips every security gate (allowlist enforcement, CORS pin, IdP requirement, inline-creds gate, config validator) |
| `PROXY_AUTH_MODE` | `idp-or-shared-key` recommended; `idp` if the edge always forwards a verified Bearer JWT; `shared-key` only for service-to-service controlled networks | Production refuses `none` and refuses to start unless the selected mode has usable IdP or shared-key config |
| `PROXY_SHARED_KEY` | 32+ char random value from vault | Shared-key fallback for `idp-or-shared-key` and required for `shared-key`; canonical header is `X-PulsePlay-Key`, legacy alias is `X-Genie-Key` |
| `PROXY_INLINE_CREDENTIALS_MODE` | `off` | L8 closure — refuses to start otherwise in production |
| `PROXY_CORS_ORIGIN` | Playground deploy origin(s), comma-separated, never `*` | L7 + CORS gate. Production refuses to start with `*`. |
| `PROXY_IDP_JWKS_URL` | Your org IdP's JWKS endpoint | Used by `jose` to verify Bearer tokens when `PROXY_AUTH_MODE` includes `idp` |
| `PROXY_IDP_ISSUER` | Expected `iss` claim | JWT verification |
| `PROXY_IDP_AUDIENCE` | Expected `aud` claim | JWT verification |

`PROXY_KEY` is accepted as a shared-key compatibility alias. Prefer `PROXY_SHARED_KEY` for new deployments. `PROXY_IDP_REQUIRED=true` is accepted as a legacy shorthand for `PROXY_AUTH_MODE=idp` when `PROXY_AUTH_MODE` is unset.

### 2.2 Secret references (vault-managed, do NOT commit to config.json)

| Env var (preferred over inline secrets) | Maps to `config.json` field |
|---|---|
| `PROXY_PROFILE_<NAME>_CLIENT_SECRET` | `profiles.<name>.clientSecret` |
| `PROXY_PROFILE_<NAME>_TOKEN` | `profiles.<name>.token` |
| `PROXY_PROFILE_<NAME>_POWER_BI_CLIENT_SECRET` | `profiles.<name>.powerBiClientSecret` |
| `AZURE_OPENAI_KEY` | (read by analytics-mode handler) |
| Vault-managed via your CD pipeline | All other secrets |

Use the env-var path. Plain-text secrets in `config.json` are dev-only.

### 2.3 Optional

| Env var | Use |
|---|---|
| `PROXY_REQUIRE_AUTH=true` | Forces production auth validation even outside `NODE_ENV=production`; useful for staging |
| `WEBSITE_SITE_NAME` | Azure App Service indicator — auto-pins inline-creds to `off`, suppresses dev banner |
| `NODE_EXTRA_CA_CERTS` | TLS-MITM proxy chain cert path |
| `FEEDBACK_LOG` | Override audit log path |
| `DATABRICKS_APP_NAME` | Surfaces in `/health` response |

---

## 3. Browser-side build configuration

The playground bundles strict CSP from the allowlist at build time. Make sure `proxy/config.json` has the allowlist populated **before** running `npm run build` — otherwise the example fallback is used.

```bash
cd playground
npm install   # first time only
npm run build # tsc -b && vite build — emits dist/ with strict CSP
```

If you need to set the proxy base URL at build time (when the playground is hosted on a different domain from the proxy), use:

```bash
VITE_API_BASE_URL=https://proxy.internal.example.com npm run build
```

L10 (acceptance log) notes this is build-time only — runtime overrides are not possible from the browser.

---

## 4. Deployment topology

```
                   ┌────────────────────────┐
   User browser ──>│   IdP-gated edge       │── JWT-Bearer ──┐
                   │   (Zero Trust / VPN)   │                │
                   └────────────────────────┘                ▼
                                                ┌──────────────────────┐
                                                │  PulsePlay proxy     │
                                                │  (org-internal host) │
                                                │  127.0.0.1 + edge    │
                                                │  vault-managed SPs   │
                                                └──────────────────────┘
                                                            │
                       ┌────────────────────────────────────┼────────────────────────┐
                       ▼                                    ▼                        ▼
              ┌──────────────────┐              ┌──────────────────────┐  ┌───────────────────┐
              │ Power BI service │              │ Databricks Genie /   │  │ Azure OpenAI /    │
              │ (Premium)        │              │ Supervisor / Mosaic  │  │ Bedrock / etc.    │
              └──────────────────┘              └──────────────────────┘  └───────────────────┘
```

Per [SECURITY.md § Architectural north star](SECURITY.md):

- **Identity** flows from your IdP. PulsePlay never owns a user store.
- **Data access** is enforced by Unity Catalog row/column policy and BI workspace RBAC. PulsePlay is defense in depth on top.
- **AI access** is the platform team's existing Genie / Supervisor / Foundation Model. PulsePlay orchestrates.

---

## 5. Smoke verification (must pass before pilot)

Run these on the deployed proxy + playground from a real user's browser:

### 5.1 Proxy reachability

```bash
curl -s https://your-proxy/health | jq
# Expected: { "ok": true, "profiles": [...], "authMode": "idp-or-shared-key", ... }
```

### 5.2 Allowlist visibility

```bash
curl -s https://your-proxy/assistant/allowlist \
  -H "Authorization: Bearer $JWT" | jq
# Expected: filtered allowlist for the current user's groups.
# Verify: biProviders, aadTenants, aiProfiles, packs are populated.
```

### 5.3 Browser smoke

In a regular user's browser:

1. Visit the playground URL → IdP redirects → comes back authenticated.
2. **Settings page (`/settings`):** opens with `Cmd/Ctrl+,`. All five chips green (BI · AI · Pack · Proxy · Security).
3. **BI › Provider:** Power BI is the only option (filtered by allowlist).
4. **AI › Provider:** shows the user's allowed profiles + Supervisor badge on supervisor profiles.
5. **AI › Connection test:** for a Genie profile, single probe succeeds with rich metadata. For a Supervisor profile, "Run probe across all spaces" runs per-space with 2 s stagger; aggregate count shown.
6. **Knowledge Base (`/knowledge`):** lists installed packs; clicking cpg-fmcg shows the glossary / ontology / KPIs / sample-questions tabs with real content.
7. **Embed a Power BI report** via Settings › BI › Embed with the Secure-embed link mode (paste a real `app.powerbi.com/reportEmbed?...` URL). Workspace + report GUID must match the allowlist.
8. **Ask the AI a question** that exercises the active pack's vocabulary (e.g. "What was OTIF last week?" for cpg-fmcg supply-chain). Genie SQL Trace tab should show the query.
9. **System › Diagnostics:** recent BI events count > 0 after embed.
10. **System › Export bundle:** downloads JSON without errors; verify tokens redacted.

### 5.4 Allowlist rejection paths

Each of these should be visibly refused:

- Type a non-allowed AAD tenant in BI › Authentication → form-level error before MSAL.
- Paste an `app.powerbi.com` URL pointing at a workspace **not** in the allowlist → workspace allowlist error.
- Try to embed a Fabric-only report (Direct Lake) → no-Fabric diagnostic surfaces, report doesn't mount.

---

## 6. Common pitfalls

| Symptom | Likely cause |
|---|---|
| Proxy refuses to start with `FATAL: ... allowlist is required in production` | `NODE_ENV=production` but `proxy/config.json` is missing `allowlist` block. Populate § 1.2 above. |
| Proxy refuses to start with `FATAL: PROXY_INLINE_CREDENTIALS_MODE is "override" in production` | Set `PROXY_INLINE_CREDENTIALS_MODE=off` explicitly, OR set `PROXY_SHARED_KEY` / `WEBSITE_SITE_NAME` (which auto-pin to off). |
| Proxy refuses to start with `FATAL: PROXY_CORS_ORIGIN must be pinned ...` | Set `PROXY_CORS_ORIGIN=https://playground.your-org.example` |
| Browser shows "No AI providers available" in Settings | `allowlist.aiProfiles.default` is empty for the user's group. Add the profile name or use `byGroup`. |
| Power BI embed fails with "URL hostname … is not in your organization's allowed origins" | The pasted URL hostname isn't in `allowlist.embedOrigins.powerbi`. Add `app.powerbi.com` (or your tenant's specific PBI hostname). |
| Power BI embed fails with "This workspace is not in your organization's Power BI workspace allowlist" | Pasted URL's `groupId` query param isn't in `allowlist.powerbiWorkspaces`. Add it. |
| Supervisor probe shows 0/N spaces reachable | Each constituent space name in `supervisor.spaces` must point to another configured profile with valid host + auth. Check the proxy log. |
| Fabric report won't mount, shows "Fabric features … not enabled in this deployment" | Expected — MVP 0.2 has `license.powerbi.fabricEnabled: false`. Use a classic (Import / DirectQuery) Power BI report, or wait for Phase 10. |
| CSP errors in browser console for an approved-vendor subdomain | The strict CSP only allows what's in `allowlist.embedOrigins`. Add the subdomain there + rebuild the playground bundle. |

---

## 7. When do I need code work (Phase 9b / Phase 10)?

Almost never for MVP 0.2. You ONLY need code work if:

| Scenario | Phase | Effort |
|---|:---:|:---:|
| Your org standardises on Tableau / Qlik / Looker as the primary BI tool and wants AI-applied filters / page navigation / event capture | **9b** | Per-vendor SDK adapter (per-vendor effort) |
| Your org adopts Fabric and wants Direct Lake / Dataflow Gen2 / semantic-link support | **10** | Additive code inside the PBI adapter |
| You add a brand-new AI connector type the proxy doesn't already route (today: Genie, Supervisor, Azure OpenAI, Bedrock, Foundation Model — all routed) | minor | New backend module + profile type |

**Everything else is configuration** — see § 1 above.

---

## 8. After deploy: keeping the docs in sync

When you change the deployed allowlist:

1. Update `proxy/config.json` on the deployer host (via your CD pipeline).
2. **Rebuild the playground bundle** so the new CSP is emitted from the new allowlist.
3. Verify with the `/health` and `/assistant/allowlist` smoke checks in § 5.

When you add a new profile type to the spec (post-MVP-0.2 expansion), update:

- [SETTINGS_SPEC.md § 16](SETTINGS_SPEC.md) — phase tracker
- [AGENDA.md](AGENDA.md) — phase items
- This file — § 1.3 with the new profile shape

---

## 9. Cross-references

- [SETTINGS_SPEC.md](SETTINGS_SPEC.md) — full settings spec, including allowlist contract and § 16 phase tracker
- [SECURITY.md](SECURITY.md) — internal-scoped guardrails
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) — board-ready audit + risk acceptance log
- [PROXY_REFERENCE.md](PROXY_REFERENCE.md) — proxy API surface, routes, OAuth M2M setup
- [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) — Knowledge plane + KB UI page spec
- [proxy/config.example.json](../proxy/config.example.json) — the canonical config skeleton with all profile-type examples
