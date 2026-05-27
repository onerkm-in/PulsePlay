// playground/src/lib/insightsSuggestClient.ts
//
// Thread A — Settings-side adapter for AI-assisted Insights authoring.
//
// Pulse's GenieClient owns suggestInsightsConfig (genie.ts:1118) but that
// path requires a constructed GenieClient — Settings doesn't carry one.
// This module replays the same shape over the proxy's existing
// /assistant/conversations/start + poll endpoints so the full-page
// Settings surface can offer "Suggest from data" without depending on
// Pulse being mounted.
//
// Vendor-agnostic by design: the introspection prompt is text; any
// active AI profile that backs /assistant/conversations/start can serve
// it. Bound measures + dimensions come from the cached DiscoverySnapshot
// (sessionStorage; prewarmed by App.tsx) so no extra network is paid
// when the prewarm already happened.
//
// Returns null on every soft failure (no profile, empty bindings,
// malformed LLM response, poll timeout) so the caller can render a
// friendly "no suggestion" hint instead of an error toast.

import {
    getDiscoverySnapshot,
    type BIMetadata,
    type DiscoverySnapshot,
} from "./discoveryClient";
import {
    parseInsightsConfigSuggestion,
    type InsightsConfigSuggestion,
} from "../pulse/genie";
import { COMPLEX_REQUEST_TIMEOUT_MS } from "./timeoutPolicy";

const POLL_INTERVAL_MS = 1_000;
/** Sourced from the central timeout policy (2026-05-27 — "complex query
 *  → 5 min"). Insights suggest is an LLM round-trip + parse, falls
 *  under COMPLEX. */
const POLL_TIMEOUT_MS = COMPLEX_REQUEST_TIMEOUT_MS;
const MAX_MEASURES = 20;
const MAX_DIMENSIONS = 12;
const MAX_SAMPLE_CONTEXT_CHARS = 500;

export interface InsightsSuggestInput {
    /** Active assistant profile name (resolved from settings). */
    profile: string;
    /** Optional pack/sub-vertical so the discovery snapshot key matches. */
    pack?: string;
    subVertical?: string;
    /** Optional domain hint the author has typed (used as sampleContext
     *  when bound measures/dimensions are sparse). */
    domainHint?: string;
    /** Optional AbortController signal for cancellation. */
    signal?: AbortSignal;
}

/** Public entry point — wraps the introspection round-trip end-to-end.
 *  Returns null on any soft failure so the panel can show a friendly
 *  retry instead of crashing. */
export async function suggestInsightsConfigViaProxy(
    input: InsightsSuggestInput,
): Promise<InsightsConfigSuggestion | null> {
    const profile = (input.profile || "").trim();
    if (!profile) return null;

    let snapshot: DiscoverySnapshot | null = null;
    try {
        snapshot = await getDiscoverySnapshot({
            assistantProfile: profile,
            pack: input.pack,
            subVertical: input.subVertical,
        });
    } catch {
        // Discovery failed — proceed without it. The fallback path below
        // pulls measures/dimensions from pack KPIs alone when bi-metadata
        // is absent. If no signal at all, the prompt builder returns null
        // and we surface a friendly retry.
        snapshot = null;
    }

    const { measures, dimensions } = extractMeasuresAndDimensions(snapshot);
    if (measures.length === 0 && dimensions.length === 0 && !input.domainHint) {
        return null;
    }

    const sampleContext = buildSampleContext(snapshot, input.domainHint).slice(
        0,
        MAX_SAMPLE_CONTEXT_CHARS,
    );
    const prompt = buildIntrospectionPrompt(measures, dimensions, sampleContext);

    const startRes = await startConversation({
        profile,
        pack: input.pack,
        subVertical: input.subVertical,
        content: prompt,
        signal: input.signal,
    });
    if (!startRes) return null;

    if (startRes.terminal) {
        return parseInsightsConfigSuggestion(startRes.content || "");
    }
    if (!startRes.conversationId || !startRes.messageId) return null;

    const polled = await pollUntilTerminal({
        profile,
        conversationId: startRes.conversationId,
        messageId: startRes.messageId,
        signal: input.signal,
    });
    if (!polled) return null;
    return parseInsightsConfigSuggestion(polled);
}

/** Extract measure + dimension name lists from a discovery snapshot.
 *
 *  Priority:
 *    1. biMetadata.visibleMeasures / visibleDimensions (live BI bindings)
 *    2. fused.availableKpis.name (pack + probe overlay) when biMetadata empty
 *
 *  Capped per MAX_MEASURES / MAX_DIMENSIONS so the prompt stays bounded. */
export function extractMeasuresAndDimensions(
    snapshot: DiscoverySnapshot | null,
): { measures: string[]; dimensions: string[] } {
    if (!snapshot) return { measures: [], dimensions: [] };
    const bi: BIMetadata | null = snapshot.sources?.biMetadata ?? null;

    const measures: string[] = [];
    if (Array.isArray(bi?.visibleMeasures)) {
        for (const m of bi.visibleMeasures) {
            if (m && typeof m.name === "string" && m.name.trim()) {
                measures.push(m.name.trim());
                if (measures.length >= MAX_MEASURES) break;
            }
        }
    }

    if (measures.length === 0 && Array.isArray(snapshot.fused?.availableKpis)) {
        for (const k of snapshot.fused.availableKpis) {
            if (k && typeof k.name === "string" && k.name.trim()) {
                measures.push(k.name.trim());
                if (measures.length >= MAX_MEASURES) break;
            }
        }
    }

    const dimensions: string[] = [];
    if (Array.isArray(bi?.visibleDimensions)) {
        for (const d of bi.visibleDimensions) {
            if (d && typeof d.name === "string" && d.name.trim()) {
                dimensions.push(d.name.trim());
                if (dimensions.length >= MAX_DIMENSIONS) break;
            }
        }
    }

    return { measures, dimensions };
}

