'use strict';

// G3a — Proxy-side governance attestation BUILDER only.
//
// What this module owns
// ─────────────────────
//   • `buildGovernanceAttestation(input)` — the single sanctioned way
//     for proxy backend paths to stamp a renderable response with an
//     attestation. Always emits `enforced: true`; validates and
//     sanitizes inputs; freezes the output so callers can't mutate.
//   • `GOVERNANCE_AUTHORITIES` and `GOVERNANCE_COST_UNITS` — frozen
//     allowlists callers can iterate.
//
// What this module does NOT own
// ─────────────────────────────
//   • Backend route wiring — that's G3b (genie path) and G3c (the
//     other 9 paths). This module only provides the builder; callers
//     attach the result to their response envelope.
//   • Native fail-closed render check — that's G3d, browser-side.
//   • Audit logging — the existing `auditLog` in `server.js` will
//     stamp clientApp + governance.authority in G3b/G3c.
//
// Why this lives in proxy/lib (not playground/src/visualization)
// ─────────────────────────────────────────────────────────────
// Browsers MUST NOT construct attestations. The proxy is the only
// trusted party that can attest "rows are filtered for subject X by
// authority Y." Putting the builder server-side means a malicious or
// careless browser cannot fake `enforced: true`.

const GOVERNANCE_AUTHORITIES = Object.freeze([
    'unity-catalog',
    'powerbi-semantic-model',
    'warehouse',
    'mock',
]);

const GOVERNANCE_COST_UNITS = Object.freeze([
    'rows-scanned',
    'cached',
    'usd',
]);

// Identifier chars allowed in subjectRef / requestId / policyVersion.
// Generous enough for hashes, URL-like refs (`user@org.example/path`),
// SP identity hashes (`sha256:abcd...`), and version strings (`v2.3.0`).
// Dangerous shell/HTML chars deliberately excluded.
const REF_CHARSET = /[^A-Za-z0-9._:+@/\-]/g;
const REF_MAX_LEN = 200;

function isProductionEnv() {
    return process.env.NODE_ENV === 'production';
}

function sanitizeRef(value, label) {
    if (typeof value !== 'string') {
        throw new TypeError(`governance.${label} must be a string; got ${typeof value}`);
    }
    const cleaned = value.replace(REF_CHARSET, '').slice(0, REF_MAX_LEN);
    if (cleaned.length === 0) {
        throw new Error(`governance.${label} cannot be empty after sanitization`);
    }
    return cleaned;
}

function validateAuthority(value) {
    if (!GOVERNANCE_AUTHORITIES.includes(value)) {
        throw new Error(
            `governance.authority must be one of: ${GOVERNANCE_AUTHORITIES.join(', ')}; got: ${JSON.stringify(value)}`,
        );
    }
    if (value === 'mock' && isProductionEnv()) {
        throw new Error(
            'governance.authority="mock" is forbidden in production (NODE_ENV=production). '
            + 'Configure a real authority (unity-catalog | powerbi-semantic-model | warehouse) for production deployments.',
        );
    }
    return value;
}

function validateFiniteNonNegativeNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`governance.${label} must be a finite non-negative number; got: ${JSON.stringify(value)}`);
    }
    return value;
}

function validateCostEstimate(value) {
    if (typeof value !== 'object' || value === null) {
        throw new TypeError(`governance.costEstimate must be an object; got ${typeof value}`);
    }
    const { unit, value: cost } = value;
    if (!GOVERNANCE_COST_UNITS.includes(unit)) {
        throw new Error(
            `governance.costEstimate.unit must be one of: ${GOVERNANCE_COST_UNITS.join(', ')}; got: ${JSON.stringify(unit)}`,
        );
    }
    validateFiniteNonNegativeNumber(cost, 'costEstimate.value');
    return Object.freeze({ unit, value: cost });
}

/**
 * Build a sanctioned `GovernanceAttestation` to attach to a renderable
 * AI result. Always emits `enforced: true` — callers cannot override.
 *
 * @param {object} input
 * @param {'unity-catalog'|'powerbi-semantic-model'|'warehouse'|'mock'} input.authority
 * @param {string} input.subjectRef        - who the rows were filtered for
 * @param {string} input.requestId         - audit correlation id
 * @param {object} [input.sourceRef]       - typed Databricks source ref (G2.5)
 * @param {string} [input.policyVersion]
 * @param {number} [input.rowLimitApplied]
 * @param {boolean} [input.columnPolicyApplied]
 * @param {boolean} [input.cacheHit]
 * @param {{unit: 'rows-scanned'|'cached'|'usd', value: number}} [input.costEstimate]
 * @returns {Readonly<object>} - frozen attestation object
 * @throws {TypeError|Error|RangeError} - on any validation failure
 */
function buildGovernanceAttestation(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('buildGovernanceAttestation requires an input object');
    }

    const authority = validateAuthority(input.authority);
    const subjectRef = sanitizeRef(input.subjectRef, 'subjectRef');
    const requestId = sanitizeRef(input.requestId, 'requestId');

    const attestation = {
        enforced: true,
        authority,
        subjectRef,
        requestId,
    };

    if (input.sourceRef !== undefined) {
        if (typeof input.sourceRef !== 'object' || input.sourceRef === null || Array.isArray(input.sourceRef)) {
            throw new TypeError('governance.sourceRef must be an object when present');
        }
        // The proxy trusts upstream callers to pass a structurally-valid
        // sourceRef (typed via G2.5). Deep validation lives in the
        // frontend guard; this builder forwards the value as-is so the
        // proxy doesn't take a frontend dependency.
        attestation.sourceRef = input.sourceRef;
    }
    if (input.policyVersion !== undefined) {
        attestation.policyVersion = sanitizeRef(input.policyVersion, 'policyVersion');
    }
    if (input.rowLimitApplied !== undefined) {
        attestation.rowLimitApplied = validateFiniteNonNegativeNumber(input.rowLimitApplied, 'rowLimitApplied');
    }
    if (input.columnPolicyApplied !== undefined) {
        if (typeof input.columnPolicyApplied !== 'boolean') {
            throw new TypeError(`governance.columnPolicyApplied must be a boolean; got ${typeof input.columnPolicyApplied}`);
        }
        attestation.columnPolicyApplied = input.columnPolicyApplied;
    }
    if (input.cacheHit !== undefined) {
        if (typeof input.cacheHit !== 'boolean') {
            throw new TypeError(`governance.cacheHit must be a boolean; got ${typeof input.cacheHit}`);
        }
        attestation.cacheHit = input.cacheHit;
    }
    if (input.costEstimate !== undefined) {
        attestation.costEstimate = validateCostEstimate(input.costEstimate);
    }

    return Object.freeze(attestation);
}

module.exports = {
    GOVERNANCE_AUTHORITIES,
    GOVERNANCE_COST_UNITS,
    buildGovernanceAttestation,
};
