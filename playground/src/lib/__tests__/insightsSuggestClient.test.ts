// playground/src/lib/__tests__/insightsSuggestClient.test.ts
//
// Thread A — coverage for the Settings-side AI-assisted suggest path.
// Asserts:
//   • Introspection prompt is byte-equivalent to Pulse's GenieClient prompt
//   • Snapshot extraction prefers biMetadata, falls back to availableKpis
//   • End-to-end happy path: start → terminal response → parsed suggestion
//   • Polling path: start → poll until COMPLETED → parsed suggestion
//   • Soft failures return null (missing profile, empty bindings,
//     malformed response, polling timeout, network errors)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    buildIntrospectionPrompt,
    extractMeasuresAndDimensions,
    suggestInsightsConfigViaProxy,
} from "../insightsSuggestClient";
import * as discoveryClient from "../discoveryClient";
import type { DiscoverySnapshot } from "../discoveryClient";

const SAMPLE_SUGGESTION_JSON = JSON.stringify({
    domain: "Sales Performance",
    confidence: 0.82,
    rationale: "Bound measures include revenue + margin, dimensions include region + product.",
    suggestedSections: [
        { name: "REGIONAL BREAKDOWN", instruction: "Top regions by revenue." },
        { name: "MARGIN PRESSURE", instruction: "Where margin is contracting." },
    ],
});

const EMPTY_SNAPSHOT: DiscoverySnapshot = {
    snapshotVersion: 1,
    fetchedAt: "2026-05-25T00:00:00Z",
    expiresAt: "2026-05-25T00:15:00Z",
    cacheKey: "test",
    sources: { probe: null, biMetadata: null, packKpis: [] },
    fused: { availableKpis: [], reachableFrames: [], unreachableFrames: [] },
    warnings: [],
};

function makeResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

let fetchSpy: ReturnType<typeof vi.fn>;
let getSnapshotSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    getSnapshotSpy = vi.spyOn(discoveryClient, "getDiscoverySnapshot");
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("buildIntrospectionPrompt", () => {
    it("includes bound measures and dimensions verbatim", () => {
        const prompt = buildIntrospectionPrompt(
            ["revenue", "margin"],
            ["region", "product"],
            "Author hint: retail",
        );
        expect(prompt).toContain("Bound measures: revenue, margin");
        expect(prompt).toContain("Bound dimensions: region, product");
        expect(prompt).toContain("Sample context: Author hint: retail");
    });

    it("renders '(none)' for empty bindings", () => {
        const prompt = buildIntrospectionPrompt([], [], "");
        expect(prompt).toContain("Bound measures: (none)");
        expect(prompt).toContain("Bound dimensions: (none)");
        expect(prompt).not.toContain("Sample context:");
    });

    it("preserves the universal-sections exclusion guidance", () => {
        const prompt = buildIntrospectionPrompt(["x"], [], "");
        expect(prompt).toContain("NOT the universal ones");
        expect(prompt).toContain("HEADLINE, KPI SNAPSHOT, TRENDS, RISKS, RECOMMENDED ACTIONS");
    });

    it("asks for strict JSON shape with the four required keys", () => {
        const prompt = buildIntrospectionPrompt(["x"], [], "");
        expect(prompt).toContain('"domain":');
        expect(prompt).toContain('"confidence":');
        expect(prompt).toContain('"rationale":');
        expect(prompt).toContain('"suggestedSections":');
    });
});

describe("extractMeasuresAndDimensions", () => {
    it("returns empty arrays for null snapshot", () => {
        expect(extractMeasuresAndDimensions(null)).toEqual({ measures: [], dimensions: [] });
    });

    it("prefers biMetadata.visibleMeasures over availableKpis", () => {
        const snapshot: DiscoverySnapshot = {
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: {
                    visibleMeasures: [
                        { name: "revenue" },
                        { name: "margin" },
                    ],
                    visibleDimensions: [{ name: "region" }],
                },
                packKpis: [],
            },
            fused: {
                availableKpis: [{ name: "kpi-from-pack", source: "pack", grounded: [], aligned: false }],
                reachableFrames: [],
                unreachableFrames: [],
            },
        };
        const result = extractMeasuresAndDimensions(snapshot);
        expect(result.measures).toEqual(["revenue", "margin"]);
        expect(result.dimensions).toEqual(["region"]);
    });

    it("falls back to availableKpis when biMetadata has no measures", () => {
        const snapshot: DiscoverySnapshot = {
            ...EMPTY_SNAPSHOT,
            fused: {
                availableKpis: [
                    { name: "fill-rate", source: "pack", grounded: [], aligned: false },
                    { name: "lead-time", source: "pack", grounded: [], aligned: false },
                ],
                reachableFrames: [],
                unreachableFrames: [],
            },
        };
        expect(extractMeasuresAndDimensions(snapshot).measures).toEqual(["fill-rate", "lead-time"]);
    });

    it("caps measures at 20 and dimensions at 12", () => {
        const snapshot: DiscoverySnapshot = {
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: {
                    visibleMeasures: Array.from({ length: 30 }, (_, i) => ({ name: `m${i}` })),
                    visibleDimensions: Array.from({ length: 20 }, (_, i) => ({ name: `d${i}` })),
                },
                packKpis: [],
            },
        };
        const result = extractMeasuresAndDimensions(snapshot);
        expect(result.measures).toHaveLength(20);
        expect(result.dimensions).toHaveLength(12);
    });

    it("filters out empty / whitespace-only names", () => {
        const snapshot: DiscoverySnapshot = {
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: {
                    visibleMeasures: [{ name: " revenue " }, { name: "" }, { name: "   " }],
                    visibleDimensions: [],
                },
                packKpis: [],
            },
        };
        expect(extractMeasuresAndDimensions(snapshot).measures).toEqual(["revenue"]);
    });
});

