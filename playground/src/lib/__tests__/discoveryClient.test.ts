// playground/src/lib/__tests__/discoveryClient.test.ts
//
// Phase A — discovery client tests. Covers:
//   • Input sanitization (profile + pack + subVertical regex gates)
//   • Network call shape
//   • sessionStorage cache hit/miss + TTL
//   • In-flight dedupe (two concurrent callers → one fetch)
//   • invalidateDiscoveryCache + clearAllDiscoveryCache
//   • Subscribe / unsubscribe to cache events

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getDiscoverySnapshot,
    invalidateDiscoveryCache,
    clearAllDiscoveryCache,
    subscribeDiscoveryCache,
    DiscoveryInvalidInputError,
    __resetDiscoveryClientForTests,
    type DiscoverySnapshot,
} from "../discoveryClient";

const VALID_SNAPSHOT: DiscoverySnapshot = {
    snapshotVersion: 1,
    fetchedAt: "2026-05-13T10:00:00Z",
    expiresAt: "2026-05-13T10:15:00Z",
    cacheKey: "test-key-abc",
    sources: {
        probe: { connectorType: "genie", metadataAvailability: "rich" },
        biMetadata: null,
        packKpis: [],
    },
    fused: {
        availableKpis: [],
        reachableFrames: [{ frameId: "swot-analysis", label: "SWOT", description: "", domain: "Strategic", rationale: "", params: {} }],
        unreachableFrames: [],
    },
    warnings: [],
};

let fetchSpy: ReturnType<typeof vi.fn>;

function makeFetchResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

