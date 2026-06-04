import { describe, it, expect, vi } from "vitest";
import { capQueryResultRows, MAX_QUERY_RESULT_ROWS } from "../genie";

function makeRows(n: number): number[][] {
    return Array.from({ length: n }, (_, i) => [i, i * 2]);
}

describe("capQueryResultRows — oversized Genie response cap", () => {
    it("is a no-op for a result within the cap", () => {
        const qr = { columns: ["a", "b"], rows: makeRows(10) };
        const out = capQueryResultRows(qr);
        expect(out).toBe(qr);
        expect(qr.rows.length).toBe(10);
        expect((qr as { truncated?: boolean }).truncated).toBeUndefined();
    });

    it("truncates an oversized result to MAX_QUERY_RESULT_ROWS with a notice", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const total = MAX_QUERY_RESULT_ROWS + 4321;
        const qr = { columns: ["a", "b"], rows: makeRows(total) };
        capQueryResultRows(qr);
        expect(qr.rows.length).toBe(MAX_QUERY_RESULT_ROWS);
        expect((qr as { truncated?: boolean }).truncated).toBe(true);
        expect((qr as { totalRows?: number }).totalRows).toBe(total);
        // not silent — it logs the truncation with context
        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]?.[0])).toContain(String(total));
        warn.mockRestore();
    });

    it("keeps the FIRST rows (stable prefix), not a random slice", () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const qr = { columns: ["a", "b"], rows: makeRows(MAX_QUERY_RESULT_ROWS + 1) };
        capQueryResultRows(qr);
        expect(qr.rows[0]).toEqual([0, 0]);
        expect(qr.rows[MAX_QUERY_RESULT_ROWS - 1]).toEqual([MAX_QUERY_RESULT_ROWS - 1, (MAX_QUERY_RESULT_ROWS - 1) * 2]);
    });

    it("handles null / undefined / row-less results without throwing", () => {
        expect(capQueryResultRows(null)).toBeNull();
        expect(capQueryResultRows(undefined)).toBeUndefined();
        expect(() => capQueryResultRows({ columns: [] })).not.toThrow();
    });

    it("the cap is a sane, bounded value", () => {
        expect(MAX_QUERY_RESULT_ROWS).toBeGreaterThan(0);
        expect(MAX_QUERY_RESULT_ROWS).toBeLessThanOrEqual(100000);
    });
});
