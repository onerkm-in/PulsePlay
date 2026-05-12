import { describe, expect, it } from "vitest";
import {
    buildRawDataSheetRows,
    sanitizeSheetName,
} from "../insightsExporters";

describe("insights raw data export helpers", () => {
    it("builds Excel rows from Genie query-result columns and rows", () => {
        expect(buildRawDataSheetRows({
            columns: ["Region", "Sales"],
            rows: [["East", 1200], ["West", 900]],
        })).toEqual([
            ["Region", "Sales"],
            ["East", 1200],
            ["West", 900],
        ]);
    });

    it("keeps section sheet names valid for Excel", () => {
        const taken = new Set<string>();
        expect(sanitizeSheetName("REVENUE / MARGIN: DRIVERS [RAW]", taken)).toBe("REVENUE MARGIN DRIVERS RAW");
    });
});
