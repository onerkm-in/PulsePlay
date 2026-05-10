# Vendor Management — Sample Questions

## Supplier 360 (descriptive / diagnostic)

1. **Show me the full 360 for supplier S: spend, quality, delivery, financial health, ESG, cyber, open issues.** [`agent`]
   *Multi-source aggregation across spend, quality, delivery, risk-intelligence, ESG, cyber, and CLM data.*
2. **Which of our top 20 suppliers degraded on quality, on-time delivery, or financial-health rating in the last 6 months?** [`agent`]
3. **For supplier S's recent quality incidents, what is the trend, the categorisation, and the root-cause attribution?** [`agent`]

## Contract intelligence

4. **Which of our 200+ active contracts have price-index pass-through clauses, and what are the trigger thresholds?** [`agent`]
   *Document retrieval over CLM corpus + structured extraction.*
5. **For the 47 contracts expiring in the next 90 days, which carry highest renegotiation leverage and which carry sole-source risk?** [`agent`]
   *Multi-criteria: spend share, market alternatives, switching cost, supplier financial health.*
6. **Which suppliers have unmet rebate-tier obligations heading into year-end?** [`agent`]
   *CLM + AP + spend traversal.*

## Risk and dependency

7. **Tier 2 dependency: do any of our top 20 tier-1 suppliers share a single tier-2 dependency?** [`agent`]
   *Graph traversal across supplier-risk-intelligence data (Resilinc, Sayari, Interos).*
8. **Which suppliers have triggered financial-health-watch flags in the last quarter?** [`conversation`]
   *Backed by RapidRatings or equivalent feed.*
9. **For supplier S's recent cyber-posture downgrade, what is our exposure (which systems, which data flows)?** [`agent`]
   *Cross-source: BitSight / SecurityScorecard rating + integration map + data-classification register.*

## Sustainability cross-cutting

10. **Which suppliers have not yet submitted a CDP disclosure?** [`conversation`]
    *Routes through the [Sustainability overlay](../sustainability/README.md).*
11. **Of our top 50 suppliers by spend, which are SBTi-aligned and which still need engagement?** [`agent`]
12. **For our top emitting tier-1 suppliers (Scope 3 cat. 1), what reduction commitments are on the table for FY?** [`agent`]

## Onboarding

13. **Status of in-flight supplier onboardings — where are they in due-diligence, ESG attestation, and financial-health screening?** [`conversation`]

## Anti-patterns

- "Approve this supplier onboarding." — out of scope. The agent surfaces the readiness signals; humans approve.
- "Cancel this contract." — out of scope.
- "Pay this supplier early." — out of scope; AP and treasury decisions stay with finance.
