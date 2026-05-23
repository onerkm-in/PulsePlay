// playground/src/visualization/chartIR.ts
//
// UX-VIEWER-1.7b.1 — ChartIR: a curated subset of the Vega-Lite v5 spec
// that PulsePlay's chart renderer commits to supporting end-to-end.
//
// Why Vega-Lite as the IR shape:
//   - Industry-standard interchange format for AI-generated chart specs
//     in 2026. Snowflake Cortex Agents emit Vega-Lite over SSE; Looker
//     Conversational Analytics API emits Vega specs; Streamlit, Observable,
//     Hex, Mode, Lightdash, Apache Superset all consume Vega-Lite as
//     first-class. Even Databricks themselves promote Vega-Lite for
//     multi-agent chart spec ("Bringing Visualizations to Life in
//     Multi-Agent Systems With Vega-Lite", 2026).
//   - Self-documenting: anyone who knows Vega-Lite knows our IR.
//   - Existing tooling (validators, debuggers, examples) works on our IR
//     for free.
//   - playground/src/lib/vegaLiteToECharts.ts already does Vega-Lite →
//     ECharts; it becomes the final-stage renderer.
//
// Why CURATED subset, not full Vega-Lite:
//   - Vega-Lite supports facets, layers, repeats, transforms, signals,
//     selections — far more than PulsePlay's ECharts renderer can paint.
//   - The IR exposes only the marks + encodings PulsePlay's renderer
//     actually supports. Translators that produce more must downgrade to
//     a renderable subset or fall through to the heuristic.
//
// Translator registry (see ./translators/registry.ts):
//   Any vendor-specific chart spec (Databricks HELIOS renderSpec, raw
//   Vega-Lite from Snowflake Cortex Agents / Looker CA, ThoughtSpot
//   Spotter type-only hint, future formats) is translated into ChartIR
//   via a registered translator. The registry walks translators in order;
//   the first one whose `detect` returns true wins. Callers can override
//   with an explicit translator name for tests / debugging.
//
// Strategic context: PulsePlay is the enabler — any chart spec from any
// source is acceptable. Today: HELIOS + Vega-Lite + the existing
// heuristic fallback. Tomorrow: drop in a new translator file, register
// it, no churn elsewhere.

import type { ChartKind } from "./chartAutoPick";
import { chartAutoPick } from "./chartAutoPick";

/**
 * The marks PulsePlay's ChartIR exposes. A strict subset of Vega-Lite's
 * mark enum + a few legacy aliases used by ECharts (donut as pie variant,
 * column = vertical bar).
 */
export type ChartIRMark =
    | "bar"
    | "column"
    | "line"
    | "area"
    | "point"
    | "pie"
    | "donut"
    | "heatmap"
    | "text"
    | "table"
    | "kpi";

/**
 * Scale type values that map cleanly to ECharts axis types.
 * `categorical` → ECharts `category`; `quantitative` → `value`;
 * `temporal` → `time`.
 */
export type ChartIRScaleType = "categorical" | "quantitative" | "temporal" | "ordinal";

/**
 * One encoding channel — what field maps to which visual property and
 * how its values should be interpreted. Mirrors Vega-Lite's `encoding`
 * channel shape but lower-case-only and with our channel names.
 */
export interface ChartIREncoding {
    /** Column name from the source data table. */
    field: string;
    /** Display title for the axis / legend; falls back to `field` when absent. */
    title?: string;
    /** How values should be interpreted on this channel. */
    scaleType?: ChartIRScaleType;
    /** Optional format string for axis labels / tooltips (e.g., "$,.2f"). */
    format?: string;
}

/**
 * The encoding channels PulsePlay's renderer understands. A subset of
 * Vega-Lite's encoding channel set. Anything beyond this (faceting,
 * shape, opacity, stroke, …) is currently ignored by the renderer; a
 * translator that needs those should either include them for future
 * use or downgrade to a supported shape.
 */
export interface ChartIREncodings {
    x?: ChartIREncoding;
    y?: ChartIREncoding;
    color?: ChartIREncoding;
    size?: ChartIREncoding;
    label?: ChartIREncoding;
}

/**
 * Title / subtitle / description framing shown around the chart.
 * Mirrors Vega-Lite `title` / Genie HELIOS `frame`.
 */
export interface ChartIRFrame {
    title?: string;
    showTitle?: boolean;
    description?: string;
    showDescription?: boolean;
}

/**
 * The data table the chart binds against. Kept inline (Vega-Lite-style
 * `data.values`) so the IR is self-contained and serializable across
 * the proxy → FE boundary without separate fetches.
 */
export interface ChartIRData {
    columns: ReadonlyArray<{ readonly name: string; readonly type?: string }>;
    rows: ReadonlyArray<ReadonlyArray<unknown>>;
}

/**
 * The canonical PulsePlay ChartIR. Any chart spec from any source is
 * translated into this shape; the renderer consumes only this.
 */
