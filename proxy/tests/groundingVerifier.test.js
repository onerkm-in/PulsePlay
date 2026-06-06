'use strict';

const { verifyGrounding, __internals } = require('../lib/groundingVerifier');
const { parseCell, parseToken } = __internals;

// Quarterly revenue — the canonical smoke-fixture shape (Q1=100 … Q4=250).
const REVENUE = {
    columns: ['period', 'revenue'],
    rows: [['Q1', 100], ['Q2', 200], ['Q3', 300], ['Q4', 250]],
};

describe('groundingVerifier — parseToken/parseCell', () => {
    test('parses magnitude suffixes and currency/commas', () => {
        expect(parseToken('', '2.30', 'M').value).toBeCloseTo(2_300_000, 0);
        expect(parseToken('', '1,234.5', '').value).toBeCloseTo(1234.5, 4);
        expect(parseToken('-', '5', 'k').value).toBeCloseTo(-5000, 0);
    });

    test('parseCell only accepts clean numeric cells', () => {
        expect(parseCell(100)).toBe(100);
        expect(parseCell('2,297,200.86')).toBeCloseTo(2_297_200.86, 2);
        expect(parseCell('$850.00')).toBeCloseTo(850, 2);
        expect(parseCell('Q1')).toBeNull();        // label, not a number
        expect(parseCell('order-12-x')).toBeNull(); // id, not a number
        expect(parseCell('850 units')).toBeNull();  // mixed, not a clean number
    });
});

describe('groundingVerifier — verifyGrounding', () => {
    test('ungrounded when no rows supplied', () => {
        const v = verifyGrounding('Revenue was $500.', { columns: [], rows: [] });
        expect(v.status).toBe('ungrounded');
        expect(v.grounded).toBe(false);
    });

    test('verified when every cited figure is in the rows (incl. column sum)', () => {
        const v = verifyGrounding(
            'Q4 revenue was 250, the strongest quarter; total revenue reached $850.',
            REVENUE,
        );
        expect(v.status).toBe('verified');
        expect(v.grounded).toBe(true);
        expect(v.checked).toBe(2);   // 250 (cell) + 850 (column sum)
        expect(v.matched).toBe(2);
        expect(v.rowCount).toBe(4);
    });

    test('matches magnitude-suffix display against the underlying value', () => {
        const v = verifyGrounding('Total sales of $2.30M.', {
            columns: ['measure', 'value'],
            rows: [['Total Sales', 2_297_200.86]],
        });
        expect(v.status).toBe('verified');
    });

    test('matches a percentage cited against a fraction-stored cell', () => {
        const v = verifyGrounding('Margin held at 12.4%.', {
            columns: ['metric', 'value'],
            rows: [['margin', 0.124]],
        });
        expect(v.status).toBe('verified');
    });

    test('flags an invented number (partial) and lists it', () => {
        const v = verifyGrounding(
            'Q4 revenue was 250, and the pipeline is worth $9,999.',
            REVENUE,
        );
        expect(v.status).toBe('partial');
        expect(v.grounded).toBe(false);
        expect(v.matched).toBe(1);
        expect(v.unmatched).toHaveLength(1);
        expect(v.unmatched[0].value).toBeCloseTo(9999, 0);
    });

    test('unverified when no cited figure matches', () => {
        const v = verifyGrounding('Revenue was $1,234 falling to $567.', REVENUE);
        expect(v.status).toBe('unverified');
        expect(v.matched).toBe(0);
    });

    test('no-numeric-claims is treated as grounded (nothing to fabricate)', () => {
        const v = verifyGrounding('Performance improved steadily across the year.', REVENUE);
        expect(v.status).toBe('no-numeric-claims');
        expect(v.grounded).toBe(true);
    });

    test('ignores calendar years so they are not false-flagged', () => {
        const v = verifyGrounding('In 2026 total revenue reached $850.', REVENUE);
        expect(v.status).toBe('verified'); // 2026 skipped, 850 matched (sum)
        expect(v.checked).toBe(1);
    });

    test('matches the row count as a citable figure', () => {
        const v = verifyGrounding('Results span 4 quarters.', REVENUE);
        expect(v.status).toBe('verified');
    });
});
