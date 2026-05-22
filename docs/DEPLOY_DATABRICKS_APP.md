# Deploy PulsePlay as a Databricks App

PulsePlay should stay an enablement layer: Databricks owns dashboards, Genie, SQL warehouses, Apps, Vector Search, Unity Catalog, permissions, and audit logs. The app deployment only hosts the PulsePlay proxy and experience shell close to those resources.

## Resource Mode

Use Databricks App resources for environment binding instead of hardcoding workspace IDs or secrets.

- `APP_RESOURCE_SQL_WAREHOUSE` maps to the SQL warehouse PulsePlay should warm, inspect, and use for metric/evidence queries.
- `APP_RESOURCE_GENIE_SPACE` maps to the default Genie Space when a profile is not otherwise configured.
- `APP_RESOURCE_AIBI_DASHBOARD_ID` maps to the default AI/BI dashboard for SDK embedding.
- `APP_RESOURCE_VECTOR_SEARCH_INDEX` maps to the approved Vector Search index when Vector Search endpoints are enabled.
- `APP_RESOURCE_METRIC_VIEW` maps to the governed UC metric view used as the semantic source.

The proxy merges those values into the active profile at startup. The `/health` response reports which `APP_RESOURCE_*` values are configured, with secret-looking names redacted.

## Live Discovery First

Before treating a capability as ready, verify it against the workspace:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/assistant/capabilities?assistantProfile=default
Invoke-RestMethod http://127.0.0.1:8787/assistant/lakeview/dashboards?assistantProfile=default
Invoke-RestMethod http://127.0.0.1:8787/assistant/genie/spaces?assistantProfile=default
Invoke-RestMethod http://127.0.0.1:8787/assistant/uc/metric-views?assistantProfile=default"&"catalog=main"&"schema=default
```

In enterprise Windows environments, Node can fail Databricks TLS with `unable to verify the first certificate` even when the OS trust store is correct. Prefer one of these before running live probes:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
# or, when the enterprise root is exported:
$env:NODE_EXTRA_CA_CERTS="C:\path\to\enterprise-root.pem"
```

If REST coverage is incomplete for a preview feature, add an admin-only CLI bridge later. Do not make the browser call the Databricks CLI or expose tokens.

## Databricks Sources Used

