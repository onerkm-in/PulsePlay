import { describe, expect, it } from "vitest";
import {
    CHART_OPTIONS,
    analyzeDataShape,
    chartAutoPick,
    detectViewIntent,
    formatCategoryLabel,
    formatChartDate,
    isRankOrIndexColumn,
    isTemporalDimensionColumn,
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

describe("time-dimension columns are categories, not measures", () => {
    it("classifies year/month/quarter names as temporal dimensions", () => {
        expect(isTemporalDimensionColumn("year")).toBe(true);
        expect(isTemporalDimensionColumn("YEAR")).toBe(true);
        expect(isTemporalDimensionColumn("month")).toBe(true);
        expect(isTemporalDimensionColumn("quarter")).toBe(true);
        expect(isTemporalDimensionColumn("fiscal_year")).toBe(true);
    });

    it("does NOT misclassify measures that merely mention a period", () => {
        expect(isTemporalDimensionColumn("gross_margin_pct")).toBe(false);
        expect(isTemporalDimensionColumn("yoy_growth_rate")).toBe(false);
        expect(isTemporalDimensionColumn("year_over_year_pct")).toBe(false);
        expect(isTemporalDimensionColumn("sales")).toBe(false);
    });

    it("uses year as the category axis, not a plotted series (the bug)", () => {
        const columns = ["year", "gross_margin_pct", "forecast_accuracy_pct"];
        const rows = [
            ["2024", "53.8", "91.5"],
            ["2025", "54.1", "89.4"],
            ["2026", "53.9", "91.5"],
            ["2027", "53.9", "92.8"],
        ];
        const shape = analyzeDataShape(columns, rows);
        // Only the two percentage columns are measures — year is NOT one.
        expect(shape.numericColCount).toBe(2);
        // Category labels come from the year column, not "Row 1".
        expect(shape.clustered.map(c => c.label)).toEqual(["2024", "2025", "2026", "2027"]);
        // The plotted series are the two percentages (max ~92), never ~2024.
        const maxPlotted = Math.max(...shape.clustered.flatMap(c => c.values.map(v => v.value)));
        expect(maxPlotted).toBeLessThan(200);
        expect(shape.clustered[0].values.map(v => v.name)).toEqual(["gross_margin_pct", "forecast_accuracy_pct"]);
    });
});

describe("formatCategoryLabel — ISO period timestamps collapse to the column's granularity", () => {
    it("renders a year column's ISO timestamp as the bare year", () => {
        expect(formatCategoryLabel("year", "2024-01-01T00:00:00.000Z")).toBe("2024");
        expect(formatCategoryLabel("fiscal_year", "2025-01-01")).toBe("2025");
    });

    it("renders quarter and month columns at their granularity", () => {
        expect(formatCategoryLabel("quarter", "2024-04-01T00:00:00.000Z")).toBe("Q2 2024");
        expect(formatCategoryLabel("month", "2024-03-01T00:00:00.000Z")).toBe("Mar 2024");
    });

    it("uses UTC — a Z-midnight timestamp never shifts to the prior year", () => {
        expect(formatCategoryLabel("year", "2024-01-01T00:00:00.000Z")).toBe("2024");
        expect(formatChartDate("2024-01-01T00:00:00.000Z")).toBe("Jan 2024");
    });

    it("passes non-date values through unchanged (no '2,024' grouping)", () => {
        expect(formatCategoryLabel("year", 2024)).toBe("2024");
        expect(formatCategoryLabel("region", "EMEA")).toBe("EMEA");
        expect(formatCategoryLabel("year", null)).toBe("");
    });
});
