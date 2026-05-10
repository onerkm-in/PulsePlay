# Commercial / Retail — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | RGM cockpit, customer P&L, trade-spend dashboards, JBP scorecards. Common in Microsoft-anchored commercial estates. |
| **Tableau** | Cross-customer, cross-channel commercial views. Tableau's narrative summaries land well in this seat. |
| **Qlik Sense** | Less common in commercial today; appears in Qlik-anchored estates. |
| **Looker** | E-commerce / digital-shelf views; common where retailer first-party data flows through a lakehouse with a Looker semantic model. |
| **Generic iframe** | Retailer portals (Walmart Retail Link, Target Partners Online, Kroger Stratum / 84.51), digital-shelf tools (Profitero, Stackline) when deep integration is not yet built. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| Net revenue / GtN lookup | `chat-completion` | Single-source aggregation. |
| Promo post-mortem | `agent` | Multi-source: TPM + syndicated retail measurement + retailer POS + competitive context. |
| JBP gap-closure planning | `agent` | Multi-lever optimisation: price, mix, distribution, promo, with margin attribution. |
| Digital-shelf health | `conversation` | Multi-turn drill into ranking, content, ratings, parity. |
| Elasticity / pricing recommendation | `agent` | Surfaces existing elasticity model output; agent shapes the recommendation around constraints. |

## Anti-patterns

- **Do not let the agent finalise prices or trade rates.** Pricing and rate decisions are governance-heavy.
- **Do not assume retailer-POS feeds are real-time.** Most retailer feeds (Retail Link, Stratum) are next-day or weekly. Cite the freshness in the answer.
- **Do not blend syndicated panels with retailer-direct POS without explicit reconciliation.** NielsenIQ / Circana panels and retailer-direct feeds use different SKU coverage, store coverage, and reporting calendars. Cross-source reconciliation must be explicit.

## Validation references

- **Deloitte 2025 consumer products outlook.** https://www.deloitte.com/us/en/insights/industry/consumer-products/consumer-products-industry-outlook/2025.html
- **Deloitte 2025 US retail industry outlook.** https://www.deloitte.com/us/en/insights/industry/retail-distribution/retail-distribution-industry-outlook/2025.html
- **NielsenIQ 2026 Consumer Outlook.** https://investors.nielseniq.com/news/news-details/2025/NIQs-2026-Consumer-Outlook-Bold-Brands-Win-with-Cautious-Consumers/default.aspx
- **Circana 2025 US private-label CPG sales.** https://www.circana.com/post/circana-research-reveals-u-s-private-label-cpg-sales-reach-330-billion
