// playground/src/pulse/rendering/inlineGrammar.ts
//
// The grammar that decides which substrings of AI narrative are MEASUREMENTS,
// and therefore eligible for a coloured trend pill.
//
// Extracted verbatim from visual.tsx (DEBT_REGISTER D5 Phase 1). Pure by
// construction: strings and regexes in, primitives out. No React, no DOM, no
// imports outside this module - which is also what keeps it inside the
// Pulse-PBI compatibility surface, since sync-from-pulseplay.mjs copies
// playground/src/pulse/** wholesale and stubs anything reaching outside it.
//
// Kept together because they are one responsibility and change together: the
// unit vocabulary, the trend vocabulary, the composite regex built from both,
// and the predicates that decide whether a matched token really is a
// measurement. Splitting them further would separate a definition from the
// only thing that gives it meaning.

/**
 * Returns true when a numeric token should qualify as a *measurement* (and
 * therefore be eligible for a coloured trend pill). Bare integers and bare
 * 4-digit years (1900-2099) are explicitly rejected — they're list ordinals
 * or temporal anchors, not measurements. BUG-016 fix.
 *
 * Qualifies when the token has any of:
 *   - explicit sign (+/-)
 *   - `%` suffix
 *   - `pp` suffix (percentage points)
 *   - K/M/B/T magnitude suffix
 *   - decimal point AND not in 1900-2099 range
 */
export function isMeasurementNumber(numToken: string): boolean {
    const clean = numToken.trim();
    if (!clean) return false;
    if (/^[+-]/.test(clean)) return true;
    if (/%$/.test(clean)) return true;
    if (/pp$/i.test(clean)) return true;
    if (/[KMBT]\b/.test(clean)) return true;
    // IDEA-039 currency-prefix hotfix — `$11,644.10`, `€100.00`, `£5K` are
    // all measurements even without an explicit `+`/`-` sign. The currency
    // symbol itself is the signal that the value is a financial measurement.
    if (/^[+-]?[$€£₹¥]/.test(clean)) return true;
    // Reject bare 4-digit years (1900-2099) — most common false positive.
    if (/^(19|20)\d{2}$/.test(clean)) return false;
    // Bare integer with no unit — likely a list ordinal or count, not a delta.
    if (/^\d+$/.test(clean)) return false;
    return false;
}

export function isThresholdContext(text: string, index: number): boolean {
    const before = text.slice(Math.max(0, index - 80), index).toLowerCase();
    const after = text.slice(index, Math.min(text.length, index + 40)).toLowerCase();
    const window = `${before}${after}`;
    return /\b(threshold|target|benchmark|limit|caution|watch|warning|amber|yellow|red|green|breach|line)\b/.test(window)
        && /[<>≤≥]/.test(window);
}

export function stripNarrativeThresholdFragments(text: string): string {
    return text
        .replace(/\s*\((?=[^)]*[<>≤≥])[^)]{1,100}\)/g, "")
        .replace(/\s+([,.;:])/g, "$1");
}

export const LIST_ITEM_MARKER_RE = /^(?:[-*•]\s+|(?:\d+[.)]|\(\d+\)|\[\d+\])\s+)/;

