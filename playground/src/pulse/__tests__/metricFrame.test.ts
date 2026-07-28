import { describe, expect, it } from "vitest";
import {
    buildMetricFrame,
    formatMetricFrame,
    formatMagnitude,
    renderMetricFrameBlock,
} from "../metricFrame";

/**
 * Fixture captured from the LIVE genie-scm-poc space on 2026-07-28, verbatim
 * (proxy /assistant/conversations, attachments[0].query.result normalised by
 * genie.ts into {columns, rows}). Values arrive as scientific-notation STRINGS,
 * which is exactly the detail a hand-written fixture would have got wrong.
 */
const LIVE = {
    columns: ["Metric", "Period", "Value"],
    rows: [
        ["Net Sales USD", "Jan-Jun 2025", "1.8953528300799997E9"],
        ["Net Sales USD", "Jan-Jun 2026", "1.9880321987100003E9"],
        ["Gross Margin Pct", "Jan-Jun 2025", "54.85525387408295"],
        ["Gross Margin Pct", "Jan-Jun 2026", "56.03030090472333"],
    ],
};

describe("buildMetricFrame — live SCM shape", () => {
    it("reads the tall Metric/Period/Value result and picks current vs prior", () => {
        const frame = buildMetricFrame(LIVE);
        expect(frame).toHaveLength(2);

        const sales = frame.find(r => r.key === "Net Sales USD")!;
        expect(sales.currentPeriod).toBe("Jan-Jun 2026");
        expect(sales.priorPeriod).toBe("Jan-Jun 2025");
        expect(sales.current).toBeCloseTo(1988032198.71, 2);
        expect(sales.prior).toBeCloseTo(1895352830.08, 2);
        expect(sales.isRatio).toBe(false);
        // the number the two sections disagreed about
        expect(sales.relDelta * 100).toBeCloseTo(4.8899, 3);
    });

    it("treats a margin as a ratio and reports its absolute move", () => {
        const gm = buildMetricFrame(LIVE).find(r => r.key === "Gross Margin Pct")!;
        expect(gm.isRatio).toBe(true);
        expect(gm.absDelta).toBeCloseTo(1.175, 3);
    });

    it("does not depend on row order", () => {
        const shuffled = { ...LIVE, rows: [...LIVE.rows].reverse() };
        const a = buildMetricFrame(LIVE).find(r => r.key === "Net Sales USD")!;
        const b = buildMetricFrame(shuffled).find(r => r.key === "Net Sales USD")!;
        expect(b.current).toBe(a.current);
        expect(b.prior).toBe(a.prior);
    });

    it("infers the three roles when headers are unconventional", () => {
        const frame = buildMetricFrame({
            columns: ["kpi_label", "when", "amt"],
            rows: [
                ["Revenue", "FY2025", 100],
                ["Revenue", "FY2026", 125],
            ],
        });
        expect(frame).toHaveLength(1);
        expect(frame[0].current).toBe(125);
        expect(frame[0].relDelta).toBeCloseTo(0.25, 6);
    });
});

describe("buildMetricFrame — degrades instead of guessing", () => {
    it.each([
        ["null", null],
        ["undefined", undefined],
        ["no rows", { columns: ["Metric", "Period", "Value"], rows: [] }],
        ["single period", { columns: ["Metric", "Period", "Value"], rows: [["S", "2026", 1]] }],
        ["no numeric column", { columns: ["a", "b"], rows: [["x", "y"], ["p", "q"]] }],
    ])("returns an empty frame for %s", (_label, input) => {
        expect(buildMetricFrame(input as never)).toEqual([]);
    });

    it("skips a measure that lacks a comparison period", () => {
        const frame = buildMetricFrame({
            columns: ["Metric", "Period", "Value"],
            rows: [
                ["Complete", "2025", 10],
                ["Complete", "2026", 12],
                ["Lonely", "2026", 5],
            ],
        });
        expect(frame.map(r => r.key)).toEqual(["Complete"]);
    });
});

describe("formatting follows the project number convention", () => {
    it("promotes the unit instead of comma-grouping the mantissa", () => {
        // the exact defect: $1,031.41 MN should have been $1.03 B
        expect(formatMagnitude(1031411004.9, true)).toBe("$1.03 B");
        expect(formatMagnitude(989340570.71, true)).toBe("$989.34 MN");
        expect(formatMagnitude(50000, true)).toBe("$50.00 M");
        expect(formatMagnitude(1138707, false)).toBe("1.14 MN");
        expect(formatMagnitude(-65420000, true)).toBe("-$65.42 MN");
    });

    it("never emits a thousands separator before a unit", () => {
        for (const v of [1e3, 9.99e5, 1e6, 1.0314e9, 5e12]) {
            expect(formatMagnitude(v, true)).not.toMatch(/,/);
        }
    });

    it("uses % for a percentage-metric change, never pp", () => {
        const [, gm] = formatMetricFrame(buildMetricFrame(LIVE));
        expect(gm.currentText).toBe("56.03 %");
        expect(gm.priorText).toBe("54.86 %");
        expect(gm.deltaText).toBe("+1.18 %");
        expect(gm.deltaText).not.toContain("pp");
    });

    it("carries both the absolute and relative move for a currency metric", () => {
        const [sales] = formatMetricFrame(buildMetricFrame(LIVE));
        expect(sales.currentText).toBe("$1.99 B");
        expect(sales.priorText).toBe("$1.90 B");
        expect(sales.deltaText).toBe("$92.68 MN (+4.89 %)");
    });
});

describe("renderMetricFrameBlock", () => {
    it("emits an authoritative block with the period basis", () => {
        const block = renderMetricFrameBlock(buildMetricFrame(LIVE));
        expect(block).toContain("PRE-COMPUTED METRIC FRAME (authoritative)");
        expect(block).toContain("NEVER derive a change by subtracting two displayed values");
        expect(block).toContain("| Net Sales USD | $1.99 B | $1.90 B | $92.68 MN (+4.89 %) |");
        expect(block).toContain("Period basis: Jan-Jun 2026 vs Jan-Jun 2025.");
    });

    it("is empty when there is no frame, so the anchor can be stripped", () => {
        expect(renderMetricFrameBlock([])).toBe("");
    });
});
