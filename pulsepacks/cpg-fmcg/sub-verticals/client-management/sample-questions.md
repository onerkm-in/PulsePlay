# Client Management — Sample Questions

Split by client type. Both lists draw on overlapping infrastructure but answer materially different decisions.

## Retail clients

### Descriptive

1. **What is our scorecard with retailer R for the current quarter?** [`conversation`]
2. **OTIF and fill-rate trend with our top 5 retail clients for the last 13 weeks.** [`conversation`]
3. **Deductions by retailer and reason code for the last 90 days.** [`chat-completion`]

### Diagnostic

4. **Why did OTIF with retailer R drop 6 points last month?** [`agent`]
   *Cross-vertical with supply chain; root cause traverses customer / lane / DC / plant / SKU.*
5. **Of the $2.3M deductions from retailer R last quarter, what is the dispute pipeline status and recovery rate?** [`agent`]
6. **Why is promo-compliance with retailer R degrading?** [`agent`]
   *Pre-event readiness, in-event execution, settlement-side issues.*

### Predictive

7. **Project FY scorecard against retailer R's commitments based on current run-rate.** [`agent`]
8. **For promo P at retailer R going live in 8 days, what is the readiness and risk profile?** [`agent`]

### Prescriptive

9. **Pre-read for tomorrow's quarterly review with retailer R: scorecard, OTIF trend, top deduction categories, open issues, JBP commitment status.** [`agent`]
   *Multi-source synthesis; the canonical "customer-meeting prep" use case.*
10. **JBP volume commitment is 60% landed at week 26. Recommend the lever set to close the gap.** [`agent`]
    *Cross-vertical with commercial-retail.*

## Warehousing clients

### Descriptive

11. **Throughput vs contract for warehousing client W this quarter.** [`conversation`]
12. **On-time loading trend for client W for the last 4 weeks.** [`chat-completion`]
13. **Slot utilisation by dock door for site Z with peak / off-peak split.** [`conversation`]
14. **Claims and damages by client and category for the last 6 months.** [`chat-completion`]

### Diagnostic

15. **Why did on-time loading degrade for client W in the last 4 weeks?** [`agent`]
    *Inbound surge, staffing, dock-scheduling, equipment, weather.*
16. **What is driving the rise in damages for client W's category C?** [`agent`]
    *Handling, packaging, racking, transit.*
17. **Why did inventory accuracy drift at site Z?** [`agent`]
    *Cycle-count root-cause analysis.*

### Prescriptive

18. **For client W's SLA renewal next quarter, what is the readiness profile (open penalties, KPI trend, joint-improvement actions, leverage points)?** [`agent`]
19. **Recommend slot-allocation changes at site Z to improve dock-door utilisation while protecting on-time loading.** [`agent`]
20. **Claims-recovery cycle status — recommend prioritisation for the next 30 days.** [`agent`]

## Anti-patterns

- "Approve the deduction." / "Dispute the deduction." — out of scope. The agent surfaces evidence; humans approve.
- "Negotiate with the client." — out of scope.
- "Apply the SLA penalty." — out of scope; contract-management governance applies.
