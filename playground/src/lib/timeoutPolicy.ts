// playground/src/lib/timeoutPolicy.ts
//
// Single source of truth for user-facing request timeouts across the
// client. Per direction 2026-05-27 (Rajesh): "simple query → 3 min,
// complex query → 5 min, if hard to determine → 5 min."
//
// Apply this to anything where the user types a question / clicks a
// button and waits for a server reply. Do NOT apply to:
//   - health probes (must be near-instant or signal a real outage)
//   - UI feedback delays (toasts, button-flash, debounce)
//   - animation/transition timings
//
// Server-side mirror at proxy/lib/timeoutPolicy.js — keep in lockstep
// or the client gives up before the server is done.

/**
 * SIMPLE — single-fetch operations where the user expects an answer
 * within seconds: connector probes, metadata sync, query history fetch,
 * static-asset retrieval. 3 minutes is generous on purpose; network or
 * cold-cache stalls shouldn't user-fail at 5-10s.
 */
export const SIMPLE_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;  // 180_000 = 3 min

/**
 * COMPLEX — multi-step / multi-LLM operations: Ask Pulse polling, AI
 * Insights staged briefing, Foundation Model streaming, SQL execution,
 * Power BI DAX execution. Anything where a query may run a warehouse
 * warmup + multiple LLM round-trips + result rendering.
 */
export const COMPLEX_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;  // 300_000 = 5 min

/**
 * Convenience predicate — when the classification is unclear, default
 * to COMPLEX per the "hard to determine = 5 min" rule.
 */
export function classifyTimeoutMs(kind: "simple" | "complex" | "unknown"): number {
    return kind === "simple" ? SIMPLE_REQUEST_TIMEOUT_MS : COMPLEX_REQUEST_TIMEOUT_MS;
}
