import { describe, it, expect, vi, afterEach } from "vitest";
import { validateSqlViaPreview } from "../sqlPreviewClient";

afterEach(() => { vi.restoreAllMocks(); });

describe("validateSqlViaPreview", () => {
    it("returns a clean error when the proxy URL is missing", async () => {
        const r = await validateSqlViaPreview({ apiBaseUrl: "", sql: "select 1" });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/proxy url/i);
    });

    it("returns a clean error for empty SQL without hitting the network", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch" as never);
        const r = await validateSqlViaPreview({ apiBaseUrl: "/api", sql: "   " });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/empty/i);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("POSTs to /sql/preview with the section's target profile header and parses an ok result", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, columns: ["total"], rows: [[42]], totalRowCount: 1, executionTimeMs: 88 }),
        } as Response);
        const r = await validateSqlViaPreview({ apiBaseUrl: "/api", sql: "select 42 as total", assistantProfile: "genie-finance" });
        expect(r.ok).toBe(true);
        expect(r.columns).toEqual(["total"]);
        expect(r.totalRowCount).toBe(1);
        // URL + header assertions.
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/sql/preview");
        expect((init.headers as Record<string, string>)["X-Assistant-Profile"]).toBe("genie-finance");
        expect(JSON.parse(init.body as string).sql).toBe("select 42 as total");
    });

    it("surfaces a proxy ok:false validation error", async () => {
        vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
            ok: true,
            json: async () => ({ ok: false, error: "Table not found: sales" }),
        } as Response);
        const r = await validateSqlViaPreview({ apiBaseUrl: "/api", sql: "select * from sales" });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/table not found/i);
    });

    it("surfaces an HTTP error status", async () => {
        vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({}),
        } as Response);
        const r = await validateSqlViaPreview({ apiBaseUrl: "/api", sql: "select 1" });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/503/);
    });
});
