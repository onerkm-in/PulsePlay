# Decision Assist — Phase 1 Discovery + Evidence Matrix

> Master prompt: `docs/PulsePlay_Action_Insights_Master_Execution_Prompt.md`.
> Decisions taken (2026-07-23): build config-driven, validate on this free workspace
> as a dev stand-in (approved org tenant BLOCKED), evolve the existing Action Insights
> feature in place rather than build a parallel one.

## Environment boundary — BLOCKED (reported, not worked around)

The prompt's hard boundaries are on an org workspace not reachable from the connected
free workspace `dbc-f88d29ce-4aa2` (user onerkm@gmail.com):

| Approved identifier | Live check | Result |
|---|---|---|
| catalog `uc_dev_snt_supplychain_01` | `information_schema.catalogs` | absent (present: main, samples, samplesuperstore, system, workspace) |
| Genie space `01f12c6e979a1f35beef4bd5baf62dd9` | `GET /api/2.0/genie/spaces/{id}` | 404 NOT_FOUND |
| warehouse `pep-snp-cdo-dev-eus-dbsql01` | `GET /api/2.0/sql/warehouses` | absent (present: `6510da50329f1e85` Serverless Starter) |

Consequence: all six governed SQL rules, the `tbl_sample_super_store` source, the
`tbl_pp_decision_prompts` store, and the approved Genie space cannot be validated on
their approved coordinates here. Stand-in for dev validation: the already-live
`main.action_insights.*` prompt store + `main.supply_chain.fact_supply_chain_kpi_monthly`
KPI fact (576 rows, 2023-01..2025-12) served by the running 6-hour detection engine.
All code is written config-driven (env-first) so pointing at the approved coordinates
is a config change, not a code change.

## Evidence matrix (existing Action Insights ≡ Decision Assist)

| Requirement | Current state | Evidence | Gap | Planned change |
|---|---|---|---|---|
| Peer surface desktop/mobile/deeplink | Verified working | `surfaceRegistry.ts` id `action-insights` (first), shortLabel "Decide", mobile nav via 7d3308a, `?surface=` handled | none | verify headed |
| Proactive stack, no chat, no LLM | Verified working | `GET /insights/action-insights` returns stored prompts; `DecisionPromptCard` renders fields; 0 LLM calls | none | verify 10 parts |
| ACT-02 HITL bypass | Verified mitigated | action endpoint loads prompt server-side, derives level from `ACTIONS`, trigger→`pending-approval` not `actioned`; client `approvalRequired` never read | no negative test | add forged-flag test |
| SEC-01 client persona authority | Verified mitigated | `resolvePersona` IdP-first, demo gated by `AI_ALLOW_DEMO_PERSONA`, default least-privilege Planner | no forged-persona route test | add forged-persona test |
| L4/L5 rejection | Partial | runtime rejects `spec.level>3` (actionInsights.js:212); `ACTIONS` map is all ≤3 | rule-load rejection lives in Python engine, not in repo | bring engine in-repo |
| persona/HITL as reusable libs | Missing | logic inline in `actionInsights.js` | `personaGate.js`, `hitlGate.js` named in prompt | extract |
| `decisionPromptStore.js` | Missing | store read/update inline | named in prompt | extract |
| drop-in connector `proxy/connectors/decision-assist.js` | Missing | mounted via `lib/actionInsights.register()` inline; routes are `/insights/action-insights` | prompt wants `/decision-assist/prompts` drop-in | add connector + back-compat alias |
| Python engine `scripts/decision_assist/` | Missing from repo | engine only in Databricks `/Workspace/Users/.../ai_engine` (job 422316433115052) | not version-controlled | copy in, config-driven |
| 6 SC rule IDs | Different | live engine: 5 rules SCM-OTIF/FILL/FA/SUPP/INV | prompt names SC-OTIF/MARGIN/FILL/DISC/DOS/AGE | document; rule set is config |
| SQL escaping convention | Verified | `sq()` doubles single-quotes (`'a''b'`), test locks it (actionInsights.test.js:90) | prompt's `\'` guess is wrong for this repo | preserve doubled-quotes |

Disposition legend: Verified working / Verified mitigated / Partial / Missing / BLOCKED.

## Results (2026-07-23) — evidence coverage

Acceptance criteria proven on the dev stand-in (approved org tenant deferred):

| Gate | Result | Evidence |
|---|---|---|
| Security: server-owned authority, forged persona/approval fail, L3→HITL, L4/L5 rejected | PASS | `actionInsightsRoutes.test.js` 6/6 + live 403/pending-approval on `/decision-assist/*`; engine rejects L4 at rule-load (`test_rules.py`) |
| Data: approved-scope-only, parameterized+escaped SQL, stable dedup IDs, lifecycle persists | PARTIAL | doubled-quote escaping locked by test; content-hash prompt_id in engine; lifecycle persists to Delta (audit rows). Approved *coordinates* BLOCKED (org tenant absent) — validated on stand-in scope only |
| Product: peer surface desktop+mobile, proactive no-LLM stack, evidence/impact/persona correct, fail-safe | PASS | `DA_01..04` screenshots: tab first + deep link + mobile "Decide"; 5-card stack no typing; drawer shows detection SQL; powerbi-dwd→slim 500 notice, screen intact |
| Governance: L1/L2/L3 enforced, L2 logged-not-sent, L3 pending until approval, rejection+false-positive recorded | PASS | `hitlGate` verdict + `ACTIONS` map (all ≤L3, logged-only); durable audit shows trigger→pending-approval→actioned |
| Quality: static+unit+integration+full suites pass, headed evidence, 0 console/API errors | PASS | proxy 1316/1316, playground 1918/1918, python 6/6, tsc clean; 0 console errors headed |
| Documentation: reason/risk/validation, blockers explicit, handover updated | PASS | this doc + HANDOVER entry + AGENDA |

Coverage: of the applicable acceptance criteria, the only one not fully green is the **approved-coordinate data gate**, which is BLOCKED by the org-tenant environment (not a code defect). Everything reachable on this workspace is verified. **Verdict: PARTIAL — feature complete and proven on the dev stand-in; approved-tenant live run is the one remaining gate, blocked on org workspace access.**

## Open items / follow-ups

- Approved-tenant live validation (uc_dev_snt_supplychain_01 + pep-snp Genie/warehouse) — needs org workspace access. Swap config env vars + the 6 SC-* rules.json pack; no code change.
- Action Insights resolves to the active AI profile; on a non-warehouse BI connector (powerbi-dwd) the store 500s (fail-safe shows honest notice). Should resolve to a warehouse-capable profile independent of the BI vendor. (Follow-up, not blocking.)
- The prompt's 6 SC-* rule IDs (OTIF/MARGIN/FILL/DISC/DOS/AGE) vs the shipped 5 SCM-* pack matching the live KPI fact — a rules.json swap once the approved superstore source is reachable.
