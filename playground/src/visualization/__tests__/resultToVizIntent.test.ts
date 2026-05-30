import { describe, expect, it } from "vitest";
import { resultToVizIntent } from "../resultToVizIntent";

describe("resultToVizIntent", () => {
    it("returns text when only narrative is present", () => {
        expect(resultToVizIntent({ id: "text", answer: "No rows, just insight." })).toEqual({
            kind: "text",
            reason: "answer-without-rows",
            rowCount: 0,
            columnCount: 0,
        });
    });

    it("returns table for row results with no numeric series", () => {
        expect(resultToVizIntent({
            id: "labels",
            schema: [{ name: "region" }, { name: "status" }],
            rows: [["West", "Good"]],
        })).toEqual({
            kind: "table",
            reason: "no-numeric-series",
            rowCount: 1,
            columnCount: 2,
        });
    });

    it("returns kpi for single-row single-measure results", () => {
        expect(resultToVizIntent({
            id: "kpi",
            schema: [{ name: "sales", type: "DECIMAL" }],
            rows: [[123]],
        })).toEqual({
            kind: "kpi",
            chartType: "kpi",
            reason: "single-row-single-measure",
            rowCount: 1,
            columnCount: 1,
        });
    });

    it("returns chart intent with auto-picked chart type for category measure rows", () => {
        const intent = resultToVizIntent({
            id: "chart",
            schema: [{ name: "category" }, { name: "sales" }],
            rows: [["A", 10], ["B", 6], ["C", 8]],
        });
        expect(intent.kind).toBe("chart");
        expect(intent.chartType).toBe("donut");
        expect(intent.reason).toBe("small-positive-category-share");
    });

    it("returns empty for malformed input coerced through a runtime boundary", () => {
        expect(resultToVizIntent({ id: "" } as never)).toEqual({
            kind: "empty",
            reason: "invalid-envelope",
            rowCount: 0,
            columnCount: 0,
        });
    });
});
