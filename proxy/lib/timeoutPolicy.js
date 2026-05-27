// proxy/lib/timeoutPolicy.js
//
// Server-side mirror of the client timeout policy at
// playground/src/lib/timeoutPolicy.ts. Per direction 2026-05-27:
// "simple → 3 min, complex → 5 min, hard to determine → 5 min."
//
// Keep in lockstep with the client. If the proxy aborts at 30s while
// the client waits 5 min, the client sees a 5xx instead of a timeout
// and the user gets a confusing error message.

const SIMPLE_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;   // 180_000 = 3 min
const COMPLEX_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;  // 300_000 = 5 min

function classifyTimeoutMs(kind) {
    return kind === 'simple' ? SIMPLE_REQUEST_TIMEOUT_MS : COMPLEX_REQUEST_TIMEOUT_MS;
}

module.exports = {
    SIMPLE_REQUEST_TIMEOUT_MS,
    COMPLEX_REQUEST_TIMEOUT_MS,
    classifyTimeoutMs,
};
