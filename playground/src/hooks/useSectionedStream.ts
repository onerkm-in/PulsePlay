// playground/src/hooks/useSectionedStream.ts
//
// Phase D.3 — React hook that POSTs to /assistant/conversations/start-sectioned
// and incrementally builds the SectionState map the SectionedAnswer component
// consumes.
//
// Why fetch + ReadableStream instead of EventSource:
//   • EventSource is GET-only; this endpoint is POST.
//   • Fetch streaming is supported in every modern browser PulsePlay targets
//     (we're top-level origin in a real browser — see CLAUDE.md tripwires).
//
// The hook is transport-agnostic: pass a `fetchImpl` override in tests.

import * as React from "react";
import type { SectionState } from "../components/SectionedAnswer";

export interface SectionedStreamPayload {
    profile?: string;
    userPrompt: string;
    /** Either an explicit `schedule` OR `sections` (to use the default schedule). */
    sections?: string[];
    schedule?: Array<{ sections: string[]; spreadMs?: number }>;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: unknown;
    /** Selective re-run inputs (Phase D.4). */
    regenerateOnly?: string[];
    probeCache?: unknown;
    headlineCache?: unknown;
}

export type StreamEvent =
    | { kind: "probe-started" }
    | { kind: "probe-completed"; rows?: unknown[]; durationMs?: number }
    | { kind: "probe-failed"; error: { message: string } }
    | { kind: "section-started"; sectionId: string }
    | { kind: "section-completed"; sectionId: string; body: unknown; durationMs?: number; usage?: SectionState["usage"] }
    | { kind: "section-failed"; sectionId: string; error: { message: string; code?: string }; durationMs?: number }
    | { kind: "all-completed"; totals?: { sections?: number; failed?: number; durationMs?: number } }
    | { kind: "orchestrator-failed"; error: { message: string } };

export interface UseSectionedStreamResult {
    sectionStates: Record<string, SectionState>;
    isStreaming: boolean;
    error: string | null;
    /** True once an `all-completed` (or terminal failure) event has been received. */
    isDone: boolean;
    /** Trigger a stream. Resolves when the stream ends. */
    start: (payload: SectionedStreamPayload) => Promise<void>;
    /**
     * Convenience for Phase D.4 selective re-run: re-runs ONLY the named section
     * using the most-recent start() payload and the auto-cached probe row + HEADLINE
     * body from the prior stream. No-op (returns immediately) if no prior stream
     * exists or the section is not present in the last payload's sections list.
     */
    regenerate: (sectionId: string) => Promise<void>;
    /** Abort the in-flight stream (if any). */
    abort: () => void;
}

export interface UseSectionedStreamOptions {
    /** Endpoint path. Defaults to the Vite-proxied path. */
    endpoint?: string;
    /** Override for tests (e.g. supply a mock fetch). */
    fetchImpl?: typeof fetch;
}

const SSE_FRAME_SEP = "\n\n";

export function parseSseChunkBuffer(buffer: string): { events: StreamEvent[]; rest: string } {
    // Find the last complete `\n\n` boundary; everything before is parseable.
    const events: StreamEvent[] = [];
    let cursor = 0;
    while (true) {
        const sep = buffer.indexOf(SSE_FRAME_SEP, cursor);
        if (sep === -1) break;
        const frame = buffer.slice(cursor, sep);
        cursor = sep + SSE_FRAME_SEP.length;
        const lines = frame.split("\n");
        let eventName: string | undefined;
        let dataRaw: string | undefined;
        for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) {
                const piece = line.slice(5).trim();
                dataRaw = dataRaw == null ? piece : dataRaw + piece;
            }
        }
        if (!eventName) continue;
        let data: unknown = null;
        if (dataRaw) {
            try { data = JSON.parse(dataRaw); }
            catch { continue; /* skip malformed frame, keep streaming */ }
        }
        // The orchestrator already includes `kind` in the data envelope,
        // but we trust the SSE `event:` name as the canonical source.
        events.push({ ...(data as object), kind: eventName } as StreamEvent);
    }
    return { events, rest: buffer.slice(cursor) };
}

