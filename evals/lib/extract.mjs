// Pulling numbers back out of a model-authored answer.
//
// This exists because the project's accuracy contract is about MEASURED values,
// and you cannot check a measured value you cannot parse. Two things are being
// recovered at once:
//
//   1. the magnitude the answer actually asserts, so it can be compared with the
//      warehouse
//   2. whether the answer obeyed the Roman-scale notation locked in 0c7d293 —
//      M = thousand, MM = million, B = billion, and K is forbidden
//
// (2) is not pedantry. The DEC-UNITS defect was exactly this: one screen showed
// "854.42 K tCO2e" from the model beside "854.42 M" from our own formatter — the
// same number reading 1000x apart. The fix was guidance, not code, which means
// nothing in the build can currently catch a regression. This can.

// M = thousand and MM = million, per the project convention. Order matters when
// matching: MM and MN have to be tried before M or "854.42 MM" reads as 854.42
// thousand followed by a stray M.
const SCALES = [
    { token: 'MM', factor: 1e6, canonical: true },
    { token: 'MN', factor: 1e6, canonical: false, note: 'legacy MN — current convention is MM' },
    { token: 'B', factor: 1e9, canonical: true },
    { token: 'M', factor: 1e3, canonical: true },
    { token: 'K', factor: 1e3, canonical: false, note: 'K is forbidden by the notation convention — thousand is M' },
];

const SCALE_ALTERNATION = SCALES.map((s) => s.token).join('|');

// number, optional spacing, optional scale suffix, optional percent.
// Currency symbols are stripped by the caller before matching, not handled here.
const NUMBER_RE = new RegExp(
    String.raw`(-?\d[\d,]*(?:\.\d+)?)\s*(${SCALE_ALTERNATION})?\s*(%)?`,
    'g',
);

/**
 * Parse every number an answer asserts.
 *
 * Returns one entry per number found:
 *   raw        the matched text
 *   value      numeric value with the scale applied (percent left as-is, so
 *              "98.11%" is 98.11 — comparing against a warehouse percentage is
 *              the common case and rescaling to 0.9811 would surprise)
 *   isPercent  true when the number carried a %
 *   scale      the suffix token, or null
 *   violations notation-convention problems, empty when clean
 */
export function extractNumbers(text) {
    if (typeof text !== 'string' || !text) return [];

    // Strip thousands-grouped currency symbols and markdown emphasis so they
    // don't fragment a match. Bold markers matter: Genie answers arrive as
    // "**Uruguay (UY)**, 59.8%".
    const cleaned = text.replace(/\*\*/g, '').replace(/[$£€]/g, '');

    const out = [];
    for (const match of cleaned.matchAll(NUMBER_RE)) {
        const [raw, digits, scaleToken, percent] = match;

        const base = Number(digits.replace(/,/g, ''));
        if (!Number.isFinite(base)) continue;

        const scale = scaleToken ? SCALES.find((s) => s.token === scaleToken) : null;
        const violations = [];
        if (scale && !scale.canonical) violations.push(scale.note);

        out.push({
            raw: raw.trim(),
            value: percent ? base : base * (scale ? scale.factor : 1),
            isPercent: Boolean(percent),
            scale: scale ? scale.token : null,
            violations,
        });
    }
    return out;
}

/**
 * Every notation violation in an answer, deduplicated.
 *
 * Kept separate from extractNumbers so a caller can assert notation compliance
 * on an answer whose numbers it does not otherwise care about.
 */
export function notationViolations(text) {
    const seen = new Set();
    for (const n of extractNumbers(text)) {
        for (const v of n.violations) seen.add(`${n.raw} — ${v}`);
    }
    return [...seen];
}
