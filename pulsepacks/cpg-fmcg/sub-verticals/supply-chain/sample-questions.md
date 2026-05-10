# Supply Chain — Sample Questions

Real questions a CPG supply-chain team asks. Each is tagged with the AI shape that best fits it and a one-line note on why.

Tags:
- `chat-completion` — single-turn, no memory, no tool calls. Suitable for definition lookups and simple ranking against a single table.
- `conversation` — multi-turn with server-managed memory. Suitable for follow-up questioning over a single semantic model (e.g. a Genie space).
- `agent` — tool-using planner with multi-step retrieval. Required when the answer needs to traverse multiple entities or call multiple tools.
- `mcp` — tool calls into MCP servers (semantic layer, ticketing, ERP write-back). Required when the answer needs governed external action.

## Descriptive

1. **Which lanes are at risk of missing OTIF this week?** [`conversation`]
   *Single-source query against the customer-service semantic model with a forward-looking risk score. No multi-system traversal.*

2. **Show me inventory days by DC for the top 50 SKUs by velocity.** [`chat-completion` or `conversation`]
   *Stateless aggregation. A chat-completion endpoint over a certified inventory mart suffices.*

3. **What is our fill rate trend by region for the last 13 weeks, with promo weeks highlighted?** [`conversation`]
   *Time-series with a promotional overlay; retains context for natural drill-down.*

## Diagnostic

4. **Why did the East region's service level drop 4 points last month?** [`agent`]
   *Requires traversing customer / lane / DC / plant / SKU / carrier dimensions and possibly cross-referencing promotions. Multi-tool, multi-step.*

5. **What drove forecast bias on Category Y for the last three months?** [`agent`]
   *Bias decomposition into event (promo, weather), structural (channel mix shift), and statistical (model drift) drivers.*

6. **Which DCs have inventory health red, and what is the underlying mix (slow movers, near-expiry, blocked stock)?** [`agent`]
   *Composite metric requiring entity drill-down.*

## Predictive / forward-looking

7. **Project our service level for next week assuming the current production schedule and known promo pulls.** [`agent`]
   *Multi-input simulation; requires demand, supply, and capacity views in the same answer.*

8. **Where is the highest stockout risk over the next 14 days for top-volume SKUs?** [`conversation` or `agent`]
   *Predictive scoring; one-shot if a model already produces it, agent if components must be assembled.*

## Prescriptive

9. **What is the margin-safe recovery plan to fix the East-region service shortfall by week-end?** [`agent`]
   *Cross-functional — supply, commercial, finance constraints. This is the canonical "narrow vertical slice" question (see Service-Margin Recovery demo config).*

10. **Recommend which 18 pallets to transfer from DC A to DC B given current allocation rules and lane costs.** [`agent` + `mcp`]
    *Action-shaped. The agent proposes; an MCP write-back to TMS / WMS is the closed-loop step.*

## Exploratory

11. **What promotional events in the next 8 weeks will most stress my DC capacity?** [`conversation`]
    *Trade-calendar overlay against capacity model.*

12. **Compare carrier-on-time performance across our top 10 lanes.** [`chat-completion`]
    *Pure aggregation if the data is in one mart; chat-completion is the right shape.*

## Anti-patterns (do not route to this sub-vertical's prompt context)

- "Why did our gross margin drop?" — finance question; route to Finance/FP&A.
- "Which retailers' loyalty programs drive the highest basket affinity?" — commercial / retail question; route to Commercial/Retail.
- "What is our Scope 3 transport emissions trend?" — cross-cutting; route through Sustainability overlay.
