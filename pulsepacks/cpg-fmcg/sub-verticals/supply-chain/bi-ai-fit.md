# Supply Chain — BI / AI Fit

Notes on which BI surface tends to hold the certified version of supply-chain analytics in CPG enterprises, and which AI shapes work for which question types. This is descriptive based on common patterns, not prescriptive.

## BI surface fit

| Surface | Typical content | Notes |
|---------|-----------------|-------|
| **Power BI** | Customer service, OTIF, fill rate, S&OP scorecards, control-tower dashboards | Most common in Microsoft-heavy CPG estates. Embedded into operations portals. |
| **Tableau** | Cross-functional supply chain analytics; ad-hoc drill from finance | Often the layer commercial / finance teams reach for; supply chain teams use it for cross-functional views. |
| **Qlik Sense / QlikView** | Inventory health, lane performance, plant adherence | Strong in plants and DCs in older estates; QlikView still common in legacy plant scorecards. |
| **Looker** | Digital shelf overlay; e-commerce inventory views; retailer-portal aggregation | Less common as the primary supply-chain surface; appears in modern lakehouse-first estates. |
| **Generic iframe** | Vendor portals (Walmart Retail Link, Target Partners Online, Kroger 84.51) | Use when the source is a closed retailer surface that PulsePlay cannot deeply integrate. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| KPI definition / lookup | `chat-completion` | One-shot, no traversal, low cost. |
| Single-source aggregation | `chat-completion` or `conversation` | Genie space or semantic-model query suffices. |
| Multi-source diagnostic ("why") | `agent` | Requires traversing customer / lane / DC / plant entities and possibly the trade-promo overlay. |
| Predictive simulation | `agent` | Multi-input synthesis over forecast, capacity, allocation rules. |
| Closed-loop action | `agent` + `mcp` | Agent proposes; MCP write-back lands the action in TMS / WMS / planning. |

## Anti-patterns

- **Do not use stateless `chat-completion` for OTIF root-cause questions.** The agent will need at least three tool calls and short-term memory to traverse the customer / lane / DC dimensions. A stateless completion will hallucinate a confident wrong answer.
- **Do not embed retailer-portal credentials in the React playground.** Vendor-portal embeds (Walmart Retail Link, Target Partners Online) should be reached through the proxy with server-side authentication. The generic iframe adapter is for unauthenticated or pre-signed surfaces.
- **Do not let the agent write back to source systems without an explicit approval step.** OTIF correction proposals (pull-forward production, expedite, transfer) are governed actions. The proxy should mediate every write, and the action should be persisted with an audit trail before execution.

## Recommended starting connector profiles

For a CPG team starting with this sub-vertical, the lowest-friction connector path is:

1. **Genie space over the lakehouse customer-service mart** for descriptive / single-source-aggregation questions.
2. **Mosaic Supervisor agent** with tools that wrap Genie + the certified semantic-layer + a TMS lookup tool for diagnostic / predictive questions.
3. **MCP server** wrapping the planning system (SAP IBP, Kinaxis, etc.) for closed-loop scenarios. Most planning vendors do not yet ship official MCP servers; in the interim, build a thin wrapper around their public APIs.

## Validation references

- **Gartner (2025) — top supply chain technology trends.** Lists agentic AI, ambient intelligence, and connected workforce as 2025 trends. https://www.gartner.com/en/newsroom/press-releases/2025-03-18-gartner-identifies-top-supply-chain-technology-trends-for-2025
- **Gartner (2025-09) — 70% of large orgs to adopt AI-based supply chain forecasting by 2030.** https://www.gartner.com/en/newsroom/press-releases/2025-09-16-gartner-predicts-70-percent-of-large-orgs-will-adopt-ai-based-supply-chain-forecasting-to-predict-future-demand-by-2030
- **WEF (2025-03) — Harnessing AI for autonomous supply chains.** https://www.weforum.org/stories/2025/03/harnessing-ai-technology-to-build-autonomous-supply-chains/
- **KPMG (2025) — Six supply chain trends to watch.** https://kpmg.com/us/en/articles/2025/supply-chain-trends-2025.html
