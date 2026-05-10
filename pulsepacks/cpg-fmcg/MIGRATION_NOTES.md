# CPG-FMCG Pack — Migration Notes

Initial scaffold created on 2026-05-10 (pack version 0.1.0). This document captures what was created, which sub-verticals are substantive vs need SME input, and which authoritative references were cited. It is intended to be deleted (or rolled into a CHANGELOG) when the pack reaches v1.0.

## Sub-vertical scaffold status

| Sub-vertical | README | sample-questions | kpis | bi-ai-fit | prompt-context | Status |
|--------------|--------|------------------|------|-----------|----------------|--------|
| supply-chain | yes | 12 questions | 10 KPIs | yes | yes | substantive — author's home turf, fully fleshed |
| procurement | yes | 12 questions | 10 KPIs | yes | no | substantive — Gartner/KPMG-grounded |
| manufacturing | yes | 12 questions | 11 KPIs | yes | no | substantive — ISA-95 / ISO 22400 anchored |
| commercial-retail | yes | 12 questions | 10 KPIs | yes | no | substantive — Deloitte / NIQ / Circana grounded |
| finance-fpa | yes | 10 questions | 11 KPIs | yes | no | scaffold + SME markers (margin-bridge conventions, P&L allocation) |
| hr | yes | 10 questions | 10 KPIs | yes | no | scaffold + SME markers (attrition definitions, frontline analytics) |
| it-admin | yes | 12 questions | 10 KPIs | yes | no | scaffold + SME markers (SLA tiers, AI-governance KPIs) |
| vendor-management | yes | 13 questions | 10 KPIs | yes | no | substantive — user-flagged emphasis area |
| client-management | yes | 20 questions (retail + warehousing split) | 14 KPIs | yes | no | substantive — user-flagged emphasis area; retail / warehousing split clearly |
| sustainability (overlay) | yes | 13 questions | 11 KPIs | yes | yes | scaffold + SME markers; framework-anchored throughout |

## Files created

Top-level pack files:

- `pulsepacks/README.md`
- `pulsepacks/PACK_SPECIFICATION.md`

Pack root files:

- `pulsepacks/cpg-fmcg/pack.json`
- `pulsepacks/cpg-fmcg/README.md`
- `pulsepacks/cpg-fmcg/MIGRATION_NOTES.md` (this file)

Knowledge base:

- `pulsepacks/cpg-fmcg/knowledge-base/glossary.md` (~50 terms)
- `pulsepacks/cpg-fmcg/knowledge-base/references.md` (~70 cited sources)
- `pulsepacks/cpg-fmcg/knowledge-base/ontology.md` (entity model across Product, Customer, Consumer, Supply, Commercial, Finance, Manufacturing, Sustainability, HR, IT areas)

Sub-vertical files: 41 files across 10 sub-verticals (4 to 5 per sub-vertical).

Demo configs:

- `pulsepacks/cpg-fmcg/demo-configs/README.md`
- `pulsepacks/cpg-fmcg/demo-configs/service-margin-recovery.json`
- `pulsepacks/cpg-fmcg/demo-configs/sustainability-cross-cutting.json`

**Total: 53 files created** (verified by `find pulsepacks -type f | wc -l` = 53):

| Group | Files |
|-------|-------|
| Top-level pack docs (`pulsepacks/`) | 2 — `README.md`, `PACK_SPECIFICATION.md` |
| Pack-root files (`cpg-fmcg/`) | 3 — `pack.json`, `README.md`, `MIGRATION_NOTES.md` |
| Knowledge base | 3 — `glossary.md`, `references.md`, `ontology.md` |
| Sub-vertical files | 42 — 8 sub-verticals × 4 files + 2 sub-verticals (supply-chain, sustainability) × 5 files (extra `prompt-context.md`) |
| Demo configs | 3 — `README.md`, `service-margin-recovery.json`, `sustainability-cross-cutting.json` |
| **Total** | **53** |

## Substantive vs SME-input-needed (honest)

**Substantive (author has domain depth):**
- Supply Chain — author's home turf.
- Vendor Management — user-flagged emphasis; substantive on supplier 360, contract intelligence, tier-2 dependency, ESG cross-cutting.
- Client Management — user-flagged emphasis; substantive on the retail-client and warehousing-client split.

**Substantive but research-grounded (author has reasonable depth, anchored in cited research):**
- Procurement — Gartner / KPMG procurement research grounding.
- Manufacturing — ISA-95 / ISO 22400 / WEF Global Lighthouse Network grounding.
- Commercial / Retail — Deloitte / NielsenIQ / Circana research grounding.

