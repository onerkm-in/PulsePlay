# PulsePlay on Azure Databricks Apps - Enterprise Installation Guide

> **Status:** Single deployer-facing guide, refreshed 2026-05-22 after the first live PulsePlay Databricks Apps deployment.
> **Scope:** Azure Databricks Apps hosting for the combined PulsePlay React shell + Node proxy. This guide is for internal enterprise environments, not public SaaS or public OSS packaging.
> **Companion evidence:** [research/DATABRICKS_APPS_DEPLOY_LESSONS_2026-05-22.md](research/DATABRICKS_APPS_DEPLOY_LESSONS_2026-05-22.md) preserves the chronological six-hour troubleshooting trail. You should not need that file for a normal install, but it explains why the cautions below are so blunt.

## What This Installs

This path hosts PulsePlay as one Databricks App URL:

- The Databricks Apps platform authenticates the browser user with Databricks OAuth/SSO.
- The PulsePlay proxy runs inside the app container and serves both API routes and the Vite-built React app.
- The React app is served from `playground/dist` by the proxy through `STATIC_DIR=playground/dist`.
- Privileged calls to Genie, SQL Warehouses, Foundation Model endpoints, UC metric views, Vector Search, and BI token routes remain server-side.
- Secrets come from Databricks app resources / secret scopes or another approved secret manager. They are never committed to the repo and never sent to the browser.

Use this deployment when the first consumers live in Databricks and the app should sit close to Genie Spaces, Unity Catalog, SQL Warehouses, Model Serving, and Databricks-native auth. If the app needs a corporate WAF edge, custom domain governance, or a non-Databricks portal from day one, use [HOSTING_OPTIONS.md](HOSTING_OPTIONS.md) to choose an Azure split-host topology instead.

## Official Path vs PulsePlay Reality

Current Azure Databricks documentation and the May 22 PulsePlay deployment agree on the broad shape, but two details were environment-sensitive.

| Area | Current official Azure Databricks guidance | What PulsePlay observed on 2026-05-22 | Installation stance |
|---|---|---|---|
| Git deploy reference | Git deploys can target branch, tag, or commit. | The tested CLI/API path worked reliably with `git_source.commit`; other field names were silently stripped or rejected in that workspace/CLI combination. | Pin commits for reproducible enterprise deploys. Branch deploys are allowed by docs, but do not use them for promoted environments unless your CI records the resolved commit. |
| App resources | Add resources in the Databricks Apps UI or Declarative Automation Bundles; `app.yaml env[].valueFrom` references configured resource keys. | A top-level `resources:` block in `app.yaml` was ignored by raw `databricks apps deploy`; `databricks apps get` showed `resources: null` until resources were patched on the app object. | Treat app resources as workspace/app configuration, not as proof merely because `app.yaml` contains a `resources:` block. Always verify with `databricks apps get <app> -o json`. |
| App identity token | App service-principal credentials are injected for app authorization, and user authorization can forward user access tokens when enabled. | `DATABRICKS_TOKEN` was not present on the Free Edition runtime used for the first deploy. | Do not code against an assumed `DATABRICKS_TOKEN`. Use documented app SP env vars/user auth where enabled, or bind an explicit secret-backed credential as a transitional path. |

## Enterprise Prerequisites

Get these approved before the deploy window. Most hard failures yesterday were not code defects; they were platform, auth, and resource-binding assumptions.

| Owner | Required item | Notes |
|---|---|---|
| Databricks workspace admin | Premium workspace with Databricks Apps enabled in a region that supports serverless compute | Databricks Apps requires the serverless app platform. Free Edition limits differ sharply from enterprise workspaces. |
| Network/security | Browser and workspace egress can reach `*.databricksapps.com`, the Azure Databricks workspace host, the Git provider, npm registry, and any approved vendor BI APIs | Private Link and restricted-egress workspaces need explicit allowlists. |
| Identity/admin | Microsoft Entra ID/SSO, SCIM/JIT user provisioning, Databricks groups for app users and app managers | Apps cannot be anonymous/public. Use groups, not individual grants. |
| App owner | Databricks CLI configured for the target workspace | Official minimum is CLI `0.229.0+`; the PulsePlay deploy used newer CLI behavior. OAuth U2M is preferred for logs; PAT can drive management calls but not all log paths. |
| Git owner | Repo is pushed to a Git provider the app service principal can clone | Private repos require a Git credential on the app service principal. |
| Data owner | SQL Warehouse, Genie Space, UC Metric View/View/Table, Model Serving endpoint, Vector Search index, and dashboard IDs selected per environment | App resources must refer to existing resources. The app should not create production data assets. |
| Security/data platform | Unity Catalog grants, row filters, column masks, metric definitions, and warehouse permissions approved | Decide whether PulsePlay runs with app authorization, user authorization, or a transitional service credential. |
| Ops | Logging and audit path chosen | At minimum: Databricks app logs, `system.access.audit`, and PulsePlay support codes. For production: external APM/log sink or app telemetry where approved. |

