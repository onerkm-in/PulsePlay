/**
 * genie.ts - Databricks-native assistant client
 *
 * IMPORTANT: Uses XMLHttpRequest instead of fetch() because Power BI Desktop
 * custom visuals often block fetch() inside the sandboxed iframe while still
 * allowing XHR when WebAccess is declared in capabilities.json.
 */

export type UserMode = string;
export type AssistantIntent =
    | "performance"
    | "issue"
    | "risk"
    | "opportunity"
    | "drivers"
    | "leadership"
    | "scenario"
    | "summary";
export type OutputMode = "narrative" | "chart" | "table" | "sql" | "trace";

export type ConnectionMode = "auto" | "proxy" | "direct" | "gateway" | "azure-openai" | "bedrock" | "supervisor" | "foundation-model" | "foundation-stream";

export interface GenieSqlSection {
    sectionId: string;
    cteName?: string;
    sqlFragment: string;
    startOffset?: number;
}

export interface AssistantProfileMetadata {
    /** Internal proxy profile key — never displayed to end users. */
    name: string;
    /** Friendly label shown in dropdowns and progress text (BUG-013 fix). */
    displayName?: string;
    /** Short noun phrase covering this helper's data (e.g. "sales data"). */
    dataDomain?: string;
    description?: string;
    spaceId?: string;
}

export interface GenieConfig {
    host: string;
    apiBaseUrl?: string;
    assistantProfile?: string;
    token: string;
    spaceId?: string;
    userMode?: UserMode;
    /** How the visual should reach Databricks. Defaults to "auto". */
    connectionMode?: ConnectionMode;
    /**
     * Optional SQL warehouse ID. When provided in direct mode the visual will
     * auto-start a stopped/terminated warehouse before sending questions, so
     * users aren't stuck waiting on "Statement is waiting for compute".
     */
    warehouseId?: string;
    /**
     * Optional shared secret sent to the proxy as X-Genie-Key. When the proxy
     * is configured to require it, missing/wrong values are rejected with 401.
     * Ignored in direct mode.
     */
    proxyKey?: string;
    // Wave 19 — runtime scope injection. Prepended to every Genie message.
    runtimeForbiddenColumns?: string;
    runtimeMandatoryRowFilter?: string;
    runtimeReadOnlyEnforced?: boolean;
    // Wave 21 — SQL configuration. Full CTE + forbidden tables + RLS hint.
    sqlCtePreamble?: string;
    sqlForbiddenTables?: string;
    sqlRlsHintEnabled?: boolean;
}

const PROXY_HEALTH_CACHE_TTL_MS = 15_000;
const proxyHealthCache = new Map<string, {
    expiresAt: number;
    result?: ProxyHealthInfo;
    inFlight?: Promise<ProxyHealthInfo>;
}>();

export function __clearProxyHealthCacheForTests(): void {
    proxyHealthCache.clear();
}

export interface AssistantAction {
    id: string;
    label: string;
    kind: "ask" | "mode";
    prompt?: string;
    intent?: AssistantIntent;
    viewMode?: OutputMode;
}

export interface AssistantHomeCard {
    label: string;
    value: string;
    detail?: string;
    tone?: "neutral" | "risk" | "opportunity";
}

let requestSequence = 0;

function createRequestId(): string {
    const bytes = new Uint8Array(4);
    try {
        globalThis.crypto?.getRandomValues(bytes);
    } catch {
        // Power BI Desktop can run in constrained iframes. Fall back to a
        // monotonic suffix rather than insecure random numbers.
    }
    const suffix = bytes.some(Boolean)
        ? Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("")
        : `seq${(++requestSequence).toString(36).padStart(4, "0")}`;
    return `pbi-${Date.now()}-${suffix}`;
}

export interface AssistantHomePayload {
    snapshot: AssistantHomeCard[];
    risks: string[];
    opportunities: string[];
    changes: string[];
    suggestedActions: AssistantAction[];
    generatedBy?: "proxy" | "local";
    assistantProfile?: string;
}

export interface AssistantRouteMeta {
    assistantProfile?: string;
    routedSpaceId?: string;
    routedIntent?: string;
    routeLabel?: string;
    source?: string;
    /** Metadata from supervisor agent explaining which spaces were queried */
    spaceResults?: Array<{
        profileName: string;
        ok: boolean;
        status: string;
    }>;
}

export interface GenieMessage {
    id: string;
    status: string;
    content?: string;
    sqlQuery?: string;
    /**
     * Cycle 47.8 — when a Genie response carries multiple SQL queries
     * (multiple `attachments[i].query.query` entries — common when an
     * answer requires combining several queries), this array holds them
     * all in the order Genie returned them. `sqlQuery` continues to
     * point at the first one for backward-compatible callers; the SQL
     * view tabs across `sqlQueries` when length > 1.
     */
    sqlQueries?: string[];
    /**
     * Phase 11b read-side — proxy normalizeGenieResponse augments Genie query
     * attachments with parsed `sqlSections` when the generated SQL contains
     * `/* Section: X *\/` or `-- Section: X` markers. The playground lifts
     * those fragments here so the SQL view can show labelled section tabs
     * while retaining `sqlQuery/sqlQueries` as the raw fallback.
     */
    sqlSections?: GenieSqlSection[];
    queryResult?: { columns: string[]; rows: any[][] };
    error?: string;
    trace?: string[];
    route?: AssistantRouteMeta;
    suggestedActions?: AssistantAction[];
    /**
     * Genie Research Agent / Agent Mode reasoning trace.
     *
     * As of 2026-04-16, Databricks Genie surfaces `attachments[].reasoning_traces`
     * on the Get-message endpoint when a message was started in Agent Mode
     * (in the Databricks Genie UI — REST API still cannot trigger Agent Mode
     * as of 2026-05; see docs/ARCHITECTURE.md "Genie Agent Mode is UI-only").
     *
     * Each trace entry is a step the Research Agent took (planning, sub-query,
     * synthesis). Shape from Databricks API:
     *   { type: "planning" | "query" | "synthesis", description: string, ... }
     *
     * We flatten attachments[].reasoning_traces[] into this top-level array
     * when building the GenieMessage so consumers don't have to walk
     * attachments. Undefined when the message was a normal (non-agent-mode)
     * run, which is most messages today.
     */
    reasoningTraces?: GenieReasoningTraceEntry[];
    /**
     * Suggested follow-up questions for this message — typically rendered as
     * chips below the assistant's response so the user can drill deeper with
     * one click. Databricks Genie's 2026 conversation API GA started populating
     * `attachments[].suggested_questions` (and/or `attachments[].follow_ups`)
     * on the Get-message endpoint when Genie has confident next-step questions.
     * We extract here so consumers don't have to walk attachments. Empty/
     * undefined when Genie didn't suggest any.
     */
    suggestedFollowUps?: string[];
}

/** One step from a Genie Research Agent / Agent Mode reasoning trace.
 *  Field shape mirrors Databricks' API; `kind` is a normalized version of
 *  their `type` so consumers can switch on it safely.
 */
export interface GenieReasoningTraceEntry {
    kind: "planning" | "query" | "synthesis" | "other";
    description?: string;
    detail?: unknown;
}

/**
 * Phase 11b FM symmetry — lift `sqlSections` from a Foundation Model
 * `/foundation/section` response (or any backend that surfaces sections
 * at the top level rather than wrapped in Genie-style `attachments[]`).
 *
 * Returns the same `GenieSqlSection[]` shape `collectGenieSqlFromAttachments`
 * yields, so callers can feed both Genie and FM responses through the
 * same `SqlTabs` render path. Defensive: silently drops entries with a
 * missing sectionId or empty sqlFragment, and tolerates the field being
 * absent (clean fallback to raw markdown rendering).
 *
 * The proxy's `/foundation/section` route emits `sqlSections` at the
 * top level only when `/* Section: X *\/` markers are present inside a
 * ```sql code fence in the LLM output. When the field is missing, FM
 * responses fall back to whatever `content`/`rawContent` rendering the
 * caller does today.
 */
export function liftFmSqlSections(response: unknown): GenieSqlSection[] {
    if (!response || typeof response !== "object") return [];
    const raw = (response as { sqlSections?: unknown }).sqlSections;
    if (!Array.isArray(raw)) return [];
    const out: GenieSqlSection[] = [];
    for (const entry of raw) {
        const sectionId = typeof (entry as { sectionId?: unknown })?.sectionId === "string"
            ? (entry as { sectionId: string }).sectionId.trim()
            : "";
        const sqlFragment = typeof (entry as { sqlFragment?: unknown })?.sqlFragment === "string"
            ? (entry as { sqlFragment: string }).sqlFragment.trim()
            : "";
        if (!sectionId || !sqlFragment) continue;
        const cteName = typeof (entry as { cteName?: unknown })?.cteName === "string"
            && (entry as { cteName: string }).cteName.trim()
            ? (entry as { cteName: string }).cteName.trim()
            : undefined;
        const offsetRaw = (entry as { startOffset?: unknown })?.startOffset;
        const startOffset = Number.isFinite(Number(offsetRaw)) ? Number(offsetRaw) : undefined;
        out.push({ sectionId, cteName, sqlFragment, startOffset });
    }
    return out;
}

