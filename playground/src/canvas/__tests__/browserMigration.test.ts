import { describe, test, expect, beforeEach } from "vitest";
import { migrateLegacyCanvasTiles, purgeCanvasBrowserStorage, isCanvasMigrated, __canvasMigrationKeys } from "../browserMigration";

const { LEGACY_KEY, MIGRATION_MARKER } = __canvasMigrationKeys;

describe("legacy canvas-tiles browser migration", () => {
    beforeEach(() => window.localStorage.clear());

    test("purges legacy rows + SQL and salvages only titles", () => {
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify([
            { title: "Sales by segment", rows: [[1, 2], [3, 4]], columns: ["a", "b"], sqlQuery: "SELECT * FROM secret" },
            { title: "Top customers", rows: [["acme"]], sqlQuery: "EVALUATE X" },
        ]));
        const res = migrateLegacyCanvasTiles();
        expect(res.hadLegacy).toBe(true);
        expect(res.purged).toBe(true);
        expect(res.salvagedTitles).toEqual(["Sales by segment", "Top customers"]);
        // rows/SQL are gone from browser storage entirely
        expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
        expect(isCanvasMigrated()).toBe(true);
    });

    test("no legacy key → marks migrated, salvages nothing", () => {
        const res = migrateLegacyCanvasTiles();
        expect(res.hadLegacy).toBe(false);
        expect(res.salvagedTitles).toEqual([]);
        expect(window.localStorage.getItem(MIGRATION_MARKER)).toBe("1");
    });

    test("unparseable legacy blob is still purged", () => {
        window.localStorage.setItem(LEGACY_KEY, "{not json");
        const res = migrateLegacyCanvasTiles();
        expect(res.purged).toBe(true);
        expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    test("purgeCanvasBrowserStorage removes the legacy key (logout/shared device)", () => {
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify([{ title: "x", rows: [[1]] }]));
        purgeCanvasBrowserStorage();
        expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    test("migration never reads or exposes row/SQL fields", () => {
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify([{ title: "t", rows: [["LEAK"]], sqlQuery: "SELECT LEAK" }]));
        const res = migrateLegacyCanvasTiles();
        const serialized = JSON.stringify(res);
        expect(serialized).not.toMatch(/LEAK/);
    });
});
