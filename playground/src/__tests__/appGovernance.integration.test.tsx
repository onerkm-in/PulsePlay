import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { App } from "../App";
import { queryClient } from "../lib/queryClient";

describe("App Governance and React Query Integration", () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.history.pushState({}, "", "/");
        queryClient.clear();
    });

    afterEach(() => {
        cleanup();
        queryClient.clear();
        vi.restoreAllMocks();
    });

    it("loads packs and allowlist through the shared API client", async () => {
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/allowlist")) {
                return new Response(JSON.stringify({ configured: true, biProviders: [{ vendor: "powerbi", enabled: true }] }), { status: 200, headers: { "content-type": "application/json" } });
            }
            if (url.includes("/packs")) {
                return new Response(JSON.stringify({ packs: [{ id: "test-pack", name: "Test Pack" }] }), { status: 200, headers: { "content-type": "application/json" } });
            }
            return new Response("Not found", { status: 404 });
        });

        render(<App />);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith("/api/assistant/allowlist", expect.anything());
            expect(globalThis.fetch).toHaveBeenCalledWith("/api/assistant/knowledge/packs", expect.anything());
        }, { timeout: 2000 });
        expect(queryClient.getQueryData(["config", "packs"])).toEqual([{ id: "test-pack", name: "Test Pack" }]);
    });

    it("keeps the app fail-closed when the allowlist query fails", async () => {
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/allowlist")) {
                return new Response(JSON.stringify({
                    title: "Governance unavailable",
                    detail: "Proxy rejected the governance request.",
                    status: 503,
                    code: "ALLOWLIST_UNAVAILABLE",
                }), { status: 503, headers: { "content-type": "application/problem+json" } });
            }
            if (url.includes("/packs")) {
                return new Response(JSON.stringify({ packs: [] }), { status: 200, headers: { "content-type": "application/json" } });
            }
            return new Response("Not found", { status: 404 });
        });

        render(<App />);

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("Governance allowlist unreachable");
    });
});