export function collectGenieSqlFromAttachments(attachments: any[] | undefined | null): { queries: string[]; sections: GenieSqlSection[] } {
    const queries: string[] = [];
    const sections: GenieSqlSection[] = [];
    const list = Array.isArray(attachments) ? attachments : [];
    for (const att of list) {
        const q = att?.query;
        if (!q) continue;
        const sql = (typeof q.query === "string" && q.query.trim())
            ? q.query.trim()
            : (typeof q.text === "string" && q.text.trim() ? q.text.trim() : "");
        if (sql) queries.push(sql);
        const rawSections = Array.isArray(q.sqlSections) ? q.sqlSections : [];
        for (const raw of rawSections) {
            const sectionId = typeof raw?.sectionId === "string" ? raw.sectionId.trim() : "";
            const sqlFragment = typeof raw?.sqlFragment === "string" ? raw.sqlFragment.trim() : "";
            if (!sectionId || !sqlFragment) continue;
            const cteName = typeof raw?.cteName === "string" && raw.cteName.trim() ? raw.cteName.trim() : undefined;
            const startOffset = Number.isFinite(Number(raw?.startOffset)) ? Number(raw.startOffset) : undefined;
            sections.push({ sectionId, cteName, sqlFragment, startOffset });
        }
    }
    return { queries, sections };
}

export interface GenieFeedbackPayload {
    conversationId?: string | null;
    messageId?: string | null;
    rating: "up" | "down";
    comment?: string;
    feedbackComment?: string;
    feedbackReason?: string;
    question?: string;
    answer?: string;
    sql?: string;
    trace?: string[];
    scope?: string;
    assistantProfile?: string;
    routeLabel?: string;
    viewerUserKey?: string;
    viewerRole?: string;
    spaceLabel?: string;
}

export interface GenieHistoryEntry {
    id: string;
    ts: string;
    viewerUserKey: string;
    viewerRole?: string;
    assistantProfile?: string;
    spaceLabel?: string;
    conversationId?: string | null;
    messageId?: string | null;
    question?: string;
    answer?: string;
    sql?: string;
    trace?: string[];
    rating?: "up" | "down";
    feedbackComment?: string;
    feedbackReason?: string;
    scope?: string;
    routeLabel?: string;
}

export interface GenieHistoryPayload {
    viewerUserKey?: string;
    viewerRole?: string;
    includeAll?: boolean;
    assistantProfile?: string;
    limit?: number;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceResult {
    score: number;
    level: ConfidenceLevel;
    signals: string[];
    businessReason?: string;
}

export interface ConfidenceRequest {
    attachments: any[];
    profileName: string;
    conversationId: string | null;
    question: string;
}

interface ConversationStartResult {
    conversationId: string;
    messageId: string;
    route?: AssistantRouteMeta;
}

// 49.20 / IDEA-037 phase 4 — AI-assisted introspection result. The LLM is asked
// to look at bound dimensions/measures and propose a domain label + a few
// domain-specific custom sections. The visual then offers the suggestion to
// the author who can Apply, Pick & choose, or Dismiss.
export interface InsightsConfigSuggestion {
    /** Short domain label, e.g. "Sales Performance", "Supply Chain Operations". */
    domain: string;
    /** 0..1 — how confident the LLM is in the domain classification. */
    confidence: number;
    /** One-sentence justification (e.g. "Bound measures include lead_time_days,
     *  fill_rate, on_time_in_full — these are characteristic supply-chain KPIs."). */
    rationale: string;
    /** 2-4 domain-specific section recommendations to populate insightsCustomSections. */
    suggestedSections: { name: string; instruction: string }[];
    /**
     * Wave 41 PREP — optional metric direction rule suggestions. Plumbing-only
     * in this wave: the visual fetches them via fetchSuggestedMetricRules()
     * and stores the array on the suggestion alongside the existing fields.
     * Wave 41 cycle 12 wires the UI in setupStep5.tsx to render an
     * "Apply rules?" panel next to the existing "Apply sections?" panel.
     *
     * Source-attribution semantics:
     *   - "space-instructions" : derived from Genie space description / instructions
     *   - "measure-name"       : derived from the measure name vocabulary
     *   - "data-distribution"  : threshold defaults from p25/p75 of bound data
     *   - "industry-pattern"   : generic template (low confidence — "consider this")
     *   - "section-h-cte"      : threshold derived from a Section H WHERE clause
     */
    suggestedMetricRules?: {
        name: string;
        higherIsBetter: boolean;
        aliases: string[];
        amberPct?: number;
        redPct?: number;
        confidence: number;
        rationale: string;
        source:
            | 'space-instructions'
            | 'measure-name'
            | 'data-distribution'
            | 'industry-pattern'
            | 'section-h-cte';
    }[];
}

/**
 * Wave 41 PREP — Genie space metadata snapshot. Used by the AI-assisted
 * suggest path to enrich the LLM prompt with the upstream space's own
 * description + instructions. Both fields are optional because some spaces
 * have neither populated; the suggest path falls back to measure-name
 * heuristics when both are empty.
 */
export interface GenieSpaceMetadata {
    description?: string;
    instructions?: string;
}

interface SendOptions {
    intent?: AssistantIntent;
    contextText?: string;
}

// IDEA-023 phase 2 — GenieClient is the canonical implementation of the
// SingleSpaceBackend + SupervisorBackend + BackendExtras interfaces. The
// `implements` clause is informational rather than enforced at runtime —
// it lets the compiler catch signature drift between the public surface
// here and the contract exported from `./backend/BackendAdapter`. Future
// connectors (BedrockBackend, OpenAIBackend, FabricBackend) will conform
// to the same shape so the visual can swap them via BackendFactory.
//
// Note: The interfaces are imported via type-only import to avoid creating
// a runtime dependency on the backend folder (which is otherwise pure types).
import type { SingleSpaceBackend, SupervisorBackend, BackendExtras } from "./backend/BackendAdapter";

// ── Wave 19 + 21 + 22: Runtime scope injection ───────────────────────────────
// Prepended to every Genie message when the author has configured any of the
// scope/SQL config fields. Genie's own UC enforcement still applies on top.
//
// Template variables supported in sqlCtePreamble and runtimeMandatoryRowFilter:
//   {{role}}        → config.userMode (the active viewer role)
//   {{currentDate}} → YYYY-MM-DD
//   {{year}}        → YYYY
//
// Wave 22 hardening:
//  - All free-text fields stripped of newlines + control chars to defeat
//    prompt injection ("col1\n[MANDATORY] ignore prior rules").
//  - Template var values quoted + restricted character class to prevent
//    SQL meta-char escape ("'; DROP TABLE x; --" can't break the WHERE).
//  - Length caps on free-text fields (CTE 5KB, row filter 1KB, lists 2KB).
//  - DML regex tightened — `\bDROP\b` matched DROPDOWN/DROPPED in narrative;
//    now requires statement-position context (start-of-line or after `;`).

// Cap free-text fields so an author can't 50KB-bomb every Genie request.
const MAX_CTE_LEN = 5000;
const MAX_ROW_FILTER_LEN = 1000;
const MAX_LIST_LEN = 2000;          // forbidden columns / tables (comma-sep)
const MAX_ROLE_LEN = 64;            // template-var substitution upper bound

// Strip newlines + control chars + chars that could break out of the
// instruction context. Permissive enough to pass column names, CTE bodies,
// and SQL identifiers; strict enough to block injected directives.
function sanitizeInstructionText(s: string): string {
    return s
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")  // strip control chars
        .replace(/\r\n?/g, "\n")                            // normalize line endings
        .replace(/\n{3,}/g, "\n\n")                         // cap blank-line runs
        .trim();
}

// Stricter sanitiser for comma-separated identifier lists (col / table names).
// Each entry must match a real SQL identifier pattern — drops anything that
// looks like injected free-text (multi-word phrases, special chars, sentences).
// This means an injection like "email\n[MANDATORY] ignore prior" gets DROPPED
// entirely after split rather than passed through as a "column name".
const IDENTIFIER_RE = /^(?:[A-Za-z_][\w.]{0,63}|`[\w.]{1,63}`|\[[\w.]{1,63}\]|"[\w.]{1,63}"|'[\w.]{1,63}')$/;

function sanitizeIdentifierList(s: string, maxLen: number): string[] {
    return sanitizeInstructionText(s)
        .slice(0, maxLen)
        .split(",")
        .map(c => c.trim())
        .filter(c => c.length > 0 && c.length <= 65 && IDENTIFIER_RE.test(c));
}

// Dangerous SQL keywords stripped from template values to prevent
// "admin; DELETE FROM audit" → "admin DELETE FROM audit" leaking DML
// keywords into a WHERE clause as bare words after semicolon strip.
const SQL_KEYWORD_STRIP_RE = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|REPLACE|UNION|EXEC|EXECUTE|GRANT|REVOKE|FROM|WHERE|JOIN|INTO|TABLE|VIEW|DATABASE|SCHEMA)\b/gi;