beforeEach(() => {
    __resetDiscoveryClientForTests();
    fetchSpy = vi.fn().mockResolvedValue(makeFetchResponse(VALID_SNAPSHOT));
    vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/* ─── Input sanitization ─────────────────────────────────────────────── */

describe("getDiscoverySnapshot — input sanitization", () => {
    it("rejects empty profile with DiscoveryInvalidInputError, no fetch", async () => {
        await expect(getDiscoverySnapshot({ assistantProfile: "" }))
            .rejects.toBeInstanceOf(DiscoveryInvalidInputError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects profile with spaces", async () => {
        await expect(getDiscoverySnapshot({ assistantProfile: "bad name" }))
            .rejects.toBeInstanceOf(DiscoveryInvalidInputError);
    });

    it("rejects profile with disallowed special chars", async () => {
        await expect(getDiscoverySnapshot({ assistantProfile: "bad/name" }))
            .rejects.toBeInstanceOf(DiscoveryInvalidInputError);
    });

    it("rejects pack with path-traversal segment", async () => {
        await expect(getDiscoverySnapshot({ assistantProfile: "default", pack: "../etc" }))
            .rejects.toBeInstanceOf(DiscoveryInvalidInputError);
    });

    it("rejects pack with uppercase", async () => {
        await expect(getDiscoverySnapshot({ assistantProfile: "default", pack: "UPPER" }))
            .rejects.toBeInstanceOf(DiscoveryInvalidInputError);
    });

    it("rejects subVertical with bad regex", async () => {
        await expect(getDiscoverySnapshot({
            assistantProfile: "default", pack: "cpg-fmcg", subVertical: "../escape",
        })).rejects.toBeInstanceOf(DiscoveryInvalidInputError);
    });

    it("accepts valid profile + pack + subVertical", async () => {
        const snap = await getDiscoverySnapshot({
            assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain",
        });
        expect(snap.snapshotVersion).toBe(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});

/* ─── Network shape ──────────────────────────────────────────────────── */

describe("getDiscoverySnapshot — network call", () => {
    it("POSTs to /api/assistant/discover with the expected payload", async () => {
        await getDiscoverySnapshot({
            assistantProfile: "default",
            pack: "cpg-fmcg",
            subVertical: "supply-chain",
            biMetadata: { visibleMeasures: [{ name: "OTIF" }] },
            biUrl: "https://app.powerbi.com/groups/abc/reports/def",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe("/api/assistant/discover");
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body as string);
        expect(body.assistantProfile).toBe("default");
        expect(body.pack).toBe("cpg-fmcg");
        expect(body.subVertical).toBe("supply-chain");
        expect(body.biMetadata).toEqual({ visibleMeasures: [{ name: "OTIF" }] });
        expect(typeof body.biUrlHash).toBe("string");
        expect(body.biUrlHash.length).toBeGreaterThan(0);
    });

    it("throws on non-OK response with proxy's error message", async () => {
        fetchSpy.mockResolvedValueOnce(makeFetchResponse({ error: "Pack not available" }, 404));
        await expect(getDiscoverySnapshot({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain" }))
            .rejects.toThrow(/Pack not available/);
    });

    it("throws when fetch itself rejects (proxy unreachable)", async () => {
        fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        await expect(getDiscoverySnapshot({ assistantProfile: "default" }))
            .rejects.toThrow(/Proxy unreachable/);
    });

    it("throws when proxy returns malformed body", async () => {
        fetchSpy.mockResolvedValueOnce(makeFetchResponse({ snapshotVersion: 999, missing: true }));
        await expect(getDiscoverySnapshot({ assistantProfile: "default" }))
            .rejects.toThrow(/unexpected shape/);
    });
});

/* ─── sessionStorage cache ───────────────────────────────────────────── */

describe("getDiscoverySnapshot — sessionStorage cache", () => {
    it("second identical call hits the cache (no second fetch)", async () => {
        await getDiscoverySnapshot({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain" });
        await getDiscoverySnapshot({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain" });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("different biUrl produces different cache key (no false cache hit)", async () => {
        await getDiscoverySnapshot({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain", biUrl: "url-A" });
        await getDiscoverySnapshot({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain", biUrl: "url-B" });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("bypassCache=true forces a re-fetch", async () => {
        await getDiscoverySnapshot({ assistantProfile: "default" });
        await getDiscoverySnapshot({ assistantProfile: "default", bypassCache: true });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("invalidateDiscoveryCache drops the entry for the given key", async () => {
        await getDiscoverySnapshot({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain" });
        await invalidateDiscoveryCache({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain" });
        await getDiscoverySnapshot({ assistantProfile: "default", pack: "cpg-fmcg", subVertical: "supply-chain" });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("clearAllDiscoveryCache drops every entry", async () => {
        await getDiscoverySnapshot({ assistantProfile: "a", pack: "cpg-fmcg", subVertical: "supply-chain" });
        await getDiscoverySnapshot({ assistantProfile: "b", pack: "cpg-fmcg", subVertical: "supply-chain" });
        clearAllDiscoveryCache();
        await getDiscoverySnapshot({ assistantProfile: "a", pack: "cpg-fmcg", subVertical: "supply-chain" });
        await getDiscoverySnapshot({ assistantProfile: "b", pack: "cpg-fmcg", subVertical: "supply-chain" });
        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
});

/* ─── In-flight dedupe ──────────────────────────────────────────────── */

describe("getDiscoverySnapshot — in-flight dedupe", () => {
    it("two concurrent callers share a single fetch", async () => {
        let resolve!: (r: Response) => void;
        const pending = new Promise<Response>(r => { resolve = r; });
        fetchSpy.mockReturnValueOnce(pending);

        const p1 = getDiscoverySnapshot({ assistantProfile: "default" });
        const p2 = getDiscoverySnapshot({ assistantProfile: "default" });
        // Only ONE fetch fired.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        resolve(makeFetchResponse(VALID_SNAPSHOT));
        const [s1, s2] = await Promise.all([p1, p2]);
        // Both callers got the same snapshot.
        expect(s1).toBe(s2);
    });
});

/* ─── Listeners ──────────────────────────────────────────────────────── */

describe("subscribeDiscoveryCache", () => {
    it("fires listeners when a snapshot lands", async () => {
        const handler = vi.fn();
        const unsubscribe = subscribeDiscoveryCache(handler);
        try {
            await getDiscoverySnapshot({ assistantProfile: "default" });
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler.mock.calls[0][0]).toEqual(VALID_SNAPSHOT);
        } finally {
            unsubscribe();
        }
    });

    it("unsubscribed listeners no longer fire", async () => {
        const handler = vi.fn();
        const unsubscribe = subscribeDiscoveryCache(handler);
        unsubscribe();
        await getDiscoverySnapshot({ assistantProfile: "default" });
        expect(handler).not.toHaveBeenCalled();
    });
});
