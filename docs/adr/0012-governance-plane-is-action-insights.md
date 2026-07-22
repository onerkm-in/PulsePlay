# ADR-0012: Action Insights is the governance-plane implementation, not a separate `/governance/*` route family

**Status:** Accepted, 2026-07-23
**Context:** 2026-07-23 rebuild-spec gap audit (see HANDOVER top entry)

## Context

A rebuild-spec document supplied for a gap audit against this repo names a `/governance/*` route family of roughly 40 endpoints: status, rules CRUD + reload, killswitch status/enable/disable/incidents, HITL pending/approve/modify/defer/reject/outcome, golden-QA sign/retire, artifacts, widgets pin/refresh/retire, personas, eval signals/anomalies, trust challenge, OBO status.

The audit found zero code under `/governance/*` anywhere in `proxy/`. `proxy/lib/governance.js` exists but is an attestation-builder function (`withGovernance`, the `g3-v1` policy stamp on every response) — a different concept from a governance-plane router.

Separately, `proxy/lib/actionInsights.js` already implements a real, code-complete, server-enforced human-in-the-loop system: persona/capability resolution from verified IdP roles, `can_approve_hitl`/`can_reject`/`can_trigger_request` capability gates, a hard MVP action-level ceiling (triggered actions are logged-only, no external send), and a durable Delta audit table (`main.action_insights.decision_audit`). It lives under `/insights/action-insights/*`, not `/governance/*`.

## Decision

Treat Action Insights as the real implementation of the HITL slice of the spec's governance plane. Do not build a parallel `/governance/*` HITL surface that duplicates what Action Insights already does correctly.

The remaining named endpoints that Action Insights does not cover — killswitch, golden-QA sign/retire, artifacts, widgets pin/refresh/retire, personas (as a standalone concept beyond Action Insights' two hardcoded roles), eval signals/anomalies, trust challenge, OBO status — remain genuinely unbuilt. If/when they're needed, scope them individually against real requirements rather than building the full ~40-route family speculatively.

## Consequences

- Anyone re-running this gap audit against the spec literally will find `/governance/*` MISSING. That verdict is correct for the literal route family; it is not evidence that HITL itself is unbuilt.
- Action Insights' capability model (`Supply Chain Planner` / `Supply Chain Manager`) is narrower than the spec's implied general persona/governance model. If a second domain beyond Supply Chain DOS/Fill Rate needs HITL, Action Insights' persona resolution will need generalizing before it can serve as "the" governance plane for that domain too.
- A killswitch (immediate proxy-wide AI-execution halt / force SQL-only mode) genuinely does not exist anywhere in the codebase. This is a real, separate gap independent of the naming/reconciliation question above — see the audit's Section C risk notes.
