# Finance / FP&A — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | Margin-bridge dashboards, customer / category P&L, working-capital views. Common in Microsoft-anchored finance estates. |
| **Tableau** | Cross-functional finance + commercial views; finance-led ad-hoc analysis. |
| **Qlik Sense** | Less common in finance today; appears in Qlik-anchored estates with legacy plan/actual cubes. |
| **Looker** | Finance views off lakehouse-first stacks; less common in legacy-ERP-anchored CPG enterprises. |
| **Generic iframe** | EPM tools (OneStream, Anaplan, Hyperion, Workday Adaptive) when their native UIs are the source of truth and integration is not yet built. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| Margin / revenue / EBITDA lookup | `chat-completion` | Single-source aggregation against the certified semantic layer. |
| Margin-bridge decomposition | `agent` | Multi-source: ERP costing + commodity feed + FX + trade settlement + plant variance. |
| Working-capital deep-dive | `agent` | Multi-source: AR + AP + inventory + deduction systems. |
| Close anomaly surfacing | `agent` | Anomaly detection + GL traversal. |
| Scenario simulation | `agent` | Multi-input what-if with uncertainty bands. |

## Anti-patterns

- **Do not let the agent produce financial statements.** Statutory / management reporting is governance-heavy. The agent supports analysis, not statement preparation.
- **Do not infer financial definitions.** Use the certified semantic layer's metric definitions; finance data has the highest cost of definitional drift in the enterprise.
- **Do not blend management and statutory views without explicit reconciliation.** Constant-currency vs reported, segment vs entity, and accrual vs cash basis conventions matter and are not interchangeable.

## Validation references

- **Deloitte CFO signals Q4 2025.** Technology transformation is a top CFO priority for 2026. https://www.deloitte.com/us/en/about/press-room/deloitte-q4-2025-cfo-signals-survey.html
- **Gartner: 8 forces reshaping corporate finance through 2030.** https://www.gartner.com/en/newsroom/press-releases/2025-08-27-gartner-identifies-8-forces-that-will-reshape-the-finance-function-through-2030
- **Gartner: finance AI adoption remains steady in 2025.** https://www.gartner.com/en/newsroom/press-releases/2025-11-18-gartner-survey-shows-finance-ai-adoption-remains-steady-in-2025
