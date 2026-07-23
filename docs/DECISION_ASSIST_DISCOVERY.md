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
