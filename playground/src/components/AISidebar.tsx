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

import { useEffect, useMemo, useRef, useState } from "react";
import type { BIEvent } from "../biPanel/BIAdapter";
import type { PackSelection } from "./PackPicker";
import { FramePicker } from "./FramePicker";
import { getDiscoverySnapshot, type DiscoverySnapshot, type ReachableFrame } from "../lib/discoveryClient";
// SustainabilityIndicator is mounted once in App.tsx as a fixed bottom-right
// orb; AISidebar no longer renders its own chip.
import { recordResponse as recordUsageResponse } from "../lib/usageTracker";
import { EvidenceDrawer, type EvidenceItem } from "./EvidenceDrawer";
import { dumpRun, resetRun, stageEnd, stageStart } from "../lib/perfInstrumentation";
import { renderMarkdown } from "../lib/renderMarkdown";
import type { ArtifactCitation, ArtifactStatus } from "../types/assistant";
import { validateArtifact, type CandidateArtifact } from "../lib/artifactValidator";
import { TrustBadge } from "./TrustBadge";
import { usePulseAiVisualSettings } from "../settings/pulseVisualSettingsStore";
import { SectionedAnswer, type SectionDescriptor, type SectionState } from "./SectionedAnswer";
import { streamSectionedAnswer } from "../lib/sectionedStreamClient";

/** Thread C — default section taxonomy when chat-sectioned mode is on.
 *  Mirrors AI Insights' baseline so authors see the same vocabulary
 *  across both surfaces. */
const SECTIONED_DEFAULT_SECTIONS: readonly string[] = Object.freeze([
    "HEADLINE",
    "TRENDS",
    "RISKS",
    "RECOMMENDED_ACTIONS",
]);

/** Thread C — feature flag. Default off; the user (or admin) opts into
 *  sectioned chat by setting `pulseplay:chat-sectioned-enabled` = "1" in
 *  localStorage. Keeps Genie's classic single-message chat behaviour as
 *  the default while we iterate on the structured experience. */
export function isSectionedChatEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem("pulseplay:chat-sectioned-enabled") === "1";
    } catch {
        return false;
    }
}

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
    /** Thread B — authoritative artifact status emitted by validateArtifact()
     *  once the entry transitions to `completed`. Drives the <TrustBadge>
     *  render in the message header. Never set by the LLM; never trusted
     *  from upstream metadata. Absent on pending / submitting / polling
     *  entries; absent on failed entries (no artifact to validate). */
    artifactStatus?: ArtifactStatus;
    /** Thread B — Problem-Details detail string when artifactStatus is
     *  `blocked`. Surfaced inside the badge tooltip so the viewer knows
     *  why the validator refused. */
    artifactStatusReason?: string;
    /** Thread C — per-section state when the entry is streaming through
     *  the sectioned SSE endpoint. Absent for flat-mode entries. */
    sectionStates?: Record<string, SectionState>;
    /** Thread C — ordered section descriptors so the renderer can lay
     *  them out top-to-bottom in the canonical order. */
    sectionDescriptors?: SectionDescriptor[];
    /** Thread C — true while the SSE stream is open. Disables per-section
     *  regenerate buttons until the stream terminates. */
    isStreamingSections?: boolean;
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

/** Thread B — compute the authoritative artifact status for a completed
 *  AnswerEntry. Synthesises a CandidateArtifact from the entry's fields
 *  and runs validateArtifact, which is the SAME gate the Workbench
 *  surface uses. Status is never trusted from the LLM or upstream
 *  metadata — only from this validator pass.
 *
 *  Citation synthesis rules:
 *    • `sqlQuery` present → `{ kind: 'sql', statement }` citation
 *    • `queryResult` with rows → `{ kind: 'result-rows', rowCount }` citation
 *  Without either, an answer-only entry collapses to `suggestion`.
 *  Returns null if the entry has no renderable content at all (skip badge). */
