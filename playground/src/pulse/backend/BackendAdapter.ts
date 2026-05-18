/**
 * BackendAdapter — Session 53 spike for IDEA-023.
 *
 * Purpose: define a connector-agnostic interface so the visual can talk to
 * any analytics backend (Databricks Genie today, Azure OpenAI / AWS Bedrock
 * tomorrow) through the same surface. The product vision is plug-and-play:
 * an author drops in a connector + credentials and the AI Insights / Chat
 * tabs work without any visual code change.
 *
 * Two connector shapes match how the existing code is organised:
 *
 *   SingleSpaceBackend  — one upstream backend (one Genie space, one
 *                         OpenAI deployment, one Bedrock model). The visual
 *                         orchestrates the multi-stage Insights pipeline
 *                         by issuing N sequential conversations to this
 *                         backend.
 *
 *   SupervisorBackend   — server-side orchestrator that fans out to multiple
 *                         SingleSpaceBackends and returns ONE synthesized
 *                         answer per conversation. The visual issues the
 *                         same call shape but receives a pre-merged result.
 *
 * **Current state (Session 53):** GenieClient in `../genie.ts` already
 * implements both shapes (Direct / Proxy / Supervisor / Gateway / Azure
 * OpenAI / Bedrock connection modes via `connectionMode` discriminator).
 * This file extracts the contract those public methods conform to so:
 *   - future connectors can ship as separate files without touching genie.ts
 *   - the visual can type-check against the interface, not the concrete class
 *   - we can stub / mock backends in tests
 *
 * **Migration plan:**
 *   1. (this commit) Add the interface + stub files. No runtime change.
 *   2. (next session) Make GenieClient `implements SingleSpaceBackend` /
 *      `SupervisorBackend` so the compiler enforces conformance.
 *   3. (next session) Wire a BackendFactory that picks the right adapter
 *      based on `connectionMode` instead of GenieClient's internal switching.
 *   4. (later) Implement BedrockBackend / OpenAIBackend / FabricBackend as
 *      separate files conforming to the same interface.
 *
 * **Why we don't refactor GenieClient now:** the existing class works,
 * tests cover it (via vitest), and a big-bang refactor under live testing
 * pressure would risk regressions. The interface lets future connectors
 * land alongside the Genie one rather than replacing it.
 */

import {
    AssistantIntent,
    AssistantHomePayload,
    AssistantProfileMetadata,
    AssistantRouteMeta,
    ConfidenceRequest,
    ConfidenceResult,
    GenieFeedbackPayload,
    GenieHistoryEntry,
    GenieHistoryPayload,
    GenieMessage,
    InsightsConfigSuggestion,
    ProxyHealthInfo,
    SupervisorStreamCallbacks,
    SupervisorStreamResult,
} from "../genie";

/**
 * Result of starting or continuing a conversation. Mirrors GenieClient's
 * `ConversationStartResult` so existing callers don't break. Backends MUST
 * normalize to this shape regardless of upstream API. For supervisor
 * responses that are synchronous (return a final answer on start), the
 * synthesized result is JSON-packed into messageId so the visual's polling
 * loop can unpack without an extra round-trip.
 */
export interface ConversationResult {
    conversationId: string;
    messageId: string;
    /** Route metadata describing which downstream backend(s) handled the request. Re-uses Genie's existing AssistantRouteMeta shape for compatibility. */
    route?: AssistantRouteMeta;
}

export interface ConversationOptions {
    intent?: AssistantIntent;
    /** PBI DataView-derived context (dimensions, measures, filter values, governance posture). */
    contextText?: string;
}

/**
 * Progress callback signature matches GenieClient.waitForMessageWithProgress
 * today — receives the raw upstream status string ("PENDING_WAREHOUSE",
 * "ASKING_AI", "EXECUTING_QUERY", etc.). Callers wrap this with a
 * label-formatter (`formatGenieStatus`) for UI display.
 *
 * Future cleanup (post phase 3): widen to a structured event so backends
 * can convey poll count + elapsed without parsing strings. Out of scope
 * for the conformance phase since GenieClient already shipped.
 */
export type ProgressCallback = (status: string) => void;

/**
 * Optional streaming callback — called by backends that support SSE/NDJSON
 * token streaming as partial content accumulates. Callers use this to update
 * the section content incrementally so the UI renders section-by-section as
 * tokens arrive rather than waiting for the full response.
 *
 * Only implemented by FoundationModelStreamBackend today. All other backends
 * ignore it — the 4th parameter of waitForMessageWithProgress is optional.
 *
 * Argument: the full accumulated content string up to this point (not just
 * the new token) so callers can replace the rendered content rather than
 * appending, which is simpler and race-condition-free.
 */
export type ContentChunkCallback = (accumulatedContent: string) => void;

/**
 * SINGLE-SPACE CONNECTOR — one upstream backend. The visual orchestrates
 * multi-stage Insights pipelines by issuing N sequential calls.
 *
 * Implemented today by GenieClient when `connectionMode` is one of:
 *   - "proxy" (route through UniBridge proxy)
 *   - "direct" (browser → Databricks REST with PAT, dev only)
 *   - "gateway" (Databricks AI Gateway / MCP — wired but not end-to-end)
 *   - "azure-openai" (proxy → Azure OpenAI Chat Completions)
 *   - "bedrock" (proxy → AWS Bedrock RetrieveAndGenerate)
 *
 * Future SingleSpaceBackend implementations can sit in their own file
 * (e.g. `BedrockBackend.ts`) and be selected by a BackendFactory.
 */
