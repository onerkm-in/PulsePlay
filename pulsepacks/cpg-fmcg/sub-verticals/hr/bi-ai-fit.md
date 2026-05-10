# HR — BI / AI Fit

## BI surface fit

| Surface | Typical content |
|---------|-----------------|
| **Power BI** | Workforce dashboards, attrition trends, recruiting funnels, safety scorecards. |
| **Tableau** | Cross-functional people-analytics views; commonly used by people-analytics teams in mature CPG estates. |
| **Looker** | Modern HRIS-on-lakehouse stacks; less common in CPG. |
| **Generic iframe** | Workday / SuccessFactors / Oracle HCM native dashboards when deep integration is not yet built. |

## AI shape fit

| Question type | Best shape | Why |
|---------------|------------|-----|
| Headcount / attrition / time-to-fill lookup | `chat-completion` | Single-source aggregation. |
| Attrition root-cause | `agent` | Multi-source: pay, manager span, geography, engagement. |
| Skills-gap mapping | `agent` | Cross-source: HRIS skills, learning records, role requirements. |
| Staffing recommendation | `agent` | Cross-vertical with manufacturing / supply-chain demand. |

## Anti-patterns

- **Do not surface individual-employee predictions to operational users.** Flight-risk and performance models are aggregated, used to design programs, not to act on individuals. Local employment-law constraints apply (notably GDPR Art. 22 for EU automated decision-making).
- **Do not blend self-identified demographic data with prediction models.** Data minimisation, purpose limitation, and consent rules apply.
- **Do not embed engagement-survey raw responses in agent prompts.** Aggregate-only access; raw responses are typically protected even from HRBPs.

## Validation references

- **WEF Future of Jobs Report 2025.** https://www.weforum.org/publications/the-future-of-jobs-report-2025/
- **Deloitte 2025 Global Human Capital Trends.** https://www.deloitte.com/us/en/about/press-room/deloitte-report-aims-to-help-leaders-navigate-complex-workplace-tensions.html

<!-- SME REVIEW NEEDED:
     A people-analytics SME and a privacy / employment-law reviewer should validate the anti-patterns section for jurisdiction-specific compliance (especially EU GDPR, UK DPA, California CPRA, and emerging AI-specific employment regulation). -->
