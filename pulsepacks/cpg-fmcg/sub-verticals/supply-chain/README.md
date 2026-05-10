# Supply Chain

The supply chain seat in a CPG/FMCG enterprise covers demand sensing, inventory health, customer service, S&OP, logistics, manufacturing planning interface, and the control-tower view that ties them together. It is where volatility, value, and urgency collide, which is why it is also where AI assistance pays off fastest.

## What this sub-vertical covers

- **Demand**: forecast, demand sensing from POS / shipments / orders, weather and event signals, retailer inventory, promotion calendars.
- **Supply**: production plan adherence, materials availability, supplier-side disruption signals.
- **Inventory**: health by SKU-DC (stockout risk, slow movers, expiry risk, blocked stock, safety-stock violation).
- **Customer service**: OTIF, fill rate, cuts and shortages, root-cause attribution by customer, lane, DC, plant, SKU, carrier, order type.
- **S&OP / IBP**: monthly rhythm aligning demand, supply, finance, commercial. The "Living S&OP Room" pattern (multi-agent debate over a constrained plan) is the long-horizon ambition.
- **Control tower**: autonomous exception triage that classifies, prioritises, and routes disruptions.

## Why a CPG team uses this

Concrete decisions that land on a supply-chain seat in a typical week:

- "We are projecting a fill miss against retailer X for promo week 27. Pull-forward production at plant A or expedite from DC B?"
- "Forecast bias is +6% on category Y for the third consecutive month. Adjust the baseline or treat as event-driven?"
- "Carrier C is degrading on lane L. Renegotiate, dual-source, or switch primary?"
- "Inventory days at DC D have crept from 28 to 41. What changed and what is the recovery plan?"
- "S&OP shows demand exceeding supply by 4% for Q4. Whose constraint is binding (capacity / materials / labour) and what trade-off do we present to commercial?"

Notice that none of these are answerable from a single dashboard. Each requires reasoning across systems, which is the value PulsePlay's AI sidebar provides on top of whatever BI surface a team uses.

## Typical data sources

- **ERP**: SAP S/4HANA, Oracle Fusion, Microsoft Dynamics — orders, shipments, inventory snapshots.
- **Planning**: SAP IBP, Kinaxis, Blue Yonder, o9, Anaplan — forecasts, supply plans, S&OP plans.
- **WMS**: Manhattan Active WM, Blue Yonder WMS, SAP EWM, Oracle WMS — inventory positions, putaway, picks.
- **TMS**: Manhattan Active TM, Blue Yonder TMS, SAP TM, Oracle OTM — loads, lanes, carriers, freight settlement.
- **MES**: Siemens, Rockwell, AVEVA, GE Digital, SAP ME/MII — production output and adherence.
- **Retailer feeds**: Walmart Retail Link, Target Partners Online, Kroger Stratum / 84.51, Tesco Connect, etc. — POS and retailer inventory.
- **Syndicated**: NielsenIQ / Circana — category and competitive context.
- **External**: weather (NOAA, Met Office, ECMWF), commodity indices, freight indices (Freightos Baltic Index, DAT).

## Cross-cutting overlays

- **[Sustainability](../sustainability/README.md)**: transport emissions (Scope 3 category 4 - upstream transportation; category 9 - downstream transportation; category 11 - use phase only for certain CPG categories), packaging, mode-shift trade-offs.
- **[Finance / FP&A](../finance-fpa/README.md)**: working-capital impact of inventory decisions; cost-to-serve attribution.
- **[Commercial / Retail](../commercial-retail/README.md)**: trade-promo-induced demand spikes; JBP service-level commitments; OTIF fines feeding into deduction leakage.

## Sub-vertical contents

- [sample-questions.md](sample-questions.md) — the questions a planner / control-tower lead actually asks.
- [kpis.md](kpis.md) — canonical supply chain KPIs with formulas and refresh cadences.
- [bi-ai-fit.md](bi-ai-fit.md) — which BI surfaces and AI shapes work for which question types.
- [prompt-context.md](prompt-context.md) — system-prompt snippet to inject when this sub-vertical is selected.
