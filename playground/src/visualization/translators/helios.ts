// playground/src/visualization/translators/helios.ts
//
// UX-VIEWER-1.7b.2 — HELIOS translator.
//
// Translates Databricks Genie's HELIOS chart spec (the `viz` attachment on
// a Genie message response) into PulsePlay's ChartIR (a curated subset of
// Vega-Lite v5).
//
// HELIOS is Databricks' internal codename for the chart renderer that
// powers AI/BI Dashboards (Lakeview / `.lvdash.json`) and Genie
// visualization attachments. It is NOT documented as a public API —
// `version` is observed at 3 today; v1/v2 existed during the Redash →
// Lakeview migration. Translator must be tolerant: unknown widget
// types, unknown encoding keys, unfamiliar versions all degrade
// gracefully rather than crashing.
//
// Detect shape: the raw attachment has `{ chart_library: "HELIOS",
// definition: "<json string>", type, status }`. `definition` is a JSON-
// string that parses to `{ renderSpec: { widgetType, version, encodings,
// frame, ... } }`.

import type {
    ChartIR,
    ChartIRMark,
    ChartIRScaleType,
    ChartIREncoding,
    ChartIREncodings,
    ChartIRData,
} from "../chartIR";
import type { ChartTranslator } from "./registry";

interface HeliosRenderSpec {
    widgetType?: string;
    version?: number;
    encodings?: Record<string, unknown>;
    frame?: { title?: string; showTitle?: boolean; description?: string; showDescription?: boolean };
    mark?: { colors?: unknown };
}

interface HeliosAttachment {
    chart_library?: string;
    definition?: string | Record<string, unknown>;
    type?: string;
    status?: string;
}

/** Highest HELIOS renderSpec.version this translator is known to handle.
 *  When a higher version arrives, we still try to translate but the
 *  resulting ChartIR carries `sourceVersion` so downstream can log and
 *  the trust footer can warn. */
export const HELIOS_MAX_KNOWN_VERSION = 3;

/** Map HELIOS widgetType → ChartIR mark. Returns null for widget types
 *  that don't have a chart-mark equivalent (table, pivot, etc.) — the
 *  translator then returns null and the resolver falls through. */
function widgetTypeToMark(widgetType: string): ChartIRMark | null {
    switch (widgetType.toLowerCase()) {
        case "bar":       return "bar";
        case "column":    return "column";
        case "line":      return "line";
        case "area":      return "area";
        case "scatter":   return "point";
        case "bubble":    return "point";
        case "pie":       return "pie";
        case "donut":     return "donut";
        case "heatmap":   return "heatmap";
        case "histogram": return "bar";   // closest renderable shape
        case "waterfall": return "bar";   // closest renderable shape
        case "counter":   return "kpi";
        case "kpi":       return "kpi";
        // Widget types with no direct chart-mark equivalent — return null
        // so the resolver continues to the next translator. The caller
        // will typically degrade to a table render or fall to heuristic.
        case "table":
        case "pivot":
        case "combo":            // bar + line overlay — not yet supported by the IR
        case "box":              // boxplot — not yet in the renderer
        case "funnel":           // not yet in the curated IR mark set
        case "sankey":           // not yet in the curated IR mark set
        case "choropleth-map":
        case "point-map":
            return null;
        default:
            // Unknown widget type. Don't guess.
            return null;
    }
}

function normalizeScaleType(raw: unknown): ChartIRScaleType | undefined {
    if (typeof raw !== "string") return undefined;
    switch (raw.toLowerCase()) {
        case "categorical": return "categorical";
        case "quantitative": return "quantitative";
        case "temporal": return "temporal";
        case "ordinal": return "ordinal";
        default: return undefined;
    }
}

/** Extract one HELIOS encoding channel → ChartIREncoding.
 *  Returns null when the encoding is malformed (no fieldName). */
function extractEncoding(raw: unknown): ChartIREncoding | null {
    if (!raw || typeof raw !== "object") return null;
    const enc = raw as Record<string, unknown>;
    const field = enc.fieldName ?? enc.field;
    if (typeof field !== "string" || !field) return null;
    const scaleObj = enc.scale && typeof enc.scale === "object" ? (enc.scale as Record<string, unknown>) : undefined;
    const axisObj = enc.axis && typeof enc.axis === "object" ? (enc.axis as Record<string, unknown>) : undefined;
    const formatObj = enc.format && typeof enc.format === "object" ? (enc.format as Record<string, unknown>) : undefined;
    const title = typeof axisObj?.title === "string" ? (axisObj.title as string) : undefined;
    const scaleType = scaleObj ? normalizeScaleType(scaleObj.type) : undefined;
    const format = typeof formatObj?.format === "string" ? (formatObj.format as string)
        : (typeof formatObj?.dateFormat === "string" ? (formatObj.dateFormat as string) : undefined);
    return {
        field,
        ...(title !== undefined ? { title } : {}),
        ...(scaleType !== undefined ? { scaleType } : {}),
        ...(format !== undefined ? { format } : {}),
    };
}

