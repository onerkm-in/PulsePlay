# Client Management — BI / AI Fit

## BI surface fit

### Retail clients

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | Customer scorecards, JBP delivery dashboards, deduction tracking. Common in Microsoft-anchored estates. |
| **Tableau** | Cross-customer comparisons, deduction analytics, customer-meeting prep packs. |
| **Qlik** | Older customer-service portals; less common in new estates. |
| **Looker** | Lakehouse-first customer analytics. |
| **Generic iframe** | Retailer portals (Walmart Retail Link, Target Partners Online, Kroger Stratum / 84.51, Tesco Connect) when first-party portal access is the source of truth. |

### Warehousing clients

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | DC operational dashboards, throughput, dock utilisation, claims tracking. |
| **Tableau** | Cross-site comparisons, customer-of-the-warehouse-services scorecards. |
| **Qlik / QlikView** | Legacy warehousing dashboards; often still in use. |
| **Generic iframe** | WMS / TMS native dashboards (Manhattan Active, Blue Yonder, SAP EWM) when deep integration is not yet built. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| Scorecard / KPI lookup | `chat-completion` | Single-source. |
| Customer-meeting pre-read | `agent` | Multi-source synthesis: scorecard + supply chain + deductions + open issues + JBP status. The canonical "narrow vertical slice" question for client management. |
| OTIF root-cause at customer level | `agent` | Cross-vertical with supply chain. |
| Promo-compliance diagnosis | `agent` | Multi-source: TPM + retailer-execution data + supply chain. |
| 3PL SLA-renewal readiness | `agent` | Multi-source: WMS + TMS + open-penalty register + KPI trend. |

## Anti-patterns

- **Do not aggregate across retailers in answers without explicit awareness of NDAs and competitive sensitivities.** Retailers' OTIF / fill-rate performance is commercially sensitive; cross-retailer aggregations should be internal-only and access-controlled.
- **Do not surface retailer fine schedules to general users without legal review.** Specific retailer fine programs (Walmart OTIF, etc.) carry confidentiality agreements; surface aggregate impact, not retailer-specific fine-schedule reproductions.
- **Do not let the agent execute deduction-side actions** (accept, dispute, write-off). Deduction-management governance applies.

## Validation references

- **Walmart Supplier resources** (OTIF program, Retail Link). https://corporate.walmart.com/suppliers
- **Retail Industry Leaders Association (RILA).** https://www.rila.org/
- **MHI Annual Industry Report on warehousing.** https://www.mhi.org/publications/report
- **WERC DC measures benchmarks.** https://werc.org/
