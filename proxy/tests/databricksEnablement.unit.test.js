'use strict';

// Unit-level coverage for proxy/lib/databricksEnablement.js.
//
// The route-level tests in databricksEnablementRoutes.test.js only cover
// happy paths through the Express endpoints. This file walks the
// normalizers directly so we lock the alternate-key paths (snake_case vs
// camelCase, embed_url vs embedUrl vs url, etc.) — the kind of payload
// drift that Databricks REST endpoints actually exhibit between
// workspace versions.
//
// Vendor-agnostic lens: these normalizers feed the same plugin contract
// that powers Power BI / Tableau / Qlik discovery. The shape they emit
// is the contract; per-vendor REST quirks live below this line.

const {
    arrayFromPayload,
    buildLaunchpadPayload,
    buildWorkspaceUrl,
    firstString,
    isMetricView,
    normalizeDatabricksApp,
    normalizeGenieSpace,
    normalizeLakeviewDashboard,
    normalizeMetricView,
    normalizeServingEndpoint,
    normalizeSqlWarehouse,
    sanitizeVectorSearchQuery,
    trimSlash,
} = require('../lib/databricksEnablement');

describe('databricksEnablement — primitives', () => {
    describe('trimSlash', () => {
        it('strips a single trailing slash', () => {
            expect(trimSlash('https://x.databricks.net/')).toBe('https://x.databricks.net');
        });
        it('strips many trailing slashes', () => {
            expect(trimSlash('https://x.databricks.net////')).toBe('https://x.databricks.net');
        });
        it('returns empty string for null / undefined / empty', () => {
            expect(trimSlash(null)).toBe('');
            expect(trimSlash(undefined)).toBe('');
            expect(trimSlash('')).toBe('');
        });
        it('coerces non-strings to string before trimming', () => {
            expect(trimSlash(123)).toBe('123');
        });
    });

    describe('firstString', () => {
        it('returns the first non-empty string after trimming', () => {
            expect(firstString('', '  ', 'hit', 'second')).toBe('hit');
        });
        it('accepts finite numbers as fallbacks', () => {
            expect(firstString(undefined, 42)).toBe('42');
        });
        it('skips NaN and Infinity', () => {
            expect(firstString(NaN, Infinity, 'ok')).toBe('ok');
        });
        it('returns empty string when nothing matches', () => {
            expect(firstString(null, undefined, '', '   ', NaN)).toBe('');
        });
    });

    describe('buildWorkspaceUrl', () => {
        it('prepends a slash when the path is missing one', () => {
            expect(buildWorkspaceUrl('https://x.databricks.net', 'dashboards/1')).toBe('https://x.databricks.net/dashboards/1');
        });
        it('honors a path that already starts with a slash', () => {
            expect(buildWorkspaceUrl('https://x.databricks.net/', '/dashboards/1')).toBe('https://x.databricks.net/dashboards/1');
        });
        it('returns empty string when host is empty', () => {
            expect(buildWorkspaceUrl('', '/any')).toBe('');
        });
    });

    describe('arrayFromPayload', () => {
        it('returns the payload itself when it is already an array', () => {
            expect(arrayFromPayload([1, 2, 3])).toEqual([1, 2, 3]);
        });
        it('picks the first matching key', () => {
            expect(arrayFromPayload({ dashboards: [{ id: 'a' }] }, ['dashboards', 'items'])).toEqual([{ id: 'a' }]);
        });
        it('falls through to later keys', () => {
            expect(arrayFromPayload({ items: [{ id: 'a' }] }, ['dashboards', 'items'])).toEqual([{ id: 'a' }]);
        });
        it('returns [] when no key matches or input is non-object', () => {
            expect(arrayFromPayload(null)).toEqual([]);
            expect(arrayFromPayload('foo')).toEqual([]);
            expect(arrayFromPayload({ nothing: 1 }, ['dashboards'])).toEqual([]);
        });
    });
});