export interface ChartIR {
    /** Curated mark — what kind of chart to render. */
    mark: ChartIRMark;
    /** Field-to-channel bindings. */
    encodings: ChartIREncodings;
    /** Optional title / description framing. */
    frame?: ChartIRFrame;
    /** The data the chart binds against. */
    data: ChartIRData;
    /**
     * Provenance — which translator produced this IR. Used by the trust
     * footer ("Chart from Genie HELIOS spec" vs "Chart picked by
     * PulsePlay's heuristic"). MUST be set by every translator.
     */
    sourceTranslator: string;
    /**
     * Optional version tag from the source spec (e.g., HELIOS `version: 3`,
     * Vega-Lite `$schema`). Lets the renderer warn or degrade on
     * unfamiliar future versions instead of silently misrendering.
     */
    sourceVersion?: string | number;
    /**
     * Optional unstructured payload from the source spec that the
     * curated IR couldn't capture but a future enhancement might use.
     * Translators should put dropped fields here, not silently lose them.
     */
    sourceExtras?: Record<string, unknown>;
}

/**
 * The bridge from the existing heuristic-based chart picker to the new
 * ChartIR shape. Lets PulsePlay's `chartAutoPick` participate in the
 * translator registry without changing any of its own logic.
 *
 * The heuristic doesn't have axis titles, format strings, or color
 * channels — it just picks a `ChartKind` from row/column shape. We
 * fill in the minimum encodings so the renderer can paint something
 * useful: the first label column on X, the first numeric column on Y.
 */
export function chartIRFromHeuristic(data: ChartIRData): ChartIR {
    const columnNames = data.columns.map(c => c.name);
    const rows = data.rows.map(r => Array.from(r));
    const auto = chartAutoPick(columnNames, rows);
    const mark = chartKindToIRMark(auto.chartType);

    // First-row inspection mirrors what chartAutoPick.analyzeDataShape
    // does internally — find label columns vs numeric columns.
    const firstRow = rows[0] ?? [];
    const labelIdx: number[] = [];
    const numericIdx: number[] = [];
    firstRow.forEach((cell, i) => {
        const isNumeric = typeof cell === "number"
            || (typeof cell === "string" && cell.trim() !== "" && Number.isFinite(Number(cell)));
        if (isNumeric) numericIdx.push(i);
        else labelIdx.push(i);
    });

    const encodings: ChartIREncodings = {};
    if (labelIdx.length > 0) {
        const idx = labelIdx[0];
        encodings.x = {
            field: columnNames[idx] ?? `col_${idx}`,
            scaleType: "categorical",
            title: columnNames[idx],
        };
    }
    if (numericIdx.length > 0) {
        const idx = numericIdx[0];
        encodings.y = {
            field: columnNames[idx] ?? `col_${idx}`,
            scaleType: "quantitative",
            title: columnNames[idx],
        };
    }

    return {
        mark,
        encodings,
        data,
        sourceTranslator: "heuristic",
    };
}

/**
 * Reverse mapping — ChartIR mark → ChartKind. Used by the GenieChart
 * component to translate a resolved IR back into the ChartKind that
 * the existing `buildEChartsOption` consumes. The IR mark vocabulary
 * is a curated subset of ChartKind, so the reverse is total (no null
 * branches). Add a case here when you widen the IR mark set.
 */
export function irMarkToChartKind(mark: ChartIRMark): ChartKind {
    switch (mark) {
        case "bar":     return "bar";
        case "column":  return "column";
        case "line":    return "line";
        case "area":    return "area";
        case "point":   return "scatter";
        case "pie":     return "pie";
        case "donut":   return "donut";
        case "heatmap": return "heatmap";
        case "kpi":     return "kpi";
        // text / table marks aren't chart kinds — degrade to bar so
        // the renderer paints something rather than crashing. In
        // practice the HELIOS translator returns null for table-shaped
        // widgets so we shouldn't see these here.
        case "text":
        case "table":   return "bar";
        default: {
            const _exhaustive: never = mark;
            void _exhaustive;
            return "bar";
        }
    }
}

/**
 * Map PulsePlay's existing `ChartKind` enum to the IR mark set.
 * The ChartKind has more variants than the IR's curated marks — extras
 * fold into their closest supported sibling so renderer behavior stays
 * predictable while we expand support over time.
 */
function chartKindToIRMark(kind: ChartKind): ChartIRMark {
    switch (kind) {
        case "bar":
        case "clustered-bar":
        case "pareto":
        case "lollipop":
        case "waterfall":
            return "bar";
        case "column":
            return "column";
        case "line":
        case "sparkline":
            return "line";
        case "area":
            return "area";
        case "scatter":
        case "bubble":
            return "point";
        case "pie":
            return "pie";
        case "donut":
            return "donut";
        case "heatmap":
            return "heatmap";
        case "kpi":
            return "kpi";
        // Specialty marks PulsePlay's ECharts renderer also supports but
        // that aren't yet in the curated ChartIR mark set — fold to the
        // closest match. Renderer-level support will be re-exposed when
        // we widen the IR mark vocabulary.
        case "treemap":
        case "sunburst":
        case "funnel":
        case "radar":
        case "gauge":
        case "sankey":
            return "bar";
        default: {
            // Exhaustiveness guard — `kind` is `never` here when ChartKind
            // is fully matched. If a new variant is added to ChartKind
            // without a case above, TS catches it here at compile time.
            const _exhaustive: never = kind;
            void _exhaustive;
            return "bar";
        }
    }
}
