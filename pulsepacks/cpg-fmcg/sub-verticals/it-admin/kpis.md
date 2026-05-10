# IT / Admin — KPIs

## MTTD / MTTR (Mean Time to Detect / Repair)

- **Definition.** Average time from incident occurrence to detection (MTTD) and from detection to resolution (MTTR).
- **Formula.**
  - MTTD = (sum of detection times) / (number of incidents)
  - MTTR = (sum of repair times) / (number of incidents)
- **Direction.** Lower is better.
- **Source / standard.** Standard ITIL / ITSM KPI.
- **Refresh cadence.** Weekly trend; per-incident events tracked daily.

## SLA Adherence

- **Definition.** Percentage of incidents and requests resolved within the agreed service-level target.
- **Formula.** SLA adherence % = (tickets within SLA) / (total tickets) x 100, sliced by tier and category.
- **Direction.** Higher is better.
- **Source / standard.** Standard ITIL / ITSM KPI.
- **Refresh cadence.** Daily for operational view; monthly for governance reporting.

## Change Failure Rate

- **Definition.** Percentage of changes that result in incidents or rollbacks.
- **Formula.** Change failure rate % = (changes resulting in incidents or rollbacks) / (total changes) x 100.
- **Direction.** Lower is better.
- **Source / standard.** ITIL change management; widely used in DORA / DevOps benchmarks.
- **Refresh cadence.** Monthly.

## Cloud Spend Variance vs Budget

- **Definition.** Variance between actual cloud spend and budgeted cloud spend by service and team.
- **Formula.** Cloud spend variance = actual - budget. As percentage: variance % = (actual - budget) / budget x 100.
- **Direction.** Target band (consistent over-spend signals discipline gap; consistent under-spend signals planning gap).
- **Source / standard.** FinOps Foundation framework. https://www.finops.org/
- **Refresh cadence.** Daily during ramp; monthly for steady-state reporting.

## License Utilisation

- **Definition.** Active-user count divided by licensed-seat count, by application.
- **Formula.** License utilisation % = (active users in period) / (licensed seats) x 100.
- **Direction.** Target band (very low signals over-licensing; 100% may signal capacity-constrained users).
- **Source / standard.** Standard SAM (Software Asset Management) KPI.
- **Refresh cadence.** Quarterly for governance; monthly for trend.

## Application Availability / Uptime

- **Definition.** Percentage of scheduled service hours during which the application was available.
- **Formula.** Uptime % = (available hours) / (scheduled hours) x 100.
- **Direction.** Higher is better.
- **Source / standard.** Standard service-management KPI; SLA-anchored.
- **Refresh cadence.** Monthly.

## AI Agent Evaluation Pass-Rate

- **Definition.** Percentage of evaluation-set questions where the agent's answer passes the validator suite (correctness, citation, scope).
- **Formula.** Pass-rate % = (passed questions) / (total evaluation-set questions) x 100, per agent and version.
- **Direction.** Higher is better; trend deltas across versions are the action signal.
- **Source / standard.** Internal AI governance practice; emerging alignment with NIST AI RMF "MEASURE" function.
- **Refresh cadence.** Per release cycle; monthly trend reporting.

## Cost per AI Conversation

- **Definition.** Total AI-platform cost divided by total user conversations.
- **Formula.** Cost per conversation = (AI platform spend) / (conversations).
- **Direction.** Lower is better, balanced against conversation quality and outcome.
- **Source / standard.** Internal FinOps for AI; emerging practice.
- **Refresh cadence.** Weekly.

## Identity / Access Anomaly Rate

- **Definition.** Anomalous identity events (impossible-travel, unusual access, privilege creep) per user per period.
- **Formula.** Definition-only at KPI level; specific calculation depends on identity-platform vendor (Okta, Entra ID, Ping).
- **Direction.** Lower is better.
- **Source / standard.** Standard identity / IAM KPI.
- **Refresh cadence.** Daily.

## Backlog Aging

- **Definition.** Distribution of open tickets by age band.
- **Formula.** Definition-only; reported as histogram or median age.
- **Direction.** Right-shift in the distribution is bad.
- **Source / standard.** Standard ITSM KPI.
- **Refresh cadence.** Daily.

<!-- SME REVIEW NEEDED:
     - SLA tiers, target levels, and ticket-category taxonomies are highly org-specific.
     - AI governance KPIs (eval pass-rate, cost per conversation) are emerging-practice; trade specifics with IT ops and AI-platform owners. -->