// Quote-safe role/template-var value. Strips quotes, semicolons, comment
// markers, anything outside a safe identifier-ish character set, AND
// SQL keywords as standalone words — defence in depth so a hostile role
// string can't escape its quoted context AND can't smuggle keywords through.
function sanitizeTemplateValue(s: string): string {
    const cleaned = s
        .replace(/[';"\\\r\n\t]/g, "")
        .replace(/--/g, "")
        .replace(/\/\*/g, "")
        .replace(/\*\//g, "")
        .replace(/[^\w\-. ]/g, "")
        .slice(0, MAX_ROLE_LEN)
        .replace(SQL_KEYWORD_STRIP_RE, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned;
}

// DML detection — Wave 22 tightened. Each DML verb requires its own
// expected followup pattern so identifier names like CREATED_AT,
// UPDATED_BY, DELETED_FLAG and narrative phrases like "the DROPDOWN
// selector" or "records dropped from the set" don't false-flag.
const DML_RE = new RegExp(
    "(?:^|;|\\n)\\s*(?:" +
        "INSERT\\s+INTO" +
        "|UPDATE\\s+[\\w\\.\\[\\]`\"']+\\s+SET" +
        "|DELETE\\s+FROM" +
        "|DROP\\s+(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER|IF)" +
        "|CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER)" +
        "|ALTER\\s+(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA)" +
        "|TRUNCATE\\s+(?:TABLE\\s+)?[\\w\\.\\[\\]`\"']" +
        "|MERGE\\s+INTO" +
        "|REPLACE\\s+INTO" +
    ")",
    "i"
);

function applyTemplateVars(text: string, config: GenieConfig): string {
    const today = new Date();
    const yyyy = today.getFullYear().toString();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const safeRole = sanitizeTemplateValue(config.userMode || "viewer");
    return text
        .replace(/\{\{role\}\}/gi, safeRole)
        .replace(/\{\{currentDate\}\}/gi, `${yyyy}-${mm}-${dd}`)
        .replace(/\{\{year\}\}/gi, yyyy);
}

export function buildRuntimeScopePrefix(config: Pick<GenieConfig,
    "runtimeForbiddenColumns" | "runtimeMandatoryRowFilter" | "runtimeReadOnlyEnforced" |
    "sqlCtePreamble" | "sqlForbiddenTables" | "sqlRlsHintEnabled" | "userMode">
): string {
    const parts: string[] = [];

    // ── Section C governance rules ──────────────────────────────────────────
    const forbiddenCols = sanitizeIdentifierList(config.runtimeForbiddenColumns || "", MAX_LIST_LEN);
    if (forbiddenCols.length > 0) {
        parts.push(`[MANDATORY] DO NOT query, reference, or expose the following columns in any SQL or answer: ${forbiddenCols.join(", ")}.`);
    }

    const rowFilterRaw = sanitizeInstructionText(config.runtimeMandatoryRowFilter || "").slice(0, MAX_ROW_FILTER_LEN);
    const rowFilter = applyTemplateVars(rowFilterRaw, config as GenieConfig);
    if (rowFilter) {
        parts.push(`[MANDATORY] Every SQL query MUST include the filter: WHERE ${rowFilter} (or AND ${rowFilter} if there is already a WHERE clause).`);
    }

    if (config.runtimeReadOnlyEnforced) {
        parts.push("[MANDATORY] Only SELECT statements are permitted. Do NOT generate INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, or MERGE statements for any reason.");
    }

    // ── Section H SQL configuration ─────────────────────────────────────────
    const cteRaw = sanitizeInstructionText(config.sqlCtePreamble || "").slice(0, MAX_CTE_LEN);
    const ctePreamble = applyTemplateVars(cteRaw, config as GenieConfig);
    if (ctePreamble) {
        parts.push(
            `[MANDATORY] You MUST use the following CTE preamble in every SQL query you write. ` +
            `Build all analysis exclusively on top of this pre-filtered dataset — do NOT query the ` +
            `underlying base tables directly:\n\`\`\`sql\n${ctePreamble}\n\`\`\``
        );
    }

    const forbiddenTables = sanitizeIdentifierList(config.sqlForbiddenTables || "", MAX_LIST_LEN);
    if (forbiddenTables.length > 0) {
        parts.push(`[MANDATORY] DO NOT reference or query the following tables/views in any SQL: ${forbiddenTables.join(", ")}.`);
    }

    if (config.sqlRlsHintEnabled && config.userMode) {
        const safeRole = sanitizeTemplateValue(config.userMode);
        if (safeRole) {
            parts.push(`[Context] Current viewer role: "${safeRole}". Apply role-appropriate row scoping in every SQL query.`);
        }
    }

    if (parts.length === 0) return "";
    return `[Governance rules enforced by this report — follow exactly]:\n${parts.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n`;
}

export function containsDml(text: string): boolean {
    return DML_RE.test(text);
}

// Wave 22 cycle 3b: detect DML AND return the matched verb so the banner
// can say "Detected DROP statement" instead of the generic "DML detected".
// Returns the uppercase verb (DROP, DELETE, INSERT, etc.) or null.
export function detectDmlKeyword(text: string): string | null {
    const m = text.match(DML_RE);
    if (!m) return null;
    // Extract the leading SQL verb out of the matched substring.
    const verb = m[0].match(/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|REPLACE)\b/i);
    return verb ? verb[0].toUpperCase() : null;
}

// Exported only for tests. Not part of the public API.
export const __wave22_internals = {
    sanitizeInstructionText,
    sanitizeIdentifierList,
    sanitizeTemplateValue,
    applyTemplateVars,
    MAX_CTE_LEN,
    MAX_ROW_FILTER_LEN,
    MAX_LIST_LEN,
    MAX_ROLE_LEN,
};

export class GenieClient implements SingleSpaceBackend, SupervisorBackend, BackendExtras {
    private config: GenieConfig;
    private activeXhrs: XMLHttpRequest[] = [];

    // Wave 22 cycle 3e: memoize the assembled scope prefix so we don't
    // re-sanitize + re-substitute on every send. Cache key is a compact
    // string fingerprint of just the 7 fields the prefix actually depends on.
    private cachedScopePrefix: { key: string; value: string } | null = null;

    constructor(config: GenieConfig) {
        this.config = config;
    }

    private getScopePrefix(): string {
        const c = this.config;
        const key = [
            c.runtimeForbiddenColumns || "",
            c.runtimeMandatoryRowFilter || "",
            c.runtimeReadOnlyEnforced ? "1" : "0",
            c.sqlCtePreamble || "",
            c.sqlForbiddenTables || "",
            c.sqlRlsHintEnabled ? "1" : "0",
            c.userMode || "",
        ].join("\x1F");
        if (this.cachedScopePrefix && this.cachedScopePrefix.key === key) {
            return this.cachedScopePrefix.value;
        }
        const value = buildRuntimeScopePrefix(c);
        this.cachedScopePrefix = { key, value };
        return value;
    }

    public cancel(): void {
        this.activeXhrs.forEach(xhr => xhr.abort());
        this.activeXhrs = [];
    }

    private isSupervisorMode(): boolean {
        return this.config.connectionMode === "supervisor";
    }

    // Direct mode: browser → Databricks REST with PAT, no proxy. Dev / lower
    // env only. CORS is permitted by PBI Desktop's WebAccess allowlist for
    // *.azuredatabricks.net / *.cloud.databricks.com / *.databricks.com.
    private isDirectMode(): boolean {
        return this.config.connectionMode === "direct";
    }

    private getBaseUrl(): string {
        const base = (this.config.apiBaseUrl || "").replace(/\/$/, "");
        if (this.isSupervisorMode()) {
            return `${base}/supervisor`;
        }
        return `${base}/assistant`;
    }

    /**
     * Wave 31 — attach inline-credentials headers when the visual has
     * host/token/spaceId filled in. These travel alongside the existing
     * X-Genie-Key + X-Assistant-Profile headers; the proxy uses them as
     * a transient profile when all three are present, otherwise falls
     * back to the named-profile lookup.
     *
     * Direct mode never reaches this helper — it talks straight to
     * Databricks with the PAT in the Authorization header. Supervisor
     * mode uses a synthesised host on the proxy side, so we still
     * forward the credentials here only when host AND token AND
     * spaceId are all populated (matching the proxy gate exactly).
     */
    private attachInlineCredentialsHeaders(xhr: XMLHttpRequest): void {
        const host = (this.config.host || "").trim();
        const token = (this.config.token || "").trim();
        const spaceId = (this.config.spaceId || "").trim();
        // Same gate as the proxy — all three required, otherwise no headers.
        if (!host || !token || !spaceId) return;
        try {
            xhr.setRequestHeader("X-Databricks-Host", host);
            xhr.setRequestHeader("X-Databricks-Token", token);
            xhr.setRequestHeader("X-Genie-Space-Id", spaceId);
            // Profile name is informational (audit-log label only).
            const profileLabel = (this.config.assistantProfile || "").trim();
            if (profileLabel) xhr.setRequestHeader("X-Profile-Name", profileLabel);
        } catch {
            // Defensive — XHR setRequestHeader can throw "InvalidStateError"
            // if called after send(). Fail closed: drop the inline creds and
            // let the named-profile path take over.
        }
    }

    private getDirectBase(): string {
        return (this.config.host || "").replace(/\/$/, "");
    }

    // Cycle 37 — Databricks Genie returns the SQL it generated inside
    // attachments[i].query.query for any data-bound stage. Neither the
    // proxy nor the previous visual code lifted it onto the top-level
    // `sqlQuery` field that visual.tsx expects. Result: per-section
    // View SQL was never populated for Genie mode (only for OpenAI /
    // Bedrock orchestrator paths which do set sqlQuery server-side).
    // Same applies to queryResult (columns + rows live at
    // attachments[i].query.result.{columns,data_table}). This helper
    // pulls the first non-empty query attachment and lifts both onto
    // the message object before we hand it back to the caller.
    private hydrateGenieFields(res: any): void {
        if (!res) return;
        const attachments = Array.isArray(res?.attachments) ? res.attachments : [];
        const collected = collectGenieSqlFromAttachments(attachments);
        // Already fully populated (proxy did it for us, including the
        // multi-query array). Keep going only when Phase 11b sqlSections
        // are present in attachments but not lifted yet.
        if (
            res.sqlQuery
            && Array.isArray(res.sqlQueries)
            && res.sqlQueries.length > 0
            && (Array.isArray(res.sqlSections) || collected.sections.length === 0)
        ) return;
        // Cycle 47.8 — collect ALL non-empty SQL attachments so the SQL
        // view can tab across them. Pre-cycle behaviour kept only the
        // first; a Genie response with multiple queries silently dropped
        // the rest. `sqlQuery` still holds the first for legacy callers
        // (insightsCache, copy-icon fallback, etc.).
        const collectedSql = collected.queries;
        for (const att of attachments) {
            const q = att?.query;
            if (!q) continue;
            // queryResult — keep the first complete table only (UI doesn't
            // tab data tables this cycle; that's a separate UX decision).
            const result = q.result;
            if (result && !res.queryResult) {
                const cols = Array.isArray(result.columns) ? result.columns : [];
                const rows = Array.isArray(result.data_table) ? result.data_table : [];
                if (cols.length > 0) {
                    res.queryResult = {
                        columns: cols.map((c: any) => typeof c === "string" ? c : (c?.name ?? "")),
                        rows
                    };
                }
            }
        }
        if (collectedSql.length > 0) {
            if (!res.sqlQuery) res.sqlQuery = collectedSql[0];
            if (!Array.isArray(res.sqlQueries) || res.sqlQueries.length === 0) {
                res.sqlQueries = collectedSql;
            }
        }
        if (collected.sections.length > 0 && !Array.isArray(res.sqlSections)) {
            res.sqlSections = collected.sections;
        }

        // 2026-05 — Databricks Genie Research Agent / Agent Mode reasoning trace.
        // Released 2026-04-16. When a message was started in Agent Mode (only
        // possible via the Databricks Genie UI today — REST API still cannot
        // trigger it as of 2026-05; see docs/ARCHITECTURE.md), the response
        // attachments carry a `reasoning_traces` array describing the agent's
        // planning / sub-query / synthesis steps. Flatten across attachments
        // into a top-level array on the GenieMessage so consumers don't have to
        // walk attachments. Skipped silently when the field is absent (most
        // messages today, since Agent Mode is an opt-in toggle in the Genie
        // UI). Shape-tolerant — Databricks may evolve the field structure,
        // so we accept either array-of-strings or array-of-step-objects.
        const flatTraces: any[] = [];
        for (const att of attachments) {
            const raw = att?.reasoning_traces;
            if (!Array.isArray(raw)) continue;
            for (const entry of raw) {
                if (typeof entry === "string") {
                    flatTraces.push({ kind: "other", description: entry });
                    continue;
                }
                if (entry && typeof entry === "object") {
                    const t = String(entry.type ?? entry.kind ?? "").toLowerCase();
                    const kind: "planning" | "query" | "synthesis" | "other" =
                        t === "planning" || t === "query" || t === "synthesis" ? t : "other";
                    flatTraces.push({
                        kind,
                        description: typeof entry.description === "string" ? entry.description
                            : (typeof entry.text === "string" ? entry.text : undefined),
                        detail: entry,
                    });
                }
            }
        }
        if (flatTraces.length > 0 && !Array.isArray(res.reasoningTraces)) {
            res.reasoningTraces = flatTraces;
        }

        // 2026 Genie GA — suggested follow-up questions. Genie now populates
        // `attachments[].suggested_questions` (or the legacy `follow_ups` field
        // in some workspace versions) with short next-step questions the user
        // can click to drill deeper. Walk all attachments, dedupe by string
        // identity, cap at 6 entries (more than that and chip row wraps badly).
        const followUps: string[] = [];
        const seenFollowUps = new Set<string>();
        for (const att of attachments) {
            const candidates = [
                att?.suggested_questions,
                att?.suggestedQuestions,
                att?.follow_ups,
                att?.followUps,
            ].filter(v => Array.isArray(v));
            for (const list of candidates) {
                for (const q of list) {
                    const text = typeof q === "string" ? q.trim()
                        : (q && typeof q.text === "string" ? q.text.trim()
                        : (q && typeof q.question === "string" ? q.question.trim() : ""));
                    if (!text || seenFollowUps.has(text)) continue;
                    seenFollowUps.add(text);
                    followUps.push(text);
                    if (followUps.length >= 6) break;
                }
                if (followUps.length >= 6) break;
            }
            if (followUps.length >= 6) break;
        }
        if (followUps.length > 0 && !Array.isArray(res.suggestedFollowUps)) {
            res.suggestedFollowUps = followUps;
        }
    }

    // BUG-003 client-side mirror — Databricks Genie poll returns the user's
    // question in `data.content` and the AI answer inside attachments[].text.
    // The proxy normalises this server-side; in Direct mode we have to do
    // the same client-side or the prompt leaks into the HEADLINE card.
    private extractAnswerText(data: any): string {
        const attachments = Array.isArray(data?.attachments) ? data.attachments : [];
        const parts: string[] = [];
        for (const att of attachments) {
            const text = att?.text;
            if (typeof text === "string" && text.trim()) {
                parts.push(text.trim());
            } else if (text && typeof text === "object" && text.content && String(text.content).trim()) {
                parts.push(String(text.content).trim());
            }
        }
        return parts.length ? parts.join("\n\n") : "";
    }

    // Wave 30 cycle 4 — friendly status mapping for direct-mode XHR. We never
    // surface raw Databricks error bodies to the user (PII / token leak risk).
    private mapDirectStatusToMessage(status: number, rawText: string): string {
        if (status === 401 || status === 403) {
            return "Authentication failed. Verify the Databricks PAT is valid, not expired, and has Genie space access.";
        }
        if (status === 404) {
            return "Resource not found. Check workspace host and Genie space ID in Setup.";
        }
        if (status === 429) {
            return "Rate limited by Databricks. Wait a moment and retry.";
        }
        if (status >= 500) {
            return `Databricks service error (${status}). Retry; if persistent, check workspace status.`;
        }
        // 4xx other than above — try to extract a short, sanitized message.
        try {
            const parsed = JSON.parse(rawText);
            const msg = String(parsed?.message || parsed?.error || "").trim();
            if (msg && msg.length < 200 && !/Bearer|dapi[a-z0-9]{8,}/i.test(msg)) {
                return `Request failed (${status}): ${msg}`;
            }
        } catch { /* fall through */ }
        return `Request failed with status ${status}`;
    }

    // Direct-mode XHR straight to Databricks REST. No X-Genie-Key /
    // X-Assistant-Profile — those are proxy-only. PAT goes in the standard
    // Authorization Bearer header.
    private directRequest<T>(method: string, path: string, body?: any): Promise<T> {
        return new Promise((resolve, reject) => {
            // Wave 30 cycle 4 — guard against obviously-malformed tokens before
            // we make a request that will only ever 401. Databricks PATs start
            // with "dapi"; warn early so the user gets actionable feedback
            // instead of an opaque auth error.
            if (this.config.token && !/^dapi/.test(this.config.token)) {
                reject(new Error("Invalid Databricks PAT shape. Tokens must start with 'dapi'. Re-paste from Databricks > User Settings > Developer > Access tokens."));
                return;
            }

            const xhr = new XMLHttpRequest();
            this.activeXhrs.push(xhr);

            const url = `${this.getDirectBase()}${path}`;
            xhr.open(method, url, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (this.config.token) {
                xhr.setRequestHeader("Authorization", `Bearer ${this.config.token}`);
            }

            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                this.activeXhrs = this.activeXhrs.filter(x => x !== xhr);
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(xhr.responseText ? JSON.parse(xhr.responseText) : ({} as T));
                    } catch {
                        reject(new Error("Failed to parse response"));
                    }
                } else {
                    reject(new Error(this.mapDirectStatusToMessage(xhr.status, xhr.responseText || "")));
                }
            };
            xhr.onerror = () => {
                this.activeXhrs = this.activeXhrs.filter(x => x !== xhr);
                // Status 0 in onerror almost always = CORS or DNS. PBI Desktop
                // sandbox blocks anything not in capabilities.json WebAccess.
                reject(new Error("Network error or CORS block. If using PBI Desktop, ensure the Databricks host is in the WebAccess allowlist (capabilities.json) and the workspace URL is correct."));
            };
            xhr.send(body ? JSON.stringify(body) : null);
        });
    }

    // Direct-mode counterpart of proxy/server.js enrichQueryResults — when a
    // poll comes back COMPLETED with query attachments lacking data_table,
    // fetch the materialised result and inject it inline so the visual
    // doesn't need a second round-trip.
    private async enrichDirectQueryResults(spaceId: string, conversationId: string, messageId: string, data: any): Promise<void> {
        const status = (data?.status || "").toUpperCase();
        if (status !== "COMPLETED" || !Array.isArray(data?.attachments)) return;
        for (let i = 0; i < data.attachments.length; i++) {
            const att = data.attachments[i];
            if (!att?.query || att.query.result?.data_table) continue;
            try {
                const result: any = await this.directRequest<any>(
                    "GET",
                    `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}/query-result`
                );
                const stmt = result?.statement_response || result;
                const columns = stmt?.manifest?.schema?.columns || [];
                const typedRows = stmt?.result?.data_typed_array || stmt?.result?.data_array || [];
                if (columns.length > 0) {
                    const rows = typedRows.map((row: any) =>
                        Array.isArray(row)
                            ? row
                            : (row.values || []).map((v: any) => v.str ?? v.value ?? null)
                    );
                    att.query.result = {
                        columns: columns.map((c: any) => ({ name: c.name, type: c.type_name })),
                        data_table: rows
                    };
                } else {
                    att.query.result = att.query.result || {};
                    att.query.result.enrichmentWarning =
                        "Genie returned a COMPLETED status but the query-result payload had no columns.";
                }
            } catch (err: any) {
                att.query.result = att.query.result || {};
                att.query.result.enrichmentError = err?.message ?? String(err);
            }
        }
    }

    private request<T>(method: string, path: string, body?: any): Promise<T> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.activeXhrs.push(xhr);

            const url = `${this.getBaseUrl()}${path}`;
            xhr.open(method, url, true);
            xhr.setRequestHeader("Content-Type", "application/json");

            if (this.config.proxyKey) {
                xhr.setRequestHeader("X-Genie-Key", this.config.proxyKey);
            }
            if (this.config.assistantProfile) {
                xhr.setRequestHeader("X-Assistant-Profile", this.config.assistantProfile);
            }
            // Wave 31 — inline credentials. When the visual has been given
            // host/token/spaceId via the format pane, forward them as
            // X-Databricks-* headers so the proxy can use them as a
            // transient profile — no config.json edit required. The proxy
            // only activates this path when ALL three are present; if any
            // is missing it falls back to the named-profile lookup.
            this.attachInlineCredentialsHeaders(xhr);
            // Wave 28 — correlation ID for cross-system tracing. Visual
            // generates a per-request id; proxy echoes it back + writes it
            // into its audit log so a user-reported failure can be traced
            // from session log → proxy log → Databricks request.
            xhr.setRequestHeader("X-Request-Id", createRequestId());

            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    this.activeXhrs = this.activeXhrs.filter(x => x !== xhr);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(JSON.parse(xhr.responseText));
                        } catch (e) {
                            reject(new Error("Failed to parse response"));
                        }
                    } else {
                        // BUG-002: Handle "Request failed with status 0" (Network/Proxy Offline)
                        if (xhr.status === 0) {
                            reject(new Error("Proxy Offline. Ensure the PulsePlay Proxy is running and accessible at the configured URL."));
                            return;
                        }
                        try {
                            const error = JSON.parse(xhr.responseText);
                            reject(new Error(error.error || `Request failed with status ${xhr.status}`));
                        } catch (e) {
                            reject(new Error(`Request failed with status ${xhr.status}`));
                        }
                    }
                }
            };

            xhr.onerror = () => {
                this.activeXhrs = this.activeXhrs.filter(x => x !== xhr);
                reject(new Error("Network error"));
            };

            xhr.send(body ? JSON.stringify(body) : null);
        });
    }

    public async testConnection(): Promise<{ ok: boolean; detail: string }> {
        try {
            if (this.isSupervisorMode()) {
                const data = await this.request<any>("GET", "/health");
                return { ok: true, detail: `Connected to Genie Supervisor Agent: ${data.agentName ?? "Supervisor"} (profile: ${data.profile ?? "supervisor"}).` };
            }
            if (this.isDirectMode()) {
                if (!this.config.host || !this.config.token || !this.config.spaceId) {
                    return { ok: false, detail: "Direct mode requires host, token (PAT), and spaceId to be set." };
                }
                await this.directRequest<any>("GET", `/api/2.0/genie/spaces/${this.config.spaceId}`);
                return { ok: true, detail: `Connected directly to Databricks Genie (space ${this.config.spaceId}).` };
            }
            const profile = this.config.assistantProfile || "default";
            const data = await this.request<any>("GET", `/capabilities?assistantProfile=${encodeURIComponent(profile)}`);
            return { ok: true, detail: `Connected. Profile: ${data.assistantProfile ?? profile}.` };
        } catch (err: any) {
            const msg: string = err?.message ?? String(err);
            if (msg.includes("Network error")) {
                return { ok: false, detail: "Power BI Desktop blocked the request. Check WebAccess permissions in capabilities.json." };
            }
            return { ok: false, detail: msg };
        }
    }

    public async testQuestion(question = "Run this validation query and return the single result: SELECT 1 AS pulseplay_validation_check."): Promise<{ ok: boolean; detail: string }> {
        try {
            if (this.isDirectMode() && (!this.config.host || !this.config.token || !this.config.spaceId)) {
                return { ok: false, detail: "Direct mode requires host, token (PAT), and spaceId to be set before running a test question." };
            }
            if (!this.isDirectMode() && !this.config.apiBaseUrl) {
                return { ok: false, detail: "A proxy API Base URL is required before running a test question." };
            }

            const started = await this.startConversation(question, { intent: "performance" });
            if (!started.conversationId || !started.messageId) {
                return { ok: false, detail: "The validation question started, but no conversation/message id was returned." };
            }

            const message = await this.waitForMessageWithProgress(started.conversationId, started.messageId);
            const status = (message.status || "").toUpperCase();
            if (status !== "COMPLETED") {
                return { ok: false, detail: message.error || message.content || `Validation question ended with status ${message.status || "UNKNOWN"}.` };
            }

            const proof = message.sqlQuery
                ? " SQL was generated and the message completed."
                : message.queryResult?.rows?.length
                    ? " Query results were returned."
                    : " The message completed successfully.";
            return { ok: true, detail: `Test question completed.${proof}` };
        } catch (err: any) {
            return { ok: false, detail: err?.message ?? String(err) };
        }
    }

    /**
     * 49.20 / IDEA-037 phase 4 — AI-assisted introspection. Sends the bound
     * measures + dimensions + a small sample-context blurb to the active LLM
     * backend and asks for a structured suggestion: domain label + 2-4
     * domain-specific custom sections that the author can Apply with one
     * click. Strict JSON parsing with defensive fallback — malformed responses
     * return null without throwing so the caller can show a friendly retry.
     *
     * Reuses the existing startConversation + waitForMessageWithProgress so
     * the same proxy / direct / supervisor / cloud-AI paths all work without
     * any new endpoint. The "intent" is set to "performance" so we don't
     * pollute conversation history (intent: performance is treated as a
     * one-shot probe, not part of the user's chat thread).
     */
    public async suggestInsightsConfig(args: {
        measures: string[];
        dimensions: string[];
        sampleContext?: string;
    }): Promise<InsightsConfigSuggestion | null> {
        const measures = args.measures.filter(Boolean);
        const dimensions = args.dimensions.filter(Boolean);
        const sample = (args.sampleContext || "").slice(0, 500);

        if (measures.length === 0 && dimensions.length === 0) return null;

        const introspectionPrompt = [
            "You are analysing a Power BI dashboard's data bindings to suggest how to structure AI Insights output for it.",
            "",
            `Bound measures: ${measures.length ? measures.join(", ") : "(none)"}`,
            `Bound dimensions: ${dimensions.length ? dimensions.join(", ") : "(none)"}`,
            sample ? `Sample context: ${sample}` : "",
            "",
            "Respond with strict JSON ONLY, no preamble, no code fences, no commentary:",
            "{",
            '  "domain": "<short label, e.g. Sales Performance, Supply Chain Operations, Hospital Operations>",',
            '  "confidence": <number between 0.0 and 1.0>,',
            '  "rationale": "<one sentence explaining why this domain fits the bindings>",',
            '  "suggestedSections": [',
            '    { "name": "<UPPERCASE_NAME>", "instruction": "<what to put in this section>" }',
            "  ]",
            "}",
            "",
            "Aim for 2 to 4 suggestedSections that are domain-specific (NOT the universal ones — HEADLINE, KPI SNAPSHOT, TRENDS, RISKS, RECOMMENDED ACTIONS — those are auto-emitted by the visual). Examples of domain-specific sections: GAP ANALYSIS for Supply Chain, COHORT BEHAVIOUR for Customer Success, REIMBURSEMENT TRENDS for Healthcare.",
            "If the bindings are too ambiguous to classify, return domain: 'Generic Analytics' and 1-2 generic sections.",
            "Each section instruction should reference bound metrics/dimensions where relevant — use placeholders like 'the bound revenue measure' if uncertain about exact column names."
        ].filter(Boolean).join("\n");

        try {
            const started = await this.startConversation(introspectionPrompt, { intent: "performance" });
            if (!started.conversationId || !started.messageId) return null;
            const result = await this.waitForMessageWithProgress(started.conversationId, started.messageId);
            const status = (result.status || "").toUpperCase();
            if (status !== "COMPLETED" && status !== "DONE") return null;
            return parseInsightsConfigSuggestion(result.content || "");
        } catch {
            return null;
        }
    }

    /**
     * Wave 41 PREP — fetch the Genie space description + instructions so the
     * AI-assisted suggest path can ground its metric-rule suggestions in
     * what the space already knows about the data. Best-effort: returns
     * empty fields on any failure so the caller can fall back to measure-name
     * heuristics without surfacing a noisy error to the author.
     *
     * Direct mode: hits Databricks REST with PAT directly.
     * Proxy mode: hits the existing /assistant/space-fetch passthrough so the
     * PAT never leaves the proxy.
     * Supervisor mode: not supported (supervisor doesn't expose a single
     * space to inspect); returns empty.
     */
    public async getSpaceMetadata(spaceId: string): Promise<GenieSpaceMetadata> {
        const targetSpaceId = (spaceId || this.config.spaceId || "").trim();
        if (!targetSpaceId) return {};
        if (this.isSupervisorMode()) return {};

        try {
            let data: any;
            if (this.isDirectMode()) {
                if (!this.config.host || !this.config.token) return {};
                data = await this.directRequest<any>(
                    "GET",
                    `/api/2.0/genie/spaces/${encodeURIComponent(targetSpaceId)}?include_serialized_space=true`
                );
            } else {
                if (!this.config.apiBaseUrl) return {};
                const profile = this.config.assistantProfile || "default";
                data = await this.request<any>(
                    "GET",
                    `/space-fetch?profile=${encodeURIComponent(profile)}&spaceId=${encodeURIComponent(targetSpaceId)}`
                );
            }
            const description = String(data?.description || data?.title || "").slice(0, 4000);
            let instructions = "";
            const ss = data?.serialized_space;
            if (ss) {
                try {
                    const parsed = typeof ss === "string" ? JSON.parse(ss) : ss;
                    instructions = String(
                        parsed?.instructions
                        || parsed?.general_instructions
                        || parsed?.context
                        || ""
                    ).slice(0, 4000);
                } catch {
                    // serialized_space malformed — ignore silently. Wave 30 cycle 4
                    // redaction: never propagate the raw upstream payload.
                }
            }
            return { description, instructions };
        } catch {
            // All failure modes (network, auth, 404, malformed JSON) collapse
            // to empty so the caller can degrade gracefully. The proxy / direct
            // path will already have logged a friendly mapped string.
            return {};
        }
    }

    /**
     * Wave 41 PREP — call the proxy's /insights/suggest-metric-rules route to
     * get a list of suggested metric direction rules. Plumbing-only in this
     * wave; the visual surfaces the result alongside the existing
     * suggestInsightsConfig() call once the UI lands in cycle 12.
     *
     * Proxy mode is the canonical path. Direct mode currently has no
     * equivalent endpoint (the visual would need to embed an LLM client),
     * so direct mode falls back to a tiny client-side measure-name
     * heuristic so the button always returns SOMETHING. Supervisor mode
     * routes through the proxy too.
     */
    public async fetchSuggestedMetricRules(args: {
        measureNames: string[];
        dimensionNames?: string[];
        sectionHCte?: string;
        spaceId?: string;
    }): Promise<NonNullable<InsightsConfigSuggestion["suggestedMetricRules"]>> {
        const measureNames = (args.measureNames || []).filter(Boolean);
        const dimensionNames = (args.dimensionNames || []).filter(Boolean);
        if (measureNames.length === 0 && !args.sectionHCte) return [];

        // Direct mode has no proxy route to call. Run the same kind of
        // measure-name heuristic the proxy uses, inline, so the suggest
        // button still returns SOMETHING useful in dev / lower envs.
        if (this.isDirectMode()) {
            return clientSideMetricRuleHeuristics(measureNames);
        }

        if (!this.config.apiBaseUrl) return [];

        try {
            const body = {
                profileName: this.config.assistantProfile || "default",
                spaceId: (args.spaceId || this.config.spaceId || "").trim() || undefined,
                measureNames,
                dimensionNames,
                sectionHCte: args.sectionHCte || ""
            };
            // The /insights route is mounted under the proxy root, NOT under
            // /assistant or /supervisor. Hard-route through a sibling helper
            // that takes an absolute path off the same base URL the visual
            // already trusts (and re-attaches headers / key / request-id).
            const resp = await this.requestSiblingPath<{
                ok: boolean;
                suggestedMetricRules: NonNullable<InsightsConfigSuggestion["suggestedMetricRules"]>;
            }>("POST", "/insights/suggest-metric-rules", body);
            const rules = Array.isArray(resp?.suggestedMetricRules) ? resp.suggestedMetricRules : [];
            return rules;
        } catch {
            // Wave 30 cycle 4: never surface raw network/auth errors to the UI.
            // Caller sees an empty array → "no suggestions available right now".
            return [];
        }
    }

    /**
     * Helper that talks to a sibling path off the proxy base (i.e. NOT
     * prefixed with /assistant or /supervisor). Used by Wave 41 PREP's
     * /insights/* route. Mirrors `request()` in everything except the URL
     * composition so headers, request-id, and inline credentials all flow
     * through unchanged.
     */
    private requestSiblingPath<T>(method: string, siblingPath: string, body?: any): Promise<T> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.activeXhrs.push(xhr);

            const base = (this.config.apiBaseUrl || "").replace(/\/$/, "");
            const url = `${base}${siblingPath}`;
            xhr.open(method, url, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (this.config.proxyKey) xhr.setRequestHeader("X-Genie-Key", this.config.proxyKey);
            if (this.config.assistantProfile) xhr.setRequestHeader("X-Assistant-Profile", this.config.assistantProfile);
            this.attachInlineCredentialsHeaders(xhr);
            xhr.setRequestHeader("X-Request-Id", createRequestId());

            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                this.activeXhrs = this.activeXhrs.filter(x => x !== xhr);
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch { reject(new Error("Failed to parse response")); }
                } else if (xhr.status === 0) {
                    reject(new Error("Proxy Offline."));
                } else {
                    reject(new Error(`Request failed with status ${xhr.status}`));
                }
            };
            xhr.onerror = () => {
                this.activeXhrs = this.activeXhrs.filter(x => x !== xhr);
                reject(new Error("Network error"));
            };
            xhr.send(body ? JSON.stringify(body) : null);
        });
    }

    public async getHome(context: any): Promise<AssistantHomePayload> {
        if (this.isDirectMode()) {
            // Direct mode has no proxy /home endpoint. Visual falls back to
            // its local home model (buildLocalHomeModel) when this returns empty.
            return {
                snapshot: [],
                risks: [],
                opportunities: [],
                changes: [],
                suggestedActions: [],
                generatedBy: "local",
                assistantProfile: ""
            };
        }
        return this.request<AssistantHomePayload>("POST", "/home", context);
    }

    private normalizeConversationResult(raw: any): ConversationStartResult {
        return {
            conversationId: raw.conversationId || raw.conversation_id || raw.conversation?.id || "",
            messageId:      raw.messageId      || raw.message_id      || raw.message?.id      || raw.id || "",
            route:          raw.route          || raw.assistant_meta  || undefined
        };
    }

    public async startConversation(request: any, options?: SendOptions): Promise<ConversationStartResult> {
        // request may be a plain string (from buildGenieRequest) or an object
        const base = typeof request === "string" ? { content: request } : { ...request };
        // Wave 19: prepend runtime scope prefix when any governance rule is set
        const scopePrefix = this.getScopePrefix();
        if (scopePrefix && typeof base.content === "string") {
            base.content = scopePrefix + base.content;
        }
        if (this.isDirectMode()) {
            const content = (base.content || "").toString();
            const raw = await this.directRequest<any>(
                "POST",
                `/api/2.0/genie/spaces/${this.config.spaceId}/start-conversation`,
                { content }
            );
            return this.normalizeConversationResult(raw);
        }
        // PulsePlay Smart Connect — forward the active pack selection (if
        // any) so the proxy's cycle-C pack-context injection wraps the
        // user message with the pack vocabulary. App.tsx writes this key
        // when its auto-probe completes or the user picks via the
        // PackPicker; absent key = no pack injection (proxy is permissive).
        const packSelection = readPackSelectionFromStorage();
        const body = {
            ...base,
            intent: options?.intent,
            contextText: options?.contextText,
            assistantProfile: this.config.assistantProfile,
            spaceId: this.config.spaceId,
            ...(packSelection?.pack ? { pack: packSelection.pack } : {}),
            ...(packSelection?.subVertical ? { subVertical: packSelection.subVertical } : {}),
        };
        const raw = await this.request<any>("POST", "/conversations/start", body);
        const normalized = this.normalizeConversationResult(raw);
        // Supervisor responses are synchronous (COMPLETED on start).
        // Pack the full response into messageId so waitForMessageWithProgress
        // can unpack it immediately without polling.
        if (this.isSupervisorMode() && raw.status === "COMPLETED") {
            normalized.messageId = JSON.stringify(raw);
        }
        return normalized;
    }

    public async sendMessage(conversationId: string, request: any, options?: SendOptions): Promise<ConversationStartResult> {
        const base = typeof request === "string" ? { content: request } : { ...request };
        // Wave 19: follow-up messages also carry the scope prefix so Genie
        // doesn't forget the rules across conversation turns.
        const scopePrefix = this.getScopePrefix();
        if (scopePrefix && typeof base.content === "string") {
            base.content = scopePrefix + base.content;
        }
        if (this.isDirectMode()) {
            const content = (base.content || "").toString();
            const raw = await this.directRequest<any>(
                "POST",
                `/api/2.0/genie/spaces/${this.config.spaceId}/conversations/${conversationId}/messages`,
                { content }
            );
            return this.normalizeConversationResult(raw);
        }
        const body = {
            ...base,
            intent: options?.intent,
            contextText: options?.contextText,
            assistantProfile: this.config.assistantProfile,
            spaceId: this.config.spaceId
        };
        const raw = await this.request<any>("POST", `/conversations/${conversationId}/messages`, body);
        const normalized = this.normalizeConversationResult(raw);
        if (this.isSupervisorMode() && raw.status === "COMPLETED") {
            normalized.messageId = JSON.stringify(raw);
        }
        return normalized;
    }

    public async waitForMessageWithProgress(
        conversationId: string,
        messageId: string,
        onProgress?: (status: string) => void
    ): Promise<GenieMessage> {
        // If messageId is a full JSON payload (common in supervisor/sync modes), parse it immediately
        if (messageId && messageId.startsWith("{")) {
            try {
                const parsed = JSON.parse(messageId);
                if (parsed.status === "COMPLETED" || parsed.status === "FAILED") {
                    return parsed;
                }
            } catch (e) {
                // Not a JSON payload, proceed to polling
            }
        }

        // 5-minute hard ceiling (matches the proxy's supervisor-stream deadline,
        // with the proxy set ~10s shorter so its friendly error event lands
        // first instead of the visual racing it to throw).
        const POLL_DEADLINE_MS = 300_000;
        const startedAt = Date.now();
        const timeoutMessage = "We're still waiting on a response after 5 minutes — the data source may be slow or busy. Please try again, or simplify the question.";

        // Wave 22 perf: adaptive exponential backoff. Old code polled every fixed
        // 2s — fast queries paid 2s of unnecessary wait, slow queries hammered the
        // proxy with 60+ requests. New schedule starts snappy (300ms first hit),
        // doubles each round, and caps at 5s. For typical 3-8s queries this trims
        // ~1-2s of wall-clock; for 60s+ queries it cuts proxy load by ~60%.
        const ADAPTIVE_BACKOFF_START_MS = 300;
        const ADAPTIVE_BACKOFF_CAP_MS = 5000;
        let backoffMs = ADAPTIVE_BACKOFF_START_MS;
        const sleepThenAdvance = async () => {
            await new Promise(r => setTimeout(r, Math.min(backoffMs, ADAPTIVE_BACKOFF_CAP_MS)));
            backoffMs = Math.min(backoffMs * 2, ADAPTIVE_BACKOFF_CAP_MS);
        };

        if (this.isDirectMode()) {
            const spaceId = this.config.spaceId || "";
            const pollDirect = async (): Promise<GenieMessage> => {
                if (Date.now() - startedAt > POLL_DEADLINE_MS) {
                    throw new Error(timeoutMessage);
                }
                const res: any = await this.directRequest<any>(
                    "GET",
                    `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}`
                );
                if (onProgress) onProgress(res.status);

                if (res.status === "COMPLETED" || res.status === "FAILED" || res.status === "CANCELLED") {
                    if ((res.status || "").toUpperCase() === "COMPLETED") {
                        await this.enrichDirectQueryResults(spaceId, conversationId, messageId, res);
                    }
                    res.content = this.extractAnswerText(res);
                    this.hydrateGenieFields(res); // cycle 37 — lift sqlQuery + queryResult from attachments
                    return res as GenieMessage;
                }

                await sleepThenAdvance();
                return pollDirect();
            };
            return pollDirect();
        }

        const poll = async (): Promise<GenieMessage> => {
            if (Date.now() - startedAt > POLL_DEADLINE_MS) {
                throw new Error(timeoutMessage);
            }
            const res = await this.request<GenieMessage>("GET", `/conversations/${conversationId}/messages/${messageId}?assistantProfile=${this.config.assistantProfile || ""}&spaceId=${this.config.spaceId || ""}`);
            if (onProgress) onProgress(res.status);

            if (res.status === "COMPLETED" || res.status === "FAILED" || res.status === "CANCELLED") {
                this.hydrateGenieFields(res); // cycle 37 — lift sqlQuery + queryResult from attachments
                return res;
            }

            await sleepThenAdvance();
            return poll();
        };

        return poll();
    }

    public async submitFeedback(payload: GenieFeedbackPayload): Promise<boolean> {
        // Direct mode: no proxy → no feedback log destination. Silent no-op
        // so the visual doesn't surface a misleading error.
        if (this.isDirectMode()) return false;
        try {
            await this.request<any>("POST", "/feedback", payload);
            return true;
        } catch (e) {
            return false;
        }
    }

    public async saveHistory(entry: GenieHistoryEntry): Promise<void> {
        if (this.isDirectMode()) return;
        await this.request<any>("POST", "/history", entry);
    }

    public async getHistory(payload: GenieHistoryPayload): Promise<GenieHistoryEntry[]> {
        if (this.isDirectMode()) return [];
        const query = `?viewerUserKey=${encodeURIComponent(payload.viewerUserKey || "")}&includeAll=${!!payload.includeAll}&limit=${payload.limit || 50}&assistantProfile=${encodeURIComponent(payload.assistantProfile || "")}`;
        return this.request<GenieHistoryEntry[]>("GET", `/history${query}`);
    }

    public async getProfiles(): Promise<AssistantProfileMetadata[]> {
        if (this.isDirectMode() || this.isSupervisorMode()) return [];
        return this.request<AssistantProfileMetadata[]>("GET", "/profiles");
    }

    /**
     * Proactive proxy health probe (IDEA-015). Fires GET /health and
     * returns a structured snapshot used by the SetupEditFlow's Proxy
     * Status card and the on-load badge. Direct mode short-circuits to
     * `{ ok: true, mode: "direct" }` because there is no proxy in the
     * loop. Network failures resolve with `{ ok: false, error }` rather
     * than throwing — callers want to render a clear offline state, not
     * crash on a missing proxy.
     */
    public async checkProxyHealth(): Promise<ProxyHealthInfo> {
        if (this.isDirectMode()) {
            return { ok: true, mode: "direct" };
        }
        const base = (this.config.apiBaseUrl || "").replace(/\/$/, "");
        if (!base) {
            return { ok: false, mode: "proxy", error: "Proxy URL is not configured." };
        }
        const cached = proxyHealthCache.get(base);
        if (cached?.result && cached.expiresAt > Date.now()) {
            return cached.result;
        }
        if (cached?.inFlight) {
            return cached.inFlight;
        }
        const inFlight = this.fetchProxyHealth(base);
        proxyHealthCache.set(base, {
            expiresAt: Date.now() + PROXY_HEALTH_CACHE_TTL_MS,
            inFlight,
        });
        try {
            const result = await inFlight;
            proxyHealthCache.set(base, {
                expiresAt: Date.now() + PROXY_HEALTH_CACHE_TTL_MS,
                result,
            });
            return result;
        } catch (err: any) {
            const result: ProxyHealthInfo = {
                ok: false,
                mode: "proxy",
                error: err?.message ?? String(err)
            };
            proxyHealthCache.set(base, {
                expiresAt: Date.now() + PROXY_HEALTH_CACHE_TTL_MS,
                result,
            });
            return result;
        }
    }

    private async fetchProxyHealth(base: string): Promise<ProxyHealthInfo> {
        try {
            // Use a fresh XHR (not this.request) so the probe is cheap and
            // doesn't pull in supervisor/assistant base-URL prefixing.
            const data = await new Promise<any>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", `${base}/health`, true);
                xhr.timeout = 5000;
                xhr.onreadystatechange = () => {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try { resolve(JSON.parse(xhr.responseText)); }
                        catch { reject(new Error("Health response was not valid JSON.")); }
                    } else if (xhr.status === 0) {
                        reject(new Error("Proxy is not reachable. Ensure the PulsePlay Proxy is running."));
                    } else {
                        reject(new Error(`Proxy /health returned status ${xhr.status}.`));
                    }
                };
                xhr.ontimeout = () => reject(new Error("Proxy /health timed out after 5s."));
                xhr.onerror = () => reject(new Error("Network error reaching the proxy."));
                xhr.send();
            });
            return {
                ok: true,
                mode: "proxy",
                profiles: Array.isArray(data?.profiles) ? data.profiles : undefined,
                configSource: data?.configSource,
                port: data?.port,
                databricksApp: !!data?.databricksApp,
                appName: data?.appName ?? undefined,
                authMode: data?.authMode === "sharedKey" || data?.authMode === "anonymous" ? data.authMode : undefined,
                raw: data
            };
        } catch (err: any) {
            throw err;
        }
    }

    // Fires after the answer renders — never blocks the answer.
    // Calls POST /confidence and reads the NDJSON stream: Phase 1 (structural
    // score, sync) followed by Phase 2 (business reason, async LLM follow-up).
    // onPhase1 fires immediately with score+level; onPhase2 fires when the LLM
    // reason arrives. Both callbacks are optional.
    public evaluateConfidence(
        payload: ConfidenceRequest,
        onPhase1: (result: ConfidenceResult) => void,
        onPhase2?: (result: ConfidenceResult) => void
    ): void {
        // Confidence is a proxy-only NDJSON stream. In direct mode we skip
        // silently (could mirror Phase 1 structural scoring locally as a
        // future enhancement; left unwired for now to keep the diff small).
        if (this.isDirectMode()) {
            return;
        }
        const base = (this.config.apiBaseUrl || "").replace(/\/$/, "");
        const url = `${base}/confidence`;

        const xhr = new XMLHttpRequest();
        this.activeXhrs.push(xhr);
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        if (this.config.token) xhr.setRequestHeader("Authorization", `Bearer ${this.config.token}`);

        let phase1Result: ConfidenceResult | null = null;
        let byteOffset = 0;

        xhr.onreadystatechange = () => {
            // LOADING (3) fires repeatedly as chunks arrive
            if (xhr.readyState < 3) return;

            const chunk = xhr.responseText.slice(byteOffset);
            byteOffset = xhr.responseText.length;

            for (const line of chunk.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.phase === 1) {
                        phase1Result = {
                            score: parsed.score,
                            level: parsed.level,
                            signals: parsed.signals || [],
                        };
                        onPhase1(phase1Result);
                    } else if (parsed.phase === 2 && phase1Result && onPhase2) {
                        onPhase2({ ...phase1Result, businessReason: parsed.businessReason });
                    }
                } catch { /* partial chunk — wait for next firing */ }
            }
        };

        xhr.onerror = () => { /* confidence failure is silent */ };

        xhr.send(JSON.stringify(payload));
    }

    /**
     * Stream a supervisor question through the NDJSON-streaming endpoint
     * (IDEA-020 Phase 5). Emits per-helper lifecycle events to the caller's
     * callbacks while the proxy fans out + synthesises, then resolves with
     * the final result event identical in shape to the non-streaming
     * /supervisor/conversations/start response.
     *
     * Only valid in supervisor connectionMode against a `supervisor-local`
     * proxy profile. Proxy URL must be configured. The caller can fall back
     * to startConversation if this rejects with NOT_AVAILABLE.
     */
    public startSupervisorStream(
        content: string,
        callbacks: SupervisorStreamCallbacks,
        contextText?: string,
        /** Optional human-friendly label for the active stage. Real-supervisor
         *  type=supervisor is opaque so the proxy emits a single synthetic
         *  helper event per call; passing the stage label here means the
         *  visual sees "HEADLINE / TRENDS / RISKS" etc. instead of generic
         *  "Connecting..." while the agent thinks. Ignored by supervisor-local
         *  (which has its own per-helper labels). */
        stageLabel?: string,
    ): Promise<SupervisorStreamResult> {
        return new Promise((resolve, reject) => {
            if (!this.isSupervisorMode()) {
                reject(new Error("startSupervisorStream is only valid in supervisor connection mode."));
                return;
            }
            if (!this.config.apiBaseUrl) {
                reject(new Error("Proxy URL is required for supervisor streaming."));
                return;
            }
            const url = `${this.getBaseUrl()}/conversations/start-stream`;

            const xhr = new XMLHttpRequest();
            this.activeXhrs.push(xhr);
            xhr.open("POST", url, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            if (this.config.proxyKey) xhr.setRequestHeader("X-Genie-Key", this.config.proxyKey);
            const profile = this.config.assistantProfile?.trim();
            if (profile) xhr.setRequestHeader("X-Assistant-Profile", profile);
            // Wave 31 — same inline-credentials forwarding as request().
            // Supervisor streams use a different XHR path so we have to
            // attach here too; otherwise the streaming endpoint silently
            // drops back to the named-profile lookup.
            this.attachInlineCredentialsHeaders(xhr);

            let byteOffset = 0;
            let lastResult: SupervisorStreamResult | null = null;
            let lastError: string | null = null;
            // Buffer for partial JSON lines that span chunk boundaries.
            let pending = "";

            const handleEvent = (evt: any) => {
                const t = evt?.type;
                if (t === "fanout.start" && callbacks.onFanoutStart)   callbacks.onFanoutStart(evt.helpers || []);
                else if (t === "helper.start" && callbacks.onHelperStart) callbacks.onHelperStart(evt.helper);
                else if (t === "helper.done" && callbacks.onHelperDone)   callbacks.onHelperDone(evt.helper, !!evt.ok, evt.elapsedMs || 0);
                else if (t === "synthesis.start" && callbacks.onSynthesisStart) callbacks.onSynthesisStart(evt.helperCount || 0);
                else if (t === "synthesis.done" && callbacks.onSynthesisDone)   callbacks.onSynthesisDone(evt.elapsedMs || 0);
                else if (t === "result") lastResult = evt as SupervisorStreamResult;
                else if (t === "error")  lastError = evt.message || "Supervisor stream failed.";
            };

            xhr.onreadystatechange = () => {
                if (xhr.readyState < 3) return;
                const chunk = xhr.responseText.slice(byteOffset);
                byteOffset = xhr.responseText.length;
                pending += chunk;
                const lines = pending.split("\n");
                // Last element may be a partial line; keep it for next firing.
                pending = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        handleEvent(JSON.parse(trimmed));
                    } catch { /* skip unparseable line — likely partial */ }
                }
            };

            xhr.onload = () => {
                // Flush any final buffered line on completion.
                if (pending.trim()) {
                    try { handleEvent(JSON.parse(pending.trim())); } catch { /* ignore */ }
                    pending = "";
                }
                if (lastResult) resolve(lastResult);
                else if (lastError) reject(new Error(lastError));
                else if (xhr.status >= 400) reject(new Error(`Supervisor stream failed with status ${xhr.status}.`));
                else reject(new Error("Supervisor stream ended without a result event."));
            };
            xhr.onerror = () => reject(new Error("Network error during supervisor stream."));

            xhr.send(JSON.stringify({ content, contextText, stageLabel }));
        });
    }
}

