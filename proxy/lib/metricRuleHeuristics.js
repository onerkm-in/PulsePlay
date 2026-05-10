// @ts-check
'use strict';

/**
 * metricRuleHeuristics.js — Wave 41 PREP, IDEA-037 phase 4 extension.
 *
 * Pure-function heuristic engine that derives metric direction rules from
 * a list of bound measure names (and, when available, a sample value range
 * per measure). Used as the deterministic fallback layer when the LLM-driven
 * suggest path returns malformed / empty / unreachable. Guarantees the
 * "Suggest from data" button always returns SOMETHING actionable.
 *
 * Output shape mirrors the InsightsConfigSuggestion.suggestedMetricRules[]
 * entry on the visual side:
 *   {
 *     name:            string,
 *     higherIsBetter:  boolean,
 *     aliases:         string[],
 *     amberPct?:       number,    // 0..1
 *     redPct?:         number,    // 0..1
 *     confidence:      number,    // 0..1
 *     rationale:       string,
 *     source:          "measure-name" | "data-distribution" | "industry-pattern"
 *   }
 *
 * NEVER emit "space-instructions" or "section-h-cte" sources from this file —
 * those require LLM context and are reserved for the orchestrator's
 * higher-confidence path. Heuristic source labels are restricted to the
 * three deterministic ones above.
 *
 * Wave 22 invariant: every regex test runs against a sanitized lowercase
 * copy of the measure name (no control chars, no DML keywords). Inputs
 * are expected to have been sanitized by the caller — this module does
 * NOT re-sanitize so a regression in the upstream sanitizer is loud.
 */

// ── Lower-is-better keyword vocabulary ────────────────────────────────────────
// Keep regexes anchored to word boundaries. Order matters only for rationale
// quality (the first match wins for the "matched on …" string).
const LOWER_IS_BETTER_PATTERNS = [
    { re: /\b(return|returns)\b/i, label: 'returns' },
    { re: /\bcomplaint(s)?\b/i, label: 'complaints' },
    { re: /\bdefect(s)?\b/i, label: 'defects' },
    { re: /\bchurn\b/i, label: 'churn' },
    { re: /\berror(s)?\b/i, label: 'errors' },
    { re: /\bloss(es)?\b/i, label: 'losses' },
    { re: /\bcost(s)?\b/i, label: 'cost' },
    { re: /\bdelay(s)?\b/i, label: 'delays' },
    { re: /\bfailure(s)?\b/i, label: 'failures' },
    { re: /\bdowntime\b/i, label: 'downtime' },
    { re: /\bbacklog\b/i, label: 'backlog' },
    { re: /\bincident(s)?\b/i, label: 'incidents' },
];

// ── Higher-is-better keyword vocabulary ───────────────────────────────────────
const HIGHER_IS_BETTER_PATTERNS = [
    { re: /\brevenue\b/i, label: 'revenue' },
    { re: /\bprofit(s)?\b/i, label: 'profit' },
    { re: /\bgrowth\b/i, label: 'growth' },
    { re: /\bsales\b/i, label: 'sales' },
    { re: /\bconversion(s)?\b/i, label: 'conversion' },
    { re: /\bnps\b/i, label: 'NPS' },
    { re: /\bcsat\b/i, label: 'CSAT' },
    { re: /\bsatisfaction\b/i, label: 'satisfaction' },
    { re: /\b(margin|gross_margin|net_margin)\b/i, label: 'margin' },
    { re: /\b(retention|retained)\b/i, label: 'retention' },
    { re: /\b(uptime|availability)\b/i, label: 'uptime' },
    { re: /\b(throughput|capacity)\b/i, label: 'throughput' },
];

// Percent / rate detector. When matched we know this is a 0..1 (or 0..100)
// signal so the threshold defaults can be derived from a distribution snapshot
// rather than left blank.
const PERCENT_RE = /(%|\b(rate|ratio|pct|percent)\b)/i;

/**
 * Derive a rule for a single measure name.
 * Returns null when no heuristic fires (caller decides whether to keep the
 * measure unrated or escalate to the LLM).
 *
 * @param {string} rawName
 * @param {{ p25?: number, p75?: number } | null} [range]
 *   Optional value-range snapshot. When provided AND the measure is a
 *   percent/rate, p25 → red threshold and p75 → amber threshold (assuming
 *   higher-is-better). Symmetric flip for lower-is-better.
 * @returns {object | null}
 */
