# Author-Selectable Interface Mode — Phase Gate Report

> Executes the achievable, unblocked slice of `PulsePlay_Action_Insights_Final_Master_Execution_Prompt_v3_2.md`
> §10 (author-selectable interface modes). Per the prompt's mandatory phase-gating,
> this stops at a gate and reports before deeper phases.

## What the user asked for

Keep the existing (segregated) interface as one option, the new combined experience
as another, and let the **author** choose which is served, in Settings. Don't replace
the existing interface.

## Delivered (VERIFIED_RUNTIME on this workspace)

| Item | Evidence |
|---|---|
| Server-governed published mode `GET/PUT /experience/config` | `experienceConfig.js`; 9 proxy tests |
| Versioned + audited + optimistic concurrency (409 on stale) | `experienceConfig.test.js` |
| Author-gated publish (IdP author group in prod; dev-permissive+audited; hard-gate `PP_REQUIRE_AUTHOR_ROLE`) | test: non-author role → 403 |
| Fail-safe segregated on unset/invalid/unreachable | `experienceMode.test.tsx` network-fail → segregated |
| Operational kill switch `PP_EXPERIENCE_KILLSWITCH=segregated` | headed: served=segregated while published=combined |
| End users cannot override the served mode | no URL/localStorage sets served mode; preview is session-local author tooling |
| Settings → Display → Interface type (Preview/Publish) | `EXP_01` screenshot |
| Combined "My Decision Canvas" first slice served on publish | `EXP_02` screenshot: header + COMBINED badge + live Action Inbox + surface hub + honest deferred regions |
| Segregated unchanged + default | headed: default `/` renders existing tabs, no Canvas |
| Both modes share one backend/card/workflow (no fork) | Canvas reuses `ActionInsightsPanel` + Decision Assist routes |

Tests: proxy 1325/1325 (9 new), playground 1924/1924 (6 new), tsc clean. Headed: 0 console errors.

## Combined mode is a FIRST VERTICAL SLICE — not the full v3.2 Canvas

Real now: the Context bar, the governed **Action Inbox** (live decision cards, persona
toggle, evidence drawer with detection SQL, full HITL), and the surface hub (existing
screens reachable). Shown as honest deferred scaffolds (not fabricated): My Canvas,
Saved Items, Suggested for You.

## BLOCKED / deferred (why the full v3.2 verdict cannot be PASS)

These need the org data estate + owner manifests that do not exist on this free workspace:

- **Server-owned Canvas / snapshot / preference persistence** — approved Delta tables
  (`tbl_pp_canvas_sections`, `tbl_pp_context_snapshots`, `tbl_pp_user_preferences`) are in
  the org schema `uc_dev_snt_supplychain_01.snp_indrct_comp_gold_ai` (unreachable, verified 404/absent).
- **Event-sourced Action Requests + T+14 outcomes** (`tbl_pp_decision_events`) — needs the
  approved table + a concurrency POC on the org warehouse.
- **CanvasSection contract, pin/bookmark/highlight/note/snapshot** — depends on the above persistence.
- **Structured snapshots + token-reduction benchmark** — needs `benchmark-fixtures.yaml` (owner-supplied).
- **Governed relevance profile + suggestions** — needs the interaction-event store + privacy manifest.
- **Real author `can_configure_experience` gating** — needs `identity-entitlement-privacy.yaml` (IdP group IDs).
- **Synthetic-data POC lane** — needs `data-contracts/genie-01f130be/` (absent); marked NOT_APPLICABLE.

## Remaining phases (each needs its own human GO per the prompt)

1. CanvasSection persistence + Save channel (blocked on approved schema / a dev stand-in schema decision).
2. Event-sourced Action Requests + full lifecycle + concurrency POC.
3. Structured snapshots + token-reduction benchmark.
4. Relevance profile + suggestions.
5. Since-You-Last-Visited + default-home behavior.
6. Real author-role gating + owner manifests.

## Corrected Phase 4 gate classification (2026-07-23)

EXP_01/02 verifies the author-controlled interface-mode sub-gate only. It does NOT prove
the complete Phase 4 gate, because canonical event-sourced Action Requests, database/
request/audit reconciliation, and the Canvas services are not yet implemented.

| Sub-gate | Classification |
|---|---|
| Experience-mode control (publish/preview/version/audit/kill switch/fail-safe) | **PASS — VERIFIED_RUNTIME** |
| Segregated regression + fallback | **PASS — VERIFIED_RUNTIME** |
| Combined Action Inbox vertical slice | **PARTIAL** (Action Inbox renders + governed; no event-sourced Action Requests, no DB/request/audit reconciliation yet) |
| Phase 4 overall | **PARTIAL — not complete** |
| Enterprise Databricks validation | **BLOCKED_BY_ENVIRONMENT** (org estate `uc_dev_snt_supplychain_01` absent on the free workspace) |

## Verdict

**PARTIAL** — the author-selectable interface mode (the piece requested) is complete and
VERIFIED_RUNTIME on this workspace: segregated stays default and untouched, combined is
published by the author and served to end users, kill switch + fail-safe force segregated,
and end users cannot override. The Combined Action Inbox is a PARTIAL vertical slice. The
full My Decision Canvas remains a phased build with hard blockers on the org data estate
and owner manifests, listed above. Phase 5 (Universal CanvasSection foundation) is taken up
under explicit GO — see `docs/PHASE5_CANVAS_GATE_REPORT.md`.
