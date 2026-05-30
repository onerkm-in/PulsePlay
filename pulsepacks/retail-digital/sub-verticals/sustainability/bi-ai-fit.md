# Sustainability Overlay BI-AI Fit

> **Owner:** Retail ESG Oversight Board
> **Author:** Retail ESG Team
> **Last reviewed:** 2026-05-23
> **Source register:** `knowledge-base/references.md`
> **Source IDs:** `ESG-R01`
> **Confidence:** reviewed

Understanding how and where sustainability analytics are consumed across BI and AI systems.

## BI Host Surfaces

In digital retail enterprises, sustainability and circularity metrics typically live in:
1. **Supply Chain Control Towers (Power BI / Tableau):** Integrated dashboard tabs focusing on circularity rate, emissions per shipment, and package weight by material.
2. **ESG Compliance Scorecards (Looker):** High-level regulatory dashboards tracking Scope 3 carbon metrics and material composition for Extended Producer Responsibility (EPR) reporting.

## AI Fit & Shapes

1. **Agent (Mosaic Supervisor / LangGraph):** Required for complex calculations such as Extended Producer Responsibility tax impacts or evaluating supplier change scenarios. The agent has the capacity to query multiple tool endpoints (such as order registers and supplier ESG catalog tools).
2. **Conversation (Genie):** Suited for ad-hoc inquiries like "What was the packaging circularity rate for the electronics department last month?" or exploring emissions trends.

## Known Anti-Patterns

- **Stateless Chat Completion for Multi-Stream Audits:** Using a basic, stateless single-turn LLM to review packaging compliance is an anti-pattern. Evaluating packaging circularity across multiple SKU-fulfillment channels requires state tracking, reference data access, and sequential analysis.
- **Direct Database Math on Raw Material Weights without Standardization:** Attempting to query raw database values directly without linking to a unified ontology leads to inconsistent reporting between ERP systems and frontend dashboards.
