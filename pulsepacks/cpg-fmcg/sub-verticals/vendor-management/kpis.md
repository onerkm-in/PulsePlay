# Vendor Management — KPIs

These KPIs sit alongside [Procurement KPIs](../procurement/kpis.md). The split is intentional: procurement KPIs are about the procurement function's output (savings, contract coverage, maverick spend); vendor-management KPIs are about the supplier portfolio's health (concentration, risk-rating distribution, dependency exposure, ESG performance).

## Supplier Concentration (top-N spend share)

- **Definition.** Share of category or total spend held by the top 1, top 3, top 5 suppliers.
- **Formula.** Top-N concentration = (spend with top N suppliers) / (total category spend) x 100.
- **Direction.** Lower is generally better for resilience; trade-off against scale economics.
- **Source / standard.** Standard procurement / supply chain risk KPI.
- **Refresh cadence.** Quarterly.

## Tier-2 Hidden Concentration

- **Definition.** Share of tier-1 spend whose tier-2 input traces back to a single tier-2 supplier or geography.
- **Formula.** Definition-only at KPI level; depends on multi-tier visibility data (Resilinc, Sayari, Interos).
- **Direction.** Lower is better.
- **Source / standard.** Multi-tier supply chain visibility practice.
- **Refresh cadence.** Quarterly.

## Supplier Financial-Health Distribution

- **Definition.** Distribution of suppliers across financial-health rating bands (e.g. RapidRatings FHR low / medium / high).
- **Formula.** Distribution % = (suppliers in band) / (total suppliers in scope) x 100, weighted by spend for risk-weighted view.
- **Direction.** Right-shift toward higher-health bands is better.
- **Source / standard.** Vendor-specific (RapidRatings, D&B Failure Score, etc.).
- **Refresh cadence.** Quarterly.

## Supplier Risk Score (composite)

- **Definition.** Composite score across financial, geopolitical, operational, cyber, and ESG dimensions.
- **Formula.** Definition-only at KPI level; specific composites are vendor-defined or org-defined.
- **Direction.** Lower is better (where higher scores indicate higher risk).
- **Source / standard.** Vendor-specific (Resilinc, Sphera, Interos, Everstream); some orgs build internal composites.
- **Refresh cadence.** Monthly.

## Contract Renewal Pipeline Coverage

- **Definition.** Percentage of expiring contracts (next 12 months) with an active renewal plan.
- **Formula.** Renewal coverage % = (contracts with active renewal plan) / (contracts expiring in 12 months) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard CLM / procurement governance KPI.
- **Refresh cadence.** Monthly.

## Supplier OTD (On-Time Delivery)

- **Definition.** See [Procurement KPIs](../procurement/kpis.md).
- **Refresh cadence.** Daily for operational view.

## Supplier Quality (PPM Defects)

- **Definition.** See [Procurement KPIs](../procurement/kpis.md).
- **Refresh cadence.** Weekly.

## Supplier ESG Disclosure Completeness

- **Definition.** Percentage of suppliers (or spend-weighted suppliers) that have completed the company's ESG-attestation requirements (CDP submission, EcoVadis rating, supplier code of conduct sign-off, SBTi alignment status).
- **Formula.** Disclosure completeness % = (suppliers with complete attestation) / (suppliers in scope) x 100, often weighted by spend.
- **Direction.** Higher is better.
- **Source / standard.** Aligns with CDP supply-chain program and CSRD value-chain reporting expectations.
- **Refresh cadence.** Annual; with quarterly refresh as disclosures arrive.

## Spend with Diverse / Sustainable Suppliers

- **Definition.** Spend with certified diverse-owned suppliers (where applicable in jurisdiction) or with suppliers above a defined sustainability threshold (e.g. EcoVadis Gold/Silver, CDP A-list).
- **Formula.** Diverse / sustainable spend % = (spend with qualifying suppliers) / (total spend) x 100.
- **Direction.** Higher is better against org-defined target.
- **Source / standard.** Standard sustainable-procurement practice; specific qualifying criteria are jurisdiction- and org-defined.
- **Refresh cadence.** Quarterly.

## Cyber Posture Average (supplier portfolio)

- **Definition.** Average or distribution of supplier cyber-posture ratings across the portfolio.
- **Formula.** Definition-only; specific calculation depends on the cyber-rating vendor (BitSight, SecurityScorecard, UpGuard).
- **Direction.** Higher is better.
- **Source / standard.** Vendor-specific cyber-posture rating.
- **Refresh cadence.** Monthly.

## Onboarding Cycle Time

- **Definition.** Average time from supplier-onboarding initiation to fully approved status.
- **Formula.** Onboarding cycle time = average days from initiation to approval, by supplier type.
- **Direction.** Lower is better, balanced against due-diligence rigor.
- **Source / standard.** Standard procurement-operations KPI.
- **Refresh cadence.** Monthly.
