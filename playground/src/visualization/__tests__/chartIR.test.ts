// playground/src/visualization/__tests__/chartIR.test.ts
//
// UX-VIEWER-1.7b.1 — ChartIR + translator registry tests.
//
// Coverage:
//   1. chartIRFromHeuristic produces ChartIR shape that matches existing
//      chartAutoPick decisions (back-compat — no behavior regression).
//   2. Registry walks translators in order; first-match-wins.
//   3. Named-dispatch override skips detection.
//   4. Translator that detects but returns null falls through to next.
//   5. Heuristic fallback always paints something.

import { describe, it, expect, beforeEach } from "vitest";
import {
    chartIRFromHeuristic,
    type ChartIR,
    type ChartIRData,
} from "../chartIR";
import {
    registerChartTranslator,
    clearChartTranslators,
    resolveChartSpec,
    heuristicTranslator,
    type ChartTranslator,
} from "../translators/registry";

describe("chartIRFromHeuristic", () => {
    it("picks a line chart for >=6-row single-numeric series and labels axes from column names", () => {
        const data: ChartIRData = {
            columns: [
                { name: "month", type: "string" },
                { name: "revenue", type: "number" },
            ],
            rows: [
                ["Jan", 100],
                ["Feb", 120],
                ["Mar", 90],
                ["Apr", 140],
                ["May", 160],
                ["Jun", 180],
                ["Jul", 200],
            ],
        };
        const ir = chartIRFromHeuristic(data);
        expect(ir.mark).toBe("line");
        expect(ir.encodings.x?.field).toBe("month");
        expect(ir.encodings.x?.scaleType).toBe("categorical");
        expect(ir.encodings.y?.field).toBe("revenue");
        expect(ir.encodings.y?.scaleType).toBe("quantitative");
        expect(ir.sourceTranslator).toBe("heuristic");
        expect(ir.data).toBe(data);
    });

    it("picks a donut for 3-6 positive-value rows (matches existing chartAutoPick rule)", () => {
        const data: ChartIRData = {
            columns: [
                { name: "category", type: "string" },
                { name: "sales", type: "number" },
            ],
            rows: [
                ["Furniture", 100],
                ["Tech", 200],
                ["Office", 150],
                ["Other", 80],
            ],
        };
        const ir = chartIRFromHeuristic(data);
        expect(ir.mark).toBe("donut");
        expect(ir.sourceTranslator).toBe("heuristic");
    });

    it("picks bar (clustered-bar collapsed to bar) for multi-numeric data", () => {
        const data: ChartIRData = {
            columns: [
                { name: "region", type: "string" },
                { name: "sales", type: "number" },
                { name: "profit", type: "number" },
            ],
            rows: [
                ["East", 100, 20],
                ["West", 150, 40],
                ["South", 90, 10],
            ],
        };
        const ir = chartIRFromHeuristic(data);
        // chartAutoPick returns "clustered-bar"; chartIRFromHeuristic
        // folds it into the curated "bar" mark.
        expect(ir.mark).toBe("bar");
        expect(ir.sourceTranslator).toBe("heuristic");
    });

    it("handles empty data gracefully (no rows)", () => {
        const data: ChartIRData = {
            columns: [{ name: "x" }, { name: "y" }],
            rows: [],
        };
        const ir = chartIRFromHeuristic(data);
        expect(ir.mark).toBeDefined();
        expect(ir.sourceTranslator).toBe("heuristic");
        // No first-row inspection possible → encodings end up empty.
        // Renderer should degrade to an empty/empty-state chart, not crash.
        expect(ir.encodings.x).toBeUndefined();
        expect(ir.encodings.y).toBeUndefined();
    });
});

