// @ts-check
'use strict';

/**
 * groundingVerifier.js — cross-check prose numbers against source rows.
 *
 * The existing insightsValidator only checks that a number is PRESENT in a
 * section (shape/format). This module checks that each number a model CITED
 * actually appears in — or is directly derivable from — the deterministic
 * rows it was grounded on. It is the enforcement half of "retrieve then
 * narrate": the prompt tells the model to cite only grounded figures; this
 * verifies it obeyed and stamps a trust status the UI can surface.
 *
 * Pure + stateless: `verifyGrounding(prose, groundedData)` → verdict object.
 * It never throws on bad input; malformed data yields an 'ungrounded' verdict.
 *
 * Status values (stable contract for callers/UI):
 *   'verified'          — rows present, ≥1 numeric claim, ALL claims matched
 *   'partial'           — rows present, some claims matched, some not
 *   'unverified'        — rows present, ≥1 claim, NONE matched
 *   'no-numeric-claims' — rows present, prose cited no checkable figures
 *   'ungrounded'        — no rows supplied (nothing to verify against)
 */

// Relative tolerance (1%) + absolute floor (0.5) absorbs rounding and
// magnitude-suffix display (e.g. "$2.30M" vs 2,297,200.86).
const REL_TOL = 0.01;
const ABS_FLOOR = 0.5;

const SUFFIX_MULTIPLIER = {
    k: 1e3, thousand: 1e3,
    m: 1e6, million: 1e6, mm: 1e6,
    b: 1e9, bn: 1e9, billion: 1e9,
    t: 1e12, trillion: 1e12,
};

// Matches an optional sign, optional $, a digit core (with grouping commas
// and/or a decimal), and an optional %/magnitude suffix.
//   - leading (?<![A-Za-z]) so "Q4"/"abc12" don't yield a stray number
//   - trailing (?![A-Za-z]) so the "t" in "2026 total" isn't read as a
//     trillions suffix; full-word suffixes are listed before single letters
const NUM_RE = /(?<![A-Za-z])(-?)\s*\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(%|thousand|million|billion|trillion|mm|bn|[kmbt])?(?![A-Za-z])/gi;

/**
 * Parse a single matched numeric token into a normalized value.
 * @param {string} sign
 * @param {string} digits
 * @param {string} [suffix]
 * @returns {{ value: number, isPercent: boolean, hadFormatSignal: boolean }}
 */
function parseToken(sign, digits, suffix) {
    const hadComma = digits.includes(',');
    const hadDecimal = digits.includes('.');
    let value = parseFloat(digits.replace(/,/g, ''));
    const suf = (suffix || '').toLowerCase();
    const isPercent = suf === '%';
    let hadSuffix = false;
    if (suf && suf !== '%' && SUFFIX_MULTIPLIER[suf]) {
        value *= SUFFIX_MULTIPLIER[suf];
        hadSuffix = true;
    }
    if (sign === '-') value = -value;
    const hadFormatSignal = hadComma || hadDecimal || isPercent || hadSuffix;
    return { value, isPercent, hadFormatSignal };
}

/** Parse a cell (number or stringified number with $ , % suffix) → number|null. */
function parseCell(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string') return null;
    const s = v.trim();
    if (!s) return null;
    NUM_RE.lastIndex = 0;
    const m = NUM_RE.exec(s);
    // Treat as a numeric cell ONLY when the token starts at 0 and spans the
    // whole cell — so "Q1", "order-12-x", "850 units" are NOT numbers, but
    // "2,297,200.86", "$850.00", "12.4%" are.
    if (!m || m.index !== 0 || m[0].length < s.length) return null;
    const { value } = parseToken(m[1], m[2], m[3]);
    return Number.isFinite(value) ? value : null;
}

function approxEqual(a, b) {
    const tol = Math.max(ABS_FLOOR, REL_TOL * Math.max(Math.abs(a), Math.abs(b)));
    return Math.abs(a - b) <= tol;
}

/** Bare 4-digit integers that look like calendar years — skip as claims. */
function looksLikeYear(tok) {
    return !tok.hadFormatSignal && Number.isInteger(tok.value)
        && tok.value >= 1900 && tok.value <= 2100;
}

/**
 * Build the candidate value set from grounded rows: every numeric cell, each
 * column's sum, and the row count. Prose figures are matched against these.
 * @param {Array<string>} columns
 * @param {Array<Array<*>>} rows
 * @returns {number[]}
 */
function buildCandidates(columns, rows) {
    const candidates = [];
    const colCount = columns.length || (rows[0] ? rows[0].length : 0);
    const colSums = new Array(colCount).fill(null);
    for (const row of rows) {
        const cells = Array.isArray(row) ? row : [row];
        for (let c = 0; c < cells.length; c++) {
            const n = parseCell(cells[c]);
            if (n === null) continue;
            candidates.push(n);
            colSums[c] = (colSums[c] === null ? 0 : colSums[c]) + n;
        }
    }
    for (const s of colSums) if (s !== null) candidates.push(s);
    candidates.push(rows.length); // row count is a citable figure
    return candidates;
}

/**
 * @param {string} prose
 * @param {{ columns?: Array<string>, rows?: Array<Array<*>> }|null|undefined} groundedData
 * @returns {{
 *   status: string, grounded: boolean, rowCount: number,
 *   checked: number, matched: number,
 *   unmatched: Array<{ raw: string, value: number }>
 * }}
 */
function verifyGrounding(prose, groundedData) {
    const rows = groundedData && Array.isArray(groundedData.rows) ? groundedData.rows : [];
    const columns = groundedData && Array.isArray(groundedData.columns) ? groundedData.columns : [];

    if (rows.length === 0) {
        return { status: 'ungrounded', grounded: false, rowCount: 0, checked: 0, matched: 0, unmatched: [] };
    }
    const candidates = buildCandidates(columns, rows);
    const text = typeof prose === 'string' ? prose : '';

    let checked = 0;
    let matched = 0;
    const unmatched = [];
    NUM_RE.lastIndex = 0;
    let m;
    while ((m = NUM_RE.exec(text)) !== null) {
        const tok = parseToken(m[1], m[2], m[3]);
        if (!Number.isFinite(tok.value)) continue;
        if (looksLikeYear(tok)) continue;
        checked++;
        const v = tok.value;
        const hit = candidates.some(c =>
            approxEqual(v, c)
            || (tok.isPercent && approxEqual(v / 100, c))
            || (tok.isPercent && approxEqual(v, c * 100)),
        );
        if (hit) matched++;
        else unmatched.push({ raw: m[0].trim(), value: v });
    }

    let status;
    if (checked === 0) status = 'no-numeric-claims';
    else if (unmatched.length === 0) status = 'verified';
    else if (matched === 0) status = 'unverified';
    else status = 'partial';

    const grounded = status === 'verified' || status === 'no-numeric-claims';
    return { status, grounded, rowCount: rows.length, checked, matched, unmatched };
}

module.exports = {
    verifyGrounding,
    // exported for tests
    __internals: { parseToken, parseCell, buildCandidates, approxEqual },
};