export interface ProxyHealthInfo {
    ok: boolean;
    /** "direct" short-circuits with ok:true since there's no proxy.    */
    mode: "proxy" | "direct";
    /** Friendly error message when ok is false. */
    error?: string;
    profiles?: string[];
    configSource?: string;
    port?: number;
    databricksApp?: boolean;
    appName?: string;
    /** Whether the proxy requires the X-Genie-Key header (BUG-002 + IDEA-015). */
    authMode?: "sharedKey" | "anonymous";
    /** Raw /health body for advanced surfaces; do NOT show to end users. */
    raw?: any;
}

export interface SupervisorHelperMeta {
    name: string;
    displayName: string;
    dataDomain?: string;
}

export interface SupervisorStreamResult {
    type: "result";
    conversation_id?: string;
    conversationId?: string;
    message_id?: string;
    messageId?: string;
    status: string;
    content: string;
    attachments?: any[];
    route?: any;
}

export interface SupervisorStreamCallbacks {
    onFanoutStart?:    (helpers: SupervisorHelperMeta[]) => void;
    onHelperStart?:    (helper: SupervisorHelperMeta) => void;
    onHelperDone?:     (helper: SupervisorHelperMeta, ok: boolean, elapsedMs: number) => void;
    onSynthesisStart?: (helperCount: number) => void;
    onSynthesisDone?:  (elapsedMs: number) => void;
}

