/**
 * connectorRegistry.js — Cycle 20 / S1 (2026-05-20).
 *
 * Stub registry over the hardcoded manifest table. PR #8 §7 scope:
 *
 *   "proxy/lib/connectorRegistry.js — stub registry that reads the
 *    table. Boot-time validation surfaces. Designed so swap to dir-scan
 *    in S2 is local."
 *
 * Public API (frozen for S1 — additive changes only in S2/S3):
 *
 *   listManifests({category?, maturity?, capability?})
 *   getManifest(id)
 *   matchProfileToConnectors(profile)
 *     -> returns the connector ids whose profileType/profileTypes include
 *        the given profile. Used by the discovery endpoint to compute
 *        runtime state. Q1 soft-migration aware: an untagged legacy
 *        profile is matched by best-effort duck-typing.
 *   describeRuntimeState({profiles})
 *     -> returns a map {connectorId: RuntimeState} where RuntimeState =
 *        { loadStatus: 'loaded' | 'failed', configuredProfiles: [...] }
 *        per the response shape locked in PR #8 §12.
 *
 * S2 swap target: dir-scan over proxy/connectors/<id>.js. The exported
 * API above does not change; only the source of manifests does.
 */

'use strict';

const { MANIFESTS } = require('./connectorManifests');

/** Map by id for O(1) lookup. */
const _byId = new Map(MANIFESTS.map(m => [m.id, m]));

/** Filter helper — returns manifests matching category/maturity/capability if provided. */
function listManifests(filters = {}) {
    const { category, maturity, capability } = filters;
    return MANIFESTS.filter(m => {
        if (category && m.category !== category) return false;
        if (maturity && m.maturity !== maturity) return false;
        if (capability && m.capabilities && !m.capabilities[capability]) return false;
        return true;
    });
}

function getManifest(id) {
    return _byId.get(id) || null;
}

/**
 * Q1 soft-migration: match a profile to its connector(s).
 *
 * Logic:
 *   1. If profile.type is set, find every manifest whose profileType ===
 *      profile.type OR profileTypes includes profile.type. Direct hit.
 *   2. If profile.type is absent, fall back to legacy duck-typing — used
 *      ONLY for the genie case today (profile.spaceId set without an
 *      explicit type). Other connectors require an explicit type field.
 *   3. Return an array because Q9 splits some legacy single-type profiles
 *      (e.g. `powerbi-semantic-model`) across multiple connector cards
 *      (DAX + Q&A). The discovery endpoint surfaces both, marked as
 *      "legacy combined profile — split for clarity".
 */
function matchProfileToConnectors(profile) {
    if (!profile || typeof profile !== 'object') return [];
    const hits = [];

    if (typeof profile.type === 'string' && profile.type.trim()) {
        for (const m of MANIFESTS) {
            const matchesPrimary = m.profileType === profile.type;
            const matchesAlias = Array.isArray(m.profileTypes) && m.profileTypes.includes(profile.type);
            if (matchesPrimary || matchesAlias) hits.push(m.id);
        }
    } else {
        // Legacy duck-type — Q1 says spaceId alone implies Genie.
        if (profile.spaceId) hits.push('genie');
    }

    return hits;
}

/**
 * Build the response payload for GET /assistant/connector-types.
 *
 * Shape (locked PR #8 §12):
 *   {
 *     manifests: [ConnectorManifest, ...],       // 12 entries, vendor-grouped
 *     runtime: {
 *       <connectorId>: {
 *         loadStatus: 'loaded',                  // S1 always 'loaded' (no dir scan failures yet)
 *         configuredProfiles: [
 *           {
 *             name: 'default',
 *             valid: true,
 *             warnings: [],
 *             source: 'config.json',             // or 'env'
 *             secretStatus: 'present' | 'missing' | 'masked',
 *             legacyCombined: false,             // true when a legacy single-type
 *                                                // profile (e.g. powerbi-semantic-model)
 *                                                // appears under multiple cards (DAX + Q&A)
 *           },
 *           ...
 *         ],
 *       },
 *     },
 *   }
 *
 * `profiles` is the proxy's `profileRegistry` snapshot, expected shape:
 *   [{ name, type?, spaceId?, ...other fields..., __source?: 'config.json' | 'env' }]
 *
 * Secret detection: any profileSchema field marked kind:'secret' is
 * inspected. Present + non-empty → 'present'. Present + empty → 'missing'.
 * Absent → 'missing'. We never put the value in the response.
 */
function describeRuntimeState({ profiles }) {
    const safeProfiles = Array.isArray(profiles) ? profiles : [];
    const out = {};

    for (const m of MANIFESTS) {
        const configured = [];
        for (const profile of safeProfiles) {
            const ids = matchProfileToConnectors(profile);
            if (!ids.includes(m.id)) continue;

            const warnings = [];
            // Check required fields are present.
            for (const [fieldName, def] of Object.entries(m.profileSchema || {})) {
                if (def.required && !_hasField(profile, fieldName)) {
                    warnings.push(`Missing required field: ${fieldName}`);
                }
            }

            // Secret status — find the (first) secret field in the schema.
            const secretField = Object.entries(m.profileSchema || {})
                .find(([_, def]) => def.kind === 'secret');
            let secretStatus = 'n/a';
            if (secretField) {
                const [secretName] = secretField;
                const v = profile[secretName];
                secretStatus = (typeof v === 'string' && v.trim()) ? 'present' : 'missing';
            }

            // Legacy combined: a single profile.type matches more than one card.
            const legacyCombined = matchProfileToConnectors(profile).length > 1;

            configured.push({
                name: profile.name,
                valid: warnings.length === 0,
                warnings,
                source: profile.__source || 'config.json',
                secretStatus,
                legacyCombined,
            });
        }
        out[m.id] = {
            loadStatus: 'loaded',  // S1 — every manifest in the table is loaded; S2 introduces dir-scan failure surfacing.
            configuredProfiles: configured,
        };
    }

    return out;
}

function _hasField(profile, fieldName) {
    if (!profile || typeof profile !== 'object') return false;
    const v = profile[fieldName];
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

/**
 * Convenience: list distinct categories used by configured connectors.
 * The UI uses this for the brand-grid category headers so empty
 * categories don't render.
 */
function listCategoriesInUse() {
    return [...new Set(MANIFESTS.map(m => m.category))];
}

module.exports = {
    listManifests,
    getManifest,
    matchProfileToConnectors,
    describeRuntimeState,
    listCategoriesInUse,
};
