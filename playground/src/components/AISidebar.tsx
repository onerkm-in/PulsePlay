// playground/src/components/AISidebar.tsx
//
// The AI assistant — the WHOLE point of PulsePlay. Stays mounted as the
// user switches between BI vendors, accumulating event context (which
// page, which filters, which selection) so its prompts can reason about
// "the thing the user is currently looking at."
//
// Cycle C v0.5 — full submit -> poll -> render lifecycle.
//
// State machine per question:
//
//   idle
//     -> submitting   (POST /assistant/conversations/start)
//     -> polling      (GET /assistant/conversations/{cid}/messages/{mid} on a 1s tick)
//     -> completed    (status === "COMPLETED")
//      | failed       (status === "FAILED" | timeout | abort | network error)
//
// Renders the structured Genie-shape response: narrative + collapsible
// SQL + collapsible result table + validation diagnostics footer.
//
// Connector-agnostic on the wire: the polling URL pattern works for
// orchestrator-wrapped backends (Genie, OpenAI-analytics, Foundation
// Model). Supervisor returns COMPLETED synchronously so polling is
// effectively a no-op for it. Bedrock-direct currently has no polling
// endpoint — start response is treated as terminal. Any non-standard
// polling path (e.g. supervisor-async, Bedrock-streamed) is a future
// cycle.

import { useEffect, useRef, useState } from "react";
import type { BIEvent } from "../biPanel/BIAdapter";
import type { PackSelection } from "./PackPicker";
import { FramePicker } from "./FramePicker";
import { getDiscoverySnapshot, type DiscoverySnapshot, type ReachableFrame } from "../lib/discoveryClient";
import { SustainabilityIndicator } from "./SustainabilityIndicator";
import { recordResponse as recordUsageResponse } from "../lib/usageTracker";
import { EvidenceDrawer, type EvidenceItem } from "./EvidenceDrawer";
import { dumpRun, resetRun, stageEnd, stageStart } from "../lib/perfInstrumentation";
import { renderMarkdown } from "../lib/renderMarkdown";

// 2026-05-19 Codex post-UAT-1840 follow-up: wire the perf instrumentation
// utility (added in b71270f) into the actual Ask Pulse pipeline so DevTools
// Performance + the console table show real backend / polling / render
// segment durations against Rajesh's 5-10 s budget. The utility itself does
// nothing to latency — this wiring just exposes the numbers so the next
// cycle has concrete bottlenecks to attack instead of guessing.

/** Hard upper bound on how long we poll before giving up. */
export const MAX_POLL_DURATION_MS = 60_000;
/** Cadence between polls. */
export const POLL_INTERVAL_MS = 1_000;
/** How often the elapsed-time UI ticks while polling. */
const ELAPSED_TICK_MS = 200;
/** Cap rows shown in the result table to keep the sidebar readable. */
const RESULT_PREVIEW_ROWS = 20;

export interface AISidebarProps {
    activeVendor: string;
    /** PulsePlay 2-axis: connector profile name from /assistant/profiles. */
    activeConnector: string;
    recentEvents: BIEvent[];
    /** From Smart Connect — author-confirmed pack + sub-vertical. Sent to
     *  the proxy on every question so the prompt context is enriched
     *  with the right vertical vocabulary. */
    packSelection?: PackSelection | null;
    /** Live BI adapter for the mounted panel. When present, the discovery
     *  effect calls `adapter.getMetadata()` and forwards the result to
     *  `/assistant/discover` so the Discovery Loop computes honest
     *  reachable-frame signals from what the user is actually looking at,
     *  not just from the pack KPIs. Optional — when null, discovery
     *  degrades to pack-only signals (today's behaviour). */
    biAdapter?: { getMetadata?(): Promise<unknown | null> } | null;
    /** When set (non-null, non-empty), AISidebar auto-submits this
     *  question exactly once on the next render. Used by the first-run
     *  wizard's "Done & ask" finish action so the user sees a live AI
     *  response the moment the wizard closes. String values keep the
     *  legacy "once per unique question" behavior; event values use
     *  `id` so two separate wizard completions can submit the same
     *  question intentionally. */
    autoSubmitQuestion?: AutoSubmitQuestionEvent | string | null;
    /** FW1 — fires when an entry transitions to a terminal `completed`
     *  status. The host (App.tsx) builds an `AIResultEnvelope` via
     *  `entryToAIResultEnvelope(...)` and, when the runtime BI vendor is
     *  native, sends `{ kind: "renderResult", result: envelope }` to the
     *  primary BI adapter so the canvas paints alongside the sidebar
     *  answer text. The callback is intentionally narrow — only firing on
     *  successful completion — because failed/aborted entries have no
     *  attested result to render.
     *
     *  The handler should be cheap; it runs inside `finalize(...)`
     *  before React commits the next render. Heavy lifting (adapter
     *  send, telemetry, etc) should be fire-and-forget or post-effect. */
    onEntryCompleted?: (entry: AnswerEntry) => void;
}

export interface AutoSubmitQuestionEvent {
    id:       string | number;
    question: string;
}

export type AISidebarStatus =
    | "submitting"
    | "polling"
    | "completed"
    | "failed";

export interface QueryResult {
    columns: string[];
    rows: unknown[][];
}