describe('databricksEnablement — normalizers (alternate REST key shapes)', () => {
    const HOST = 'https://x.databricks.net/';

    describe('normalizeLakeviewDashboard', () => {
        it('reads snake_case (dashboard_id, display_name, update_time)', () => {
            const out = normalizeLakeviewDashboard({
                dashboard_id: 'd-1',
                display_name: 'Sales',
                lifecycle_state: 'ACTIVE',
                update_time: '2026-01-01',
            }, HOST);
            expect(out).toMatchObject({
                kind: 'lakeview-dashboard',
                id: 'd-1',
                title: 'Sales',
                lifecycleState: 'ACTIVE',
                updatedAt: '2026-01-01',
                workspaceUrl: 'https://x.databricks.net',
                openUrl: 'https://x.databricks.net/dashboards/d-1',
                embedUrl: 'https://x.databricks.net/embed/dashboardsv3/d-1',
            });
        });
        it('reads camelCase aliases (dashboardId, lifecycleState)', () => {
            const out = normalizeLakeviewDashboard({
                dashboardId: 'd-2',
                name: 'Camel',
                lifecycleState: 'ARCHIVED',
            }, HOST);
            expect(out.id).toBe('d-2');
            expect(out.title).toBe('Camel');
            expect(out.lifecycleState).toBe('ARCHIVED');
        });
        it('uses the last path segment as title when no name fields exist', () => {
            const out = normalizeLakeviewDashboard({ id: 'd-3', path: '/Workspace/Team/Reports/Q1' }, HOST);
            expect(out.title).toBe('Q1');
        });
        it('falls back to "(untitled dashboard)" when nothing else is available', () => {
            const out = normalizeLakeviewDashboard({}, HOST);
            expect(out.title).toBe('(untitled dashboard)');
            expect(out.openUrl).toBe('');
            expect(out.embedUrl).toBe('');
        });
        it('URI-encodes the dashboard id in the URLs', () => {
            const out = normalizeLakeviewDashboard({ dashboard_id: 'a b/c' }, HOST);
            expect(out.openUrl).toBe('https://x.databricks.net/dashboards/a%20b%2Fc');
            expect(out.embedUrl).toBe('https://x.databricks.net/embed/dashboardsv3/a%20b%2Fc');
        });
    });

    describe('normalizeGenieSpace', () => {
        it('reads space_id + description fallback for title', () => {
            const out = normalizeGenieSpace({ space_id: 'sp-1', description: 'Helpful space' }, HOST);
            expect(out.id).toBe('sp-1');
            expect(out.title).toBe('Helpful space');
            expect(out.openUrl).toBe('https://x.databricks.net/genie/rooms/sp-1');
        });
        it('passes through pre-baked embed_url', () => {
            const out = normalizeGenieSpace({ space_id: 'sp-2', embed_url: 'https://anywhere/embed/x' }, HOST);
            expect(out.embedUrl).toBe('https://anywhere/embed/x');
        });
        it('accepts url as a final embed fallback', () => {
            const out = normalizeGenieSpace({ space_id: 'sp-3', url: 'https://anywhere/url' }, HOST);
            expect(out.embedUrl).toBe('https://anywhere/url');
        });
        it('falls back to "(untitled Genie Space)" with empty URLs', () => {
            const out = normalizeGenieSpace({}, HOST);
            expect(out.title).toBe('(untitled Genie Space)');
            expect(out.openUrl).toBe('');
        });
    });

    describe('normalizeServingEndpoint', () => {
        it('reads name + state.ready', () => {
            const out = normalizeServingEndpoint({ name: 'ep-1', state: { ready: 'READY' } }, HOST);
            expect(out.id).toBe('ep-1');
            expect(out.state).toBe('READY');
            expect(out.openUrl).toBe('https://x.databricks.net/ml/endpoints/ep-1');
        });
        it('accepts endpoint_name alias and config_update fallback', () => {
            const out = normalizeServingEndpoint({ endpoint_name: 'ep-2', config_update: { config_update: 'IN_PROGRESS' } }, HOST);
            expect(out.id).toBe('ep-2');
            expect(out.state).toBe('IN_PROGRESS');
        });
        it('handles missing name with placeholder title', () => {
            const out = normalizeServingEndpoint({}, HOST);
            expect(out.title).toBe('(unnamed endpoint)');
            expect(out.openUrl).toBe('');
        });
    });

    describe('normalizeDatabricksApp', () => {
        it('reads name + state', () => {
            const out = normalizeDatabricksApp({ name: 'pp', state: 'RUNNING' }, HOST);
            expect(out.id).toBe('pp');
            expect(out.openUrl).toBe('https://x.databricks.net/apps/pp');
        });
        it('honors an explicit url over the workspace-built fallback', () => {
            const out = normalizeDatabricksApp({ name: 'pp', url: 'https://custom/app' }, HOST);
            expect(out.openUrl).toBe('https://custom/app');
        });
        it('uses status as a state alias', () => {
            const out = normalizeDatabricksApp({ name: 'pp', status: 'STARTING' }, HOST);
            expect(out.state).toBe('STARTING');
        });
        it('placeholder title when name fields are absent', () => {
            const out = normalizeDatabricksApp({}, HOST);
            expect(out.title).toBe('(unnamed app)');
        });
    });

    describe('normalizeSqlWarehouse', () => {
        it('reads warehouse_id alias and cluster_size', () => {
            const out = normalizeSqlWarehouse({ warehouse_id: 'wh-1', name: 'Main', cluster_size: 'Small' }, HOST);
            expect(out.id).toBe('wh-1');
            expect(out.title).toBe('Main');
            expect(out.size).toBe('Small');
            expect(out.openUrl).toBe('https://x.databricks.net/sql/warehouses/wh-1');
        });
        it('placeholder title when nothing matches', () => {
            const out = normalizeSqlWarehouse({}, HOST);
            expect(out.title).toBe('(unnamed warehouse)');
            expect(out.openUrl).toBe('');
        });
    });

    describe('normalizeMetricView', () => {
        it('builds fullName from catalog.schema.name when full_name is absent', () => {
            const out = normalizeMetricView({
                catalog_name: 'main',
                schema_name: 'sales',
                name: 'revenue_view',
                table_type: 'METRIC_VIEW',
            });
            expect(out.fullName).toBe('main.sales.revenue_view');
            expect(out.id).toBe('main.sales.revenue_view');
            expect(out.title).toBe('revenue_view');
        });
        it('prefers explicit full_name over the constructed one', () => {
            const out = normalizeMetricView({
                catalog_name: 'ignored',
                schema_name: 'ignored',
                name: 'view',
                full_name: 'real.path.view',
            });
            expect(out.fullName).toBe('real.path.view');
        });
        it('honors camelCase aliases', () => {
            const out = normalizeMetricView({ catalogName: 'c', schemaName: 's', tableName: 't' });
            expect(out.fullName).toBe('c.s.t');
            expect(out.title).toBe('t');
        });
        it('placeholder title when nothing matches', () => {
            const out = normalizeMetricView({});
            expect(out.title).toBe('(unnamed metric view)');
        });
    });

    describe('isMetricView', () => {
        it('matches METRIC_VIEW exactly (snake_case)', () => {
            expect(isMetricView({ table_type: 'METRIC_VIEW' })).toBe(true);
        });
        it('matches metric_view case-insensitively', () => {
            expect(isMetricView({ table_type: 'metric_view' })).toBe(true);
            expect(isMetricView({ tableType: 'Metric_View' })).toBe(true);
        });
        it('rejects TABLE / VIEW / other types', () => {
            expect(isMetricView({ table_type: 'TABLE' })).toBe(false);
            expect(isMetricView({ table_type: 'VIEW' })).toBe(false);
            expect(isMetricView({})).toBe(false);
            expect(isMetricView(null)).toBe(false);
        });
    });
});

