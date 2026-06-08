'use strict';

/**
 * connectorRegistry.js — discovers + validates drop-in connector modules under
 * proxy/connectors/. Phase A (scaffolding) of the connector-plugin architecture
 * — see docs/AGENT_SYNC.md `[DECISION]` 2026-05-20.
 *
 * **Phase A migrates NO connectors.** A live scan of proxy/connectors/ finds
 * only `_template.js` (skipped) + the two infra files (skipped), so it returns
 * an empty list and registers nothing — existing routes are completely
 * unaffected. This file is the seam that Phases B/C drop real connectors into.
 *
 * Drop-in contract (one file per connector — see `_template.js`):
 *   module.exports = {
 *     id: 'genie',
 *     displayName: 'Databricks Genie',
 *     matchProfile(profile) { ... },         // required
 *     async probe(profile, profileName, helpers) { ... },  // optional
 *     register(host) { host.app.post('/...', handler); },  // required
 *     async unregister(host) { ... },         // optional
 *   };
 *
 * Filename convention — a `.js` file is a CONNECTOR unless it is:
 *   - underscore-prefixed (`_template.js`, `_anything.js`) — examples/scaffolds
 *   - one of the infra files (`connectorRegistry.js`, `connectorHost.js`)
 *
 * Everything here is defensive: a missing dir, an unreadable module, or a
 * malformed export is reported via `onWarn` and skipped — it NEVER throws, so
 * connector scaffolding can never block server boot.
 */

const fs = require('fs');
const path = require('path');

const INFRA_FILES = Object.freeze(new Set(['connectorRegistry.js', 'connectorHost.js']));

/**
 * Validate a module against the drop-in contract.
 * @param {*} mod
 * @returns {string|null} a human reason when invalid, or null when valid.
 */
function validateConnector(mod) {
    if (!mod || typeof mod !== 'object') return 'export is not an object';
    if (typeof mod.id !== 'string' || !mod.id.trim()) return 'missing string `id`';
    if (typeof mod.matchProfile !== 'function') return 'missing `matchProfile(profile)`';
    if (typeof mod.register !== 'function') return 'missing `register(host)`';
    if (mod.probe !== undefined && typeof mod.probe !== 'function') return '`probe` must be a function when present';
    if (mod.unregister !== undefined && typeof mod.unregister !== 'function') return '`unregister` must be a function when present';
    return null;
}

/** True when a filename should be treated as a candidate connector module. */
function isConnectorFile(file) {
    return file.endsWith('.js') && !file.startsWith('_') && !INFRA_FILES.has(file);
}

/**
 * Discover connector modules in `dir`.
 * @param {string} dir absolute path to the connectors directory.
 * @param {{ onWarn?: (msg: string) => void, requireFn?: (p: string) => any }} [opts]
 * @returns {Array<object>} validated connector modules (possibly empty).
 */
function discoverConnectors(dir, opts = {}) {
    const onWarn = typeof opts.onWarn === 'function' ? opts.onWarn : () => {};
    const requireFn = typeof opts.requireFn === 'function' ? opts.requireFn : require;
    let entries;
    try {
        entries = fs.readdirSync(dir);
    } catch {
        return []; // no connectors/ dir, or unreadable → nothing to load (valid Phase A state)
    }
    const connectors = [];
    const seenIds = new Set();
    for (const file of entries.slice().sort()) {
        if (!isConnectorFile(file)) continue;
        let mod;
        try {
            mod = requireFn(path.join(dir, file));
        } catch (err) {
            onWarn(`${file} failed to load: ${(err && err.message) || err}`);
            continue;
        }
        const reason = validateConnector(mod);
        if (reason) {
            onWarn(`${file} ignored — ${reason}`);
            continue;
        }
        if (seenIds.has(mod.id)) {
            onWarn(`${file} ignored — duplicate connector id "${mod.id}"`);
            continue;
        }
        seenIds.add(mod.id);
        connectors.push(mod);
    }
    return connectors;
}

/**
 * Call `register(host)` on each connector. One connector throwing does NOT
 * abort the others or the boot.
 * @param {Array<object>} connectors
 * @param {object} host built via buildConnectorHost()
 * @param {{ onWarn?: (msg: string) => void }} [opts]
 * @returns {string[]} ids of connectors that registered successfully.
 */
function registerConnectors(connectors, host, opts = {}) {
    const onWarn = typeof opts.onWarn === 'function' ? opts.onWarn : () => {};
    const registered = [];
    for (const c of connectors || []) {
        try {
            c.register(host);
            registered.push(c.id);
        } catch (err) {
            onWarn(`connector "${c && c.id}" register() threw: ${(err && err.message) || err}`);
        }
    }
    return registered;
}

module.exports = {
    discoverConnectors,
    registerConnectors,
    validateConnector,
    isConnectorFile,
    INFRA_FILES,
};