/** Build a one-line sampleContext string mixing the user's typed domain
 *  hint with snapshot-derived signals (probe connector, KPI count).
 *  Kept compact — capped at MAX_SAMPLE_CONTEXT_CHARS by the caller. */
function buildSampleContext(
    snapshot: DiscoverySnapshot | null,
    domainHint?: string,
): string {
    const parts: string[] = [];
    if (domainHint && domainHint.trim()) {
        parts.push(`Author hint: ${domainHint.trim()}`);
    }
    const probe = snapshot?.sources?.probe as Record<string, unknown> | null | undefined;
    if (probe) {
        const display = typeof probe.displayName === "string" ? probe.displayName : "";
        const table = typeof probe.tableCount === "number" ? probe.tableCount : null;
        if (display) parts.push(`Backend: ${display}`);
        if (table != null) parts.push(`Tables: ${table}`);
    }
    const kpiCount = Array.isArray(snapshot?.fused?.availableKpis)
        ? snapshot.fused.availableKpis.length
        : 0;
    if (kpiCount > 0) parts.push(`Aligned KPIs: ${kpiCount}`);
    return parts.join(" · ");
}

/** Build the introspection prompt — byte-equivalent to Pulse's
 *  GenieClient.suggestInsightsConfig (genie.ts:1129-1149) so the LLM
 *  emits the same strict-JSON shape parseInsightsConfigSuggestion expects. */
export function buildIntrospectionPrompt(
    measures: string[],
    dimensions: string[],
    sampleContext: string,
): string {
    return [
        "You are analysing a Power BI dashboard's data bindings to suggest how to structure AI Insights output for it.",
        "",
        `Bound measures: ${measures.length ? measures.join(", ") : "(none)"}`,
        `Bound dimensions: ${dimensions.length ? dimensions.join(", ") : "(none)"}`,
        sampleContext ? `Sample context: ${sampleContext}` : "",
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
        "Each section instruction should reference bound metrics/dimensions where relevant — use placeholders like 'the bound revenue measure' if uncertain about exact column names.",
    ].filter(Boolean).join("\n");
}

interface StartConversationResult {
    conversationId?: string;
    messageId?: string;
    content?: string;
    terminal: boolean;
}

async function startConversation(args: {
    profile: string;
    pack?: string;
    subVertical?: string;
    content: string;
    signal?: AbortSignal;
}): Promise<StartConversationResult | null> {
    try {
        const res = await fetch("/api/assistant/conversations/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Assistant-Profile": args.profile,
            },
            body: JSON.stringify({
                content: args.content,
                assistantProfile: args.profile,
                pack: args.pack,
                subVertical: args.subVertical,
                // Mirrors Pulse's intent: "performance" tag so the upstream
                // treats this as a one-shot introspection, not part of the
                // user's chat thread. Proxy passes unknown keys through.
                intent: "performance",
            }),
            signal: args.signal,
        });
        if (!res.ok) return null;
        const data = await res.json() as Record<string, unknown>;
        const status = typeof data.status === "string" ? data.status.toUpperCase() : "";
        const terminal = status === "COMPLETED" || status === "DONE";
        return {
            conversationId: typeof data.conversation_id === "string" ? data.conversation_id : undefined,
            messageId: typeof data.message_id === "string" ? data.message_id : undefined,
            content: extractContent(data),
            terminal,
        };
    } catch {
        return null;
    }
}

async function pollUntilTerminal(args: {
    profile: string;
    conversationId: string;
    messageId: string;
    signal?: AbortSignal;
}): Promise<string | null> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (args.signal?.aborted) return null;
        try {
            const res = await fetch(
                `/api/assistant/conversations/${encodeURIComponent(args.conversationId)}/messages/${encodeURIComponent(args.messageId)}`,
                {
                    headers: { "X-Assistant-Profile": args.profile },
                    signal: args.signal,
                },
            );
            if (!res.ok) return null;
            const data = await res.json() as Record<string, unknown>;
            const status = typeof data.status === "string" ? data.status.toUpperCase() : "";
            if (status === "COMPLETED" || status === "DONE") {
                return extractContent(data) || "";
            }
            if (status === "FAILED") return null;
        } catch {
            return null;
        }
        await sleep(POLL_INTERVAL_MS);
    }
    return null;
}

function extractContent(data: Record<string, unknown>): string | undefined {
    if (typeof data.content === "string" && data.content) return data.content;
    if (typeof data.synthesis === "string" && data.synthesis) return data.synthesis;
    const msg = data.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string" && msg.content) return msg.content;
    const attachments = msg?.attachments as Array<{ text?: { content?: string } }> | undefined;
    if (Array.isArray(attachments)) {
        for (const a of attachments) {
            if (a?.text?.content) return a.text.content;
        }
    }
    return undefined;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
