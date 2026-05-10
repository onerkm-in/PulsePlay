# Client Management

The client-management seat covers the operational delivery against committed customer-side SLAs. In CPG/FMCG, "client" splits into two materially different audiences, each with their own KPI sets:

- **Retail clients** — retailers (Walmart, Tesco, Carrefour, Kroger, Target, etc.) and distributors. Performance is measured through joint business plan (JBP) commitments, scorecards, OTIF, fill rate, deductions, and promo compliance.
- **Warehousing clients** — when the CPG enterprise also operates third-party logistics or contract-warehousing services (some larger CPGs do; many partner with 3PLs). Performance is measured through throughput, on-time loading, slot utilisation, claims and damages, and contracted SLAs.

This sub-vertical is intentionally scoped to **delivery** against committed metrics. Strategic growth and JBP-design content lives in [Commercial / Retail](../commercial-retail/README.md). The split is: commercial owns "what we sell and at what price"; client management owns "did we deliver what we promised."

## What this sub-vertical covers

### Retail clients

- **JBP delivery scorecard**: volume, growth, margin, service-level, promo-compliance commitments.
- **OTIF / fill-rate performance** at customer level, with retailer-fine impact attached.
- **Deduction handling**: dispute pipeline, recovery rate, root-cause categorisation.
- **Promo compliance**: pre-event readiness, in-event execution, post-event settlement.
- **Customer-meeting prep**: structured pre-read pulling commercial scorecard, supply chain performance, deductions, and open issues.

### Warehousing clients

- **Throughput**: cases / pallets / units handled per period vs contracted volume.
- **On-time loading and dispatch**: percentage of loads dispatched within the slotted window.
- **Slot utilisation**: dock-door slots, storage-bin utilisation.
- **Claims and damages**: incident rates and recovery cycle.
- **Contracted SLAs**: measured against the master service agreement; renewal-readiness scoring.
- **Inventory accuracy**: cycle count results, shrinkage trends.

## Why a CPG team uses this

Retail-client side:
- "Pre-read for tomorrow's quarterly review with retailer R: scorecard, OTIF trend, top deduction categories, open issues."
- "Of last quarter's $2.3M deductions from retailer R, what is the dispute pipeline status and recovery rate?"
- "Promo P at retailer R goes live in 8 days. Supply readiness, store-execution risk, and trade-spend funding status."
- "JBP volume commitment is 60% landed at week 26. What lever set closes the gap?"

Warehousing-client side:
- "Throughput vs contract for warehousing client W this quarter."
- "Why did on-time loading degrade for client W in the last 4 weeks?"
- "Slot utilisation by dock door for site Z, with peak / off-peak split."
- "Claims and damages by client and category; recovery cycle status."
- "SLA-renewal readiness for client W: open service penalties, KPI trend, joint-improvement actions."

## Typical data sources

### Retail clients
- **Retailer portals**: Walmart Retail Link, Target Partners Online, Kroger Stratum / 84.51, Tesco Connect, Carrefour Link, etc.
- **CRM**: Salesforce account / opportunity records.
- **TPM**: see commercial-retail.
- **Internal**: customer scorecards, deduction-management system, customer service / OTIF tracking.

### Warehousing clients
- **WMS**: Manhattan Active WM, Blue Yonder WMS, SAP EWM — receipts, putaway, picks, ships, cycle counts.
- **TMS**: Manhattan Active TM, Blue Yonder TMS — load planning, dock scheduling.
- **Yard management** (where present).
- **Customer-portal / EDI**: client-facing dashboards and inbound order feeds.
- **Master service agreements** in CLM.

## Cross-cutting overlays

- **[Sustainability](../sustainability/README.md)**: retailer sustainability scorecards (Walmart Project Gigaton-style programs); warehousing client emissions reporting.
- **[Commercial / Retail](../commercial-retail/README.md)**: JBP design lives there; this sub-vertical is delivery-against-commitment.
- **[Supply Chain](../supply-chain/README.md)**: OTIF / fill-rate at customer level traces back to supply-chain root cause.
- **[Vendor Management](../vendor-management/README.md)**: when warehousing services are subcontracted to 3PLs, the 3PL becomes a vendor-management concern.

## Sub-vertical contents

- [sample-questions.md](sample-questions.md) — split into retail-client and warehousing-client sections.
- [kpis.md](kpis.md) — split into retail-client and warehousing-client sections.
- [bi-ai-fit.md](bi-ai-fit.md)

## Notable design notes

The OTIF retailer-fine pattern (e.g. Walmart's OTIF program defines its own delivery-window and fill-rate thresholds with associated supplier fines) is the canonical example of why this sub-vertical is delivery-focused: a service shortfall translates directly into a deduction line, which translates directly into customer-P&L impact. The agent's job is to surface the root-cause attribution back to the supply-chain seat fast enough to remediate before settlement. See https://corporate.walmart.com/suppliers for current Walmart supplier expectations.
