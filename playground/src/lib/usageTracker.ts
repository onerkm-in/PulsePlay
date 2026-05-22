// playground/src/lib/usageTracker.ts
//
// Session-wide token usage tracker. Powers the SustainabilityIndicator in
// the AISidebar footer — PulsePlay's "fewer tokens, better accuracy" motto
// visible to the end-user.
//
// Two data sources:
//   1. Real `usage` blocks from backends that report them (OpenAI /
//      Foundation Model / Bedrock-Llama all return `usage: { prompt_tokens,
//      completion_tokens, total_tokens }` in chat-completions shape).
//   2. Heuristic char/4 estimation for backends that don't (Genie returns
//      narrative + SQL but no token counts).
//
// The tracker keeps a single `SessionUsage` aggregate keyed by tab/window
// session — it never persists across reloads, and resetting is exposed for
// "new conversation" UX.
//
// Subscribers (the indicator) re-render via subscribe()/unsubscribe(). The
// pattern matches discoveryClient.ts's event bus.

/** Tier thresholds (in TOTAL tokens for the session). Tuned so a typical
 *  3-4 question conversation lands in "lean" — the message is "PulsePlay is
 *  efficient by default; you have to work to make it heavy." */
export const TIER_THRESHOLDS = {
    LEAN: 2_000,
    GREEN: 8_000,
    MODERATE: 20_000,
    HEAVY: 50_000,
} as const;

export type GreennessTier = "ready" | "lean" | "green" | "moderate" | "heavy" | "very-heavy";

export interface SessionUsage {
    /** Total tokens consumed in this session (input + output). */
    totalTokens: number;
    /** Input/prompt tokens only. */
    inputTokens: number;
    /** Output/completion tokens only. */
    outputTokens: number;
    /** Number of questions asked. */
    questionCount: number;
    /** True when at least one entry came from a real `usage` block; false
     *  when every entry was estimated from text length. */
    hasRealData: boolean;
    /** True when at least one entry was estimated (UI shows "~"). */
    hasEstimates: boolean;
    /** Computed tier — drives the indicator's color/emoji. */
    tier: GreennessTier;
}

/** What the tracker accepts per response. Either provide a `usage` block
 *  (preferred) or `texts` and let the tracker estimate. */
export interface RecordResponseInput {
    /** Real OpenAI-shape usage block from the backend, when available. */
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        input_tokens?: number;        // Anthropic shape
        output_tokens?: number;       // Anthropic shape
        total_tokens?: number;
    } | null;
    /** Fallback: text fragments to estimate from. The tracker sums their
     *  lengths and divides by 4. Provide separately so we can attribute
     *  to input vs output. */
    texts?: {
        systemPrompt?: string;
        userQuestion?: string;
        response?: string;
    };
}

type UsageListener = (usage: SessionUsage) => void;

/* ─── State ──────────────────────────────────────────────────────────── */

let _state: SessionUsage = _empty();
const _listeners = new Set<UsageListener>();

function _empty(): SessionUsage {
    return {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        questionCount: 0,
        hasRealData: false,
        hasEstimates: false,
        tier: "ready",
    };
}

/* ─── Public API ────────────────────────────────────────────────────── */

/**
 * Record usage for a single LLM response. Accepts either a real `usage`
 * block from the backend OR `texts` for char-length estimation. Real data
 * wins when both are provided.
 *
 * Idempotent on identical input only by the caller's discipline — this
 * tracker assumes each call corresponds to one distinct LLM turn.
 */
export function recordResponse(input: RecordResponseInput): SessionUsage {
    const u = input.usage;
    let input_tokens = 0;
    let output_tokens = 0;
    let isEstimate = false;

    if (u && typeof u === "object") {
        // Normalise OpenAI vs Anthropic shape.
        input_tokens = _coerceNumber(u.prompt_tokens) ?? _coerceNumber(u.input_tokens) ?? 0;
        output_tokens = _coerceNumber(u.completion_tokens) ?? _coerceNumber(u.output_tokens) ?? 0;
        if (input_tokens === 0 && output_tokens === 0 && _coerceNumber(u.total_tokens)) {
            // Backend gave total only — split 70/30 input/output as a rough heuristic.
            const total = _coerceNumber(u.total_tokens) || 0;
            input_tokens = Math.round(total * 0.7);
            output_tokens = total - input_tokens;
        }
    }

    if (input_tokens === 0 && output_tokens === 0 && input.texts) {
        // Fallback: chars/4 heuristic, well-known approximation for GPT-style
        // tokenizers on English text. Genie / OpenAI / Anthropic all sit
        // in the 3.5-4.5 chars-per-token range for plain prose.
        const sys = input.texts.systemPrompt || "";
        const q = input.texts.userQuestion || "";
        const r = input.texts.response || "";
        input_tokens = Math.ceil((sys.length + q.length) / 4);
        output_tokens = Math.ceil(r.length / 4);
        isEstimate = true;
    }

    // Defensive: never go negative or push absurd values.
    input_tokens = Math.max(0, Math.min(input_tokens, 1_000_000));
    output_tokens = Math.max(0, Math.min(output_tokens, 1_000_000));

    _state = {
        totalTokens: _state.totalTokens + input_tokens + output_tokens,
        inputTokens: _state.inputTokens + input_tokens,
        outputTokens: _state.outputTokens + output_tokens,
        questionCount: _state.questionCount + 1,
        hasRealData: _state.hasRealData || !isEstimate,
        hasEstimates: _state.hasEstimates || isEstimate,
        tier: "ready",
    };
    _state.tier = _computeTier(_state.totalTokens);
    _notify();
    return _state;
}

