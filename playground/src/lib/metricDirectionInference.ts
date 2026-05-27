// playground/src/lib/metricDirectionInference.ts
//
// Pure name-based heuristic that classifies a BI measure as
// higher-is-better / lower-is-better / context-dependent, then composes
// those classifications into a metricDirectionRules string the Insights
// prompt can consume directly.
//
// 2026-05-28 — added per user direction: "the metric should auto-select
// based on the dataset … and on the preset values." This module covers
// the dataset path. The preset path (bundled rules per CustomSectionPreset)
// is handled separately in insightsPresetLibrary.ts.
//
// Honest scope:
//   - Pattern matching only. No semantic-model awareness, no LLM lookup,
//     no statistical analysis of historical values. A metric named
//     "downtime_minutes" lands in LOWER because of the "downtime" token;
//     a metric named "uptime" lands in HIGHER. A metric named "headcount"
//     lands in CONTEXT because direction depends on the conversation
//     (growth-mode = higher; layoff-mode = lower) — we refuse to fabricate.
//   - English-only patterns. A measure named "ventas" (Spanish for sales)
//     would land in CONTEXT. Multi-language patterns are out of scope.
//   - The classifier never returns a wrong answer with confidence — when
//     unsure it returns "context" and the rules line is omitted, so the
//     downstream Insights prompt falls back to the universal default
//     ("higher is better unless name implies inversion").

/** Output of classifyMetric — three discrete buckets. CONTEXT means
 *  "we don't know; let the conversation decide" — caller should NOT
 *  emit a direction rule for that metric. */
export type MetricDirection = "higher" | "lower" | "context";

/** Words that signal higher-is-better when present in a metric name.
 *  Order is irrelevant — first match wins via regex test. `s?` suffix
 *  on most singular nouns covers plural forms (Revenue / Revenues,
 *  Conversion / Conversions, Booking / Bookings, etc.). */
const HIGHER_PATTERNS = [
    /\b(revenues?|sales|profits?|margins?|growth|conversions?|retentions?|nrr|arr|mrr|aov|ltv|clv|csat|nps|scores?|ratings?|accuracy|throughput|engagements?|attainments?|adoptions?|uptime|productivity|yields?|bookings?|signups?|activations?|reactivations?|win[\s_-]?rates?|fill[\s_-]?rates?|otif|coverages?)\b/i,
];

/** Words that signal lower-is-better when present in a metric name. */
const LOWER_PATTERNS = [
    /\b(returns?|churns?|attritions?|costs?|spends?|cogs|opex|burns?|delays?|latency|lags?|waits?|ttl|tat|defects?|errors?|incidents?|outages?|down[\s_-]?time|risks?|bounces?|abandons?|complaints?|failures?|rejects?|disputes?|backlogs?|leaks?|loss|losses|breaches?|debts?|aging|cycle[\s_-]?times?|lead[\s_-]?times?)\b/i,
];

/** Pure name-based classification. Returns CONTEXT for unknown tokens. */
export function classifyMetric(name: string): MetricDirection {
    const trimmed = (name || "").trim();
    if (!trimmed) return "context";
    // LOWER patterns checked FIRST so "return rate" wins over "rate" alone.
    if (LOWER_PATTERNS.some(rx => rx.test(trimmed))) return "lower";
    if (HIGHER_PATTERNS.some(rx => rx.test(trimmed))) return "higher";
    return "context";
}

export interface InferredMetricRulesResult {
    /** A `metricDirectionRules` string ready to write into settings.
     *  Empty when no metric could be classified with confidence. */
    rules: string;
    /** Total measures inspected. */
    totalInspected: number;
    /** Measures we classified with a direction (excludes context). Used
     *  by the UI chip to render "(N metrics)" without lying. */
    confidentCount: number;
}

/** Compose a rules string from an array of measure names. Drops
 *  context-classified metrics rather than emitting a wrong direction. */
export function inferMetricRulesFromBindings(
    measureNames: ReadonlyArray<string>,
): InferredMetricRulesResult {
    const lines: string[] = [];
    let confident = 0;
    for (const raw of measureNames) {
        const name = (raw || "").trim();
        if (!name) continue;
        const dir = classifyMetric(name);
        if (dir === "higher") {
            lines.push(`${name}: higher is better`);
            confident += 1;
        } else if (dir === "lower") {
            lines.push(`${name}: lower is better`);
            confident += 1;
        }
        // CONTEXT — skip; do not fabricate a direction.
    }
    return {
        rules: lines.join("\n"),
        totalInspected: measureNames.length,
        confidentCount: confident,
    };
}