/** Parse HELIOS `viz.definition` into a renderSpec object.
 *  `definition` may be either a JSON-string (wire shape) or an already-
 *  parsed object (some FE callers pre-parse). Returns null on parse
 *  failure — translator then returns null. */
function parseDefinition(definition: HeliosAttachment["definition"]): HeliosRenderSpec | null {
    if (!definition) return null;
    let parsed: unknown = definition;
    if (typeof definition === "string") {
        try {
            parsed = JSON.parse(definition);
        } catch {
            return null;
        }
    }
    if (!parsed || typeof parsed !== "object") return null;
    const outer = parsed as Record<string, unknown>;
    const renderSpec = outer.renderSpec && typeof outer.renderSpec === "object"
        ? (outer.renderSpec as HeliosRenderSpec)
        : null;
    return renderSpec;
}

export const heliosTranslator: ChartTranslator = {
    name: "helios",

    detect: (raw: unknown): boolean => {
        if (!raw || typeof raw !== "object") return false;
        const att = raw as HeliosAttachment;
        // Require the chart_library tag AND a definition we can parse.
        // status === "GENERATED" is required — Databricks emits the
        // field while a chart is still being computed, and we shouldn't
        // try to render an incomplete spec.
        if (att.chart_library !== "HELIOS") return false;
        if (att.status && att.status !== "GENERATED") return false;
        return !!att.definition;
    },

    translate: (raw: unknown, data: ChartIRData): ChartIR | null => {
        if (!raw || typeof raw !== "object") return null;
        const att = raw as HeliosAttachment;
        const renderSpec = parseDefinition(att.definition);
        if (!renderSpec) return null;

        const widgetType = String(renderSpec.widgetType || att.type || "").trim();
        if (!widgetType) return null;
        const mark = widgetTypeToMark(widgetType);
        if (mark === null) {
            // Unknown / non-chart widget type (table, pivot, etc.).
            // Returning null lets the resolver continue to the next
            // translator or to the heuristic fallback.
            return null;
        }

        const encodings: ChartIREncodings = {};
        const rawEnc = renderSpec.encodings ?? {};
        for (const channel of ["x", "y", "color", "size", "label"] as const) {
            const e = extractEncoding((rawEnc as Record<string, unknown>)[channel]);
            if (e) encodings[channel] = e;
        }

        // Frame — title / description shown around the chart.
        const frame = renderSpec.frame && typeof renderSpec.frame === "object"
            ? {
                ...(typeof renderSpec.frame.title === "string" ? { title: renderSpec.frame.title } : {}),
                ...(typeof renderSpec.frame.showTitle === "boolean" ? { showTitle: renderSpec.frame.showTitle } : {}),
                ...(typeof renderSpec.frame.description === "string" ? { description: renderSpec.frame.description } : {}),
                ...(typeof renderSpec.frame.showDescription === "boolean" ? { showDescription: renderSpec.frame.showDescription } : {}),
            }
            : undefined;

        const ir: ChartIR = {
            mark,
            encodings,
            ...(frame ? { frame } : {}),
            data,
            sourceTranslator: "helios",
            ...(typeof renderSpec.version === "number" ? { sourceVersion: renderSpec.version } : {}),
        };

        // Preserve dropped fields (mark colors, unknown channels, etc.)
        // in sourceExtras so a future curation expansion can surface
        // them without re-mining the wire shape.
        const extras: Record<string, unknown> = {};
        if (renderSpec.mark) extras.mark = renderSpec.mark;
        const unknownChannels: Record<string, unknown> = {};
        for (const key of Object.keys(rawEnc)) {
            if (key !== "x" && key !== "y" && key !== "color" && key !== "size" && key !== "label") {
                unknownChannels[key] = (rawEnc as Record<string, unknown>)[key];
            }
        }
        if (Object.keys(unknownChannels).length > 0) extras.unknownEncodings = unknownChannels;
        if (Object.keys(extras).length > 0) ir.sourceExtras = extras;

        return ir;
    },
};
