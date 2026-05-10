# Procurement — Sample Questions

Each question is tagged with the AI shape that best fits it.

## Descriptive

1. **What is our spend by category and supplier for the last 12 months, ranked?** [`chat-completion`]
   *Single-source aggregation against the spend cube.*

2. **Which contracts are up for renewal in the next 90 days?** [`conversation`]
   *CLM-backed query; multi-turn for follow-up filters (region, value-band, risk-band).*

3. **Show me on-time delivery performance by supplier for category C this quarter.** [`conversation`]
   *Operational view from ERP / source-to-pay data.*

## Diagnostic

4. **Why did our packaging-spend run over budget by 8% in Q3?** [`agent`]
   *Decomposition: price (commodity index), volume (production mix), supplier mix, FX, freight.*

5. **Which suppliers have triggered the price-index pass-through clause in the last 6 months and by how much?** [`agent`]
   *Contract-intelligence + ERP traversal.*

6. **For supplier S's recent quality streak, do we have masked tier 2/3 dependency exposure?** [`agent`]
   *Multi-step graph traversal across the supplier risk graph.*

## Predictive / forward-looking

7. **If aluminium spot rises another 10%, what is our exposure for the next 6 months by SKU and customer?** [`agent`]
   *Commodity price feed + BOM + production plan + customer mix.*

8. **Which suppliers are highest financial-health risk over the next 2 quarters?** [`conversation`]
   *Backed by an external risk-scoring source (e.g. RapidRatings, Sphera).*

## Prescriptive

9. **Recommend a 3-supplier shortlist for an aluminium-can RFx with compliance, sustainability, and financial-health filters applied.** [`agent`]
   *Aligns with Gartner's GenAI procurement use cases (RFx draft, supplier shortlist) — the narrowed scope where Gartner found ROI evidence.*

10. **For category C's renewal, what negotiation levers do we have based on commitment history and current market data?** [`agent`]
    *Contract intelligence + spend history + market context.*

## Sustainability cross-cutting

11. **What is our Scope 3 category-1 emissions trajectory by supplier?** [`agent`]
    *Routes through the [Sustainability overlay](../sustainability/README.md). Requires supplier-specific factors (or spend-based proxy) plus disclosure data.*

12. **Which suppliers carry a CDP A-list disclosure and which still report at C or below?** [`conversation`]
    *Supplier ESG scorecard query against CDP-aligned data.*

## Anti-patterns

- "Negotiate this contract for me." — out of scope. Procurement AI proposes; humans negotiate.
- "Pay this supplier early to capture a discount." — out of scope. Cash and AP decisions live with finance.
