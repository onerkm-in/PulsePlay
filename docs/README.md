# PulsePlay Documentation Hub

> Start here when you need project context. This file is the living map for what is canonical, what is historical evidence, and what should be merged next.

## Current Facts

- Strategic posture: **Path C - inner-source-first, public-OSS-later**. Public-OSS readiness stays in [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md).
- First production-grade product cell: **Databricks Genie + Power BI**. It must remain modular through the BI adapter axis and AI connector axis.
- BI axis status: Power BI has a real `powerbi-client` adapter; generic iframe is the escape hatch; Tableau/Qlik/Looker are still iframe fallbacks until their SDK adapters graduate.
- AI connector axis status: **10 backend paths**. Genie, Azure OpenAI chat, Azure OpenAI analytics, Bedrock RAG, Bedrock direct, Foundation Model, Supervisor, Supervisor-local, ResponsesAgent, and Power BI semantic-model deterministic DAX.
- Latest recorded validation: proxy **1013/1013** from the 2026-05-20 handover; playground **1197/1197**, lint clean, and `vite build` clean from the 2026-05-21 G1 audit handover.
- Latest UI regression: [CODEX_UI_REGRESSION_RESULTS_2026-05-20.md](CODEX_UI_REGRESSION_RESULTS_2026-05-20.md). Main open blockers: Setup AI profile allowlist mismatch, hardcoded Setup Databricks docs link, local Node CA trust blocking live Databricks calls, and HelpTip React console warning.

## Read These First

| Need | Canonical doc |
|---|---|
| One-page orientation | [../README.md](../README.md) |
| LLM operating rules, tripwires, run sequence | [../CLAUDE.md](../CLAUDE.md) |
| Current branch/state/test memory | [memory/project_state.md](memory/project_state.md) |
| Latest session log | [HANDOVER.md](HANDOVER.md) |
| Open work, ordered by impact | [AGENDA.md](AGENDA.md) |
| 2-axis architecture and backend table | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Proxy routes, profile shapes, OAuth/M2M | [PROXY_REFERENCE.md](PROXY_REFERENCE.md) |
| Security guardrails | [SECURITY.md](SECURITY.md) |
| Hosting choices and production topology | [HOSTING_OPTIONS.md](HOSTING_OPTIONS.md) |
| Test coverage and honesty rules | [QUALITY.md](QUALITY.md) |
| Roadmap tracks | [ROADMAP.md](ROADMAP.md) |
| Settings IA and guardrails | [SETTINGS_SPEC.md](SETTINGS_SPEC.md) |
| Settings author/viewer UX scan | [SETTINGS_AUTHOR_VIEWER_UX_SCAN.md](SETTINGS_AUTHOR_VIEWER_UX_SCAN.md) |
| Knowledge plane | [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) |
| Packs | [PACKS.md](PACKS.md) and [../pulsepacks/PACK_SPECIFICATION.md](../pulsepacks/PACK_SPECIFICATION.md) |

## Do Not Read By Default

These are useful, but only for a targeted investigation:

- `docs/CODEX_*`, `docs/CLAUDE_*`, `docs/*RESULTS_2026-*`, `docs/*HANDOFF_2026-*`, `docs/*AUDIT_2026-*`: session artifacts and evidence. Their surviving findings should be copied into [AGENDA.md](AGENDA.md), [HANDOVER.md](HANDOVER.md), [QUALITY.md](QUALITY.md), or [memory/project_state.md](memory/project_state.md).
- [AGENT_SYNC.md](AGENT_SYNC.md): detailed coordination ledger. Use it for archaeology; do not make new agents read all 3,000+ lines unless a lane needs old decision detail.
- [inherited/](inherited/): Pulse/PepPulse source material preserved verbatim. Use only when porting or validating inherited behavior.
- [research/](research/): research and audit snapshots. Use when building or checking strategy, not for every implementation cycle.
- [scenarios/](scenarios/): large E2E scenario catalog. Use for test planning, not ordinary onboarding.
- `docs/evidence/`: screenshots and JSON captures. Use only to verify a specific historical run.

## Consolidation Map

The docs tree currently has many good pieces, but too many front doors. Use this map when merging.

