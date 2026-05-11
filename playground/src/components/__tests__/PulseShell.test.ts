// Cycle L — buildCategoricalFromBIEvents unit test.
//
// Lock down the BI-event → synthetic-DataView.categorical contract so
// regressions in the bridge don't silently empty the AI's context. The
// renderer / mount path isn't tested here (covered by AISidebar and the
// existing adapter conformance suites); this file just guards the
// pure-function shape conversion.

import { describe, it, expect } from "vitest";
import type { BIEvent } from "../../biPanel/BIAdapter";
import { buildCategoricalFromBIEvents } from "../PulseShell";

describe("buildCategoricalFromBIEvents", () => {
    it("returns null when no events have been captured", () => {
        expect(buildCategoricalFromBIEvents([], "powerbi")).toBeNull();
    });

    it("returns null when only events without payload-derived content fire", () => {
        const events: BIEvent[] = [
            { type: "loaded", payload: { url: "https://example.com" } },
        ];
        expect(buildCategoricalFromBIEvents(events, "powerbi")).toBeNull();
    });

    it("collapses filter-applied events into per-column union categories", () => {
        const events: BIEvent[] = [
            {
                type: "filter-applied",
                payload: {
                    filters: [
                        { target: { table: "Sales", column: "Region" }, values: ["East"] },
                        { target: { table: "Sales", column: "Category" }, values: ["Furniture"] },
                    ],
                },
            },
            {
                type: "filter-applied",
                payload: {
                    filters: [
                        { target: { table: "Sales", column: "Region" }, values: ["West"] },
                    ],
                },
            },
        ];
        const cat = buildCategoricalFromBIEvents(events, "powerbi");
        expect(cat).not.toBeNull();
        const region = cat!.categories.find(c => c.source.displayName === "Region");
        expect(region).toBeDefined();
        expect(new Set(region!.values)).toEqual(new Set(["East", "West"]));
        expect(region!.source.queryName).toBe("powerbi.Region");
        const cat2 = cat!.categories.find(c => c.source.displayName === "Category");
        expect(cat2!.values).toEqual(["Furniture"]);
    });

    it("captures the latest active page from page-changed events", () => {
        const events: BIEvent[] = [
            { type: "page-changed", payload: { pageId: "p1", pageName: "Sales Overview" } },
            { type: "page-changed", payload: { pageId: "p2", pageName: "Margins" } },
        ];
        const cat = buildCategoricalFromBIEvents(events, "tableau");
        const page = cat!.categories.find(c => c.source.displayName === "Active Page");
        expect(page).toBeDefined();
        expect(page!.values).toEqual(["Margins"]);
        expect(page!.source.queryName).toBe("tableau.__page");
    });

    it("captures selection data points and de-duplicates", () => {
        const events: BIEvent[] = [
            {
                type: "selection-made",
                payload: {
                    dataPoints: [
                        { values: ["East", 42] },
                        { values: ["East", 7] },
                    ],
                },
            },
        ];
        const cat = buildCategoricalFromBIEvents(events, "qlik");
        const sel = cat!.categories.find(c => c.source.displayName === "Selection");
        expect(sel).toBeDefined();
        expect(new Set(sel!.values)).toEqual(new Set(["East", 42, 7]));
    });

    it("vendor prefix flows into every category's queryName", () => {
        const events: BIEvent[] = [
            { type: "filter-applied", payload: { filters: [{ target: { column: "X" }, values: ["a"] }] } },
            { type: "page-changed", payload: { pageName: "p" } },
            { type: "selection-made", payload: { dataPoints: [{ values: ["s"] }] } },
        ];
        const cat = buildCategoricalFromBIEvents(events, "looker");
        for (const c of cat!.categories) {
            expect(c.source.queryName.startsWith("looker.")).toBe(true);
        }
    });

    it("ignores filters with empty target columns", () => {
        const events: BIEvent[] = [
            {
                type: "filter-applied",
                payload: { filters: [{ target: {}, values: ["x"] }] },
            },
        ];
        expect(buildCategoricalFromBIEvents(events, "powerbi")).toBeNull();
    });

    it("ignores null / undefined values inside filter value arrays", () => {
        const events: BIEvent[] = [
            {
                type: "filter-applied",
                payload: {
                    filters: [
                        { target: { column: "Country" }, values: ["IN", null, undefined, "US"] as Array<string | null | undefined> },
                    ],
                },
            },
        ];
        const cat = buildCategoricalFromBIEvents(events, "powerbi");
        const country = cat!.categories.find(c => c.source.displayName === "Country");
        expect(new Set(country!.values)).toEqual(new Set(["IN", "US"]));
    });
});
