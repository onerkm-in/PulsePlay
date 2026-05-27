// @ts-check
'use strict';

const { matchQuestion, __internals } = require('../lib/powerbiQuestionMatcher');

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
