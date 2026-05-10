# Vendor Management — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | Supplier 360, contract pipeline, supplier scorecards. Common in Microsoft-anchored procurement estates. |
| **Tableau** | Cross-functional supplier risk views; dependency mapping visualisations. |
| **Qlik Sense** | Older supplier portfolios in Qlik-anchored estates. |
| **Looker** | Lakehouse-first supplier analytics; less common today. |
| **Generic iframe** | Resilinc, Sphera, EcoVadis, CDP, BitSight, SecurityScorecard native dashboards when deep integration is not yet built. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| Supplier scorecard lookup | `chat-completion` | Single-source. |
| Supplier 360 view | `agent` | Multi-source aggregation. |
| Tier 2/3/4 dependency traversal | `agent` | Graph traversal across multi-tier visibility data. |
| Contract obligation extraction | `agent` over CLM | Document retrieval + structured extraction. |
| Risk-radar prioritisation | `agent` | Multi-signal fusion: commodity, weather, geopolitical, financial-health, quality. |

## Anti-patterns

- **Do not let the agent execute supplier-facing actions** (supplier code of conduct sign-off, contract counter-signature, payment release). Vendor-management actions are governance-heavy.
- **Do not assume vendor-master cleanliness.** Supplier deduplication is a precondition to trustable supplier 360 views; if the vendor master is not normalised, the agent will produce confidently misattributed answers.
- **Do not surface tier 2/3/4 supplier identity to general users without explicit access controls.** Multi-tier visibility data is often legally or commercially sensitive (NDA-bound).

## Data architecture note

The supplier 360 is intrinsically a federated query. No single source-to-pay platform holds all of: spend (S2P + ERP), quality (QM + LIMS), delivery (ERP + WMS), financial health (RapidRatings / D&B), ESG (EcoVadis / CDP), cyber (BitSight / SecurityScorecard), contract terms (CLM). The pack's recommended pattern: federated query through the proxy with per-source connector profiles, joined on a normalised vendor-master ID. The AI agent's tool calls are bound to that normalised ID.
