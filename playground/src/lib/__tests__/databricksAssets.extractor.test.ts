// playground/src/lib/__tests__/databricksAssets.extractor.test.ts
//
// Locks extractMeasureNamesFromMetricView against schema drift. The
// Databricks UC metric-view detail endpoint returns each column's
// type metadata as a STRINGIFIED JSON inside type_json. If that
// payload shape ever changes (e.g., metric_view.type → metricView.kind)
// this test fails loudly instead of the auto-detect chip silently
// returning zero measures.

import { describe, expect, it } from "vitest";
import { extractMeasureNamesFromMetricView } from "../databricksAssets";

/** Build a column record matching the real UC payload shape. */
function makeColumn(
    name: string,
    viewType: "measure" | "dimension" | "unknown",
): { name: string; type_json: string } {
    return {
        name,
        type_json: JSON.stringify({
            name,
            type: "string",
            nullable: true,
            metadata: { "metric_view.type": viewType },
        }),
    };
}

describe("extractMeasureNamesFromMetricView", () => {
    it("returns measure column names, drops dimensions", () => {
        const detail = {
            item: {
                raw: {
                    columns: [
                        makeColumn("Order ID", "dimension"),
                        makeColumn("Sales", "measure"),
                        makeColumn("Region", "dimension"),
                        makeColumn("Profit", "measure"),
                    ],
                },
            },
        };
        expect(extractMeasureNamesFromMetricView(detail)).toEqual(["Sales", "Profit"]);
    });

    it("returns empty when no columns are measures", () => {
        const detail = {
            item: {
                raw: {
                    columns: [
                        makeColumn("Order ID", "dimension"),
                        makeColumn("Region", "dimension"),
                    ],
                },
            },
        };
        expect(extractMeasureNamesFromMetricView(detail)).toEqual([]);
    });

    it("handles missing item / raw / columns gracefully", () => {
        expect(extractMeasureNamesFromMetricView({})).toEqual([]);
        expect(extractMeasureNamesFromMetricView({ item: {} })).toEqual([]);
        expect(extractMeasureNamesFromMetricView({ item: { raw: {} } })).toEqual([]);
        expect(extractMeasureNamesFromMetricView({ item: { raw: { columns: [] } } })).toEqual([]);
    });

    it("skips malformed type_json without crashing", () => {
        const detail = {
            item: {
                raw: {
                    columns: [
                        { name: "Bad Column", type_json: "{ not valid json" },
                        makeColumn("Sales", "measure"),
                    ],
                },
            },
        };
        expect(extractMeasureNamesFromMetricView(detail)).toEqual(["Sales"]);
    });

    it("skips columns where metric_view.type is missing or unknown", () => {
        const detail = {
            item: {
                raw: {
                    columns: [
                        // No metadata at all
                        { name: "NoMeta", type_json: JSON.stringify({ name: "NoMeta", type: "string" }) },
                        // Unknown type
                        makeColumn("UnknownType", "unknown"),
                        // Real measure
                        makeColumn("Profit", "measure"),
                    ],
                },
            },
        };
        expect(extractMeasureNamesFromMetricView(detail)).toEqual(["Profit"]);
    });

    it("skips columns with empty or missing name", () => {
        const detail = {
            item: {
                raw: {
                    columns: [
                        makeColumn("", "measure"),
                        { type_json: JSON.stringify({ metadata: { "metric_view.type": "measure" } }) },
                        makeColumn("Sales", "measure"),
                    ],
                },
            },
        };
        expect(extractMeasureNamesFromMetricView(detail)).toEqual(["Sales"]);
    });
});
