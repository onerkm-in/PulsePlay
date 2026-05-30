# PulsePlay Azure App Service Deployment Plan

Status: Deep Research Findings Prepared - Awaiting User Approval For Repo Prep/Infra/Deploy

## Goal

Prepare PulsePlay for a first Azure App Service hosting attempt, then deploy only after validation and explicit approval.

## Mode

MODERNIZE. PulsePlay is an existing non-Azure app with no committed Azure deployment artifacts, no `azure.yaml`, no `infra/`, and no root `package.json`.

## Specialized Technology Check

- User request does not mention Azure Functions, Copilot SDK, migration from AWS/GCP/Lambda, APIM, or AI Gateway.
- Code scan found no `@github/copilot-sdk`, `copilot-sdk`, or `CopilotClient` markers.
- Continue with `azure-prepare`.

## Workspace Scan

| Component | Type | Technology | Path |
|---|---|---|---|
| playground | SPA frontend | React + Vite + TypeScript | `playground/` |
| proxy | API/static host | Node.js + Express | `proxy/` |
| enablers/desktop | Local packaging enabler | Node runtime launcher | `enablers/desktop/` |
| enablers/pulse-pbi | Power BI custom visual enabler | TypeScript / pbiviz | `enablers/pulse-pbi/` |

| Existing infrastructure item | Status |
|---|---|
| `azure.yaml` | Not found |
| `infra/*.bicep` / `*.tf` | Not found |
| Dockerfile | Not found |
| App Service startup files | Not found |
| Existing Databricks Apps manifest | Found: `app.yaml` for Databricks Apps only |

## Selected Topology

First attempt: **single Linux Azure App Service** that serves both the built React app and the Node proxy from one origin.

Rationale:

- Matches the existing successful Databricks Apps combined-host shape.
- Avoids a cross-origin frontend/proxy split for the first App Service proof.
- Reuses existing proxy support for `PORT` and `STATIC_DIR=playground/dist`.
- Keeps secrets server-side in App Service app settings / Key Vault references.

Not chosen for this first attempt:

- Azure Static Web Apps + App Service proxy: better enterprise split later, but more auth/CORS moving parts.
- Custom container: useful later if Oryx/Kudu build behavior becomes brittle, but not needed for the first proof.
- AKS/Container Apps: out of scope for the user’s App Service request.

## Recipe

AZD (Bicep), preparation only.

Rationale:

- `azure-prepare` defaults to AZD for Azure modernization when no IaC exists.
- AZD can provision resource group, Linux App Service plan, web app, Application Insights, and Key Vault references repeatably.
- Deployment execution must go through `azure-validate` and then `azure-deploy`; do not run `azd up` directly from this phase.

## Proposed Repo Changes After Approval

1. Add a root `package.json` so App Service/Oryx can detect a Node app from the repository root.
2. Add root scripts:
   - `build`: install/build `playground`, install production dependencies for `proxy`.
   - `start`: run `node proxy/server.js`.
   - optional `azure:build` / `azure:start` aliases if cleaner for App Service startup.
3. Add `azure.yaml` for AZD.
4. Add `infra/` Bicep for:
   - Linux App Service plan.
   - Web App with Node 24 LTS runtime.
   - system-assigned managed identity.
   - Application Insights / Log Analytics.
   - app settings for `STATIC_DIR`, `PROXY_INLINE_CREDENTIALS_MODE`, profile host/IDs, and Key Vault references for secrets.
5. Extend [docs/DEPLOY_AZURE_APP_SERVICE.md](../docs/DEPLOY_AZURE_APP_SERVICE.md) from guidance into an executable deployment checklist if needed.
6. Add `.gitignore` entries only if generated Azure CLI/AZD local state would otherwise appear in git status.

## Docs Prepared

- [docs/DEPLOY_AZURE_APP_SERVICE.md](../docs/DEPLOY_AZURE_APP_SERVICE.md) documents App Service configuration challenges and guidance: monorepo/Oryx build, startup command, Easy Auth vs proxy auth, Key Vault references, network restrictions, diagnostics exposure, logs, slots, scaling, package layout, and the first-proof smoke path.
- [docs/research/AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md](../docs/research/AZURE_APP_SERVICE_DEPLOYMENT_FINDINGS_2026-05-22.md) consolidates the multi-agent findings: repo readiness, official Microsoft guidance, Azure account state, cost gates, enterprise auth/security, Databricks Apps comparison, and the clean deployment phase plan.

## Required App Settings

Minimum for the first single-host attempt:

