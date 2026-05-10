# Sustainability — KPIs

Every KPI here is anchored to a canonical framework. Where the canonical framework prescribes a calculation, the formula is cited rather than restated, to avoid implementation drift.

## Scope 1 GHG Emissions (tCO2e)

- **Definition.** Direct emissions from owned or controlled sources (combustion in plants, fleet vehicles, refrigerants).
- **Formula.** Per **GHG Protocol Corporate Standard** chapter 6 calculation guidance. Activity data (fuel volume, refrigerant leakage) x emission factor (kg CO2e per unit), summed across sources. https://ghgprotocol.org/corporate-standard
- **Direction.** Lower is better; trajectory should align with SBTi-validated target if applicable.
- **Refresh cadence.** Monthly for operational tracking; annual for disclosure.

## Scope 2 GHG Emissions — Location-Based and Market-Based (tCO2e)

- **Definition.** Indirect emissions from purchased electricity, steam, heating, cooling. Per GHG Protocol Scope 2 Guidance, **both** methods are required for disclosure.
- **Formula.**
  - Location-based: consumption x grid-average emission factor (eGRID, IEA, EU, etc.).
  - Market-based: consumption x supplier-specific or contractual instrument emission factor (PPAs, RECs, GOs).
- **Direction.** Lower is better; renewable-electricity programs reduce market-based but not necessarily location-based.
- **Source / standard.** GHG Protocol Scope 2 Guidance. https://ghgprotocol.org/scope-2-guidance
- **Refresh cadence.** Monthly for operational; annual for disclosure.

## Scope 3 GHG Emissions by Category (tCO2e)

- **Definition.** Indirect emissions across 15 value-chain categories. Categories are defined by the **GHG Protocol Corporate Value Chain (Scope 3) Standard**.
- **Formula.** Per category-specific calculation guidance in the Scope 3 Standard. Data-quality hierarchy: supplier-specific > activity-based with industry-average factors > spend-based.
- **Direction.** Lower is better.
- **Source / standard.** GHG Protocol Scope 3 Standard. https://ghgprotocol.org/standards/scope-3-standard
- **Refresh cadence.** Annual for disclosure; quarterly trend reporting where data quality permits.

## Emissions Intensity (tCO2e per unit of product or per unit of revenue)

- **Definition.** Emissions normalised by output. Common denominators: tCO2e per ton of product, tCO2e per case, tCO2e per $M revenue.
- **Formula.** Emissions intensity = (emissions in scope) / (output in scope).
- **Direction.** Lower is better.
- **Source / standard.** Standard intensity-metric practice; aligns with SBTi target setting.
- **Refresh cadence.** Quarterly.

## Renewable Electricity %

- **Definition.** Share of electricity consumption sourced from renewable energy via direct generation, PPAs, RECs, or guarantees of origin.
- **Formula.** Renewable electricity % = (renewable MWh) / (total MWh).
- **Direction.** Higher is better against org-defined target (e.g. RE100 100% by year Y).
- **Source / standard.** RE100 (https://www.there100.org/). Reporting aligns with GHG Protocol Scope 2 market-based method.
- **Refresh cadence.** Quarterly.

## Water Withdrawal (m3)

- **Definition.** Total water withdrawn from all sources (municipal, surface, ground, third-party).
- **Formula.** Per **GRI 303-3 Water withdrawal** disclosure requirements.
- **Direction.** Lower is better, with stressed-basin emphasis.
- **Source / standard.** GRI 303 Water and Effluents. https://www.globalreporting.org/standards/
- **Refresh cadence.** Monthly.

## Water Consumption (m3) and Stressed-Basin Share

- **Definition.** Water withdrawal minus discharge; share of consumption occurring in water-stressed basins (per WRI Aqueduct).
- **Formula.** Consumption = withdrawal - discharge. Stressed-basin share = (consumption in stressed basins) / (total consumption).
- **Direction.** Lower is better; stressed-basin share has additional weight.
- **Source / standard.** GRI 303-5; WRI Aqueduct (https://www.wri.org/aqueduct).
- **Refresh cadence.** Monthly.

## Waste Generated and Diverted (tonnes, %)

- **Definition.** Total waste generated; share diverted from disposal (recycled, recovered, composted) vs disposed (incinerated without energy recovery, landfilled).
- **Formula.** Per **GRI 306 Waste** disclosure requirements.
- **Direction.** Total: lower is better. Diversion %: higher is better.
- **Source / standard.** GRI 306. https://www.globalreporting.org/standards/
- **Refresh cadence.** Monthly.

## Packaging Recyclability % and Recycled-Content %

- **Definition.** Share of packaging volume / weight that is recyclable per a defined scheme (APR, Ceflex, etc.). Share of packaging-material weight that is recycled content.
- **Formula.** Definition-only; classification is scheme-specific.
- **Direction.** Higher is better.
- **Source / standard.** ESRS E5 Resource Use and Circular Economy; APR (https://plasticsrecycling.org/), Ceflex (https://ceflex.eu/) for European flexible packaging.
- **Refresh cadence.** Quarterly.

## SBTi Target Adherence

- **Definition.** Annual progress vs SBTi-validated near-term and long-term emissions-reduction targets.
- **Formula.** Per SBTi Corporate Net-Zero Standard methodology. https://sciencebasedtargets.org/net-zero
- **Direction.** On-track or ahead is the target state.
- **Source / standard.** SBTi.
- **Refresh cadence.** Annual.

## CDP Disclosure Score

- **Definition.** Score awarded by CDP for the quality of climate (and water, forests where applicable) disclosure.
- **Formula.** CDP scoring methodology (D, D-, C, C-, B, B-, A-, A).
- **Direction.** Higher is better.
- **Source / standard.** CDP. https://www.cdp.net/
- **Refresh cadence.** Annual.

## ESRS / CSRD Datapoint Coverage %

- **Definition.** Percentage of material ESRS datapoints with full data coverage for the reporting period.
- **Formula.** Coverage % = (datapoints with full coverage) / (material datapoints in scope) x 100.
- **Direction.** Higher is better.
- **Source / standard.** ESRS topical standards. https://www.efrag.org/
- **Refresh cadence.** Annual; with quarterly readiness tracking.

<!-- SME REVIEW NEEDED:
     A sustainability SME should validate that:
     - The Scope 2 dual-method requirement framing is current (it is, per GHG Protocol).
     - The emissions-intensity denominator chosen for the org is consistent with SBTi target (some targets are absolute, some are intensity-based).
     - The CDP scoring methodology version is current.
     - The ESRS topical standard mapping reflects the current EFRAG-published standards. -->
