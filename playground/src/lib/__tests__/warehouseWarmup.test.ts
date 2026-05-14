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
    __resetWarehouseWarmupForTests,
    WAREHOUSE_WARMUP_ENDPOINT,
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