describe("suggestInsightsConfigViaProxy", () => {
    it("returns null when profile is empty", async () => {
        const result = await suggestInsightsConfigViaProxy({ profile: "" });
        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns null when bindings empty AND no domain hint", async () => {
        getSnapshotSpy.mockResolvedValue(EMPTY_SNAPSHOT);
        const result = await suggestInsightsConfigViaProxy({ profile: "default" });
        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("succeeds via terminal start response (no polling)", async () => {
        getSnapshotSpy.mockResolvedValue({
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: {
                    visibleMeasures: [{ name: "revenue" }],
                    visibleDimensions: [{ name: "region" }],
                },
                packKpis: [],
            },
        });
        fetchSpy.mockResolvedValueOnce(makeResponse({
            status: "COMPLETED",
            content: SAMPLE_SUGGESTION_JSON,
            conversation_id: "c1",
            message_id: "m1",
        }));
        const result = await suggestInsightsConfigViaProxy({ profile: "default" });
        expect(result).not.toBeNull();
        expect(result?.domain).toBe("Sales Performance");
        expect(result?.suggestedSections).toHaveLength(2);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        // Body should include intent: "performance" so the upstream doesn't
        // pollute the user's chat history with the introspection probe.
        const [, init] = fetchSpy.mock.calls[0];
        const body = JSON.parse(init.body as string);
        expect(body.intent).toBe("performance");
        expect(body.assistantProfile).toBe("default");
        expect(body.content).toContain("Bound measures: revenue");
    });

    it("polls until COMPLETED when start response is non-terminal", async () => {
        getSnapshotSpy.mockResolvedValue({
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: {
                    visibleMeasures: [{ name: "revenue" }],
                    visibleDimensions: [],
                },
                packKpis: [],
            },
        });
        fetchSpy
            .mockResolvedValueOnce(makeResponse({
                status: "PENDING",
                conversation_id: "c1",
                message_id: "m1",
            }))
            .mockResolvedValueOnce(makeResponse({
                status: "ASKING_AI",
                conversation_id: "c1",
                message_id: "m1",
            }))
            .mockResolvedValueOnce(makeResponse({
                status: "COMPLETED",
                content: SAMPLE_SUGGESTION_JSON,
                conversation_id: "c1",
                message_id: "m1",
            }));

        vi.useFakeTimers();
        const promise = suggestInsightsConfigViaProxy({ profile: "default" });
        // Advance through two 1s poll intervals (sleep between calls 2 + 3)
        await vi.advanceTimersByTimeAsync(2_500);
        const result = await promise;
        vi.useRealTimers();

        expect(result).not.toBeNull();
        expect(result?.domain).toBe("Sales Performance");
        expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("returns null when poll terminates with FAILED", async () => {
        getSnapshotSpy.mockResolvedValue({
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: { visibleMeasures: [{ name: "revenue" }], visibleDimensions: [] },
                packKpis: [],
            },
        });
        fetchSpy
            .mockResolvedValueOnce(makeResponse({
                status: "PENDING",
                conversation_id: "c1",
                message_id: "m1",
            }))
            .mockResolvedValueOnce(makeResponse({
                status: "FAILED",
                conversation_id: "c1",
                message_id: "m1",
            }));

        vi.useFakeTimers();
        const promise = suggestInsightsConfigViaProxy({ profile: "default" });
        await vi.advanceTimersByTimeAsync(1_500);
        const result = await promise;
        vi.useRealTimers();

        expect(result).toBeNull();
    });

    it("returns null when start response is non-2xx", async () => {
        getSnapshotSpy.mockResolvedValue({
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: { visibleMeasures: [{ name: "revenue" }], visibleDimensions: [] },
                packKpis: [],
            },
        });
        fetchSpy.mockResolvedValueOnce(makeResponse({ error: "boom" }, 500));
        const result = await suggestInsightsConfigViaProxy({ profile: "default" });
        expect(result).toBeNull();
    });

    it("returns null when LLM response is malformed JSON", async () => {
        getSnapshotSpy.mockResolvedValue({
            ...EMPTY_SNAPSHOT,
            sources: {
                probe: null,
                biMetadata: { visibleMeasures: [{ name: "revenue" }], visibleDimensions: [] },
                packKpis: [],
            },
        });
        fetchSpy.mockResolvedValueOnce(makeResponse({
            status: "COMPLETED",
            content: "Sure! Here's a great idea: <not JSON at all>",
            conversation_id: "c1",
            message_id: "m1",
        }));
        const result = await suggestInsightsConfigViaProxy({ profile: "default" });
        expect(result).toBeNull();
    });

    it("survives discovery failure and continues with domain hint", async () => {
        getSnapshotSpy.mockRejectedValue(new Error("discovery down"));
        fetchSpy.mockResolvedValueOnce(makeResponse({
            status: "COMPLETED",
            content: SAMPLE_SUGGESTION_JSON,
            conversation_id: "c1",
            message_id: "m1",
        }));
        const result = await suggestInsightsConfigViaProxy({
            profile: "default",
            domainHint: "retail-fmcg",
        });
        expect(result).not.toBeNull();
        const [, init] = fetchSpy.mock.calls[0];
        const body = JSON.parse(init.body as string);
        expect(body.content).toContain("Author hint: retail-fmcg");
    });
});
