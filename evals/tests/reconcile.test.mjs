import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, groundTruthFromRows } from '../lib/reconcile.mjs';

test('an answer agreeing with the warehouse reconciles', () => {
    const r = reconcile({ answerText: 'OTIF was 93.42% last month.', expected: 93.42, expectPercent: true });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'match');
});

test('rounding inside tolerance is not a failure', () => {
    const r = reconcile({ answerText: 'about 93.4%', expected: 93.42, expectPercent: true, tolerancePct: 1 });
    assert.equal(r.ok, true);
});

test('a number the data does not support fails, and says by how much', () => {
    const r = reconcile({ answerText: 'OTIF was 97.8%', expected: 93.42, expectPercent: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'mismatch');
    assert.equal(r.actual, 97.8);
    assert.match(r.detail, /Off by/);
});

test('the 1000x notation failure is caught as a mismatch, not excused', () => {
    // The DEC-UNITS defect exactly: model says "854.42 K", truth is 854.42 M
    // under the project convention — 854,420 vs 854,420,000.
    const r = reconcile({ answerText: 'GHG was 854.42 K tCO2e', expected: 854_420_000 });
    assert.equal(r.ok, false);
    assert.ok(r.violations.length > 0, 'and the notation violation is reported alongside');
});

test('an answer with no number cannot be reconciled and says so', () => {
    const r = reconcile({ answerText: 'I need more detail to answer that.', expected: 93.42 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-numbers-in-answer');
});

test('missing ground truth fails closed rather than passing vacuously', () => {
    const r = reconcile({ answerText: 'OTIF was 93.42%', expected: NaN });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-ground-truth');
});

test('expectPercent ignores a matching bare magnitude', () => {
    // 93.42 appears, but not as a percentage — a connector that answered with a
    // raw count that happens to equal the target has not answered the question.
    const r = reconcile({ answerText: 'we shipped 93.42 thousand cases', expected: 93.42, expectPercent: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-candidate-of-expected-kind');
});

test('the closest number wins when an answer states several', () => {
    const r = reconcile({
        answerText: 'OTIF 93.4% against a 95% target',
        expected: 93.42,
        expectPercent: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.actual, 93.4);
});

test('ground truth reads the named column, not the first one', () => {
    const rows = { columns: ['region', 'otif_pct'], rows: [['LATAM', 93.42]] };
    assert.equal(groundTruthFromRows(rows, 'otif_pct'), 93.42);
});

test('ground truth is case-insensitive about column names', () => {
    const rows = { columns: [{ name: 'OTIF_PCT' }], rows: [[93.42]] };
    assert.equal(groundTruthFromRows(rows, 'otif_pct'), 93.42);
});

test('an empty result set is NaN, which reconcile turns into a failure', () => {
    assert.ok(Number.isNaN(groundTruthFromRows({ columns: ['x'], rows: [] }, 'x')));
    assert.ok(Number.isNaN(groundTruthFromRows({ columns: ['x'], rows: [['n/a']] }, 'x')));
});

test('a column the query did not return is NaN, never a silent zero', () => {
    assert.ok(Number.isNaN(groundTruthFromRows({ columns: ['a'], rows: [[1]] }, 'missing')));
});
