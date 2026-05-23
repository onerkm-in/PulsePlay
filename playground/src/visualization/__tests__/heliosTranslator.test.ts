// playground/src/visualization/__tests__/heliosTranslator.test.ts
//
// UX-VIEWER-1.7b.2 — HELIOS translator tests.
//
// Coverage:
//   1. Detect: matches { chart_library: "HELIOS", definition: "..." }, rejects others
//   2. Translate: bar / line / heatmap / column / area / pie shapes
//   3. Real captured spec from a live Genie chat session (heatmap)
//   4. Encoding extraction: fieldName → field, scale.type → scaleType, axis.title → title
//   5. Frame extraction: title, showTitle, description
//   6. Degrade: table / pivot / unknown widgetType return null (resolver falls through)
//   7. Version preservation: sourceVersion set when present
//   8. sourceExtras: dropped channels preserved
//   9. Malformed definition: invalid JSON returns null

import { describe, it, expect } from "vitest";
import { heliosTranslator } from "../translators/helios";
import type { ChartIRData } from "../chartIR";

const SAMPLE_DATA: ChartIRData = {
    columns: [
        { name: "region", type: "string" },
        { name: "category", type: "string" },
        { name: "total_sales", type: "number" },
    ],
    rows: [
        ["East", "Furniture", 100],
        ["West", "Tech", 200],
    ],
};

describe("heliosTranslator — detect", () => {
    it("matches a HELIOS attachment with definition", () => {
        const att = {
            chart_library: "HELIOS",
            definition: '{"renderSpec":{"widgetType":"bar"}}',
            status: "GENERATED",
        };
        expect(heliosTranslator.detect(att)).toBe(true);
    });

    it("rejects non-HELIOS chart_library", () => {
        const att = { chart_library: "VEGA-LITE", definition: "{}", status: "GENERATED" };
        expect(heliosTranslator.detect(att)).toBe(false);
    });

    it("rejects attachments without a definition", () => {
        const att = { chart_library: "HELIOS", status: "GENERATED" };
        expect(heliosTranslator.detect(att)).toBe(false);
    });

    it("rejects attachments still being generated (status != GENERATED)", () => {
        const att = { chart_library: "HELIOS", definition: "{}", status: "PENDING" };
        expect(heliosTranslator.detect(att)).toBe(false);
    });

    it("accepts attachments with no status field (some older Genie responses omit it)", () => {
        const att = { chart_library: "HELIOS", definition: '{"renderSpec":{"widgetType":"bar"}}' };
        expect(heliosTranslator.detect(att)).toBe(true);
    });

    it("rejects nullish / non-object inputs", () => {
        expect(heliosTranslator.detect(null)).toBe(false);
        expect(heliosTranslator.detect(undefined)).toBe(false);
        expect(heliosTranslator.detect("string")).toBe(false);
        expect(heliosTranslator.detect(42)).toBe(false);
    });
});

