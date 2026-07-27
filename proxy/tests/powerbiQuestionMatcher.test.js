// @ts-check
'use strict';

const { matchQuestion, detectDroppedScope, __internals } = require('../lib/powerbiQuestionMatcher');

const probe = {
    declaredKpis: [
        { name: 'Revenue' },
        { name: 'Total Revenue' },
        { name: 'Profit Margin' },
        { name: 'Order Count' },
    ],
    schema: {
        tables: [
            {
                name: 'Customers',
                columns: [
                    { name: 'CustomerName', type: 'String' },
                    { name: 'Segment', type: 'String' },
                ],
            },
            {
                name: 'Calendar',
                columns: [
                    { name: 'YearMonth', type: 'DateTime' },
                    { name: 'Year', type: 'Int64' },
                ],
            },
            {
                name: 'Products',
                columns: [
                    { name: 'Category', type: 'String' },
                    { name: 'SKU', type: 'String' },
                ],
            },
        ],
    },
};

describe('matcher — fundamentals', () => {
    test('returns matched=false when no measure can be found', () => {
        const out = matchQuestion('What is the meaning of life?', probe);
        expect(out.matched).toBe(false);
        expect(out.kpis).toEqual(['Revenue', 'Total Revenue', 'Profit Margin', 'Order Count']);
        expect(out.suggestions.length).toBeGreaterThan(0);
    });

    test('returns matched=false when probe has no declaredKpis', () => {
        const out = matchQuestion('top 10 customers by revenue', { schema: probe.schema });
        expect(out.matched).toBe(false);
    });

    test('handles non-string question gracefully', () => {
        const out = matchQuestion(null, probe);
        expect(out.matched).toBe(false);
    });
});

describe('matcher — measure detection (longest-match)', () => {
    test('prefers "Total Revenue" over "Revenue" when both substrings present', () => {
        const out = matchQuestion('what is the total revenue?', probe);
        expect(out.matched).toBe(true);
        expect(out.slots.measure).toBe('Total Revenue');
    });

    test('falls back to "Revenue" when "Total Revenue" not in question', () => {
        const out = matchQuestion('revenue by customer name', probe);
        expect(out.matched).toBe(true);
        expect(out.slots.measure).toBe('Revenue');
    });
});

describe('matcher — total template', () => {
    test('measure alone with no dimension routes to total', () => {
        const out = matchQuestion('show me revenue', probe);
        expect(out.matched).toBe(true);
        expect(out.templateId).toBe('total');
        expect(out.slots).toEqual({ measure: 'Revenue' });
    });

    test('does not treat a measure base token as an implicit dimension', () => {
        const out = matchQuestion('Sales YTD', {
            declaredKpis: [{ name: 'Sales YTD' }],
            schema: {
                tables: [
                    { name: 'FactOrders', columns: [{ name: 'sales', type: 'decimal' }] },
                ],
            },
        });
        expect(out.matched).toBe(true);
        expect(out.templateId).toBe('total');
        expect(out.slots).toEqual({ measure: 'Sales YTD' });
    });
});