export interface AnswerEntry {
    id: number;
    question: string;
    status: AISidebarStatus;
    /** Conversation + message IDs (for polling). */
    conversationId?: string;
    messageId?: string;
    /** When polling started — for elapsed time display. */
    startedAt: number;
    /** Wall-clock at which the entry transitioned to a terminal state.
     *  Used to freeze the elapsed-time display once polling stops. */
    finishedAt?: number;
    /** Final answer fields (filled when status is completed/failed). */
    answer?: string;
    sqlQuery?: string;
    queryResult?: QueryResult;
    truncated?: boolean;
    rowsReturned?: number;
    executionTimeMs?: number;
    validationDiagnostics?: Record<string, unknown>;
    error?: string;
    /** Optional token usage from the backend (OpenAI / Anthropic shape).
     *  Surfaced by SustainabilityIndicator. Absent for pure Genie responses. */
    usage?: ProxyMessageResponse["usage"];
    /** Latest upstream poll status reported by the proxy (e.g.
     *  `ASKING_AI`, `EXECUTING_QUERY`, `PENDING_WAREHOUSE`). Used to render
     *  a contextual loading message instead of a blanket "Thinking…" so
     *  the user sees that a 40-second wait is a cold-start warehouse,
     *  not the proxy hanging. Cleared on terminal status. */
    pollStatus?: string;
    /** FW1 — proxy-built governance attestation forwarded as-is from the
     *  upstream response. Validated shape-wise by the envelope mapper;
     *  the AISidebar treats it as opaque metadata. Absent for backends
     *  that haven't been wired through `withGovernance(...)` yet. */
    governance?: unknown;
}

let nextEntryId = 1;

/** Shape of the proxy's Genie-style response. Read defensively — every
 *  field is optional because different backends populate different
 *  subsets. */
interface ProxyMessageResponse {
    conversation_id?: string;
    message_id?: string;
    status?: string;
    content?: string;
    synthesis?: string;
    message?: {
        content?: string;
        attachments?: Array<{ text?: { content?: string } }>;
    };
    sqlQuery?: string;
    queryResult?: { columns?: unknown; rows?: unknown };
    statement_id?: string;
    execution_time_ms?: number;
    truncated?: boolean;
    rows_returned?: number;
    validationDiagnostics?: Record<string, unknown>;
    error?: string;
    /** OpenAI / Anthropic-shape token usage block; absent from pure Genie
     *  responses. Surfaced by SustainabilityIndicator when present. */
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
    };
    /** FW1 — opaque governance attestation. The proxy attaches a typed
     *  `GovernanceAttestation` via `withGovernance(...)` for renderable
     *  backend paths; AISidebar carries it through to the renderer
     *  without validating shape here (the entryToEnvelope mapper +
     *  native adapter render gate own shape validation + policy). */
    governance?: unknown;
}

/** Pull the narrative answer text out of a Genie-shape response, falling
 *  back through the various backend conventions. Same logic as cycle B's
 *  multi-shape reader, just isolated as a helper. */
function extractAnswer(data: ProxyMessageResponse): string | undefined {
    if (typeof data.content === "string" && data.content) return data.content;
    if (typeof data.synthesis === "string" && data.synthesis) return data.synthesis;
    if (typeof data.message?.content === "string" && data.message.content) {
        return data.message.content;
    }
    const attachments = data.message?.attachments;
    if (Array.isArray(attachments)) {
        for (const a of attachments) {
            if (typeof a?.text?.content === "string" && a.text.content) {
                return a.text.content;
            }
        }
    }
    return undefined;
}

function extractQueryResult(data: ProxyMessageResponse): QueryResult | undefined {
    const qr = data.queryResult;
    if (!qr) return undefined;
    const columns = Array.isArray(qr.columns) ? (qr.columns as unknown[]).map(c => String(c)) : [];
    const rows = Array.isArray(qr.rows) ? (qr.rows as unknown[][]) : [];
    if (columns.length === 0 && rows.length === 0) return undefined;
    return { columns, rows };
}

/** Map a proxy response into the partial AnswerEntry fields it carries. */
function projectEntryFromResponse(data: ProxyMessageResponse): Partial<AnswerEntry> {
    return {
        conversationId: data.conversation_id,
        messageId: data.message_id,
        answer: extractAnswer(data),
        sqlQuery: typeof data.sqlQuery === "string" ? data.sqlQuery : undefined,
        queryResult: extractQueryResult(data),
        truncated: typeof data.truncated === "boolean" ? data.truncated : undefined,
        rowsReturned: typeof data.rows_returned === "number" ? data.rows_returned : undefined,
        executionTimeMs: typeof data.execution_time_ms === "number" ? data.execution_time_ms : undefined,
        validationDiagnostics: data.validationDiagnostics,
        usage: data.usage,
        pollStatus: typeof data.status === "string" ? data.status : undefined,
        // FW1 — forward the opaque governance field if the proxy populated
        // one. AISidebar carries it through; the envelope mapper validates
        // shape and the native adapter's render gate applies policy.
        governance: data.governance,
    };
}

/** Map a raw upstream poll status (Genie / Databricks Apps state machine)
 *  to a viewer-friendly loading message + an optional "typical wait" hint.
 *
 *  Live-smoke 2026-05-14: warehouse cold-start regularly takes 30-60 s.
 *  Generic "Thinking…" left users thinking the proxy was hung. Surfacing
 *  the upstream state with a sympathetic explanation closes the
 *  perceived-time gap without making us faster.
 *
 *  Returns null when the status is unknown so the caller renders the
 *  default loading line. */
