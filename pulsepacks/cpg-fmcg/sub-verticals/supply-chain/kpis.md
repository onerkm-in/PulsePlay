# Supply Chain — KPIs

Canonical supply-chain KPIs in CPG/FMCG. Each KPI is defined once here and referenced by sample questions, prompt context, and the BI/AI fit notes.

## OTIF (On-Time In-Full)

- **Definition.** Percentage of orders delivered both on time and complete to the customer-defined window.
- **Formula.** OTIF % = (orders meeting both the customer's on-time window AND the customer's quantity completeness rule) / (total orders in scope) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Industry-standard CPG supply chain KPI. Specific tolerance windows are customer-defined (e.g. Walmart's OTIF program defines its own delivery-window and fill-rate thresholds; refer to Walmart's supplier portal for current rules).
- **Refresh cadence.** Daily for actuals; weekly for trend reporting.
- **Notes.** OTIF misses are increasingly tied to retailer-imposed fines (deductions). Track the fine impact alongside the KPI itself.

## Case Fill Rate

- **Definition.** Percentage of cases ordered that were shipped on the original line.
- **Formula.** Case fill rate % = (cases shipped on original line) / (cases ordered) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Industry-standard CPG supply chain KPI.
- **Refresh cadence.** Daily.

## Line Fill Rate

- **Definition.** Percentage of order lines shipped complete.
- **Formula.** Line fill rate % = (lines shipped complete) / (lines ordered) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Industry-standard CPG supply chain KPI.
- **Refresh cadence.** Daily.

## Forecast Accuracy / Bias

- **Definition.** Forecast accuracy is typically reported as 1 - WMAPE (Weighted Mean Absolute Percentage Error) at SKU-location-week granularity. Forecast bias measures systematic over- or under-forecasting.
- **Formula.**
  - WMAPE = sum(|forecast - actual|) / sum(actual)
  - 1 - WMAPE expressed as a percentage is the accuracy view
  - Bias = sum(forecast - actual) / sum(actual)
- **Direction.** Forecast accuracy: higher is better. Bias: target band around 0.
- **Source / standard.** APICS / ASCM body of knowledge; standard demand-planning practice.
- **Refresh cadence.** Weekly (forecast cycle); monthly for governance review.
- **Notes.** Always pair accuracy with bias. A forecast can be unbiased and inaccurate, or biased and accurate over a moving window.

## Inventory Days (Days of Inventory On Hand)

- **Definition.** Inventory on hand expressed in days of forward demand or days of trailing cost of goods sold.
- **Formula.** Inventory days = (inventory value) / (average daily COGS).
- **Direction.** Target band — too low risks stockouts, too high consumes working capital.
- **Source / standard.** Standard finance / supply chain KPI.
- **Refresh cadence.** Weekly (operational); monthly (working-capital governance).

## Stockout Risk Score (forward-looking)

- **Definition.** Probability that a SKU-DC will experience a stockout in a forward window (typically 14 or 28 days).
- **Formula.** Definition-only. Most CPG enterprises score using model-driven probability over open inventory, in-transit, planned production, forecast, and promo-pull. Specific implementations vary by planning vendor (SAP IBP, Kinaxis, Blue Yonder, o9 each provide their own).
- **Direction.** Lower is better.
- **Source / standard.** Industry practice; specific definitions are vendor-specific.
- **Refresh cadence.** Daily.

## Service Level

- **Definition.** Percentage of demand satisfied within a customer-defined window. Often used interchangeably with case fill rate in CPG.
- **Formula.** Service level % = (units / cases / orders satisfied within window) / (units / cases / orders demanded) x 100. Specific basis depends on which "service" you measure (customer service vs DC service vs plant service).
- **Direction.** Higher is better.
- **Source / standard.** Industry-standard CPG supply chain KPI.
- **Refresh cadence.** Daily.

## Cost-to-Serve

- **Definition.** Fully-loaded cost (manufacturing, logistics, fulfilment, customer service, returns, deductions) of serving a specific customer, channel, or order pattern.
- **Formula.** Definition-only at KPI level; built up from activity-based cost allocation across order, line, pick, ship, deliver, return, and deduction events.
- **Direction.** Lower is better, with the caveat that low cost-to-serve can mask service shortfall.
- **Source / standard.** Standard managerial-accounting / supply chain practice.
- **Refresh cadence.** Monthly.

## On-Time Shipment %

- **Definition.** Percentage of shipments that left the DC on the planned ship date.
- **Formula.** On-time shipment % = (shipments leaving on or before planned date) / (total shipments) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard logistics KPI.
- **Refresh cadence.** Daily.
- **Notes.** On-time shipment is upstream of OTIF. A miss here propagates to a miss there.

## Carrier On-Time %

- **Definition.** Percentage of shipments where the carrier delivered within the agreed transit window.
- **Formula.** Carrier on-time % = (deliveries within transit window) / (deliveries shipped) x 100, sliced by carrier and lane.
- **Direction.** Higher is better.
- **Source / standard.** Standard logistics KPI.
- **Refresh cadence.** Daily.

## Cross-references

- See [glossary](../../knowledge-base/glossary.md) for term definitions.
- See [ontology](../../knowledge-base/ontology.md) for entities involved (Order, Lane, Carrier, DC, Plant).
- See [bi-ai-fit.md](bi-ai-fit.md) for which BI surface typically holds the certified version of each KPI.