describe('matcher — aggregate-by template', () => {
    test('"X by Y" routes to aggregate-by', () => {
        const out = matchQuestion('revenue by segment', probe);
        expect(out.templateId).toBe('aggregate-by');
        expect(out.slots.measure).toBe('Revenue');
        expect(out.slots.dimensionTable).toBe('Customers');
        expect(out.slots.dimensionColumn).toBe('Segment');
    });

    test('"X for Y" pattern also works (different preposition)', () => {
        const out = matchQuestion('profit margin for category', probe);
        expect(out.templateId).toBe('aggregate-by');
        expect(out.slots.measure).toBe('Profit Margin');
        expect(out.slots.dimensionColumn).toBe('Category');
    });

    test('never picks the internal RowNumber-<guid> column as a dimension (stale inline probe)', () => {
        // The prober filters RowNumber-<guid> at the source, but clients can
        // send a stale cached probe inline that still carries it. Before the
        // matcher-side strip, the table-entity fallback ("customers" names
        // the table, not a column) picked the table's FIRST non-time column —
        // the internal RowNumber — and the generated DAX 400'd
        // (DatasetExecuteQueriesError; live repro 2026-07-03).
        const stale = {
            declaredKpis: [{ name: 'Total Sales' }],
            schema: {
                tables: [
                    {
                        name: 'DimCustomer',
                        columns: [
                            { name: 'RowNumber-2662979B-1795-4F74-8F37-6A1BA8059B61', type: 'Int64' },
                            { name: 'customer_name', type: 'String' },
                        ],
                    },
                ],
            },
        };
        const agg = matchQuestion('total sales by customer', stale);
        expect(agg.templateId).toBe('aggregate-by');
        expect(agg.slots.dimensionColumn).toBe('customer_name');
        const top = matchQuestion('top 5 customers by total sales', stale);
        expect(top.templateId).toBe('top-n');
        expect(top.slots.dimensionColumn).toBe('customer_name');
    });

    test('matches Power BI model naming styles: Dim prefix, snake_case, and name suffix', () => {
        const out = matchQuestion('total profit by manager', {
            declaredKpis: [{ name: 'Total Profit' }],
            schema: {
                tables: [
                    { name: 'DimRegionManager', columns: [{ name: 'manager_name', type: 'string' }] },
                    { name: 'FactOrders', columns: [{ name: 'profit', type: 'decimal' }] },
                ],
            },
        });
        expect(out.templateId).toBe('aggregate-by');
        expect(out.slots.dimensionTable).toBe('DimRegionManager');
        expect(out.slots.dimensionColumn).toBe('manager_name');
    });
});

describe('matcher — top-n template', () => {
    test('"top 10 X by Y" extracts both N and dimension', () => {
        const out = matchQuestion('top 10 customers by revenue', probe);
        expect(out.templateId).toBe('top-n');
        expect(out.slots.measure).toBe('Revenue');
        expect(out.slots.n).toBe(10);
        expect(out.slots.dimensionTable).toBe('Customers');
    });

    test('word-form numbers ("top five") parse correctly', () => {
        const out = matchQuestion('top five products by profit margin', probe);
        expect(out.templateId).toBe('top-n');
        expect(out.slots.n).toBe(5);
    });

    test('"top X" without an explicit number defaults to 10', () => {
        const out = matchQuestion('top customer by revenue', probe);
        expect(out.templateId).toBe('top-n');
        expect(out.slots.n).toBe(10);
    });

    test('"best/highest/leading" synonyms also trigger top-n', () => {
        expect(matchQuestion('best 3 categories by revenue', probe).templateId).toBe('top-n');
        expect(matchQuestion('highest 5 customers by revenue', probe).templateId).toBe('top-n');
    });

    test('top-N entity plural matches Dim table and *_name columns', () => {
        const out = matchQuestion('top 5 products by total sales', {
            declaredKpis: [{ name: 'Total Sales' }],
            schema: {
                tables: [
                    { name: 'DimProduct', columns: [{ name: 'product_name', type: 'string' }] },
                    { name: 'FactOrders', columns: [{ name: 'sales', type: 'decimal' }] },
                ],
            },
        });
        expect(out.templateId).toBe('top-n');
        expect(out.slots.dimensionTable).toBe('DimProduct');
        expect(out.slots.dimensionColumn).toBe('product_name');
    });
});

describe('matcher — trend template (time detection)', () => {
    test('"X over time" with a date column routes to trend', () => {
        const out = matchQuestion('revenue over time', probe);
        expect(out.templateId).toBe('trend');
        expect(out.slots.dateTable).toBe('Calendar');
    });

    test('"X by month" picks the closest date-typed column', () => {
        const out = matchQuestion('revenue by year', probe);
        expect(out.templateId).toBe('trend');
        expect(out.slots.dateColumn).toBe('Year');
    });

    test('"trend of X" without explicit date column finds a date dim via fallback', () => {
        const out = matchQuestion('revenue trend', probe);
        expect(out.templateId).toBe('trend');
        expect(out.slots.dateTable).toBe('Calendar');
    });

    test('explicit date column name in question wins over generic time keyword', () => {
        const out = matchQuestion('revenue by yearmonth', probe);
        expect(out.templateId).toBe('trend');
        expect(out.slots.dateColumn).toBe('YearMonth');
    });
});

