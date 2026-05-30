import { describe, it, expect, beforeEach } from "vitest";
import {
    listCanvasTiles,
    addCanvasTile,
    removeCanvasTile,
    updateCanvasTile,
    clearCanvasTiles,
    canvasTileCount,
    CANVAS_TILES_EVENT,
} from "../canvasTiles";

beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
});

describe("canvasTiles store", () => {
    it("adds, lists, and counts tiles in pin order", () => {
        expect(listCanvasTiles()).toEqual([]);
        const id1 = addCanvasTile({ title: "A", kind: "chart", chartType: "donut", columns: ["region", "sales"], rows: [["West", 1]] });
        const id2 = addCanvasTile({ title: "B", kind: "table", columns: ["c"], rows: [[1]] });
        const tiles = listCanvasTiles();
        expect(tiles.map(t => t.id)).toEqual([id1, id2]);
        expect(canvasTileCount()).toBe(2);
        expect(tiles[0].createdAt).toBeTypeOf("number");
    });

    it("carries SQL + connector provenance for a future live refresh", () => {
        addCanvasTile({ title: "Q", kind: "chart", chartType: "bar", columns: ["a"], rows: [[1]], sqlQuery: "SELECT 1", connectorProfileId: "default", sourceQuestion: "what?" });
        const t = listCanvasTiles()[0];
        expect(t.sqlQuery).toBe("SELECT 1");
        expect(t.connectorProfileId).toBe("default");
        expect(t.sourceQuestion).toBe("what?");
    });

    it("removes and updates tiles", () => {
        const id = addCanvasTile({ title: "A", kind: "chart", columns: ["a"], rows: [[1]] });
        updateCanvasTile(id, { title: "Renamed", chartType: "line" });
        expect(listCanvasTiles()[0].title).toBe("Renamed");
        expect(listCanvasTiles()[0].chartType).toBe("line");
        removeCanvasTile(id);
        expect(listCanvasTiles()).toEqual([]);
    });

    it("clears all tiles and broadcasts a change event", () => {
        addCanvasTile({ title: "A", kind: "chart", columns: ["a"], rows: [[1]] });
        let fired = 0;
        const handler = () => { fired++; };
        window.addEventListener(CANVAS_TILES_EVENT, handler);
        clearCanvasTiles();
        window.removeEventListener(CANVAS_TILES_EVENT, handler);
        expect(fired).toBeGreaterThan(0);
        expect(listCanvasTiles()).toEqual([]);
    });

    it("tolerates malformed storage", () => {
        localStorage.setItem("pulseplay:canvas-tiles", "{not json");
        expect(listCanvasTiles()).toEqual([]);
        localStorage.setItem("pulseplay:canvas-tiles", JSON.stringify([{ bogus: true }, { id: "x", columns: [], rows: [] }]));
        expect(listCanvasTiles().map(t => t.id)).toEqual(["x"]);
    });
});
