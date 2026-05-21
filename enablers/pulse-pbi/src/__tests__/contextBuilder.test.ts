import { describe, it, expect } from "vitest";
import { buildContext } from "../contextBuilder";

// Helper to create a minimal DataView stub with only what buildContext uses.
function makeDataView(
    categories: { name: string; values: any[] }[] = [],
    valueSeries: { name: string; values: any[] }[] = []
): any {
    return {
        categorical: {
            categories: categories.map(c => ({
                source: { displayName: c.name },
                values: c.values
            })),
            values: valueSeries.map(v => ({
                source: { displayName: v.name },
                values: v.values
            }))
        }
    };
}

describe("buildContext", () => {
    describe("empty / missing input", () => {
        it("returns an empty summary when dataView is undefined", () => {
            const result = buildContext(undefined, null);
            expect(result.hasSelection).toBe(false);
            expect(result.contextText).toBe("");
            expect(result.dimensions).toEqual({});
            expect(result.measures).toEqual({});
        });

        it("returns an empty summary when dataView has no categorical block", () => {
            const result = buildContext({} as any, null);
            expect(result.hasSelection).toBe(false);
            expect(result.contextText).toBe("");
        });

        it("includes fallback message when no dimensions or measures are present", () => {
            const result = buildContext(makeDataView([], []), null);
            expect(result.contextText).toContain("No selection - answering across full dataset");
        });
    });

    describe("dimension extraction", () => {
        it("captures all unique dimension values", () => {
            const result = buildContext(makeDataView([{ name: "Region", values: ["East", "West", "North"] }]), null);
            expect(result.dimensions["Region"]).toEqual(["East", "West", "North"]);
            expect(result.dimensionCounts["Region"]).toBe(3);
        });

        it("deduplicates dimension values", () => {
            const result = buildContext(makeDataView([{ name: "Region", values: ["East", "East", "West"] }]), null);
            expect(result.dimensions["Region"]).toEqual(["East", "West"]);
        });

        it("filters null and undefined dimension values", () => {
            const result = buildContext(makeDataView([{ name: "Region", values: ["East", null, undefined, "West"] }]), null);
            expect(result.dimensions["Region"]).toEqual(["East", "West"]);
        });

        it("includes dimension values in context text", () => {
            const result = buildContext(makeDataView([{ name: "Segment", values: ["Consumer", "Corporate"] }]), null);
            expect(result.contextText).toContain("Segment: Consumer, Corporate");
        });

        it("truncates dimensions beyond 12 and appends overflow count", () => {
            const values = Array.from({ length: 15 }, (_, i) => `Item${i}`);
            const result = buildContext(makeDataView([{ name: "Product", values }]), null);
            expect(result.contextText).toContain("(+3 more)");
        });

        it("does not append overflow indicator when values are exactly 12", () => {
            const values = Array.from({ length: 12 }, (_, i) => `Item${i}`);
            const result = buildContext(makeDataView([{ name: "Product", values }]), null);
            expect(result.contextText).not.toContain("more)");
        });

        it("uses 'Dimension' as fallback name when source displayName is missing", () => {
            const dv = {
                categorical: {
                    categories: [{ values: ["A", "B"] }]
                }
            };
            const result = buildContext(dv as any, null);
            expect(result.dimensions["Dimension"]).toEqual(["A", "B"]);
        });
    });

    describe("highlight (selection) handling", () => {
        it("sets hasSelection true when highlights are present", () => {
            const dv = makeDataView([{ name: "Region", values: ["East", "West", "North"] }]);
            const result = buildContext(dv, [null, "West", null] as any);
            expect(result.hasSelection).toBe(true);
        });

        it("includes only highlighted values in dimensions", () => {
            const dv = makeDataView([{ name: "Region", values: ["East", "West", "North"] }]);
            const result = buildContext(dv, [null, "West", null] as any);
            expect(result.dimensions["Region"]).toEqual(["West"]);
        });

        it("excludes a dimension entirely when none of its values are highlighted", () => {
            const dv = makeDataView([{ name: "Region", values: ["East", "West"] }]);
            const result = buildContext(dv, [null, null] as any);
            expect(result.dimensions["Region"]).toBeUndefined();
        });
    });

    describe("measure aggregation", () => {
        it("sums numeric measure values", () => {
            const dv = makeDataView([], [{ name: "Sales", values: [100, 200, 300] }]);
            const result = buildContext(dv, null);
            expect(result.measures["Sales"]).toBe(600);
        });

        it("rounds measure totals to 2 decimal places", () => {
            const dv = makeDataView([], [{ name: "Amount", values: [1.005, 2.005] }]);
            const result = buildContext(dv, null);
            expect(result.measures["Amount"]).toBe(Math.round((1.005 + 2.005) * 100) / 100);
        });

        it("ignores non-numeric measure values", () => {
            const dv = makeDataView([], [{ name: "Sales", values: [100, "n/a", null, 50] }]);
            const result = buildContext(dv, null);
            expect(result.measures["Sales"]).toBe(150);
        });

        it("formats values under 1K with two decimal places", () => {
            const dv = makeDataView([], [{ name: "Revenue", values: [999.5] }]);
            const result = buildContext(dv, null);
            expect(result.contextText).toContain("Revenue: 999.50");
        });

        it("formats values 1K–999K with K suffix", () => {
            const dv = makeDataView([], [{ name: "Revenue", values: [50000] }]);
            const result = buildContext(dv, null);
            expect(result.contextText).toContain("Revenue: 50.0K");
        });

        it("formats values >= 1M with M suffix", () => {
            const dv = makeDataView([], [{ name: "Revenue", values: [2500000] }]);
            const result = buildContext(dv, null);
            expect(result.contextText).toContain("Revenue: 2.50M");
        });

        it("uses 'Measure' as fallback name when source displayName is missing", () => {
            const dv = {
                categorical: {
                    values: [{ values: [42] }]
                }
            };
            const result = buildContext(dv as any, null);
            expect(result.measures["Measure"]).toBe(42);
        });
    });

    describe("context text", () => {
        it("starts with the Power BI Context header", () => {
            const dv = makeDataView([{ name: "Region", values: ["East"] }]);
            const result = buildContext(dv, null);
            expect(result.contextText).toMatch(/^\[Power BI Context\]/);
        });

        it("includes both dimensions and measures", () => {
            const dv = makeDataView(
                [{ name: "Region", values: ["East"] }],
                [{ name: "Sales", values: [1000] }]
            );
            const result = buildContext(dv, null);
            expect(result.contextText).toContain("Region:");
            expect(result.contextText).toContain("Sales:");
        });
    });
});
