# Analysis follow-ups — 2026-06-05 (5-agent audit → fix-all)

A 5-agent brutal-honest analysis (architecture, tests, security, feature-reality, deploy) ran at HEAD. This file records **what was fixed in the fix-all pass** and **what was deliberately deferred, with a concrete plan and the honest reason** — so the deferrals are tracked work, not hidden scope.

## ✅ Fixed + verified (shipped to main this session)

| Finding | Fix | Commit |
|---|---|---|
| Deploy P0 — `proxy/app.yaml` ships unfilled placeholders (`GENIE_SPACE_ID_SALES`, `WAREHOUSE_ID`); deploying as-is fails silently | `proxy/scripts/validate-deploy-config.mjs` + `npm run validate-deploy`, wired as a pre-deploy gate in `deploy-databricks.yml` | `1f56f81` |
| Footgun — proxy on port ≠ 7000 → every Vite `/api/*` is HTTP 500 | Loud startup warning in the local-dev listen path | `1f56f81` |
| Honesty — "10 backend paths" reads as 10 working backends | ARCHITECTURE.md live-verification block: 2 verified live, 2 blocked upstream, 6 code-present-unproven | `ba81950` |
| Stale doc — "powerbiGroupId/DatasetId have no env mapping" (they DO) | Corrected DEPLOYMENT_GUIDE (verified in `server.js:336-341`) | `ba81950` |
| **Honesty #1 — connector "STABLE" badges overstate reality (Genie STABLE but blocked)** | `getConnectorLiveStatus()` + a "Verified live / Unverified / Demo" chip on every connector card; Genie now shows STABLE **and** Unverified with a workspace-specific tooltip. Deployer-agnostic (no universal "blocked" claim) | `9607da3` |

## ⏸ Deferred — with plan + honest reason (NOT done; do not mark complete)

### 1. Smoke test → CI (test-agent rec)
**Why deferred:** the full `smoke-all-screens.mjs` needs **real Power BI / Azure AD credentials** that fork CI won't have, and a structural-subset job needs two-server (proxy+playground) CI plumbing whose green-ness I **can't verify without actually triggering GitHub Actions**. A flaky CI gate is worse than none; shipping it blind in an autonomous loop was the wrong call.
**Plan:** (a) add `PP_CI=1` mode to the smoke that runs only no-credential checks (app boots, Settings renders, connector bar shows 3 dropdowns, **zero console/page errors**, and the `native-canvas-smoke.html` echarts-6 fixture paint) and skips live-data checks; (b) `.github/workflows/smoke.yml` that builds playground, starts the proxy with a `demo-mock` profile on `PORT=7000` + `vite preview`/dev on 7001, waits-for-ready, runs the CI smoke. Validate by watching the first Actions run, then make it a required check.

### 2. Per-user / per-profile rate limit (security-agent HIGH) — ✅ DONE (`b1434a2`, 2026-06-05)
Shipped with the user present. `perUserRateLimitMiddleware` (60/min, keyed by `req.user.sub`) mounted after `idpMiddleware` on all **9** cost-bearing AI prefixes (the original 7 + `/powerbi` + `/foundation`, so the FM/PBI paths are covered too). No-op for unauthenticated/shared-key. Pure `perUserRateDecision` helper exported for behaviour tests. +12 tests (9 BUG-015 structural + 3 behaviour). proxy 1224/1224.

### 3. Okta / non-Azure IdP claim mapping (security-agent MEDIUM)
**Why deferred:** additive but touches auth claim extraction (RLS identity). Lower urgency (no Okta pilot).
**Plan:** optional `PROXY_IDP_CLAIM_MAP` (JSON, e.g. `{"email":"corp_email"}`) consulted in `idpMiddleware` + `_powerBiUserClaim` before the standard-name fallback; zero behaviour change when unset; jest tests for a custom-claim Okta payload.

### 4. `visual.tsx` god-object split (architecture-agent P0)
**Why deferred:** **12,830 LOC** with **zero unit tests** — splitting it into Visual-shell / render / backend / insights modules is a multi-day refactor with real regression risk to the primary Power BI surface. Doing it in a fix-all sweep, autonomously, with no unit-test safety net, is exactly how you ship a silent regression. Needs a dedicated, test-first cycle.
**Plan:** (a) FIRST add characterization tests around `visual.tsx` (mount/update/destroy + each surface renders expected content) so the split has a safety net; (b) extract `PulseBackend` (XHR helpers) → `insightsRenderer` → `chatRenderer` → `dashboardRenderer`, keeping `Visual` a thin IVisual adapter; verify the smoke + full suite green after each extraction.

### 5. Smaller architecture cleanups (architecture-agent)
Allowlist hostname-check DRY (3 copies → 1 helper); insights-cache invalidation on `data-refreshed`; centralize `App.tsx` initial-state reads. All low-risk, low-urgency — batch into a cleanup cycle.

## Note on the analysis itself (honesty cuts both ways)
The security agent flagged a "CRITICAL inbound BI-context injection" citing `AISidebar.tsx` — **that file does not exist**, and the claim contradicts the 2026-06-04 audit that found the context/prompt lane clean across 28 sites. Downgraded to the already-known LLM-misdirection residual (defense-in-depth). The test agent reported `visual.tsx` at ~1,500 LOC; it's **12,830** (verified). Always verify agent file:line claims before acting.