// Star-schema SCM model: unit-suffixed measures + conformed dims that share a
// base token with fact foreign keys. Mirrors the live PulsePlay_SCM_Synthetic
// semantic model (dataset 633b2b11).
describe('matcher — star schema + unit-suffixed measures (SCM)', () => {
    const scm = {
        declaredKpis: [
            { name: 'Order Fill Rate Pct' },
            { name: 'OTIF Pct' },
            { name: 'Net Sales USD' },
            { name: 'Gross Margin Pct' },
            { name: 'GHG Emissions tCO2e' },
            { name: 'Energy Intensity kWh per Unit' },
            { name: 'Ordered Qty' },
        ],
        schema: {
            tables: [
                { name: 'ofr', columns: [
                    { name: 'country_id', type: 'String' },
                    { name: 'plant_id', type: 'String' },
                    { name: 'sales_channel', type: 'String' },
                    { name: 'date_month', type: 'DateTime' },
                ] },
                { name: 'performance', columns: [
                    { name: 'country_id', type: 'String' },
                    { name: 'date_month', type: 'DateTime' },
                ] },
                { name: 'operations', columns: [
                    { name: 'country_id', type: 'String' },
                    { name: 'plant_id', type: 'String' },
                    { name: 'date_month', type: 'DateTime' },
                ] },
                { name: 'dim_country', columns: [
                    { name: 'country_id', type: 'String' },
                    { name: 'country', type: 'String' },
                ] },
                { name: 'dim_plant', columns: [
                    { name: 'plant_id', type: 'String' },
                    { name: 'plant', type: 'String' },
                    { name: 'country_id', type: 'String' },
                ] },
                { name: 'dim_sales_channel', columns: [
                    { name: 'sales_channel', type: 'String' },
                ] },
                { name: 'dim_date', columns: [
                    { name: 'date', type: 'DateTime' },
                    { name: 'year', type: 'Int64' },
                    { name: 'month_name', type: 'String' },
                ] },
            ],
        },
    };

    test('unit-suffixed measure matches the user phrasing without the suffix', () => {
        expect(matchQuestion('net sales by country', scm).slots.measure).toBe('Net Sales USD');
        expect(matchQuestion('order fill rate by year', scm).slots.measure).toBe('Order Fill Rate Pct');
        expect(matchQuestion('gross margin by country', scm).slots.measure).toBe('Gross Margin Pct');
        expect(matchQuestion('ghg emissions by plant', scm).slots.measure).toBe('GHG Emissions tCO2e');
        expect(matchQuestion('otif by country', scm).slots.measure).toBe('OTIF Pct');
    });

    test('"per unit" ratio tail strips to the core measure name', () => {
        expect(matchQuestion('energy intensity by plant', scm).slots.measure).toBe('Energy Intensity kWh per Unit');
    });

    test('groups by the conformed dimension, NOT a fact foreign key (cross-fact correctness)', () => {
        const out = matchQuestion('net sales by country', scm);
        expect(out.templateId).toBe('aggregate-by');
        expect(out.slots.dimensionTable).toBe('dim_country');
        expect(out.slots.dimensionColumn).toBe('country');
    });

    test('"by plant" targets dim_plant[plant], never plant_id', () => {
        const out = matchQuestion('ghg emissions by plant', scm);
        expect(out.slots.dimensionTable).toBe('dim_plant');
        expect(out.slots.dimensionColumn).toBe('plant');
    });

    test('"by sales channel" targets the dim, not the fact column', () => {
        const out = matchQuestion('order fill rate by sales channel', scm);
        expect(out.slots.dimensionTable).toBe('dim_sales_channel');
        expect(out.slots.dimensionColumn).toBe('sales_channel');
    });

    test('"by year" routes to trend on dim_date[year]', () => {
        const out = matchQuestion('order fill rate by year', scm);
        expect(out.templateId).toBe('trend');
        expect(out.slots.dateTable).toBe('dim_date');
        expect(out.slots.dateColumn).toBe('year');
    });

    // The auto-briefing planner emits "Top 5 <dim> by <measure>". A measure-
    // input numeric column ("ordered_qty") must never be picked as the group-by
    // dimension via the trailing "by <measure>" phrase — that yields the
    // nonsense card "Top 5 ordered_qty by ordered qty" (live repro 2026-07-27).
    test('"Top 5 <dim> by <measure>" groups by the dim, never the measure-input column', () => {
        const scmQty = {
            declaredKpis: [{ name: 'Ordered Qty' }],
            schema: { tables: [
                { name: 'ofr', columns: [
                    { name: 'sales_channel', type: 'Text' },
                    { name: 'ordered_qty', type: 'Integer' },
                    { name: 'delivered_qty', type: 'Integer' },
                ] },
                { name: 'dim_sales_channel', columns: [{ name: 'sales_channel', type: 'Text' }] },
            ] },
        };
        const out = matchQuestion('Top 5 sales_channel by Ordered Qty', scmQty);
        expect(out.templateId).toBe('top-n');
        expect(out.slots.measure).toBe('Ordered Qty');
        expect(out.slots.dimensionColumn).toBe('sales_channel');
        expect(out.slots.dimensionColumn).not.toBe('ordered_qty');
    });

    test('a numeric measure-input column is never chosen as a dimension', () => {
        const out = matchQuestion('ordered qty by ordered qty', {
            declaredKpis: [{ name: 'Ordered Qty' }],
            schema: { tables: [
                { name: 'ofr', columns: [
                    { name: 'ordered_qty', type: 'Integer' },
                    { name: 'sales_channel', type: 'Text' },
                ] },
            ] },
        });
        // No valid dim other than the numeric input → falls back to total.
        expect(out.templateId).toBe('total');
    });
});

