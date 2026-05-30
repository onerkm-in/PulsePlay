// playground/src/visualization/chartRationale.ts
//
// Translates a chart auto-pick decision into a data-shape-aware rationale
// the user can read in the "Why this chart?" popover. Pure module: no DOM,
// no React, no network, no LLM tokens.
//
// 2026-05-22 — upgrade per consolidated research (Explore agent + web +
// Figma component patterns). Adds personalised narratives that reference
// THIS dataset's row count + numeric column count (rather than abstract
// rules), plus structured warnings for mixed-units, mixed-signs, too-many
// rows, etc. with concrete view-switch suggestions. Replaces the earlier
// generic "Picked X because: [conditions]" template.
//
// Backed by:
//   - `chartAutoPick.ts`     — data shape + column-range + unit detection
//   - `pulse/knowledgeBase.ts` — CHART_RULES (fallback for the "Avoid" string)

import { CHART_RULES, type ChartRule } from "../pulse/knowledgeBase";
import {
    UNIT_LABELS,
    analyzeColumnRanges,
    detectColumnUnit,
    type ChartKind,
    type ColumnRange,
    type DataShape,
    type UnitType,
} from "./chartAutoPick";

export type ChartRationaleReason =
    | "multiple-numeric-series"
    | "many-rows-trend"
    | "small-positive-category-share"
    | "single-numeric-series"
    | "numeric-summary"
    | "no-numeric-series"
    | "unknown";

export interface ChartAlternative {
    /** Chart family the alternative rule recommends (raw KB string). */
    readonly recommended: string;
    /** When this alternative would be preferred over the auto-pick. */
    readonly when: string;
}

export type WarningSeverity = "info" | "caution" | "warning";

export interface ChartWarning {
    readonly severity: WarningSeverity;
    /** Short bold title, e.g. "Mixed units detected". */
    readonly title: string;
    /** One-sentence plain-English explanation. */
    readonly explanation: string;
    /** Optional concrete view-switch suggestion (e.g. "Matrix view" / "Table"). */
    readonly suggestedView?: string;
}