describe('databricksEnablement — buildLaunchpadPayload', () => {
    it('returns ok envelope with items + count + ISO fetchedAt', () => {
        const out = buildLaunchpadPayload({
            items: [{ id: 'a' }, { id: 'b' }],
            sourcePath: '/api/2.0/lakeview/dashboards',
            profileName: 'analytics',
            host: 'https://x.databricks.net/',
            raw: { dashboards: 'truncated' },
        });
        expect(out.ok).toBe(true);
        expect(out.assistantProfile).toBe('analytics');
        expect(out.workspaceUrl).toBe('https://x.databricks.net');
        expect(out.count).toBe(2);
        expect(out.items).toHaveLength(2);
        expect(typeof out.fetchedAt).toBe('string');
        expect(() => new Date(out.fetchedAt).toISOString()).not.toThrow();
    });

    it('defaults profileName to "default" and count to 0 when items is not an array', () => {
        const out = buildLaunchpadPayload({ items: null, sourcePath: '/x', host: '' });
        expect(out.assistantProfile).toBe('default');
        expect(out.count).toBe(0);
        expect(out.items).toEqual([]);
        expect(out.workspaceUrl).toBe('');
    });
});

describe('databricksEnablement — sanitizeVectorSearchQuery', () => {
    it('honors indexName + queryText + default numResults=5', () => {
        const out = sanitizeVectorSearchQuery({ indexName: 'idx', queryText: 'hi' });
        expect(out.indexName).toBe('idx');
        expect(out.queryText).toBe('hi');
        expect(out.payload.num_results).toBe(5);
        expect(out.payload.query_text).toBe('hi');
        expect(out.payload.columns).toBeUndefined();
        expect(out.payload.filters_json).toBeUndefined();
        expect(out.payload.reranker).toBeUndefined();
    });

    it('clamps numResults at the [1, 50] window', () => {
        expect(sanitizeVectorSearchQuery({ numResults: 0 }).payload.num_results).toBe(1);
        expect(sanitizeVectorSearchQuery({ numResults: -5 }).payload.num_results).toBe(1);
        expect(sanitizeVectorSearchQuery({ numResults: 25 }).payload.num_results).toBe(25);
        expect(sanitizeVectorSearchQuery({ numResults: 50 }).payload.num_results).toBe(50);
        expect(sanitizeVectorSearchQuery({ numResults: 51 }).payload.num_results).toBe(50);
        expect(sanitizeVectorSearchQuery({ numResults: 9999 }).payload.num_results).toBe(50);
    });

    it('falls back to 5 when numResults is NaN / non-finite', () => {
        expect(sanitizeVectorSearchQuery({ numResults: 'banana' }).payload.num_results).toBe(5);
        expect(sanitizeVectorSearchQuery({ numResults: NaN }).payload.num_results).toBe(5);
    });

    it('floors decimal numResults', () => {
        expect(sanitizeVectorSearchQuery({ numResults: 7.9 }).payload.num_results).toBe(7);
    });

    it('accepts the snake_case num_results alias', () => {
        expect(sanitizeVectorSearchQuery({ num_results: 12 }).payload.num_results).toBe(12);
    });

    it('accepts query / text as queryText aliases', () => {
        expect(sanitizeVectorSearchQuery({ query: 'q' }).queryText).toBe('q');
        expect(sanitizeVectorSearchQuery({ text: 't' }).queryText).toBe('t');
    });

    it('uses fallbackIndexName when body.indexName is absent', () => {
        const out = sanitizeVectorSearchQuery({ queryText: 'x' }, 'fallback.idx');
        expect(out.indexName).toBe('fallback.idx');
    });

    it('trims, filters empty entries, and caps columns at 50', () => {
        const cols = Array.from({ length: 75 }, (_, i) => `col_${i}`);
        cols.push('  ', '');
        const out = sanitizeVectorSearchQuery({ columns: ['  a  ', '', 'b', ...cols] });
        expect(out.payload.columns).toHaveLength(50);
        expect(out.payload.columns[0]).toBe('a');
        expect(out.payload.columns[1]).toBe('b');
        // Trimmed entries should not include the empty strings that were
        // mixed into the input — they get filtered before slicing.
        expect(out.payload.columns.every(c => c.length > 0)).toBe(true);
    });

    it('omits columns when none survive trimming', () => {
        const out = sanitizeVectorSearchQuery({ columns: ['', '   '] });
        expect(out.payload.columns).toBeUndefined();
    });

    it('ignores columns when not an array', () => {
        const out = sanitizeVectorSearchQuery({ columns: 'not-an-array' });
        expect(out.payload.columns).toBeUndefined();
    });

    it('JSON-stringifies filters when given as an object', () => {
        const out = sanitizeVectorSearchQuery({ filters: { region: ['EU', 'NA'] } });
        expect(out.payload.filters_json).toBe(JSON.stringify({ region: ['EU', 'NA'] }));
    });

    it('passes through reranker config object verbatim', () => {
        const reranker = { model: 'bge-reranker', top_k: 10 };
        const out = sanitizeVectorSearchQuery({ reranker });
        expect(out.payload.reranker).toBe(reranker);
    });

    it('ignores non-object filters and reranker', () => {
        const out = sanitizeVectorSearchQuery({ filters: 'nope', reranker: 'also nope' });
        expect(out.payload.filters_json).toBeUndefined();
        expect(out.payload.reranker).toBeUndefined();
    });
});
