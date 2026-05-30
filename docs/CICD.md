# PulsePlay — CI/CD

> Authored 2026-05-30 (beast-mode CI/CD pass, 3-agent analysis). Repo:
> `github.com/onerkm-in/PulsePlay`. Monorepo, no root `package.json` — every
> job `cd`s into its package and uses that package's lockfile.

## CI (runs automatically)

[`.github/workflows/test.yml`](../.github/workflows/test.yml) — on `pull_request` + push to `main`/`publish/**`. Hardened with `concurrency` (cancel superseded runs), least-privilege `permissions: contents: read`, and per-job `timeout-minutes`.

| Job | Dir | Gate | Count |
|---|---|---|---|
| `proxy (jest)` | `proxy/` | `npm test` | 58 suites / 1166 tests |
| `playground (lint + vitest + build)` | `playground/` | `tsc --noEmit` + `vitest run` (incl. `bi-adapters/*`) + `vite build` | 131 files / 1842 tests |
| `desktop launcher (node --test)` | `enablers/desktop/` | `npm test` | 50 tests (hermetic) |
| `Pulse PBI enabler (lint + unit)` | `enablers/pulse-pbi/` | `eslint .` + `vitest run` | 4 suites |

**Security workflows:**
- [`dependency-review.yml`](../.github/workflows/dependency-review.yml) — PR-only; blocks new deps with `high`+ severity. Needs Dependency Graph enabled (Settings → Code security).
- [`codeql.yml`](../.github/workflows/codeql.yml) — JS/TS static analysis (covers the whole monorepo in one pass) on push/PR to `main` + weekly. Results in the Security tab.
- [`dependabot.yml`](../.github/dependabot.yml) — weekly bumps for GitHub Actions + each npm package.

**Known coverage gaps (intentional / future):** `databricks-agents/` (Python, no test runner — add `pytest`+`ruff` job if tests are written); `proxy/` has no `tsc`/ESLint static gate (JS-only); the headed `playground/scripts/*.mjs` smokes + `enablers/pulse-pbi/chat.spec.ts` need live Genie/Power BI creds, so they stay local-only (not CI-gated). Node matrix (20+22) is a deferred nice-to-have — CI tests **node 20** (the deploy target).

**To finish wiring CI:** in Settings → Branches → `main`, mark `proxy`, `playground`, `desktop`, `pulse-pbi`, `dependency-review` as **required status checks**.

## CD (manual only — INERT until set up)

> **All three targets are FREE accounts used as a dev/test bed to prove the build works on real services — not for production load.** Azure (free/$200-credit, F1 = $0), Databricks (Free Edition, daily app-runtime cap), Power BI (free: semantic-model Q&A + embed-token mint are free; report VISUAL render needs paid Premium/Embedded capacity → trial-only here). CI/CD itself is $0 (GitHub Actions + OIDC). See memory `project_azure_free_account`.

Posture: **manual-dispatch, environment-gated, OIDC-first, deploy-only.** No `on: push`. The CI identity is least-privilege-scoped so it **cannot create or scale any resource** — pure cost-safety. Build happens on the free GitHub runner, never on the billed box (`SCM_DO_BUILD_DURING_DEPLOYMENT=false`). Free-tier functional limits (F1 cold starts / no Always-On; Databricks Free daily cap can block app restart) are platform limits to validate around, not CD bugs.

Both workflows reuse the CI gate (lint + test + build) before deploying, and `concurrency: cancel-in-progress: false` so a deploy is never interrupted.

### Databricks Apps — [`deploy-databricks.yml`](../.github/workflows/deploy-databricks.yml)
**Setup checklist:**
- [ ] Databricks **service principal** with `CAN MANAGE` on the `pulseplay-dev` app + least-privilege on Genie spaces / warehouse.
- [ ] Account-level **federation policy** binding the SP to GitHub's OIDC issuer, subject pinned to `repo:onerkm-in/PulsePlay:environment:databricks-dev`.
- [ ] GitHub Actions **variables** (non-secret): `DATABRICKS_HOST` (`https://dbc-f88d29ce-4aa2.cloud.databricks.com`), `DATABRICKS_CLIENT_ID` (SP UUID).
- [ ] GitHub **Environment** `databricks-dev` with yourself as required reviewer.
- [ ] **One-time bundle prep (real prerequisite):** [`databricks.yml`](../databricks.yml) currently only declares `bundle.name` + a `dev` target — add an `app` resource block, then `databricks bundle deployment bind pulseplay_app <existing-app> --target dev --auto-approve` once locally so CD redeploys the existing app instead of trying to create one.

`bundle deploy` uploads code; `bundle run` restarts the app (deploy alone does **not** restart).

### Azure App Service — [`deploy-azure.yml`](../.github/workflows/deploy-azure.yml)
**Setup checklist:**
- [ ] Entra **app registration / SP** for CI.
- [ ] Assign **`Website Contributor` scoped to the single web app only** (`/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Web/sites/pulseplay-onedata-dev`) — not the RG, not the subscription. This single-resource scope is itself the cost guardrail.
- [ ] **Federated identity credential** subject `repo:onerkm-in/PulsePlay:environment:azure-dev`, issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`.
- [ ] GitHub **secrets** (IDs, not credentials): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
- [ ] GitHub **Environment** `azure-dev` with required reviewer.
- [ ] App settings already on the app (once): `STATIC_DIR=playground/dist`, `PROXY_AUTH_MODE=none` (behind Easy Auth), `PROXY_INLINE_CREDENTIALS_MODE=off`, `SCM_DO_BUILD_DURING_DEPLOYMENT=false`. Don't set `NODE_ENV=production` while `PROXY_AUTH_MODE=none` — the proxy refuses to start.

### Cost-safety guardrails (both targets)
Manual trigger only · least-privilege identity = cost ceiling (no create/scale/SKU) · deploy-only workflows (no `az group create` / `databricks apps create`) · build off the billed box · one deploy at a time · OIDC over long-lived creds · curated package excludes `config.json`/`.env`/evidence.

**Before enabling CD:** pin third-party actions (`databricks/setup-cli`, `azure/login`, `azure/webapps-deploy`) to commit SHAs.
