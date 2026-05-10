# CPG-FMCG Pack

Preset pack for Consumer Packaged Goods and Fast-Moving Consumer Goods enterprises. Designed for global food, beverage, personal care, household, consumer health, pet care, and adjacent CPG categories with complex routes to market, high-volume manufacturing, fragmented retail channels, and intense input-cost volatility.

## Why this pack exists

A CPG enterprise running PulsePlay typically has:

- A patchwork of BI tools (Power BI for finance and supply chain, Tableau for commercial, Qlik for legacy plant scorecards, Looker for digital shelf and e-commerce).
- A patchwork of AI brains under evaluation (Databricks Genie spaces over the lakehouse, Mosaic Supervisor agents, Foundation Model serving endpoints, vendor-bundled chat assistants, in-progress MCP servers).
- A common vocabulary (OTIF, OEE, NRR, gross-to-net, Scope 3) but no shared semantic layer wiring those terms to certified definitions across tools.

This pack ships the shared vocabulary, the canonical KPIs, the sub-vertical templates, and the demo configurations so a team can wire PulsePlay against their existing systems without re-deriving CPG fundamentals every time.

## Sub-verticals

| Sub-vertical | Status | Substantive vs SME-input-needed |
|--------------|--------|----------------------------------|
| [Supply Chain](sub-verticals/supply-chain/README.md) | substantive | Author's home turf; fully fleshed |
| [Procurement](sub-verticals/procurement/README.md) | substantive | Strong CPG-research grounding |
| [Manufacturing](sub-verticals/manufacturing/README.md) | substantive | ISA-95/ISO 22400 anchored |
| [Commercial / Retail](sub-verticals/commercial-retail/README.md) | substantive | Deloitte / NIQ / Circana grounded |
| [Finance / FP&A](sub-verticals/finance-fpa/README.md) | scaffold | SME review needed for plan-vs-actual conventions |
| [HR](sub-verticals/hr/README.md) | scaffold | SME review needed for frontline analytics |
| [IT / Admin](sub-verticals/it-admin/README.md) | scaffold | SME review needed for service-desk specifics |
| [Vendor Management](sub-verticals/vendor-management/README.md) | substantive | User-flagged emphasis area |
| [Client Management](sub-verticals/client-management/README.md) | substantive | User-flagged emphasis area; split retail vs warehousing |
| [Sustainability (overlay)](sub-verticals/sustainability/README.md) | scaffold | SME review needed; framework-grounded |

## Cross-cutting overlay: Sustainability

Sustainability is not a peer sub-vertical. It is a cross-cutting overlay. A real sustainability question is answered by combining data from manufacturing (Scope 1, water, waste), procurement (Scope 3 supplier emissions), supply chain (transport, packaging), HR (diversity, safety), and finance (CSRD-aligned reporting).

See [Sustainability overlay README](sub-verticals/sustainability/README.md) for the cross-vertical pattern and a worked example.

## Knowledge base

The knowledge base is the part of the pack that is independent of any one sub-vertical:

- [Glossary](knowledge-base/glossary.md) — alphabetical industry vocabulary with sources.
- [References](knowledge-base/references.md) — authoritative external sources organised by sub-vertical.
- [Ontology](knowledge-base/ontology.md) — domain entity model (Product, Customer, Supply, Commercial, Manufacturing, Finance, Sustainability) with relationships.

## Demo configurations

See [demo-configs/README.md](demo-configs/README.md) for the index. The first demo, `service-margin-recovery.json`, follows the "narrow but deep vertical slice" recommendation in the original CPG enterprise blueprint: service-level and margin recovery for one region, one category, one customer cluster.

## How to use this pack today (manual)

The runtime wiring (auto-loading prompt-context, surfacing sample questions in the sidebar, etc.) is not yet implemented. Until then, a team can use this pack manually:

1. Read the relevant sub-vertical's `prompt-context.md` (where present) and paste it into the AI sidebar's system-prompt customization.
2. Pick 3-5 questions from `sample-questions.md` and seed the sidebar with them as suggested prompts.
3. Use the KPI definitions in `kpis.md` as the source of truth when reconciling answers from the AI brain against the BI surface.
4. Open one of the demo configurations from `demo-configs/` to see a concrete BIPanel + AISidebar configuration matching a real CPG decision.

## Status and known gaps

- v0.1.0 = scaffold complete, no SME sign-off yet.
- HR, Sustainability, Finance/FP&A, and IT/Admin sub-verticals all carry SME-review markers in their content. Substantive review by domain experts is the next step.
- Demo configurations are JSON skeletons. The runtime that consumes them (playground-side pack loader) is not yet implemented.
- See [MIGRATION_NOTES.md](MIGRATION_NOTES.md) for the full set of files created and which need SME input.

## References (curated)

The full bibliography is in [knowledge-base/references.md](knowledge-base/references.md). Headline sources:

- **GS1**: product identity and Digital Link standards.
- **ISA-95 / IEC 62264, ISO 22400**: manufacturing integration and KPI standards.
- **GHG Protocol, GRI, SASB, TCFD**: sustainability frameworks.
- **Gartner, Deloitte, KPMG, WEF, NielsenIQ, Circana**: CPG industry research, 2025-2026 reports.
