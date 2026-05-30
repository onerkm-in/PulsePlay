// playground/src/lib/__tests__/sectionedStreamClient.test.ts
//
// Thread C — SSE consumer + frame parser coverage.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    parseSseFrame,
    streamSectionedAnswer,
    type SectionedEvent,
} from "../sectionedStreamClient";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let i = 0;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (i >= chunks.length) {
                controller.close();
                return;
            }
            controller.enqueue(encoder.encode(chunks[i]));
            i += 1;
        },
    });
}

function makeStreamResponse(chunks: string[], status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        headers: new Headers({ "Content-Type": "text/event-stream" }),
        body: makeStream(chunks),
        text: async () => chunks.join(""),
    } as unknown as Response;
}

describe("parseSseFrame", () => {
    it("parses a well-formed frame", () => {
        const frame = 'event: section-completed\ndata: {"renderId":"r-1","sectionId":"HEADLINE","body":"hello","durationMs":42}';
        const ev = parseSseFrame(frame);
        expect(ev).not.toBeNull();
        expect(ev?.kind).toBe("section-completed");
        expect(ev?.renderId).toBe("r-1");
        expect(ev?.sectionId).toBe("HEADLINE");
        expect(ev?.body).toBe("hello");
        expect(ev?.durationMs).toBe(42);
    });

    it("returns null for empty / blank frames", () => {
        expect(parseSseFrame("")).toBeNull();
        expect(parseSseFrame("   \n  ")).toBeNull();
    });

    it("returns null for frames missing event or data lines", () => {
        expect(parseSseFrame("event: foo")).toBeNull();
        expect(parseSseFrame("data: {}")).toBeNull();
    });

    it("returns null when data is not valid JSON", () => {
        expect(parseSseFrame("event: x\ndata: not-json")).toBeNull();
    });

    it("forwards optional sql + usage fields when present", () => {
        const frame = 'event: section-completed\ndata: {"renderId":"r","sectionId":"S","body":"b","sql":{"fragment":"SELECT 1"},"usage":{"input_tokens":10}}';
        const ev = parseSseFrame(frame);
        expect(ev?.sql).toEqual({ fragment: "SELECT 1" });
        expect(ev?.usage).toEqual({ input_tokens: 10 });
    });

    it("forwards error envelopes on section-failed", () => {
        const frame = 'event: section-failed\ndata: {"renderId":"r","sectionId":"S","error":{"message":"boom","code":"X"},"durationMs":5}';
        const ev = parseSseFrame(frame);
        expect(ev?.kind).toBe("section-failed");
        expect(ev?.error).toEqual({ message: "boom", code: "X" });
    });

    it("preserves totals on all-completed", () => {
        const frame = 'event: all-completed\ndata: {"renderId":"r","totals":{"sections":4,"durationMs":3200}}';
        const ev = parseSseFrame(frame);
        expect(ev?.kind).toBe("all-completed");
        expect(ev?.totals).toEqual({ sections: 4, durationMs: 3200 });
    });
});

describe("streamSectionedAnswer — end-to-end SSE consumption", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        fetchSpy = vi.fn();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("invokes onEvent for every frame and resolves at stream end", async () => {
        const frames = [
            'event: section-started\ndata: {"renderId":"r1","sectionId":"HEADLINE","stageIndex":0}\n\n',
            'event: section-completed\ndata: {"renderId":"r1","sectionId":"HEADLINE","body":"hello","durationMs":12}\n\n',
            'event: all-completed\ndata: {"renderId":"r1","totals":{"sections":1,"durationMs":12}}\n\n',
        ];
        fetchSpy.mockResolvedValue(makeStreamResponse(frames));

        const events: SectionedEvent[] = [];
        await streamSectionedAnswer({
            profile: "sales",
            userPrompt: "why?",
            sections: ["HEADLINE"],
            onEvent: e => events.push(e),
            fetchImpl: fetchSpy as unknown as typeof fetch,
        });

        expect(events.map(e => e.kind)).toEqual(["section-started", "section-completed", "all-completed"]);
        expect(events[1].body).toBe("hello");
        // POST body asserts the contract — sections array + profile header.
        const [, init] = fetchSpy.mock.calls[0];
        const body = JSON.parse(init.body as string);
        expect(body.profile).toBe("sales");
        expect(body.sections).toEqual(["HEADLINE"]);
        expect((init.headers as Record<string, string>)["X-Assistant-Profile"]).toBe("sales");
        expect((init.headers as Record<string, string>)["Accept"]).toBe("text/event-stream");
    });

    it("handles frames split across multiple chunks", async () => {
        // Split a single frame across three chunks to exercise buffer
        // assembly in the consumer.
        fetchSpy.mockResolvedValue(makeStreamResponse([
            'event: section-co',
            'mpleted\ndata: {"renderId":"r1","sec',
            'tionId":"HEADLINE","body":"x"}\n\nevent: all-completed\ndata: {"renderId":"r1","totals":{"sections":1,"durationMs":5}}\n\n',
        ]));
        const events: SectionedEvent[] = [];
        await streamSectionedAnswer({
            profile: "sales",
            userPrompt: "q",
            sections: ["HEADLINE"],
            onEvent: e => events.push(e),
            fetchImpl: fetchSpy as unknown as typeof fetch,
        });
        expect(events.map(e => e.kind)).toEqual(["section-completed", "all-completed"]);
        expect(events[0].sectionId).toBe("HEADLINE");
        expect(events[0].body).toBe("x");
    });

    it("rejects on non-2xx response", async () => {
        fetchSpy.mockResolvedValue(makeStreamResponse(["error"], 500));
        await expect(streamSectionedAnswer({
            profile: "sales",
            userPrompt: "q",
            sections: ["HEADLINE"],
            onEvent: () => undefined,
            fetchImpl: fetchSpy as unknown as typeof fetch,
        })).rejects.toThrow(/HTTP 500/);
    });

    it("forwards renderId from the request body when supplied", async () => {
        fetchSpy.mockResolvedValue(makeStreamResponse([
            'event: all-completed\ndata: {"renderId":"r-keep","totals":{"sections":0,"durationMs":1}}\n\n',
        ]));
        await streamSectionedAnswer({
            profile: "sales",
            userPrompt: "q",
            sections: ["HEADLINE"],
            renderId: "r-keep",
            onEvent: () => undefined,
            fetchImpl: fetchSpy as unknown as typeof fetch,
        });
        const [, init] = fetchSpy.mock.calls[0];
        expect(JSON.parse(init.body as string).renderId).toBe("r-keep");
    });
});
