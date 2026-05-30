# Azure App Service Deployment Findings For PulsePlay - 2026-05-22

## Executive Bottom Line

Azure App Service is a viable host for PulsePlay, but it is not a one-click win yet. The clean path is a staged, cost-gated deployment of one Linux App Service that serves the Vite-built React app and the Express proxy from the same origin. That shape matches the working Databricks Apps pattern and avoids CORS/token-forwarding complexity during the first Azure proof.

The blockers are specific and manageable:

1. PulsePlay does not yet have a root App Service package shape: no root `package.json`, no `azure.yaml`, no `infra/`, no Dockerfile, and no curated ZIP build script.
2. App Service Easy Auth is not the same as PulsePlay proxy auth. Easy Auth can gate browser access, but the proxy currently authorizes cost-bearing routes through `PROXY_AUTH_MODE` and, in `idp` mode, verified Bearer JWTs.
3. The personal Azure subscription is connected through VS Code Azure tooling and appears empty, but the Azure CLI path is still blocked locally. Remaining free credit was not queried, so Azure Portal Cost Management is still the source of truth before any spend.
4. A free-tier smoke may work, but F1 is a proof-only target with tight CPU/storage limits. B1 Basic is the lowest sensible paid App Service tier for a usable personal sandbox, and it should be timeboxed with budget alerts.

No Azure resource was created, changed, started, deployed, or deleted during this research pass.

## Research Method

This packet consolidates four parallel research agents plus local source inspection and official documentation checks.

| Agent slice | Scope | Result |
|---|---|---|
| Repo readiness | PulsePlay package/runtime scan | Found App Service package gaps, runtime strengths, required env vars, and production blockers. |
| Microsoft docs | Current App Service guidance | Verified plan tiers, Node startup, ZIP deploy, app settings, Easy Auth, Key Vault, logs, and free-account guardrails. |
| Azure account guardrails | Connectivity/cost posture | Confirmed VS Code Azure inventory findings, CLI blockage, empty resource footprint, and no-spend gates. |
| Enterprise security/auth | App Service vs Databricks Apps | Confirmed Easy Auth/proxy-auth mismatch, Key Vault/managed identity requirements, diagnostics and networking concerns. |

## Current Azure Account State

The usable Azure connection is the VS Code Azure extension / Azure MCP path, not the plain `az` CLI path from this shell.

| Item | Finding |
|---|---|
| Subscription | `Azure subscription 1` |
| Subscription ID | `1ae0670a-e564-439b-93d1-ad2115aee5df` |
| Tenant ID | `2b983dc1-08a4-4b13-87d9-065f8db8f99b` |
| Resource groups | None found |
| App Service web apps | None found |
| Storage accounts | None found |
| Container Apps | None found |
| Function Apps | None found |
| Cosmos DB accounts | None found |
| Cost/free-credit balance | Not queried through available tooling; must be checked in Azure Portal Cost Management before deploy. |

Interpretation: the subscription appears clean for deployed resources, so it likely is not burning deployed-resource spend. That is not the same as a billing proof. The $200 free-credit balance and spending-limit state must be checked in the portal before creating anything.

## Current PulsePlay Fit

### What Already Helps

| Capability | Evidence | Why it matters |
|---|---|---|
| Node proxy listens on platform port | `proxy/server.js` reads `PORT || DATABRICKS_APP_PORT || 8787`. | App Service can inject `PORT`; Databricks Apps injects `DATABRICKS_APP_PORT`. |
| Same-origin API paths are supported | Proxy strips `/api/` before route handling. | The built React app can keep using `/api/*` URLs when served by Express. |
| Static SPA hosting exists | `STATIC_DIR=playground/dist` serves static files and SPA fallback. | A single App Service can host frontend and proxy. |
| Azure runtime auto-hardens inline creds | `WEBSITE_SITE_NAME` causes inline credential mode to default `off`. | App Service deployments avoid accepting browser-supplied Databricks credentials by accident. |
| Databricks Apps manifest proves the combined shape | `app.yaml` builds `playground`, installs `proxy`, sets `STATIC_DIR=playground/dist`, and starts `node server.js`. | Azure can reuse the same mental model with a different package/deploy mechanism. |

### What Is Missing For A Clean Azure App Service Deploy

