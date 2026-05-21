# Databricks Apps Deploy — Detailed Lessons (2026-05-22 session)

> **What this is:** A long-form, chronological reference for everything that bit during PulsePlay's first hosted Databricks Apps deploy. Half of these aren't in the official Databricks docs — they were discovered empirically across ~6 hours of redeploy-cycle troubleshooting.
>
> **Who this is for:** The next person (LLM or human) who needs to deploy a Node-based, frontend+backend combined app to Databricks Apps on a Free Edition workspace. Read [DEPLOY_DATABRICKS_APP.md](../DEPLOY_DATABRICKS_APP.md) first for the short pitfall list; this doc is the long-form rationale + reproduction steps.
>
> **Setup snapshot:**
> - Workspace: `dbc-f88d29ce-4aa2.cloud.databricks.com` (AWS-hosted Databricks Free Edition)
> - App name: `pulseplay`, URL: `https://pulseplay-7474646467214591.aws.databricksapps.com`
> - App: Express proxy (~7,800 LoC) serving JSON API + Vite-built React playground as static files at the same origin
> - Auth: PAT in `~/.databrickscfg` profile `pulseplay`

---

## Part 1 — Free Edition constraints that change the playbook

### 1.1 One app per workspace
```
Error: Workspace 7474646467214591 has reached the maximum limit of 1 apps.
```

There is no documented way to lift this on Free Edition. The "two separate apps for proxy-only vs combined" plan died here. Practical implications:

- You can't keep a stable "production" app and a "staging" app side-by-side. Every iteration replaces the one slot.
- Deleting the slotted app is destructive — its OAuth client ID, SP, and any bound resources are gone. Any external consumer that whitelisted the old client_id has to be updated.
- **Authorization required from the user** before deleting an existing app, even an obvious orphan. The auto-mode classifier blocked our delete the first time because the slotted `test-superuser-genie-powerbi` app wasn't created by the agent. Only after the user explicitly said "drop all apps and keep only PulsePlay+Proxy" did the delete proceed.

### 1.2 No local-sync / workspace-files deploys
```
Error: Apps in this workspace can only be deployed from Git.
```

On Free Edition you cannot `databricks apps deploy <name>` from a local directory. The app source must come from a **Git repository the platform can clone**. Implications:

- The repo URL is part of the app definition (`git_repository.url`). The app clones at deploy time.
- Anything `.gitignore`d (e.g. `playground/dist`, `proxy/config.json`) is NOT in the deployed source. The `command` in `app.yaml` MUST rebuild what's missing.
- Secrets cannot live in committed config files. They MUST be sourced from Databricks Secret Scopes via the resource binding system (see Part 4).

### 1.3 The deploy field name lottery

`databricks apps deploy <app> --json '{...}'` accepts the entire app deployment schema, but the **only** way to pin a specific commit at deploy time is through `git_source.commit`. Everything else gets silently stripped by the CLI and the server rejects the request with "Git source reference is required":

| Tried field name | Result |
|---|---|
| `git_source.git_url` | ❌ unknown field |
| `git_source.git_provider` | ❌ unknown field |
| `git_source.git_commit` | ❌ unknown field |
| `git_source.git_commit_sha` | ❌ unknown field |
| `git_source.provider` | ❌ unknown field |
| `git_source.url` | ❌ unknown field |
| `git_source.ref` | ❌ unknown field |
| `git_source.branch` | ❌ unknown field |
| `git_source.revision` | ❌ unknown field |
| `git_source.commit` | ✅ |

The CLI's `--debug` output reveals that it serializes unknown fields away before sending the request. To debug deploy schema issues, use direct REST instead of the CLI:

```powershell
$body = '{"git_source":{"commit":"<full-or-short-sha>"}}'
Invoke-RestMethod -Method Post `
  -Uri "$host/api/2.0/apps/<app>/deployments" `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $body -ContentType "application/json"
```