/**
 * Wave 41 PREP — direct-mode fallback heuristic. Mirrors the proxy-side
 * proxy/lib/metricRuleHeuristics.js engine in a tiny inline form so the
 * "Suggest" button works in dev / lower envs that don't route through the
 * proxy. Output shape matches InsightsConfigSuggestion.suggestedMetricRules
 * exactly. Source is always "measure-name" or "industry-pattern" — direct
 * mode has no Genie-space-fetch path, so the LLM-grounded sources are
 * reserved for the proxy path.
 */
export function clientSideMetricRuleHeuristics(
    measureNames: string[]
): NonNullable<InsightsConfigSuggestion["suggestedMetricRules"]> {
    const lowerPats: { re: RegExp; label: string }[] = [
        { re: /\b(return|returns)\b/i, label: "returns" },
        { re: /\bcomplaint(s)?\b/i, label: "complaints" },
        { re: /\bdefect(s)?\b/i, label: "defects" },
        { re: /\bchurn\b/i, label: "churn" },
        { re: /\berror(s)?\b/i, label: "errors" },
        { re: /\bloss(es)?\b/i, label: "losses" },
        { re: /\bcost(s)?\b/i, label: "cost" },
    ];
    const higherPats: { re: RegExp; label: string }[] = [
        { re: /\brevenue\b/i, label: "revenue" },
        { re: /\bprofit(s)?\b/i, label: "profit" },
        { re: /\bgrowth\b/i, label: "growth" },
        { re: /\bsales\b/i, label: "sales" },
        { re: /\bconversion(s)?\b/i, label: "conversion" },
        { re: /\bnps\b/i, label: "NPS" },
    ];
    const out: NonNullable<InsightsConfigSuggestion["suggestedMetricRules"]> = [];
    const seen = new Set<string>();
    for (const raw of measureNames || []) {
        if (!raw || typeof raw !== "string") continue;
        const name = raw.trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        let dir: "lower" | "higher" | null = null;
        let label = "";
        for (const p of lowerPats) { if (p.re.test(name)) { dir = "lower"; label = p.label; break; } }
        if (!dir) for (const p of higherPats) { if (p.re.test(name)) { dir = "higher"; label = p.label; break; } }
        if (!dir) continue;
        out.push({
            name,
            higherIsBetter: dir === "higher",
            aliases: [],
            confidence: 0.7,
            rationale: `Measure name matches "${label}"; ${dir}-is-better convention.`,
            source: "measure-name",
        });
    }
    if (out.length === 0) {
        out.push({
            name: "Revenue",
            higherIsBetter: true,
            aliases: ["sales", "gross_revenue"],
            confidence: 0.4,
            rationale: "Industry default: revenue-style metrics are higher-is-better.",
            source: "industry-pattern",
        });
        out.push({
            name: "Cost",
            higherIsBetter: false,
            aliases: ["expense", "cogs"],
            confidence: 0.4,
            rationale: "Industry default: cost-style metrics are lower-is-better.",
            source: "industry-pattern",
        });
    }
    return out;
}

