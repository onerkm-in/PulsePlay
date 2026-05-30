/**
 * connectorManifestSchema.js — Cycle 20 / S1 (2026-05-20).
 *
 * The single load-bearing artifact defined in docs/CONNECTOR_PLATFORM_REDESIGN_2026-05-20.md.
 * Every connector — Genie, Foundation Model, OpenAI chat, OpenAI analytics,
 * Bedrock direct, Bedrock RAG, Supervisor, Supervisor-local, ResponsesAgent,
 * Power BI Dataset DAX, Power BI Q&A — declares a ConnectorManifest. The
 * registry validates each one against this schema at boot. The Setup UI
 * renders only from manifests (no hand-coded provider knowledge in the UI).
 *
 * S1 honest scope: schema + validator only. No physical route extraction —
 * `routes[].handler` is intentionally absent here; manifests declare route
 * METADATA so the discovery endpoint can describe them, but server.js still
 * owns the actual app.post() calls until S2 starts the migration.
 *
 * S2 introduces `host.registerRoute({connectorId, method, path, handler,
 * auth, auditEvent})` as the default route surface; S3 migrates each
 * connector one PR at a time.
 *
 * Locked decisions from PR #8 §12:
 *   Q1: matchProfile() is the legacy alias path (soft migration).
 *   Q2: required fields listed below; deferred = validation regexes, secret
 *       rotation hints, allowlist policy integration, example payloads.
 *   Q4: category + capabilities + maturity are 3 ORTHOGONAL dimensions.
 *   Q8: every capability the code supports is exposed; default enabled = all
 *       available; three-state badge: capable / available / enabled.
 *   Q9: split when settings differ (qualitative: distinct required field,
 *       distinct secret/auth scope, distinct route contract, distinct probe
 *       lifecycle, distinct deployer owner).
 */

'use strict';

const CATEGORIES = new Set([
    // PR #8 Q9 — vendor-grouped brand grid (Microsoft / Azure / AWS / Databricks / Demo).
    'microsoft',
    'azure',
    'aws',
    'databricks',
    'demo',
]);

const MATURITY = new Set([
    // PR #8 Q4 — orthogonal lifecycle dimension. Stable = production-ready;
    // beta = working but rough edges; preview = behind a flag.
    'stable',
    'beta',
    'preview',
]);

const FIELD_KINDS = new Set([
    // PR #8 Q2 — typed profileSchema field kinds so the UI knows whether to
    // render a password input, a URL field, a JSON textarea, etc.
    'string',
    'secret',
    'url',
    'guid',
    'integer',
    'boolean',
    'enum',
    'json',
]);

const ROUTE_PURPOSES = new Set([
    // PR #8 Q2 — every route declared by a manifest has a 'purpose' tag so
    // the discovery endpoint can describe what the route does without
    // exposing handler internals.
    'conversation-start',
    'conversation-poll',
    'embed-token',
    'health-probe',
    'discovery',
    'fan-out-stream',
    'admin',
]);

/**
 * Validate a single connector manifest against the S1 contract.
 * Returns { ok: true } when valid, else { ok: false, errors: string[] }.
 *
 * The validator is exhaustive — every error is reported up front so the
 * boot-time scan can surface ALL broken manifests in one go rather than
 * failing fast on the first one. Treat any error as a hard build break.
 */
