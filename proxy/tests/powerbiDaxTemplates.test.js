// @ts-check
'use strict';

const {
    TEMPLATES,
    getTemplate,
    listTemplates,
    __internals,
} = require('../lib/powerbiDaxTemplates');

const { sanitiseSlotName, sanitiseMeasureName, clampTopN, formatCell, bracketMeasure } = __internals;

describe('powerbiDaxTemplates — registry', () => {
    test('exposes 4 templates with stable ids', () => {
        const ids = Object.keys(TEMPLATES).sort();
        expect(ids).toEqual(['aggregate-by', 'top-n', 'total', 'trend']);
    });

    test('listTemplates returns { id, label, description, examples } for each', () => {
        const list = listTemplates();
        expect(list).toHaveLength(4);
        for (const t of list) {
            expect(typeof t.id).toBe('string');
            expect(typeof t.label).toBe('string');
            expect(typeof t.description).toBe('string');
            expect(Array.isArray(t.examples)).toBe(true);
            expect(t.examples.length).toBeGreaterThan(0);
        }
    });

    test('getTemplate returns null for unknown id', () => {
        expect(getTemplate('made-up')).toBeNull();
    });
});

describe('powerbiDaxTemplates — sanitisation', () => {
    test('accepts safe identifier names', () => {
        expect(sanitiseSlotName('Sales', 'table')).toBe('Sales');
        expect(sanitiseSlotName('Total Revenue', 'measure')).toBe('Total Revenue');
        expect(sanitiseSlotName('Sales.Region', 'col')).toBe('Sales.Region');
        expect(sanitiseSlotName('order_id', 'col')).toBe('order_id');
        expect(sanitiseSlotName('Q1-2025', 'col')).toBe('Q1-2025');
    });

    test('accepts Power BI rate measure names with percent signs', () => {
        expect(sanitiseMeasureName('Sales YoY %')).toBe('Sales YoY %');
        expect(bracketMeasure('Sales YoY %')).toBe('[Sales YoY %]');
    });

    test('rejects DAX injection vectors', () => {
        expect(() => sanitiseSlotName('Sales]; EVALUATE', 'col')).toThrow(/not allowed/);
        expect(() => sanitiseSlotName("Sales'); --", 'col')).toThrow(/not allowed/);
        expect(() => sanitiseSlotName('Sales[Hack]', 'col')).toThrow(/not allowed/);
        expect(() => sanitiseMeasureName('Sales]; EVALUATE')).toThrow(/not allowed/);
        expect(() => sanitiseSlotName('', 'col')).toThrow(/not allowed/);
        expect(() => sanitiseSlotName('   ', 'col')).toThrow(/not allowed/);
        expect(() => sanitiseSlotName('a/b', 'col')).toThrow(/not allowed/);
    });

    test('clampTopN clamps to 1..100 and defaults sanely', () => {
        expect(clampTopN(5)).toBe(5);
        expect(clampTopN(0)).toBe(10);
        expect(clampTopN(-5)).toBe(10);
        expect(clampTopN(999)).toBe(100);
        expect(clampTopN(undefined)).toBe(10);
        expect(clampTopN('25')).toBe(25);
        expect(clampTopN('nonsense')).toBe(10);
        expect(clampTopN(3.7)).toBe(3);
    });
});

