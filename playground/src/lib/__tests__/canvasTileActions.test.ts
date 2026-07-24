import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSqlBackedTile } from "../canvasTileActions";
import { listCanvasTiles } from "../canvasTiles";

function mockPreview(body: unknown, ok = true) {
    return vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
    } as never);
}

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { vi.restoreAllMocks(); });

describe("createSqlBackedTile — deterministic SQL → canvas tile (no LLM)", () => {
    it("runs the SELECT via /sql/preview and pins a refreshable tile", async () => {
        const fetchSpy = mockPreview({ ok: true, columns: ["region", "sales"], rows: [["West", 10], ["East", 8]] });
        const res = await createSqlBackedTile({
            title: "Sales by region",
            sql: "SELECT region, sales FROM t",
            profile: "genie",
            renderAs: "bar",
        });
        expect(res.ok).toBe(true);
        // The only backend call is the preview — never an assistant/LLM route.
        const url = fetchSpy.mock.calls[0][0] as string;
        expect(url).toContain("/sql/preview");
        const tiles = listCanvasTiles();
        expect(tiles).toHaveLength(1);
        expect(tiles[0].kind).toBe("chart");
        expect(tiles[0].chartType).toBe("bar");
        expect(tiles[0].sqlQuery).toBe("SELECT region, sales FROM t");
        expect(tiles[0].connectorProfileId).toBe("genie");
        expect(tiles[0].rows).toHaveLength(2);
        // lastRefreshedAt set → renders as "live", not a stale snapshot.
        expect(tiles[0].lastRefreshedAt).toBeTypeOf("number");
    });

    it("defaults to a table tile when renderAs is omitted", async () => {
        mockPreview({ ok: true, columns: ["c"], rows: [[1]] });
        const res = await createSqlBackedTile({ title: "T", sql: "SELECT 1 AS c", profile: "genie" });
        expect(res.ok).toBe(true);
        const t = listCanvasTiles()[0];
        expect(t.kind).toBe("table");
        expect(t.chartType).toBeUndefined();
    });

    it("refuses with no connector, no SQL, or an errored/empty result — and pins nothing", async () => {
        expect((await createSqlBackedTile({ title: "x", sql: "SELECT 1", profile: "" })).ok).toBe(false);
        expect((await createSqlBackedTile({ title: "x", sql: "  ", profile: "genie" })).ok).toBe(false);
        expect(listCanvasTiles()).toHaveLength(0);

        mockPreview({ ok: false, error: "Table not found." });
        const errored = await createSqlBackedTile({ title: "x", sql: "SELECT * FROM nope", profile: "genie" });
        expect(errored.ok).toBe(false);
        expect(errored.error).toContain("Table not found");

        vi.restoreAllMocks();
        mockPreview({ ok: true, columns: [], rows: [] });
        const empty = await createSqlBackedTile({ title: "x", sql: "SELECT", profile: "genie" });
        expect(empty.ok).toBe(false);
        expect(listCanvasTiles()).toHaveLength(0);
    });
});
