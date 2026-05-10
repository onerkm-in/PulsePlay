# Finance / FP&A — Sample Questions

## Descriptive

1. **What was net revenue, gross margin, and EBITDA by region for Q3 vs plan?** [`chat-completion`]
2. **Working capital trend by component for the last 6 months.** [`conversation`]
3. **Top 20 customers by revenue and margin contribution.** [`chat-completion`]

## Diagnostic

4. **Why did gross margin compress 110 bps vs plan in Q3?** [`agent`]
   *Margin-bridge decomposition: price, volume, mix, commodity, FX, plant variance, trade, channel.*
5. **What is driving the $150M working capital increase vs forecast?** [`agent`]
   *Inventory build, receivables stretch, payables shift, deduction leakage.*
6. **Are there close anomalies in revenue, COGS, or trade-spend accruals worth investigating?** [`agent`]
   *Anomaly detection over GL postings.*

## Predictive / scenario

7. **If commodity Y rises 12% and FX moves 3% against us, what is the Q4 margin impact by region and category?** [`agent`]
   *Multi-input scenario.*
8. **Project full-year working capital based on current run-rate and known seasonal effects.** [`agent`]

## Prescriptive

9. **Recommend the trade-spend reallocation that closes the gap-to-plan with the smallest volume sacrifice.** [`agent`]
   *Cross-functional with commercial-retail.*
10. **Where can we accelerate deduction-dispute closure to recover working capital?** [`agent`]

## Anti-patterns

- "Approve this expense." — out of scope. The agent informs; AP and approvals stay in the system of record.
- "Forecast cash position for next month with $1M precision." — over-precision; LLM-shaped forecasts should report wide bands and cite the underlying treasury model when one exists.

<!-- SME REVIEW NEEDED:
     A finance SME should validate that these questions reflect the specific reforecast cadence (monthly / quarterly / rolling 18-month) and consolidation entity hierarchy of the adopting org. -->