describe("heliosTranslator — translate basic widget types", () => {
    function makeAtt(widgetType: string, encodings: Record<string, unknown> = {}, frame?: Record<string, unknown>): unknown {
        const renderSpec = { widgetType, version: 3, encodings, ...(frame ? { frame } : {}) };
        return {
            chart_library: "HELIOS",
            definition: JSON.stringify({ renderSpec }),
            status: "GENERATED",
            type: widgetType,
        };
    }

    it("translates bar with x + y + color encodings", () => {
        const att = makeAtt("bar", {
            x: { fieldName: "region", scale: { type: "categorical" }, axis: { title: "Region" } },
            y: { fieldName: "total_sales", scale: { type: "quantitative" }, axis: { title: "Sales" } },
            color: { fieldName: "category", scale: { type: "categorical" } },
        });
        const ir = heliosTranslator.translate(att, SAMPLE_DATA);
        expect(ir).not.toBeNull();
        expect(ir!.mark).toBe("bar");
        expect(ir!.sourceTranslator).toBe("helios");
        expect(ir!.sourceVersion).toBe(3);
        expect(ir!.encodings.x).toEqual({ field: "region", title: "Region", scaleType: "categorical" });
        expect(ir!.encodings.y).toEqual({ field: "total_sales", title: "Sales", scaleType: "quantitative" });
        expect(ir!.encodings.color).toEqual({ field: "category", scaleType: "categorical" });
    });

    it("translates line", () => {
        const att = makeAtt("line", {
            x: { fieldName: "month" },
            y: { fieldName: "revenue" },
        });
        const ir = heliosTranslator.translate(att, SAMPLE_DATA);
        expect(ir!.mark).toBe("line");
    });

    it("translates column", () => {
        expect(heliosTranslator.translate(makeAtt("column"), SAMPLE_DATA)!.mark).toBe("column");
    });

    it("translates area", () => {
        expect(heliosTranslator.translate(makeAtt("area"), SAMPLE_DATA)!.mark).toBe("area");
    });

    it("translates pie + donut", () => {
        expect(heliosTranslator.translate(makeAtt("pie"), SAMPLE_DATA)!.mark).toBe("pie");
        expect(heliosTranslator.translate(makeAtt("donut"), SAMPLE_DATA)!.mark).toBe("donut");
    });

    it("translates heatmap", () => {
        expect(heliosTranslator.translate(makeAtt("heatmap"), SAMPLE_DATA)!.mark).toBe("heatmap");
    });

    it("translates scatter / bubble to point", () => {
        expect(heliosTranslator.translate(makeAtt("scatter"), SAMPLE_DATA)!.mark).toBe("point");
        expect(heliosTranslator.translate(makeAtt("bubble"), SAMPLE_DATA)!.mark).toBe("point");
    });

    it("translates counter / kpi to kpi", () => {
        expect(heliosTranslator.translate(makeAtt("counter"), SAMPLE_DATA)!.mark).toBe("kpi");
        expect(heliosTranslator.translate(makeAtt("kpi"), SAMPLE_DATA)!.mark).toBe("kpi");
    });

    it("translates histogram + waterfall to closest renderable shape (bar)", () => {
        expect(heliosTranslator.translate(makeAtt("histogram"), SAMPLE_DATA)!.mark).toBe("bar");
        expect(heliosTranslator.translate(makeAtt("waterfall"), SAMPLE_DATA)!.mark).toBe("bar");
    });
});

describe("heliosTranslator — degrade paths", () => {
    function makeAtt(widgetType: string): unknown {
        return {
            chart_library: "HELIOS",
            definition: JSON.stringify({ renderSpec: { widgetType, version: 3, encodings: {} } }),
            status: "GENERATED",
        };
    }

    it("returns null for table widget type (resolver should fall through)", () => {
        expect(heliosTranslator.translate(makeAtt("table"), SAMPLE_DATA)).toBeNull();
    });

    it("returns null for pivot widget type", () => {
        expect(heliosTranslator.translate(makeAtt("pivot"), SAMPLE_DATA)).toBeNull();
    });

    it("returns null for combo (bar+line overlay, not yet supported)", () => {
        expect(heliosTranslator.translate(makeAtt("combo"), SAMPLE_DATA)).toBeNull();
    });

    it("returns null for unknown widget types (don't guess)", () => {
        expect(heliosTranslator.translate(makeAtt("totally-unknown-widget"), SAMPLE_DATA)).toBeNull();
    });

    it("returns null when definition is invalid JSON", () => {
        const att = { chart_library: "HELIOS", definition: "{not json}", status: "GENERATED" };
        expect(heliosTranslator.translate(att, SAMPLE_DATA)).toBeNull();
    });

    it("returns null when renderSpec is missing widgetType", () => {
        const att = {
            chart_library: "HELIOS",
            definition: JSON.stringify({ renderSpec: { version: 3, encodings: {} } }),
            status: "GENERATED",
        };
        expect(heliosTranslator.translate(att, SAMPLE_DATA)).toBeNull();
    });
});

