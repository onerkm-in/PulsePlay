import { render, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { App } from "../App";
import { queryClient } from "../lib/queryClient";

describe("App Governance and React Query Integration", () => {
    beforeEach(() => {
        window.localStorage.clear();
        queryClient.clear();
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/allowlist")) {
                return new Response(JSON.stringify({ configured: true, biProviders: [{ vendor: "powerbi", enabled: true }] }), { status: 200, headers: { "content-type": "application/json" } });
            }
            if (url.includes("/packs")) {
                return new Response(JSON.stringify({ packs: [{ id: "test-pack", name: "Test Pack" }] }), { status: 200, headers: { "content-type": "application/json" } });
            }
            return new Response("Not found", { status: 404 });
        });
    });

    afterEach(() => {
        cleanup(); // Prevent React Query from causing DOM effects after window is destroyed
        vi.restoreAllMocks();
    });

    it("loads packs and allowlist successfully and renders properly", async () => {
        render(<App />);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith("/api/assistant/allowlist", expect.anything());
            expect(globalThis.fetch).toHaveBeenCalledWith("/api/assistant/knowledge/packs", expect.anything());
        }, { timeout: 2000 });
        
    });
});
