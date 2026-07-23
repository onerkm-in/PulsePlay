# Phases A/B/C — Event-Sourcing · Relevance · Live Delta: Gate Report

> Executed sequentially under explicit user GO ("event-sourcing, relevance, live Delta
> let's go one after another"). Each phase is committed + tested + pushed. This report
> classifies every item and gives a precise verdict.

## Executive verdict

**PARTIAL — all three phases implemented and verified as far as the environment allows;
canonical org-schema live persistence remains BLOCKED_BY_ENVIRONMENT.** Event-sourced
Action Requests, the governed relevance engine, and the Databricks adapter's live-Delta
proof are all real, tested, and (for C) proven against a real Delta table on the live
warehouse. What stays blocked is the *canonical* org schema and the owner manifests.

## Phase A — Event-sourced Action Requests (v3.2 §8)

| Item | Class | Evidence |
|---|---|---|
| Event-sourced store, state derived from an append-only log | A | `actionRequestStore.js`; 16 tests |
| Full lifecycle (prepared/prepared-complete/pending-approval/approved/awaiting-impl/rejected/deferred/cancelled/logged-only-complete) | A | store + route tests |
| Separation of duties (requester ≠ approver) | A | test: self-approve → 403 SEPARATION_OF_DUTIES |
| L3 requires approval; L2 terminal at prepared-complete; L4/L5 absent | A | tests |
| Modify → new immutable version; T+14 outcome | A | tests (version bump; outcome_due_at +14d) |
| Idempotency + optimistic concurrency + evidence-hash freshness | A | tests (replay; double-approve → 409; stale evidence → 409) |
| Immutable audit event per transition | A | `events()` log; test asserts prepare/submit/approve/assign-owner |
| Routes `/decision-assist/action-requests` (+/:id, /actions, /decisions, /outcomes) + prompts/:id/actions=prepare | A | 7 route tests; server-derived actor + persona |
| Live Delta `tbl_pp_decision_events` persistence + concurrency POC | B | `actionRequestStoreDatabricks.js` (parameterized append; prepareDdl → `ddl/decision_events.sql`; live ops throw EXTERNAL_RUNTIME_VALIDATION_BLOCKED) |
| Real IdP requester/approver identities | C | needs `identity-entitlement-privacy.yaml` |

## Phase B — Governed relevance + suggestions (v3.2 §14)

| Item | Class | Evidence |
|---|---|---|
| Relevance separate from persona; cannot alter authority/severity/tier | A | `relevanceEngine.js`; invariant test (followed medium can't outrank critical) |
| Explicit signals: follow / dismiss (7d) / suppress (30d) / correct / reset | A | 11 tests with injectable clock (expiry proven) |
| Suggestion ranking: governed tier first, personal relevance within tier, ≤3, deterministic "why" | A | tests + route test |
| Inspectable profile; dedupe vs inbox/canvas | A | `profile()`; excludeContentHashes test |
| Routes `/decision-canvas/relevance-profile` + `/suggestions` (+ actions) | A | 5 route tests; candidates from the owner's own pending Action Requests (real, no warehouse); private, no-store |
| Live interaction-event persistence + retention/consent | C | needs privacy manifest + interaction-event table |

## Phase C — Live Delta proof (v3.2 §11 live step)

| Item | Class | Evidence |
|---|---|---|
| `executeSqlStatement` forwards named parameter markers to the Statement API | A | `sqlExecutor.toStatementParameters`; 3 tests |
| DatabricksCanvasStore adapter runs against REAL Delta | **B→proven** | `prove_canvas_delta.js` PASS on the live genie warehouse against a dev stand-in schema: CREATE, MERGE dedupe (same section_id), UPDATE with version predicate (v0→v1), parameterized markers, SELECT read-back, cleanup |
| Adapter bug caught + fixed by the live proof | A | `rowToSection` column-over-body fix (read-back showed stale v0 after an update) |
| Live persistence into the **canonical org schema** | BLOCKED_BY_ENVIRONMENT | `uc_dev_snt_supplychain_01` unreachable; the proof used `main.action_insights` as a dev stand-in, clearly labeled |
| Concurrent-append concurrency POC on the warehouse | C | required by §8 before the event adapter is trusted live |

## Test + proof commands

- `cd proxy && npx jest` → **78 suites, 1405 tests pass** (event-sourcing 23, relevance 16, sqlExecutor params 3, canvas 43, decision-assist, experience…).
- `node scripts/decision_assist/prove_canvas_delta.js` → **PASS** (real Delta on the live warehouse; non-destructive).

## What remains (unchanged dependency list)

- **B (implemented, external-runtime-blocked)**: canonical-schema persistence for canvas + events (run `ddl/canvas_sections.sql` + `ddl/decision_events.sql` on the approved schema; run the §8 concurrency POC).
- **C (needs owner decision/manifest)**: real IdP requester/approver/author gating (`identity-entitlement-privacy.yaml`); interaction-event retention/consent (privacy manifest); token-reduction benchmark (`benchmark-fixtures.yaml`); synthetic-data lane (not started, per instruction).

## Verdict

**PARTIAL** — event-sourcing, relevance, and the live-Delta adapter proof are complete
and verified (C actually exercised the adapter against real Delta and caught a real bug).
The canonical org-schema live persistence and owner-manifest-gated items remain BLOCKED as
above. Each is a config/manifest away, not a code gap.