export function describePollStatus(status: string | undefined): { label: string; hint?: string } | null {
    if (!status) return null;
    switch (status.toUpperCase()) {
        case "PENDING_WAREHOUSE":
        case "STARTING":
            return {
                label: "Warming the SQL warehouse",
                hint: "First question after the warehouse goes idle takes ~30-60 s while Databricks spins compute. Follow-up questions reuse the warm cluster.",
            };
        case "ASKING_AI":
        case "PENDING":
            return { label: "Asking the AI for SQL" };
        case "EXECUTING_QUERY":
        case "RUNNING_QUERY":
            return { label: "Running the SQL on the warehouse" };
        case "SUMMARIZING":
        case "NARRATING":
            return { label: "Writing the narrative answer" };
        case "FETCHING_METADATA":
            return { label: "Fetching warehouse metadata" };
        case "COMPLETED":
        case "FAILED":
            return null;
        default:
            return null;
    }
}

/** Cross-backend probe-once envelope. Mirrors the shape Pulse genie.ts
 *  produces; the proxy's discoveryPromptInjector consumes either source
 *  identically. Bounds: 20 KPIs, 12 frames. */
function summariseSnapshotForRequest(snap: DiscoverySnapshot): Record<string, unknown> {
    const probe = snap.sources?.probe as Record<string, unknown> | null | undefined;
    const availableKpis = Array.isArray(snap.fused?.availableKpis)
        ? snap.fused.availableKpis.map(k => k?.name).filter((s): s is string => !!s).slice(0, 20)
        : [];
    const reachableFrames = Array.isArray(snap.fused?.reachableFrames)
        ? snap.fused.reachableFrames.map(f => f?.label).filter((s): s is string => !!s).slice(0, 12)
        : [];
    return {
        snapshotVersion: snap.snapshotVersion,
        sources: {
            probe: probe
                ? {
                    connectorType: typeof probe.connectorType === "string" ? probe.connectorType : undefined,
                    displayName: typeof probe.displayName === "string" ? probe.displayName : undefined,
                    tableCount: typeof probe.tableCount === "number" ? probe.tableCount : undefined,
                    metadataAvailability: typeof probe.metadataAvailability === "string" ? probe.metadataAvailability : undefined,
                }
                : null,
            packKpiCount: Array.isArray(snap.sources?.packKpis) ? snap.sources.packKpis.length : 0,
        },
        availableKpis,
        reachableFrames,
    };
}

/** Build a small context block from the recent BI events so the LLM
 *  knows what the user is looking at. Same idea as the sister project's contextBuilder,
 *  but sourced from BI vendor events. */
/**
 * Build the [BI Context] preamble that prefixes the user question on every
 * ask. Phase B of frame-to-prompt wiring: when a reachable analysis frame is
 * selected in the FramePicker, append a "[Selected analysis frame]" block so
 * the AI brain knows the user committed to a specific analysis intent (e.g.
 * "BCG growth–share matrix on the current category mix") instead of an
 * open-ended question. The proxy doesn't need to know about this field —
 * it lives in the same `content` string the proxy already forwards verbatim.
 */
function buildContextBlock(
    activeVendor: string,
    recentEvents: BIEvent[],
    selectedFrame?: ReachableFrame | null,
): string {
    const eventLines = recentEvents
        .slice(-5)
        .map(e => `- ${e.type}${e.payload ? ": " + JSON.stringify(e.payload).slice(0, 120) : ""}`);
    const blocks: string[] = [
        `[BI Context]`,
        `- Active vendor: ${activeVendor}`,
        ...(eventLines.length > 0 ? ["- Recent events:", ...eventLines] : ["- No recent events captured."]),
    ];
    if (selectedFrame) {
        const paramKeys = Object.keys(selectedFrame.params || {});
        const paramSummary = paramKeys.length > 0
            ? paramKeys.map(k => {
                const v = (selectedFrame.params as Record<string, unknown>)[k];
                const display = typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                    ? String(v)
                    : JSON.stringify(v);
                return `  - ${k}: ${display.slice(0, 80)}`;
            }).join("\n")
            : "  (no parameters)";
        blocks.push("");
        blocks.push("[Selected analysis frame]");
        blocks.push(`- Frame: ${selectedFrame.label} (${selectedFrame.frameId})`);
        blocks.push(`- Domain: ${selectedFrame.domain}`);
        blocks.push(`- Rationale: ${selectedFrame.rationale}`);
        blocks.push(`- Params:`);
        blocks.push(paramSummary);
    }
    return blocks.join("\n");
}

/** Lightweight elapsed-time pretty-printer. */
function formatElapsed(ms: number): string {
    const s = ms / 1000;
    if (s < 10) return `${s.toFixed(1)}s`;
    return `${Math.floor(s)}s`;
}

