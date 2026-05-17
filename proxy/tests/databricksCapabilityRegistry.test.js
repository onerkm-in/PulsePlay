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
});
