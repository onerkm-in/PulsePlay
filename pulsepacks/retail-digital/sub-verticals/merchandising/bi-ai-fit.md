# BI-AI Integration Guide — Merchandising

Bridges the business concepts to database schemas and UI layouts.

## Schema Expectations
- **Inventory Stock Table:** Expected fields `sku_id`, `units_on_hand`, `unit_cost`, `location_id`.
- **Sales Transactions Table:** Expected fields `order_id`, `sku_id`, `units_sold`, `gross_revenue`, `cogs`.

## Visualization Layout
- Use line charts to track Sell-Through trajectories.
- Use scatter plots of GMROI vs Inventory Value to identify low-yield high-carrying-cost outliers.