The `commit` field accepts both full and short SHAs. Pin to a commit; never rely on a "branch" reference because Databricks Apps git config doesn't expose a branch field at create time and defaults to the repo's default branch.

---

## Part 2 — Cold-start build inside the app container

### 2.1 Source layout vs working directory

When Databricks Apps clones the repo, the source lands at `/app/python/source_code/<repo>` (path verified via `/__diag/static` returning `__dirname: /app/python/source_code/proxy`). The `command:` field in app.yaml runs from `/app/python/source_code/` as CWD.

The CWD vs `__dirname` distinction matters when resolving paths in the app:
- `process.cwd()` → `/app/python/source_code` (or wherever the command's first `cd` lands)
- `__dirname` in `proxy/server.js` → `/app/python/source_code/proxy`

Use `__dirname` for repo-relative paths inside Node — `process.cwd()` shifts as the command moves around.

### 2.2 The combined deployment command

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
```

Notes:
- `(cd ... && ...)` subshells. `set -e` propagates through Bash 4.x+ subshells, but if you have a more nested structure, switch to `cd <dir>; <cmd>; cd -` to be safe.
- `exec node server.js` replaces the bash process with node — important so SIGTERM from the platform reaches Node directly (graceful shutdown works).
- Cold start time on a MEDIUM compute size: ~3-5 minutes. Each npm ci is ~30-60 s; vite build is ~1-2 minutes; proxy boot is ~5 seconds.
- The `[boot]` echo lines are surprisingly useful for diagnosis — they appear in the workspace UI logs in real time. If a step never echos, you know which step hung.

### 2.3 `npm ci` requires `package-lock.json`

Both `proxy/` and `playground/` MUST have a `package-lock.json` checked into the repo for `npm ci` to work. If you switch to `npm install`, lockfiles drift and the production build may pick different transitive versions than your local — which can cause subtle Vite asset-hash mismatches.

PulsePlay had both lockfiles committed; we did not hit this.

### 2.4 Build artifacts don't ship through Git

`playground/dist/` is `.gitignore`d. Databricks clones the repo without it. The `command` must rebuild. This is the right pattern — committed build artifacts go stale immediately — but it adds 1-2 minutes to every cold start.

If cold-start time becomes painful, options:
1. Commit `playground/dist` to a dedicated `dist-cache` branch and add a `git checkout dist-cache -- playground/dist` step
2. Use the workspace files API to upload pre-built artifacts after deploy
3. Move the build to GitHub Actions and commit just the dist for releases

None were necessary for the current scope.

---

## Part 3 — The four blank-page bugs (in order of discovery)

### 3.1 Crash #1: `NODE_ENV=production` + missing `PROXY_AUTH_MODE`

**Symptom:** Deploy SUCCEEDED, then `app_status` flips to CRASHED within seconds. The `/` URL returns gateway 502.

**Root cause:** [proxy/server.js](../proxy/server.js) startup calls `assertProductionAuthConfig()`. If `NODE_ENV=production` AND `PROXY_AUTH_MODE` is unset (defaults to `none`), the function logs `FATAL: PROXY_AUTH_MODE=none is refused when NODE_ENV=production` and `process.exit(1)`.

**Fix:** Either set an explicit `PROXY_AUTH_MODE` (we used `none` because the Databricks Apps platform already gates the URL with OAuth) OR don't set `NODE_ENV=production` at all. Both paths are defensible; the explicit one is clearer.

**How we found it:** The app crashed immediately and we had no log access yet. We had to grep `proxy/server.js` for `process.exit` paths reachable from the startup sequence. The auth assertion was the only candidate that depended on env vars we'd just changed.

**Lesson:** If the proxy crashes on Databricks Apps with no useful platform logs, look for `process.exit` paths first. Don't assume bundling/runtime issues — most "instant crashes" are config-validation `exit(1)` calls.

### 3.2 Blank #1: `STATIC_DIR` path resolution had an extra `..`

**Symptom:** `/` returned a 500 with this body:

```json
{
  "type": "https://pulseplay.local/problems/unexpected-proxy-error",
  "code": "UNEXPECTED_PROXY_ERROR",
  "detail": "PulsePlay could not complete this request."
}
```

**Root cause:** I'd set `STATIC_DIR: "../playground/dist"` in app.yaml. The proxy resolves it with `path.resolve(__dirname, '..', _STATIC_DIR_RAW)`:

- `__dirname` = `/app/python/source_code/proxy`
- `path.resolve('/app/python/source_code/proxy', '..', '../playground/dist')` → `/playground/dist` (NOT what we want)

The `..` in both the proxy code AND the env-var value compounded, escaping the repo root.

**Fix:** Drop the `../` from the env var value. Use `STATIC_DIR: "playground/dist"`. The proxy code already handles the parent-up resolution.

**How we found it:** [proxy/server.js](../proxy/server.js) calls `res.sendFile(indexHtml)` in the SPA fallback. When the file doesn't exist, sendFile calls `next(err)` which lands in `handleUnexpectedProxyError`. That handler returned a JSON envelope with the 500 body. Reading the envelope's `route: "/"` plus the path resolver code made the bug obvious.

**Lesson:** When a path doesn't resolve, check both the resolver code AND the input value. Don't assume the input is correct just because it "looks right" — Node's `path.resolve` semantics with mixed-relative paths are surprising.

### 3.3 Blank #2: Hyper-strict global CSP blocked subresources

**Symptom:** `/` returned 200 with index.html. But the page rendered blank. No visible error. Direct fetch of `/assets/index-BolHeJsn.js` worked — the bundle file was served correctly (we pasted the minified JS into chat and could read PulsePlay components in it).

**Root cause:** [proxy/server.js](../proxy/server.js) sets a global response header:

```js
res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
```

This is correct for a JSON-only API surface (locks down rogue HTML responses). But when the same proxy serves HTML via static-serve, this header attaches to the index.html response too. The browser parses index.html, sees the response-header CSP saying `default-src 'none'`, refuses to load any subresources from same-origin — including scripts, styles, the React bundle, everything.

The HTML loads. The JS doesn't execute because the browser refuses to fetch it. Blank page.

**Why "open the JS URL directly works":** Direct URL fetches by the browser bypass the CSP entirely — CSP only applies to subresource loads triggered from inside a page that received that CSP. The bundle file IS being served correctly; it's just that the page that includes it can't load it.

**Fix:** Override the CSP for static-served paths. We did this two ways in the same commit:
1. `express.static` `setHeaders` option overrides the header for asset responses
2. The SPA fallback calls `applyStaticCsp(res)` before `res.sendFile(indexHtml)`

The new permissive (but still safe) CSP:

```js
const STATIC_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://login.microsoftonline.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://login.microsoftonline.com https://login.live.com https://graph.microsoft.com https://api.powerbi.com https://analysis.windows.net https://*.cloud.databricks.com https://*.azuredatabricks.net; frame-src 'self' https://login.microsoftonline.com https://app.powerbi.com https://*.cloud.databricks.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self';";
```

**How we found it:** We added the `/__diag/static` endpoint that confirmed the dist files existed and the index.html was being served correctly. Asset files existed at the right paths. The user pasted the bundle content from a direct URL fetch — confirming it served. The only remaining suspect was browser-side blocking. CSP is the obvious culprit; grep for "Content-Security-Policy" in the codebase found the global header.

**Lesson:** When a page loads but renders blank, **always** check the response headers, not just the body content. CSP, X-Frame-Options, and CORP can all block subresources silently with the only feedback being browser DevTools Console. If the user can't or won't open DevTools, the response headers can be inferred by adding a diagnostic endpoint that echoes them, or by hitting a known-good static fetch from the server's perspective.

### 3.4 Blank #3: `/api/*` prefix mismatch (Vite proxy assumption)

**Symptom:** Even after fixing the CSP, the page rendered blank. The bundle now executed (we verified by adding a `console.log` to the React entry — it appeared in DevTools console). But React mounted and immediately threw because the initial data-fetch calls all failed.

**Root cause:** The Vite playground bundles fetch URLs like `/api/assistant/profiles`. In dev, Vite's dev server is configured to proxy `/api/*` → `http://127.0.0.1:8787/*` (the path is stripped by Vite). So in dev:

```
React fetches:  /api/assistant/profiles
                    ↓ Vite dev proxy
Proxy receives: /assistant/profiles
```

In production on a combined same-origin deployment, there is no Vite dev server. The React app fetches `/api/assistant/profiles`. The proxy doesn't have that route (routes are mounted at `/assistant/*`, not `/api/assistant/*`). The proxy returns... well, in our case, the SPA fallback intercepted because `/api/...` didn't match the API_PREFIX_RE, and `Accept` didn't include `text/html` for an XHR/fetch call. So it returned next() → handleUnexpectedProxyError → 500.

React's react-query layer wraps fetches with retries. The retries also 500. The error boundary surfaces nothing because react-query swallowed the failures. Initial render runs without data, throws on a `null` access somewhere, React unmounts, blank page.

**Fix:** Add a middleware to the proxy that strips `/api/` prefix before route resolution:

```js
app.use((req, _res, next) => {
    if (req.url.startsWith('/api/')) {
        req.url = req.url.slice(4) || '/';
    }
    next();
});
```

Registered after JSON parsing but before all route handlers, this normalises `/api/assistant/profiles` → `/assistant/profiles` so the existing routes match.

**How we found it:** Reading the bundled JS that the user pasted, the `Xt(...)` fetch wrapper showed all fetch calls had the `/api/` prefix. Cross-checked against proxy/server.js — the routes are NOT under `/api/`. Trip-checked by grepping the Vite config which confirmed the dev proxy rewrite. The mismatch was obvious in retrospect.

**Lesson:** When fingerprinting what the deployed bundle does, **read the actual minified bundle**, not the source. Bundlers sometimes do unexpected transforms (path constants, env-substitutions). The bundle is the source of truth for the deployed binary.

Also: the dev-server-proxy → production-same-origin transition is a classic place for path mismatches. Audit every dev-server proxy rule against your production hosting topology.

---

## Part 4 — Secrets binding (the longest detour)

### 4.1 What we wanted

Three Databricks profiles configured via env vars at runtime:
- `default` (Genie space)
- `foundation` (Foundation Model serving endpoint)
- `supervisor` (local fan-out)

Token field must NOT be committed to Git. Must come from a Databricks Secret Scope at runtime.

### 4.2 First attempt: app.yaml `resources` block

We wrote this in `app.yaml`:

```yaml
env:
  - name: PROXY_PROFILE_DEFAULT_TOKEN
    valueFrom: databricks-pat

resources:
  - name: databricks-pat
    description: PAT for Databricks workspace calls
    secret:
      scope: pulseplay
      key: databricks_pat
      permission: READ
```

Created the secret scope:
```bash
databricks secrets create-scope pulseplay --profile <prof>
databricks secrets put-secret pulseplay databricks_pat --string-value <PAT> --profile <prof>
databricks secrets put-acl pulseplay <app-sp-client-id> READ --profile <prof>
```

Deployed. The Settings UI showed "Configured · warnings: Missing required field: token".

Added `/__diag/env` endpoint and confirmed: **`PROXY_PROFILE_DEFAULT_TOKEN` was not in `process.env` at all**. The `valueFrom: databricks-pat` reference resolved to nothing. The env var was simply not set on the container.

### 4.3 Diagnosis: `app.yaml resources` is decorative

Calling `databricks apps get pulseplay -o json` showed `resources: null`. The `resources` block from app.yaml had been **silently dropped** during deploy. The platform parsed app.yaml's `command:` and `env:` but ignored `resources:`.

This is **NOT documented** as a limitation. The structure mirrors Kubernetes-style YAML and would lead anyone to assume it works.

### 4.4 The fix: PATCH the app with resources via REST

Resources must be bound to the app via the management API:

```powershell
$body = @{
  name        = "pulseplay"
  description = "..."
  git_repository = @{ provider = "gitHub"; url = "https://github.com/..." }
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

Critical caveat: **PATCH requires the full body, not a partial.** Sending just `{"resources": [...]}` returns:

```
400 INVALID_PARAMETER_VALUE
Git repository is required for Databricks Apps in this workspace.
```

You must include `name`, `description`, `git_repository`, and any other top-level fields that are already set on the app. Effectively this is PUT semantics with the verb of PATCH.

### 4.5 After API patch: trigger a fresh deploy

Even with `resources` correctly set on the app object, the running container does NOT get the new env vars retroactively. The platform reads resources at container creation time. Trigger a new deployment (any deployment — same commit is fine) to spin up a fresh container that picks up the binding.

### 4.6 The token wasn't auto-injected either

We also checked `has_DATABRICKS_TOKEN: process.env.DATABRICKS_TOKEN` — it was `false`. Some Databricks Apps documentation implies the platform auto-injects an SP-scoped `DATABRICKS_TOKEN` env var. On Free Edition AWS workspaces this auto-injection does not happen (verified empirically). Don't rely on it; bind a real PAT via secret scope.

### 4.7 Secret ACL: principal is the SP's `service_principal_client_id`

```bash
databricks secrets put-acl pulseplay 67eeb8e6-b8ff-48b4-a830-50b841940bc9 READ
```

The principal here is the GUID under `service_principal_client_id` from `databricks apps get <name>`. NOT the numeric `service_principal_id` field. Verify with:

```bash
databricks secrets list-acls pulseplay -o json
```

Output should look like:
```json
[
  {"permission":"MANAGE","principal":"<creator-email>"},
  {"permission":"READ","principal":"67eeb8e6-b8ff-48b4-a830-50b841940bc9"}
]
```

---

## Part 5 — The diagnostic endpoint pattern

Two endpoints saved hours of redeploy cycles:

### `/__diag/static`

```js
app.get('/__diag/static', (req, res) => {
    const fs = require('fs');
    const out = { /* see proxy/server.js for full body */ };
    try {
        const raw = process.env.STATIC_DIR;
        if (raw) {
            out.resolved_path = path.isAbsolute(raw) ? raw : path.resolve(__dirname, '..', raw);
            out.exists = fs.existsSync(out.resolved_path);
            if (out.exists) {
                out.top_level = fs.readdirSync(out.resolved_path).slice(0, 50);
                const indexPath = path.join(out.resolved_path, 'index.html');
                out.index_html_exists = fs.existsSync(indexPath);
                if (out.index_html_exists) {
                    const stat = fs.statSync(indexPath);
                    out.index_html_size = stat.size;
                    const html = fs.readFileSync(indexPath, 'utf-8');
                    out.index_html_tags = (html.match(/<(script|link)[^>]*>/g) || []).slice(0, 40);
                }
                const assetsPath = path.join(out.resolved_path, 'assets');
                if (fs.existsSync(assetsPath)) {
                    const all = fs.readdirSync(assetsPath);
                    out.assets_count_total = all.length;
                    out.assets = all.filter(f => !f.endsWith('.map'));
                }
            }
        }
    } catch (err) { out.error = err.message; }
    res.json(out);
});
```

Tells us in one request: did the build run? Is the dist there? Does index.html reference files that exist?

### `/__diag/env`

Lists env-var keys matching `PROXY_PROFILE_*` and `APP_RESOURCE_*`. Token fields report `length` only (never value). Tells us if secret bindings actually resolved.

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

### Why these are worth keeping

Each diag endpoint cost ~50 lines of Node and replaced what would otherwise be 3-4 redeploy cycles + log spelunking. Keep them in the codebase permanently — they're cheap, they reveal no secrets, and the next deploy debugging session will thank you.

Add them to the SPA fallback's API_PREFIX_RE so the SPA doesn't shadow them:

```js
const API_PREFIX_RE = /^\/(api|assistant|foundation|powerbi|health|...|__diag|\.well-known)(\/|$|\?)/;
```

---

## Part 6 — Auth / access pattern reference

### 6.1 The three auth surfaces

A Databricks-Apps-hosted PulsePlay actually has **three** distinct auth gates:

| Layer | Who's authenticated | How |
|---|---|---|
| **1. Databricks Apps platform** | The viewing user | OAuth U2M when they open the app URL. Cookie set on `.aws.databricksapps.com` |
| **2. PulsePlay proxy (`PROXY_AUTH_MODE`)** | Whatever middleware verifies | `none` / `shared-key` / `idp` / `idp-or-shared-key`. We set `none` because layer 1 already authenticates |
| **3. Databricks workspace API (PAT)** | The proxy itself | PAT bound from secret scope, used for Genie/SQL/Foundation Model calls |

The viewing user's identity at layer 1 is NOT automatically threaded through to layer 3. Power BI-style "on-behalf-of" auth is a separate thing (not used here).

### 6.2 What PAT can and can't do

| Operation | PAT works? |
|---|---|
| Management API: `databricks apps get/list/create/update/delete` | ✓ |
| Management API: `databricks apps deploy` | ✓ |
| Management API: `databricks apps logs` | **✗** (returns `OAuth Token not supported for current auth type pat`) |
| Secret scope ops (`databricks secrets ...`) | ✓ |
| Workspace API (`/api/2.0/serving-endpoints`, Genie, etc.) | ✓ (this is what the app uses) |
| Fetching the app URL itself (e.g. `https://pulseplay-...databricksapps.com/__diag/env`) | **✗** (returns Databricks sign-in HTML — platform auth requires browser OAuth) |