| Current fragments | Merge target | Rule |
|---|---|---|
| `DATABRICKS_FORWARD_STRATEGY.md`, `MODULAR_INTEGRATION_ARCHITECTURE.md`, `ENTERPRISE_MODERNIZATION_CHARTER.md` | [ARCHITECTURE.md](ARCHITECTURE.md) + [ROADMAP.md](ROADMAP.md) | Keep strategy/current architecture in Architecture; sequenced work in Roadmap/Agenda. |
| `DISCOVERY_LOOP.md`, `CONNECTOR_PROBE_AND_SMART_CONNECT.md`, `AI_CONTEXT_CONFIGURATION_MODEL.md`, `PROMPT_IR_ARCHITECTURE.md`, `STAGED_RENDERING.md` | [ARCHITECTURE.md](ARCHITECTURE.md) + [PROXY_REFERENCE.md](PROXY_REFERENCE.md) | Architecture owns contracts; Proxy Reference owns routes and payload fields. |
| `SETUP_SETTINGS_RELATIONSHIP_AUDIT.md`, `SETTINGS_AUTHOR_VIEWER_UX_SCAN.md`, UI/copy audit docs, tooltip audit docs | [SETTINGS_SPEC.md](SETTINGS_SPEC.md) + [AGENDA.md](AGENDA.md) | Only active IA/copy rules remain in Settings; open bugs go to Agenda. |
| `UNIFIED_ASK_PULSE_WORKBENCH.md`, `THEME_STUDIO.md`, `FLOATING_COMPANION.md`, `STRUCTURED_AUTHORING_STANDARD.md` | [ROADMAP.md](ROADMAP.md) + focused ADRs when locked | Keep current shipped/queued state in Roadmap; create ADR only for accepted architecture decisions. |
| `FOCUSED_E2E_PLAN.md`, `EXTREME_E2E_PLAN.md`, `SMOKE_TEST_PLAN.md`, result docs | [QUALITY.md](QUALITY.md) + `docs/archive/runs/` | Quality owns current methodology; dated plans/results should move to an archive bucket after links are updated. |
| `HOSTING_OPTIONS.md`, `DEPLOY_MVP_0.2.md`, `DEPLOY_DATABRICKS_APP.md` | A future `DEPLOYMENT.md` or [PROXY_REFERENCE.md](PROXY_REFERENCE.md) | Keep hosting choice guidance in Hosting Options; keep deployer commands in focused deployer-facing docs. |
| `GENIE_POWERBI_FIRST_COPY_RESEARCH.md`, `SUPERIOR_BUILD_LEVERAGE_PLAN.md`, `PULSE_PORT_DETANGLING.md` | [ARCHITECTURE.md](ARCHITECTURE.md) + [AGENDA.md](AGENDA.md) | Preserve tripwires and leverage rules; archive the detailed source notes once merged. |

## Target Shape

Aim for this active set:

1. `README.md` - repo front door.
2. `CLAUDE.md` - LLM operating guide.
3. `docs/README.md` - docs hub and consolidation map.
4. `docs/HANDOVER.md` - latest work log.
5. `docs/memory/project_state.md` - current state memory.
6. `docs/AGENDA.md` - current open work.
7. `docs/ARCHITECTURE.md` - architecture, contracts, current backend table.
8. `docs/PROXY_REFERENCE.md` - route/profile/API reference.
9. `docs/SECURITY.md` - internal guardrails.
10. `docs/QUALITY.md` - test counts, quality limits, regression approach.
11. `docs/ROADMAP.md` - track-level roadmap.
12. `docs/SETTINGS_SPEC.md` - Settings/Setup IA.
13. `docs/KNOWLEDGE_BASE_ARCHITECTURE.md` - knowledge plane.
14. `docs/PACKS.md` + `pulsepacks/PACK_SPECIFICATION.md` - pack system.
15. `docs/PUBLIC_OSS_AGENDA.md` - deferred public-OSS scope.

Everything else should be either archived evidence, research, ADR history, or merged into one of the above.

## Merge Discipline

- Never delete a dated report until its active findings are copied into a canonical doc.
- Preserve evidence folders, but link them from the result file instead of putting them in onboarding paths.
- Prefer one canonical source for each live fact. If `README.md`, `ARCHITECTURE.md`, and `PROXY_REFERENCE.md` all mention a count, update all three in the same docs pass.
- Historical docs may retain stale counts if clearly labelled historical. Canonical docs must not.
