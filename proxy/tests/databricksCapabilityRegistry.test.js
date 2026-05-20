'use strict';

const {
    createDatabricksCapabilityRegistry,
    extractHttpStatus,
    statusFromError,
} = require('../lib/databricksCapabilityRegistry');

const PROFILE = {
    host: 'https://workspace.azuredatabricks.net',
    token: 'dapi-test',
    spaceId: 'space-1',
    warehouseId: 'wh-1',
};

function makeRequest(responses) {
    return jest.fn(async (_profile, _method, path) => {
        const value = responses[path];
        if (value instanceof Error) throw value;
        if (typeof value === 'function') return value(path);
        if (value === undefined) throw new Error(`Databricks 404: ${path}`);
        return value;
    });
}

describe('databricksCapabilityRegistry — normalization', () => {
    it('extracts HTTP status from Databricks request errors', () => {
        expect(extractHttpStatus(new Error('Databricks 404: missing'))).toBe(404);
        expect(extractHttpStatus(new Error('Databricks 403: forbidden'))).toBe(403);
        expect(extractHttpStatus(new Error('fetch failed'))).toBeNull();
    });

    it('maps 404 to absent and 403 to forbidden', () => {
        expect(statusFromError(new Error('Databricks 404: missing')).status).toBe('absent');
        expect(statusFromError(new Error('Databricks 403: forbidden')).status).toBe('forbidden');
        expect(statusFromError(new Error('socket hang up')).status).toBe('error');
    });

    it('normalizes available, absent, forbidden, and empty-vector-search states', async () => {
        const request = makeRequest({
            '/api/2.0/genie/spaces': { spaces: [{ space_id: 's1' }] },
            '/api/2.0/lakeview/dashboards': new Error('Databricks 404: no route'),
            '/api/2.0/serving-endpoints': new Error('Databricks 403: denied'),
            '/api/2.0/apps': { apps: [{ name: 'pulseplay' }] },
            '/api/2.0/vector-search/endpoints': {},
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ ttlMs: 300000, now: () => Date.UTC(2026, 4, 17) });

        const snapshot = await registry.getCapabilities({
            profile: PROFILE,
            profileName: 'default',
            databricksRequest: request,
        });

        expect(snapshot.capabilities.genie).toBe(true);
        expect(snapshot.details.genie.status).toBe('available');
        expect(snapshot.details.genie.count).toBe(1);

        expect(snapshot.capabilities.lakeview).toBe(false);
        expect(snapshot.details.lakeview.status).toBe('absent');

        expect(snapshot.capabilities.servingEndpoints).toBe(false);
        expect(snapshot.details.servingEndpoints.status).toBe('forbidden');

        expect(snapshot.capabilities.apps).toBe(true);
        expect(snapshot.capabilities.jobs).toBe(true);

        expect(snapshot.details.vectorSearch.status).toBe('available');
        expect(snapshot.details.vectorSearch.count).toBe(0);
        expect(snapshot.capabilities.vectorSearch).toBe(false);
    });
});

