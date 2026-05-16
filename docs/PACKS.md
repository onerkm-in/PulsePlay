# PulsePlay Packs

> **Brief overview of the pack architecture.** Detailed pack specification lives in [pulsepacks/PACK_SPECIFICATION.md](../pulsepacks/PACK_SPECIFICATION.md). This doc explains what packs are, what works today, and how packs fit into the Knowledge plane.

## What is a pack

A **PulsePack** is a vertical / domain-specific bundle that gives PulsePlay business vocabulary, KPI definitions, sample questions, prompt context, references, ontology, and demo configurations for a particular industry or function. Examples:

- `pulsepacks/cpg-fmcg/` — Consumer Packaged Goods / Fast-Moving Consumer Goods. Pre-built domain agents for trade promotion, demand planning, retail execution, supply chain, finance close. Reference dashboards. Curated metric definitions.
- `pulsepacks/manufacturing/` — Plant operations (OEE, downtime, quality), batch genealogy, supplier risk, ISA-95-aware OT/IT integration.
- `pulsepacks/financial-services/` (potential) — Risk, compliance, customer 360, treasury.

Each pack is a self-contained directory bundling:

| Element | Purpose |
|---|---|
| `pack.json` | Machine-readable manifest, compatibility, sub-vertical list, maintainers, references |
| `knowledge-base/glossary.md` | Domain terms and definitions |
| `knowledge-base/ontology.md` | Domain entities and relationships |
| `knowledge-base/references.md` | Source bibliography |
| `sub-verticals/*/kpis.md` | KPI definitions, formulas, direction, cadence, sources |
| `sub-verticals/*/sample-questions.md` | Real practitioner prompts grouped by intent |
| `sub-verticals/*/prompt-context.md` | Short system/context snippet injected at runtime when selected |
| `sub-verticals/*/bi-ai-fit.md` | Which BI/AI shapes fit this content and which do not |
| `demo-configs/*.json` | Loadable demo scenarios |
| `MIGRATION_NOTES.md` | Scaffold vs SME-reviewed status |

## Why pack architecture

**Without packs:** every customer of PulsePlay reinvents the same vertical setup. CPG team spends 3 weeks defining trade-promotion metrics. Manufacturing team spends 3 weeks setting up OEE prompts. Each ad hoc, inconsistent, hard to share.

**With packs:** one curated, vetted, vertical-specific configuration that anyone in the org's CPG business unit (or manufacturing, or whatever) can drop in. Consistent metric definitions. Curated golden questions. Pre-tested validator rules. Compounds value.

**Pack architecture also makes inner-source work** — a different team in the org maintains a pack independently, syncs it to the central PulsePlay registry, and shares improvements with everyone using that pack.

## How packs work today

Implemented:

- `pulsepacks/cpg-fmcg/` exists as the first reference pack.
- `proxy/lib/packMatcher.js` scans installed packs and scores probe metadata against glossary, KPI, and sample-question terms.
- `proxy/lib/packPromptLoader.js` loads `prompt-context.md` for a selected pack/sub-vertical, with glossary fallback.
- `proxy/lib/packPromptInjector.js` injects pack context into Genie-style user messages or orchestrator system prompts.
- `GET /assistant/knowledge/packs` returns installed packs visible to the current user, filtered by the organization allowlist.
- `TestConnectionPanel` shows probe metadata and the pack inference trace.
- `PackPicker` uses the proxy pack registry and lets the author confirm or override the inferred pack/sub-vertical.
- `AISidebar` forwards the author-confirmed `pack` and `subVertical` to the proxy.

Not implemented yet:

- Knowledge Base browser for glossary, ontology, KPIs, sample questions, and references.
- Governed retrieval/index provider layer.
- Tool-callable KPI/reference lookup.
- Golden-question eval runner.
- Pack authoring UI.

The pack contract is documented in [pulsepacks/PACK_SPECIFICATION.md](../pulsepacks/PACK_SPECIFICATION.md). The broader Knowledge plane and retrieval architecture is documented in [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md).

## Pack vs Knowledge Base

Do not use these terms interchangeably:

| Term | Meaning |
|---|---|
| **PulsePack** | Curated domain content and presets stored under `pulsepacks/` |
| **Knowledge Base** | Inspectable content library plus future retrieval/source/index management |
| **Knowledge source** | A source system or content set such as PulsePack files, BI metadata, SharePoint, S3, Unity Catalog docs, or Git docs |
| **Knowledge index** | A provider-backed search index such as Databricks Vector Search, Azure AI Search, Bedrock Knowledge Base, OpenAI vector store, or local dev index |
| **GroundingBundle** | Normalized retrieval result sent to any AI connector |

The first implementation should make packs discoverable and inspectable before attempting full RAG.

## Pack governance

For internal-org packs:

- One pack per business vertical (CPG, manufacturing, finance, etc.)
- Owned by the team that uses the pack the most
- Sync upstream changes from PulsePlay core into the pack on every minor version
- Lint pack against the spec on commit
- Mark scaffolded content and SME review gaps explicitly in `MIGRATION_NOTES.md`
- Require citations for standards, formulas, statistics, and external claims
- Maintain a source register with stable source IDs, credibility tiers, owner/review metadata, and limitations for paywalled or partially verified sources. See [KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md](KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md).
- Treat prompt-context, Prompt IR, chart rules, and KPI formulas as runtime-adjacent content. They need source IDs or SME approval before being treated as system authority.

For (future) public packs:

- Pack registry / discovery (see [PUBLIC_OSS_AGENDA.md](PUBLIC_OSS_AGENDA.md))
- Conformance suite each pack must pass
- Versioned pack contract (semver) with backward-compat support window

## Status

The first pack, [pulsepacks/cpg-fmcg/](../pulsepacks/cpg-fmcg/README.md), exists and is already used for Smart Connect pack inference and prompt-context injection. It is still a scaffold, not a production SME-certified pack.

Brutal honesty: PulsePlay currently has pack content plus prompt-context injection. It does **not** yet have full governed retrieval, vector indexing, citations, ACL-trimmed source retrieval, or an authoring surface.

## Related docs

- [pulsepacks/PACK_SPECIFICATION.md](../pulsepacks/PACK_SPECIFICATION.md) — the contract every pack implements
- [KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md](KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md) — provenance, source-card, source-tier, and pack-linter baseline
- [pulsepacks/cpg-fmcg/README.md](../pulsepacks/cpg-fmcg/README.md) — the first reference pack
- [inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md](inherited/CPG_FMCG_ENTERPRISE_BLUEPRINT.md) — inherited CPG/FMCG blueprint reference
- [ARCHITECTURE.md](ARCHITECTURE.md) — how packs plug into the proxy and the playground
- [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md) — probe and pack inference design
- [KNOWLEDGE_BASE_ARCHITECTURE.md](KNOWLEDGE_BASE_ARCHITECTURE.md) — Knowledge plane, retrieval contracts, Settings IA, and Knowledge Base IA
- [ROADMAP.md](ROADMAP.md) — versioned delivery plan
