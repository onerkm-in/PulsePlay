// The hallucination gate reuses the proxy's own grounding verifier (same-repo
// source import, no npm dependency) in Roman-scale mode. These tests prove the
// cross-package import works in CI and that the scale actually is Roman —
// both would fail silently at live-run time otherwise.

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGrounding } from '../lib/grounding.mjs';

const KPI_ROWS = {
    columns: ['measure', 'value'],
    rows: [['Backorder Units', 128400], ['OTIF %', 95.21], ['Deduction Cost', 2297200.86]],
};

test('verified when every cited number is in the rows', () => {
    const v = checkGrounding('OTIF held at 95.21% with 128,400 units on backorder.', KPI_ROWS);
    assert.equal(v.status, 'verified');
    assert.equal(v.grounded, true);
});

test('Roman scale: 128.4M means 128.4 thousand and matches', () => {
    const v = checkGrounding('Backorders reached 128.4M units.', KPI_ROWS);
    assert.equal(v.status, 'verified');
});

test('Roman scale: $2.30MM means 2.30 million and matches', () => {
    const v = checkGrounding('Deductions cost $2.30MM.', KPI_ROWS);
    assert.equal(v.status, 'verified');
});

test('an invented number is flagged', () => {
    const v = checkGrounding('OTIF held at 95.21%, saving $4.7MM versus plan.', KPI_ROWS);
    assert.equal(v.status, 'partial');
    assert.equal(v.unmatched.length, 1);
});

test('all-invented numbers are unverified', () => {
    const v = checkGrounding('Revenue grew 12% to $9.9MM.', KPI_ROWS);
    assert.equal(v.status, 'unverified');
    assert.equal(v.grounded, false);
});

test('prose with no numeric claims is grounded (nothing to fabricate)', () => {
    const v = checkGrounding('Performance improved steadily.', KPI_ROWS);
    assert.equal(v.status, 'no-numeric-claims');
    assert.equal(v.grounded, true);
});
