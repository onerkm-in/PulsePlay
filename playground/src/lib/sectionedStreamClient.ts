// playground/src/lib/sectionedStreamClient.ts
//
// Thread C — client-side consumer for the proxy's sectioned SSE
// endpoint (POST /api/assistant/conversations/start-sectioned).
//
// Why a hand-rolled SSE reader instead of EventSource: EventSource is
// GET-only. The endpoint takes a JSON POST body (userPrompt + sections
// + discoveryContext + profile), so we use fetch + a streaming reader
// and parse the SSE frame shape (`event: <kind>\ndata: <json>\n\n`)
// ourselves.
//
// The frame shape matches what proxy/lib/sectionedOrchestrator yields —
// renderId is on every event, sectionId on per-section events, and the
// terminal `all-completed` event carries totals. The consumer collapses
// each frame into a typed event union and invokes the caller's onEvent
// handler synchronously.
//
// Cancellation: caller supplies an AbortSignal; the underlying fetch is
// aborted and the reader released cleanly. No callbacks fire after abort.

export type SectionedEventKind =
    | "probe-started"
    | "probe-completed"
    | "probe-failed"
    | "section-started"
    | "section-completed"
    | "section-failed"
    | "all-completed"
    | "orchestrator-failed";

export interface SectionedEvent {
    kind: SectionedEventKind;
    renderId: string;
    sectionId?: string;
    body?: unknown;
    sql?: { fragment: string; cteName?: string };
    usage?: Record<string, unknown>;
    error?: { message: string; code?: string };
    durationMs?: number;
    stageIndex?: number;
    totals?: { sections: number; durationMs: number };
    governance?: unknown;
}

export interface SectionedStreamRequest {
    profile: string;
    userPrompt: string;
    sections: string[];
    pack?: string;
    subVertical?: string;
    discoveryContext?: unknown;
    renderId?: string;
}

export interface SectionedStreamOptions extends SectionedStreamRequest {
    onEvent: (event: SectionedEvent) => void;
    signal?: AbortSignal;
    /** Test seam — injection point for the fetch implementation. */
    fetchImpl?: typeof fetch;
}

/**
 * Open an SSE stream to the proxy's sectioned endpoint, parse each
 * frame, and invoke `onEvent` for each parsed event. Resolves when the
 * stream ends (terminal `all-completed` or `orchestrator-failed`, or
 * connection close). Rejects on network error or non-2xx start.
 */
export async function streamSectionedAnswer(opts: SectionedStreamOptions): Promise<void> {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const response = await fetchImpl("/api/assistant/conversations/start-sectioned", {
        method: "POST",
        headers: {
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
            "X-Assistant-Profile": opts.profile,
        },
        body: JSON.stringify({
            profile: opts.profile,
            assistantProfile: opts.profile,
            userPrompt: opts.userPrompt,
            sections: opts.sections,
            pack: opts.pack,
            subVertical: opts.subVertical,
            ...(opts.renderId ? { renderId: opts.renderId } : {}),
            ...(opts.discoveryContext ? { discoveryContext: opts.discoveryContext } : {}),
        }),
        signal: opts.signal,
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`start-sectioned failed: HTTP ${response.status} ${text || ""}`.trim());
    }
    if (!response.body) {
        throw new Error("start-sectioned returned an empty body — cannot stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            if (opts.signal?.aborted) return;
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // SSE frames are separated by a blank line (\n\n). Process every
            // complete frame currently in the buffer; any incomplete tail
            // stays in `buffer` for the next read.
            let idx: number;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
                const frame = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const event = parseSseFrame(frame);
                if (event) opts.onEvent(event);
            }
        }
        // Drain any trailing frame without the closing blank line.
        if (buffer.trim().length > 0) {
            const event = parseSseFrame(buffer);
            if (event) opts.onEvent(event);
        }
    } finally {
        try { reader.releaseLock(); } catch { /* swallow */ }
    }
}

/** Parse a single SSE frame text into a typed event. Returns null when
 *  the frame is empty, malformed, or carries an unknown event kind. */
export function parseSseFrame(frame: string): SectionedEvent | null {
    const trimmed = frame.trim();
    if (!trimmed) return null;
    const lines = trimmed.split("\n");
    let eventKind = "";
    let dataLine = "";
    for (const line of lines) {
        if (line.startsWith("event:")) {
            eventKind = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
            // SSE permits multi-line data fields; join with newlines per spec.
            dataLine = dataLine ? `${dataLine}\n${line.slice(5).trim()}` : line.slice(5).trim();
        }
    }
    if (!eventKind || !dataLine) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(dataLine);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Record<string, unknown>;
    const renderId = typeof data.renderId === "string" ? data.renderId : "";
    return {
        kind: eventKind as SectionedEventKind,
        renderId,
        ...(typeof data.sectionId === "string" ? { sectionId: data.sectionId } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(data.sql && typeof data.sql === "object" ? { sql: data.sql as SectionedEvent["sql"] } : {}),
        ...(data.usage && typeof data.usage === "object" ? { usage: data.usage as Record<string, unknown> } : {}),
        ...(data.error && typeof data.error === "object" ? { error: data.error as SectionedEvent["error"] } : {}),
        ...(typeof data.durationMs === "number" ? { durationMs: data.durationMs } : {}),
        ...(typeof data.stageIndex === "number" ? { stageIndex: data.stageIndex } : {}),
        ...(data.totals && typeof data.totals === "object" ? { totals: data.totals as SectionedEvent["totals"] } : {}),
        ...(data.governance !== undefined ? { governance: data.governance } : {}),
    };
}
