// playground/src/visualization/__tests__/chartRationale.test.ts

import { describe, it, expect } from "vitest";
import {
    buildChartRationale,
    buildDataShapeNarrative,
    generateWarnings,
    resolveRelationship,
    summariseUnits,
    __internal__,
} from "../chartRationale";
import { analyzeColumnRanges, detectColumnUnit, type ChartKind, type DataShape } from "../chartAutoPick";

function shape(rowCount: number, numericColCount: number, recommended: ChartKind = "bar"): DataShape {
    return {
        series: [],
        clustered: [],
        numericColCount,
        rowCount,
        recommended,
    };
}

// ─── resolveRelationship ──────────────────────────────────────────────────

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

// ─── detectColumnUnit (column-name unit inference) ─────────────────────────

describe("detectColumnUnit", () => {
    it("identifies currency by $/USD/EUR markers", () => {
        expect(detectColumnUnit("Revenue USD")).toBe("currency");
        expect(detectColumnUnit("Total $ Sales")).toBe("currency");
        expect(detectColumnUnit("EUR Profit")).toBe("currency");
    });
    it("identifies currency by domain keyword (sales/revenue/profit/cost/price)", () => {
        expect(detectColumnUnit("Sales")).toBe("currency");
        expect(detectColumnUnit("Profit Margin")).toBe("percentage"); // 'margin' wins via %-ratio pattern
        expect(detectColumnUnit("Total Cost")).toBe("currency");
    });
    it("identifies percentages by %/rate/margin/share", () => {
        expect(detectColumnUnit("Conversion Rate")).toBe("percentage");
        expect(detectColumnUnit("Return %")).toBe("percentage");
        expect(detectColumnUnit("Market Share")).toBe("percentage");
    });
    it("identifies counts by orders/quantity/sessions/users", () => {
        expect(detectColumnUnit("Order Count")).toBe("count");
        expect(detectColumnUnit("Quantity")).toBe("count");
        expect(detectColumnUnit("Active Users")).toBe("count");
        expect(detectColumnUnit("Sessions")).toBe("count");
    });
    it("identifies durations by days/hours/elapsed", () => {
        expect(detectColumnUnit("Avg Days to Ship")).toBe("duration");
        expect(detectColumnUnit("Response Time Hours")).toBe("duration");
        expect(detectColumnUnit("Latency")).toBe("duration");
    });
    it("falls back to generic for unrecognised names", () => {
        expect(detectColumnUnit("Foo")).toBe("generic");
        expect(detectColumnUnit("")).toBe("generic");
        expect(detectColumnUnit("X42")).toBe("generic");
    });
});

// ─── analyzeColumnRanges + summariseUnits ──────────────────────────────────

describe("analyzeColumnRanges", () => {
    it("returns empty for empty inputs", () => {
        expect(analyzeColumnRanges([], [])).toEqual([]);
        expect(analyzeColumnRanges(["a"], [])).toEqual([]);
    });
    it("computes min/max + inferredUnit for each numeric column", () => {
        const cols = ["Revenue", "Margin %", "Days to Ship"];
        const rows = [[100, 0.15, 3], [200, 0.20, 5], [50, 0.10, 2]];
        const ranges = analyzeColumnRanges(cols, rows);
        expect(ranges.length).toBe(3);
        expect(ranges[0].colName).toBe("Revenue");
        expect(ranges[0].inferredUnit).toBe("currency");
        expect(ranges[0].minValue).toBe(50);
        expect(ranges[0].maxValue).toBe(200);
        expect(ranges[0].hasMixedSign).toBe(false);
        expect(ranges[1].inferredUnit).toBe("percentage");
        expect(ranges[2].inferredUnit).toBe("duration");
    });
    it("flags hasMixedSign when min < 0 < max", () => {
        const cols = ["Profit"];
        const rows = [[-50], [120], [80], [-10]];
        const ranges = analyzeColumnRanges(cols, rows);
        expect(ranges.length).toBe(1);
        expect(ranges[0].hasMixedSign).toBe(true);
    });
    it("skips rank/index columns", () => {
        const cols = ["Rank", "Sales"];
        const rows = [[1, 100], [2, 200], [3, 50]];
        const ranges = analyzeColumnRanges(cols, rows);
        expect(ranges.length).toBe(1);
        expect(ranges[0].colName).toBe("Sales");
    });
    it("skips non-numeric columns", () => {
        const cols = ["Region", "Sales"];
        const rows = [["East", 100], ["West", 200]];
        const ranges = analyzeColumnRanges(cols, rows);
        expect(ranges.length).toBe(1);
        expect(ranges[0].colName).toBe("Sales");
    });
});

