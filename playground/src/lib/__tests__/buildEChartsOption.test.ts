// Axis-formatting regression: a chart mixing percentage metrics with a count
// metric must not stamp a "%" suffix on the count. Before the fix, a "top
// trends" answer (Order Fill Rate % + GHG tCO2e count on one clustered bar)
// rendered GHG's 2,500,000 on a percentage axis as "2,500,000.0%".
import { describe, it, expect } from "vitest";
import { buildEChartsOption } from "../buildEChartsOption";

function yAxisFormatter(option: unknown): (v: number) => string {
    const y = (option as { yAxis?: { axisLabel?: { formatter?: (v: number) => string } } }).yAxis;
    const fmt = y?.axisLabel?.formatter;
    if (typeof fmt !== "function") throw new Error("no yAxis formatter");
    return fmt;
}

describe("buildEChartsOption — mixed-unit axis", () => {
    it("uses a unit-less humanized axis when series units differ (no '%' on counts)", () => {
        // year | order_fill_rate_pct (%) | ghg_emissions (count)
        const option = buildEChartsOption(
            "clustered-bar",
            ["year", "order_fill_rate_pct", "ghg_emissions"],
            [["2024", 97.5, 2_523_750], ["2025", 98.2, 2_399_415], ["2026", 99.0, 1_138_707]],
        );
        expect(option).not.toBeNull();
        const fmt = yAxisFormatter(option);
        // The count value must NOT be labelled as a percentage.
        expect(fmt(2_500_000)).toBe("2.5MM");
        expect(fmt(2_500_000)).not.toContain("%");
        expect(fmt(97.5)).not.toContain("%");
    });

    it("keeps the unit suffix when all series share one unit", () => {
        // year | order_fill_rate_pct | otif_pct — both percentages.
        const option = buildEChartsOption(
            "clustered-bar",
            ["year", "order_fill_rate_pct", "otif_pct"],
            [["2024", 97.5, 92.4], ["2025", 98.2, 93.5]],
        );
        const fmt = yAxisFormatter(option);
        expect(fmt(97.5)).toBe("97.5%");
    });
});