/* Note on signature widths: callers in the existing codebase pass either
 * a request string OR an arbitrary object (the supervisor packs JSON
 * payloads, the visual passes pre-built request structs). Until the next
 * cleanup pass, this interface accepts `any` for `request` so GenieClient
 * conforms without breaking any caller. The contract intent is captured
 * in the JSDoc — `string | { content: string }` is the canonical happy path. */
export interface SingleSpaceBackend {
    /** Start a new conversation thread. Returns conversation + first message ID. */
    startConversation(request: any, options?: ConversationOptions): Promise<ConversationResult>;
    /** Continue an existing conversation thread. */
    sendMessage(conversationId: string, request: any, options?: ConversationOptions): Promise<ConversationResult>;
    /** Poll until the message reaches a terminal state (COMPLETED / FAILED / CANCELLED).
     *  Streaming backends (FoundationModelStreamBackend) additionally call onContentChunk
     *  as tokens arrive so the caller can render content progressively. Poll-based backends
     *  (Genie, OpenAI, Bedrock) ignore the 4th argument — it is always optional. */
    waitForMessageWithProgress(conversationId: string, messageId: string, onProgress?: ProgressCallback, onContentChunk?: ContentChunkCallback): Promise<GenieMessage>;
    /** Abort all in-flight requests. */
    cancel(): void;
    /** Cheap connectivity probe — usually a /health-style call. */
    testConnection(): Promise<{ ok: boolean; detail: string }>;
    /** End-to-end probe — small known-answer query. */
    testQuestion(question?: string): Promise<{ ok: boolean; detail: string }>;
    /** Optional: fetch suggested questions / capability cards (Genie home payload). Implementations that don't support this should resolve to an empty payload. */
    getHome(context: any): Promise<AssistantHomePayload>;
}

/**
 * SUPERVISOR CONNECTOR — server-side orchestrator that fans out to multiple
 * upstream backends and returns one synthesized answer per conversation.
 *
 * Implemented today by GenieClient when `connectionMode === "supervisor"`,
 * routing to the proxy's `/supervisor/*` endpoints which run a Mosaic AI
 * meta-agent that calls multiple Genie spaces.
 *
 * Future SupervisorBackend implementations could route to:
 *   - A custom Bedrock Agent that orchestrates other Bedrock models
 *   - Azure AI Foundry's Agent service
 *   - A homegrown LangGraph / LlamaIndex orchestrator
 */
export interface SupervisorBackend extends Omit<SingleSpaceBackend, "getHome"> {
    /** Streaming variant — receive per-helper progress events as the supervisor fans out. Signature matches GenieClient: `(content, callbacks, contextText?)`. */
    startSupervisorStream(content: string, callbacks: SupervisorStreamCallbacks, contextText?: string): Promise<SupervisorStreamResult>;
    /** List of downstream profiles/spaces this supervisor can route to. */
    getProfiles(): Promise<AssistantProfileMetadata[]>;
}

/**
 * EXTRAS — capabilities optional for any backend. Most are proxy-only
 * (feedback log, history persistence, confidence evaluation). Direct mode
 * and pure cloud-AI backends silently no-op these.
 */
export interface BackendExtras {
    // PulsePlay port note: methods made non-optional vs Pulse's original
    // `?` markers because GenieClient implements every one of them today
    // (just no-ops or throws when the backend mode doesn't support the
    // method). visual.tsx calls them without optional chaining; the
    // non-optional contract reflects that reality and unblocks the port.
    submitFeedback(payload: GenieFeedbackPayload): Promise<boolean>;
    saveHistory(entry: GenieHistoryEntry): Promise<void>;
    getHistory(payload: GenieHistoryPayload): Promise<GenieHistoryEntry[]>;
    /** Two-phase confidence: phase-1 fires synchronously (rule-based), phase-2 callback fires when LLM-based reasoning completes. Signature matches GenieClient. */
    evaluateConfidence(payload: ConfidenceRequest, onPhase1: (result: ConfidenceResult) => void, onPhase2?: (result: ConfidenceResult) => void): void;
    /** AI-assisted introspection of bound dimensions/measures. May return null when the backend can't infer (e.g. no schema). */
    suggestInsightsConfig(args: { measures: string[]; dimensions: string[]; sampleContext?: string }): Promise<InsightsConfigSuggestion | null>;
    checkProxyHealth(): Promise<ProxyHealthInfo>;
}

/**
 * Convenience type — any backend the visual can talk to. Single-space
 * methods are required (every backend supports them); supervisor-only
 * methods (`startSupervisorStream`, `getProfiles`) and connector-specific
 * methods (`getHome`) are optional. Callers branch at runtime on the
 * config's `connectionMode` to know which side is safe to invoke.
 *
 * Was a union (`SingleSpaceBackend | SupervisorBackend`) which TypeScript
 * narrowed to the common surface only — that hid `getHome` and
 * `startSupervisorStream` from callers even though GenieClient (the
 * universal adapter today) implements both. Intersection + optional
 * supervisor methods reflects the runtime reality better.
 */
// PulsePlay port note: supervisor methods made non-optional here too —
// GenieClient implements both startSupervisorStream and getProfiles
// today (they no-op or throw when the connectionMode isn't supervisor).
// Keeping them required matches visual.tsx's call patterns.
export type AnyBackend =
    SingleSpaceBackend
    & Pick<SupervisorBackend, "startSupervisorStream" | "getProfiles">
    & BackendExtras;

/**
 * Connector kind discriminator. Used by future BackendFactory to pick
 * the right implementation. The current `connectionMode` enum in
 * `settings.ts` MAPS into this:
 *   "proxy" / "direct" / "azure-openai" / "bedrock" / "gateway" → "single-space"
 *   "supervisor" → "supervisor"
 */
export type ConnectorKind = "single-space" | "supervisor";