// Session 56 perf hot-spot fix (sub-agent #9 A1): the giant 12-group regex
// below was being recompiled on every inlineFormat() call — and inlineFormat
// fires per heading + per paragraph + per bullet + per table cell, hundreds
// of times per Insights render. Hoisting to module scope avoids the compile
// while keeping all groups identical. Reset .lastIndex at function entry
// since the /g flag makes RegExp stateful.
export const TREND = "increased|increases|increase|decreased|decreases|decrease|growth|declined|declines|decline|dropped|drops|drop|rises|risen|rise|rose|up|down|higher|lower|gained|gains|gain|loss|grew|fallen|fell|reduced|improved|stagnation|rebounded|rebound";
export const POS_RE = /^(increased?|increases?|growth|rises?|risen|rose|up|higher|gained?|gains?|grew|improved|rebounded?)$/i;
export const FLAT_GLYPH = "[▪■●]";
export const FLAT_WORD = "flat|unchanged|no\\s+change";
// Units may be GLUED ("$2.30M") or SPACE-SEPARATED with a multi-letter
// magnitude ("$989.34 MN", "55.60 %"). Both forms are ours: the built-in
// section contract teaches the glued form, while the seeded domain guidance
// mandates the spaced one — and guidance wins by author precedence. This
// grammar only understood glued units, which is what orphaned bold markers:
// on `**+$42.07 MN**` the number stopped at the space, so the leading \*{0,2}
// ate the opening `**` while the trailing one had nothing left to eat, and the
// closer rendered as literal asterisks. It also left " MN" outside the pill.
// The negative lookahead keeps "5 Markets" / "up 5 Tonnes" from reading their
// first letter as a magnitude suffix.
export const MEAS_UNIT = "%|pp|MN|MM|BN|K|M|B|T";
export const MEAS_NUM = `[+-]?[$€£₹¥]?\\d[\\d,.]*(?:\\s?(?:${MEAS_UNIT})(?![A-Za-z]))?`;

/** Strip a leading +/- sign from a trend pill's number when a direction
 *  glyph (TrendPyramid) renders alongside. Codex 2026-05-19 final UAT:
 *  Rajesh saw "two up arrows" in delta pills — the second indicator was
 *  the literal "+" or "-" in the captured number reading as a direction
 *  glyph next to the actual ▲/▼ icon. Stripping the redundant sign keeps
 *  direction truth (the ▲ pyramid) and tone color, but avoids the visual
 *  echo. Currency / no-sign numbers pass through unchanged.
 *
 *  Examples:
 *    "+33.42%" → "33.42%"  (▲ pyramid already conveys direction)
 *    "-0.22%"  → "0.22%"   (▼ pyramid already conveys direction)
 *    "$1,234"  → "$1,234"  (no leading sign to strip)
 *    "20.4%"   → "20.4%"   (already sign-less)
 */
export function stripRedundantSignForPill(numberText: string): string {
    return numberText.replace(/^([+-])(?=[$€£₹¥]?\d)/, "");
}

// MODULE-SCOPE SINGLETON, exactly as it was in visual.tsx. The /g flag makes
// this stateful, so every caller must reset .lastIndex before use — moving it
// here does not change that contract, and callers already do it.
export const INLINE_REGEX = new RegExp(
    // G1,G2: [**][arrow]number[**] trend-word
    `(?:[▲▼]\\s*)?\\*{0,2}(?:[▲▼]\\s*)?(${MEAS_NUM})\\*{0,2}\\s+(${TREND})\\b` +
    // G3,G4: trend-word of/by [**][arrow]number[**]
    `|(?:[▲▼]\\s*)?(${TREND})\\s+(?:of|by)\\s+\\*{0,2}(?:[▲▼]\\s*)?(${MEAS_NUM})\\*{0,2}` +
    // G5: [arrow] standalone signed percentage (possibly bold)
    `|\\*{0,2}(?:[▲▼]\\s*)?([+-]\\d[\\d,.]*%)\\*{0,2}` +
    // G6,G7 — natural prose `trend-word [arrow]? number` (no "of/by")
    `|(?:[▲▼]\\s*)?(${TREND})\\s+(?:[▲▼]\\s*)?(${MEAS_NUM})\\b` +
    // G8,G9 — Emoji + number (e.g. "🟢 17.51%" or "🔴 -5.35%")
    `|(🟢|🔴|🟡)\\s*(${MEAS_NUM})` +
    // G10 — flat-glyph + number (e.g. "▪ 0.13", "■ 0pp")
    `|${FLAT_GLYPH}\\s*(${MEAS_NUM})` +
    // G11,G12 — flat-word + number (e.g. "flat 0%", "unchanged 0pp")
    `|(${FLAT_WORD})\\s+(${MEAS_NUM})`,
    "gi"
);
