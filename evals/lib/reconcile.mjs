// Comparing an answer against ground truth.
//
// The whole point of the harness. docs/QUALITY.md is honest that the 3,500-odd
// unit tests assert output SHAPE, not answer correctness — "all green" has never
// meant "the answers are right". Reconciliation is the missing half: ask the
// connector, run reference SQL against the same warehouse, and require the two
// to agree.
//
// The manual version of this already happens — HANDOVER describes values being
// "reconciled against the warehouse via /sql/preview" during headed validation.
// That is a human doing arithmetic at 11pm. This is the same check, repeatable.

import { extractNumbers, notationViolations } from './extract.mjs';

/**
 * Does the answer assert the expected value anywhere in it?
 *
 * Deliberately permissive about WHERE the number appears, strict about whether
 * it appears at all. A Genie answer is prose plus a table; requiring the value
 * at a fixed position would fail on formatting, which is not what is being
 * tested. Requiring it SOMEWHERE catches the failure that matters: the model
 * stated a number the data does not support.
 */
export function reconcile({ answerText, expected, tolerancePct = 1, expectPercent = null }) {
    const numbers = extractNumbers(answerText);
    const violations = notationViolations(answerText);

    if (!Number.isFinite(expected)) {
        return {
            ok: false,
            reason: 'no-ground-truth',
            detail: 'Reference SQL returned no usable numeric value, so nothing could be checked.',
            numbers,
            violations,
        };
    }

    if (numbers.length === 0) {
        return {
            ok: false,
            reason: 'no-numbers-in-answer',
            detail: 'The answer asserted no parseable number, so it cannot be reconciled.',
            numbers,
            violations,
        };
    }

    const candidates = expectPercent === null
        ? numbers
        : numbers.filter((n) => n.isPercent === expectPercent);

    // Tolerance is relative, because these are aggregates over a live warehouse
    // and last-digit rounding differences are not defects. An absolute floor
    // keeps near-zero expectations from demanding impossible precision.
    const allowed = Math.max(Math.abs(expected) * (tolerancePct / 100), 1e-9);

    let best = null;
    for (const n of candidates) {
        const delta = Math.abs(n.value - expected);
        if (!best || delta < best.delta) best = { delta, number: n };
    }

    if (!best) {
        return {
            ok: false,
            reason: 'no-candidate-of-expected-kind',
            detail: `Answer contained numbers but none was ${expectPercent ? 'a percentage' : 'a plain magnitude'}.`,
            numbers,
            violations,
        };
    }

    const ok = best.delta <= allowed;
    return {
        ok,
        reason: ok ? 'match' : 'mismatch',
        detail: ok
            ? `Answer states ${best.number.raw} (${best.number.value}); warehouse says ${expected}. Within ${tolerancePct}%.`
            : `Answer states ${best.number.raw} (${best.number.value}); warehouse says ${expected}. Off by ${best.delta}, tolerance was ${allowed}.`,
        expected,
        actual: best.number.value,
        delta: best.delta,
        matched: best.number,
        numbers,
        violations,
    };
}

/**
 * Reduce a /sql/preview response to the single number a golden case expects.
 *
 * Golden cases name the column rather than trusting position, because Genie and
 * the deterministic DAX path do not agree on column ordering.
 */
export function groundTruthFromRows({ columns, rows }, column) {
    if (!Array.isArray(rows) || rows.length === 0) return NaN;

    const names = (columns || []).map((c) => (typeof c === 'string' ? c : c?.name));
    const idx = column ? names.findIndex((n) => String(n).toLowerCase() === String(column).toLowerCase()) : 0;
    if (idx < 0) return NaN;

    const cell = Array.isArray(rows[0]) ? rows[0][idx] : rows[0][names[idx]];
    const value = typeof cell === 'number' ? cell : Number(String(cell ?? '').replace(/,/g, ''));
    return Number.isFinite(value) ? value : NaN;
}
