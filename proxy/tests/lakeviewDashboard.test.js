/**
 * Databricks-native dashboard path.
 *
 * The property under test that matters most: THE BROWSER NEVER SENDS SQL. A
 * client names a dataset; the proxy resolves the statement from the dashboard's
 * own spec. These pins exist so a later edit cannot quietly turn this into an
 * arbitrary query endpoint.
 */
const lakeview = require('../lib/lakeviewDashboard');

const PROFILE = { host: 'https://example.cloud.databricks.com', token: 'x', warehouseId: 'wh-1' };

// Shaped like a real Lakeview response: serialized_dashboard is a JSON STRING.
const SPEC = {
    datasets: [
        { name: '39a5402c', displayName: 'Tickets', queryLines: ['SELECT status, count(*) ', 'FROM tickets GROUP BY status'] },
        { name: '56d2ee72', displayName: 'Counters', queryLines: ['SELECT 1 AS in_progress_tickets'] },
    ],
    pages: [{ name: 'p1', layout: [] }],
};
const RAW = {
    dashboard_id: 'dash-1',
    display_name: 'Support review',
    warehouse_id: 'wh-dash',
    update_time: '2026-07-28T00:00:00Z',
    serialized_dashboard: JSON.stringify(SPEC),
};

function requestOk(calls = []) {
    return async (_profile, method, path) => { calls.push(`${method} ${path}`); return RAW; };
}

beforeEach(() => lakeview.__resetLakeviewCaches());

describe('fetchDashboardSpec', () => {
    test('parses the serialized spec and lists datasets', async () => {
        const out = await lakeview.fetchDashboardSpec(PROFILE, 'dash-1', { request: requestOk() });
        expect(out.displayName).toBe('Support review');
        expect(out.spec.datasets).toHaveLength(2);
        expect(lakeview.listDatasets(out.spec).map(d => d.name)).toEqual(['39a5402c', '56d2ee72']);
        expect(out.cached).toBe(false);
    });

    test('caches so a 40-widget page does not refetch the spec per widget', async () => {
        const calls = [];
        const request = requestOk(calls);
        await lakeview.fetchDashboardSpec(PROFILE, 'dash-1', { request });
        const second = await lakeview.fetchDashboardSpec(PROFILE, 'dash-1', { request });
        expect(second.cached).toBe(true);
        expect(calls).toHaveLength(1);
    });

    test('reports an unreadable or absent spec instead of returning a partial one', async () => {
        await expect(lakeview.fetchDashboardSpec(PROFILE, 'd', {
            request: async () => ({ serialized_dashboard: '{not json' }),
        })).rejects.toThrow(/unreadable spec/);

        await expect(lakeview.fetchDashboardSpec(PROFILE, 'd', {
            request: async () => ({}),
        })).rejects.toThrow(/no serialized_dashboard/);
    });
});

describe('datasetSqlByName', () => {
    test('joins queryLines into the author statement, by name or display name', () => {
        expect(lakeview.datasetSqlByName(SPEC, '39a5402c')).toBe('SELECT status, count(*) FROM tickets GROUP BY status');
        expect(lakeview.datasetSqlByName(SPEC, 'Tickets')).toMatch(/^SELECT status/);
    });

    test('returns null for an unknown dataset rather than falling back', () => {
        expect(lakeview.datasetSqlByName(SPEC, 'nope')).toBeNull();
        expect(lakeview.datasetSqlByName(null, 'x')).toBeNull();
    });
});

describe('runDashboardDataset', () => {
    const statement = {
        manifest: { schema: { columns: [{ name: 'status' }, { name: 'count(*)' }] } },
        result: { data_array: [['Open', '4'], ['Closed', '9']] },
    };

    test('runs the SQL the DASHBOARD defines, never anything from the caller', async () => {
        const executed = [];
        const out = await lakeview.runDashboardDataset(PROFILE, 'dash-1', '39a5402c', {
            request: requestOk(),
            execute: async (_p, sql) => { executed.push(sql); return statement; },
        });
        expect(executed).toEqual(['SELECT status, count(*) FROM tickets GROUP BY status']);
        expect(out.columns).toEqual(['status', 'count(*)']);
        expect(out.rows).toHaveLength(2);
    });

    test('uses the dashboard warehouse when it declares one', async () => {
        let seenWarehouse = null;
        await lakeview.runDashboardDataset(PROFILE, 'dash-1', '39a5402c', {
            request: requestOk(),
            execute: async (p) => { seenWarehouse = p.warehouseId; return statement; },
        });
        expect(seenWarehouse).toBe('wh-dash');
    });

    test('404s an unknown dataset and says which exist', async () => {
        expect.assertions(2);
        try {
            await lakeview.runDashboardDataset(PROFILE, 'dash-1', 'not-a-dataset', {
                request: requestOk(),
                execute: async () => statement,
            });
        } catch (e) {
            expect(e.statusCode).toBe(404);
            expect(e.knownDatasets).toEqual(['39a5402c', '56d2ee72']);
        }
    });

    test('caches results, so widgets sharing a dataset cost one scan', async () => {
        let runs = 0;
        const opts = {
            request: requestOk(),
            execute: async () => { runs += 1; return statement; },
        };
        await lakeview.runDashboardDataset(PROFILE, 'dash-1', '39a5402c', opts);
        const second = await lakeview.runDashboardDataset(PROFILE, 'dash-1', '39a5402c', opts);
        expect(runs).toBe(1);
        expect(second.cached).toBe(true);
    });

    test('caps rows so one dataset cannot pin the proxy', () => {
        const big = { manifest: { schema: { columns: [{ name: 'n' }] } },
            result: { data_array: Array.from({ length: lakeview.MAX_ROWS + 25 }, (_, i) => [i]) } };
        const out = lakeview.normalizeStatementResult(big);
        expect(out.rows).toHaveLength(lakeview.MAX_ROWS);
        expect(out.truncated).toBe(true);
        expect(out.totalRows).toBe(lakeview.MAX_ROWS + 25);
    });

    test('tolerates an empty result without inventing columns', () => {
        expect(lakeview.normalizeStatementResult({})).toEqual({
            columns: [], rows: [], truncated: false, totalRows: 0,
        });
    });
});