| Setting | Value / source | Notes |
|---|---|---|
| `STATIC_DIR` | `playground/dist` | Existing proxy static middleware serves React build and SPA fallback. |
| `PROXY_INLINE_CREDENTIALS_MODE` | `off` | Required production posture. |
| `PROXY_PROFILE_DEFAULT_HOST` | App setting | Azure Databricks workspace URL. |
| `PROXY_PROFILE_DEFAULT_TOKEN` | Key Vault reference | Transitional credential unless a better OAuth path is implemented. |
| `PROXY_PROFILE_DEFAULT_SPACE_ID` | App setting | Default Genie Space. |
| `PROXY_PROFILE_DEFAULT_WAREHOUSE_ID` | App setting | SQL Warehouse for evidence/metadata. |
| `NODE_OPTIONS` or `NODE_EXTRA_CA_CERTS` | App setting if needed | Only if enterprise TLS/root CA requires it. |

Auth setting to resolve before production:

- Recommended first proof: enable **App Service Authentication** with Microsoft Entra and require authentication for all requests, then run PulsePlay behind that platform gate.
- Code caveat: the current proxy refuses `PROXY_AUTH_MODE=none` when `NODE_ENV=production`. If App Service sets `NODE_ENV=production`, either configure `PROXY_AUTH_MODE=idp-or-shared-key` with a working client token flow, or add/approve a small proxy enhancement that trusts App Service Easy Auth headers as a verified platform-auth user.

## Official References Checked

- Azure App Service Node.js configuration: Node version, startup command, PM2, app settings, logs, URL rewrites.
- Azure App Service ZIP deploy: package layout and `az webapp deploy`.
- Azure App Service app settings: app settings become environment variables and are encrypted at rest.
- Azure App Service Key Vault references: managed identity + Key Vault Secrets User role.
- Azure App Service Authentication: Easy Auth can require authentication before requests reach the app and injects identity headers.

## Current Azure Tooling State

- Azure CLI is installed: `az --version` works with a workspace-local `AZURE_CONFIG_DIR`.
- Default Azure CLI profile is blocked in the sandbox: `C:\Users\rajes\.azure\azureProfile.json` permission denied.
- Workspace-local Azure CLI config is not logged in.
- 2026-05-22 read-only connectivity check: Azure CLI `2.85.0` is installed and `AzureCloud` is active; TCP connectivity to `login.microsoftonline.com:443` succeeds. `az login --use-device-code --tenant common` is blocked by Norton Web/Mail Shield TLS interception. The generated Microsoft login certificate is issued by `Norton Web/Mail Shield Root`; that root exists in Windows cert stores, but Azure CLI's Python/certifi path rejects it with `Basic Constraints of CA cert not marked critical`. Temporary `.azure/azcli-session` was removed and no token cache was retained.
- 2026-05-22 VS Code Azure MCP path succeeded outside the sandbox. It found one enabled subscription: `Azure subscription 1` (`1ae0670a-e564-439b-93d1-ad2115aee5df`, tenant `2b983dc1-08a4-4b13-87d9-065f8db8f99b`).
- Read-only inventory through `azmcp.exe` found no resource groups, no App Service web apps, no Storage accounts, no Container Apps, no Function Apps, and no Cosmos DB accounts.
- Cost caveat: Azure MCP did not expose direct Cost Management/free-credit balance in this session. Empty resource groups strongly suggest no deployed-resource spend, but Azure Portal Cost Management remains the source of truth for remaining credit.
- Live deployment is blocked until user approves creating resources, chooses location/SKU, and confirms cost guardrails for the $200 free-credit account.

## Validation Plan

Before deployment:

1. `npm --prefix playground run lint`
2. `npm --prefix playground run test`
3. `npm --prefix playground run build`
4. `npm --prefix proxy test`
5. Local production-shape smoke:
   - build `playground/dist`
   - run proxy with `STATIC_DIR=playground/dist`
   - verify `/`, `/health`, `/__diag/static`, `/api/assistant/profiles`
6. `azure-validate` skill before any deployment execution.

After deployment:

1. `az webapp show`
2. `az webapp log tail`
3. Browser smoke for `/`, `/health`, `/__diag/static`, `/__diag/env`
4. One Ask Pulse / AI profile smoke with a non-production credential.

## Risks

- Auth is the largest blocker: App Service Easy Auth protects the host, but PulsePlay’s internal `idp` mode expects Bearer tokens, not Easy Auth headers.
- Oryx build from repo root may need root-level scripts to install/build subprojects.
- App Service ZIP/Git deploy should not include large local artifacts, secrets, or previous evidence bundles.
- Existing dirty working-tree changes must be preserved and not mixed into deployment artifacts accidentally.
- Key Vault references refresh on a schedule; app setting changes restart the app.

## Approval Request

Approve Phase 2 preparation to generate the root App Service packaging scripts, AZD/Bicep infrastructure, and Azure App Service runbook. Live Azure deployment will remain blocked until Azure context and credentials are confirmed.