function deriveRuleFromName(rawName, range) {
    if (!rawName || typeof rawName !== 'string') return null;
    const name = rawName.trim();
    if (!name) return null;

    // First match wins. Lower-is-better is checked first so "return rate"
    // resolves to lower-is-better (returns dominate the noun).
    let direction = null;
    let matchedLabel = '';
    for (const p of LOWER_IS_BETTER_PATTERNS) {
        if (p.re.test(name)) { direction = 'lower'; matchedLabel = p.label; break; }
    }
    if (!direction) {
        for (const p of HIGHER_IS_BETTER_PATTERNS) {
            if (p.re.test(name)) { direction = 'higher'; matchedLabel = p.label; break; }
        }
    }
    if (!direction) return null;

    const isPercent = PERCENT_RE.test(name);
    const higherIsBetter = direction === 'higher';

    /** @type {{ amberPct?: number, redPct?: number, source: string }} */
    const thresholds = { source: 'measure-name' };

    if (isPercent && range && Number.isFinite(range.p25) && Number.isFinite(range.p75)) {
        // Caller passes p25/p75 already in the same unit as the measure.
        // We clamp to [0..1] here (or [0..100] passes through unchanged
        // since amber/red are stored as fractions on the visual side —
        // caller normalises before persisting).
        const lo = Math.max(0, Math.min(1, Number(range.p25)));
        const hi = Math.max(0, Math.min(1, Number(range.p75)));
        if (higherIsBetter) {
            thresholds.amberPct = hi;
            thresholds.redPct = lo;
        } else {
            // Lower-is-better: amber = p25 (allowing low values), red = p75.
            thresholds.amberPct = lo;
            thresholds.redPct = hi;
        }
        thresholds.source = 'data-distribution';
    }

    const rationale = isPercent
        ? `Measure name matches "${matchedLabel}" with rate/% suffix; ${higherIsBetter ? 'higher' : 'lower'}-is-better default${thresholds.source === 'data-distribution' ? ' with data-distribution thresholds' : ''}.`
        : `Measure name matches "${matchedLabel}"; ${higherIsBetter ? 'higher' : 'lower'}-is-better convention.`;

    /** @type {{ name: string, higherIsBetter: boolean, aliases: string[], confidence: number, rationale: string, source: string, amberPct?: number, redPct?: number }} */
    const rule = {
        name,
        higherIsBetter,
        aliases: [],
        confidence: 0.7,
        rationale,
        source: thresholds.source,
    };
    if (Number.isFinite(thresholds.amberPct)) rule.amberPct = Number(thresholds.amberPct);
    if (Number.isFinite(thresholds.redPct)) rule.redPct = Number(thresholds.redPct);
    return rule;
}

/**
 * Run the heuristic engine over a list of measure names. Returns a deduped
 * array of rule objects in the same order as the input names. Measures that
 * don't match any pattern are dropped (the LLM path handles ambiguous cases
 * and the visual surfaces "no suggestion" gracefully).
 *
 * @param {string[]} measureNames
 * @param {{ ranges?: Record<string, { p25?: number, p75?: number }> } | null} [opts]
 * @returns {object[]}
 */
function suggestRules(measureNames, opts) {
    if (!Array.isArray(measureNames)) return [];
    const ranges = (opts && opts.ranges) || {};
    /** @type {object[]} */
    const out = [];
    const seen = new Set();
    for (const raw of measureNames) {
        if (typeof raw !== 'string') continue;
        const name = raw.trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        const range = ranges[name] || null;
        const rule = deriveRuleFromName(name, range);
        if (rule) out.push(rule);
    }
    return out;
}

/**
 * Industry-pattern fallback. When the heuristic engine produces fewer than
 * `min` rules (e.g. all bound measures are opaque codes), emit a tiny set of
 * generic templates so the suggest button still surfaces SOMETHING. Source
 * is always "industry-pattern" with low confidence (0.4) so the UI can
 * render them as "consider these patterns" rather than "we recommend".
 *
 * @param {number} count
 * @returns {object[]}
 */
function industryPatternFallback(count) {
    if (!Number.isFinite(count) || count <= 0) return [];
    const templates = [
        {
            name: 'Revenue',
            higherIsBetter: true,
            aliases: ['sales', 'gross_revenue', 'total_revenue'],
            confidence: 0.4,
            rationale: 'Industry default: revenue-style metrics are higher-is-better.',
            source: 'industry-pattern',
        },
        {
            name: 'Cost',
            higherIsBetter: false,
            aliases: ['expense', 'cogs', 'spend'],
            confidence: 0.4,
            rationale: 'Industry default: cost-style metrics are lower-is-better.',
            source: 'industry-pattern',
        },
        {
            name: 'Conversion Rate',
            higherIsBetter: true,
            aliases: ['conversion_pct', 'conv_rate'],
            confidence: 0.4,
            rationale: 'Industry default: funnel conversion is higher-is-better.',
            source: 'industry-pattern',
        },
    ];
    return templates.slice(0, Math.min(count, templates.length));
}

module.exports = {
    suggestRules,
    deriveRuleFromName,
    industryPatternFallback,
    // Internals exported for unit tests so a regex regression is easy to localise.
    __internals: {
        LOWER_IS_BETTER_PATTERNS,
        HIGHER_IS_BETTER_PATTERNS,
        PERCENT_RE,
    },
};