| Gap | Impact | Fix direction |
|---|---|---|
| No root `package.json` | Oryx/Kudu cannot reliably detect and build the monorepo from repo root. | Add root build/start scripts or create a curated ZIP deploy artifact. |
| No curated App Service package | A raw repo ZIP could include docs/evidence/local state and still miss runtime layout assumptions. | Produce a deploy folder containing `proxy/`, `playground/dist/`, `pulsepacks/`, and runtime package files only. |
| No `azure.yaml` / `infra/` | No repeatable Azure resource creation path yet. | Add AZD/Bicep after approval, not before. |
| Auth contract undecided | Production cannot honestly claim proxy-level authorization from Easy Auth alone. | Choose: frontend Entra token + `PROXY_AUTH_MODE=idp`, or a reviewed Easy Auth header trust mode. |
| Production allowlist config | `proxy/lib/allowlist.js` refuses production without org allowlist config. | Decide env-backed allowlist or production config file strategy. |
| Diagnostics exposure | `/__diag/env` masks tokens but exposes config shape and token length/preview. | Keep diagnostics behind platform auth/access restrictions or add an app-level guard before production. |

## Recommended Hosting Shape

### First Azure Proof

Use one Linux Azure App Service:

- React app built by `playground npm run build`
- Express proxy started by `node proxy/server.js`
- `STATIC_DIR=playground/dist`
- Same-origin `/api/*` calls
- App Service Authentication enabled at the edge for the lab proof
- No Front Door, private endpoint, ACR, AKS, Container Apps, deployment slots, custom domain, or paid logging add-ons in the first pass

This is the cheapest and least confusing way to test whether PulsePlay can run on App Service without mixing in enterprise edge architecture.

### Enterprise Shape Later

Once the first proof is green, the enterprise shape can split concerns:

- Frontend on Static Web Apps, Storage + Front Door, or App Service static serving.
- Proxy on App Service or Container Apps.
- Entra token flow to the proxy.
- Key Vault references with managed identity.
- Application Insights/Azure Monitor with caps.
- Access restrictions, private endpoints, VNet integration, and WAF only when the enterprise network requirement is real.

## Databricks Apps vs Azure App Service

| Area | Databricks Apps | Azure App Service | PulsePlay interpretation |
|---|---|---|---|
| Best first governed host | Strong when users/data/Genie/SQL/UC live in Databricks. | Strong when Azure-native edge controls and enterprise web hosting matter most. | Databricks Apps remains the better Databricks-native pilot. App Service is the Azure hosting proof. |
| Auth | Databricks OAuth, app authorization, user authorization public preview. | Easy Auth with Entra and injected identity/token headers. | Both still need explicit PulsePlay proxy wiring for per-user authorization. |
| Secrets | `app.yaml` `valueFrom` resources / secret scopes. | App settings initially; Key Vault references for production. | Never hardcode Databricks tokens in source or frontend config. |
| Network | Databricks network policies, IP lists, front-end private connectivity, NCC/private endpoints. | App Service access restrictions, VNet integration, private endpoints, Front Door/WAF. | Choose based on which platform owns the enterprise edge. |
| Packaging | `app.yaml` command does install/build/start. | Oryx/Kudu/ZIP package/startup command. | App Service needs a deliberate package artifact; Databricks already has a manifest. |

## Auth Findings

This is the most important production caveat.

App Service Easy Auth can authenticate users before requests reach the Node app and can pass identity information through App Service headers. That does not automatically satisfy PulsePlay's proxy middleware. The proxy currently has these production behaviors:

- `PROXY_AUTH_MODE=none` is refused when `NODE_ENV=production` or `PROXY_REQUIRE_AUTH=true`.
- `PROXY_AUTH_MODE=idp` requires verified `Authorization: Bearer <jwt>`.
- `PROXY_AUTH_MODE=shared-key` requires `PROXY_SHARED_KEY` / `PROXY_KEY` and is service-to-service only.
- `PROXY_AUTH_MODE=idp-or-shared-key` requires at least one of those configured paths.

Therefore:

