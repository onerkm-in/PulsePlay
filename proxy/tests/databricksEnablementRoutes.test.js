'use strict';

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';
process.env.PROXY_PROFILE_DBX_HOST = 'https://example.databricks.com';
process.env.PROXY_PROFILE_DBX_AUTH_MODE = 'oauth-m2m';
process.env.PROXY_PROFILE_DBX_CATALOG = 'main';
process.env.PROXY_PROFILE_DBX_SCHEMA = 'default';
process.env.PROXY_PROFILE_DBX_VECTOR_SEARCH_INDEX = 'main.default.kb_index';
process.env.PROXY_PROFILE_DBX_CLIENT_ID = 'sp-client';
process.env.PROXY_PROFILE_DBX_CLIENT_SECRET = 'sp-secret';

const request = require('supertest');
const {
    app,
    _setAibiFetchImplForTests,
} = require('../server');

const originalFetch = global.fetch;
const originalRequest = require('https').request;

afterEach(() => {
    _setAibiFetchImplForTests(null);
    global.fetch = originalFetch;
    require('https').request = originalRequest;
    jest.restoreAllMocks();
});

function responseFor(path) {
    if (path === '/api/2.0/lakeview/dashboards') {
        return { dashboards: [{ dashboard_id: 'dash-1', display_name: 'Revenue Dashboard', lifecycle_state: 'ACTIVE' }] };
    }
    if (path === '/api/2.0/genie/spaces') {
        return { spaces: [{ space_id: 'space-1', title: 'Sales Genie', description: 'Sales room' }] };
    }
    if (path === '/api/2.0/serving-endpoints') {
        return { endpoints: [{ name: 'agent-endpoint', state: { ready: 'READY' } }] };
    }
    if (path === '/api/2.0/apps') {
        return { apps: [{ name: 'pulseplay-app', id: 'app-1' }] };
    }
    if (path === '/api/2.0/sql/warehouses') {
        return { warehouses: [{ id: 'wh-1', name: 'Warehouse', state: 'RUNNING' }] };
    }
    if (path.startsWith('/api/2.1/unity-catalog/tables?')) {
        return {
            tables: [
                { name: 'metric_sales', full_name: 'main.default.metric_sales', table_type: 'METRIC_VIEW' },
                { name: 'orders', full_name: 'main.default.orders', table_type: 'MANAGED' },
            ],
        };
    }
    if (path.startsWith('/api/2.1/unity-catalog/tables/main.default.metric_sales')) {
        return { name: 'metric_sales', full_name: 'main.default.metric_sales', table_type: 'METRIC_VIEW' };
    }
    if (path === '/api/2.0/vector-search/indexes/main.default.kb_index/query') {
        return { result: { data_array: [['doc-1', 'hello']] } };
    }
    return { ok: true };
}

function installDatabricksRequestMock() {
    global.fetch = jest.fn(async (url) => {
        if (String(url).endsWith('/oidc/v1/token')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ access_token: 'dbx-route-token', expires_in: 3600 }),
                text: async () => '',
            };
        }
        const parsed = new URL(String(url));
        const body = responseFor(`${parsed.pathname}${parsed.search}`);
        return {
            ok: true,
            status: 200,
            json: async () => body,
            text: async () => JSON.stringify(body),
        };
    });
    require('https').request = jest.fn((options, cb) => {
        const body = JSON.stringify(responseFor(options.path));
        const resp = {
            statusCode: 200,
            on(event, handler) {
                if (event === 'data') handler(Buffer.from(body));
                if (event === 'end') handler();
            },
        };
        cb(resp);
        return {
            on: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            setTimeout: jest.fn(),
        };
    });
}

describe('Databricks enablement routes', () => {
    test('launchpad list routes normalize Databricks assets', async () => {
        installDatabricksRequestMock();
        const res = await request(app).get('/assistant/lakeview/dashboards?assistantProfile=dbx');
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(1);
        expect(res.body.items[0]).toMatchObject({
            kind: 'lakeview-dashboard',
            id: 'dash-1',
            title: 'Revenue Dashboard',
        });
        expect(res.body.items[0].embedUrl).toContain('/embed/dashboardsv3/dash-1');
    });

    test('metric views list filters UC tables down to METRIC_VIEW', async () => {
        installDatabricksRequestMock();
        const res = await request(app).get('/assistant/uc/metric-views?assistantProfile=dbx&catalog=main&schema=default');
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(1);
        expect(res.body.items[0].fullName).toBe('main.default.metric_sales');
    });

    test('vector search route passes query through the proxy with configured index fallback', async () => {
        installDatabricksRequestMock();
        const res = await request(app)
            .post('/assistant/vector-search/query')
            .send({ assistantProfile: 'dbx', queryText: 'refund policy', numResults: 3 });
        expect(res.status).toBe(200);
        expect(res.body.indexName).toBe('main.default.kb_index');
        expect(res.body.result.result.data_array[0][0]).toBe('doc-1');
    });

    test('Databricks AI/BI token route performs OAuth/tokeninfo/scoped-token exchange', async () => {
        const calls = [];
        _setAibiFetchImplForTests(async (url, init) => {
            calls.push({ url: String(url), init });
            if (String(url).endsWith('/oidc/v1/token') && calls.length === 1) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'broad-token', expires_in: 3600 }) };
            }
            if (String(url).includes('/published/tokeninfo')) {
                return { ok: true, status: 200, text: async () => JSON.stringify({ authorization_details: [{ type: 'aibi' }], scope: 'dashboards' }) };
            }
            return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'scoped-token', expires_in: 3600 }) };
        });
        const res = await request(app)
            .post('/assistant/embed-token/databricks-aibi')
            .send({
                assistantProfile: 'dbx',
                dashboardId: 'dash-1',
                workspaceId: '12345',
                externalViewerId: 'viewer-1',
                externalValue: 'west',
            });
        expect(res.status).toBe(200);
        expect(res.body.embedToken).toBe('scoped-token');
        expect(calls[1].url).toContain('/api/2.0/lakeview/dashboards/dash-1/published/tokeninfo');
    });
});
