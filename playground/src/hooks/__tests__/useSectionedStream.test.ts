// playground/src/hooks/__tests__/useSectionedStream.test.ts
//
// Phase D.3 — hook + SSE parser pins.

import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { parseSseChunkBuffer, useSectionedStream } from "../useSectionedStream";

function frame(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Build a Response whose body is a ReadableStream that emits the given chunks in order. */
function streamResponse(chunks: string[], init: ResponseInit = {}): Response {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const c of chunks) controller.enqueue(enc.encode(c));
            controller.close();
        },
    });
    return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        ...init,
    });
}

describe("parseSseChunkBuffer", () => {
    it("returns one event per complete frame and preserves trailing partial in 'rest'", () => {
        const buf = frame("section-started", { sectionId: "HEADLINE" })
            + frame("section-completed", { sectionId: "HEADLINE", body: "hi" })
            + "event: section-started\ndata: {\"sectionId\""; // partial
        const { events, rest } = parseSseChunkBuffer(buf);
        expect(events).toHaveLength(2);
        expect(events[0].kind).toBe("section-started");
        expect((events[0] as { sectionId: string }).sectionId).toBe("HEADLINE");
        expect(events[1].kind).toBe("section-completed");
        expect(rest.startsWith("event: section-started")).toBe(true);
    });

    it("trusts the SSE event-name as canonical kind even when payload has a different kind", () => {
        // Defensive: data field shouldn't override the wire-format event name.
        const buf = `event: section-started\ndata: ${JSON.stringify({ kind: "something-else", sectionId: "X" })}\n\n`;
        const { events } = parseSseChunkBuffer(buf);
        expect(events[0].kind).toBe("section-started");
    });

    it("skips malformed JSON frames without losing subsequent good frames", () => {
        const buf = "event: bogus\ndata: {not-json}\n\n"
            + frame("all-completed", { totals: { sections: 1 } });
        const { events } = parseSseChunkBuffer(buf);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("all-completed");
    });

    it("returns empty events and the whole buffer as rest when no '\\n\\n' present", () => {
        const buf = "event: section-started\ndata: {\"sectionId\":\"X\"}";
        const { events, rest } = parseSseChunkBuffer(buf);
        expect(events).toHaveLength(0);
        expect(rest).toBe(buf);
    });
});

