// playground/src/visualization/translators/vegaLite.ts
//
// UX-VIEWER-1.7b.3 — Vega-Lite passthrough translator.
//
// Translates any Vega-Lite-shaped chart spec into PulsePlay's ChartIR.
// This is the second vendor translator (HELIOS was first); it unlocks
// Vega-Lite-emitting backends — Snowflake Cortex Agents (REST + SSE),
// Looker Conversational Analytics API, Streamlit's st.vega_lite_chart
// passthrough, and any future tool that joins the Vega-Lite cluster —
// with zero new code beyond this file.
//
// Industry context: Vega-Lite is the de facto interchange format for
// AI-generated chart specs in 2026. Databricks themselves promote it
// for multi-agent chart spec in their 2026 blog "Bringing Visualizations
// to Life in Multi-Agent Systems With Vega-Lite". Cortex Agents emit
// Vega-Lite over SSE; Looker CA emits Vega specs in the message stream.
//
// PulsePlay's ChartIR is intentionally a CURATED SUBSET of Vega-Lite v5
// (see chartIR.ts), so this translator is mostly a 1:1 field copy with
// some normalization. It does NOT cover the full Vega-Lite surface
// (layers, facets, transforms, signals, selections) — translator returns
// null for unrenderable shapes and the resolver falls through to the
// next translator or the heuristic.

import type {
    ChartIR,
    ChartIRMark,
    ChartIRScaleType,
    ChartIREncoding,
    ChartIREncodings,
    ChartIRData,
} from "../chartIR";
import type { ChartTranslator } from "./registry";

interface VegaLiteMarkObject {
    type?: string;
    innerRadius?: number;
}

interface VegaLiteEncodingField {
    field?: string;
    type?: string;
    title?: string;
    format?: string;
    scale?: { type?: string };
}

interface VegaLiteSpec {
    $schema?: string;
    title?: string | { text?: string };
    description?: string;
    mark?: string | VegaLiteMarkObject;
    encoding?: Record<string, unknown>;
    // We deliberately ignore these (curated IR scope):
    layer?: unknown;
    hconcat?: unknown;
    vconcat?: unknown;
    repeat?: unknown;
    facet?: unknown;
    transform?: unknown;
    selection?: unknown;
    params?: unknown;
}

/** Map Vega-Lite mark → ChartIR mark. Returns null for marks that
 *  can't render in PulsePlay's curated IR set; the resolver then
 *  continues to the next translator or to the heuristic. */
function vegaMarkToIR(markType: string, markObj?: VegaLiteMarkObject): ChartIRMark | null {
    switch (markType.toLowerCase()) {
        case "bar":     return "bar";
        case "line":    return "line";
        case "area":    return "area";
        case "point":   return "point";
        case "circle":  return "point";
        case "square":  return "point";
        case "arc": {
            // Vega-Lite uses `arc` for both pie and donut. Distinguish
            // by innerRadius — non-zero/non-undefined => donut.
            if (markObj && typeof markObj.innerRadius === "number" && markObj.innerRadius > 0) {
                return "donut";
            }
            return "pie";
        }
        case "rect":    return "heatmap";  // common Vega-Lite heatmap pattern
        case "text":    return "text";
        // Marks PulsePlay's renderer doesn't paint — return null so the
        // resolver falls through to the heuristic / next translator.
        case "tick":
        case "rule":
        case "geoshape":
        case "image":
        case "trail":
            return null;
        default:
            return null;
    }
}

function resolveMarkType(mark: VegaLiteSpec["mark"]): { type: string | null; obj?: VegaLiteMarkObject } {
    if (typeof mark === "string") return { type: mark };
    if (mark && typeof mark === "object" && typeof mark.type === "string") {
        return { type: mark.type, obj: mark };
    }
    return { type: null };
}

/** Vega-Lite `type` → ChartIR scaleType. Vega-Lite's nominal is what
 *  PulsePlay's IR calls categorical. */
function vegaTypeToScale(t: unknown): ChartIRScaleType | undefined {
    if (typeof t !== "string") return undefined;
    switch (t.toLowerCase()) {
        case "quantitative": return "quantitative";
        case "temporal":     return "temporal";
        case "ordinal":      return "ordinal";
        case "nominal":      return "categorical";
        default:             return undefined;
    }
}