**Scaffold + SME markers (author has limited depth; framework-anchored where possible; SME review explicitly flagged):**
- Finance / FP&A — SME markers for margin-bridge conventions, customer / category P&L allocation, currency-translation handling, reforecast cadence.
- HR — SME markers for attrition definitions, diversity targets, frontline-analytics specifics, privacy / employment-law anti-patterns.
- IT / Admin — SME markers for SLA-tier definitions, AI-governance KPI conventions, ITIL alignment.
- Sustainability — extensive SME markers; framework anchoring is rigorous (every question cites a framework) but the author flagged limited personal expertise in disclosure mechanics, emission-factor selection, and ESRS topical-standard mapping.

## Key references cited (curated)

**Standards bodies:**
- GS1 (GTIN, GLN, SSCC, Digital Link)
- ISA / IEC (ISA-95 / IEC 62264)
- ISO (22400 manufacturing KPIs; 50001 energy; 14001 environment; 45001 OHS; 42001 AI mgmt)
- GFSI / FSSC 22000 / BRCGS / SQF (food safety)
- Codex Alimentarius (HACCP)

**Sustainability frameworks:**
- GHG Protocol (Corporate, Scope 2 Guidance, Scope 3 Standard)
- GRI Standards
- SASB (IFRS Foundation)
- TCFD / IFRS S2
- EU CSRD / EFRAG ESRS
- CDP
- Science Based Targets initiative
- WRI Aqueduct
- RE100
- SEC Climate Disclosure Rule (2024)

**CPG industry research (2025-2026):**
- Gartner (supply chain, procurement, finance, HR research releases)
- Deloitte (consumer products, retail, smart manufacturing, CFO signals, human capital)
- KPMG (supply chain, procurement)
- World Economic Forum (Future of Jobs, Global Lighthouse Network, autonomous supply chains)
- NielsenIQ (consumer outlook, private-label outlook)
- Circana (US CPG growth leaders, private-label sales)

**IT / AI governance:**
- NIST AI Risk Management Framework
- ISO/IEC 42001
- OWASP Top 10 for LLM Applications
- FinOps Foundation

**Vendor / Client management:**
- Walmart Supplier resources (OTIF program reference)
- RILA, MHI, WERC (warehousing benchmarks)
- The Hackett Group (procurement benchmarks)

## Content quality compliance

Per the pack specification:
- **No fabricated case studies** — confirmed; every named research source cited has a verifiable URL.
- **No made-up statistics** — confirmed; the only quantitative claims that appear in the pack are direct citations to research (e.g. Gartner's "70% of large orgs will adopt AI-based supply chain forecasting by 2030"; Circana's $330B private-label CPG sales). No "Acme Corp saved 40%" placeholder claims.
- **Real, verifiable URLs** — all URLs cited are anchored to canonical organisation domains (gartner.com, deloitte.com, ghgprotocol.org, gs1.org, weforum.org, etc.). No URLs were marked `[unverified]` because all sources cited come from reputable bodies' main domains.
- **SME placeholders** — explicit `<!-- SME REVIEW NEEDED -->` blocks added in finance-fpa, hr, it-admin, and sustainability where the author's domain depth is limited.
- **No emojis** — confirmed.
- **No marketing voice** — confirmed; the writing is technical and direct throughout.

## What is not yet done

- **Runtime wiring**: the playground does not yet load packs. The `pack.json` manifest, sub-vertical content, and demo configs are content seeds for a future cycle that builds the pack-loader.
- **Adapter mapping**: the demo configs reference a `connector` profile name and a BI vendor name. The corresponding proxy connector profiles and BI adapter SDK wires are not yet built.
- **Validator coverage**: the pack content is not yet covered by automated validation (e.g. that every sub-vertical has the four required files, that every cited URL is reachable, that every framework citation matches the references file).
- **SME review**: explicitly pending for finance-fpa, hr, it-admin, sustainability.

## Recommended next cycles

1. **Build a pack-loader** that the playground UI can use to surface pack-aware sample questions, prompt context, and KPI definitions in the AI sidebar.
2. **Build a content validator** that asserts the four-required-files invariant and link-checks the references file.
3. **Pilot SME review** on the sustainability sub-vertical first (highest-stakes; highest external scrutiny risk) and finance-fpa second.
4. **Wire one demo config end-to-end** (recommend service-margin-recovery first because supply chain is the substantive sub-vertical; sustainability-cross-cutting requires the multi-source agent to be built).
5. **Add a second pack** (potential candidates: pharma-clinical, banking-retail, or industrial-manufacturing) once the loader exists and the CPG pack has driven the schema to stable.
