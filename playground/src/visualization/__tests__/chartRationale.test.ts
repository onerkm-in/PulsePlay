// playground/src/visualization/__tests__/chartRationale.test.ts

import { describe, it, expect } from "vitest";
import { buildChartRationale, resolveRelationship } from "../chartRationale";
import type { DataShape } from "../chartAutoPick";

function shape(rowCount: number, numericColCount: number): DataShape {
    return {
        series: [],
        clustered: [],
        numericColCount,
        rowCount,
        recommended: "bar",
    };
}

describe("resolveRelationship", () => {
    it("narrow categorical for multiple-numeric-series with few rows", () => {
        expect(resolveRelationship("multiple-numeric-series", shape(5, 2))).toBe("comparison-categorical");
    });
    it("many-categorical when row count exceeds 7", () => {
        expect(resolveRelationship("multiple-numeric-series", shape(20, 2))).toBe("comparison-categorical-many");
    });
    it("time-trend for many-rows-trend", () => {
        expect(resolveRelationship("many-rows-trend", shape(12, 1))).toBe("comparison-time-trend");
    });
    it("composition-static for small share", () => {
        expect(resolveRelationship("small-positive-category-share", shape(4, 1))).toBe("composition-static");
    });
    it("kpi-single for numeric summary", () => {
        expect(resolveRelationship("numeric-summary", shape(1, 1))).toBe("kpi-single");
    });
    it("falls back to comparison-categorical for unknown reasons", () => {
        expect(resolveRelationship("garbage", shape(5, 1))).toBe("comparison-categorical");
    });
});

describe("buildChartRationale", () => {
    it("returns a KB-backed rationale for a known reason", () => {
        const r = buildChartRationale("many-rows-trend", "line", shape(12, 1));
        expect(r.fellBack).toBe(false);
        expect(r.relationship).toBe("comparison-time-trend");
        expect(r.why).toMatch(/Line chart/);
        expect(r.why).toMatch(/Continuous metric trend over time/);
        expect(r.avoid).toMatch(/Bar chart/);
    });
    it("offers sibling alternatives within the same family", () => {
        const r = buildChartRationale("multiple-numeric-series", "bar", shape(5, 2));
        // comparison-categorical → siblings should be other "comparison-*" rules
        expect(r.alternatives.length).toBeGreaterThanOrEqual(1);
        expect(r.alternatives.length).toBeLessThanOrEqual(3);
        for (const alt of r.alternatives) {
            expect(typeof alt.recommended).toBe("string");
            expect(typeof alt.when).toBe("string");
        }
    });
    it("never throws on unknown reasons; sets fellBack only when KB has no match", () => {
        const r = buildChartRationale("garbage", "bar", shape(5, 1));
        // resolves to comparison-categorical which IS in KB → not a fallback
        expect(r.fellBack).toBe(false);
    });
    it("explicit fallback when KB rule is missing for resolved relationship", () => {
        const r = buildChartRationale("many-rows-trend", "line", shape(12, 1), []);
        expect(r.fellBack).toBe(true);
        expect(r.relationship).toBe("unknown");
        expect(r.why).toMatch(/sensible default/);
    });
    it("frozen — alternatives array and the envelope itself are read-only", () => {
        const r = buildChartRationale("many-rows-trend", "line", shape(12, 1));
        expect(Object.isFrozen(r)).toBe(true);
        expect(Object.isFrozen(r.alternatives)).toBe(true);
        for (const alt of r.alternatives) expect(Object.isFrozen(alt)).toBe(true);
    });
});
