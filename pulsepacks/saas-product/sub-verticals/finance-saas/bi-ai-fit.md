# SaaS Finance BI-AI Fit

> **Owner:** SaaS Financial Operations
> **Author:** SaaS FP&A Team
> **Last reviewed:** 2026-05-23
> **Source register:** `knowledge-base/references.md`
> **Source IDs:** `SAAS-F01`, `SAAS-F02`
> **Confidence:** reviewed

Understanding how and where SaaS finance and ARR analytics are consumed across BI and AI systems.

## BI Host Surfaces

In SaaS enterprises, financial and recurring revenue metrics typically live in:
1. **Executive Financial Dashboards (Power BI / Tableau):** Standard enterprise grids containing the ARR bridge (new, expansion, contraction, churn) and trailing NRR cohort matrices.
2. **Growth Operations Panels (Looker):** Sales and marketing acquisition tracking surfaces highlighting LTV:CAC, payback months, and conversion funnel outcomes.

## AI Fit & Shapes

1. **Agent (Mosaic Supervisor / LangGraph):** Crucial for running multi-step forecast scenario analysis, such as modeling ARR impact based on contract renewal contractions or computing cross-variable LTV changes under fluctuating churn rates.
2. **Conversation (Genie):** Highly effective for quick, interactive questions regarding cohort health, monthly MRR growth benchmarks, or spend materiality threshold checks.

## Known Anti-Patterns

- **Stateless Chat Completion for ARR Bridges:** Using single-turn stateless LLMs to analyze recurring billing streams is an anti-pattern. Identifying net new movements requires access to historical contract logs, sequential processing of billing events, and stateful customer context.
- **Reporting Cohort Retention without Segment Filters:** Evaluating NRR across the entire business aggregate without segmenting by Enterprise vs. SMB hides critical risk vectors, as high enterprise expansion can mask high churn rates in volume-driven lower tiers.