describe("useSectionedStream", () => {
    it("transitions HEADLINE: pending -> streaming -> completed and marks isDone", async () => {
        const fetchImpl = vi.fn(async () => streamResponse([
            frame("section-started", { sectionId: "HEADLINE" }),
            frame("section-completed", { sectionId: "HEADLINE", body: "ok", durationMs: 12, usage: { output_tokens: 4 } }),
            frame("all-completed", { totals: { sections: 1, failed: 0 } }),
        ]));
        const { result } = renderHook(() => useSectionedStream({ fetchImpl: fetchImpl as unknown as typeof fetch }));

        await act(async () => {
            await result.current.start({ userPrompt: "q", sections: ["HEADLINE"] });
        });

        await waitFor(() => expect(result.current.isDone).toBe(true));
        expect(result.current.isStreaming).toBe(false);
        expect(result.current.sectionStates.HEADLINE.status).toBe("completed");
        expect(result.current.sectionStates.HEADLINE.body).toBe("ok");
        expect(result.current.sectionStates.HEADLINE.durationMs).toBe(12);
        expect(result.current.sectionStates.HEADLINE.usage?.output_tokens).toBe(4);
        expect(result.current.error).toBeNull();
    });

    it("section-failed produces status='failed' with the error envelope", async () => {
        const fetchImpl = vi.fn(async () => streamResponse([
            frame("section-started", { sectionId: "KPI" }),
            frame("section-failed", { sectionId: "KPI", error: { message: "boom" }, durationMs: 5 }),
            frame("all-completed", { totals: { sections: 1, failed: 1 } }),
        ]));
        const { result } = renderHook(() => useSectionedStream({ fetchImpl: fetchImpl as unknown as typeof fetch }));
        await act(async () => { await result.current.start({ userPrompt: "q", sections: ["KPI"] }); });
        expect(result.current.sectionStates.KPI.status).toBe("failed");
        expect(result.current.sectionStates.KPI.error?.message).toBe("boom");
    });

    it("HTTP 400 (validation) before SSE opens surfaces JSON.error as the hook error", async () => {
        const fetchImpl = vi.fn(async () => new Response(
            JSON.stringify({ error: "userPrompt is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        ));
        const { result } = renderHook(() => useSectionedStream({ fetchImpl: fetchImpl as unknown as typeof fetch }));
        await act(async () => { await result.current.start({ userPrompt: "" }); });
        expect(result.current.error).toBe("userPrompt is required");
        expect(result.current.isStreaming).toBe(false);
        expect(result.current.isDone).toBe(false);
    });

    it("orchestrator-failed event sets hook error without crashing", async () => {
        const fetchImpl = vi.fn(async () => streamResponse([
            frame("orchestrator-failed", { error: { message: "bad schedule" } }),
        ]));
        const { result } = renderHook(() => useSectionedStream({ fetchImpl: fetchImpl as unknown as typeof fetch }));
        await act(async () => { await result.current.start({ userPrompt: "q", sections: ["X"] }); });
        expect(result.current.error).toBe("bad schedule");
    });

    it("regenerateOnly preserves peer-section state and resets only the named sections to 'pending'", async () => {
        // First run: complete HEADLINE + KPI.
        let chunks: string[] = [
            frame("section-started", { sectionId: "HEADLINE" }),
            frame("section-completed", { sectionId: "HEADLINE", body: "h1" }),
            frame("section-started", { sectionId: "KPI" }),
            frame("section-completed", { sectionId: "KPI", body: "k1" }),
            frame("all-completed", { totals: { sections: 2 } }),
        ];
        const fetchImpl = vi.fn(async () => streamResponse(chunks));
        const { result } = renderHook(() => useSectionedStream({ fetchImpl: fetchImpl as unknown as typeof fetch }));
        await act(async () => { await result.current.start({ userPrompt: "q", sections: ["HEADLINE", "KPI"] }); });
        expect(result.current.sectionStates.HEADLINE.status).toBe("completed");
        expect(result.current.sectionStates.KPI.status).toBe("completed");

        // Second run: regenerate only KPI. After kicking off, HEADLINE should
        // remain 'completed' (peer preserved) and KPI should land on 'completed'
        // with the NEW body once the stream finishes.
        chunks = [
            frame("section-started", { sectionId: "KPI" }),
            frame("section-completed", { sectionId: "KPI", body: "k2" }),
            frame("all-completed", { totals: { sections: 1 } }),
        ];
        await act(async () => {
            await result.current.start({
                userPrompt: "q",
                sections: ["HEADLINE", "KPI"],
                regenerateOnly: ["KPI"],
                probeCache: { rows: [] },
                headlineCache: "h1",
            });
        });
        expect(result.current.sectionStates.HEADLINE.status).toBe("completed");
        expect(result.current.sectionStates.HEADLINE.body).toBe("h1");
        expect(result.current.sectionStates.KPI.status).toBe("completed");
        expect(result.current.sectionStates.KPI.body).toBe("k2");
    });

    it("a brand-new (non-rerun) start clears prior section states", async () => {
        const first = [
            frame("section-started", { sectionId: "A" }),
            frame("section-completed", { sectionId: "A", body: "a1" }),
            frame("all-completed", { totals: { sections: 1 } }),
        ];
        const second = [
            frame("section-started", { sectionId: "B" }),
            frame("section-completed", { sectionId: "B", body: "b1" }),
            frame("all-completed", { totals: { sections: 1 } }),
        ];
        let runs = 0;
        const fetchImpl = vi.fn(async () => streamResponse(runs++ === 0 ? first : second));
        const { result } = renderHook(() => useSectionedStream({ fetchImpl: fetchImpl as unknown as typeof fetch }));
        await act(async () => { await result.current.start({ userPrompt: "q1", sections: ["A"] }); });
        expect(result.current.sectionStates.A.status).toBe("completed");
        await act(async () => { await result.current.start({ userPrompt: "q2", sections: ["B"] }); });
        expect(result.current.sectionStates.A).toBeUndefined();
        expect(result.current.sectionStates.B.status).toBe("completed");
    });

    it("fetch-level network error surfaces as hook error and leaves isStreaming=false", async () => {
        const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
        const { result } = renderHook(() => useSectionedStream({ fetchImpl: fetchImpl as unknown as typeof fetch }));
        await act(async () => { await result.current.start({ userPrompt: "q", sections: ["X"] }); });
        expect(result.current.error).toBe("ECONNREFUSED");
        expect(result.current.isStreaming).toBe(false);
    });
});