describe('matcher — isMeasureInputColumn helper', () => {
    test('numeric non-time columns are measure inputs', () => {
        expect(__internals.isMeasureInputColumn('ordered_qty', 'Integer')).toBe(true);
        expect(__internals.isMeasureInputColumn('net_sales_usd', 'Double')).toBe(true);
        expect(__internals.isMeasureInputColumn('cogs_usd', 'Decimal')).toBe(true);
    });
    test('numeric time grains are NOT measure inputs (kept as time dims)', () => {
        expect(__internals.isMeasureInputColumn('year', 'Integer')).toBe(false);
        expect(__internals.isMeasureInputColumn('month', 'Int64')).toBe(false);
    });
    test('text columns are never measure inputs', () => {
        expect(__internals.isMeasureInputColumn('country_id', 'Text')).toBe(false);
        expect(__internals.isMeasureInputColumn('sales_channel', 'Text')).toBe(false);
    });
    test('missing type → not excluded (name-based fallback)', () => {
        expect(__internals.isMeasureInputColumn('ordered_qty', undefined)).toBe(false);
    });
});

describe('matcher — measureVariants helper', () => {
    test('strips trailing unit suffixes', () => {
        expect(__internals.measureVariants('Net Sales USD')).toContain('net sales');
        expect(__internals.measureVariants('Order Fill Rate Pct')).toContain('order fill rate');
        expect(__internals.measureVariants('GHG Emissions tCO2e')).toContain('ghg emissions');
    });
    test('strips a "per unit" ratio tail', () => {
        expect(__internals.measureVariants('Energy Intensity kWh per Unit')).toContain('energy intensity');
    });
    test('does NOT strip meaningful words like "rate"', () => {
        expect(__internals.measureVariants('Order Fill Rate Pct')).not.toContain('order fill');
    });
    test('keeps the full name as a variant (longest-match preserved)', () => {
        expect(__internals.measureVariants('Net Sales USD')).toContain('net sales usd');
    });
});

