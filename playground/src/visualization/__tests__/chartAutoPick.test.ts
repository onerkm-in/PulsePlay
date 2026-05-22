import { describe, expect, it } from "vitest";
import {
    CHART_OPTIONS,
    analyzeDataShape,
    chartAutoPick,
    detectViewIntent,
    isRankOrIndexColumn,
} from "../chartAutoPick";

describe("chartAutoPick", () => {
    it("keeps the chart option list grouped and frozen", () => {
        expect(Object.isFrozen(CHART_OPTIONS)).toBe(true);
        expect(CHART_OPTIONS.map(o => o.value)).toContain("bar");
        expect(CHART_OPTIONS.map(o => o.value)).toContain("clustered-bar");
        expect(CHART_OPTIONS.map(o => o.value)).toContain("kpi");
    });

    it("detects explicit chart/view intent from business phrasing", () => {
        expect(detectViewIntent("show me a table of sales")).toEqual({ viewMode: "table" });
        expect(detectViewIntent("show me the generated SQL")).toEqual({ viewMode: "sql" });
        expect(detectViewIntent("bar chart of sales")).toEqual({ viewMode: "chart", chartType: "bar" });
        expect(detectViewIntent("side by side bar by region")).toEqual({ viewMode: "chart", chartType: "clustered-bar" });
        expect(detectViewIntent("visualize this")).toEqual({ viewMode: "chart" });
    });

    it("ignores rank/index columns when recommending", () => {
        expect(isRankOrIndexColumn("rank", [1, 2, 3])).toBe(true);
        expect(isRankOrIndexColumn("Region", [1, 2, 3])).toBe(true);
        expect(isRankOrIndexColumn("Revenue", [100, 80, 65])).toBe(false);

        const shape = analyzeDataShape(
            ["rank", "category", "sales"],
            [[1, "Tech", 10], [2, "Furniture", 8], [3, "Office", 6]],
        );
        expect(shape.numericColCount).toBe(1);
        expect(shape.recommended).toBe("donut");
    });

    it("recommends line for many rows with one numeric series", () => {
        const pick = chartAutoPick(
            ["month", "sales"],
            [
                ["2026-01-01", 10],
                ["2026-02-01", 12],
                ["2026-03-01", 9],
                ["2026-04-01", 14],
                ["2026-05-01", 16],
                ["2026-06-01", 18],
                ["2026-07-01", 21],
            ],
        );
        expect(pick.chartType).toBe("line");
        expect(pick.reason).toBe("many-rows-trend");
        expect(pick.dataShape.series[0].label).toBe("Jan 2026");
    });

    it("recommends clustered-bar for multiple numeric measures", () => {
        const pick = chartAutoPick(
            ["region", "sales", "profit"],
            [["West", 10, 2], ["East", 12, 3]],
        );
        expect(pick.chartType).toBe("clustered-bar");
        expect(pick.reason).toBe("multiple-numeric-series");
        expect(pick.dataShape.clustered[0].values.map(v => v.name)).toEqual(["sales", "profit"]);
    });

    it("keeps formatter injection available for Pulse custom number rules", () => {
        const shape = analyzeDataShape(
            ["category", "sales"],
            [["Tech", 1250]],
            { formatNumber: value => `$${value}` },
        );
        expect(shape.series[0].tooltipParts?.[1]).toEqual({ col: "sales", val: "$1250" });
    });
});
