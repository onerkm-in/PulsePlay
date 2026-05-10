# IT / Admin — Sample Questions

## Descriptive

1. **What is the open-incident backlog by application and severity?** [`chat-completion`]
2. **Show MTTR trend for tier-1 applications for the last quarter.** [`conversation`]
3. **Top 10 cloud-cost services by monthly spend.** [`chat-completion`]

## Diagnostic

4. **Why has ServiceNow ticket volume spiked for application X?** [`agent`]
   *Cross-source: incident category trends + recent change records + APM error rates.*
5. **Why is AI-platform consumption up 38% month-over-month?** [`agent`]
   *Drill: which agents, which question patterns, which connector profiles.*
6. **Why is Power BI premium capacity at site A throttling?** [`agent`]
   *Concurrent-user load, query patterns, dataset refresh schedules, model size.*

## Predictive

7. **Project cloud spend for next quarter given current run-rate and known committed-use discounts.** [`agent`]
8. **Which applications are highest risk for SLA breach in the next 30 days?** [`agent`]

## Prescriptive

9. **Recommend license-pool optimisation for application Y across offices to free seats while preserving access.** [`agent`]
10. **For Genie space S with drift evidence, recommend rollback vs recalibrate-evaluation-set, with rationale.** [`agent`]

## AI governance ops

11. **Show evaluation-set pass-rate by agent and version for the last 4 release cycles.** [`conversation`]
12. **Which agents have answered out-of-scope questions (per the classifier) and at what rate?** [`agent`]

## Anti-patterns

- "Restart server X." — out of scope for the AI sidebar; ITSM-side automation handles this.
- "Apply this patch." — out of scope; change-management governance applies.

<!-- SME REVIEW NEEDED:
     IT ops SME should validate that the question taxonomy maps to the ITIL processes the adopting org actually runs, and that AI-governance questions align with the org's AI-policy framework. -->