| Deployment level | Acceptable auth story |
|---|---|
| Personal smoke | Easy Auth at the edge plus non-production proxy mode, documented honestly as edge-gated only. |
| Internal pilot | Frontend obtains an Entra access token and sends it to the proxy; proxy runs `PROXY_AUTH_MODE=idp`. |
| App Service-specific production | Add and test a trusted Easy Auth header mode that cannot be bypassed and maps headers to a normalized proxy user. |
| Enterprise gateway | Keep proxy `idp` and require the gateway/frontend to send a verifiable token. |

Do not put a shared key in the React app. Browser-visible shared keys are not production authorization.

## Cost Guardrails For The Personal Free Account

Before deployment:

1. Open Azure Portal Cost Management and confirm remaining free credit and spending-limit/pay-as-you-go state.
2. Create a budget alert before creating resources. Suggested personal thresholds: `$5`, `$10`, `$25`.
3. Choose a single region and a single resource group, for example `rg-pulseplay-appservice-lab`.
4. Start with F1 Free only if the goal is a short smoke. Use B1 Basic only with explicit timebox and cleanup.
5. Avoid cost multipliers in the first pass: Front Door, NAT Gateway, private endpoints, ACR, AKS, Container Apps, slots, autoscale, custom domains/certs, paid Log Analytics retention, and large App Insights ingestion.
6. Tag every resource with `project=PulsePlay`, `purpose=appservice-lab`, `owner=rajesh`, and `delete-after=<date>`.
7. Cleanup means deleting the App Service plan or the whole resource group. Deleting only the web app can leave a paid plan behind.

## Configuration Checklist

Minimum app settings for the first single-host proof:

| Setting | Value / note |
|---|---|
| `STATIC_DIR` | `playground/dist` |
| `PROXY_INLINE_CREDENTIALS_MODE` | `off` |
| `PROXY_PROFILE_DEFAULT_HOST` | Databricks workspace URL |
| `PROXY_PROFILE_DEFAULT_TOKEN` | Key Vault reference for anything beyond a throwaway lab |
| `PROXY_PROFILE_DEFAULT_SPACE_ID` | Default Genie Space |
| `PROXY_PROFILE_DEFAULT_WAREHOUSE_ID` | SQL warehouse for evidence/metadata |
| `PROXY_AUTH_MODE` | Deliberately chosen; do not leave ambiguous |
| `PROXY_CORS_ORIGIN` | Exact App Service origin if `NODE_ENV=production` |
| `PROXY_IDP_JWKS_URL` / `PROXY_IDP_ISSUER` / `PROXY_IDP_AUDIENCE` | Required for real `idp` mode |
| `NODE_OPTIONS` or `NODE_EXTRA_CA_CERTS` | Only if enterprise TLS inspection requires a trusted CA path |

Package contents for a curated ZIP:

| Include | Exclude |
|---|---|
| `proxy/` runtime source and `proxy/package*.json` | `proxy/config.json` |
| `proxy/node_modules` if packaging ready-to-run, or let Oryx install intentionally | Any `.env` or local token cache |
| `playground/dist/` | `playground/node_modules/` |
| `pulsepacks/` | `docs/evidence/`, exports, logs, temporary smoke output |
| Root `package.json` or root startup file if using Oryx/root detection | `.azure/azcli-session`, `.pulseplay-session.state.json` |

ZIP deploy must place app-root contents at the ZIP root, not a nested `PulsePlay/` directory.

## Clean Deployment Plan

### Phase 0 - No-spend Preparation

- Keep Azure untouched.
- Add root packaging/start scripts or a curated ZIP builder.
- Add an App Service deployment runbook section with exact package layout.
- Decide the lab auth mode and the production auth target.
- Run local production-shape smoke:
  - `npm --prefix playground run build`
  - `npm --prefix proxy test`
  - start `node proxy/server.js` with `STATIC_DIR=playground/dist`
  - check `/`, `/health`, `/__diag/static`, and one `/api/*` route

### Phase 1 - Portal-gated Azure Smoke

- User confirms portal free-credit balance.
- User approves region, resource group, SKU, and maximum spend/timebox.
- Create only App Service Plan + Web App, ideally through repeatable IaC after review.
- Deploy a curated package.
- Enable low-retention file-system logs only.
- Smoke `/`, `/health`, `/__diag/static`; keep `/__diag/env` protected.
- Delete the resource group or scale/delete the plan after the timebox if not continuing.

