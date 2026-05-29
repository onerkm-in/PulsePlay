# E-Commerce & Retail Ontology

Defines the domain entity model for E-Commerce and Digital Retail.

## Entities
1. **Product** — Represents a sellable unit (SKU) containing category, sub-category, brand, standard price, and COGS.
2. **Order** — Represents a transaction made by a Customer, containing order items, pricing, tax, shipping costs, and distribution node.
3. **Customer** — Represents a buyer profile, tracked via unique customer id, cohort registration month, acquisition source, and historical orders.
4. **Marketing Campaign** — Represents an advertising campaign on an external channel (e.g. Google Ads, Meta, TikTok) carrying impressions, clicks, cost, and attributed conversions.
5. **Shipment** — Represents a fulfillment delivery containing origin distribution center, packaging material stream, weight, and carrier transport lane.

## Relationships
- A `Customer` places one or more `Orders`.
- An `Order` contains multiple `Products`.
- An `Order` can be attributed to a `Marketing Campaign` using a designated attribution model (e.g. Last Click, GA4 Data-Driven).
- A `Shipment` fulfills an `Order` and generates a Scope 3 transport emission stream.