describe("heliosTranslator — frame + extras", () => {
    it("captures frame title + showTitle when present", () => {
        const att = {
            chart_library: "HELIOS",
            definition: JSON.stringify({
                renderSpec: {
                    widgetType: "bar",
                    version: 3,
                    encodings: {},
                    frame: { title: "Total Sales by Region", showTitle: true },
                },
            }),
            status: "GENERATED",
        };
        const ir = heliosTranslator.translate(att, SAMPLE_DATA);
        expect(ir!.frame).toEqual({ title: "Total Sales by Region", showTitle: true });
    });

    it("preserves dropped encoding channels in sourceExtras", () => {
        const att = {
            chart_library: "HELIOS",
            definition: JSON.stringify({
                renderSpec: {
                    widgetType: "bar",
                    version: 3,
                    encodings: {
                        x: { fieldName: "region" },
                        // Channels we don't curate yet — must survive in sourceExtras
                        opacity: { fieldName: "transparency" },
                        stroke: { fieldName: "border" },
                    },
                    mark: { colors: ["#1f77b4", "#ff7f0e"] },
                },
            }),
            status: "GENERATED",
        };
        const ir = heliosTranslator.translate(att, SAMPLE_DATA);
        expect(ir!.sourceExtras).toBeDefined();
        expect(ir!.sourceExtras!.mark).toEqual({ colors: ["#1f77b4", "#ff7f0e"] });
        const unknownChannels = ir!.sourceExtras!.unknownEncodings as Record<string, unknown>;
        expect(unknownChannels.opacity).toBeDefined();
        expect(unknownChannels.stroke).toBeDefined();
    });

    it("works when definition is already parsed (not a JSON string)", () => {
        const att = {
            chart_library: "HELIOS",
            definition: {
                renderSpec: { widgetType: "line", version: 3, encodings: { x: { fieldName: "month" } } },
            },
            status: "GENERATED",
        };
        const ir = heliosTranslator.translate(att, SAMPLE_DATA);
        expect(ir).not.toBeNull();
        expect(ir!.mark).toBe("line");
        expect(ir!.encodings.x?.field).toBe("month");
    });
});

describe("heliosTranslator — captured real Genie viz (heatmap)", () => {
    // This is the actual `viz` attachment captured 2026-05-23 from a
    // live Genie chat session ("sales and profit by category and region"
    // question). Used as a fidelity test — if HELIOS shape changes
    // upstream this test fails immediately and we know to update the
    // translator.
    const REAL_VIZ = {
        type: "heatmap",
        chart_library: "HELIOS",
        definition: JSON.stringify({
            renderSpec: {
                widgetType: "heatmap",
                version: 3,
                encodings: {
                    x: { fieldName: "region", scale: { type: "categorical" }, axis: { title: "Region" } },
                    y: { fieldName: "category", scale: { type: "categorical" }, axis: { title: "Category" } },
                    color: { fieldName: "total_sales", scale: { type: "quantitative" } },
                },
                frame: { title: "Total Sales by Category and Region", showTitle: true },
            },
        }),
        id: "01f15685f21c1ae09b11be5ed448ec94",
        query_message_id: "01f15685e7691993b59b32dfe9780c9b",
        query_attachment_id: "01f15685eb9519ddbe482a4741557968",
        status: "GENERATED",
    };

    it("translates the real captured viz to a complete ChartIR", () => {
        expect(heliosTranslator.detect(REAL_VIZ)).toBe(true);
        const ir = heliosTranslator.translate(REAL_VIZ, SAMPLE_DATA);
        expect(ir).not.toBeNull();
        expect(ir!.mark).toBe("heatmap");
        expect(ir!.sourceTranslator).toBe("helios");
        expect(ir!.sourceVersion).toBe(3);
        expect(ir!.encodings.x?.field).toBe("region");
        expect(ir!.encodings.x?.title).toBe("Region");
        expect(ir!.encodings.x?.scaleType).toBe("categorical");
        expect(ir!.encodings.y?.field).toBe("category");
        expect(ir!.encodings.color?.field).toBe("total_sales");
        expect(ir!.encodings.color?.scaleType).toBe("quantitative");
        expect(ir!.frame?.title).toBe("Total Sales by Category and Region");
        expect(ir!.frame?.showTitle).toBe(true);
    });
});
