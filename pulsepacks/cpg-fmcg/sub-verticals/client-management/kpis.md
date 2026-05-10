# Client Management — KPIs

Split by client type.

## Retail-client KPIs

### Customer-Level OTIF

- **Definition.** OTIF (see [Supply Chain KPIs](../supply-chain/kpis.md)) measured at the individual retail-client level, with the retailer's specific window and completeness rule applied.
- **Refresh cadence.** Daily.
- **Notes.** Some retailers (notably Walmart) publish their own OTIF program with associated fines. Track customer-level OTIF against each retailer's specific definition rather than an internal corporate definition.

### Customer-Level Fill Rate

- **Definition.** See [Supply Chain KPIs](../supply-chain/kpis.md). Sliced to customer.
- **Refresh cadence.** Daily.

### Deduction Recovery Rate

- **Definition.** Percentage of disputed deduction value successfully recovered.
- **Formula.** Recovery rate % = (recovered deduction value) / (disputed deduction value) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard CPG receivables practice.
- **Refresh cadence.** Monthly.

### Deduction Days Outstanding

- **Definition.** Average days a deduction sits open before resolution (write-off, recovery, or release).
- **Formula.** Average open days at resolution.
- **Direction.** Lower is better.
- **Source / standard.** Standard CPG receivables practice.
- **Refresh cadence.** Monthly.

### Promo Compliance Rate

- **Definition.** Percentage of promotional events that executed correctly per the agreed plan (right product, right price, right time, right placement).
- **Formula.** Promo compliance % = (compliant events) / (total events) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard retail-execution / TPM KPI.
- **Refresh cadence.** Per-event post-mortem.

### JBP Commitment Adherence

- **Definition.** Adherence to JBP commitments (volume, growth, margin, service, promo) tracked against full-year plan.
- **Formula.** Adherence % varies by commitment dimension.
- **Direction.** Higher is better.
- **Source / standard.** Standard CPG-retailer collaboration practice.
- **Refresh cadence.** Monthly.

### Net Promoter Score / Customer Satisfaction (B2B)

- **Definition.** Retailer-survey-based satisfaction or NPS.
- **Formula.** NPS = % promoters - % detractors.
- **Direction.** Higher is better.
- **Source / standard.** Standard B2B customer-experience practice.
- **Refresh cadence.** Annual / semi-annual.

## Warehousing-client KPIs

### Throughput (cases / pallets / units per period)

- **Definition.** Volume handled per period vs. contracted volume.
- **Formula.** Throughput = (units handled) / (period). Variance to contract = (actual) - (contract).
- **Direction.** Target band — under-utilisation underuses fixed capacity; over-utilisation strains operations and risks SLA breach.
- **Source / standard.** Standard 3PL / warehousing KPI; aligns with WERC DC measures benchmarks.
- **Refresh cadence.** Daily.

### On-Time Loading / Dispatch %

- **Definition.** Percentage of loads dispatched within the slotted window.
- **Formula.** On-time loading % = (loads dispatched within window) / (total loads) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard 3PL / TMS KPI.
- **Refresh cadence.** Daily.

### Dock Utilisation

- **Definition.** Percentage of dock-door capacity used during operating hours.
- **Formula.** Dock utilisation % = (used dock-door hours) / (available dock-door hours) x 100.
- **Direction.** Target band; high utilisation can throttle on-time loading.
- **Source / standard.** Standard warehousing KPI.
- **Refresh cadence.** Daily.

### Storage Utilisation

- **Definition.** Percentage of storage-bin capacity occupied.
- **Formula.** Storage utilisation % = (occupied locations) / (total locations) x 100, sliced by storage type (ambient, chilled, frozen).
- **Direction.** Target band.
- **Source / standard.** Standard warehousing KPI.
- **Refresh cadence.** Daily.

### Inventory Accuracy

- **Definition.** Percentage of inventory locations whose system count matches physical count.
- **Formula.** Inventory accuracy % = (locations matching) / (locations counted) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard warehousing KPI.
- **Refresh cadence.** Per cycle-count cycle.

### Order Picking Accuracy

- **Definition.** Percentage of order lines picked correctly.
- **Formula.** Picking accuracy % = (correctly picked lines) / (total picked lines) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard warehousing KPI.
- **Refresh cadence.** Daily.

### Damage / Claim Rate

- **Definition.** Damages and claims per N orders, units, or dollars.
- **Formula.** Damage rate = (damaged units) / (total units handled).
- **Direction.** Lower is better.
- **Source / standard.** Standard 3PL KPI.
- **Refresh cadence.** Weekly.

### SLA Compliance %

- **Definition.** Percentage of contracted SLA dimensions met for the period.
- **Formula.** Composite varies by master service agreement.
- **Direction.** Higher is better.
- **Source / standard.** Master service agreement.
- **Refresh cadence.** Monthly.

## Cross-references

- [Supply Chain KPIs](../supply-chain/kpis.md) for OTIF, fill rate, on-time shipment definitions reused here.
- [Commercial / Retail KPIs](../commercial-retail/kpis.md) for the JBP-design side of the retail-client relationship.
- [Vendor Management KPIs](../vendor-management/kpis.md) for the inverse relationship: when warehousing services are subcontracted, the 3PL is a vendor.