## Auth Model Decision

Do this before binding resources.

| Model | Use when | Consequence |
|---|---|---|
| **App authorization** | Every user should see the same app-approved resources. | The Databricks App service principal needs least-privilege access to SQL warehouses, Genie Spaces, serving endpoints, secrets, and UC assets. |
| **User authorization** | Results must respect each viewer's Unity Catalog permissions. | Workspace admins must enable the public-preview user authorization capability, restrict scopes, and users/admins must consent. PulsePlay code must read forwarded user headers/tokens for routes that act on behalf of users. |
| **Secret-bound service credential** | Transitional deploy where app/user authorization is not yet wired for every API PulsePlay needs. | Works, but be honest: it is not per-user data authorization. Use a service principal or approved PAT stored in a Databricks secret scope, rotate it, and narrow grants. |

For the current `app.yaml`, PulsePlay sets `PROXY_AUTH_MODE=none` because the Databricks Apps platform already gates the app URL. That is acceptable only for this hosted Databricks Apps topology. For Azure App Service, Container Apps, AKS, or any externally exposed proxy host, use `PROXY_AUTH_MODE=idp` or `idp-or-shared-key` with the production IdP settings from [PROXY_REFERENCE.md](PROXY_REFERENCE.md).

## Installation Sequence

### 1. Validate locally first

Run the normal local checks before asking Databricks Apps to build the app.

```powershell
cd D:\Working_Folder\Projects\PulsePlay\proxy
npm test

cd D:\Working_Folder\Projects\PulsePlay\playground
npm run lint
npm run test
npm run build
```

If live Databricks probes fail locally with `unable to verify the first certificate`, fix Node trust before blaming PulsePlay:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
# or, when the enterprise root CA is exported:
$env:NODE_EXTRA_CA_CERTS="C:\path\to\enterprise-root.pem"
```

### 2. Prepare `app.yaml`

PulsePlay uses the root [../app.yaml](../app.yaml) as the Databricks Apps entry point. Keep these settings unless the deployment owner intentionally changes the topology:

```yaml
command:
  - "bash"
  - "-c"
  - |
    set -e
    echo "[boot] installing playground deps"
    (cd playground && npm ci --no-audit --no-fund)
    echo "[boot] building playground (vite)"
    (cd playground && npm run build)
    echo "[boot] installing proxy deps"
    (cd proxy && npm ci --no-audit --no-fund)
    echo "[boot] starting proxy with STATIC_DIR=playground/dist"
    cd proxy && exec node server.js

env:
  - name: PROXY_AUTH_MODE
    value: "none"
  - name: STATIC_DIR
    value: "playground/dist"