export function computeArtifactStatusForEntry(entry: AnswerEntry): { status: ArtifactStatus; reason?: string } | null {
    const answerText = typeof entry.answer === "string" ? entry.answer.trim() : "";
    const sqlText = typeof entry.sqlQuery === "string" ? entry.sqlQuery.trim() : "";
    const rows = entry.queryResult?.rows ?? [];
    const hasAnswer = answerText.length > 0;
    const hasSql = sqlText.length > 0;
    const hasTable = entry.queryResult ? rows.length > 0 : false;
    if (!hasAnswer && !hasSql && !hasTable) return null;

    const citations: ArtifactCitation[] = [];
    if (hasSql) {
        citations.push({ kind: "sql", statement: sqlText });
    }
    if (hasTable) {
        citations.push({
            kind: "result-rows",
            statementId: `entry-${entry.id}`,
            rowCount: typeof entry.rowsReturned === "number" ? entry.rowsReturned : rows.length,
        });
    }

    const candidate: CandidateArtifact = {
        id: `entry-${entry.id}`,
        ...(hasAnswer ? { answer: { markdown: answerText } } : {}),
        ...(hasSql ? { sql: sqlText } : {}),
        ...(hasTable && entry.queryResult
            ? {
                table: {
                    columns: entry.queryResult.columns.map(c => ({ name: c, type: "string" })),
                    rows: entry.queryResult.rows.map(row =>
                        row.map(cell =>
                            cell === null || cell === undefined
                                ? null
                                : typeof cell === "number"
                                ? cell
                                : String(cell),
                        ),
                    ),
                },
            }
            : {}),
        ...(citations.length > 0 ? { citations } : {}),
        ...(typeof entry.executionTimeMs === "number" ? { executionTimeMs: entry.executionTimeMs } : {}),
        ...(typeof entry.rowsReturned === "number" ? { rowCount: entry.rowsReturned } : {}),
    };

    const result = validateArtifact(candidate);
    return {
        status: result.artifact.status,
        ...(result.artifact.statusReason ? { reason: result.artifact.statusReason } : {}),
    };
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

    /** Thread D — pull metric direction rules from settings so the
     *  markdown renderer can tone-tint table cells where the column
     *  header matches a rule. Hook subscribes to PULSE_SETTINGS_EVENT
     *  so changes propagate without a refresh. Returns `undefined` when
     *  both fields are empty so renderMarkdown skips the tone path. */
    const pulseAiSettings = usePulseAiVisualSettings();
    const metricRulesForRender = useMemo(() => {
        const structured = pulseAiSettings.value.insightsMetricDirections?.trim() || undefined;
        const legacy = pulseAiSettings.value.metricDirectionRules?.trim() || undefined;
        if (!structured && !legacy) return undefined;
        return { structured, legacy };
    }, [pulseAiSettings.value.insightsMetricDirections, pulseAiSettings.value.metricDirectionRules]);

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

    const finalizeWithStatus = (entryId: number, patch: Partial<AnswerEntry>, status: AISidebarStatus, existing: AnswerEntry | undefined): Partial<AnswerEntry> => {
        if (status !== "completed") return patch;
        const projected: AnswerEntry = { ...(existing as AnswerEntry), ...patch, id: entryId, status };
        const validation = computeArtifactStatusForEntry(projected);
        if (!validation) return patch;
        return {
            ...patch,
            artifactStatus: validation.status,
            ...(validation.reason ? { artifactStatusReason: validation.reason } : {}),
        };
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
            const existing = prev.find(h => h.id === entryId);
            const enrichedPatch = finalizeWithStatus(entryId, patch, status, existing);
            const next = prev.map(h =>
                h.id === entryId
                    ? { ...h, ...enrichedPatch, status, finishedAt }
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

    /** Thread C — sectioned chat path. Opens an SSE stream to the proxy's
     *  Phase D endpoint, registers section descriptors + initial pending
     *  states on the entry, and updates section states as events arrive.
     *  All in-flight sections share one renderId-keyed AnswerEntry.
     *  Requires a valid activeConnector — sectioned mode is profile-driven. */
    const askSectioned = async (entryId: number, q: string, runId: string) => {
        if (!props.activeConnector) {
            finalize(entryId, { error: "Sectioned chat requires an active AI profile." }, "failed");
            return;
        }
        const sections = SECTIONED_DEFAULT_SECTIONS.slice();
        const descriptors: SectionDescriptor[] = sections.map(id => ({ id }));
        const initialStates: Record<string, SectionState> = {};
        for (const id of sections) initialStates[id] = { status: "pending" };

        // Promote the entry into the "polling" UX state (re-uses the same
        // visual chrome the flat-mode polling uses) and attach the empty
        // section grid so SectionedAnswer can render the skeleton.
        setHistory(prev => prev.map(h => h.id === entryId ? {
            ...h,
            status: "polling",
            sectionDescriptors: descriptors,
            sectionStates: initialStates,
            isStreamingSections: true,
        } : h));

        const ctrl = new AbortController();
        abortControllers.current.set(entryId, ctrl);
        stageEnd(runId, "submit");
        stageStart(runId, "polling", `sectioned profile=${props.activeConnector}`);

        try {
            await streamSectionedAnswer({
                profile: props.activeConnector,
                userPrompt: q,
                sections,
                pack: props.packSelection?.pack,
                subVertical: props.packSelection?.subVertical,
                discoveryContext: snapshot ? summariseSnapshotForRequest(snapshot) : undefined,
                signal: ctrl.signal,
                onEvent: (event) => {
                    if (event.kind === "section-started" && event.sectionId) {
                        const sid = event.sectionId;
                        setHistory(prev => prev.map(h => h.id === entryId ? {
                            ...h,
                            sectionStates: {
                                ...(h.sectionStates ?? {}),
                                [sid]: { status: "streaming" },
                            },
                        } : h));
                    } else if (event.kind === "section-completed" && event.sectionId) {
                        const sid = event.sectionId;
                        setHistory(prev => prev.map(h => h.id === entryId ? {
                            ...h,
                            sectionStates: {
                                ...(h.sectionStates ?? {}),
                                [sid]: {
                                    status: "completed",
                                    body: event.body,
                                    ...(event.usage ? { usage: event.usage } : {}),
                                    ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
                                },
                            },
                        } : h));
                    } else if (event.kind === "section-failed" && event.sectionId) {
                        const sid = event.sectionId;
                        setHistory(prev => prev.map(h => h.id === entryId ? {
                            ...h,
                            sectionStates: {
                                ...(h.sectionStates ?? {}),
                                [sid]: {
                                    status: "failed",
                                    error: event.error ?? { message: "section failed" },
                                    ...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
                                },
                            },
                        } : h));
                    } else if (event.kind === "all-completed") {
                        finalize(entryId, { isStreamingSections: false }, "completed");
                    } else if (event.kind === "orchestrator-failed") {
                        finalize(entryId, {
                            error: event.error?.message ?? "Sectioned stream failed.",
                            isStreamingSections: false,
                        }, "failed");
                    }
                },
            });
        } catch (err) {
            if ((err as { name?: string })?.name === "AbortError") return; // user Stop / unmount
            const msg = err instanceof Error ? err.message : String(err);
            finalize(entryId, { error: msg, isStreamingSections: false }, "failed");
        }
    };

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

        // Thread C — when sectioned chat is enabled, dispatch to the SSE
        // path instead of the classic single-message flow. Default-off
        // feature flag protects existing UX; users opt in via localStorage.
        if (isSectionedChatEnabled()) {
            void askSectioned(entryId, q, runId);
            return;
        }

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
                {/* UX-ARCH-0B.2 follow-up 2026-05-23 — pack-context subtitle
                    removed from the composer header. The pack is a setting;
                    its value belongs in Settings → AI, not on every chat
                    render. Kept the test-id'd element as a hidden SR-only
                    span so a11y consumers + existing tests still find the
                    current pack on demand. */}
                <span
                    className="pp-ai-sidebar__pack-indicator"
                    data-testid="pp-ai-sidebar-pack-indicator"
                    style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
                >
                    {packIndicator}
                </span>
            </header>
            {/* Intro paragraph is onboarding copy. Show ONLY on empty state
                (no history yet); fade out once the user starts a conversation
                so the chat surface stays clean. */}
            {history.length === 0 && (
                <p className="pp-ai-sidebar__intro">
                    Ask about whatever's loaded.{" "}
                    {props.recentEvents.length > 0
                        ? `${props.recentEvents.length} BI event${props.recentEvents.length === 1 ? "" : "s"} captured for context.`
                        : "BI events are captured for context as you interact."}
                </p>
            )}
            <div className="pp-ai-sidebar__history">
                {history.map(h => (
                    <AnswerEntryView
                        key={h.id}
                        entry={h}
                        onStop={() => stopEntry(h.id, "stopped by user")}
                        onRetry={() => retry(h.id)}
                        metricRules={metricRulesForRender}
                    />
                ))}
            </div>
            <div className="pp-ai-sidebar__composer">
                {/* UX-ARCH-0B.2 follow-up 2026-05-23 — FramePicker disclosure
                    auto-hides when no reachable frames exist OR discovery is
                    still loading. Previously the "Use a frame…" pill showed
                    on every render even with nothing to pick. The composer
                    now leads with just the textarea + buttons until frames
                    are actually available. */}
                {snapshot?.fused.reachableFrames && snapshot.fused.reachableFrames.length > 0 && (
                    <details className="pp-ai-sidebar__frame-disclosure">
                        <summary>
                            <span className="pp-ai-sidebar__frame-disclosure-label">
                                Use a frame
                            </span>
                            {selectedFrame ? (
                                <span className="pp-ai-sidebar__frame-disclosure-chip">
                                    {snapshot.fused.reachableFrames.find(f => f.frameId === selectedFrame)?.label ?? selectedFrame}
                                </span>
                            ) : (
                                <span className="pp-ai-sidebar__frame-disclosure-hint">
                                    Optional · pick an analysis frame
                                </span>
                            )}
                        </summary>
                        <FramePicker
                            snapshot={snapshot}
                            loading={discoveryLoading}
                            value={selectedFrame}
                            onChange={setSelectedFrame}
                            compact
                        />
                    </details>
                )}
                <div className="pp-ai-sidebar__composer-row">
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
                {/* UX-ARCH-0B.2 follow-up 2026-05-23 — sustainability chip
                    removed from the composer. The single-source sustainability
                    gauge lives once in App.tsx as a fixed bottom-right orb;
                    duplicate mounts cluttered the input area without signal. */}
            </div>
        </section>
    );
}

/** Per-entry rendering: question + status + structured response sections. */
function AnswerEntryView(props: {
    entry: AnswerEntry;
    onStop: () => void;
    onRetry: () => void;
    /** Thread D — metric direction rules from settings; threaded into
     *  renderMarkdown so table cells matching a rule get a tone tint. */
    metricRules?: { structured?: string; legacy?: string };
}) {
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

            {entry.artifactStatus && (
                <div className="pp-ai-sidebar__status" style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
                    <TrustBadge status={entry.artifactStatus} statusReason={entry.artifactStatusReason} />
                </div>
            )}

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

            {entry.sectionDescriptors && entry.sectionStates && (
                // Thread C — when the entry carries sectionDescriptors,
                // render the structured multi-section view instead of
                // the flat markdown bubble. Each section is a string
                // body emitted by Genie, so we route it through
                // renderMarkdown for consistent inline formatting +
                // metric tone coloring. Section state pending /
                // streaming / failed renders skeleton + spinner +
                // inline error envelope respectively.
                <div className="pp-ai-sidebar__a" style={{ marginTop: 4 }}>
                    <strong>AI:</strong>
                    <SectionedAnswer
                        sections={entry.sectionDescriptors}
                        sectionStates={entry.sectionStates}
                        isStreaming={!!entry.isStreamingSections}
                        renderBody={(_id, body) =>
                            typeof body === "string"
                                ? renderMarkdown(body, props.metricRules ? { metricRules: props.metricRules } : undefined)
                                : null
                        }
                    />
                </div>
            )}

            {!entry.sectionDescriptors && entry.answer && (
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
                        {renderMarkdown(entry.answer, props.metricRules ? { metricRules: props.metricRules } : undefined)}
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
