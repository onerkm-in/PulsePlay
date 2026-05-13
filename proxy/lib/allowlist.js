// @ts-check
'use strict';

/**
 * Organization allowlist helpers.
 *
 * The proxy treats allowlists as an enterprise deployment contract: production
 * must provide one, while local/test environments can run without one for
 * developer convenience. Once an allowlist is configured, every helper below
 * enforces it consistently.
 */

const VALID_ENFORCEMENT = new Set(['strict', 'warn']);

const EMPTY_ALLOWLIST = Object.freeze({
    biProviders: [],
    embedOrigins: {},
    powerbiWorkspaces: [],
    powerbiReports: [],
    aadTenants: [],
    aiProfiles: { default: [], byGroup: {} },
    genieSpaces: [],
    supervisorProfiles: [],
    packs: [],
    knowledgeSources: [],
    license: {},
});

function asArray(value) {
    if (Array.isArray(value)) {
        return value.map(v => String(v || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function lowerList(value) {
    return Array.from(new Set(asArray(value).map(v => v.toLowerCase())));
}

function identityList(value) {
    return Array.from(new Set(asArray(value)));
}

function normalizeOrigin(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
        return parsed.hostname.toLowerCase();
    } catch {
        return raw
            .replace(/^https?:\/\//i, '')
            .split('/')[0]
            .split(':')[0]
            .trim()
            .toLowerCase();
    }
}

function normalizeEmbedOrigins(value) {
    const out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    for (const [vendor, origins] of Object.entries(value)) {
        const normalized = lowerList(origins).map(normalizeOrigin).filter(Boolean);
        if (normalized.length > 0) out[String(vendor).toLowerCase()] = Array.from(new Set(normalized));
    }
    return out;
}

function normalizeAiProfiles(value) {
    if (Array.isArray(value) || typeof value === 'string') {
        return { default: identityList(value), byGroup: {} };
    }
    if (!value || typeof value !== 'object') return { default: [], byGroup: {} };
    const byGroup = {};
    const rawByGroup = value.byGroup && typeof value.byGroup === 'object' && !Array.isArray(value.byGroup)
        ? value.byGroup
        : {};
    for (const [group, names] of Object.entries(rawByGroup)) {
        byGroup[String(group)] = identityList(names);
    }
    return {
        default: identityList(value.default),
        byGroup,
    };
}

function userGroups(req) {
    const user = req && req.user;
    const groups = [];
    for (const key of ['groups', 'roles']) {
        const raw = user && user[key];
        if (Array.isArray(raw)) groups.push(...raw.map(String));
        else if (typeof raw === 'string') groups.push(...raw.split(/[,\s]+/).filter(Boolean));
    }
    return Array.from(new Set(groups));
}

function normalizeAllowlist(config, env = process.env) {
    const configured = !!(config && config.allowlist && typeof config.allowlist === 'object');
    const raw = configured ? config.allowlist : EMPTY_ALLOWLIST;
    const rawEnforcement = String(config?.allowlistEnforcement || 'strict').toLowerCase().trim();
    const enforcement = VALID_ENFORCEMENT.has(rawEnforcement) ? rawEnforcement : 'strict';
    const nodeEnv = String(env.NODE_ENV || '').toLowerCase();

    return {
        configured,
        active: configured,
        production: nodeEnv === 'production',
        enforcement,
        strict: enforcement === 'strict',
        biProviders: lowerList(raw.biProviders),
        embedOrigins: normalizeEmbedOrigins(raw.embedOrigins),
        powerbiWorkspaces: lowerList(raw.powerbiWorkspaces),
        powerbiReports: lowerList(raw.powerbiReports),
        aadTenants: lowerList(raw.aadTenants),
        aiProfiles: normalizeAiProfiles(raw.aiProfiles),
        genieSpaces: lowerList(raw.genieSpaces),
        supervisorProfiles: identityList(raw.supervisorProfiles),
        packs: identityList(raw.packs),
        knowledgeSources: identityList(raw.knowledgeSources),
        license: raw.license && typeof raw.license === 'object' ? raw.license : {},
    };
}

function startupAllowlistProblem(config, env = process.env) {
    const normalized = normalizeAllowlist(config, env);
    if (!normalized.production) return null;
    if (!normalized.configured) {
        return 'proxy/config.json allowlist is required in production. Refusing to start without an organization allowlist.';
    }
    if (normalized.enforcement !== 'strict') {
        return 'allowlistEnforcement must be "strict" in production.';
    }
    return null;
}

function visibleAiProfiles(normalized, req) {
    const profiles = new Set(normalized.aiProfiles.default);
    for (const group of userGroups(req)) {
        for (const name of normalized.aiProfiles.byGroup[group] || []) profiles.add(name);
    }
    for (const name of normalized.supervisorProfiles) profiles.add(name);
    return Array.from(profiles);
}

function decision(normalized, ok, kind, value, allowed) {
    if (!normalized.active) {
        return { ok: true, active: false, kind, value, allowed: allowed || [] };
    }
    if (ok || normalized.enforcement === 'warn') {
        return { ok: true, warn: !ok, active: true, kind, value, allowed: allowed || [] };
    }
    return { ok: false, active: true, kind, value, allowed: allowed || [] };
}

function isBiProviderAllowed(config, req, vendor) {
    const normalized = normalizeAllowlist(config);
    const value = String(vendor || '').toLowerCase();
    return decision(normalized, !!value && normalized.biProviders.includes(value), 'biProvider', value, normalized.biProviders);
}

function isEmbedOriginAllowed(config, req, vendor, urlOrOrigin) {
    const normalized = normalizeAllowlist(config);
    const key = String(vendor || '').toLowerCase();
    const allowed = normalized.embedOrigins[key] || [];
    const host = normalizeOrigin(urlOrOrigin);
    return decision(normalized, !!host && allowed.includes(host), 'embedOrigin', host, allowed);
}

function isAadTenantAllowed(config, req, tenantId) {
    const normalized = normalizeAllowlist(config);
    const value = String(tenantId || '').toLowerCase().trim();
    return decision(normalized, !!value && normalized.aadTenants.includes(value), 'aadTenant', value, normalized.aadTenants);
}

function isAiProfileAllowed(config, req, profileName) {
    const normalized = normalizeAllowlist(config);
    const allowed = visibleAiProfiles(normalized, req);
    const value = String(profileName || '').trim();
    return decision(normalized, !!value && allowed.includes(value), 'aiProfile', value, allowed);
}

function isGenieSpaceAllowed(config, req, spaceId) {
    const normalized = normalizeAllowlist(config);
    const value = String(spaceId || '').toLowerCase().trim();
    return decision(normalized, !!value && normalized.genieSpaces.includes(value), 'genieSpace', value, normalized.genieSpaces);
}

function isPowerBIWorkspaceAllowed(config, req, groupId) {
    const normalized = normalizeAllowlist(config);
    const value = String(groupId || '').toLowerCase().trim();
    return decision(normalized, !!value && normalized.powerbiWorkspaces.includes(value), 'powerbiWorkspace', value, normalized.powerbiWorkspaces);
}

function isPowerBIReportAllowed(config, req, reportId) {
    const normalized = normalizeAllowlist(config);
    const allowed = normalized.powerbiReports;
    const value = String(reportId || '').toLowerCase().trim();
    const ok = allowed.length === 0 ? !!value : allowed.includes(value);
    return decision(normalized, ok, 'powerbiReport', value, allowed);
}

function isPackAllowed(config, req, packName) {
    const normalized = normalizeAllowlist(config);
    const allowed = normalized.packs;
    const value = String(packName || '').trim();
    return decision(normalized, !!value && allowed.includes(value), 'pack', value, allowed);
}

function buildVisibleAllowlist(config, req) {
    const normalized = normalizeAllowlist(config);
    return {
        configured: normalized.configured,
        biProviders: normalized.biProviders,
        embedOrigins: normalized.embedOrigins,
        aadTenants: normalized.aadTenants,
        aiProfiles: visibleAiProfiles(normalized, req),
        packs: normalized.packs,
        knowledgeSources: normalized.knowledgeSources,
        powerbiWorkspaces: normalized.powerbiWorkspaces,
        powerbiReports: normalized.powerbiReports,
        genieSpaces: normalized.genieSpaces,
        // License posture is org-visible (read-only). Includes the
        // Fabric capability flag MVP 0.2 deployments pin to `false`.
        license: normalized.license,
        enforcement: normalized.enforcement,
    };
}

module.exports = {
    normalizeAllowlist,
    startupAllowlistProblem,
    buildVisibleAllowlist,
    isBiProviderAllowed,
    isEmbedOriginAllowed,
    isAadTenantAllowed,
    isAiProfileAllowed,
    isGenieSpaceAllowed,
    isPowerBIWorkspaceAllowed,
    isPowerBIReportAllowed,
    isPackAllowed,
    normalizeOrigin,
};
