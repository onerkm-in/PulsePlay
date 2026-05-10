# Sustainability (Cross-Cutting Overlay)

Sustainability is **not a peer sub-vertical**. It is a cross-cutting overlay. A real CPG sustainability question is rarely answered from a single sustainability data source — it is answered by combining data from manufacturing, procurement, supply chain, HR, finance, and product.

This README documents the overlay pattern: how the AI sidebar should compose answers across sub-verticals, which framework underlies each question type, and where the SME-input gaps are.

## Why the overlay pattern

A question like *"What is our Scope 3 emission breakdown by supplier tier?"* requires:

- Spend or supplier-specific activity data from [Procurement](../procurement/README.md) and [Vendor Management](../vendor-management/README.md).
- Supplier emission factors or supplier-disclosed emissions (CDP, EcoVadis, supplier sustainability reports).
- A multi-tier visibility data feed (Resilinc, Sayari, Interos) for tier-2/3/4 attribution.
- Reconciliation against the company's GHG Protocol Scope 3 Standard category mapping.

A question like *"Which manufacturing lines drive the most water consumption?"* requires:

- Line-level water meter data from [Manufacturing](../manufacturing/README.md).
- Stressed-basin classification (e.g. WRI Aqueduct).
- Production output for normalisation (water intensity per unit produced).
- GRI 303 reporting alignment.

A question like *"How does our packaging recyclability rate compare to CSRD targets?"* requires:

- Packaging-material data from [Procurement](../procurement/README.md) (specs, recycled content, weight) and [Manufacturing](../manufacturing/README.md) (consumption volumes).
- Recyclability scheme classification (e.g. APR, Ceflex).
- CSRD / ESRS-applicable reporting topic mapping (E5 Resource Use and Circular Economy).

The pack's job in each case is to (a) decompose the question into sub-vertical sub-queries, (b) provide the framework anchor (GHG Protocol category mapping, GRI standard, ESRS topical standard, etc.), and (c) compose the answer with proper provenance and uncertainty bounds.

## What this overlay covers

- **GHG emissions**: Scope 1 (direct), Scope 2 (purchased energy), Scope 3 (15 categories per GHG Protocol Corporate Value Chain Standard).
- **Water**: withdrawal, discharge, stressed-basin attribution.
- **Waste**: process, packaging, food waste; recycle / recover / incinerate / landfill disposition.
- **Packaging**: recycled content, recyclability, weight-out programs.
- **Sustainable sourcing**: certified-source share, deforestation-free, regenerative-agriculture programs.
- **Social and governance**: diversity, safety, supplier code of conduct adherence (ties to HR and vendor management).
- **Reporting**: CDP submission, GRI / SASB / IFRS S2 disclosure, CSRD / ESRS preparation, SBTi target tracking.

## Framework anchors

Every sustainability question in this pack should be anchored to a specific framework. The pack does not invent emission factors or sustainability metrics — it composes answers using the canonical frameworks below.

| Topic | Framework | URL |
|-------|-----------|-----|
| GHG accounting | **GHG Protocol Corporate Standard, Scope 2 Guidance, Scope 3 Standard** | https://ghgprotocol.org/ |
| Sustainability reporting (general) | **GRI Standards** | https://www.globalreporting.org/standards/ |
| Industry-specific materiality | **SASB Standards** (now under IFRS Foundation) | https://sasb.ifrs.org/standards/ |
| Climate-related financial disclosures | **TCFD Recommendations / IFRS S2** | https://www.fsb-tcfd.org/recommendations/ ; https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/ifrs-s2-climate-related-disclosures/ |
| EU sustainability reporting | **CSRD / ESRS** | https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en |
| Environmental disclosure platform | **CDP** | https://www.cdp.net/ |
| Science-based targets | **SBTi** | https://sciencebasedtargets.org/ |
| Water | **GRI 303 Water and Effluents**, **CDP Water Security**, **WRI Aqueduct** | https://www.globalreporting.org/standards/ ; https://www.wri.org/aqueduct |
| US climate disclosure | **SEC Climate Disclosure Rule (2024)** | https://www.sec.gov/news/press-release/2024-31 |

## Overlay decomposition pattern

When a sustainability question lands in the AI sidebar, the agent should:

1. **Identify the framework anchor.** Which standard's definition is the user asking against? (Scope 1/2/3 per GHG Protocol; GRI 303 for water; ESRS E5 for packaging circular economy; etc.)
2. **Decompose into peer sub-vertical queries.** Which sub-verticals' data is required? (Manufacturing for Scope 1; Procurement / Vendor Management for Scope 3 cat. 1; Supply Chain for Scope 3 cat. 4 transport; HR for diversity / safety; Finance for spend-based fallback.)
3. **Compose the answer with provenance.** Each contributing source is named, with calculation method (activity-based vs. spend-based fallback, supplier-specific vs. industry-average factors).
4. **Express uncertainty.** Sustainability data quality varies dramatically — primary supplier data is high-quality, spend-based proxies are coarse. Uncertainty bounds should be visible.
5. **Cite the standard.** Every answer should cite the underlying framework (GHG Protocol Scope 3 Standard, GRI 303-3, etc.).

## Worked example: Scope 3 supplier emissions

A user asks: **"What is our Scope 3 category-1 emissions trajectory by supplier tier?"**

1. **Framework anchor.** GHG Protocol Corporate Value Chain (Scope 3) Standard, category 1 (Purchased goods and services). https://ghgprotocol.org/standards/scope-3-standard
2. **Decomposition.**
   - Tier-1 spend by supplier: from [Procurement](../procurement/README.md) (spend cube).
   - Supplier-specific emission factors: from supplier disclosures (CDP, EcoVadis) where available.
   - Industry-average factors as fallback: from a curated emission-factor library.
   - Tier-2/3/4 share of tier-1 emissions: from multi-tier visibility (Resilinc / Sayari / Interos) where available.
3. **Composition.** The agent produces an attribution table:
   - Tier-1 supplier → Scope 3 cat. 1 tCO2e (calculation method: supplier-specific | spend-based | hybrid).
   - Tier-2 attribution where available, marked as estimated where modelled.
   - Trajectory: 12-month or 24-month rolling.
4. **Uncertainty.** Each supplier row carries a data-quality flag (1 = supplier-specific reported; 2 = supplier-specific modelled; 3 = industry-average activity-based; 4 = spend-based proxy). Aggregate uncertainty is computed and shown.
5. **Citation.** Answer cites GHG Protocol Scope 3 Standard category-1 definition; cites the data-quality scoring scheme used.

## Sub-vertical contents

- [sample-questions.md](sample-questions.md)
- [kpis.md](kpis.md)
- [bi-ai-fit.md](bi-ai-fit.md)
- [prompt-context.md](prompt-context.md)

## Status

<!-- SME REVIEW NEEDED:
     This is a high-importance, high-domain-specificity sub-vertical and the pack author has flagged limited personal expertise in sustainability disclosure mechanics and emission-factor selection.

     A sustainability SME should validate:
     - The framework-anchor table (especially the IFRS S2 vs TCFD transition status, ESRS topical-standard mapping, and SEC climate-disclosure-rule current status given recent rulemaking activity).
     - The Scope 3 category-1 worked example for accuracy of the GHG Protocol allocation methodology terminology.
     - The KPI list against the org's reporting commitments (CDP score, SBTi alignment, CSRD readiness).
     - The water and packaging anchors against current GRI / ESRS standards. -->

The framework references are anchored to canonical organisations and URLs to keep the pack honest about what is industry-standard vs what would be an opinion. Where opinions appear, they are flagged.

## Validation references

- **GHG Protocol** — https://ghgprotocol.org/
- **GRI Standards** — https://www.globalreporting.org/standards/
- **SASB Standards (IFRS Foundation)** — https://sasb.ifrs.org/standards/
- **TCFD Recommendations** — https://www.fsb-tcfd.org/recommendations/
- **IFRS S2 Climate-related Disclosures** — https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/ifrs-s2-climate-related-disclosures/
- **EU CSRD** — https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en
- **CDP** — https://www.cdp.net/
- **Science Based Targets initiative (SBTi)** — https://sciencebasedtargets.org/
- **SEC Climate Disclosure Rule (2024)** — https://www.sec.gov/news/press-release/2024-31
- **WRI Aqueduct (water-stress mapping)** — https://www.wri.org/aqueduct