```

Important details:

- The proxy automatically listens on `0.0.0.0:$DATABRICKS_APP_PORT` when the Databricks Apps runtime sets the port.
- `STATIC_DIR` must be `playground/dist`, not `../playground/dist`; the proxy already resolves the path relative to the repo root.
- `exec node server.js` lets Databricks send termination signals directly to Node.
- Keep both `proxy/package-lock.json` and `playground/package-lock.json` committed because the app command uses `npm ci`.
- The top-level `resources:` block currently in [../app.yaml](../app.yaml) documents intended bindings, but raw CLI deploy did not bind it in the first PulsePlay run. The app object must still be verified after deployment.

### 3. Push the source commit

Databricks Apps clones from Git. Anything not committed is not deployed.

```powershell
git status --short
git rev-parse --short HEAD
git push origin <branch>
```

Do not commit local secret files such as `proxy/config.json`. Build artifacts such as `playground/dist` are intentionally rebuilt in the app container.

### 4. Create the app

Use a stable app name per environment, for example `pulseplay-dev`, `pulseplay-uat`, or `pulseplay-prod`.

```bash
databricks apps create --profile <profile> --json '{
  "name": "pulseplay-dev",
  "description": "PulsePlay AI shell and proxy",
  "git_repository": {
    "provider": "gitHub",
    "url": "https://github.com/<org>/PulsePlay.git"
  }
}' --no-wait -o json
```

Notes:

- Current official CLI examples also show the app name as a positional argument. The JSON-body form above matched the observed PulsePlay deploy behavior and is less ambiguous across CLI versions.
- For private repositories, configure a Git credential for the app service principal before the first Git deploy.
- Use one app per environment. Do not share a dev app and production app just by redeploying different commits.

### 5. Configure resources and secrets

Recommended enterprise path:

1. In Databricks Apps UI, open the app.
2. Add app resources for the required existing objects: SQL Warehouse, Genie Space, Model Serving endpoint, UC assets, Vector Search index, and secret entries.
3. Give each resource a stable key that matches the `valueFrom` names in `app.yaml`, for example `databricks-pat`, `sql-warehouse`, or `genie-space`.
4. Grant the app service principal only the permissions it needs.
5. Redeploy after changing resources so the new container receives the resolved env vars.

If your organization uses Declarative Automation Bundles, declare resources in `databricks.yml` and let the bundle configure environment-specific resource instances. That is the cleaner promotion path than raw app-level patching.

Fallback API patch path used during the first PulsePlay deployment:

```powershell
$host = "https://<workspace-host>"
$pat = "<workspace-admin-or-app-owner-token>"
$body = @{
  name = "pulseplay-dev"
  description = "PulsePlay AI shell and proxy"
  git_repository = @{
    provider = "gitHub"
    url = "https://github.com/<org>/PulsePlay.git"
  }
  resources = @(
    @{
      name = "databricks-pat"
      description = "Credential used by PulsePlay proxy for Databricks workspace calls"
      secret = @{
        scope = "pulseplay"
        key = "databricks_pat"
        permission = "READ"
      }
    }
  )
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Patch `
  -Uri "$host/api/2.0/apps/pulseplay-dev" `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $body `
  -ContentType "application/json"
```

The app update API behaved like a full update in the first PulsePlay run: sending only `{"resources":[...]}` failed because `git_repository` was missing. Include the full body.

For a Databricks secret-scope fallback:

```bash
databricks secrets create-scope pulseplay --profile <profile>
databricks secrets put-secret pulseplay databricks_pat --string-value <token> --profile <profile>
databricks secrets put-acl pulseplay <app-service-principal-client-id> READ --profile <profile>
databricks secrets list-acls pulseplay --profile <profile> -o json
```

Use the app service principal **client ID GUID** for the ACL, not the numeric workspace-internal service principal id.

### 6. Deploy a pinned commit

Official Databricks docs support branch, tag, or commit references for Git deploys. PulsePlay promotion should use commit SHAs for reproducibility and rollback.

```bash
databricks apps deploy pulseplay-dev \
  --profile <profile> \
  --json '{"git_source":{"commit":"<short-or-full-sha>"}}'
```

If your CLI strips fields or returns `Git source reference is required`, use the REST endpoint directly:

```powershell
$body = '{"git_source":{"commit":"<short-or-full-sha>"}}'
Invoke-RestMethod -Method Post `
  -Uri "$host/api/2.0/apps/pulseplay-dev/deployments" `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $body `
  -ContentType "application/json"
```

### 7. Poll status

```bash
databricks apps get pulseplay-dev --profile <profile> -o json
```

Required healthy state:

- `active_deployment.status.state` is `SUCCEEDED`.
- `app_status.state` is `RUNNING`.
- `compute_status.state` is `ACTIVE` or otherwise healthy for the workspace.
- `active_deployment.resolved_commit` matches the intended SHA.
- `resources` is not `null` when the app expects `valueFrom` resource bindings.

### 8. Browser smoke

Open the app URL from a normal browser session that is already allowed to sign in to Azure Databricks. Do not use curl plus PAT against the hosted app URL; the hosted URL is behind Databricks browser OAuth and returns sign-in HTML to un-cookied requests.

Smoke these URLs in order:

| URL/path | Expected result |
|---|---|
| `/` | PulsePlay shell loads; no blank page. |
| `/health` | JSON health document. Secret-looking values redacted. |
| `/__diag/static` | `exists: true`, `index_html_exists: true`, assets listed without source maps. |
| `/__diag/env` | `PROXY_PROFILE_*` keys present; token fields show length only; `APP_RESOURCE_*` keys present when configured. |
| `/assistant/profiles` | Profiles list without a 500. |
| `/assistant/capabilities?assistantProfile=default` | Capability snapshot for the configured workspace. |
| `/launchpad` | Live Databricks discovery surface loads if profile credentials are valid. |

Then run one user-level flow:

1. Select the intended BI surface.
2. Select the intended AI profile.
3. Ask a known Genie/Databricks-backed question.
4. Confirm the answer completes, the canvas renders if using the native surface, and the support/evidence tabs have request IDs.

## Enterprise Challenge Matrix

| Challenge | Common symptom | Mitigation |
|---|---|---|
| Databricks Apps not enabled or unsupported region | App creation unavailable or serverless start fails. | Confirm Premium workspace, serverless availability, and workspace preview/settings before coding. |
| Private Link or restricted egress | Deploy hangs on Git/npm or users cannot reach the app URL. | Allow approved Git host, npm registry, workspace API host, and `*.databricksapps.com`; account for SSO callback behavior in private networks. |
| Private repo without SP Git credential | Git deploy fails although the URL is correct. | Add Git credential to the app service principal; avoid personal credentials in production promotion. |
| Resource binding missing | Settings says token/profile field is missing; `/__diag/env` lacks expected keys. | Check `databricks apps get <app> -o json`; if `resources` is `null`, configure resources through UI, bundle, or full-body app update, then redeploy. |
| Secret ACL wrong principal | Env key exists but secret resolution fails or value length is zero. | Grant secret READ to the app service principal client ID GUID; verify `secrets list-acls`. |
| App permissions confused with data authorization | User can open the app but sees data they should not, or app cannot query data. | Separate app `CAN USE` from data grants. Use UC grants/row filters/column masks and choose app authorization vs user authorization intentionally. |
| `NODE_ENV=production` with `PROXY_AUTH_MODE=none` | Container starts then crashes. | In Databricks Apps, set explicit `PROXY_AUTH_MODE=none` and rely on platform OAuth. On non-Databricks hosts, configure IdP/shared-key instead. |
| Blank page, assets exist | `/` returns HTML but browser loads no JS. | Check CSP headers. PulsePlay static middleware overrides the proxy's strict API CSP for the React app. |
| Blank page, API calls fail | React bundle calls `/api/assistant/*`, proxy routes are `/assistant/*`. | PulsePlay strips `/api/` in production. Keep that middleware before route registration. |
| Static dir 500 | `/` returns a JSON proxy error. | Use `STATIC_DIR=playground/dist`; do not use `../playground/dist`. |
| Logs unavailable through PAT | `databricks apps logs` complains about token type. | Configure OAuth U2M (`databricks auth login`) or view logs in the workspace UI. |
| Enterprise TLS interception | Local or hosted Databricks API calls fail with certificate errors. | Use `NODE_OPTIONS=--use-system-ca` locally or `NODE_EXTRA_CA_CERTS`; validate enterprise CA chain in the runtime image if needed. |
| Cold starts too slow | Redeploy takes several minutes. | Keep dependency installs lean, use lockfiles, avoid startup probes that call external APIs, and move heavy checks to lazy routes. |
| App URL CLI smoke fails | Curl gets Databricks sign-in HTML. | Test management API with CLI/PAT, but test app URL in a logged-in browser. |
| Free Edition assumptions leak into enterprise | One-app limit or missing token behavior seems surprising. | Treat Free Edition observations as empirical warnings, not universal platform truth. Enterprise workspaces still need verification. |
| Heavy compute in app container | App becomes slow or unstable under load. | Follow Databricks guidance: app compute is for UI/control plane. Run SQL on SQL Warehouses, AI on Model Serving/Foundation endpoints, and batch work in Jobs. |

## Production Readiness Checklist

- [ ] Hosting choice recorded; Databricks Apps is intentionally chosen over Azure split-host.
- [ ] Separate dev/UAT/prod app instances or workspaces exist.
- [ ] Git repository and deploy reference strategy are approved; promoted deploys pin commit SHA.
- [ ] App service principal Git credential configured for private repos.
- [ ] App permissions granted to groups with `CAN USE`; `CAN MANAGE` limited to operators.
- [ ] Data/resource authorization model chosen: app authorization, user authorization, or temporary service credential.
- [ ] App resources configured and verified through `databricks apps get`.
- [ ] Secret values stored in Databricks secret scopes or approved vault; no plaintext production tokens in Git or browser config.
- [ ] UC row filters, column masks, table/view/metric grants, warehouse grants, and serving endpoint grants reviewed.
- [ ] `PROXY_AUTH_MODE` posture matches host topology.
- [ ] `/health`, `/__diag/static`, and `/__diag/env` smoke clean after deploy.
- [ ] Logs and audit queries are accessible to operators.
- [ ] Rollback is documented: redeploy previous commit SHA.
- [ ] Known non-claims are documented: this deployment proves PulsePlay hosted in Databricks Apps, not that every BI vendor SDK path or every per-user data path is production-complete.

## Official References

- [Azure Databricks Apps overview](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/)
- [Set up your Databricks Apps workspace and development environment](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/configure-env)
- [Key concepts in Databricks Apps](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/key-concepts)
- [Deploy a Databricks app](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/deploy)
- [Configure app execution with app.yaml](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/app-runtime)
- [Define environment variables in a Databricks app](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/environment-variables)
- [Add resources to a Databricks app](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/resources)
- [Configure authorization in a Databricks app](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/auth)
- [Configure permissions for a Databricks app](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/permissions)
- [Logging and monitoring for Databricks Apps](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/monitor)
- [Best practices for Databricks Apps](https://learn.microsoft.com/en-us/azure/databricks/dev-tools/databricks-apps/best-practices)
- [Azure Databricks resource limits](https://learn.microsoft.com/en-us/azure/databricks/resources/limits)
