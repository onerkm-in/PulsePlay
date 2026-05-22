// playground/src/visualization/chartRationale.ts
//
// Translates a chart auto-pick decision into a human-readable rationale
// sourced from the project's Knowledge Base (CHART_RULES). Pure module:
// no DOM, no React, no network. Backs the "i" info-button tooltip beside
// rendered charts in the playground + workbench, sourced from KB and not
// LLM-generated (zero token cost; ~1ms lookup).
//
// Wire shape: caller passes `chartAutoPick(...)` output → this returns a
// `ChartRationale` envelope; UI component renders `{why, avoid, alternatives}`.

import { CHART_RULES, type ChartRule } from "../pulse/knowledgeBase";
import type { ChartKind, DataShape } from "./chartAutoPick";

export type ChartRationaleReason =
    | "multiple-numeric-series"
    | "many-rows-trend"
    | "small-positive-category-share"
    | "numeric-summary"
    | "unknown";

export interface ChartAlternative {
    /** Chart family the alternative rule recommends (raw KB string). */
    readonly recommended: string;
    /** When this alternative would be preferred over the auto-pick. */
    readonly when: string;
}

export interface ChartRationale {
    /** The chart type that was actually picked. Forwarded for UI labelling. */
    readonly chartType: ChartKind;
    /** KB relationship key resolved from `reason` + shape. */
    readonly relationship: string;
    /** Plain-English summary: "Picked X because [conditions]". */
    readonly why: string;
    /** What to avoid for this data shape (KB rule's `avoid` field). */
    readonly avoid: string;
    /** Up to 3 sibling alternatives within the same family ("you could also use"). */
    readonly alternatives: ReadonlyArray<ChartAlternative>;
    /** True when no KB rule matched and we returned a generic fallback. */
    readonly fellBack: boolean;
}

/**
 * Maps the auto-pick `reason` plus `DataShape` to the most specific
 * KB relationship key. The mapping is intentionally conservative —
 * narrower keys (e.g. `comparison-categorical-many` over the broader
 * `comparison-categorical`) win when shape thresholds match.
 */
export function resolveRelationship(reason: string, shape: DataShape): string {
    switch (reason) {
        case "multiple-numeric-series":
            // 2+ numeric columns implies side-by-side comparison.
            return shape.rowCount <= 7
                ? "comparison-categorical"
                : "comparison-categorical-many";
        case "many-rows-trend":
            // 6+ rows with a single numeric column is a continuous trend.
            return "comparison-time-trend";
        case "small-positive-category-share":
            // 3–6 positive rows → parts-of-whole when share is small.
            return "composition-static";
        case "numeric-summary":
            // 1 numeric column, few rows → KPI / single-metric story.
            return "kpi-single";
        default:
            return "comparison-categorical";
    }
}

const FAMILY_FROM_RELATIONSHIP_RE = /^([a-z]+)(?:-|$)/;

function familyOf(relationship: string): string {
    const m = FAMILY_FROM_RELATIONSHIP_RE.exec(relationship);
    return m ? m[1] : "comparison";
}

function pickAlternatives(picked: ChartRule, all: ReadonlyArray<ChartRule>): ReadonlyArray<ChartAlternative> {
    const family = familyOf(picked.relationship);
    const arr = all
        .filter(rule =>
            rule.relationship !== picked.relationship
            && familyOf(rule.relationship) === family,
        )
        .slice(0, 3)
        .map(rule => Object.freeze({ recommended: rule.recommended, when: rule.conditions }));
    return Object.freeze(arr);
}

/**
 * Build a chart rationale envelope for a given auto-pick result.
 * Never throws — always returns a renderable shape, even when the KB
 * has no matching rule (`fellBack: true`).
 */
export function buildChartRationale(
    reason: string,
    chartType: ChartKind,
    shape: DataShape,
    rules: ReadonlyArray<ChartRule> = CHART_RULES,
): ChartRationale {
    const relationship = resolveRelationship(reason, shape);
    const rule = rules.find(r => r.relationship === relationship);
    if (!rule) {
        return Object.freeze({
            chartType,
            relationship: "unknown",
            why: `Picked ${chartType} as a sensible default; the knowledge base has no specific rule for this data shape (${reason}, ${shape.rowCount} rows, ${shape.numericColCount} numeric columns).`,
            avoid: "n/a",
            alternatives: Object.freeze([]),
            fellBack: true,
        });
    }
    return Object.freeze({
        chartType,
        relationship,
        why: `Picked ${rule.recommended} because: ${rule.conditions}.`,
        avoid: rule.avoid,
        alternatives: pickAlternatives(rule, rules),
        fellBack: false,
    });
}
