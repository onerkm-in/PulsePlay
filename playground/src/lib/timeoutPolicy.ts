// Single source of truth for user-facing request timeouts across the
// client: simple queries get 3 minutes, complex ones 5, and anything hard
// to classify defaults to 5. Applies wherever the user asks a question or
// clicks a button and waits for a server reply. It does not apply to health
// probes (those must be near-instant or signal a real outage), UI feedback
// delays, or animation timings. Keep in lockstep with the server-side
// mirror at proxy/lib/timeoutPolicy.js, or the client gives up before the
// server is done.

/**
 * Single-fetch operations where the user expects an answer within seconds:
 * connector probes, metadata sync, query history, static assets. Three
 * minutes is generous on purpose so network or cold-cache stalls don't
 * fail the user at 5-10s.
 */
export const SIMPLE_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;  // 3 min

/**
 * Multi-step or multi-LLM operations: Ask Pulse polling, AI Insights staged
 * briefing, Foundation Model streaming, SQL and Power BI DAX execution.
 * Anything that may run a warehouse warmup plus several LLM round-trips.
 */
export const COMPLEX_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;  // 5 min

