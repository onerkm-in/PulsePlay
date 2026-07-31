# Blockers — what's gated, the exact unblock action, and code-readiness

The honest list of things that are **not** done because they depend on something
outside the code. Each row says: why it's blocked, the **exact action** that
unblocks it (and **who** can do it), and whether PulsePlay's code is already
ready for that moment. "Code ready" means: when the external condition is met,
no further code change is needed — it just works.

Updated 2026-07-23.

## Code-clearable blockers — CLEARED this cycle

| Blocker | Status |
|---|---|
| **Smoke test not in CI** | ⚠️ **CLEARED, THEN SILENTLY BROKEN, RE-FIXED 2026-07-31.** `smoke.yml` runs a credential-free anti-blank UI smoke on every push/PR. But its step 2 asserted three `surface-connector-*` dropdowns, and that control was **removed from the product** when inline connector pickers moved to Settings / FirstRunWizard / the BundleSwitcher chip — the selector survived only in the smoke script. Result: the smoke failed on **every run** for days while this table said "CLEARED". Step 2 now asserts what the app actually ships (viewport shell + AI/BI panel chrome + all four surface tabs) plus the surface's real no-spend empty state. Verified locally 6/6 under true CI conditions (`served_mode: combined`, no kill switch). Live-data checks still stay local (need creds). **Lesson: a green row in this table is a claim, and claims need a run behind them.** |
| **Per-user rate limit** | ✅ CLEARED — 60/min/user on the 9 cost-bearing AI paths (`b1434a2`). |
| **Deploy-config silent placeholders** | ✅ CLEARED — `npm run validate-deploy` gate (`1f56f81`). |

## External blockers — NOT code-clearable (operator / paid / org action)

### 1. ~~Genie + Supervisor — live answers~~ — **CLEARED 2026-07-23 (workspace change)**
- **Was blocked because:** the previous reference workspace was free-edition with Serverless Compute disabled — every Genie call 400'd at warehouse start.
- **Now:** the current reference workspace (`dbc-f88d29ce-4aa2.cloud.databricks.com`) has a working serverless warehouse (`6510da50329f1e85`, "Serverless Starter Warehouse") and one Genie space (`01f1436554b719bea6abd14824c9103e`, "DBDemos - AI-BI - Customer Support Review"). **Live-verified end-to-end 2026-07-23**: real NL→SQL round-trips through the proxy AND the headed UI (Ask Pulse + AI Insights), values reconciled against the warehouse via `/sql/preview`. See `docs/evidence/headed-validation-2026-07-23/REPORT.md` (local evidence).
- **Residual:** Supervisor/supervisor-local fan-out needs ≥2 Genie spaces; this workspace has one, and the supervisor profile was removed from config.json in the 2026-07-23 cleanup. Re-add profiles when a second space exists — code unchanged, still ready.
- **The old claim was environment-specific**, not a platform fact: free-edition workspaces CAN come with a usable serverless warehouse. Probe the actual workspace before assuming.

### 2. Power BI report **visual** render in the Dashboard
- **Why blocked:** rendering a real Power BI **report visual** needs **paid Premium / Fabric capacity**. The free account can mint embed tokens and run the **deterministic-DAX Q&A path (capacity-free)**, but not render the report visual.
- **Exact unblock (operator):** assign the workspace to a **Premium / Fabric capacity** (a **Fabric trial** works during its window), then supply the real **Premium workspace GUID + dataset GUID** and an **SP with Build + Read** on the dataset.
- **Code ready?** ✅ Yes. The mint route reads the GUIDs from the request body, `accessLevel: "View"`, the adapter wires `loaded`/`rendered`, and the embed-host check is strict. (No token is minted against an unknown target.)

### 3. Power BI **RLS via OBO** — verified success — **half unblocked 2026-07-31**
- **The "no real IdP" half is now local, not external.** `dev/idp/` runs Keycloak — a genuine OIDC issuer with real RS256 tokens and a real JWKS endpoint — so the proxy's IdP verification, issuer/audience enforcement and persona-from-claims resolution can all be exercised without waiting for an Okta pilot. Out-of-process and dev-only; nothing ships. **Caveat: not yet booted end to end — docker is not installed on the current dev box.** See `dev/idp/README.md`.
- **What is still genuinely blocked:** a **dataset with RLS roles defined** and a user mapped to one. That is a Power BI-side setup no local container can provide, so this row stays open.
- **Why blocked:** proving row-level security under On-Behalf-Of needs a **real IdP** (Azure AD / Okta) + the **OBO flow** + a **dataset with RLS roles** + a user mapped to a role.
- **Exact unblock (operator):** configure `PROXY_AUTH_MODE=idp` + `PROXY_IDP_JWKS_URL` / `PROXY_IDP_ISSUER` / `PROXY_IDP_AUDIENCE`; use a dataset that has RLS roles; sign in as a user the role applies to.
- **Code ready?** ✅ Yes (fail-closed today). The proxy derives effective identity from verified IdP claims server-side and **rejects** browser-supplied identities; RLS fail-closed is unit-tested. (A non-Azure IdP with custom claim names is the one residual — see `ANALYSIS_FOLLOWUPS_2026-06-05.md` §3 `PROXY_IDP_CLAIM_MAP`, deferred until a real Okta pilot.)

### 4. Foundation Model **answer correctness**
- **Why "blocked":** this one isn't unblockable — FM is an **ungrounded language model** with no query access in this config, so its numbers are model-produced, not measured. This is a *property*, not a defect.
- **Exact unblock:** ground it — point that pane at a **data-backed** connector (the now-live Genie space, or the deterministic Power BI DAX path) instead of raw FM.
- **Code ready?** ✅ Yes, and it's **surfaced honestly**: the fail-closed "Illustrative — not grounded in your data" advisory shows whenever real result rows don't confirm a query ran (re-verified headed 2026-07-23).

## Not blockers — just large or speculative (tracked, not gated)
- `visual.tsx` split (12,830 LOC, 0 unit tests) — multi-day, test-first refactor. Tracked.
- Okta `PROXY_IDP_CLAIM_MAP` — speculative until an actual Okta pilot.
- AGENDA UX/architecture slices — planned feature work, each 0.5–2 days.