export interface ChartRationale {
    /** The chart kind the AUTO-pick chose (not the user's override). */
    readonly chartType: ChartKind;
    /** KB relationship key resolved from `reason` + shape. */
    readonly relationship: string;
    /** Plain-English summary keyed to THIS dataset's shape. */
    readonly why: string;
    /** What to avoid for this data shape (KB rule's `avoid` field). */
    readonly avoid: string;
    /** Up to 3 sibling alternatives within the same family. */
    readonly alternatives: ReadonlyArray<ChartAlternative>;
    /** Structured warnings (mixed units, mixed signs, too-many-rows, ...). */
    readonly warnings: ReadonlyArray<ChartWarning>;
    /** True when no KB rule matched and we returned a generic fallback. */
    readonly fellBack: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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
 * Maps the auto-pick `reason` plus `DataShape` to the most specific
 * KB relationship key. Narrower keys win when shape thresholds match.
 */
export function resolveRelationship(reason: string, shape: DataShape): string {
    switch (reason) {
        case "multiple-numeric-series":
            return shape.rowCount <= 7
                ? "comparison-categorical"
                : "comparison-categorical-many";
        case "many-rows-trend":
            return "comparison-time-trend";
        case "small-positive-category-share":
            return "composition-static";
        case "single-numeric-series":
        case "numeric-summary":
            return "kpi-single";
        case "no-numeric-series":
            return "kpi-single";
        default:
            return "comparison-categorical";
    }
}

/**
 * Detect distinct unit types across the dataset's numeric columns. Returns
 * the set of unit labels present (e.g. ["dollars", "percentages"]). Used
 * for the mixed-units warning.
 */
export function summariseUnits(ranges: ReadonlyArray<ColumnRange>): {
    readonly labels: ReadonlyArray<string>;
    readonly isMixed: boolean;
} {
    const distinct = new Set<UnitType>();
    for (const r of ranges) {
        if (r.inferredUnit !== "generic") distinct.add(r.inferredUnit);
    }
    const labels = Array.from(distinct, u => UNIT_LABELS[u]);
    return Object.freeze({
        labels: Object.freeze(labels),
        isMixed: distinct.size >= 2,
    });
}

/**
 * Build the personalised "Your data has X rows and Y numeric columns..."
 * narrative that leads the popover. Matches the OLD reference's voice.
 */
export function buildDataShapeNarrative(
    chartType: ChartKind,
    shape: DataShape,
): string {
    const { rowCount, numericColCount } = shape;
    if (rowCount === 0 || numericColCount === 0) {
        return "No numeric data to visualise. Add at least one numeric column to see a chart.";
    }
    const rowLabel = `${rowCount} row${rowCount === 1 ? "" : "s"}`;
    const colLabel = `${numericColCount} numeric column${numericColCount === 1 ? "" : "s"}`;
    const head = `Your data has ${rowLabel} and ${colLabel}`;
    // Pick the benefit-clause to suffix.
    const benefit = (() => {
        if (numericColCount >= 3 && rowCount <= 12) return "so we picked a view that lets you compare all the metrics side by side.";
        if (numericColCount >= 2 && rowCount > 12) return "so we picked a view that highlights the top entries efficiently.";
        if (numericColCount === 1 && rowCount >= 6) return `so we picked a ${friendlyChartName(chartType)} to show the trend.`;
        if (numericColCount === 1 && rowCount >= 3 && rowCount <= 6) return `so we picked a ${friendlyChartName(chartType)} to show parts of the whole.`;
        if (numericColCount === 1 && rowCount <= 2) return `so a KPI card or single metric tile would read more clearly than a chart.`;
        return `so we picked a ${friendlyChartName(chartType)}.`;
    })();
    return `${head}, ${benefit}`;
}

function friendlyChartName(kind: ChartKind): string {
    switch (kind) {
        case "clustered-bar": return "clustered bar chart";
        case "bar": return "bar chart";
        case "column": return "column chart";
        case "line": return "line chart";
        case "area": return "area chart";
        case "pie": return "pie chart";
        case "donut": return "donut chart";
        case "scatter": return "scatter plot";
        case "bubble": return "bubble chart";
        case "heatmap": return "heatmap";
        case "treemap": return "treemap";
        case "funnel": return "funnel chart";
        case "waterfall": return "waterfall chart";
        case "kpi": return "KPI tile";
        case "gauge": return "gauge";
        case "radar": return "radar chart";
        case "sunburst": return "sunburst";
        case "sparkline": return "sparkline";
        case "pareto": return "Pareto chart";
        case "sankey": return "Sankey flow";
        case "lollipop": return "lollipop chart";
        default: return String(kind);
    }
}

/**
 * Suggest a concrete alternative VIEW (not just an alternative chart) for
 * the current dataset shape. Returns a string like "Matrix view" or "Table"
 * or null when the current chart is appropriate.
 */
export function suggestAlternativeViews(
    shape: DataShape,
    ranges: ReadonlyArray<ColumnRange>,
    mixedUnits: boolean,
): string | null {
    const { rowCount, numericColCount } = shape;
    if (mixedUnits && numericColCount >= 2) return "Matrix or Table view";
    if (rowCount > 20 && numericColCount >= 2) return "Table with sorting";
    if (rowCount <= 5 && numericColCount >= 3) return "Matrix view";
    if (rowCount <= 2 && numericColCount === 1) return "KPI tile";
    if (ranges.some(r => r.hasMixedSign) && numericColCount >= 2) return "Matrix view";
    return null;
}

/**
 * Generate the structured warnings array for the dataset. Each warning has a
 * severity, title, plain-English explanation, and (optionally) a concrete
 * view-switch suggestion. The eight scenarios are:
 *
 *   1. No-data           — empty result set
 *   2. Mixed units       — numeric columns span 2+ unit types
 *   3. Mixed signs       — any column crosses zero (min < 0 < max)
 *   4. Too-many rows     — rowCount > 20 in a chart context
 *   5. Too-few rows      — rowCount <= 2 in a chart context
 *   6. Composition w/ negatives — donut/pie picked but data has negatives
 *   7. Time-trend short  — line picked but < 6 points (visually weak)
 *   8. Generic — no warnings (clean case)
 */
export function generateWarnings(
    chartType: ChartKind,
    shape: DataShape,
    ranges: ReadonlyArray<ColumnRange>,
): ReadonlyArray<ChartWarning> {
    const warnings: ChartWarning[] = [];
    const { rowCount, numericColCount } = shape;
    const units = summariseUnits(ranges);
    const mixedSignCols = ranges.filter(r => r.hasMixedSign);

    // 1. No-data
    if (rowCount === 0 || numericColCount === 0) {
        warnings.push(Object.freeze({
            severity: "warning",
            title: "No numeric data",
            explanation: "There are no numeric values to chart yet. Add at least one numeric column to render a meaningful visual.",
            suggestedView: "Table",
        }));
        return Object.freeze(warnings);
    }

    // 2. Mixed units — primary warning per OLD reference
    if (units.isMixed && numericColCount >= 2) {
        const unitList = units.labels.join(", ");
        const suggestion = suggestAlternativeViews(shape, ranges, true) ?? "Matrix or Table view";
        warnings.push(Object.freeze({
            severity: "warning",
            title: "Mixed units detected",
            explanation: `These metrics use different units (${unitList}). Plotting them on one axis can imply false correlations because the scales aren't comparable.`,
            suggestedView: suggestion,
        }));
    }

    // 3. Mixed signs
    if (mixedSignCols.length > 0 && numericColCount >= 1) {
        const colNames = mixedSignCols.slice(0, 2).map(r => r.colName).join(", ");
        warnings.push(Object.freeze({
            severity: "caution",
            title: "Positive + negative values",
            explanation: `${colNames}${mixedSignCols.length > 2 ? " and others" : ""} cross zero. Single-axis charts can be harder to read without dual-colour encoding.`,
            suggestedView: numericColCount >= 2 ? "Matrix view" : undefined,
        }));
    }

    // 4. Too-many rows
    if (rowCount > 20 && (chartType === "bar" || chartType === "column" || chartType === "clustered-bar")) {
        warnings.push(Object.freeze({
            severity: "caution",
            title: "Many categories",
            explanation: `With ${rowCount} categories, a bar chart's labels become hard to scan. A sorted Top-N view or a filterable Table reads more cleanly.`,
            suggestedView: "Table with sorting",
        }));
    }

    // 5. Too-few rows for a chart that benefits from more
    if (rowCount <= 2 && numericColCount >= 1 && chartType !== "kpi") {
        warnings.push(Object.freeze({
            severity: "info",
            title: "Very few data points",
            explanation: `Only ${rowCount} ${rowCount === 1 ? "row" : "rows"} of data — a chart can't reveal patterns. A KPI tile shows the value more clearly.`,
            suggestedView: "KPI tile",
        }));
    }

    // 6. Composition (donut/pie) with negative values
    if ((chartType === "donut" || chartType === "pie") && mixedSignCols.length > 0) {
        warnings.push(Object.freeze({
            severity: "warning",
            title: "Donut/pie can't show negative parts",
            explanation: "Pie and donut charts represent parts of a whole — they don't handle negative values gracefully. A bar chart with a zero baseline shows direction clearly.",
            suggestedView: "Bar chart",
        }));
    }

    // 7. Short time-trend
    if (chartType === "line" && rowCount < 6 && numericColCount === 1) {
        warnings.push(Object.freeze({
            severity: "info",
            title: "Short series for a trend",
            explanation: `A line chart works best with 6+ points to show a clear trend. With only ${rowCount}, a bar or column chart may communicate the same data more honestly.`,
            suggestedView: "Bar chart",
        }));
    }

    return Object.freeze(warnings);
}

/**
 * Build a chart rationale envelope for a given auto-pick result + the source
 * dataset. The envelope's `chartType` reports the AUTO-PICK (not any user
 * override) so the popover always speaks about the data-driven recommendation.
 * Never throws — always returns a renderable shape, even when the KB has no
 * matching rule (`fellBack: true`).
 */
export function buildChartRationale(
    reason: string,
    autoPickChartType: ChartKind,
    shape: DataShape,
    columns: ReadonlyArray<string> = [],
    rows: ReadonlyArray<ReadonlyArray<unknown>> = [],
    rules: ReadonlyArray<ChartRule> = CHART_RULES,
): ChartRationale {
    const relationship = resolveRelationship(reason, shape);
    const rule = rules.find(r => r.relationship === relationship);
    const ranges = analyzeColumnRanges(columns, rows);
    const why = buildDataShapeNarrative(autoPickChartType, shape);
    const warnings = generateWarnings(autoPickChartType, shape, ranges);

    if (!rule) {
        return Object.freeze({
            chartType: autoPickChartType,
            relationship: "unknown",
            why,
            avoid: "n/a",
            alternatives: Object.freeze([]),
            warnings,
            fellBack: true,
        });
    }
    return Object.freeze({
        chartType: autoPickChartType,
        relationship,
        why,
        avoid: rule.avoid,
        alternatives: pickAlternatives(rule, rules),
        warnings,
        fellBack: false,
    });
}

/**
 * @internal exported for unit tests only — re-exports the helper so test
 * authors can simulate column-name detection without spinning up the full
 * `analyzeColumnRanges` data pipeline.
 */
export const __internal__ = Object.freeze({
    detectColumnUnit,
    summariseUnits,
});
