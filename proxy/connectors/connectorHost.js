'use strict';

/**
 * connectorHost.js — builds the `host` object: the ONLY surface a drop-in
 * connector module is allowed to touch. Phase A (scaffolding) of the
 * connector-plugin architecture — see docs/AGENT_SYNC.md `[DECISION]`
 * 2026-05-20 for the contract + phased rollout.
 *
 * Why a controlled surface: the 9k-line server.js knowing about every connector
 * is the dominant friction. The plugin model lets a connector be added by
 * dropping a file into proxy/connectors/ and removed by deleting it. The host
 * is the seam — connectors depend on `host`, never on server.js internals.
 *
 * **Rule that protects the contract** (from the [DECISION] block): only expose
 * what AT LEAST TWO connectors need. Anything one-connector-specific stays
 * inside that connector file — otherwise `host` becomes the new monolith one
 * layer down. Phase A exposes the minimal common primitives; later phases add
 * members only as migrated connectors prove a shared need. (`sanitiseSlotName`
 * and the discovery/packs prompt injectors from the sketch are intentionally
 * deferred until a migrated connector actually consumes them.)
 *
 * Pure factory: `buildConnectorHost(deps)` returns a frozen host. server.js
 * passes its real in-scope helpers; tests pass mocks. No singletons here.
 */

// The minimal common surface every connector can rely on. Kept deliberately
// small (see the contract rule above). server.js supplies each from closure.
const REQUIRED_DEP_KEYS = Object.freeze([
    'app',                       // Express app — connectors wire their own routes
    'auditLog',                  // structured audit row emitter
    'createProblem',             // RFC-9457 problem builder
    'sendProblem',               // problem responder
    'sendNoMatchingProfile',     // 4xx when no profile resolves
    'profileRegistry',           // profile lookups (get/list/findByHost)
    'profileByName',             // resolve a profile by explicit name
    'profileAllowedForRequest',  // allowlist gate
    'databricksRequest',         // authenticated Databricks REST helper
    'spHashForProfile',          // service-principal identity hash for audit
]);

// Optional shared helpers — wired only when the host supplies them, so the
// surface stays honest about what is actually available in a given embedding.
const OPTIONAL_DEP_KEYS = Object.freeze(['validateFrame', 'prependFrameContext']);

/**
 * Build the frozen connector host from a deps bag.
 * @param {Record<string, unknown>} deps
 * @returns {Readonly<Record<string, unknown>>}
 * @throws {TypeError} when deps is absent or a required member is missing.
 */
function buildConnectorHost(deps) {
    if (!deps || typeof deps !== 'object') {
        throw new TypeError('buildConnectorHost(deps): a deps object is required');
    }
    const missing = REQUIRED_DEP_KEYS.filter((k) => deps[k] === undefined || deps[k] === null);
    if (missing.length) {
        throw new TypeError(`buildConnectorHost: missing required host deps: ${missing.join(', ')}`);
    }
    const host = {};
    for (const k of REQUIRED_DEP_KEYS) host[k] = deps[k];
    for (const k of OPTIONAL_DEP_KEYS) {
        if (deps[k] !== undefined && deps[k] !== null) host[k] = deps[k];
    }
    return Object.freeze(host);
}

module.exports = { buildConnectorHost, REQUIRED_DEP_KEYS, OPTIONAL_DEP_KEYS };
