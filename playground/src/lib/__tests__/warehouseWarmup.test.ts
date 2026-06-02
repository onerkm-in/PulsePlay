// playground/src/lib/__tests__/warehouseWarmup.test.ts
//
// Coverage for the warehouse pre-warm helper. The actual end-to-end win
// (no cold-start on the user's first ask) is a live-smoke concern; these
// tests lock the fire-and-forget contract + the abort-on-rapid-swap
// behavior so we don't regress and accidentally pay 5 min of pending
// requests when the user flips connectors quickly.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    warmGenieWarehouse,
    startWarehouseKeepalive,
    stopWarehouseKeepalive,
    __resetWarehouseWarmupForTests,
    __getActiveKeepaliveForTests,
    WAREHOUSE_WARMUP_ENDPOINT,
    WAREHOUSE_KEEPALIVE_INTERVAL_MS,
} from "../warehouseWarmup";

beforeEach(() => {
    __resetWarehouseWarmupForTests();
});

afterEach(() => {
    __resetWarehouseWarmupForTests();
    vi.restoreAllMocks();
});

describe("warmGenieWarehouse", () => {
    it("returns 'skipped' for empty profile name without hitting the network", async () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const result = await warmGenieWarehouse("");
        expect(result).toBe("skipped");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("POSTs to the warmup endpoint with the assistant profile in the body + header", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, state: "RUNNING" }),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await warmGenieWarehouse("genie-default");
        expect(result).toBe("warmed");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(WAREHOUSE_WARMUP_ENDPOINT);
        expect((init as RequestInit).method).toBe("POST");
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers["X-Assistant-Profile"]).toBe("genie-default");
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).toEqual({ assistantProfile: "genie-default" });
    });

    it("returns 'no-warehouse' on HTTP 400 (Foundation Model / Bedrock profile without warehouseId)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ error: "No warehouseId configured in profile" }),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await warmGenieWarehouse("foundation-model");
        expect(result).toBe("no-warehouse");
    });

    it("returns 'no-warehouse' on a 200 no-op (newer proxy: { warehouse: false, state: 'none' })", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, state: "none", warehouse: false, reason: "no-warehouse-configured" }),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await warmGenieWarehouse("powerbi-dwd");
        expect(result).toBe("no-warehouse");
    });

    it("returns 'error' on non-OK non-400 status without throwing", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ error: "warehouse start failed" }),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await warmGenieWarehouse("genie-default");
        expect(result).toBe("error");
    });

    it("returns 'error' on fetch rejection (network error / proxy offline) without throwing", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await warmGenieWarehouse("genie-default");
        expect(result).toBe("error");
    });

    it("aborts the prior in-flight warmup when called again with the same profile", async () => {
        // First call: a fetch that hangs forever (simulating an in-flight
        // 30s warehouse spin-up).
        let aborted = false;
        const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            return new Promise((resolve, reject) => {
                (init.signal as AbortSignal).addEventListener("abort", () => {
                    aborted = true;
                    const err = new Error("aborted");
                    (err as { name?: string }).name = "AbortError";
                    reject(err);
                });
                // Otherwise never resolves.
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const first = warmGenieWarehouse("genie-default");
        // Second call to the SAME profile should abort the first.
        const secondFetchMock = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ ok: true }),
        });
        globalThis.fetch = secondFetchMock as unknown as typeof fetch;
        const second = warmGenieWarehouse("genie-default");

        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstResult).toBe("aborted");
        expect(secondResult).toBe("warmed");
        expect(aborted).toBe(true);
    });

    it("does NOT abort an in-flight warmup for a different profile (different warehouses are independent)", async () => {
        const callsByProfile: Record<string, AbortSignal | undefined> = {};
        const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
            const body = JSON.parse(init.body as string);
            callsByProfile[body.assistantProfile] = init.signal as AbortSignal;
            return Promise.resolve({
                ok: true, status: 200, json: async () => ({ ok: true }),
            });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const [a, b] = await Promise.all([
            warmGenieWarehouse("genie-default"),
            warmGenieWarehouse("genie-finance"),
        ]);
        expect(a).toBe("warmed");
        expect(b).toBe("warmed");
        // Neither was aborted.
        expect(callsByProfile["genie-default"]?.aborted).toBe(false);
        expect(callsByProfile["genie-finance"]?.aborted).toBe(false);
    });
});