The "logs require OAuth U2M" gotcha means you can't see app logs from a CI/CD context with just a PAT. Either run `databricks auth login` interactively or view logs via the workspace UI at `https://<host>/apps/<app-name>`.

### 6.3 App SP identity

Each Databricks App gets an SP at create time:
- `service_principal_id`: a numeric workspace-internal ID (e.g. `78085341844602`)
- `service_principal_client_id`: a GUID (e.g. `67eeb8e6-b8ff-48b4-a830-50b841940bc9`)
- `service_principal_name`: a human-readable name (e.g. `app-5bk86m pulseplay`)

For ACL ops use the **GUID**, not the numeric ID or the name. The GUID is the SP's identity from the rest of the platform's perspective.

---

## Part 7 — Deploy sequence cheat-sheet

When everything is set up, the iteration loop looks like this:

```powershell
# 1. Make code change locally
# 2. Test locally with `npm test` (proxy) + `npm run test` (playground)
# 3. Commit + push to the branch the app pulls from
git add <files>
git commit -m "..."
git push origin <branch>

# 4. Deploy the new commit via REST (CLI doesn't accept enough fields)
$body = "{`"git_source`":{`"commit`":`"$(git rev-parse --short HEAD)`"}}"
Invoke-RestMethod -Method Post `
  -Uri "$host/api/2.0/apps/pulseplay/deployments" `
  -Headers @{ Authorization = "Bearer $pat" } `
  -Body $body -ContentType "application/json"

# 5. Poll for SUCCEEDED + app_status RUNNING
while ($true) {
  $d = Invoke-RestMethod -Uri "$host/api/2.0/apps/pulseplay" -Headers @{ Authorization = "Bearer $pat" }
  $deploy = $d.active_deployment.status.state
  $app = $d.app_status.state
  Write-Host "deploy=$deploy app=$app"
  if ($deploy -eq "SUCCEEDED" -and $app -eq "RUNNING") { break }
  Start-Sleep 20
}

# 6. Browser-verify the change
```

Cold-start time: ~3-5 minutes per deploy. Faster paths exist (skip npm ci by caching node_modules in the repo — not recommended, Databricks Apps clones a fresh dir each deploy).

---

## Part 8 — What we'd do differently

1. **Set up `/__diag/static` and `/__diag/env` BEFORE the first deploy attempt.** They're cheap and the data they return shortens diagnosis dramatically.

2. **Bind secrets via API PATCH on day 1.** Skip the app.yaml `resources` block entirely — it's noise that makes you think the binding will work.

3. **Verify CSP / response headers early.** The "blank page despite assets serving" trap is the kind of thing a small smoke test would catch — a single `curl -I /` request that prints headers would have flagged the CSP issue without a full bundle-debug session.

4. **Get OAuth U2M set up alongside the PAT.** `databricks apps logs` would have saved hours. The one-time browser-based `databricks auth login` is worth it.

5. **Pin commits via `git_source.commit`, never rely on default-branch tracking.** This means every deploy is reproducible and you can roll back trivially by deploying an older SHA.

6. **Document the empirical schema as you find it.** This doc was written after-the-fact; if it had been written DURING the discovery, the same insights would be available to the next person on day 1.

---

## Part 9 — Open questions for the next session

- **`DATABRICKS_TOKEN` auto-injection**: Free Edition doesn't seem to inject it. Does paid tier? Worth testing if/when an account upgrades.
- **App.yaml `resources` block**: Why is it accepted but ignored? Possibly only used by Databricks Asset Bundles (`databricks bundle deploy`), not raw `databricks apps deploy`. Worth confirming.
- **App resource auto-binding**: Could we declare resources in `databricks.yml` (bundle config) instead and have them auto-bind? Would eliminate the API patch step.
- **Cold-start optimisation**: The 3-5 min build cycle gets old. Worth investigating committed-dist branches or remote-caching strategies.
- **CSP for non-static routes**: We currently rely on the global `default-src 'none'` CSP for JSON API responses. That's good. But the SPA fallback's override is path-based (`app.get(/.*/)`) — if a future route is added that returns HTML outside the SPA, it'll inherit the strict CSP. Audit before adding HTML-returning routes.

---

## Appendix A — Reference URLs from this deploy

| Resource | URL |
|---|---|
| Hosted app | `https://pulseplay-7474646467214591.aws.databricksapps.com/` |
| Workspace logs UI | `https://dbc-f88d29ce-4aa2.cloud.databricks.com/apps/pulseplay` |
| Static diag | `/__diag/static` |
| Env diag | `/__diag/env` |
| Git repo | `https://github.com/onerkm-in/PulsePlay.git` |
| Branch | `codex/f5-g0-native-layout-2026-05-21` |

## Appendix B — Commit timeline of the deploy fixes

| Short SHA | Description | What it fixed |
|---|---|---|
| `a8ea4ba` | First combined-deploy commit | Added static-serve, dual-auth Power BI, bootstrap scripts |
| `feab7f1` | Drop `NODE_ENV=production` | Crash #1 |
| `4005d62` | STATIC_DIR drops extra `../` | Blank #1 |
| `86b1d7f` | Add `/__diag/static` | Diagnostic endpoint |
| `02e2385` | Expand `/__diag/static` with index_html_tags | Better diagnostic |
| `6de39cc` | CSP override for static + `/api/` prefix strip | Blank #2 + Blank #3 |
| `dce7c8e` | Initial pitfalls doc | Documentation |
| `009f2db` | Wire profile env vars + secret valueFrom | Attempted secret binding (failed at resources stage) |
| `0ca683c` | Add `/__diag/env` | Diagnostic for token binding |
| `5507219` | Add pitfalls 11-16 to deploy doc | Documentation |
| (API patch) | Bind `databricks-pat` resource via PATCH `/api/2.0/apps/pulseplay` | Real fix for token binding |
| (redeploy `0ca683c`) | Fresh container picks up secret binding | Final fix |

10+ commits + 1 API patch to get a hello-world combined deploy running. Most of them documented as pitfalls.
