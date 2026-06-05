// playground/src/multipane/__tests__/dashboardAutoSeed.test.ts
//
// Auto-seed orchestrator — closes the "empty Dashboard" gap. Guarantees:
//   - starter questions derive from the probe's measures + dimension columns
//   - only multi-row (real chart) results get pinned; single-row are skipped
//   - the maybeAutoSeed guards: flag off / non-PBI / non-empty / already-seeded
//   - seeds at most once per profile (so "Clear all" stays cleared)

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildStarterQuestions,
    autoSeedDashboard,
    maybeAutoSeedDashboard,
    wasDashboardSeeded,
} from "../dashboardAutoSeed";
import { listCanvasTiles, clearCanvasTiles, addCanvasTile } from "../../lib/canvasTiles";
import { setFeatureFlag, resetFeatureFlags } from "../../featureFlags";

const PROBE = {
    connectorType: "powerbi-semantic-model",
    declaredKpis: [{ name: "Total Sales" }, { name: "Total Profit" }],
    schema: {
        tables: [
            { name: "DimCustomer", columns: ["customer_id", "customer_name", "segment"] },
            { name: "DimDate", columns: ["date_key", "year", "month"] },
            { name: "DimProduct", columns: ["product_id", "category"] },
            { name: "_Measures", columns: ["_key"] },
            { name: "FactOrders", columns: ["row_id", "order_id"] },
        ],
    },
};

// A fake proxy: by-dimension questions return >=2 rows; a single-measure total
// returns 1 row (must be skipped). Lets us assert the >=2-row filter.
function makeFetch(multiRow = true) {
    return vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body || "{}");
        const q = String(body.content || "");
        const isByDim = / by /i.test(q);
        return {
            ok: true,
            json: async () => isByDim && multiRow
                ? { queryResult: { columns: ["Dim", "Total Sales"], rows: [["A", 10], ["B", 20], ["C", 30]] }, dax: "EVALUATE ..." }
                : { queryResult: { columns: ["Metric", "Value"], rows: [["Total", 100]] } },
        };
    });
}

beforeEach(() => {
    localStorage.clear();
    clearCanvasTiles();
    resetFeatureFlags();
});

describe("buildStarterQuestions", () => {
    it("derives '<measure> by <dimension>' from probe measures + dim columns", () => {
        const qs = buildStarterQuestions(PROBE);
        expect(qs.length).toBeGreaterThanOrEqual(2);
        const text = qs.map(q => q.question).join(" | ");
        expect(text).toMatch(/Total Sales by year/i);     // time dimension first
        expect(text).toMatch(/Total Sales by segment/i);  // a category split
        // id/key/name columns and Fact/_Measures tables are excluded
        expect(text).not.toMatch(/customer_id|date_key|_key|order_id|customer_name/i);
    });

    it("returns [] when the probe has no measures or no dimensions", () => {
        expect(buildStarterQuestions({ declaredKpis: [], schema: { tables: [] } })).toEqual([]);
        expect(buildStarterQuestions(null)).toEqual([]);
    });
});

describe("autoSeedDashboard", () => {
    it("pins only multi-row results, capped at max", async () => {
        const added = await autoSeedDashboard({ profile: "powerbi-dwd", probe: PROBE, fetchImpl: makeFetch(true), max: 2 });
        expect(added).toBe(2);
        const tiles = listCanvasTiles();
        expect(tiles).toHaveLength(2);
        expect(tiles[0].kind).toBe("chart");
        expect(tiles[0].rows.length).toBeGreaterThanOrEqual(2);
        expect(tiles[0].connectorProfileId).toBe("powerbi-dwd");
    });

    it("pins nothing when every result is single-row", async () => {
        const added = await autoSeedDashboard({ profile: "powerbi-dwd", probe: PROBE, fetchImpl: makeFetch(false), max: 3 });
        expect(added).toBe(0);
        expect(listCanvasTiles()).toHaveLength(0);
    });
});

describe("maybeAutoSeedDashboard — guards", () => {
    it("seeds when flag ON + PBI + empty + not-seeded", async () => {
        setFeatureFlag("dashboardAutoSeed", true);
        const added = await maybeAutoSeedDashboard({ profile: "powerbi-dwd", connectorType: "powerbi-semantic-model", probe: PROBE, fetchImpl: makeFetch(true), max: 3 });
        expect(added).toBeGreaterThan(0);
        expect(wasDashboardSeeded("powerbi-dwd")).toBe(true);
    });

    it("does nothing when the flag is OFF", async () => {
        setFeatureFlag("dashboardAutoSeed", false);
        const added = await maybeAutoSeedDashboard({ profile: "powerbi-dwd", connectorType: "powerbi-semantic-model", probe: PROBE, fetchImpl: makeFetch(true) });
        expect(added).toBe(0);
        expect(listCanvasTiles()).toHaveLength(0);
    });

    it("does nothing for a non-PBI connector", async () => {
        setFeatureFlag("dashboardAutoSeed", true);
        const added = await maybeAutoSeedDashboard({ profile: "foundation", connectorType: "foundation-model", probe: PROBE, fetchImpl: makeFetch(true) });
        expect(added).toBe(0);
    });

    it("does nothing when the canvas already has tiles", async () => {
        setFeatureFlag("dashboardAutoSeed", true);
        addCanvasTile({ title: "existing", kind: "chart", columns: ["a", "b"], rows: [[1, 2]] });
        const added = await maybeAutoSeedDashboard({ profile: "powerbi-dwd", connectorType: "powerbi-semantic-model", probe: PROBE, fetchImpl: makeFetch(true) });
        expect(added).toBe(0);
    });

    it("seeds at most once per profile (Clear all stays cleared)", async () => {
        setFeatureFlag("dashboardAutoSeed", true);
        const f = makeFetch(true);
        await maybeAutoSeedDashboard({ profile: "powerbi-dwd", connectorType: "powerbi-semantic-model", probe: PROBE, fetchImpl: f, max: 3 });
        clearCanvasTiles();   // user clears the canvas
        const added2 = await maybeAutoSeedDashboard({ profile: "powerbi-dwd", connectorType: "powerbi-semantic-model", probe: PROBE, fetchImpl: f, max: 3 });
        expect(added2).toBe(0);                 // not re-seeded
        expect(listCanvasTiles()).toHaveLength(0);
    });

    it("a FAILED seed (0 tiles) does NOT permanently block — it retries next time", async () => {
        setFeatureFlag("dashboardAutoSeed", true);
        // First attempt: backend is down → every query single-row → 0 tiles pinned.
        const added1 = await maybeAutoSeedDashboard({ profile: "powerbi-dwd", connectorType: "powerbi-semantic-model", probe: PROBE, fetchImpl: makeFetch(false), max: 3 });
        expect(added1).toBe(0);
        expect(wasDashboardSeeded("powerbi-dwd")).toBe(false);   // marker RELEASED, not stuck
        // Backend recovers → the retry succeeds (would have been blocked by the old mark-before-await bug).
        const added2 = await maybeAutoSeedDashboard({ profile: "powerbi-dwd", connectorType: "powerbi-semantic-model", probe: PROBE, fetchImpl: makeFetch(true), max: 3 });
        expect(added2).toBeGreaterThan(0);
        expect(wasDashboardSeeded("powerbi-dwd")).toBe(true);
    });
});