/** Read the current session usage snapshot. */
export function getSessionUsage(): SessionUsage {
    return _state;
}

/** Subscribe to usage updates. Returns an unsubscribe function. */
export function subscribeUsage(handler: UsageListener): () => void {
    _listeners.add(handler);
    return () => { _listeners.delete(handler); };
}

/** Reset for a new conversation. Components subscribed re-render with the
 *  "ready" tier and zero counts. */
export function resetSessionUsage(): void {
    _state = _empty();
    _notify();
}

/** Map a tier to its display label. */
export function tierLabel(tier: GreennessTier): string {
    switch (tier) {
        case "ready": return "Ready";
        case "lean": return "Lean";
        case "green": return "Green";
        case "moderate": return "Moderate";
        case "heavy": return "Heavy";
        case "very-heavy": return "Very heavy";
    }
}

/** Map a tier to its CSS color hint (consumed by SustainabilityIndicator).
 *  Names match the project's existing palette; hardcoded fallback for
 *  environments where the variables aren't defined. */
export function tierColor(tier: GreennessTier): string {
    switch (tier) {
        case "ready": return "var(--pp-leaf-ready, #9ca3af)";       // neutral grey
        case "lean": return "var(--pp-leaf-lean, #15803d)";          // bright green
        case "green": return "var(--pp-leaf-green, #16a34a)";        // green
        case "moderate": return "var(--pp-leaf-moderate, #ca8a04)";  // amber
        case "heavy": return "var(--pp-leaf-heavy, #ea580c)";        // orange
        case "very-heavy": return "var(--pp-leaf-very-heavy, #dc2626)"; // red
    }
}

/** Map a tier to the visible leaf/face emoji. The user explicitly asked
 *  for "green leaf happy icon" + "smile". Other tiers degrade gracefully. */
export function tierEmoji(tier: GreennessTier): string {
    switch (tier) {
        case "ready": return "🌱";
        case "lean": return "🍃";
        case "green": return "🍃";
        case "moderate": return "🍂";
        case "heavy": return "🍂";
        case "very-heavy": return "🍁";
    }
}

/** Map a tier to a smile/expression emoji shown alongside the leaf. */
export function tierFace(tier: GreennessTier): string {
    switch (tier) {
        case "ready": return "🙂";
        case "lean": return "😄";
        case "green": return "🙂";
        case "moderate": return "😐";
        case "heavy": return "😕";
        case "very-heavy": return "☹️";
    }
}

/** Brand-message line shown in the tooltip. Picks one of three taglines
 *  by tier so the same user doesn't see identical copy across questions. */
export function tierTagline(tier: GreennessTier): string {
    switch (tier) {
        case "ready":
            return "Ready when you are. PulsePlay aims for fewer tokens, better accuracy — the lean-and-mean solution.";
        case "lean":
            return "Lean and mean. Best accuracy at the lowest cost — the best of both worlds.";
        case "green":
            return "Still green. Efficient queries; accurate answers. The lean-and-mean approach is working.";
        case "moderate":
            return "Moderate use. Quality answers, fair cost. Consider tightening the next question's scope.";
        case "heavy":
            return "Heavy session. Lots of context in play; consider starting a fresh conversation to reset.";
        case "very-heavy":
            return "Very heavy session. Aggregate context is large; a fresh conversation will be cheaper and likely more accurate.";
    }
}

/* ─── Internals ─────────────────────────────────────────────────────── */

function _computeTier(total: number): GreennessTier {
    if (total === 0) return "ready";
    if (total <= TIER_THRESHOLDS.LEAN) return "lean";
    if (total <= TIER_THRESHOLDS.GREEN) return "green";
    if (total <= TIER_THRESHOLDS.MODERATE) return "moderate";
    if (total <= TIER_THRESHOLDS.HEAVY) return "heavy";
    return "very-heavy";
}

function _coerceNumber(v: unknown): number | null {
    if (typeof v !== "number") return null;
    if (!Number.isFinite(v) || v < 0) return null;
    return v;
}

function _notify(): void {
    for (const fn of _listeners) {
        try { fn(_state); } catch { /* listener errors don't break dispatch */ }
    }
}

/** Test-only hook. Resets state AND clears listeners. */
export function __resetUsageTrackerForTests(): void {
    _state = _empty();
    _listeners.clear();
}
