'use strict';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const PROBES = [
    {
        key: 'genie',
        path: '/api/2.0/genie/spaces',
        countKeys: ['spaces'],
    },
    {
        key: 'lakeview',
        path: '/api/2.0/lakeview/dashboards',
        countKeys: ['dashboards'],
    },
    {
        key: 'servingEndpoints',
        path: '/api/2.0/serving-endpoints',
        countKeys: ['endpoints'],
    },
    {
        key: 'apps',
        path: '/api/2.0/apps',
        countKeys: ['apps'],
    },
    {
        key: 'vectorSearch',
        path: '/api/2.0/vector-search/endpoints',
        countKeys: ['endpoints', 'vector_search_endpoints'],
    },
    {
        key: 'jobs',
        path: '/api/2.1/jobs/list',
        countKeys: ['jobs'],
    },
];

function extractHttpStatus(err) {
    const message = String(err?.message || '');
    const match = message.match(/Databricks\s+(\d{3})\s*:/i);
    return match ? Number(match[1]) : null;
}

function statusFromError(err) {
    const httpStatus = extractHttpStatus(err);
    if (httpStatus === 404) return { status: 'absent', httpStatus };
    if (httpStatus === 401 || httpStatus === 403) return { status: 'forbidden', httpStatus };
    return { status: 'error', httpStatus };
}

function countPayloadItems(payload, countKeys) {
    if (!payload || typeof payload !== 'object') return 0;
    for (const key of countKeys || []) {
        const value = payload[key];
        if (Array.isArray(value)) return value.length;
        if (value && typeof value === 'object') return Object.keys(value).length;
    }
    if (Array.isArray(payload)) return payload.length;
    return 0;
}

function readinessFor(key, entry) {
    if (entry.status !== 'available') return false;
    if (key === 'jobs') return true;
    return Number(entry.count || 0) > 0;
}

function publicProfileKey(profile, profileName) {
    const host = String(profile?.host || '').replace(/\/+$/, '').toLowerCase();
    const spaceId = String(profile?.spaceId || profile?.genieSpaceId || '');
    const warehouseId = String(profile?.warehouseId || profile?.warehouse_id || '');
    return `${profileName || 'unknown'}|${host}|${spaceId}|${warehouseId}`;
}

function publicProfileSummary(profile, profileName) {
    return {
        name: profileName || 'unknown',
        host: profile?.host ? String(profile.host).replace(/\/+$/, '') : '',
        spaceId: profile?.spaceId || profile?.genieSpaceId || '',
        warehouseId: profile?.warehouseId || profile?.warehouse_id || '',
        type: profile?.type || 'genie',
    };
}

async function probeOne({ profile, probe, databricksRequest, requestId }) {
    try {
        const payload = await databricksRequest(profile, 'GET', probe.path, undefined, requestId);
        const count = countPayloadItems(payload, probe.countKeys);
        return {
            key: probe.key,
            path: probe.path,
            status: 'available',
            available: true,
            ready: readinessFor(probe.key, { status: 'available', count }),
            httpStatus: 200,
            count,
        };
    } catch (err) {
        const normalized = statusFromError(err);
        return {
            key: probe.key,
            path: probe.path,
            status: normalized.status,
            available: false,
            ready: false,
            httpStatus: normalized.httpStatus,
            count: 0,
            error: normalized.status === 'error'
                ? String(err?.message || err).slice(0, 240)
                : undefined,
        };
    }
}

function snapshotFromEntries({ entries, profile, profileName, ttlMs, now }) {
    const details = {};
    const capabilities = {};
    const counts = {};
    for (const entry of entries) {
        details[entry.key] = entry;
        capabilities[entry.key] = Boolean(entry.ready);
        counts[entry.key] = Number(entry.count || 0);
    }

    return {
        ok: true,
        assistantProfile: profileName || 'default',
        spaceId: profile?.spaceId || profile?.genieSpaceId || '',
        profile: publicProfileSummary(profile, profileName),
        capabilities,
        details,
        counts,
        ttlMs,
        fetchedAt: new Date(now).toISOString(),
        cacheExpiresAt: new Date(now + ttlMs).toISOString(),
    };
}

function createDatabricksCapabilityRegistry(options = {}) {
    const ttlMs = Number.isFinite(options.ttlMs) ? Number(options.ttlMs) : DEFAULT_TTL_MS;
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    const probes = Array.isArray(options.probes) ? options.probes : PROBES;
    const cache = new Map();
    const inFlight = new Map();

    async function getCapabilities(args = {}) {
        const { profile, profileName, databricksRequest, requestId, forceRefresh } = args;
        if (!profile || typeof databricksRequest !== 'function') {
            const now = nowFn();
            return snapshotFromEntries({
                entries: probes.map(probe => ({
                    key: probe.key,
                    path: probe.path,
                    status: 'error',
                    available: false,
                    ready: false,
                    httpStatus: null,
                    count: 0,
                    error: !profile ? 'No profile resolved.' : 'databricksRequest function not supplied.',
                })),
                profile,
                profileName,
                ttlMs,
                now,
            });
        }

        const key = publicProfileKey(profile, profileName);
        const now = nowFn();
        const cached = cache.get(key);
        if (!forceRefresh && cached && cached.expiresAt > now) {
            return { ...cached.snapshot, cached: true };
        }
        if (!forceRefresh && inFlight.has(key)) {
            const snapshot = await inFlight.get(key);
            return { ...snapshot, cached: false };
        }

        const promise = (async () => {
            const probeArgs = probes.map(probe => probeOne({ profile, probe, databricksRequest, requestId }));
            const entries = await Promise.all(probeArgs);
            const completedAt = nowFn();
            const snapshot = snapshotFromEntries({ entries, profile, profileName, ttlMs, now: completedAt });
            cache.set(key, { snapshot, expiresAt: completedAt + ttlMs });
            return snapshot;
        })();

        inFlight.set(key, promise);
        try {
            const snapshot = await promise;
            return { ...snapshot, cached: false };
        } finally {
            inFlight.delete(key);
        }
    }

    function reset() {
        cache.clear();
        inFlight.clear();
    }

    return { getCapabilities, reset, _cache: cache };
}

const defaultRegistry = createDatabricksCapabilityRegistry();

module.exports = {
    DEFAULT_TTL_MS,
    PROBES,
    createDatabricksCapabilityRegistry,
    extractHttpStatus,
    statusFromError,
    countPayloadItems,
    getCapabilities: defaultRegistry.getCapabilities,
    reset: defaultRegistry.reset,
};