describe('databricksCapabilityRegistry — cache', () => {
    it('caches per profile until TTL expires', async () => {
        let now = 1000;
        const request = makeRequest({
            '/api/2.0/genie/spaces': { spaces: [{ space_id: 's1' }] },
            '/api/2.0/lakeview/dashboards': { dashboards: [] },
            '/api/2.0/serving-endpoints': { endpoints: [] },
            '/api/2.0/apps': { apps: [] },
            '/api/2.0/vector-search/endpoints': { endpoints: [] },
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ ttlMs: 5000, now: () => now });

        const first = await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        const second = await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(first.cached).toBe(false);
        expect(second.cached).toBe(true);
        expect(request).toHaveBeenCalledTimes(6);

        now = 7001;
        const third = await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(third.cached).toBe(false);
        expect(request).toHaveBeenCalledTimes(12);
    });

    it('scopes cache entries by profile identity', async () => {
        const request = makeRequest({
            '/api/2.0/genie/spaces': { spaces: [{ space_id: 's1' }] },
            '/api/2.0/lakeview/dashboards': { dashboards: [] },
            '/api/2.0/serving-endpoints': { endpoints: [] },
            '/api/2.0/apps': { apps: [] },
            '/api/2.0/vector-search/endpoints': { endpoints: [] },
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ ttlMs: 300000, now: () => 1000 });
        await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        await registry.getCapabilities({
            profile: { ...PROFILE, host: 'https://other.azuredatabricks.net' },
            profileName: 'analytics',
            databricksRequest: request,
        });
        expect(request).toHaveBeenCalledTimes(12);
    });

    it('forceRefresh bypasses a valid cache entry', async () => {
        const request = makeRequest({
            '/api/2.0/genie/spaces': { spaces: [{ space_id: 's1' }] },
            '/api/2.0/lakeview/dashboards': { dashboards: [] },
            '/api/2.0/serving-endpoints': { endpoints: [] },
            '/api/2.0/apps': { apps: [] },
            '/api/2.0/vector-search/endpoints': { endpoints: [] },
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ ttlMs: 300000, now: () => 1000 });

        await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(request).toHaveBeenCalledTimes(6);

        // Cache hit (no forceRefresh) — same 6 calls.
        await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(request).toHaveBeenCalledTimes(6);

        // forceRefresh bypasses the cache and re-probes.
        const refreshed = await registry.getCapabilities({
            profile: PROFILE,
            profileName: 'default',
            databricksRequest: request,
            forceRefresh: true,
        });
        expect(refreshed.cached).toBe(false);
        expect(request).toHaveBeenCalledTimes(12);
    });

    it('reset() clears the cache so the next call re-probes', async () => {
        const request = makeRequest({
            '/api/2.0/genie/spaces': { spaces: [{ space_id: 's1' }] },
            '/api/2.0/lakeview/dashboards': { dashboards: [] },
            '/api/2.0/serving-endpoints': { endpoints: [] },
            '/api/2.0/apps': { apps: [] },
            '/api/2.0/vector-search/endpoints': { endpoints: [] },
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ ttlMs: 300000, now: () => 1000 });
        await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        registry.reset();
        const after = await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(after.cached).toBe(false);
        expect(request).toHaveBeenCalledTimes(12);
    });
});

describe('databricksCapabilityRegistry — single-flight (concurrency)', () => {
    it('coalesces concurrent calls for the same profile into one probe burst', async () => {
        let resolveAll;
        const gate = new Promise(resolve => { resolveAll = resolve; });
        const calls = [];
        const request = jest.fn(async (_profile, _method, path) => {
            calls.push(path);
            await gate;
            return { spaces: [{ space_id: 's1' }] };
        });
        const registry = createDatabricksCapabilityRegistry({ ttlMs: 300000, now: () => 1000 });

        // Fire 5 concurrent requests for the same profile.
        const promises = Array.from({ length: 5 }, () => registry.getCapabilities({
            profile: PROFILE,
            profileName: 'default',
            databricksRequest: request,
        }));
        // Tick so each promise reaches its await on `gate`.
        await new Promise(r => setImmediate(r));
        resolveAll();
        const results = await Promise.all(promises);

        // 6 probes — fired exactly once, not 5 × 6 = 30.
        expect(calls).toHaveLength(6);
        for (const result of results) {
            expect(result.capabilities.genie).toBe(true);
        }
        // First caller marked cached:false; followers can be true OR false
        // depending on whether the cache write landed first — both are
        // honest, so we only lock the burst count.
    });

    it('forceRefresh does NOT join an in-flight probe; it kicks a new probe burst', async () => {
        let resolveFirst;
        const firstGate = new Promise(resolve => { resolveFirst = resolve; });
        let phase = 0;
        const request = jest.fn(async () => {
            const isFirst = phase === 0;
            if (isFirst) await firstGate;
            return { spaces: [{ space_id: 's1' }] };
        });
        const registry = createDatabricksCapabilityRegistry({ ttlMs: 300000, now: () => 1000 });

        const first = registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        await new Promise(r => setImmediate(r));
        expect(request).toHaveBeenCalledTimes(6);

        phase = 1;
        const second = registry.getCapabilities({
            profile: PROFILE,
            profileName: 'default',
            databricksRequest: request,
            forceRefresh: true,
        });
        // forceRefresh must NOT wait for the in-flight call — it should
        // have already issued its own 6 probes.
        await new Promise(r => setImmediate(r));
        expect(request).toHaveBeenCalledTimes(12);

        resolveFirst();
        await Promise.all([first, second]);
    });
});

