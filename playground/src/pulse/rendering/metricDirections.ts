import { getSemanticTone, getStatusTone, getTrendDirectionFromDelta, Tone, TrendDirection } from "./insightsTone";

export interface MetricDirectionRule {
    name: string;
    higherIsBetter: boolean;
    aliases?: string[];
    redPct?: number;
    amberPct?: number;
    /**
     * Tone for unfavorable-direction movement when no threshold band fires.
     * Default omitted = "bad" (red, current behavior). Authors set this to
     * "warn" (amber) for metrics where any nudge in the wrong direction
     * should read as "watch" rather than "critical" — e.g. Return Rate,
     * NPS-style metrics, retention rates. Wired from
     * `MetricRule.unfavorableMovementTone` in `metricRulesEngine.ts`.
     */
    unfavorableMovementTone?: "warn" | "bad";
}

export interface MetricToneResult {
    direction: TrendDirection;
    statusTone: Tone;
    semanticTone: Tone;
    deltaTone: Tone;
    matchedRule?: MetricDirectionRule;
}

function normaliseMetricName(value: string): string {
    return value
        .toLowerCase()
        .replace(/[%$€£₹¥]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function normaliseRule(rule: MetricDirectionRule): MetricDirectionRule | null {
    const name = (rule.name || "").trim();
    if (!name) return null;
    const unfavorableTone = rule.unfavorableMovementTone === "warn" ? "warn"
        : rule.unfavorableMovementTone === "bad" ? "bad"
        : undefined;
    return {
        name,
        higherIsBetter: rule.higherIsBetter !== false,
        aliases: Array.isArray(rule.aliases)
            ? rule.aliases.map(a => String(a).trim()).filter(Boolean)
            : undefined,
        redPct: typeof rule.redPct === "number" && Number.isFinite(rule.redPct) ? rule.redPct : undefined,
        amberPct: typeof rule.amberPct === "number" && Number.isFinite(rule.amberPct) ? rule.amberPct : undefined,
        ...(unfavorableTone ? { unfavorableMovementTone: unfavorableTone } : {})
    };
}

export function parseMetricDirectionsJson(raw?: string): MetricDirectionRule[] {
    const text = (raw || "").trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(item => normaliseRule({
                name: String(item?.name ?? ""),
                higherIsBetter: item?.higherIsBetter !== false && item?.direction !== "lowerIsBetter",
                aliases: Array.isArray(item?.aliases) ? item.aliases : undefined,
                redPct: typeof item?.redPct === "number" ? item.redPct : undefined,
                amberPct: typeof item?.amberPct === "number" ? item.amberPct : undefined,
                unfavorableMovementTone: item?.unfavorableMovementTone === "warn" ? "warn"
                    : item?.unfavorableMovementTone === "bad" ? "bad"
                    : undefined
            }))
            .filter((item): item is MetricDirectionRule => Boolean(item));
    } catch {
        return [];
    }
}

export function migrateLegacyMetricDirectionRules(raw?: string): MetricDirectionRule[] {
    const text = (raw || "").trim();
    if (!text) return [];

    const rules: MetricDirectionRule[] = [];
    const seen = new Set<string>();
    // Original pattern was missing `\s+` between the optional `is/are` connective
    // and `better`/`best`, so phrases like "higher is better" failed to match.
    const regex = /([^.:;]+?)\s+(higher|lower)\s+(?:(?:is|are|usually)\s+)*(?:better|best)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const rawName = match[1].replace(/^[\s,]+|[\s,]+$/g, "");
        const parts = rawName.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
        const name = parts[0];
        if (!name) continue;
        const key = normaliseMetricName(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        rules.push({
            name,
            aliases: parts.length > 1 ? parts.slice(1) : undefined,
            higherIsBetter: match[2].toLowerCase() === "higher"
        });
    }
    return rules;
}

export function composeMetricDirectionsJsonFromLegacy(raw?: string): string {
    const migrated = migrateLegacyMetricDirectionRules(raw);
    return migrated.length ? JSON.stringify(migrated, null, 2) : "";
}

/**
 * Built-in lower-is-better defaults for metrics whose names strongly
 * signal that up = bad. These only fire when no author rule matches.
 * All carry unfavorableMovementTone "warn" (amber) rather than "bad"
 * (red) — a nudge in the wrong direction is watch-worthy by default;
 * authors who want red can define an explicit rule with thresholds.
 */
export const BUILTIN_LOWER_IS_BETTER_RULES: readonly MetricDirectionRule[] = Object.freeze([
    { name: "Return Rate",       higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Return %", "Returns Rate", "Returns"] },
    { name: "Churn Rate",        higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Churn", "Customer Churn", "Churn %"] },
    { name: "Defect Rate",       higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Defect %", "Defects"] },
    { name: "Error Rate",        higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Error %", "Errors"] },
    { name: "Complaint Rate",    higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Complaints", "Complaint %"] },
    { name: "Cancellation Rate", higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Cancellations", "Cancellation %"] },
    { name: "Refund Rate",       higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Refunds", "Refund %"] },
    { name: "Bounce Rate",       higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Bounce %"] },
    { name: "Cost Per",          higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["CPA", "CPC", "CPL", "CPM"] },
    { name: "Shrinkage",         higherIsBetter: false, unfavorableMovementTone: "warn", aliases: ["Shrink Rate", "Shrinkage %"] },
]);

function matchesRule(metric: string, rule: MetricDirectionRule): boolean {
    const names = [rule.name, ...(rule.aliases || [])].map(normaliseMetricName).filter(Boolean);
    return names.some(name => metric === name || metric.includes(name) || name.includes(metric));
}

export function resolveMetricDirection(
    metricName: string,
    structuredJson?: string,
    legacyText?: string
): MetricDirectionRule | undefined {
    const metric = normaliseMetricName(metricName);
    if (!metric) return undefined;
    const authorRules = [
        ...parseMetricDirectionsJson(structuredJson),
        ...migrateLegacyMetricDirectionRules(legacyText)
    ];
    const authorMatch = authorRules.find(rule => matchesRule(metric, rule));
    if (authorMatch) return authorMatch;
    // Fall back to built-in heuristics only when the author has not defined
    // an explicit rule. Author rules always win — builtins are soft defaults.
    return BUILTIN_LOWER_IS_BETTER_RULES.find(rule => matchesRule(metric, rule));
}

/**
 * Apply a rule's threshold bands to a numeric value and return the
 * matching tone (good / warn / bad), or null if the rule has no
 * thresholds defined. Exported so the chat markdown renderer can paint
 * tones on cell values without re-implementing the band logic.
 */
export function thresholdTone(value: number, rule: MetricDirectionRule): Tone | null {
    if (typeof rule.redPct !== "number" || typeof rule.amberPct !== "number") return null;
    if (rule.higherIsBetter) {
        if (value < rule.redPct) return "bad";
        if (value < rule.amberPct) return "warn";
        return "good";
    }
    if (value > rule.redPct) return "bad";
    if (value > rule.amberPct) return "warn";
    return "good";
}

/**
 * Extract the first numeric run from a cell value, ignoring currency
 * symbols and thousands separators. Returns null when no number is
 * present (e.g. "N/A", "" — chat tone painter skips those cells).
 * Exported so callers outside the metric-tone engine can reuse the
 * same parsing rules.
 */
export function parsePercentValue(raw: string): number | null {
    const match = raw.replace(/,/g, "").match(/[+-]?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function directionTone(direction: TrendDirection, rule?: MetricDirectionRule): Tone {
    // Unfavorable-direction tone defaults to "bad" (red). Authors can opt
    // into "warn" (amber) via MetricRule.unfavorableMovementTone for metrics
    // they want to track as "watch" rather than "critical" on any nudge in
    // the wrong direction. Threshold bands still take precedence in
    // getMetricTone — this only fires when no band hit.
    const unfavorable: Tone = rule?.unfavorableMovementTone === "warn" ? "warn" : "bad";
    if (direction === "up") return rule?.higherIsBetter === false ? unfavorable : "good";
    if (direction === "down") return rule?.higherIsBetter === false ? "good" : unfavorable;
    return "neutral";
}

export function getMetricTone(args: {
    metricName: string;
    deltaText?: string;
    valueText?: string;
    statusText?: string;
    structuredJson?: string;
    legacyText?: string;
}): MetricToneResult {
    const direction = getTrendDirectionFromDelta(args.deltaText || "");
    const statusTone = getStatusTone(args.statusText || "");
    const matchedRule = resolveMetricDirection(args.metricName, args.structuredJson, args.legacyText);
    const deltaTone = directionTone(direction, matchedRule);

    if (statusTone !== "neutral") {
        return { direction, statusTone, semanticTone: statusTone, deltaTone, matchedRule };
    }

    if (matchedRule) {
        const value = parsePercentValue(args.valueText || "");
        const toneFromThreshold = value === null ? null : thresholdTone(value, matchedRule);
        if (toneFromThreshold) {
            return { direction, statusTone, semanticTone: toneFromThreshold, deltaTone, matchedRule };
        }
        // No threshold band hit — fall back to direction tone, which honors
        // matchedRule.unfavorableMovementTone (so authors can opt unfavorable
        // direction into "warn" instead of the default "bad").
        if (direction === "up" || direction === "down") {
            return { direction, statusTone, semanticTone: deltaTone, deltaTone, matchedRule };
        }
    }

    return { direction, statusTone, semanticTone: getSemanticTone(direction, statusTone), deltaTone, matchedRule };
}
