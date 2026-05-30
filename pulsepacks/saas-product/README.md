# SaaS & Digital Products Pack

> **Owner:** SaaS Product Operations
> **Author:** SaaS Engineering & Finance Teams
> **Last reviewed:** 2026-05-23
> **Source register:** `knowledge-base/references.md`

Preset pack for Software-as-a-Service (SaaS) and Digital Product enterprises. Designed for B2B and B2C subscription platforms, developer tooling, API products, and cloud infrastructure companies. Grounded in standard SaaS metrics taxonomies and GHG Protocol Scope 3 Category 11 computing standards.

## Why this pack exists

SaaS and digital product teams typically have:
- Fragmented analytics split between billing platforms (Stripe, Chargebee), application analytics (Amplitude, Mixpanel), cloud infrastructure dashboards (AWS, Azure, GCP), and financial spreadsheets.
- AI systems that lack deep domain context on SaaS mechanics such as ARR bridges, NRR dynamics, customer cohorts, and computing PUE optimization.
- Lack of ontological mappings to tie subscription events cleanly to financial reporting pipelines.

This pack provides a unified vocabulary, metric formulas, and templates so digital product organizations can easily evaluate subscription metrics and cloud efficiency.

## Sub-verticals

| Sub-vertical | Status | Focus |
|--------------|--------|-------|
| [SaaS Finance](sub-verticals/finance-saas/README.md) | substantive | Annual Recurring Revenue (ARR), NRR cohorts, LTV:CAC payback |
| [Sustainability (overlay)](sub-verticals/sustainability/README.md) | substantive | Cloud compute PUE, carbon footprints across server instances |

## How to use this pack

Use the provided demo configuration under `demo-configs/saas-metrics-finance.json` to immediately stand up a local sandbox. Point your AI connector to your cloud data warehouse containing customer subscription logs and cloud billing records.

## Status and known gaps

- **SaaS Finance:** Fully aligned with standard VC/SaaS financial accounting practices.
- **Sustainability Overlay:** Focuses heavily on Cloud PUE and average computing grid carbon intensity. Direct CPU/GPU instruction-level profiling is marked as a future enhancement.