### Phase 2 - Internal Pilot Hardening

- Move secrets to Key Vault references.
- Enable managed identity.
- Add Application Insights with daily cap/sampling.
- Implement real proxy-level auth.
- Configure production allowlist.
- Pin CORS if split-origin.
- Add deployment slot only if the app will receive repeat deploys.

### Phase 3 - Enterprise Topology

- Decide App Service single-host vs split frontend/proxy.
- Add private networking only when enterprise routing requires it.
- Add Front Door/WAF only when custom domain, WAF policy, or global edge routing is required.
- Document runbook for deploy, rollback, log review, budget review, and cleanup.

## Approval Gates

| Gate | Required approval |
|---|---|
| A - Repo prep | Add scripts/package docs only; no Azure spend. |
| B - Azure smoke | Region, SKU, resource group, max spend, timebox, and cleanup plan. |
| C - Production auth | Token/header trust design and test plan. |
| D - Enterprise networking | Private endpoint/VNet/Front Door/WAF need an explicit enterprise requirement. |

## Official Sources

| Source | Applied finding |
|---|---|
| [Azure App Service plans](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans) | Free/Shared run on shared compute; Basic+ use dedicated compute. |
| [Azure App Service limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits) | Free CPU/storage/app limits and Linux tier support. |
| [Azure App Service Linux pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/) | F1 free and B1 sizing/cost context. |
| [Configure Node.js apps](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs) | Node dependencies, startup commands, PM2 foreground mode, Oryx build behavior. |
| [Deploy files with ZIP deploy](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip) | ZIP root layout, `/home/site/wwwroot`, Kudu, build automation, package limit. |
| [App Service app settings reference](https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings) | App settings/env vars and `SCM_DO_BUILD_DURING_DEPLOYMENT`. |
| [Configure common App Service settings](https://learn.microsoft.com/en-us/azure/app-service/configure-common) | App settings become env vars and are encrypted at rest. |
| [App Service Authentication / Easy Auth](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization) | Platform auth before app code and provider model. |
| [Access user claims in app code](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities) | Easy Auth identity headers. |
| [Managed identity for App Service](https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity) | App identity for Key Vault/Azure resource access, not end-user identity. |
| [Key Vault references](https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references) | Key Vault references, managed identity, Secrets User/Get permission, network-restricted vault concerns. |
| [App Service diagnostic logs](https://learn.microsoft.com/en-us/azure/app-service/troubleshoot-diagnostic-logs) | File-system logs, deployment logs, log stream, and log storage caveats. |
| [Avoid charges with Azure free account](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account) | $200 credit / 30-day free account guardrail. |
| [Databricks Apps authorization](https://learn.microsoft.com/azure/databricks/dev-tools/databricks-apps/auth) | App vs user authorization, UC policy enforcement, forwarded user tokens. |
| [Databricks Apps environment variables](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/environment-variables) | `app.yaml` env and `valueFrom` resources. |
| [Databricks Apps secrets](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/secrets) | Secret resource injection and per-app secret-scope guidance. |
| [Databricks Apps networking](https://learn.microsoft.com/azure/databricks/dev-tools/databricks-apps/networking) | IP lists, front-end private connectivity, NCC/network policies. |

## Local Evidence

- [.azure/deployment-plan.md](../../.azure/deployment-plan.md) - App Service plan status and current Azure inventory.
- [docs/DEPLOY_AZURE_APP_SERVICE.md](../DEPLOY_AZURE_APP_SERVICE.md) - deployer runbook and configuration challenge guide.
- [docs/DEPLOY_DATABRICKS_APP.md](../DEPLOY_DATABRICKS_APP.md) - Databricks Apps enterprise installation baseline.
- [app.yaml](../../app.yaml) - working Databricks Apps combined-host manifest.
- [proxy/server.js](../../proxy/server.js) - port, static serving, `/api` strip, CORS, auth, and diagnostic endpoint behavior.
- [proxy/lib/allowlist.js](../../proxy/lib/allowlist.js) - production allowlist startup guard.
- [proxy/lib/packRegistry.js](../../proxy/lib/packRegistry.js) - `pulsepacks/` runtime dependency.