function extractEncoding(raw: unknown): ChartIREncoding | null {
    if (!raw || typeof raw !== "object") return null;
    const enc = raw as VegaLiteEncodingField;
    if (typeof enc.field !== "string" || !enc.field) return null;
    // Type can live either at the encoding root (`encoding.x.type`) or
    // nested under scale (`encoding.x.scale.type`). Vega-Lite documents
    // the root location; some libraries emit it nested. Accept both.
    const scaleType = vegaTypeToScale(enc.type) ?? vegaTypeToScale(enc.scale?.type);
    return {
        field: enc.field,
        ...(typeof enc.title === "string" ? { title: enc.title } : {}),
        ...(scaleType !== undefined ? { scaleType } : {}),
        ...(typeof enc.format === "string" ? { format: enc.format } : {}),
    };
}

function extractTitle(spec: VegaLiteSpec): string | undefined {
    if (typeof spec.title === "string") return spec.title;
    if (spec.title && typeof spec.title === "object" && typeof spec.title.text === "string") {
        return spec.title.text;
    }
    return undefined;
}

export const vegaLiteTranslator: ChartTranslator = {
    name: "vega-lite",

    detect: (raw: unknown): boolean => {
        if (!raw || typeof raw !== "object") return false;
        const spec = raw as VegaLiteSpec;
        // Signal 1: explicit $schema referencing vega.github.io / vega-lite
        if (typeof spec.$schema === "string" && /vega-lite|vega\.github\.io/i.test(spec.$schema)) {
            return true;
        }
        // Signal 2: top-level `mark` field present (string or object with type)
        // — the strongest distinguishing feature of Vega-Lite shapes.
        const { type } = resolveMarkType(spec.mark);
        return type !== null;
    },

    translate: (raw: unknown, data: ChartIRData): ChartIR | null => {
        if (!raw || typeof raw !== "object") return null;
        const spec = raw as VegaLiteSpec;
        const { type: markType, obj: markObj } = resolveMarkType(spec.mark);
        if (!markType) return null;
        const mark = vegaMarkToIR(markType, markObj);
        if (mark === null) return null;

        // Refuse layered / faceted / repeated / multi-view specs — we
        // only handle single-view shapes. Returning null lets the
        // resolver continue to a heuristic fallback that paints
        // *something* from the data.
        if (spec.layer || spec.hconcat || spec.vconcat || spec.repeat || spec.facet) {
            return null;
        }

        const encodings: ChartIREncodings = {};
        const rawEnc = (spec.encoding ?? {}) as Record<string, unknown>;
        for (const channel of ["x", "y", "color", "size"] as const) {
            const e = extractEncoding(rawEnc[channel]);
            if (e) encodings[channel] = e;
        }
        // Vega-Lite calls the text channel `text` (used with mark: "text"
        // for labels and tooltips). PulsePlay's IR calls it `label`.
        const labelEnc = extractEncoding(rawEnc.text) ?? extractEncoding(rawEnc.label);
        if (labelEnc) encodings.label = labelEnc;

        const title = extractTitle(spec);
        const frame = (title !== undefined || typeof spec.description === "string")
            ? {
                ...(title !== undefined ? { title, showTitle: true } : {}),
                ...(typeof spec.description === "string" ? { description: spec.description } : {}),
            }
            : undefined;

        const ir: ChartIR = {
            mark,
            encodings,
            ...(frame ? { frame } : {}),
            data,
            sourceTranslator: "vega-lite",
            ...(typeof spec.$schema === "string" ? { sourceVersion: spec.$schema } : {}),
        };

        // Preserve any encoding channels we don't curate (opacity, stroke,
        // strokeDash, shape, angle, theta, radius, tooltip, href, order, …).
        const extras: Record<string, unknown> = {};
        const unknownChannels: Record<string, unknown> = {};
        for (const key of Object.keys(rawEnc)) {
            if (key !== "x" && key !== "y" && key !== "color" && key !== "size" && key !== "text" && key !== "label") {
                unknownChannels[key] = rawEnc[key];
            }
        }
        if (Object.keys(unknownChannels).length > 0) extras.unknownEncodings = unknownChannels;
        // Mark object — color / opacity / interpolate / cornerRadius etc. live here
        // when the spec uses the object-form `mark: { type: "bar", color: "...", ... }`.
        if (markObj) {
            const { type: _t, ...rest } = markObj;
            void _t;
            if (Object.keys(rest).length > 0) extras.markOptions = rest;
        }
        if (Object.keys(extras).length > 0) ir.sourceExtras = extras;

        return ir;
    },
};