describe('powerbiDaxTemplates — top-n DAX shape', () => {
    test('builds a TOPN DAX statement with sanitised identifiers', () => {
        const t = getTemplate('top-n');
        const dax = t.buildDax({
            measure: 'Total Revenue',
            dimensionTable: 'Customers',
            dimensionColumn: 'CustomerName',
            n: 5,
        });
        expect(dax).toContain('EVALUATE TOPN(5,');
        expect(dax).toContain("'Customers'[CustomerName]");
        expect(dax).toContain('[Total Revenue]');
        expect(dax).toMatch(/ORDER BY \[Total Revenue\] DESC$/);
    });

    test('defaults n to 10 when omitted', () => {
        const dax = getTemplate('top-n').buildDax({
            measure: 'Revenue',
            dimensionTable: 'Region',
            dimensionColumn: 'Name',
        });
        expect(dax).toContain('TOPN(10,');
    });

    test('renders rows as a Markdown table with a sized heading', () => {
        const out = getTemplate('top-n').buildResult({
            columns: ['Region[Name]', 'Revenue'],
            rows: [['East', 100000], ['West', 80000]],
            slots: { measure: 'Revenue', dimensionTable: 'Region', dimensionColumn: 'Name' },
        });
        expect(out.content).toMatch(/## Top 2 Name by Revenue/);
        expect(out.content).toContain('| East | 100,000 |');
        expect(out.content).toContain('| West | 80,000 |');
    });

    test('handles empty result with a friendly message', () => {
        const out = getTemplate('top-n').buildResult({
            columns: ['Region[Name]', 'Revenue'],
            rows: [],
            slots: { measure: 'Revenue', dimensionTable: 'Region', dimensionColumn: 'Name' },
        });
        expect(out.content).toMatch(/No rows returned/i);
    });
});

describe('powerbiDaxTemplates — aggregate-by DAX shape', () => {
    test('builds a SUMMARIZECOLUMNS without TOPN', () => {
        const dax = getTemplate('aggregate-by').buildDax({
            measure: 'Profit Margin',
            dimensionTable: 'Products',
            dimensionColumn: 'Category',
        });
        expect(dax).toContain('EVALUATE SUMMARIZECOLUMNS');
        expect(dax).not.toContain('TOPN');
        expect(dax).toContain("'Products'[Category]");
    });
});

describe('powerbiDaxTemplates — trend DAX shape', () => {
    test('emits ORDER BY ascending on the date axis', () => {
        const dax = getTemplate('trend').buildDax({
            measure: 'Revenue',
            dateTable: 'Calendar',
            dateColumn: 'YearMonth',
        });
        expect(dax).toMatch(/ORDER BY 'Calendar'\[YearMonth\] ASC$/);
    });

    test('result includes min/max/direction headline when measure column is numeric', () => {
        const out = getTemplate('trend').buildResult({
            columns: ['Calendar[YearMonth]', 'Revenue'],
            rows: [['2025-01', 100], ['2025-02', 110], ['2025-03', 130]],
            slots: { measure: 'Revenue', dateTable: 'Calendar', dateColumn: 'YearMonth' },
        });
        expect(out.content).toMatch(/Min 100/);
        expect(out.content).toMatch(/Max 130/);
        expect(out.content).toMatch(/↑ rising/);
    });

    test('detects falling trend', () => {
        const out = getTemplate('trend').buildResult({
            columns: ['Calendar[YearMonth]', 'Revenue'],
            rows: [['2025-01', 200], ['2025-02', 100]],
            slots: { measure: 'Revenue', dateTable: 'Calendar', dateColumn: 'YearMonth' },
        });
        expect(out.content).toMatch(/↓ falling/);
    });
});

describe('powerbiDaxTemplates — total DAX shape', () => {
    test('builds a single-value EVALUATE { (measure) }', () => {
        const dax = getTemplate('total').buildDax({ measure: 'Total Revenue' });
        expect(dax).toBe('EVALUATE { ([Total Revenue]) }');
    });

    test('renders as a one-row Markdown table', () => {
        const out = getTemplate('total').buildResult({
            columns: ['[Total Revenue]'],
            rows: [[1234567]],
            slots: { measure: 'Total Revenue' },
        });
        expect(out.content).toContain('## Total Revenue');
        expect(out.content).toContain('| Metric | Value |');
        expect(out.content).toContain('| Total Revenue | 1,234,567 |');
    });

    test('handles null cell with an honest one-row table', () => {
        const out = getTemplate('total').buildResult({
            columns: [], rows: [], slots: { measure: 'X' },
        });
        expect(out.content).toContain('| X | (no value) |');
    });
});

describe('powerbiDaxTemplates — formatCell', () => {
    test('formats integers above 1000 with thousands separators', () => {
        expect(formatCell(1234567)).toBe('1,234,567');
        expect(formatCell(1000)).toBe('1,000');
    });
    test('formats small numbers without separators', () => {
        expect(formatCell(99)).toBe('99');
        expect(formatCell(0.5)).toBe('0.5');
    });
    test('trims trailing zeros on decimals', () => {
        expect(formatCell(12.5000)).toBe('12.5');
        expect(formatCell(12.34)).toBe('12.34');
    });
    test('escapes pipe characters in strings (Markdown-table safe)', () => {
        expect(formatCell('a | b')).toBe('a \\| b');
    });
    test('renders null/undefined as empty string', () => {
        expect(formatCell(null)).toBe('');
        expect(formatCell(undefined)).toBe('');
    });
});
