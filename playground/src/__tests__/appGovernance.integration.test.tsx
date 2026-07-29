import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { App } from "../App";
import { queryClient } from "../lib/queryClient";
import { __resetAllowlistFetch } from "../lib/allowlistFetch";

describe("App Governance and React Query Integration", () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.history.pushState({}, "", "/");
        queryClient.clear();
        // The shared allowlist loader carries a boot-window cache (one request
        // per boot, COST-P2); without a reset the SECOND test is served the
        // FIRST test's allowlist and its fetch mock never fires.
        __resetAllowlistFetch();
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
        // UX-VIEWER-1.1: the prior full-width "Governance allowlist unreachable —
        // fail-closed. BI surfaces will not mount..." banner was demoted to a
        // compact chip with plain-language copy. The fail-closed contract is
        // unchanged; the visible label is now operator-friendly.
        expect(alert.textContent).toContain("Proxy unreachable");
        expect(alert.textContent).toContain("config locked");
        expect(alert.getAttribute("data-fail-closed")).toBe("true");
    });

    it("auto-picks the first non-smoke_test allowlisted AI profile when none is chosen yet", async () => {
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/allowlist")) {
                return new Response(JSON.stringify({
                    configured: true,
                    biProviders: ["powerbi"],
                    aiProfiles: ["smoke_test", "default"],
                }), { status: 200, headers: { "content-type": "application/json" } });
            }
            if (url.includes("/packs")) {
                return new Response(JSON.stringify({ packs: [] }), { status: 200, headers: { "content-type": "application/json" } });
            }
            return new Response("Not found", { status: 404 });
        });

        render(<App />);

        await waitFor(() => {
            expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBe("default");
        }, { timeout: 2000 });
    });

    it("does not override an already-chosen active AI profile once the allowlist loads", async () => {
        window.localStorage.setItem("pulseplay:active-ai-profile", "powerbi-dwd");
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes("/allowlist")) {
                return new Response(JSON.stringify({
                    configured: true,
                    biProviders: ["powerbi"],
                    aiProfiles: ["smoke_test", "default"],
                }), { status: 200, headers: { "content-type": "application/json" } });
            }
            if (url.includes("/packs")) {
                return new Response(JSON.stringify({ packs: [] }), { status: 200, headers: { "content-type": "application/json" } });
            }
            return new Response("Not found", { status: 404 });
        });

        render(<App />);

        await waitFor(() => {
            expect(globalThis.fetch).toHaveBeenCalledWith("/api/assistant/allowlist", expect.anything());
        }, { timeout: 2000 });
        expect(window.localStorage.getItem("pulseplay:active-ai-profile")).toBe("powerbi-dwd");
    });
});