- [AI/BI external embedding](https://docs.databricks.com/gcp/en/dashboards/share/embedding/external-embed): external dashboard embedding uses service-principal token exchange, `/tokeninfo`, user-scoped tokens, and `@databricks/aibi-client`.
- [Genie Space iframe embedding](https://docs.databricks.com/aws/en/genie/embed): Genie iframe embed is beta, requires preview/admin allowed surfaces, and needs the Databricks-generated iframe with `allow="clipboard-write"` for full copy behavior.
- [Unity Catalog metric views](https://docs.databricks.com/aws/en/business-semantics/metric-views): metric views are the governed business-semantics layer and can be consumed by dashboards, Genie Spaces, SQL, and alerts.
- [Databricks App environment variables](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/environment-variables): app resources should be referenced through `valueFrom` instead of hardcoded secrets or resource IDs.

## Deployment Walkthrough (recorded 2026-05-22)

End-to-end recipe captured from a real Free-Edition AWS Databricks deploy. The pitfalls section below is where the time actually went — keep it open if anything misbehaves.

### Prerequisites
- Databricks CLI v0.297+ installed.
- A `.databrickscfg` profile with `host` + `token` (PAT) for the target workspace. (OAuth U2M also works but is not required for the deploy flow itself.)
- The PulsePlay repo pushed to a GitHub repository the workspace can clone.
- `playground/dist` may be `.gitignored` — the app.yaml MUST build it at startup.

### Create the app (one-shot)

```bash
databricks apps create --profile <prof> --json '{
  "name":"pulseplay",
  "description":"PulsePlay AI shell + proxy at one URL",
  "git_repository":{
    "provider":"gitHub",
    "url":"https://github.com/<org>/PulsePlay.git"
  }
}' --no-wait -o json
```

Notes:
- `name` must be in the JSON body — passing it as a positional arg with `--json` errors.
- The CLI's `git_repository` schema accepts only `provider` and `url`; **branch / ref / commit are not honored at create time** (verified via `--debug`; the CLI strips unknown fields).
- Provisioning takes ~1–3 min (URL + SP).

### Pin a specific commit at deploy time (the field name is non-obvious)

`databricks apps deploy` rejects every variant of git source field except one. The CLI's `--json` strips fields it doesn't know about, masking the schema. Probed against the REST API:

| Field path | Recognized? |
|---|---|
| `git_source.git_url` / `git_provider` / `git_commit` / `git_commit_sha` | ❌ (CLI strips them, server says "Git source reference is required") |
| `git_source.provider` / `url` / `ref` / `branch` / `revision` | ❌ |
| **`git_source.commit`** | ✅ |

Working call (we used direct REST because the CLI obscures unknown fields):

```powershell
$body = '{"git_source":{"commit":"<sha-or-short>"}}'
Invoke-RestMethod -Method Post `
  -Uri "$host/api/2.0/apps/pulseplay/deployments" `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $body -ContentType "application/json"
```

### Combined deployment (proxy + React playground at one URL)

Root `app.yaml`:

```yaml
command:
  - "bash"
  - "-c"
  - |
    set -e
    (cd playground && npm ci --no-audit --no-fund)
    (cd playground && npm run build)
    (cd proxy && npm ci --no-audit --no-fund)
    cd proxy && exec node server.js
env:
  - name: PROXY_AUTH_MODE
    value: "none"            # see pitfall #1
  - name: STATIC_DIR
    value: "playground/dist" # see pitfall #2
```

The proxy's `STATIC_DIR` middleware ([proxy/server.js](../proxy/server.js)) serves the Vite build and falls back to `index.html` for client-side routing.

## Pitfalls That Will Bite You (each one cost real time)

### 1. `NODE_ENV=production` + missing `PROXY_AUTH_MODE` = instant crash

The proxy calls `assertProductionAuthConfig()` at startup. If `NODE_ENV=production` is set **and** `PROXY_AUTH_MODE` is absent (defaults to `none`), it `process.exit(1)`s with "PROXY_AUTH_MODE=none is refused when NODE_ENV=production". The Databricks App reports SUCCEEDED for the deploy (the start command did run) but app_status flips to **CRASHED** within seconds.

Fix: set an explicit `PROXY_AUTH_MODE` in app.yaml — `none` is acceptable for Databricks-Apps-hosted because the platform OAuth gate already authenticates every request; switch to `shared-key` or `idp` for non-Databricks hosts.

### 2. `STATIC_DIR` path resolution doesn't behave like CWD-relative

The proxy resolves `STATIC_DIR` as `path.resolve(__dirname, '..', $STATIC_DIR)` where `__dirname` is the `proxy/` folder. That means:

| Value | Resolves to |
|---|---|
| `playground/dist` | `<repo>/playground/dist` ✅ |
| `../playground/dist` | `/playground/dist` (escapes the repo!) ❌ |
| absolute path | the absolute path verbatim ✅ |

Don't use `..` in STATIC_DIR — it's already implicit.

### 3. Hyper-strict global CSP nukes the React app silently

[proxy/server.js](../proxy/server.js) applies `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` to every response. That's the correct posture for a JSON-only API but it **blocks every subresource** when the same proxy serves HTML — meaning the React playground returns a blank page even though the JS bundle URLs work fine on direct fetch.

The static-serve middleware now sets a permissive CSP via `express.static`'s `setHeaders` and the SPA fallback re-applies it before `sendFile`. If you add new static surfaces, make sure they override the global CSP.

### 4. Vite's `/api/*` rewrite has no equivalent in production same-origin

The playground bundles fetch URLs like `/api/assistant/profiles`. In dev, Vite proxies `/api/*` → `127.0.0.1:8787/*`. On a combined deploy there is no Vite — so every call 500s and the React app silently crashes during init (blank page #2).

The proxy now strips the `/api/` prefix in a global middleware before route resolution. The proxy's own routes stay un-prefixed; the rewrite is a no-op for direct API consumers.

### 5. Free Edition caps the workspace at **one** app

`Error: Workspace ... has reached the maximum limit of 1 apps.` Delete the existing app (or repoint it) before creating a new one. Two-app deployments need a paid tier.

### 6. Workspace-files / local-sync deploys are blocked

`Error: Apps in this workspace can only be deployed from Git.` On Free Edition you cannot `databricks apps deploy` from a local path — you must point at a Git repo. Use a private repo if the codebase has sensitive files (the proxy/config.json should be `.gitignored` regardless).

### 7. `crossorigin` on Vite-emitted `<script type="module">` isn't the problem

Tempting to blame the `crossorigin` attribute Vite adds to module preloads (CORS-mode fetches don't send cookies → platform auth blocks the asset). Empirically: **same-origin module fetches work fine** through the Databricks Apps OAuth proxy with the standard session cookie. The blank page is always CSP or `/api/` related — don't go chasing CORS.

### 8. The `databricks apps logs` CLI command requires OAuth U2M auth

PAT bearer tokens can't fetch app logs (`OAuth Token not supported for current auth type pat`). Either set up a U2M profile via `databricks auth login` (browser OAuth flow), or use the workspace UI at `https://<host>/apps/<app-name>` for logs. Note: `/api/2.0/apps/<app>/logs` is not a public REST path — there is no PAT-friendly log fetch.

### 9. Diagnostic endpoint is worth its weight

When the app crashes or returns blank, adding a thin `GET /__diag/static` route that returns `{ cwd, __dirname, STATIC_DIR_env, resolved_path, exists, index_html_tags, assets }` cuts diagnosis from a series of redeploys to a single browser open. Live in [proxy/server.js](../proxy/server.js) under the static-serve block. Keep it; cost is negligible and the next debug session will need it.

### 10. Auth-gated app URLs reject PAT for the hosted URL itself

`https://pulseplay-<workspaceId>.aws.databricksapps.com/...` will always return the Databricks sign-in page for un-cookied requests (curl with PAT included). Smoke-testing from a CLI is only possible against the management API (`/api/2.0/apps/<name>`), not the app's serve URL. The user must verify the hosted UI from a logged-in browser.

### 11. `resources:` in `app.yaml` is **decorative** — bind via API instead

Declaring `resources: [...]` at the top of `app.yaml` does NOT actually create resource bindings. The block is silently dropped on deploy. Symptom: every env var that uses `valueFrom: <resource-name>` simply doesn't appear in `process.env` at runtime — and Databricks logs nothing about the missing binding.

Verify with `databricks apps get <name> -o json | jq .resources` after deploy: if it's `null`, the binding didn't happen. The fix is a PATCH to the management API with the full app body including the `resources` array:

```powershell
$body = @{
  name        = "pulseplay"
  description = "..."
  git_repository = @{ provider = "gitHub"; url = "https://github.com/<org>/<repo>.git" }
  resources   = @(
    @{
      name        = "databricks-pat"
      description = "..."
      secret      = @{ scope = "pulseplay"; key = "databricks_pat"; permission = "READ" }
    }
  )
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Patch -Uri "$host/api/2.0/apps/<name>" `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $body -ContentType "application/json"
```

After patching, **trigger a fresh deployment** so the new container picks up the env-var binding — existing containers won't get the new env retroactively.

### 12. PATCH on apps requires the FULL body, not a partial

Sending just `{"resources": [...]}` returns:

```
400 INVALID_PARAMETER_VALUE
Git repository is required for Databricks Apps in this workspace.
```

Even though `git_repository` is already set, PATCH treats it like PUT. Always include `name`, `description`, `git_repository`, and any other required fields when updating.

### 13. Diagnostic endpoint pattern, extended to env

Mirroring `/__diag/static`, add `/__diag/env` that returns the resolved env-var KEYS your app cares about (TOKEN fields → length only, NEVER value; non-secret fields → full value). Cuts the "did the secret bind?" question to one browser open. Worth the 20 lines.

```js
app.get('/__diag/env', (req, res) => {
    const out = { profile_env: {}, app_resource_env: {}, has_DATABRICKS_TOKEN: !!process.env.DATABRICKS_TOKEN };
    const TOKEN_FIELDS = new Set(['TOKEN', 'CLIENT_SECRET', 'PROXY_KEY', 'AAD_CLIENT_SECRET']);
    for (const [k, v] of Object.entries(process.env)) {
        if (k.startsWith('PROXY_PROFILE_')) {
            const field = k.split('_').slice(3).join('_');
            if (TOKEN_FIELDS.has(field)) {
                out.profile_env[k] = { length: String(v || '').length, preview: v ? `${String(v).slice(0,4)}…` : '(empty)' };
            } else {
                out.profile_env[k] = String(v || '');
            }
        } else if (k.startsWith('APP_RESOURCE_')) {
            out.app_resource_env[k] = String(v || '');
        }
    }
    res.json(out);
});
```

### 14. `DATABRICKS_TOKEN` is NOT auto-injected on Free Edition

The Databricks Apps platform reportedly injects `DATABRICKS_TOKEN` at runtime so the app SP can call workspace APIs using its own identity. On Free Edition workspaces (`*.aws.databricksapps.com`), the diag shows `has_DATABRICKS_TOKEN: false` even after the app SP is created. Don't rely on this auto-injection; provision a secret-scope PAT and bind it explicitly.

### 15. Secret scope ACL: app SP needs READ via its `application_id` GUID

`databricks secrets put-acl <scope> <principal> READ` accepts the SP's `service_principal_client_id` (the GUID like `67eeb8e6-...`). Verify with `databricks secrets list-acls <scope>`. The user creating the scope gets `MANAGE` automatically; the app needs an explicit `READ` row.

### 16. Verify the wire-up via env diag BEFORE chasing the Settings UI

When a profile shows "Missing required field: token" in the Settings UI, the temptation is to check the proxy code. Always hit `/__diag/env` first. If the `PROXY_PROFILE_<NAME>_TOKEN` key is absent from `profile_env`, the binding never reached the container — fix at the Databricks Apps resources layer, not in the proxy. If it's present with `length: 0`, the secret resolved to empty — fix at the secret scope. If it's present with the right length, the bug is in the proxy's profile merger.