describe("summariseUnits", () => {
    it("returns isMixed=false for homogeneous units", () => {
        const ranges = analyzeColumnRanges(
            ["Revenue", "Cost"],
            [[100, 50], [200, 80]],
        );
        const s = summariseUnits(ranges);
        expect(s.isMixed).toBe(false);
        expect(s.labels).toEqual(["dollars"]);
    });
    it("returns isMixed=true with all distinct unit labels", () => {
        const ranges = analyzeColumnRanges(
            ["Revenue", "Margin %", "Order Count"],
            [[100, 0.15, 20], [200, 0.20, 30]],
        );
        const s = summariseUnits(ranges);
        expect(s.isMixed).toBe(true);
        expect(new Set(s.labels)).toEqual(new Set(["dollars", "percentages", "counts"]));
    });
    it("ignores generic columns when computing mix", () => {
        const ranges = analyzeColumnRanges(
            ["foo", "bar"],
            [[1, 2], [3, 4]],
        );
        const s = summariseUnits(ranges);
        expect(s.isMixed).toBe(false);
    });
});

// ─── buildDataShapeNarrative ───────────────────────────────────────────────

describe("buildDataShapeNarrative", () => {
    it("includes the row count and numeric column count personalised", () => {
        const text = buildDataShapeNarrative("clustered-bar", shape(5, 9));
        expect(text).toMatch(/Your data has 5 rows and 9 numeric columns/);
    });
    it("uses singular when count is 1", () => {
        const text = buildDataShapeNarrative("bar", shape(1, 1));
        expect(text).toMatch(/1 row and 1 numeric column,/);
    });
    it("picks 'compare all the metrics side by side' for wide+short shapes", () => {
        const text = buildDataShapeNarrative("clustered-bar", shape(5, 9));
        expect(text).toMatch(/compare all the metrics side by side/);
    });
    it("picks 'trend' wording for long single-numeric series", () => {
        const text = buildDataShapeNarrative("line", shape(12, 1));
        expect(text).toMatch(/show the trend/);
    });
    it("picks composition wording for small positive shares", () => {
        const text = buildDataShapeNarrative("donut", shape(4, 1));
        expect(text).toMatch(/parts of the whole/);
    });
    it("recommends KPI for 1-2 row single-metric", () => {
        const text = buildDataShapeNarrative("kpi", shape(1, 1));
        expect(text).toMatch(/KPI/);
    });
    it("handles empty data gracefully", () => {
        expect(buildDataShapeNarrative("bar", shape(0, 0))).toMatch(/No numeric data/);
    });
});

// ─── generateWarnings (the 8 templates) ────────────────────────────────────

describe("generateWarnings", () => {
    it("returns no warnings for a clean clustered-bar case", () => {
        const ranges = analyzeColumnRanges(
            ["Region", "Revenue", "Profit", "Cost"],
            [["East", 100, 30, 70], ["West", 200, 60, 140]],
        );
        const warnings = generateWarnings("clustered-bar", shape(2, 3), ranges);
        // Same-unit (currency) columns, no mixed signs, small row count, not pie/donut/line
        expect(warnings.filter(w => w.severity === "warning").length).toBe(0);
    });

    it("flags mixed units when 2+ unit types present", () => {
        const ranges = analyzeColumnRanges(
            ["Revenue", "Margin %", "Order Count"],
            [[100, 0.15, 20], [200, 0.18, 35]],
        );
        const warnings = generateWarnings("clustered-bar", shape(2, 3), ranges);
        const mixed = warnings.find(w => w.title === "Mixed units detected");
        expect(mixed).toBeDefined();
        expect(mixed?.severity).toBe("warning");
        expect(mixed?.explanation).toMatch(/different units/);
        expect(mixed?.explanation).toMatch(/false correlations/);
        expect(mixed?.suggestedView).toMatch(/Matrix|Table/);
    });

    it("flags mixed signs when a column crosses zero", () => {
        const ranges = analyzeColumnRanges(
            ["Profit"],
            [[-50], [100], [200]],
        );
        const warnings = generateWarnings("bar", shape(3, 1), ranges);
        const ms = warnings.find(w => w.title === "Positive + negative values");
        expect(ms).toBeDefined();
        expect(ms?.severity).toBe("caution");
        expect(ms?.explanation).toMatch(/cross zero/);
    });

    it("flags too-many-rows for bar/column charts with >20 categories", () => {
        const ranges = analyzeColumnRanges(["Sales"], Array.from({ length: 25 }, (_, i) => [10 + i]));
        const warnings = generateWarnings("bar", shape(25, 1), ranges);
        const tm = warnings.find(w => w.title === "Many categories");
        expect(tm).toBeDefined();
        expect(tm?.suggestedView).toMatch(/Table/);
    });

    it("flags too-few-rows (1-2) when chart isn't a KPI tile", () => {
        const ranges = analyzeColumnRanges(["Sales"], [[100]]);
        const warnings = generateWarnings("bar", shape(1, 1), ranges);
        const tf = warnings.find(w => w.title === "Very few data points");
        expect(tf).toBeDefined();
        expect(tf?.suggestedView).toBe("KPI tile");
    });

    it("flags donut/pie when data has negative values", () => {
        const ranges = analyzeColumnRanges(["Net"], [[-10], [50], [80]]);
        const warnings = generateWarnings("donut", shape(3, 1), ranges);
        const dp = warnings.find(w => w.title === "Donut/pie can't show negative parts");
        expect(dp).toBeDefined();
        expect(dp?.severity).toBe("warning");
    });

    it("flags short series for a line chart", () => {
        const ranges = analyzeColumnRanges(["Sales"], [[10], [20], [30]]);
        const warnings = generateWarnings("line", shape(3, 1), ranges);
        const ss = warnings.find(w => w.title === "Short series for a trend");
        expect(ss).toBeDefined();
    });

    it("flags no-data when result is empty", () => {
        const warnings = generateWarnings("bar", shape(0, 0), []);
        expect(warnings.length).toBe(1);
        expect(warnings[0].title).toBe("No numeric data");
    });

    it("can return multiple warnings simultaneously (mixed units + mixed signs)", () => {
        const ranges = analyzeColumnRanges(
            ["Revenue", "Net Profit", "Margin %"],
            [[100, -10, 0.15], [200, 50, 0.20]],
        );
        const warnings = generateWarnings("clustered-bar", shape(2, 3), ranges);
        const titles = warnings.map(w => w.title);
        expect(titles).toContain("Mixed units detected");
        expect(titles).toContain("Positive + negative values");
    });
});

