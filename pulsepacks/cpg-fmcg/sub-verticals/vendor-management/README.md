# Vendor Management

The vendor-management seat is the deeper supplier 360 view that complements [Procurement](../procurement/README.md). Where procurement focuses on sourcing, contracting, and category strategy, vendor management focuses on the ongoing relationship, performance, risk, and dependency management of the suppliers already in the portfolio. In CPG/FMCG, this is increasingly an executive concern because tier 2/3/4 dependencies, financial-health shocks, and Scope 3 supplier emissions can all surface as P&L or compliance impact.

## What this sub-vertical covers

- **Supplier 360**: cost, quality, delivery, risk, sustainability, financial health, cyber posture, contract terms — fused into a single navigable view per supplier.
- **Contract intelligence**: obligations, renewals, rebates, penalties, force-majeure clauses, price-index triggers, rebate-tier thresholds.
- **Commodity exposure**: forward exposure by commodity, with supplier pass-through clauses overlaid; coordinated with treasury hedging.
- **Tier 2/3/4 dependency mapping**: detecting masked concentration where multiple tier-1 suppliers depend on the same tier-2 supplier.
- **ESG scorecards**: supplier sustainability disclosure, Scope 3 attribution, social and governance signals.
- **Onboarding and offboarding workflows**: due-diligence checks, ESG attestation, financial-health screen, cyber posture evaluation.

## Why a CPG team uses this

- "For supplier S, give me the full 360: spend, quality (PPM), on-time delivery, financial-health rating, ESG score, open quality deviations, contract obligations expiring, cyber-incident flags."
- "Renewal cycle: of the 47 contracts expiring in the next 90 days, which carry the highest renegotiation leverage and which carry the highest sole-source risk?"
- "Tier 2 mapping: do any of our top 20 tier-1 suppliers share a single tier-2 dependency on a specific raw material or sub-component?"
- "Supplier S has triggered three financial-health-watch flags in the last quarter. What is the dual-source / replacement plan?"
- "ESG: which suppliers have failed to submit a CDP disclosure, and which have but report at C or below?"

## Typical data sources

- **Source-to-pay platforms**: SAP Ariba, Coupa, Ivalua, Jaggaer, GEP, Zycus.
- **Supplier risk and intelligence**: D&B, Bloomberg, Reuters, RapidRatings (financial), Resilinc (multi-tier), Sphera (operational), Interos, Sayari (ownership / sanctions), SecurityScorecard / BitSight (cyber), Riskmethods, Everstream Analytics.
- **Supplier sustainability**: EcoVadis, CDP, supplier self-disclosures.
- **Contract lifecycle management**: Icertis, Agiloft, Ironclad, DocuSign CLM.
- **Quality**: SAP QM, LIMS, internal complaint logs.
- **Internal**: vendor master, AP data, supplier scorecards.

## Cross-cutting overlays

- **[Sustainability](../sustainability/README.md)**: Scope 3 supplier emissions (cat. 1 purchased goods and services), supplier ESG disclosures, sustainable-procurement evidence.
- **[Procurement](../procurement/README.md)**: this sub-vertical produces the vendor-side intelligence that procurement uses for sourcing decisions.
- **[Manufacturing](../manufacturing/README.md)**: supplier-driven quality and material issues that surface in plant operations.
- **[Finance / FP&A](../finance-fpa/README.md)**: AP, DPO, working-capital implications of supplier terms.

## Sub-vertical contents

- [sample-questions.md](sample-questions.md)
- [kpis.md](kpis.md)
- [bi-ai-fit.md](bi-ai-fit.md)

## Notable design notes

The "Ingredient and Packaging Risk Radar" pattern from the CPG enterprise blueprint lives here: detect risks from commodity volatility, crop / weather signals, geopolitical exposure, supplier concentration, quality incidents, and regulatory change — and surface them with priority scoring. This pattern intentionally crosses Procurement and Vendor Management boundaries; it is implemented in this sub-vertical because the underlying data fabric is the supplier 360, not the spend cube.
