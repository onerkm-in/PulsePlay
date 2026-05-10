# Procurement — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | Spend cube, contract pipeline, supplier scorecards |
| **Tableau** | Cross-functional spend analytics; commodity overlay |
| **Qlik** | Older spend cubes, supplier scorecards in legacy estates |
| **Looker** | Source-to-pay platform native dashboards (some Coupa / Ivalua estates publish via Looker) |
| **Generic iframe** | Source-to-pay platform native UIs (Coupa, Ariba, Ivalua, Jaggaer, GEP) when deep integration is not yet built |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| Spend lookup, contract status | `chat-completion` | Single-source. |
| Supplier OTD trend with follow-up | `conversation` | Multi-turn drill. |
| Commodity exposure decomposition | `agent` | Multi-source: BOM + production plan + commodity feed + contracts. |
| Supplier shortlist for RFx | `agent` | Multi-criteria filtering against supplier master + risk + ESG + financial-health. |
| Contract obligation lookup | `chat-completion` over a vector store | Retrieval over CLM corpus. Document-grounded answer with citation. |
| RFx draft | `agent` | Cited as a Gartner-validated GenAI procurement use case. |

## Anti-patterns

- **Do not let the agent execute supplier-side actions** (PO issuance, payment release, contract counter-signature). Procurement actions are governance-heavy; the agent proposes and a human approves.
- **Do not assume supplier-master cleanliness.** Many CPG enterprises have multi-sourced supplier master data; the same supplier may appear under different IDs across ERP, S2P, and CLM systems. Normalise via a vendor-master service before agent traversal.
- **Do not use spend-based Scope 3 estimates as a final answer to supplier-emissions questions** when supplier-specific data is available. Spend-based is a fallback per GHG Protocol.

## Validation references

- **Gartner (2025-07) — GenAI for procurement has entered the trough of disillusionment.** Narrowed the use cases where ROI is being seen: workflow automation, RFx creation, supplier recommendation, contract management, analytics. https://www.gartner.com/en/newsroom/press-releases/2025-07-30-gartner-says-generative-ai-for-procurement-has-entered-the-trough-of-disillusionment
- **KPMG (2025) — Procurement at the crossroads.** Highlights intake/orchestration tools, supplier risk, Scope 3, and cost-to-serve as priorities. https://kpmg.com/us/en/articles/2025/procurement-crossroads.html
