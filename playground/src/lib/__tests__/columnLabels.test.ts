// Locks in the 2026-07-24 KPI-label rules:
//   - raw SQL names humanize everywhere ("gross_margin_pct" → "Gross Margin %")
//   - the rule ALSO applies to already-spaced names ("Gross Margin Pct")
//   - USD renders as the $ symbol ("Net Sales ($)")
//   - finance abbreviation: Billion → B, Million → MM, Thousand → M

import { describe, expect, it } from "vitest";
import { humanizeColumnName, formatValueByUnit } from "../columnLabels";
import { detectColumnUnit } from "../../visualization/chartAutoPick";

describe("detectColumnUnit — snake_case names classify correctly", () => {
    it("detects percentage in snake_case (regression: \\b fails across underscores)", () => {
        expect(detectColumnUnit("gross_margin_pct")).toBe("percentage");
        expect(detectColumnUnit("order_fill_rate_pct")).toBe("percentage");
        expect(detectColumnUnit("GROSS_MARGIN_PCT")).toBe("percentage");
    });
    it("detects currency and counts in snake_case", () => {
        expect(detectColumnUnit("net_sales_usd")).toBe("currency");
        expect(detectColumnUnit("units_produced")).toBe("count");
    });
});

describe("humanizeColumnName — KPI label rules (unit lives on the VALUE)", () => {
    it("humanizes snake_case measure names and drops the unit token", () => {
        expect(humanizeColumnName("gross_margin_pct")).toBe("Gross Margin");
        expect(humanizeColumnName("order_fill_rate_pct")).toBe("Order Fill Rate");
        expect(humanizeColumnName("forecast_accuracy_pct")).toBe("Forecast Accuracy");
        expect(humanizeColumnName("net_sales_usd")).toBe("Net Sales");
    });

    it("applies the same rule to already-spaced names (all KPIs)", () => {
        expect(humanizeColumnName("Gross Margin Pct")).toBe("Gross Margin");
        expect(humanizeColumnName("OTIF Pct")).toBe("OTIF");
        expect(humanizeColumnName("Net Sales USD")).toBe("Net Sales");
    });

    it("passes through friendly labels without units", () => {
        expect(humanizeColumnName("Units Produced")).toBe("Units Produced");
    });
});

describe("formatValueByUnit — finance abbreviation (B / MM / M)", () => {
    it("currency: billions → B, millions → MM, thousands → M", () => {
        expect(formatValueByUnit(1_234_000_000, "currency", "axis")).toBe("$1.2B");
        expect(formatValueByUnit(248_703_706, "currency", "axis")).toBe("$248.7MM");
        expect(formatValueByUnit(300_000, "currency", "axis")).toBe("$300.0M");
    });

    it("counts follow the same convention", () => {
        expect(formatValueByUnit(58_463_079, "count", "axis")).toBe("58.5MM");
        expect(formatValueByUnit(2_100_000_000, "count", "axis")).toBe("2.1B");
        expect(formatValueByUnit(58_000, "count", "axis")).toBe("58.0M");
    });

    it("percentages stay percentages", () => {
        expect(formatValueByUnit(53.8, "percentage", "axis", "gross_margin_pct")).toBe("53.8%");
    });

    it("tooltips keep full precision for currency", () => {
        expect(formatValueByUnit(248_703_706, "currency", "tooltip")).toBe("$248,703,706");
    });

    it("small currency keeps 2 decimals so billions-scaled figures don't collapse", () => {
        // A value already scaled to billions (e.g. a `net_sales_billion` column):
        // whole-dollar rounding used to render 1.77 → "$2" and 1.90 → "$2",
        // hiding the real change. Now they stay distinct.
        expect(formatValueByUnit(1.77, "currency", "tooltip")).toBe("$1.77");
        expect(formatValueByUnit(1.9, "currency", "tooltip")).toBe("$1.90");
        expect(formatValueByUnit(1.03, "currency", "tooltip")).toBe("$1.03");
        // Consistent 2 decimals under $1000 so a column doesn't mix "$1.80" with "$1".
        expect(formatValueByUnit(1, "currency", "tooltip")).toBe("$1.00");
        expect(formatValueByUnit(5, "currency", "tooltip")).toBe("$5.00");
        // Large values are unaffected — still grouped whole dollars.
        expect(formatValueByUnit(248_703_706, "currency", "tooltip")).toBe("$248,703,706");
    });
});
