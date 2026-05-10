# IT / Admin — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | ITSM dashboards (especially in ServiceNow + PBI shops), cloud-cost reporting, license-utilisation views. |
| **Tableau** | APM / observability mash-ups; less common for ITSM. |
| **Looker** | Cloud-cost FinOps dashboards; common in lakehouse-first stacks. |
| **Generic iframe** | ServiceNow native dashboards, Datadog dashboards, AWS / Azure / GCP cost-explorer surfaces. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| Ticket-volume / SLA lookup | `chat-completion` | Single-source. |
| Incident root-cause | `agent` | Cross-source: incident + change + APM error trace. |
| Cloud-cost decomposition | `agent` | Cross-source: usage + tagging + reservations. |
| AI-agent governance review | `agent` | Cross-source: evaluation harness + audit logs + cost telemetry. |

## Anti-patterns

- **Do not let the agent execute IT remediation actions.** Restarts, scaling, patching, and access changes go through ITSM-side automation with change-management governance.
- **Do not aggregate across tenants without explicit data-classification awareness.** Multi-tenant CPG IT estates carry data-isolation requirements that are easy to violate inadvertently.
- **Do not surface security-incident data to general users.** Security ops has its own audience and access controls; IT-Admin pack content should not embed security-incident detail.

## Validation references

- **NIST AI Risk Management Framework (AI RMF 1.0)** — emerging governance reference; aligns with AI-ops KPIs in this pack. https://www.nist.gov/itl/ai-risk-management-framework
- **ISO/IEC 42001 AI management systems.** https://www.iso.org/standard/81230.html
- **FinOps Foundation framework** — cloud-cost discipline. https://www.finops.org/
