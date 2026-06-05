# Blockers — what's gated, the exact unblock action, and code-readiness

The honest list of things that are **not** done because they depend on something
outside the code. Each row says: why it's blocked, the **exact action** that
unblocks it (and **who** can do it), and whether PulsePlay's code is already
ready for that moment. "Code ready" means: when the external condition is met,
no further code change is needed — it just works.

Updated 2026-06-06.

## Code-clearable blockers — CLEARED this cycle

| Blocker | Status |
|---|---|
| **Smoke test not in CI** | ✅ CLEARED — `smoke.yml` runs a credential-free anti-blank UI smoke (app boots, connector bar, echarts-6 fixture paint, Settings, zero console errors) on every push/PR. The live-data checks stay local (need creds). |
| **Per-user rate limit** | ✅ CLEARED — 60/min/user on the 9 cost-bearing AI paths (`b1434a2`). |
| **Deploy-config silent placeholders** | ✅ CLEARED — `npm run validate-deploy` gate (`1f56f81`). |

## External blockers — NOT code-clearable (operator / paid / org action)

### 1. Genie + Supervisor — live answers
- **Why blocked:** the reference Databricks workspace is **free-edition with Serverless Compute disabled**; it has exactly one PRO/serverless warehouse (STOPPED), so there's no classic fallback. Every Genie call returns `400 Cannot start warehouse 'Serverless Starter Warehouse' … Serverless Compute … disabled`.
- **Exact unblock (operator):** in **Databricks workspace admin → Compute / SQL Warehouses**, either **enable Serverless Compute** for the workspace, **or** create a **classic SQL warehouse** and bind the Genie spaces to it.
- **Code ready?** ✅ Yes. Live attempts reach Databricks correctly (the 400 is the workspace refusing, not our code). Supervisor fan-out depends on Genie, so it clears at the same time.

### 2. Power BI report **visual** render in the Dashboard
- **Why blocked:** rendering a real Power BI **report visual** needs **paid Premium / Fabric capacity**. The free account can mint embed tokens and run the **deterministic-DAX Q&A path (capacity-free)**, but not render the report visual.
- **Exact unblock (operator):** assign the workspace to a **Premium / Fabric capacity** (a **Fabric trial** works during its window), then supply the real **Premium workspace GUID + dataset GUID** and an **SP with Build + Read** on the dataset.
- **Code ready?** ✅ Yes. The mint route reads the GUIDs from the request body, `accessLevel: "View"`, the adapter wires `loaded`/`rendered`, and the embed-host check is strict. (No token is minted against an unknown target.)

### 3. Power BI **RLS via OBO** — verified success
- **Why blocked:** proving row-level security under On-Behalf-Of needs a **real IdP** (Azure AD / Okta) + the **OBO flow** + a **dataset with RLS roles** + a user mapped to a role.
- **Exact unblock (operator):** configure `PROXY_AUTH_MODE=idp` + `PROXY_IDP_JWKS_URL` / `PROXY_IDP_ISSUER` / `PROXY_IDP_AUDIENCE`; use a dataset that has RLS roles; sign in as a user the role applies to.
- **Code ready?** ✅ Yes (fail-closed today). The proxy derives effective identity from verified IdP claims server-side and **rejects** browser-supplied identities; RLS fail-closed is unit-tested. (A non-Azure IdP with custom claim names is the one residual — see `ANALYSIS_FOLLOWUPS_2026-06-05.md` §3 `PROXY_IDP_CLAIM_MAP`, deferred until a real Okta pilot.)

### 4. Foundation Model **answer correctness**
- **Why "blocked":** this one isn't unblockable — FM is an **ungrounded language model** with no query access in this config, so its numbers are model-produced, not measured. This is a *property*, not a defect.
- **Exact unblock:** ground it — point that pane at a **data-backed** connector (Genie space once #1 is cleared, or the deterministic Power BI DAX path) instead of raw FM.
- **Code ready?** ✅ Yes, and it's **surfaced honestly**: the fail-closed "Illustrative — not grounded in your data" advisory shows whenever real result rows don't confirm a query ran.

## Not blockers — just large or speculative (tracked, not gated)
- `visual.tsx` split (12,830 LOC, 0 unit tests) — multi-day, test-first refactor. Tracked.
- Okta `PROXY_IDP_CLAIM_MAP` — speculative until an actual Okta pilot.
- AGENDA UX/architecture slices — planned feature work, each 0.5–2 days.