// ─── buildChartRationale (integration) ─────────────────────────────────────

describe("buildChartRationale", () => {
    it("returns a KB-backed rationale with personalised narrative", () => {
        const r = buildChartRationale(
            "many-rows-trend",
            "line",
            shape(12, 1, "line"),
            ["Date", "Sales"],
            [["2025-01-01", 100], ["2025-02-01", 120]],
        );
        expect(r.fellBack).toBe(false);
        expect(r.relationship).toBe("comparison-time-trend");
        expect(r.why).toMatch(/12 rows and 1 numeric column/);
        expect(r.avoid).toMatch(/Bar chart/);
        expect(r.warnings).toBeDefined();
    });

    it("populates warnings for mixed-units multi-numeric dataset", () => {
        const r = buildChartRationale(
            "multiple-numeric-series",
            "clustered-bar",
            shape(5, 9, "clustered-bar"),
            ["Region", "Revenue", "Profit", "Margin %", "Orders", "Cost", "AOV", "Returns %", "Discount", "Quantity"],
            [["East", 100, 30, 0.15, 20, 70, 5, 0.04, 0.1, 100]],
        );
        const titles = r.warnings.map(w => w.title);
        expect(titles).toContain("Mixed units detected");
    });

    it("offers sibling alternatives within the same family", () => {
        const r = buildChartRationale(
            "multiple-numeric-series",
            "bar",
            shape(5, 2, "bar"),
            ["Region", "Sales"],
            [["East", 100]],
        );
        expect(r.alternatives.length).toBeGreaterThanOrEqual(1);
        expect(r.alternatives.length).toBeLessThanOrEqual(3);
    });

    it("frozen envelope at every level (immutability contract)", () => {
        const r = buildChartRationale(
            "many-rows-trend",
            "line",
            shape(12, 1, "line"),
            ["Date", "Sales"],
            [["2025-01-01", 100]],
        );
        expect(Object.isFrozen(r)).toBe(true);
        expect(Object.isFrozen(r.alternatives)).toBe(true);
        expect(Object.isFrozen(r.warnings)).toBe(true);
        for (const alt of r.alternatives) expect(Object.isFrozen(alt)).toBe(true);
        for (const w of r.warnings) expect(Object.isFrozen(w)).toBe(true);
    });

    it("never throws on missing columns/rows arguments", () => {
        expect(() => buildChartRationale("many-rows-trend", "line", shape(12, 1, "line"))).not.toThrow();
    });

    it("falls back when KB has no matching rule", () => {
        const r = buildChartRationale("many-rows-trend", "line", shape(12, 1, "line"), [], [], []);
        expect(r.fellBack).toBe(true);
    });

    it("__internal__ helper exports are present (test-only surface)", () => {
        expect(typeof __internal__.detectColumnUnit).toBe("function");
        expect(typeof __internal__.summariseUnits).toBe("function");
    });
});
