'use strict';

/**
 * _template.js — copy this to `proxy/connectors/<id>.js` to add a connector.
 *
 * This file is UNDERSCORE-PREFIXED, so connectorRegistry.js SKIPS it — it is a
 * reference example, never a live connector. Phase A scaffolding of the
 * connector-plugin architecture (docs/AGENT_SYNC.md `[DECISION]` 2026-05-20).
 *
 * Lifecycle: server.js's boot-time scan calls `discoverConnectors()` then
 * `registerConnectors()`. Your `register(host)` wires routes/handlers. `host`
 * (built by connectorHost.js) is the ONLY surface you may touch — never reach
 * into server.js internals.
 *
 * Contract rule: if you find yourself needing something not on `host`, and at
 * least one OTHER connector needs it too, add it to connectorHost.js's surface.
 * If only YOUR connector needs it, keep it inside this file.
 */

module.exports = {
    /** Stable id — used in logs + as the dedup key across the registry. Required. */
    id: 'template',

    /** Human label for diagnostics / Setup surfaces. Optional. */
    displayName: 'Example Connector (template)',

    /**
     * Return true when THIS connector owns the given resolved profile. Phase A
     * registers routes only; Phase B wires matchProfile into per-request
     * dispatch (so the right connector handles a profile). Required.
     * @param {object} _profile resolved profile object
     * @returns {boolean}
     */
    matchProfile(_profile) {
        return false; // a template never matches a real profile
    },

    /**
     * Cheap connectivity / metadata probe for the Setup → AI "Test connection"
     * surface. Optional — omit entirely if the connector has no probe.
     * @param {object} _profile
     * @param {string} _profileName
     * @param {object} _helpers host-provided helpers
     * @returns {Promise<{ ok: boolean, detail: string }>}
     */
    async probe(_profile, _profileName, _helpers) {
        return { ok: false, detail: 'template connector — not a real backend' };
    },

    /**
     * Wire this connector's routes/handlers onto the host. Required.
     * @param {object} _host built by connectorHost.js — the only allowed surface
     */
    register(_host) {
        // Example (do not enable in the template):
        //   _host.app.post('/assistant/conversations/start', async (req, res) => { ... });
    },

    /**
     * Optional teardown — used by tests / future hot-reload. Most connectors
     * can omit this (Express has no first-class route removal).
     * @param {object} _host
     */
    async unregister(_host) {},
};