describe('matcher — foreign-key / dimension helpers', () => {
    test('isDimensionTable recognises dim_/dm_ prefixes', () => {
        expect(__internals.isDimensionTable('dim_country')).toBe(true);
        expect(__internals.isDimensionTable('dm_plants')).toBe(true);
        expect(__internals.isDimensionTable('ofr')).toBe(false);
    });
    test('isForeignKeyColumn recognises _id/_key suffixes', () => {
        expect(__internals.isForeignKeyColumn('country_id')).toBe(true);
        expect(__internals.isForeignKeyColumn('plant_key')).toBe(true);
        expect(__internals.isForeignKeyColumn('country')).toBe(false);
        expect(__internals.isForeignKeyColumn('sales_channel')).toBe(false);
    });
});

describe('matcher — tokenise helper', () => {
    test('strips punctuation and lowercases', () => {
        expect(__internals.tokenise('What is REVENUE, by Region?')).toBe('what is revenue by region');
    });

    test('returns empty string for non-strings', () => {
        expect(__internals.tokenise(null)).toBe('');
        expect(__internals.tokenise(42)).toBe('');
    });

    test('nameVariants normalizes BI identifier conventions', () => {
        expect(__internals.nameVariants('DimCustomer')).toContain('customer');
        expect(__internals.nameVariants('product_name')).toContain('product');
        expect(__internals.nameVariants('CustomerName')).toContain('customer');
    });
});

describe('matcher — isTimeColumn helper', () => {
    test('detects date/time hints in column name', () => {
        expect(__internals.isTimeColumn('OrderDate', 'String')).toBe(true);
        expect(__internals.isTimeColumn('FiscalYear', 'Int64')).toBe(true);
        expect(__internals.isTimeColumn('CustomerName', 'String')).toBe(false);
    });

    test('detects date type even when name is opaque', () => {
        expect(__internals.isTimeColumn('SomeCol', 'DateTime')).toBe(true);
        expect(__internals.isTimeColumn('SomeCol', 'String')).toBe(false);
    });
});

describe('matcher — findTopN helper', () => {
    test('parses numeric form', () => {
        expect(__internals.findTopN('top 25 X')).toBe(25);
    });

    test('parses word form', () => {
        expect(__internals.findTopN('best ten things')).toBe(10);
    });

    test('returns null when no top-N intent', () => {
        expect(__internals.findTopN('revenue by region')).toBeNull();
    });

    test('handles "top" without a number → default 10', () => {
        expect(__internals.findTopN('top customer')).toBe(10);
    });
});

// A2 — deterministic templates apply NO value filter, so a "for/in/where X"
// qualifier is always dropped. detectDroppedScope surfaces it for disclosure.
describe('detectDroppedScope — unscoped-filter disclosure (A2)', () => {
    test('flags an unrecognized value filter ("for the Antarctica division")', () => {
        const dropped = detectDroppedScope('profit margin by quarter for the Antarctica division', { dimensionColumn: 'quarter' });
        expect(dropped).toContain('Antarctica division');
    });

    test('flags a value filter even when its dimension noun matches a real column', () => {
        // dimension matched = "region"; the *value* "west" still makes this unscoped.
        const dropped = detectDroppedScope('sales for the west region', { dimensionColumn: 'region' });
        expect(dropped).toContain('west region');
    });

    test('flags a date VALUE filter ("in 2024") — the total template ignores it', () => {
        expect(detectDroppedScope('total sales in 2024', {})).toContain('2024');
    });

    test('does NOT flag the matched dimension itself ("by region")', () => {
        // "by" is the grouping trigger, not a value filter — no for/in/where.
        expect(detectDroppedScope('sales by region', { dimensionColumn: 'region' })).toEqual([]);
    });

    test('does NOT flag a plain measure question ("what is total sales")', () => {
        expect(detectDroppedScope('what is the total sales', {})).toEqual([]);
    });

    test('excludes the exact matched dimension phrase but keeps a real filter', () => {
        // "in region" alone == the dimension (excluded); but a value filter stays.
        expect(detectDroppedScope('sales in region', { dimensionColumn: 'region' })).toEqual([]);
    });
});
