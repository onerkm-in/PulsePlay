# E-Commerce & Digital Retail Pack

Preset pack for E-Commerce and Digital Retail enterprises. Designed for online fashion, consumer electronics, home decor, digital grocery, and omni-channel retail operations. Grounded in standard retail operations and Google Analytics 4 (GA4) Enhanced Ecommerce specifications.

## Why this pack exists

Digital retail teams typically have:
- A variety of analytics interfaces (Google Analytics for web traffic, Shopify/Magento reports for orders, custom SQL over snowflake/Lakehouse for stock, and advertising consoles for ad spend).
- AI models that lack knowledge of retail metrics like GMROI, ROAS, sell-through rate, and CAC cohorts.
- No shared dictionary definitions connecting business terms to database fields.

This pack provides a unified vocabulary, metric formulas, and templates so PulsePlay users can build robust e-commerce analytics quickly.

## Sub-verticals

| Sub-vertical | Status | Focus |
|--------------|--------|-------|
| [Merchandising](sub-verticals/merchandising/README.md) | substantive | Product profitability, inventory velocity, GMROI |
| [Digital Marketing](sub-verticals/digital-marketing/README.md) | substantive | Customer acquisition, attribution funnels, ROAS |
| [Sustainability (overlay)](sub-verticals/sustainability/README.md) | substantive | Packaging EPR, carbon footprint per delivery |

## References

- **GA4 Ecommerce Reference**: Standard events for purchase, checkout, cart additions.
- **National Retail Federation**: Standard definitions for inventory turn and gross margin.
- **GHG Protocol Scope 3**: Carbon calculations for freight and packaging.
