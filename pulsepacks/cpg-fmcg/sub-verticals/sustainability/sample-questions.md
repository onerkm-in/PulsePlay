# Sustainability — Sample Questions

Each question carries the **framework anchor** that grounds it. The agent's answer should explicitly cite the framework.

## Emissions (GHG Protocol)

1. **What is our Scope 1 emissions trend by site for the last 3 years?** [`agent`]
   *Anchor: GHG Protocol Corporate Standard, Scope 1.*
   *Sources: [Manufacturing](../manufacturing/README.md) line / site fuel and refrigerant data.*

2. **What is our Scope 2 emissions split between location-based and market-based methods?** [`agent`]
   *Anchor: GHG Protocol Scope 2 Guidance — both methods are required.*
   *Sources: site electricity consumption + grid emission factors + REC / PPA / contractual instruments.*

3. **What is our Scope 3 emission breakdown by category (1-15)?** [`agent`]
   *Anchor: GHG Protocol Corporate Value Chain (Scope 3) Standard.*
   *Sources: [Procurement](../procurement/README.md) cat. 1; capital goods cat. 2; [Supply Chain](../supply-chain/README.md) cat. 4 + cat. 9 transport; HR cat. 6 + cat. 7 travel/commute; product use phase cat. 11 (where applicable); end-of-life cat. 12.*

4. **For our Scope 3 category-1 (Purchased goods and services) emissions, which suppliers contribute the top 80%?** [`agent`]
   *Anchor: GHG Protocol Scope 3 Standard cat. 1; data-quality scoring per the standard's hierarchy.*
   *Sources: [Procurement](../procurement/README.md) + [Vendor Management](../vendor-management/README.md) supplier disclosures.*

5. **What is our Scope 3 category-4 (Upstream transportation) emissions trend, and what mode-shift opportunities exist?** [`agent`]
   *Anchor: GHG Protocol Scope 3 Standard cat. 4.*
   *Sources: [Supply Chain](../supply-chain/README.md) lane / carrier / mode data + transport emission factors.*

## Water (GRI 303)

6. **Which manufacturing lines drive the most water consumption per unit produced?** [`agent`]
   *Anchor: GRI 303 Water and Effluents (303-3 Water withdrawal, 303-5 Water consumption).*
   *Sources: [Manufacturing](../manufacturing/README.md) line water meters + production output for normalisation.*

7. **What share of our manufacturing footprint sits in water-stressed basins?** [`agent`]
   *Anchor: GRI 303-1; WRI Aqueduct stressed-basin classification.*
   *Sources: site location data + WRI Aqueduct overlay.*

## Packaging and circularity (ESRS E5)

8. **How does our packaging recyclability rate compare to CSRD targets?** [`agent`]
   *Anchor: ESRS E5 Resource Use and Circular Economy.*
   *Sources: [Procurement](../procurement/README.md) packaging specs + recyclability scheme classification (APR, Ceflex).*

9. **What is our recycled-content share by packaging stream for the last 12 months?** [`agent`]
   *Anchor: ESRS E5; aligns with CDP forests / packaging modules where applicable.*
   *Sources: packaging-master + supplier-disclosed recycled content.*

## Reporting and disclosure

10. **What is our CDP A-list eligibility status, and which gaps remain in our disclosure?** [`conversation`]
    *Anchor: CDP scoring methodology.*

11. **For our CSRD readiness on ESRS E1 (Climate Change), which data points have full coverage and which are gap?** [`agent`]
    *Anchor: ESRS E1 datapoint inventory.*

12. **Are we on track for our SBTi-aligned Scope 1+2 reduction commitment?** [`agent`]
    *Anchor: SBTi corporate-target methodology.*

## Cross-vertical synthesis

13. **For the sustainability section of the next executive review, compose a cross-vertical summary: emissions trajectory, water risk, packaging progress, supplier ESG portfolio.** [`agent`]
    *The canonical "cross-cutting overlay" question — multi-source synthesis with framework citation throughout.*

## Anti-patterns

- "What is our carbon footprint?" — too vague. Ask the user to specify scope (Scope 1, 2, 3, total), boundary (legal entity, operational, financial control), reporting period.
- "Tell me our Scope 3 number." — needs explicit category specification (1-15) and calculation method (activity-based, spend-based, supplier-specific).
- "Are we sustainable?" — out of scope for KPI lookup; this is a strategy question, not an analytics question.

<!-- SME REVIEW NEEDED:
     A sustainability SME should validate the framework-anchor citations on each question, especially:
     - The market-based vs location-based Scope 2 framing (both required under GHG Protocol).
     - The Scope 3 category-mapping correctness (cat. 4 vs cat. 9 transport boundary; cat. 11 use phase applicability for the org's product portfolio).
     - The ESRS topical mapping (E5 vs E1 vs others) for packaging questions.
     - The CDP scoring and SBTi target methodology references against current versions. -->