describe('databricksCapabilityRegistry — degraded inputs', () => {
    it('returns an all-error snapshot when profile is missing', async () => {
        const registry = createDatabricksCapabilityRegistry({ now: () => 1000 });
        const snap = await registry.getCapabilities({
            profile: null,
            profileName: 'default',
            databricksRequest: jest.fn(),
        });
        expect(snap.ok).toBe(true);
        for (const probe of Object.values(snap.details)) {
            expect(probe.status).toBe('error');
            expect(probe.error).toMatch(/No profile resolved/);
        }
        // Capabilities map keys exist but all false.
        expect(Object.values(snap.capabilities).every(v => v === false)).toBe(true);
    });

    it('returns an all-error snapshot when databricksRequest is missing', async () => {
        const registry = createDatabricksCapabilityRegistry({ now: () => 1000 });
        const snap = await registry.getCapabilities({
            profile: PROFILE,
            profileName: 'default',
        });
        for (const probe of Object.values(snap.details)) {
            expect(probe.error).toMatch(/databricksRequest function not supplied/);
        }
    });
});

describe('databricksCapabilityRegistry — readiness semantics', () => {
    it('jobs probe is ready=true even when count=0 (admin endpoint existence is the signal)', async () => {
        const request = makeRequest({
            '/api/2.0/genie/spaces': { spaces: [] },
            '/api/2.0/lakeview/dashboards': { dashboards: [] },
            '/api/2.0/serving-endpoints': { endpoints: [] },
            '/api/2.0/apps': { apps: [] },
            '/api/2.0/vector-search/endpoints': { endpoints: [] },
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ now: () => 1000 });
        const snap = await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(snap.details.jobs.status).toBe('available');
        expect(snap.details.jobs.count).toBe(0);
        expect(snap.capabilities.jobs).toBe(true);
        // Non-jobs probes need count > 0.
        expect(snap.capabilities.genie).toBe(false);
        expect(snap.capabilities.lakeview).toBe(false);
    });

    it('vector-search count picks up the alternate vector_search_endpoints key', async () => {
        const request = makeRequest({
            '/api/2.0/genie/spaces': { spaces: [] },
            '/api/2.0/lakeview/dashboards': { dashboards: [] },
            '/api/2.0/serving-endpoints': { endpoints: [] },
            '/api/2.0/apps': { apps: [] },
            '/api/2.0/vector-search/endpoints': { vector_search_endpoints: [{ name: 'a' }, { name: 'b' }] },
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ now: () => 1000 });
        const snap = await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(snap.details.vectorSearch.count).toBe(2);
        expect(snap.capabilities.vectorSearch).toBe(true);
    });

    it('500-class probe errors record the error message (trimmed) without leaking stack', async () => {
        const longMsg = 'Internal failure: '.padEnd(400, 'x');
        const request = makeRequest({
            '/api/2.0/genie/spaces': new Error(longMsg),
            '/api/2.0/lakeview/dashboards': { dashboards: [] },
            '/api/2.0/serving-endpoints': { endpoints: [] },
            '/api/2.0/apps': { apps: [] },
            '/api/2.0/vector-search/endpoints': { endpoints: [] },
            '/api/2.1/jobs/list': { jobs: [] },
        });
        const registry = createDatabricksCapabilityRegistry({ now: () => 1000 });
        const snap = await registry.getCapabilities({ profile: PROFILE, profileName: 'default', databricksRequest: request });
        expect(snap.details.genie.status).toBe('error');
        // Bound to 240 chars per the registry contract.
        expect(snap.details.genie.error.length).toBeLessThanOrEqual(240);
        expect(snap.details.genie.error).toMatch(/^Internal failure:/);
    });
});
