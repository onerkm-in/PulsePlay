# Manufacturing — KPIs

## OEE (Overall Equipment Effectiveness)

- **Definition.** Composite measure of how effectively a manufacturing line is utilised, expressed as Availability x Performance x Quality.
- **Formula.** OEE = Availability x Performance x Quality, where:
  - Availability = (run time) / (planned production time)
  - Performance = (ideal cycle time x total count) / (run time)
  - Quality = (good count) / (total count)
- **Direction.** Higher is better. World-class is conventionally cited as ~85% in discrete manufacturing; CPG benchmarks vary by category and line type.
- **Source / standard.** TPM (Total Productive Maintenance) practice; codified in ISO 22400 manufacturing operations management KPI standard. https://www.iso.org/standard/56847.html
- **Refresh cadence.** Real-time on the line; shift-summary level for management reporting.

## TEEP (Total Effective Equipment Performance)

- **Definition.** OEE x Utilisation, where utilisation accounts for time the line was scheduled vs. calendar.
- **Formula.** TEEP = OEE x (planned production time) / (calendar time).
- **Direction.** Higher is better.
- **Source / standard.** TPM extension to OEE; useful when calendar utilisation is itself a lever.
- **Refresh cadence.** Weekly.

## Yield (First Pass Yield)

- **Definition.** Percentage of units that passed quality checks on first attempt without rework.
- **Formula.** First pass yield % = (good units) / (total started units) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard manufacturing quality KPI; aligns with ISO 22400.
- **Refresh cadence.** Per batch / shift.

## Scrap Rate / Waste Rate

- **Definition.** Percentage of input material that became scrap or unusable waste.
- **Formula.** Scrap rate % = (scrap weight) / (input weight) x 100.
- **Direction.** Lower is better.
- **Source / standard.** Standard manufacturing-loss accounting; aligns with TPM "six big losses" framework.
- **Refresh cadence.** Per batch / shift.

## Plan Adherence

- **Definition.** Percentage of planned production that was actually produced in the planned window.
- **Formula.** Plan adherence % = (units produced in plan window) / (units planned for window) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard production-control KPI.
- **Refresh cadence.** Daily.

## MTBF (Mean Time Between Failures)

- **Definition.** Average operating time between unplanned equipment failures.
- **Formula.** MTBF = (total operating time) / (number of failures).
- **Direction.** Higher is better.
- **Source / standard.** Standard reliability engineering KPI.
- **Refresh cadence.** Monthly trend; per-incident events tracked daily.

## MTTR (Mean Time To Repair)

- **Definition.** Average time to restore equipment to operational status after failure.
- **Formula.** MTTR = (total downtime due to failures) / (number of failures).
- **Direction.** Lower is better.
- **Source / standard.** Standard reliability engineering KPI.
- **Refresh cadence.** Monthly trend.

## Quality Deviation Rate

- **Definition.** Number of quality deviations per N batches or per N units produced, sliced by deviation category.
- **Formula.** Definition-only at KPI level; specific normalisation depends on category.
- **Direction.** Lower is better.
- **Source / standard.** Aligns with GFSI-benchmarked food-safety schemes (FSSC 22000, BRCGS, SQF).
- **Refresh cadence.** Weekly.

## Recordable Safety Incident Rate (TRIR / TRIFR)

- **Definition.** Total Recordable Incident Rate; recordable injuries per 200,000 hours worked (US OSHA basis) or per million hours (TRIFR international).
- **Formula.** TRIR = (recordable incidents x 200,000) / (total hours worked).
- **Direction.** Lower is better.
- **Source / standard.** US OSHA recordkeeping (29 CFR 1904); ILO conventions for international.
- **Refresh cadence.** Monthly.

## Energy Intensity (per unit produced)

- **Definition.** Energy consumed per unit of finished good output, typically kWh per case or per kg.
- **Formula.** Energy intensity = (total energy consumed) / (units of output).
- **Direction.** Lower is better.
- **Source / standard.** Aligns with GHG Protocol Scope 2 calculation inputs and ISO 50001 energy management standard.
- **Refresh cadence.** Daily for line-level; monthly for site-level reporting.

## Water Intensity (per unit produced)

- **Definition.** Water withdrawn per unit of finished good output, typically litres per case or per kg.
- **Formula.** Water intensity = (water withdrawn) / (units of output).
- **Direction.** Lower is better, with stressed-basin attention.
- **Source / standard.** Aligns with GRI 303 Water and Effluents standard. https://www.globalreporting.org/standards/
- **Refresh cadence.** Daily for line-level; monthly for site-level reporting.