function validateManifest(m) {
    const errors = [];
    if (!m || typeof m !== 'object') {
        return { ok: false, errors: ['manifest is not an object'] };
    }

    // Identity
    if (typeof m.id !== 'string' || !m.id.match(/^[a-z][a-z0-9-]{2,}$/)) {
        errors.push(`id must be lowercase kebab-case (got ${JSON.stringify(m.id)})`);
    }
    if (typeof m.version !== 'string' || !m.version.match(/^\d+\.\d+\.\d+$/)) {
        errors.push(`version must be semver MAJOR.MINOR.PATCH (got ${JSON.stringify(m.version)})`);
    }
    if (typeof m.displayName !== 'string' || !m.displayName.trim()) {
        errors.push('displayName must be a non-empty string');
    }
    if (typeof m.tagline !== 'string' || m.tagline.length > 80) {
        errors.push('tagline must be a string of <= 80 chars');
    }
    if (typeof m.description !== 'string' || !m.description.trim()) {
        errors.push('description must be a non-empty string');
    }
    if (typeof m.icon !== 'string' || !m.icon.trim()) {
        errors.push('icon must be a non-empty string (e.g. "databricks-genie")');
    }

    // Taxonomy (orthogonal: category × capabilities × maturity)
    if (!CATEGORIES.has(m.category)) {
        errors.push(`category must be one of [${[...CATEGORIES].join(', ')}] (got ${JSON.stringify(m.category)})`);
    }
    if (!MATURITY.has(m.maturity)) {
        errors.push(`maturity must be one of [${[...MATURITY].join(', ')}] (got ${JSON.stringify(m.maturity)})`);
    }

    // profileType / profileTypes — soft-migration alias path (Q1)
    const hasProfileType = typeof m.profileType === 'string' && m.profileType.trim();
    const hasProfileTypes = Array.isArray(m.profileTypes) && m.profileTypes.length > 0
        && m.profileTypes.every(t => typeof t === 'string' && t.trim());
    if (!hasProfileType && !hasProfileTypes) {
        errors.push('must declare profileType (string) or profileTypes (string[])');
    }

    // capabilities — boolean map of what the connector code supports (Q8)
    if (!m.capabilities || typeof m.capabilities !== 'object') {
        errors.push('capabilities must be an object of {key: boolean}');
    } else {
        for (const [k, v] of Object.entries(m.capabilities)) {
            if (typeof v !== 'boolean') {
                errors.push(`capabilities.${k} must be a boolean (got ${typeof v})`);
            }
        }
    }

    // profileSchema — typed field descriptors for the UI / snippet generator
    if (!m.profileSchema || typeof m.profileSchema !== 'object') {
        errors.push('profileSchema must be an object');
    } else {
        for (const [fieldName, def] of Object.entries(m.profileSchema)) {
            if (!def || typeof def !== 'object') {
                errors.push(`profileSchema.${fieldName} must be an object`);
                continue;
            }
            if (!FIELD_KINDS.has(def.kind)) {
                errors.push(`profileSchema.${fieldName}.kind must be one of [${[...FIELD_KINDS].join(', ')}] (got ${JSON.stringify(def.kind)})`);
            }
            if (typeof def.required !== 'boolean') {
                errors.push(`profileSchema.${fieldName}.required must be a boolean`);
            }
            if (typeof def.label !== 'string' || !def.label.trim()) {
                errors.push(`profileSchema.${fieldName}.label must be a non-empty string`);
            }
            if (def.kind === 'secret' && def.secret !== true) {
                errors.push(`profileSchema.${fieldName}: kind:'secret' implies secret:true (be explicit so the snippet generator knows to mask the value)`);
            }
            if (def.secret === true && def.kind !== 'secret') {
                errors.push(`profileSchema.${fieldName}: secret:true requires kind:'secret'`);
            }
        }
    }

    // setupSteps — ordered author-facing checklist
    if (!Array.isArray(m.setupSteps) || m.setupSteps.length === 0) {
        errors.push('setupSteps must be a non-empty array of strings');
    } else if (!m.setupSteps.every(s => typeof s === 'string' && s.trim())) {
        errors.push('setupSteps must all be non-empty strings');
    }

    // docsUrl — public docs link
    if (typeof m.docsUrl !== 'string' || !m.docsUrl.match(/^https?:\/\//)) {
        errors.push(`docsUrl must be an http(s) URL (got ${JSON.stringify(m.docsUrl)})`);
    }

    // routes — namespace + purpose metadata (S1 declares routes; S2 owns handlers)
    if (!Array.isArray(m.routes) || m.routes.length === 0) {
        errors.push('routes must be a non-empty array of {method, path, purpose}');
    } else {
        m.routes.forEach((r, i) => {
            if (!r || typeof r !== 'object') {
                errors.push(`routes[${i}] must be an object`);
                return;
            }
            if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(r.method)) {
                errors.push(`routes[${i}].method must be GET/POST/PUT/DELETE/PATCH (got ${JSON.stringify(r.method)})`);
            }
            if (typeof r.path !== 'string' || !r.path.startsWith('/')) {
                errors.push(`routes[${i}].path must start with / (got ${JSON.stringify(r.path)})`);
            }
            if (!ROUTE_PURPOSES.has(r.purpose)) {
                errors.push(`routes[${i}].purpose must be one of [${[...ROUTE_PURPOSES].join(', ')}] (got ${JSON.stringify(r.purpose)})`);
            }
        });
    }

    // Optional fields — type-check when present
    if (m.sharedCredentialHint !== undefined && typeof m.sharedCredentialHint !== 'string') {
        errors.push('sharedCredentialHint, when present, must be a string (e.g. "powerbi-aad-sp")');
    }
    if (m.envPrefix !== undefined && typeof m.envPrefix !== 'string') {
        errors.push('envPrefix, when present, must be a string (PROXY_PROFILE_<NAME>_<envPrefix>...)');
    }

    return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validate every manifest in an array, returning an aggregated report.
 * Used by the boot-time registry scan.
 */
function validateManifests(manifests) {
    const seen = new Set();
    const report = manifests.map((m, i) => {
        const r = validateManifest(m);
        const id = m && typeof m.id === 'string' ? m.id : `<index ${i}>`;
        if (m && typeof m.id === 'string') {
            if (seen.has(m.id)) {
                return { id, ok: false, errors: [...(r.errors || []), `duplicate id "${m.id}" — manifest ids must be unique`] };
            }
            seen.add(m.id);
        }
        return { id, ok: r.ok, errors: r.errors || [] };
    });
    const allOk = report.every(r => r.ok);
    return { ok: allOk, report };
}

module.exports = {
    CATEGORIES,
    MATURITY,
    FIELD_KINDS,
    ROUTE_PURPOSES,
    validateManifest,
    validateManifests,
};
