# Commercial / Retail — Sample Questions

## Descriptive

1. **What is net revenue by customer and category for the last 13 weeks?** [`chat-completion`]
2. **Show me promo calendar for retailer R for the next 8 weeks with funding source attribution.** [`conversation`]
3. **Top 20 SKUs by sales velocity at retailer R.** [`chat-completion`]

## Diagnostic

4. **Why did promo P at customer X underperform expected lift by 22%?** [`agent`]
   *Drivers: price gap vs competitor, on-shelf availability, weather, competing retailer promo, retail-media spend.*
5. **Why is category C losing share at retailer R?** [`agent`]
   *Decomposition: distribution, assortment role, price gap, digital-shelf content score, competitor move.*
6. **Which trade-spend accruals look over-committed and where is the leakage?** [`agent`]
   *Off-invoice, MDF, scan-back, post-event mismatch.*

## Predictive

7. **Project net revenue for FY based on current run-rate and known headwinds.** [`agent`]
8. **What is the elasticity of SKU S at price band B for retailer R?** [`agent`]
   *Model-backed; surfaces existing elasticity model output.*

## Prescriptive

9. **JBP commitments are at risk on volume. Recommend lowest-margin-sacrifice lever set to close the gap.** [`agent`]
10. **For category C at retailer R, recommend assortment changes to capture whitespace given current planogram constraints.** [`agent`]

## Digital shelf

11. **Digital-shelf health for our top 50 SKUs at retailer R — ranking, content score, ratings trajectory, price parity.** [`conversation`]
12. **Where are we losing share-of-search to private label and where is content quality below threshold?** [`agent`]

## Anti-patterns

- "Set the price for SKU S." — out of scope. The agent informs; pricing committees decide.
- "Negotiate the JBP for me." — out of scope.