/**
 * 49.20 / IDEA-037 phase 4 — defensive JSON parser for the AI-assisted
 * introspection response. The LLM is asked for strict JSON, but real-world
 * responses sometimes wrap it in code fences or preamble. This extracts the
 * first balanced { … } block and parses it with strict-shape coercion.
 * Returns null on any failure.
 */
export function parseInsightsConfigSuggestion(text: string): InsightsConfigSuggestion | null {
    if (!text || typeof text !== "string") return null;
    // Try to find the first { … } block. Tolerate code fences, preamble.
    let raw = text.trim();
    // Strip markdown fences if present
    raw = raw.replace(/```json\s*/i, "").replace(/```/g, "").trim();
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    const jsonSlice = raw.slice(firstBrace, lastBrace + 1);
    let parsed: unknown;
    try { parsed = JSON.parse(jsonSlice); } catch { return null; }
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { domain?: unknown; confidence?: unknown; rationale?: unknown; suggestedSections?: unknown };
    const domain = String(obj.domain ?? "").trim();
    const rationale = String(obj.rationale ?? "").trim();
    const conf = Number(obj.confidence);
    const confidence = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5;
    const sectionsRaw = Array.isArray(obj.suggestedSections) ? obj.suggestedSections : [];
    const suggestedSections = sectionsRaw
        .filter((s): s is { name?: unknown; instruction?: unknown } => typeof s === "object" && s !== null)
        .map(s => ({
            name: String((s as { name?: unknown }).name ?? "").trim(),
            instruction: String((s as { instruction?: unknown }).instruction ?? "").trim()
        }))
        .filter(s => s.name && s.instruction);
    if (!domain && suggestedSections.length === 0) return null;
    return { domain, confidence, rationale, suggestedSections };
}

// PulsePlay — pack-selection bridge. App.tsx writes the active pack
// (and sub-vertical) to this key when its Smart Connect auto-probe
// completes or the user picks via the v0 PackPicker. genie.ts reads
// it on each /conversations/start call and forwards pack+subVertical
// in the body so the proxy's cycle-C pack-context injection wraps the
// prompt with vertical vocabulary. Absent or malformed = no pack
// injection (proxy treats missing keys as permissive).
const PACK_SELECTION_KEY = "pulseplay:pack-selection";

function readPackSelectionFromStorage(): { pack?: string; subVertical?: string } | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(PACK_SELECTION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const pack = typeof parsed.pack === "string" ? parsed.pack : undefined;
        const subVertical = typeof parsed.subVertical === "string" ? parsed.subVertical : undefined;
        if (!pack && !subVertical) return null;
        return { pack, subVertical };
    } catch {
        return null;
    }
}