export function AISidebar(props: AISidebarProps) {
    const [question, setQuestion] = useState("");
    const [history, setHistory] = useState<AnswerEntry[]>([]);
    /** Drives a re-render every ELAPSED_TICK_MS while any entry is in
     *  flight, so the elapsed-time counter updates in the UI. */
    const [, setNowTick] = useState(0);

    /** Tracks the most recently auto-submitted event signature so a
     *  prop-only re-render doesn't re-fire ask(). Wizard completions pass
     *  an incrementing id, which keeps a later same-question completion
     *  distinct from an accidental same-prop render. */
    const autoSubmittedRef = useRef<string | null>(null);
    /** Per-entry abort controllers for in-flight fetches. */
    const abortControllers = useRef<Map<number, AbortController>>(new Map());
    /** Per-entry polling interval timer ids. */
    const pollTimers = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
    const recordedUsageEntryIds = useRef<Set<number>>(new Set());

    // While there's at least one in-flight entry, keep ticking so the
    // elapsed time UI stays current. Stops when nothing is pending.
    const hasInFlight = history.some(h => h.status === "submitting" || h.status === "polling");
    useEffect(() => {
        if (!hasInFlight) return;
        const id = setInterval(() => setNowTick(t => t + 1), ELAPSED_TICK_MS);
        return () => clearInterval(id);
    }, [hasInFlight]);

    // On unmount, abort every in-flight fetch and clear every polling
    // timer. Without this, a quick navigate-away would leak intervals
    // and try to setState on an unmounted component.
    useEffect(() => {
        const controllers = abortControllers.current;
        const timers = pollTimers.current;
        return () => {
            controllers.forEach(c => c.abort());
            controllers.clear();
            timers.forEach(t => clearInterval(t));
            timers.clear();
        };
    }, []);

    useEffect(() => {
        for (const completed of history) {
            if (completed.status !== "completed" || recordedUsageEntryIds.current.has(completed.id)) continue;
            recordedUsageEntryIds.current.add(completed.id);
            recordUsageResponse({
                usage: completed.usage,
                texts: {
                    userQuestion: completed.question,
                    response: completed.answer || "",
                },
            });
        }
    }, [history]);

    // Phase A discovery state: fetch a DiscoverySnapshot whenever the
    // connector or pack changes. The snapshot is cached in sessionStorage
    // by discoveryClient with a 15-min TTL, so navigating back to a
    // previously-loaded combo is instant.
    const [snapshot, setSnapshot] = useState<DiscoverySnapshot | null>(null);
    const [discoveryLoading, setDiscoveryLoading] = useState(false);
    const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
    useEffect(() => {
        if (!props.activeConnector) {
            setSnapshot(null);
            return;
        }
        let cancelled = false;
        setDiscoveryLoading(true);

        // Optional live BI metadata. The adapter is allowed to omit the
        // method entirely (iframe adapters) or return null (SDK mode not
        // available yet). We swallow failures — discovery already degrades
        // to pack-only signals when biMetadata is null.
        const collectBiMetadata = async (): Promise<unknown | null> => {
            const adapter = props.biAdapter;
            if (!adapter || typeof adapter.getMetadata !== "function") return null;
            try {
                return await adapter.getMetadata();
            } catch {
                return null;
            }
        };

        collectBiMetadata().then(biMetadata => {
            if (cancelled) return;
            return getDiscoverySnapshot({
                assistantProfile: props.activeConnector,
                pack: props.packSelection?.pack,
                subVertical: props.packSelection?.subVertical,
                // Cast: BIAdapter's BIMetadata is structurally compatible
                // with discoveryClient's local BIMetadata. The optional
                // chain + cast keeps the wiring loose so an adapter that
                // returns extra fields doesn't break the proxy call.
                biMetadata: biMetadata as Parameters<typeof getDiscoverySnapshot>[0]["biMetadata"],
            });
        }).then(snap => {
            if (!cancelled && snap !== undefined) {
                setSnapshot(snap);
                setDiscoveryLoading(false);
            }
        }).catch(() => {
            // Discovery is non-blocking — UI just falls back to free text.
            if (!cancelled) {
                setSnapshot(null);
                setDiscoveryLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [props.activeConnector, props.packSelection?.pack, props.packSelection?.subVertical, props.biAdapter]);

    const stopEntry = (entryId: number, reason: string) => {
        const ctrl = abortControllers.current.get(entryId);
        if (ctrl) {
            ctrl.abort();
            abortControllers.current.delete(entryId);
        }
        const timer = pollTimers.current.get(entryId);
        if (timer) {
            clearInterval(timer);
            pollTimers.current.delete(entryId);
        }
        setHistory(prev => prev.map(h =>
            h.id === entryId && (h.status === "submitting" || h.status === "polling")
                ? { ...h, status: "failed", error: reason, finishedAt: Date.now() }
                : h
        ));
    };

    const finalize = (entryId: number, patch: Partial<AnswerEntry>, status: AISidebarStatus) => {
        const timer = pollTimers.current.get(entryId);
        if (timer) {
            clearInterval(timer);
            pollTimers.current.delete(entryId);
        }
        abortControllers.current.delete(entryId);
        // Close any still-open perf stages and dump the table for this run.
        // Harmless when the stage was already closed (stageEnd no-ops on
        // already-closed entries). Lets the DevTools console show the
        // breakdown for every terminal Ask Pulse — success OR failure.
        const runId = `ask:${entryId}`;
        stageEnd(runId, "polling");
        stageEnd(runId, "submit");
        stageEnd(runId, "total");
        dumpRun(runId, `Ask Pulse #${entryId} → ${status}`);
        let completedEntry: AnswerEntry | null = null;
        setHistory(prev => {
            const finishedAt = Date.now();
            const next = prev.map(h =>
                h.id === entryId
                    ? { ...h, ...patch, status, finishedAt }
                    : h
            );
            // FW1 — capture the post-patch entry so the onEntryCompleted
            // callback below can fire with the same object the sidebar
            // just rendered. The updater runs synchronously inside React's
            // commit so completedEntry is populated before the `if` block
            // below executes.
            if (status === "completed") {
                completedEntry = next.find(h => h.id === entryId) ?? null;
            }
            return next;
        });
        // Fire the FW1 completion callback after setHistory dispatches.
        // Wrapped in try/catch so a misbehaved host can't break the AI
        // sidebar's state machine.
        if (status === "completed" && props.onEntryCompleted) {
            // If completedEntry wasn't populated (React batched the
            // updater past this point), reconstruct the completed shape
            // from the function arguments — the caller already has the
            // patch + entryId, so this is a guaranteed-correct fallback.
            const entry: AnswerEntry = completedEntry ?? {
                id: entryId,
                question: "",
                status: "completed",
                startedAt: 0,
                finishedAt: Date.now(),
                ...patch,
            };
            try {
                props.onEntryCompleted(entry);
            } catch (err) {
                console.warn("[AISidebar] onEntryCompleted handler threw:", err);
            }
        }
    };

    /** One poll tick. Resolves the message status from the proxy and
     *  either updates the entry, finalizes it (terminal status), or
     *  bails out on timeout / network error. */
    const pollOnce = async (entryId: number, conversationId: string, messageId: string, startedAt: number) => {
        if (Date.now() - startedAt >= MAX_POLL_DURATION_MS) {
            finalize(entryId, { error: `Polling timeout after ${Math.round(MAX_POLL_DURATION_MS / 1000)}s` }, "failed");
            return;
        }
        const ctrl = abortControllers.current.get(entryId);
        try {
            const res = await fetch(
                `/api/assistant/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
                {
                    method: "GET",
                    headers: {
                        ...(props.activeConnector ? { "X-Assistant-Profile": props.activeConnector } : {}),
                    },
                    signal: ctrl?.signal,
                },
            );
            const data = (await res.json()) as ProxyMessageResponse;
            if (!res.ok) {
                finalize(entryId, { error: data?.error || `HTTP ${res.status}` }, "failed");
                return;
            }
            const status = String(data.status || "").toUpperCase();
            const projection = projectEntryFromResponse(data);
            if (status === "COMPLETED") {
                finalize(entryId, projection, "completed");
            } else if (status === "FAILED") {
                finalize(entryId, { ...projection, error: data.error || "Backend reported FAILED" }, "failed");
            } else {
                // Still in progress — keep the tick going. Patch any partial
                // fields the backend has already populated (some orchestrators
                // stream back an answer text before the SQL run resolves).
                setHistory(prev => prev.map(h => h.id === entryId ? { ...h, ...projection } : h));
            }
        } catch (err) {
            if ((err as { name?: string })?.name === "AbortError") return; // user clicked Stop / unmount
            const msg = err instanceof Error ? err.message : String(err);
            finalize(entryId, { error: msg }, "failed");
        }
    };

    const startPolling = (entryId: number, conversationId: string, messageId: string, startedAt: number) => {
        // Fire one tick immediately so the user doesn't wait a full second
        // before seeing any progress, then schedule the recurring tick.
        void pollOnce(entryId, conversationId, messageId, startedAt);
        const timer = setInterval(() => {
            void pollOnce(entryId, conversationId, messageId, startedAt);
        }, POLL_INTERVAL_MS);
        pollTimers.current.set(entryId, timer);
    };

    /** Auto-submit on prop change — wizard's "Done & ask" path. Fires
     *  once per legacy string value, or once per event id when the caller
     *  supplies an event object. */
    useEffect(() => {
        const auto = props.autoSubmitQuestion;
        if (!auto) return;
        const q = (typeof auto === "string" ? auto : auto.question).trim();
        if (!q) return;
        const signature = typeof auto === "string" ? `question:${q}` : `event:${String(auto.id)}`;
        if (autoSubmittedRef.current === signature) return;
        autoSubmittedRef.current = signature;
        // Fire-and-forget; ask() handles its own state + error paths.
        void ask(q);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.autoSubmitQuestion]);

    /** Question state that the input is bound to.
     *  ask(overrideQ) lets the caller supply a question directly without
     *  going through the input — used by the auto-submit effect below
     *  for the wizard's "Done & ask" path. */
    const ask = async (overrideQ?: string) => {
        const q = (typeof overrideQ === "string" ? overrideQ : question).trim();
        if (!q) return;
        const entryId = nextEntryId++;
        const startedAt = Date.now();
        const entry: AnswerEntry = {
            id: entryId,
            question: q,
            status: "submitting",
            startedAt,
        };
        setHistory(prev => [...prev, entry]);
        setQuestion("");

        // Perf instrumentation — start two open stages: `total` (the whole
        // user-facing duration) and `submit` (the POST /start RTT). The
        // `polling` stage opens later when (and only if) polling kicks in.
        // Marks are emitted into the Performance API entry buffer so DevTools
        // Performance tab shows vertical lines at each boundary.
        const runId = `ask:${entryId}`;
        resetRun(runId);
        stageStart(runId, "total", q.length > 60 ? `${q.slice(0, 57)}…` : q);
        stageStart(runId, "submit", `profile=${props.activeConnector || "(default)"}`);

        // Resolve the selected analysis frame (if any) from the snapshot so we
        // can include both a structured `frame` JSON field (additive — proxy
        // ignores unknown fields permissively) AND a "[Selected analysis frame]"
        // section in the content preamble (so prompt-strategy benefits even
        // before the proxy is updated to consume the structured field).
        const selectedFrameObj: ReachableFrame | null = (selectedFrame && snapshot)
            ? (snapshot.fused.reachableFrames.find(f => f.frameId === selectedFrame) || null)
            : null;

        const contextBlock = buildContextBlock(props.activeVendor, props.recentEvents, selectedFrameObj);
        const ctrl = new AbortController();
        abortControllers.current.set(entryId, ctrl);

        try {
            const res = await fetch("/api/assistant/conversations/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(props.activeConnector ? { "X-Assistant-Profile": props.activeConnector } : {}),
                },
                body: JSON.stringify({
                    content: `${contextBlock}\n\n[Question]\n${q}`,
                    assistantProfile: props.activeConnector || undefined,
                    // Pack/sub-vertical drives prompt enrichment on the proxy.
                    pack: props.packSelection?.pack,
                    subVertical: props.packSelection?.subVertical,
                    // Frame-to-prompt wiring (Phase B). Additive field; the
                    // proxy ignores unknown JSON keys, so a stale proxy
                    // version silently drops this without failing the call.
                    // When the proxy is updated to consume it, this becomes
                    // the canonical machine-readable signal of the user's
                    // selected analysis intent (vs free-text question).
                    ...(selectedFrameObj ? {
                        frame: {
                            frameId: selectedFrameObj.frameId,
                            label: selectedFrameObj.label,
                            domain: selectedFrameObj.domain,
                            params: selectedFrameObj.params,
                        },
                    } : {}),
                    // Probe-once cross-backend reuse — when AISidebar already
                    // has the snapshot in hand, distil it into the same
                    // discoveryContext envelope the Pulse genie pipeline uses.
                    // Proxy ignores unknown keys, so a stale proxy version
                    // drops it silently; updated routes (Genie / FM / OpenAI /
                    // Bedrock / Supervisor) inject it as system-prompt or
                    // user-header augmentation.
                    ...(snapshot ? { discoveryContext: summariseSnapshotForRequest(snapshot) } : {}),
                }),
                signal: ctrl.signal,
            });
            const data = (await res.json()) as ProxyMessageResponse;
            // Backend RTT done — close `submit` regardless of terminal vs
            // pending status. finalize() also closes it as a safety net.
            stageEnd(runId, "submit");
            if (!res.ok) {
                finalize(entryId, { error: data?.error || `HTTP ${res.status}` }, "failed");
                return;
            }
            const startStatus = String(data.status || "").toUpperCase();
            const projection = projectEntryFromResponse(data);
            // Synchronous-completion paths (Supervisor; orchestrator-wrapped
            // when the backend resolves on the start call): render directly,
            // never start polling.
            if (startStatus === "COMPLETED") {
                finalize(entryId, projection, "completed");
                return;
            }
            if (startStatus === "FAILED") {
                finalize(entryId, { ...projection, error: data.error || "Backend reported FAILED" }, "failed");
                return;
            }
            // Need polling. Without conversation_id + message_id we can't
            // poll — surface that as a failure rather than spin forever.
            const cid = data.conversation_id;
            const mid = data.message_id;
            if (!cid || !mid) {
                // Some Bedrock-direct paths return content synchronously
                // without conversation IDs. Treat that as completed if we
                // got an answer, else failed.
                if (projection.answer) {
                    finalize(entryId, projection, "completed");
                } else {
                    finalize(entryId, { error: "Backend returned no conversation_id/message_id and no content; cannot poll." }, "failed");
                }
                return;
            }
            // Transition to polling, persisting the IDs and anything the
            // start response already populated.
            setHistory(prev => prev.map(h =>
                h.id === entryId
                    ? { ...h, ...projection, conversationId: cid, messageId: mid, status: "polling" }
                    : h
            ));
            stageStart(runId, "polling", `cid=${cid}`);
            startPolling(entryId, cid, mid, startedAt);
        } catch (err) {
            if ((err as { name?: string })?.name === "AbortError") return; // user clicked Stop
            const msg = err instanceof Error ? err.message : String(err);
            finalize(entryId, { error: msg }, "failed");
        }
    };

    const retry = (entryId: number) => {
        const original = history.find(h => h.id === entryId);
        if (!original) return;
        setQuestion(original.question);
    };

    const packIndicator = props.packSelection?.pack
        ? `Pack context: ${props.packSelection.pack}${props.packSelection.subVertical ? ` / ${props.packSelection.subVertical}` : ""}`
        : "Pack context: none — generic prompts";

    return (
        <section className="pp-ai-sidebar">
            <header className="pp-ai-sidebar__header">
                <h2 className="pp-ai-sidebar__title">PulsePlay AI</h2>
                <p
                    className="pp-ai-sidebar__pack-indicator"
                    data-testid="pp-ai-sidebar-pack-indicator"
                    style={{
                        margin: "2px 0 0",
                        fontSize: "11px",
                        color: "var(--pp-text-muted)",
                    }}
                >
                    {packIndicator}
                </p>
            </header>
            <p className="pp-ai-sidebar__intro">
                Ask questions across whichever BI tool is loaded. Context from the active panel's
                recent events ({props.recentEvents.length} captured) is sent with every prompt.
            </p>
            <div className="pp-ai-sidebar__history">
                {history.map(h => (
                    <AnswerEntryView
                        key={h.id}
                        entry={h}
                        onStop={() => stopEntry(h.id, "stopped by user")}
                        onRetry={() => retry(h.id)}
                    />
                ))}
            </div>
            <div className="pp-ai-sidebar__composer">
                <FramePicker
                    snapshot={snapshot}
                    loading={discoveryLoading}
                    value={selectedFrame}
                    onChange={setSelectedFrame}
                    compact
                />
                <textarea
                    className="pp-ai-sidebar__input"
                    rows={3}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about the loaded view…"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void ask(); }}
                />
                <div className="pp-ai-sidebar__buttons" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button
                        type="button"
                        className="pp-ai-sidebar__ask"
                        onClick={() => void ask()}
                        disabled={!question.trim()}
                    >
                        Ask
                    </button>
                    <button
                        type="button"
                        className="pp-ai-sidebar__stop"
                        onClick={() => {
                            // Stop the most recent in-flight entry. There's
                            // usually only one because the textarea blocks
                            // until the user submits the next question.
                            const inFlight = [...history].reverse().find(
                                h => h.status === "submitting" || h.status === "polling",
                            );
                            if (inFlight) stopEntry(inFlight.id, "stopped by user");
                        }}
                        disabled={!hasInFlight}
                        style={{
                            padding: "6px 12px",
                            border: "1px solid var(--pp-border)",
                            background: "var(--pp-surface)",
                            color: "var(--pp-text)",
                            borderRadius: 4,
                            fontSize: 12,
                            cursor: hasInFlight ? "pointer" : "not-allowed",
                        }}
                    >
                        Stop
                    </button>
                </div>
            </div>
            <SustainabilityIndicator showReset />
        </section>
    );
}

/** Per-entry rendering: question + status + structured response sections. */
function AnswerEntryView(props: { entry: AnswerEntry; onStop: () => void; onRetry: () => void }) {
    const { entry } = props;
    const elapsedMs = (entry.finishedAt ?? Date.now()) - entry.startedAt;
    const evidenceItems: EvidenceItem[] = [
        ...(entry.sqlQuery ? [{
            kind: "sql" as const,
            label: "Generated query",
            value: entry.sqlQuery,
            source: "Proxy response field: sqlQuery",
        }] : []),
        ...(entry.validationDiagnostics ? [{
            kind: "source" as const,
            label: "Validation diagnostics",
            value: JSON.stringify(entry.validationDiagnostics, null, 2),
            source: "Proxy response field: validationDiagnostics",
        }] : []),
    ];

    return (
        <article className="pp-ai-sidebar__entry" data-testid={`pp-ai-entry-${entry.id}`} data-status={entry.status}>
            <div className="pp-ai-sidebar__q"><strong>You:</strong> {entry.question}</div>

            {entry.status === "submitting" && (
                // Audit 2026-05-19 P2-11: aria-live so screen-reader users
                // hear that work is in flight; without it the spinner state
                // was invisible to assistive tech.
                <div
                    className="pp-ai-sidebar__pending"
                    role="status"
                    aria-live="polite"
                >
                    Submitting…
                </div>
            )}
            {entry.status === "polling" && (() => {
                const detail = describePollStatus(entry.pollStatus);
                return (
                    <div
                        className="pp-ai-sidebar__pending"
                        data-testid={`pp-ai-poll-${entry.id}`}
                        data-poll-status={(entry.pollStatus || "").toUpperCase()}
                        // Audit 2026-05-19 P2-11: aria-live so the rotating
                        // "Warming warehouse → Asking the AI → Running the SQL"
                        // copy gets announced as it changes. polite (not
                        // assertive) — these are status updates, not alerts.
                        role="status"
                        aria-live="polite"
                    >
                        <div style={{ fontWeight: 500 }}>
                            {detail ? detail.label : "Thinking…"} <span style={{ opacity: 0.6, fontWeight: 400 }}>(elapsed: {formatElapsed(elapsedMs)})</span>
                        </div>
                        {detail?.hint && (
                            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4, lineHeight: 1.35 }}>
                                {detail.hint}
                            </div>
                        )}
                    </div>
                );
            })()}

            {entry.answer && (
                <div className="pp-ai-sidebar__a">
                    <strong>AI:</strong>
                    {/* Audit 2026-05-19 P2-2: was `whiteSpace: pre-wrap` + raw
                      * text — every backend that emits Markdown (Genie /
                      * Foundation Model / Supervisor / Bedrock) leaked `**`,
                      * `|`, and `#` characters into the chat. The minimal
                      * renderer in lib/renderMarkdown is safe-by-construction
                      * (no innerHTML, link protocols vetted) and covers the
                      * subset of Markdown those backends actually use. */}
                    <div className="pp-ai-sidebar__narrative pp-md" style={{ marginTop: 4 }}>
                        {renderMarkdown(entry.answer)}
                    </div>
                </div>
            )}

            {entry.sqlQuery && (
                <details className="pp-ai-sidebar__sql" style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--pp-text-muted)" }}>SQL</summary>
                    <pre
                        style={{
                            margin: "4px 0 0",
                            padding: "6px 8px",
                            background: "var(--pp-bg)",
                            border: "1px solid var(--pp-border)",
                            borderRadius: 4,
                            fontSize: 11,
                            overflowX: "auto",
                        }}
                    >
                        <code>{entry.sqlQuery}</code>
                    </pre>
                </details>
            )}

            {entry.queryResult && entry.queryResult.columns.length > 0 && (
                <details className="pp-ai-sidebar__result" style={{ marginTop: 6 }} open>
                    <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--pp-text-muted)" }}>
                        Result
                    </summary>
                    <ResultTable result={entry.queryResult} />
                    <ResultFooter
                        rowsShown={Math.min(entry.queryResult.rows.length, RESULT_PREVIEW_ROWS)}
                        rowsTotal={entry.rowsReturned ?? entry.queryResult.rows.length}
                        truncated={!!entry.truncated}
                        executionTimeMs={entry.executionTimeMs}
                    />
                </details>
            )}

            {entry.validationDiagnostics && (
                <ValidationFooter diagnostics={entry.validationDiagnostics} />
            )}

            <EvidenceDrawer items={evidenceItems} />

            {entry.status === "failed" && (
                <div className="pp-ai-sidebar__error" data-testid={`pp-ai-error-${entry.id}`}>
                    Failed: {entry.error || "(no reason given)"}
                    <button
                        type="button"
                        onClick={props.onRetry}
                        style={{
                            marginLeft: 8,
                            padding: "2px 8px",
                            fontSize: 11,
                            border: "1px solid var(--pp-border)",
                            background: "var(--pp-surface)",
                            borderRadius: 4,
                            cursor: "pointer",
                        }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {(entry.status === "submitting" || entry.status === "polling") && (
                <button
                    type="button"
                    onClick={props.onStop}
                    data-testid={`pp-ai-stop-${entry.id}`}
                    style={{
                        marginTop: 4,
                        padding: "2px 8px",
                        fontSize: 11,
                        border: "1px solid var(--pp-border)",
                        background: "var(--pp-surface)",
                        borderRadius: 4,
                        cursor: "pointer",
                    }}
                >
                    Stop
                </button>
            )}
        </article>
    );
}

function ResultTable(props: { result: QueryResult }) {
    const { columns, rows } = props.result;
    const previewRows = rows.slice(0, RESULT_PREVIEW_ROWS);
    return (
        <div style={{ overflowX: "auto", marginTop: 4 }}>
            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                }}
            >
                <thead>
                    <tr>
                        {columns.map((c, i) => (
                            <th
                                key={i}
                                style={{
                                    textAlign: "left",
                                    borderBottom: "1px solid var(--pp-border)",
                                    padding: "4px 6px",
                                    color: "var(--pp-text-muted)",
                                    fontWeight: 600,
                                }}
                            >
                                {c}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {previewRows.map((row, ri) => (
                        <tr key={ri}>
                            {columns.map((_, ci) => (
                                <td
                                    key={ci}
                                    style={{
                                        padding: "3px 6px",
                                        borderBottom: "1px solid var(--pp-border)",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {formatCell(row[ci])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
        try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
}

function ResultFooter(props: {
    rowsShown: number;
    rowsTotal: number;
    truncated: boolean;
    executionTimeMs?: number;
}) {
    const { rowsShown, rowsTotal, truncated, executionTimeMs } = props;
    const parts: string[] = [];
    if (truncated || rowsShown < rowsTotal) {
        parts.push(`showing ${rowsShown} of ${rowsTotal}${truncated ? " (truncated)" : ""}`);
    } else {
        parts.push(`${rowsTotal} row${rowsTotal === 1 ? "" : "s"}`);
    }
    if (typeof executionTimeMs === "number") {
        parts.push(`executed in ${executionTimeMs} ms`);
    }
    return (
        <p
            style={{
                margin: "4px 0 0",
                fontSize: 11,
                color: "var(--pp-text-muted)",
            }}
        >
            {parts.join(" · ")}
        </p>
    );
}

function ValidationFooter(props: { diagnostics: Record<string, unknown> }) {
    const d = props.diagnostics;
    const attempts = typeof d.attempts === "number" ? d.attempts : undefined;
    const ok = typeof d.ok === "boolean" ? d.ok : undefined;
    const retried = typeof d.retried === "boolean" ? d.retried : undefined;
    const source = typeof d.source === "string" ? d.source : undefined;
    const parts: string[] = [];
    if (attempts !== undefined) parts.push(`${attempts} attempt${attempts === 1 ? "" : "s"}`);
    if (retried) parts.push("retried");
    if (ok === false) parts.push("validation failed");
    if (source) parts.push(`source: ${source}`);
    return (
        <p
            className="pp-ai-sidebar__validation"
            style={{
                margin: "4px 0 0",
                fontSize: 10,
                fontStyle: "italic",
                color: "var(--pp-text-muted)",
            }}
        >
            Validation: {parts.length > 0 ? parts.join(" · ") : "(no diagnostics)"}
        </p>
    );
}
