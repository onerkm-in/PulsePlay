# SaaS Green Computing BI-AI Fit

> **Owner:** Corporate Engineering ESG Office
> **Author:** Green Computing Team
> **Last reviewed:** 2026-05-23
> **Source register:** `knowledge-base/references.md`
> **Source IDs:** `ESG-S01`
> **Confidence:** reviewed

Understanding how and where green computing and cloud carbon metrics are consumed across BI and AI systems.

## BI Host Surfaces

In SaaS enterprises, software sustainability and computing efficiency metrics typically live in:
1. **Infrastructure & Cloud Operations Panels (Power BI / Tableau):** Engineering dashboards tracking hosting costs, resource utilization, and average region PUE.
2. **ESG Sustainability Portals (Looker):** Corporate compliance dashboards summarizing total Scope 3 Category 11 greenhouse gas emissions for annual sustainability audits.

## AI Fit & Shapes

1. **Agent (Mosaic Supervisor / LangGraph):** Crucial for evaluating complex, multi-variable migration scenarios, such as modeling emissions improvements if workloads are dynamically rescheduled to green regions during peak grid intensity.
2. **Conversation (Genie):** Highly suited for descriptive queries like "What is our average PUE rating across AWS and GCP?" or comparing monthly emissions trajectories.

## Known Anti-Patterns

- **Stateless Chat Completion for Workload Rescheduling:** Relying on stateless single-turn LLMs to plan cloud workload migrations is an anti-pattern. Workload scheduling requires real-time grid intensity feeds, current cluster utilization states, and sequential analysis.
- **Reporting Aggregate Server Emissions without Grid Factors:** Computing carbon footprint by simply multiplying total computing hours by a fixed constant factor hides the reality that data centers in different regions (e.g., fossil-heavy vs. hydro/solar-heavy grids) produce dramatically different emissions per kWh.
