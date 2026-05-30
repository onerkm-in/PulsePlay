// playground/src/visualization/__tests__/vegaLiteTranslator.test.ts
//
// UX-VIEWER-1.7b.3 — Vega-Lite passthrough translator tests.
//
// Vega-Lite is the de facto industry interchange format for AI-generated
// chart specs in 2026 (Snowflake Cortex Agents, Looker CA, Streamlit,
// etc.). The translator covers the curated single-view subset PulsePlay
// renders; layered / faceted / multi-view specs return null and fall
// through to the heuristic.

import { describe, it, expect } from "vitest";
import { vegaLiteTranslator } from "../translators/vegaLite";
import type { ChartIRData } from "../chartIR";

const SAMPLE_DATA: ChartIRData = {
    columns: [
        { name: "region", type: "string" },
        { name: "sales", type: "number" },
    ],
    rows: [
        ["East", 100],
        ["West", 200],
    ],
};

describe("vegaLiteTranslator — detect", () => {
    it("matches by $schema referencing vega-lite", () => {
        expect(vegaLiteTranslator.detect({
            $schema: "https://vega.github.io/schema/vega-lite/v5.json",
            mark: "bar",
        })).toBe(true);
    });

    it("matches by top-level mark (string form)", () => {
        expect(vegaLiteTranslator.detect({ mark: "bar", encoding: {} })).toBe(true);
    });

    it("matches by top-level mark (object form)", () => {
        expect(vegaLiteTranslator.detect({ mark: { type: "line" } })).toBe(true);
    });

    it("rejects objects with no mark and no $schema", () => {
        expect(vegaLiteTranslator.detect({ random: "object" })).toBe(false);
    });

    it("rejects HELIOS attachments (HELIOS has no mark / $schema at top)", () => {
        expect(vegaLiteTranslator.detect({
            chart_library: "HELIOS",
            definition: "{}",
            status: "GENERATED",
        })).toBe(false);
    });

    it("rejects nullish / non-object inputs", () => {
        expect(vegaLiteTranslator.detect(null)).toBe(false);
        expect(vegaLiteTranslator.detect(undefined)).toBe(false);
        expect(vegaLiteTranslator.detect("vega-lite")).toBe(false);
    });
});

describe("vegaLiteTranslator — translate basic marks", () => {
    it("translates a bar spec with x + y + color encodings", () => {
        const spec = {
            $schema: "https://vega.github.io/schema/vega-lite/v5.json",
            mark: "bar",
            encoding: {
                x: { field: "region", type: "nominal", title: "Region" },
                y: { field: "sales", type: "quantitative", title: "Sales" },
                color: { field: "category", type: "nominal" },
            },
        };
        const ir = vegaLiteTranslator.translate(spec, SAMPLE_DATA);
        expect(ir).not.toBeNull();
        expect(ir!.mark).toBe("bar");
        expect(ir!.sourceTranslator).toBe("vega-lite");
        expect(ir!.sourceVersion).toBe("https://vega.github.io/schema/vega-lite/v5.json");
        // Vega-Lite "nominal" → ChartIR "categorical"
        expect(ir!.encodings.x).toEqual({ field: "region", title: "Region", scaleType: "categorical" });
        expect(ir!.encodings.y).toEqual({ field: "sales", title: "Sales", scaleType: "quantitative" });
        expect(ir!.encodings.color).toEqual({ field: "category", scaleType: "categorical" });
    });

    it("translates line / area / point", () => {
        expect(vegaLiteTranslator.translate({ mark: "line", encoding: {} }, SAMPLE_DATA)!.mark).toBe("line");
        expect(vegaLiteTranslator.translate({ mark: "area", encoding: {} }, SAMPLE_DATA)!.mark).toBe("area");
        expect(vegaLiteTranslator.translate({ mark: "point", encoding: {} }, SAMPLE_DATA)!.mark).toBe("point");
        expect(vegaLiteTranslator.translate({ mark: "circle", encoding: {} }, SAMPLE_DATA)!.mark).toBe("point");
        expect(vegaLiteTranslator.translate({ mark: "square", encoding: {} }, SAMPLE_DATA)!.mark).toBe("point");
    });

    it("translates arc → pie when no innerRadius", () => {
        const ir = vegaLiteTranslator.translate({ mark: "arc", encoding: {} }, SAMPLE_DATA);
        expect(ir!.mark).toBe("pie");
    });

    it("translates arc → donut when innerRadius > 0", () => {
        const ir = vegaLiteTranslator.translate({ mark: { type: "arc", innerRadius: 50 }, encoding: {} }, SAMPLE_DATA);
        expect(ir!.mark).toBe("donut");
    });

    it("translates rect → heatmap (common Vega-Lite heatmap pattern)", () => {
        const ir = vegaLiteTranslator.translate({
            mark: "rect",
            encoding: {
                x: { field: "region", type: "nominal" },
                y: { field: "category", type: "nominal" },
                color: { field: "sales", type: "quantitative" },
            },
        }, SAMPLE_DATA);
        expect(ir!.mark).toBe("heatmap");
    });

    it("captures title as string", () => {
        const ir = vegaLiteTranslator.translate({
            mark: "bar",
            title: "Sales by Region",
            encoding: {},
        }, SAMPLE_DATA);
        expect(ir!.frame?.title).toBe("Sales by Region");
        expect(ir!.frame?.showTitle).toBe(true);
    });

    it("captures title as object {text}", () => {
        const ir = vegaLiteTranslator.translate({
            mark: "bar",
            title: { text: "Quarterly Performance" },
            encoding: {},
        }, SAMPLE_DATA);
        expect(ir!.frame?.title).toBe("Quarterly Performance");
    });

    it("accepts scale.type as fallback when encoding.type missing", () => {
        const ir = vegaLiteTranslator.translate({
            mark: "bar",
            encoding: {
                x: { field: "month", scale: { type: "temporal" } },
            },
        }, SAMPLE_DATA);
        expect(ir!.encodings.x?.scaleType).toBe("temporal");
    });
});

