// @ts-check
'use strict';

/**
 * validationRetryBudget.js — resolves the per-request server-side validation
 * retry budget.
 *
 * Two inputs:
 *   - env: the deployer's `GENIE_POLL_VALIDATE_RETRIES` (or equivalent)
 *     baseline, parsed and clamped to 0..3. Anything malformed → 0.
 *   - client: an optional per-request override from
 *     `maxValidationRetries`. When provided, it WINS — Settings UI raises
 *     or lowers retries without re-deploying the proxy. Clamped 0..3.
 *
 * Returned value is the canonical budget the retry loop should use. 0
 * means "skip server-side retry; ship the first answer verbatim".
 */

const MIN = 0;
const MAX = 3;

/** Clamp + integer-cast helper. Non-finite / non-number → fallback. */
function clamp(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const i = Math.floor(value);
        if (i < MIN) return MIN;
        if (i > MAX) return MAX;
        return i;
    }
    return fallback;
}

/** Parse a stringy env-var value into an integer in range; defaults to 0. */
function parseEnvBudget(raw) {
    if (typeof raw !== 'string' || raw.length === 0) return 0;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return 0;
    if (n < MIN) return MIN;
    if (n > MAX) return MAX;
    return n;
}

/**
 * Resolve the effective retry budget.
 *
 * @param {object} args
 * @param {string|undefined|null} args.envValue   Raw env-var string (or undefined).
 * @param {number|null|undefined} args.clientValue Numeric override from request payload.
 * @returns {number} Effective budget, clamped 0..3.
 */
function resolveBudget({ envValue, clientValue }) {
    const envBudget = parseEnvBudget(envValue);
    if (clientValue == null) return envBudget;
    return clamp(clientValue, envBudget);
}

module.exports = {
    resolveBudget,
    parseEnvBudget,
    MIN_BUDGET: MIN,
    MAX_BUDGET: MAX,
};
