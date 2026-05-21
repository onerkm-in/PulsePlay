import { describe, expect, it } from "vitest";
import { validateChartRenderSpec } from "../chartSpecValidation";

const validSpec = {
    version: "chart-render-spec/v0",
    renderer: "echarts",
    chartType: "bar",
    mark: "bar",
    title: "Sales by category",
    data: { values: [{ category: "Tech", sales: 10 }] },
    encoding: {
        x: { field: "category", type: "nominal" },
        y: { field: "sales", type: "quantitative" },
    },
    dataCitation: "stmt-1",
} as const;

describe("validateChartRenderSpec", () => {
    it("accepts a valid Vega-Lite-ish chart spec", () => {
        const result = validateChartRenderSpec(validSpec);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec).toEqual(validSpec);
    });

    it("accepts object-shaped marks", () => {
        const result = validateChartRenderSpec({ ...validSpec, mark: { type: "line" } });
        expect(result.ok).toBe(true);
    });

    it("rejects unsupported marks with structured errors", () => {
        const result = validateChartRenderSpec({ ...validSpec, mark: "parallel-coordinates" });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors[0]).toMatchObject({
                path: "$.mark",
                code: "unsupported-mark",
            });
        }
    });

    it("rejects external data URLs", () => {
        const result = validateChartRenderSpec({
            ...validSpec,
            data: { url: "javascript:alert(1)", values: [{ category: "A", sales: 1 }] },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.some(e => e.code === "external-data-url")).toBe(true);
    });

    it("rejects missing inline rows", () => {
        const result = validateChartRenderSpec({ ...validSpec, data: { values: [] } });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.some(e => e.code === "missing-values")).toBe(true);
    });

    it("rejects missing x/y field encodings", () => {
        const result = validateChartRenderSpec({
            ...validSpec,
            encoding: { x: { field: "category" } },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.map(e => e.code)).toContain("missing-y-field");
    });
});