describe("vegaLiteTranslator — degrade paths", () => {
    it("returns null for layered specs", () => {
        const ir = vegaLiteTranslator.translate({
            $schema: "https://vega.github.io/schema/vega-lite/v5.json",
            layer: [{ mark: "bar" }, { mark: "line" }],
        }, SAMPLE_DATA);
        expect(ir).toBeNull();
    });

    it("returns null for hconcat / vconcat / repeat / facet", () => {
        expect(vegaLiteTranslator.translate({ mark: "bar", hconcat: [] }, SAMPLE_DATA)).toBeNull();
        expect(vegaLiteTranslator.translate({ mark: "bar", vconcat: [] }, SAMPLE_DATA)).toBeNull();
        expect(vegaLiteTranslator.translate({ mark: "bar", repeat: [] }, SAMPLE_DATA)).toBeNull();
        expect(vegaLiteTranslator.translate({ mark: "bar", facet: {} }, SAMPLE_DATA)).toBeNull();
    });

    it("returns null for unrenderable marks (geoshape / tick / rule / image)", () => {
        expect(vegaLiteTranslator.translate({ mark: "geoshape", encoding: {} }, SAMPLE_DATA)).toBeNull();
        expect(vegaLiteTranslator.translate({ mark: "tick", encoding: {} }, SAMPLE_DATA)).toBeNull();
        expect(vegaLiteTranslator.translate({ mark: "rule", encoding: {} }, SAMPLE_DATA)).toBeNull();
        expect(vegaLiteTranslator.translate({ mark: "image", encoding: {} }, SAMPLE_DATA)).toBeNull();
    });

    it("returns null for unknown marks", () => {
        expect(vegaLiteTranslator.translate({ mark: "totally-unknown-mark", encoding: {} }, SAMPLE_DATA)).toBeNull();
    });

    it("returns null when mark field is missing entirely", () => {
        expect(vegaLiteTranslator.translate({ encoding: {} }, SAMPLE_DATA)).toBeNull();
    });
});

describe("vegaLiteTranslator — sourceExtras preservation", () => {
    it("preserves unknown encoding channels (opacity, stroke, tooltip, etc.)", () => {
        const spec = {
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                opacity: { value: 0.5 },
                shape: { field: "category", type: "nominal" },
                tooltip: { field: "label" },
            },
        };
        const ir = vegaLiteTranslator.translate(spec, SAMPLE_DATA);
        expect(ir!.sourceExtras).toBeDefined();
        const unknown = ir!.sourceExtras!.unknownEncodings as Record<string, unknown>;
        expect(unknown.opacity).toBeDefined();
        expect(unknown.shape).toBeDefined();
        expect(unknown.tooltip).toBeDefined();
    });

    it("preserves mark object options (color, cornerRadius, etc.)", () => {
        const spec = {
            mark: { type: "bar", color: "#1f77b4", cornerRadiusEnd: 4 },
            encoding: {},
        };
        const ir = vegaLiteTranslator.translate(spec, SAMPLE_DATA);
        expect(ir!.sourceExtras?.markOptions).toEqual({ color: "#1f77b4", cornerRadiusEnd: 4 });
    });
});

describe("vegaLiteTranslator — Cortex Agents / Looker CA shape (representative)", () => {
    // Representative Vega-Lite spec resembling what Snowflake Cortex
    // Agents and Looker Conversational Analytics API emit in their
    // message streams (per the 2026 research lane). When a translator
    // receives one of these shapes, no PulsePlay code needs to change —
    // the registry resolves it, this translator translates it, the
    // ChartIR feeds the existing chart renderer.
    it("translates a representative Cortex/Looker shape end-to-end", () => {
        const spec = {
            $schema: "https://vega.github.io/schema/vega-lite/v5.json",
            description: "Monthly sales trend by category",
            title: "Sales over time",
            mark: { type: "line", point: true },
            encoding: {
                x: { field: "month", type: "temporal", title: "Month" },
                y: { field: "total_sales", type: "quantitative", title: "Total Sales", format: "$,.0f" },
                color: { field: "category", type: "nominal" },
            },
        };
        const ir = vegaLiteTranslator.translate(spec, SAMPLE_DATA);
        expect(ir).not.toBeNull();
        expect(ir!.mark).toBe("line");
        expect(ir!.sourceTranslator).toBe("vega-lite");
        expect(ir!.encodings.x?.scaleType).toBe("temporal");
        expect(ir!.encodings.y?.format).toBe("$,.0f");
        expect(ir!.encodings.color?.scaleType).toBe("categorical");
        expect(ir!.frame?.title).toBe("Sales over time");
        expect(ir!.frame?.description).toBe("Monthly sales trend by category");
    });
});