export function useSectionedStream(opts: UseSectionedStreamOptions = {}): UseSectionedStreamResult {
    const { endpoint = "/api/assistant/conversations/start-sectioned", fetchImpl } = opts;

    const [sectionStates, setSectionStates] = React.useState<Record<string, SectionState>>({});
    const [isStreaming, setIsStreaming] = React.useState(false);
    const [isDone, setIsDone] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const abortRef = React.useRef<AbortController | null>(null);
    // Phase D.4: remember the most recent start() payload + auto-captured
    // probe/headline so callers can re-run a single section via regenerate().
    const lastPayloadRef = React.useRef<SectionedStreamPayload | null>(null);
    const probeCacheRef = React.useRef<unknown>(null);
    const headlineCacheRef = React.useRef<unknown>(null);

    const abort = React.useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const applyEvent = React.useCallback((ev: StreamEvent) => {
        switch (ev.kind) {
            case "probe-completed":
                // Auto-cache so selective re-run can skip the probe.
                probeCacheRef.current = { rows: (ev as { rows?: unknown[] }).rows ?? [] };
                break;
            case "section-started":
                setSectionStates((prev) => ({
                    ...prev,
                    [ev.sectionId]: { ...(prev[ev.sectionId] ?? {}), status: "streaming" },
                }));
                break;
            case "section-completed":
                if (ev.sectionId === "HEADLINE") headlineCacheRef.current = ev.body;
                setSectionStates((prev) => ({
                    ...prev,
                    [ev.sectionId]: {
                        status: "completed",
                        body: ev.body,
                        durationMs: ev.durationMs,
                        usage: ev.usage,
                    },
                }));
                break;
            case "section-failed":
                setSectionStates((prev) => ({
                    ...prev,
                    [ev.sectionId]: {
                        status: "failed",
                        error: ev.error,
                        durationMs: ev.durationMs,
                    },
                }));
                break;
            case "orchestrator-failed":
                setError(ev.error?.message ?? "Orchestrator failed.");
                break;
            case "all-completed":
                setIsDone(true);
                break;
            // probe-started / probe-failed are informational for the UI for now.
            default:
                break;
        }
    }, []);

    const start = React.useCallback(async (payload: SectionedStreamPayload) => {
        abort();
        // Phase D.4 cache management:
        //   - Brand-new run (no regenerateOnly): reset section map, clear caches,
        //     remember this payload as the "last full run" so future regenerate()
        //     calls can re-issue with the right base.
        //   - Selective re-run: keep peers, blank the named sections back to
        //     'pending', and do NOT overwrite lastPayloadRef.
        if (!payload.regenerateOnly || payload.regenerateOnly.length === 0) {
            setSectionStates({});
            probeCacheRef.current = null;
            headlineCacheRef.current = null;
            lastPayloadRef.current = payload;
        } else {
            setSectionStates((prev) => {
                const next = { ...prev };
                for (const id of payload.regenerateOnly!) {
                    next[id] = { status: "pending" };
                }
                return next;
            });
        }
        setIsStreaming(true);
        setIsDone(false);
        setError(null);

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const doFetch = fetchImpl ?? fetch;
        let response: Response;
        try {
            response = await doFetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify(payload),
                signal: ctrl.signal,
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            setIsStreaming(false);
            return;
        }

        if (!response.ok || !response.body) {
            // Validation errors come back as JSON 400s BEFORE the SSE opens.
            let detail = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                if (typeof body?.error === "string") detail = body.error;
                else if (typeof body?.detail === "string") detail = body.detail;
            } catch { /* keep generic */ }
            setError(detail);
            setIsStreaming(false);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const { events, rest } = parseSseChunkBuffer(buffer);
                buffer = rest;
                for (const ev of events) applyEvent(ev);
            }
            // Flush any trailing complete frame.
            buffer += decoder.decode();
            const { events } = parseSseChunkBuffer(buffer + SSE_FRAME_SEP);
            for (const ev of events) applyEvent(ev);
        } catch (e: unknown) {
            if ((e as { name?: string })?.name !== "AbortError") {
                const msg = e instanceof Error ? e.message : String(e);
                setError(msg);
            }
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [endpoint, fetchImpl, applyEvent, abort]);

    React.useEffect(() => () => abort(), [abort]);

    const regenerate = React.useCallback(async (sectionId: string) => {
        const last = lastPayloadRef.current;
        if (!last) return; // no prior run — nothing to base the re-run on.
        // The orchestrator filters by `regenerateOnly` against the IR's
        // declared sections. So we re-issue the SAME payload but pinned to
        // the one section, plus the caches we captured.
        const payload: SectionedStreamPayload = {
            ...last,
            regenerateOnly: [sectionId],
            probeCache: probeCacheRef.current ?? last.probeCache,
            headlineCache: headlineCacheRef.current ?? last.headlineCache,
        };
        await start(payload);
    }, [start]);

    return { sectionStates, isStreaming, isDone, error, start, regenerate, abort };
}
