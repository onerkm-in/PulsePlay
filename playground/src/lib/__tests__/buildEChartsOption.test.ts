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
        // Superseded contract (2026-07-29): mixed %-vs-magnitude no longer
        // shares one unit-less axis - the % series get their OWN axis so the
        // magnitude series cannot flatten them. Axis 0 = magnitudes (no %),
        // axis 1 = percents.
        const axes = (option as { yAxis?: Array<{ axisLabel?: { formatter?: (v: number) => string } }> }).yAxis;
        expect(Array.isArray(axes)).toBe(true);
        const magFmt = axes![0]?.axisLabel?.formatter;
        const pctFmt = axes![1]?.axisLabel?.formatter;
        expect(magFmt!(2_500_000)).not.toContain("%");
        expect(pctFmt!(97.5)).toContain("%");
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

describe("mixed-unit charts (2026-07-29 regression)", () => {
    // A % metric beside a billions metric shared one axis and one tooltip
    // unit: Net Sales rendered as "1902440231.0%" and every % series
    // flattened invisible. Percent series now live on a second axis and
    // every tooltip line wears its own unit.
    const columns = ["year", "order_fill_rate", "net_sales_usd"];
    const rows = [["2025", 98.25, 1810000000], ["2026", 99.06, 1902440231]];

    it("puts percent series on their own axis", () => {
        const opt = buildEChartsOption("column", columns, rows) as Record<string, never>;
        expect(Array.isArray(opt.yAxis)).toBe(true);
        expect((opt.yAxis as unknown[]).length).toBe(2);
        const series = opt.series as Array<{ name: string; yAxisIndex?: number }>;
        const pct = series.find(s => /fill rate/i.test(s.name));
        const usd = series.find(s => /net sales/i.test(s.name));
        expect(pct?.yAxisIndex).toBe(1);
        expect(usd?.yAxisIndex ?? 0).toBe(0);
    });

    it("formats each tooltip line with its OWN unit — never % on a currency", () => {
        const opt = buildEChartsOption("column", columns, rows) as Record<string, never>;
        const fmt = (opt.tooltip as { formatter?: (p: unknown) => string }).formatter;
        expect(typeof fmt).toBe("function");
        const html = fmt!([
            { seriesIndex: 0, seriesName: "Order Fill Rate", marker: "", axisValueLabel: "2026", value: 99.06 },
            { seriesIndex: 1, seriesName: "Net Sales Usd", marker: "", value: 1902440231 },
        ]);
        expect(html).toMatch(/99\.1\s?%|99\.06\s?%|99\.1%/);
        // the currency line must not carry a percent suffix
        const salesLine = html.split("<br/>").find(l => /Net Sales/i.test(l)) || "";
        expect(salesLine).not.toMatch(/%/);
    });
});

describe("OTIF is a percentage (2026-07-29 'where is otif?')", () => {
    it("plots otif on the percent axis with a % tooltip, not sub-pixel on magnitudes", () => {
        const opt = buildEChartsOption(
            "clustered-bar",
            ["year", "otif", "ghg_tco2e"],
            [["2025", 93.4, 2563504], ["2026", 94.5, 854419]],
        ) as Record<string, never>;
        const series = opt.series as Array<{ name: string; yAxisIndex?: number }>;
        const otif = series.find(s => /otif/i.test(s.name));
        expect(otif?.yAxisIndex).toBe(1); // the percent axis
    });
});
