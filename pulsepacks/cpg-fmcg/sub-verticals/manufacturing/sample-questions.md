# Manufacturing — Sample Questions

## Descriptive

1. **What was OEE by line and shift for the last 7 days?** [`chat-completion`]
2. **Show me yield trend by recipe for the last 13 weeks.** [`conversation`]
3. **List all open quality deviations and their disposition status.** [`conversation`]

## Diagnostic

4. **Why did OEE on line 4 drop 7 points over 3 weeks?** [`agent`]
   *Loss-tree decomposition: availability (planned downtime, unplanned downtime, changeover, micro-stops), performance (speed loss), quality (rework, scrap).*
5. **Why is yield variance on recipe R high this month?** [`agent`]
   *Material-lot, line, operator-group, shift, and recipe-parameter cuts.*
6. **For batch B that failed release, trace genealogy back to material lots, and identify which downstream batches share that genealogy.** [`agent`]
   *Multi-step traceability — the "Batch Genealogy Intelligence" pattern from CPG enterprise blueprint.*

## Predictive

7. **Project end-of-month OEE for plant P given current trend.** [`agent`]
8. **Which equipment items show drifting predictive-maintenance signatures and how confident is the failure forecast?** [`agent`]
   *Sensor data + historical failure patterns; depends on a model already producing the score.*

## Prescriptive

9. **Recommend the lowest-cost-to-serve plant schedule for next week given ingredient I shortage and OTIF commitments.** [`agent`]
10. **For predictive-maintenance flag on packer P12, recommend whether to open a work order now or run to the next planned changeover, with risk and cost rationale.** [`agent`]

## Quality and compliance

11. **Are any of the deviations on line 3 trending toward a CAPA escalation?** [`agent`]
12. **List GFSI-relevant quality events for the last quarter, sliced by site and severity.** [`conversation`]

## Anti-patterns

- "Auto-adjust the plant schedule." — out of scope. The MES is the system of record; the agent proposes, schedulers approve.
- "Predict batch quality before production runs." — model-dependent and high-stakes; if a quality model exists, surface its output, do not re-derive.