describe("translator registry — detection + ordering", () => {
    beforeEach(() => {
        clearChartTranslators();
    });

    it("falls back to heuristic when no other translator matches", () => {
        registerChartTranslator(heuristicTranslator);
        const data: ChartIRData = {
            columns: [{ name: "k" }, { name: "v" }],
            rows: [["a", 1], ["b", 2], ["c", 3]],
        };
        const ir = resolveChartSpec(null, data);
        expect(ir).not.toBeNull();
        expect(ir!.sourceTranslator).toBe("heuristic");
    });

    it("first matching translator wins (registration order, not best-fit)", () => {
        const firstCalls: number[] = [];
        const fakeTranslatorA: ChartTranslator = {
            name: "fake-a",
            detect: (raw) => typeof raw === "object" && raw !== null && "marker" in raw,
            translate: (_raw, data): ChartIR => {
                firstCalls.push(1);
                return {
                    mark: "bar",
                    encodings: {},
                    data,
                    sourceTranslator: "fake-a",
                };
            },
        };
        const fakeTranslatorB: ChartTranslator = {
            name: "fake-b",
            detect: () => true, // also matches
            translate: (_raw, data): ChartIR => ({
                mark: "line",
                encodings: {},
                data,
                sourceTranslator: "fake-b",
            }),
        };
        registerChartTranslator(fakeTranslatorA);
        registerChartTranslator(fakeTranslatorB);
        registerChartTranslator(heuristicTranslator);

        const data: ChartIRData = {
            columns: [{ name: "x" }],
            rows: [["a"]],
        };
        const ir = resolveChartSpec({ marker: true }, data);
        expect(ir!.sourceTranslator).toBe("fake-a");
        expect(firstCalls).toEqual([1]);
    });

    it("translator that detects but returns null falls through to next", () => {
        const detectButFail: ChartTranslator = {
            name: "detect-but-null",
            detect: () => true,
            translate: () => null, // detect but refuse to translate
        };
        registerChartTranslator(detectButFail);
        registerChartTranslator(heuristicTranslator);

        const data: ChartIRData = {
            columns: [{ name: "k" }, { name: "v" }],
            rows: [["a", 1]],
        };
        const ir = resolveChartSpec({ anything: true }, data);
        expect(ir).not.toBeNull();
        expect(ir!.sourceTranslator).toBe("heuristic");
    });
});

describe("translator registry — named-dispatch override", () => {
    beforeEach(() => {
        clearChartTranslators();
        registerChartTranslator({
            name: "fake-helios",
            detect: () => false, // would normally skip
            translate: (_raw, data): ChartIR => ({
                mark: "heatmap",
                encodings: {},
                data,
                sourceTranslator: "fake-helios",
            }),
        });
        registerChartTranslator(heuristicTranslator);
    });

    it("named override skips detection and uses the named translator", () => {
        const data: ChartIRData = {
            columns: [{ name: "x" }],
            rows: [["a"]],
        };
        // fake-helios.detect returns false, so default dispatch would
        // skip it. The named-override forces it.
        const ir = resolveChartSpec({ shape: "irrelevant" }, data, { translator: "fake-helios" });
        expect(ir).not.toBeNull();
        expect(ir!.sourceTranslator).toBe("fake-helios");
        expect(ir!.mark).toBe("heatmap");
    });

    it("named override returns null when the translator isn't registered", () => {
        const data: ChartIRData = {
            columns: [{ name: "x" }],
            rows: [["a"]],
        };
        const ir = resolveChartSpec({}, data, { translator: "unknown-translator" });
        expect(ir).toBeNull();
    });

    it("named override does NOT fall through to other translators", () => {
        const data: ChartIRData = {
            columns: [{ name: "x" }],
            rows: [["a"]],
        };
        // Even though "heuristic" would normally match (detect: () => true),
        // a named override of "missing" returns null. The caller can then
        // choose to retry without the override.
        const ir = resolveChartSpec({}, data, { translator: "missing" });
        expect(ir).toBeNull();
    });
});

describe("translator registry — idempotent registration", () => {
    beforeEach(() => {
        clearChartTranslators();
    });

    it("re-registering by name replaces in place (HMR / re-import safe)", () => {
        registerChartTranslator({
            name: "x",
            detect: () => true,
            translate: (_raw, data) => ({
                mark: "bar",
                encodings: {},
                data,
                sourceTranslator: "x-v1",
            }),
        });
        registerChartTranslator({
            name: "x",
            detect: () => true,
            translate: (_raw, data) => ({
                mark: "line",
                encodings: {},
                data,
                sourceTranslator: "x-v2",
            }),
        });

        const data: ChartIRData = {
            columns: [{ name: "k" }],
            rows: [["a"]],
        };
        const ir = resolveChartSpec({}, data);
        expect(ir!.sourceTranslator).toBe("x-v2");
        expect(ir!.mark).toBe("line");
    });
});