/* ─── Keep-alive ping ──────────────────────────────────────────────── */
//
// The keep-alive ping holds the warehouse warm across the rest of a
// session after the initial pre-warm. These tests use vi.useFakeTimers
// to walk the interval forward deterministically and assert cadence,
// cleanup, visibility-pause + auto-resume, and connector-swap behavior.

describe("startWarehouseKeepalive", () => {
    function mockFetchOk(): ReturnType<typeof vi.fn> {
        const m = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
        globalThis.fetch = m as unknown as typeof fetch;
        return m;
    }

    it("returns a no-op stop function when profileName is empty (no timer installed)", () => {
        vi.useFakeTimers();
        const stop = startWarehouseKeepalive("");
        expect(__getActiveKeepaliveForTests()).toBeNull();
        expect(typeof stop).toBe("function");
        stop();
    });

    it("fires a warm-up on the configured interval", async () => {
        vi.useFakeTimers();
        const fetchMock = mockFetchOk();
        // Use a short test interval so vi.advanceTimersByTime moves predictably.
        startWarehouseKeepalive("genie-default", 1000);

        // Pre-arm — no fetch yet (the first ping happens after one interval).
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("stops firing after stopWarehouseKeepalive() is called", async () => {
        vi.useFakeTimers();
        const fetchMock = mockFetchOk();
        startWarehouseKeepalive("genie-default", 1000);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        stopWarehouseKeepalive();
        expect(__getActiveKeepaliveForTests()).toBeNull();
        await vi.advanceTimersByTimeAsync(5000);
        // Still 1 — the timer was torn down.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("replaces a prior keepalive when called with a different profile (no duplicate intervals)", async () => {
        vi.useFakeTimers();
        const fetchMock = mockFetchOk();
        startWarehouseKeepalive("genie-default", 1000);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Swap to a new profile — prior timer must be cleared so we don't
        // double-ping per interval.
        startWarehouseKeepalive("genie-finance", 1000);
        const session = __getActiveKeepaliveForTests();
        expect(session?.profileName).toBe("genie-finance");

        await vi.advanceTimersByTimeAsync(1000);
        // 1 + 1 (only the new profile fires; no leftover from the old).
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // Confirm the body of the most recent call is the new profile.
        const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
        const body = JSON.parse((lastCall[1] as RequestInit).body as string);
        expect(body.assistantProfile).toBe("genie-finance");
    });

    it("pauses pinging while document is hidden, and fires an immediate ping + resumes on visibility return", async () => {
        vi.useFakeTimers();
        const fetchMock = mockFetchOk();
        // Stub visibilityState BEFORE startKeepalive so the initial arm
        // condition sees the right value.
        Object.defineProperty(document, "hidden", {
            configurable: true,
            get: () => false,
        });
        startWarehouseKeepalive("genie-default", 1000);
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Tab goes background — flip hidden + dispatch visibilitychange.
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));

        // Advance well past the interval — no pings should fire while hidden.
        await vi.advanceTimersByTimeAsync(5000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Tab returns — flip back + dispatch. Should fire an IMMEDIATE
        // ping (the on-return safety re-warm) AND re-arm the interval.
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        document.dispatchEvent(new Event("visibilitychange"));
        // Microtask flush for the synchronous warmGenieWarehouse await.
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // And the interval ticks normally from here.
        await vi.advanceTimersByTimeAsync(1000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("does not arm the timer when document is already hidden at start", async () => {
        vi.useFakeTimers();
        const fetchMock = mockFetchOk();
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        startWarehouseKeepalive("genie-default", 1000);
        const session = __getActiveKeepaliveForTests();
        expect(session?.armed).toBe(false);
        await vi.advanceTimersByTimeAsync(5000);
        expect(fetchMock).not.toHaveBeenCalled();
        // Cleanup: flip back so other tests aren't poisoned.
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    });

    it("default interval matches the documented constant (4 min)", () => {
        expect(WAREHOUSE_KEEPALIVE_INTERVAL_MS).toBe(4 * 60 * 1000);
    });
});
