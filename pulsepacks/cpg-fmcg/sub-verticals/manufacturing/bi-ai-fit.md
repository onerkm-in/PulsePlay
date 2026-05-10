# Manufacturing — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | Plant scorecards, OEE rollups, energy/water dashboards. Common in Microsoft-anchored estates. |
| **Tableau** | Cross-plant comparisons; quality and yield deep-dives. |
| **Qlik / QlikView** | Legacy plant scorecards — many CPG plants still run QlikView for their floor dashboards. Maintenance-only roadmap, but still load-bearing in older sites. |
| **Looker** | Less common in plants; appears in lakehouse-first / cloud-native plants. |
| **Generic iframe** | MES / SCADA / energy-management vendor portals when deep integration is not yet built. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| OEE lookup | `chat-completion` | Single-source aggregation. |
| Loss-tree decomposition | `agent` | Multi-step traversal across availability / performance / quality. |
| Batch genealogy | `agent` | Multi-hop traversal across batch -> material lot -> supplier -> downstream batches. |
| Predictive-maintenance summary | `conversation` | Surfaces an existing model output; multi-turn drill. |
| Schedule recommendation | `agent` + `mcp` | Constraint-aware proposal; MCP write-back to MES / planning is the closed-loop step. |

## Anti-patterns

- **Do not put real-time PLC / SCADA data behind an LLM round-trip.** Sub-second control loops are not LLM territory. The AI sidebar reasons over MES and trended sensor data, not raw PLC telemetry.
- **Do not auto-write to MES.** Plant systems are governance-heavy and any write-back must be approved by a scheduler with full audit trail.
- **Do not use spend-based Scope 1/2 estimates.** Manufacturing emissions are activity-based (fuel consumed, electricity purchased). Use the meter readings, not financial proxies.

## Standards anchoring

- **ISA-95 / IEC 62264** defines the manufacturing-enterprise integration model that the AI sidebar's tool calls should align with.
- **ISO 22400** standardises manufacturing operations management KPIs (OEE, throughput, scrap rate, etc.).
- **ISO 50001** for energy management; **ISO 14001** for environmental management; **ISO 45001** for occupational health and safety.
- **GFSI-benchmarked schemes** (FSSC 22000, BRCGS, SQF) for food safety in food-and-beverage CPG.
