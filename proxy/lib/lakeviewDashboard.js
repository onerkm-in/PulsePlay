// proxy/lib/lakeviewDashboard.js
//
// Server side of the Databricks-native dashboard path: fetch an AI/BI
// (Lakeview) dashboard's spec, and execute its datasets by NAME.
//
// The security property this module exists to enforce:
//
//     THE BROWSER NEVER SENDS SQL.
//
// A client asks for `{ dashboardId, datasetName }`. The proxy fetches the
// dashboard spec with the workspace token, finds that named dataset, and runs
// the SQL the dashboard author wrote. There is no code path that executes a
// statement supplied by a caller, so this route cannot become an arbitrary
// query endpoint even by mistake. The workspace token never reaches the
// browser either.
//
// Cost model. Dashboards reuse datasets heavily - the reference dashboard has
// 40 widgets over 8 datasets - so results are cached per (dashboard, dataset,
// sql) with a short TTL and specs are cached for longer. Rendering a page
// therefore costs a handful of warehouse scans rather than one per widget, and
// zero model calls. Point the dataset SQL at the pre-aggregated Delta rollups
// (tbl_pp_syn_agg_*) and each scan is a few hundred rows.

const aggregate = require('./lakeviewAggregate');

const DEFAULT_SPEC_TTL_MS = 5 * 60 * 1000;
const DEFAULT_DATA_TTL_MS = 60 * 1000;
/** Hard ceiling. Mirrors the Genie client's cap so one runaway dataset cannot
 *  pin the proxy. */
const MAX_ROWS = 5000;
/**
 * Default rows returned for RENDERING a dashboard widget.
 *
 * Much lower than the hard cap on purpose. A Lakeview chart aggregates into a
 * handful of categories, so 5000 raw rows is payload nobody draws: the
 * reference dashboard's "Support Data" dataset serialises to 4 MB, which
 * completed against the proxy directly and then never finished through the Vite
 * dev proxy - the browser sat on "Loading..." forever with every request
 * reporting 200. Shipping less is both the fix and the correct behaviour.
 *
 * Callers that genuinely need more (an export, a table drill) pass maxRows
 * explicitly, still bounded by MAX_ROWS.
 */
const DEFAULT_RENDER_ROWS = 1000;

/** Tiny TTL cache. Deliberately not an LRU: the key space is bounded by the
 *  dashboards a deployment actually opens, and entries expire on their own. */
function createTtlCache() {
    const store = new Map();
    return {
        get(key) {
            const hit = store.get(key);
            if (!hit) return undefined;
            if (Date.now() > hit.expiresAt) { store.delete(key); return undefined; }
            return hit.value;
        },
        set(key, value, ttlMs) {
            store.set(key, { value, expiresAt: Date.now() + ttlMs });
        },
        clear() { store.clear(); },
        get size() { return store.size; },
    };
}

const specCache = createTtlCache();
const dataCache = createTtlCache();

/** Reset caches between tests, and after a config change. */
function __resetLakeviewCaches() {
    specCache.clear();
    dataCache.clear();
}

/**
 * Fetch and parse a dashboard spec.
 *
 * `serialized_dashboard` arrives as a JSON string. A dashboard whose spec fails
 * to parse is reported as an error rather than returned half-formed - a partial
 * spec would render as a dashboard with silently missing widgets, which is the
 * failure mode this project keeps paying for.
 */
async function fetchDashboardSpec(profile, dashboardId, { request, ttlMs = DEFAULT_SPEC_TTL_MS, now = Date.now } = {}) {
    if (!dashboardId) throw new Error('dashboardId is required');
    const host = String(profile?.host || '').replace(/\/+$/, '');
    const cacheKey = `${host}|${dashboardId}`;
    const cached = specCache.get(cacheKey);
    if (cached) return { ...cached, cached: true };

    const raw = await request(profile, 'GET', `/api/2.0/lakeview/dashboards/${encodeURIComponent(dashboardId)}`);
    let spec;
    const serialized = raw?.serialized_dashboard;
    if (typeof serialized === 'string') {
        try { spec = JSON.parse(serialized); }
        catch (e) { throw new Error(`dashboard ${dashboardId} has an unreadable spec: ${e.message}`); }
    } else if (serialized && typeof serialized === 'object') {
        spec = serialized;
    } else {
        throw new Error(`dashboard ${dashboardId} returned no serialized_dashboard`);
    }

    const value = {
        dashboardId,
        displayName: raw?.display_name || '',
        warehouseId: raw?.warehouse_id || profile?.warehouseId || null,
        updatedAt: raw?.update_time || null,
        spec,
        fetchedAt: new Date(now()).toISOString(),
    };
    specCache.set(cacheKey, value, ttlMs);
    return { ...value, cached: false };
}

/** Resolve a dataset's SQL from a spec. Returns null when the name is unknown,
 *  which callers must treat as a 404 rather than falling back to anything. */
function datasetSqlByName(spec, datasetName) {
    if (!spec || !datasetName) return null;
    const found = (spec.datasets || []).find(d => d?.name === datasetName || d?.displayName === datasetName);
    if (!found) return null;
    const lines = found.queryLines;
    const sql = Array.isArray(lines) ? lines.join('') : (typeof found.query === 'string' ? found.query : '');
    const trimmed = String(sql || '').trim();
    return trimmed || null;
}

/** Names a client may legitimately ask for, so a UI can enumerate without
 *  guessing and a 404 is unambiguous. */
function listDatasets(spec) {
    return (spec?.datasets || [])
        .filter(d => d?.name)
        .map(d => ({ name: d.name, displayName: d.displayName || d.name }));
}

/** Clamp a caller-supplied row request into [1, MAX_ROWS]. */
function resolveMaxRows(requested) {
    const n = Number(requested);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_RENDER_ROWS;
    return Math.min(Math.floor(n), MAX_ROWS);
}

/** Normalize a SQL Statement Execution result into { columns, rows }.
 *  maxRows is resolved through resolveMaxRows, so an omitted value means the
 *  render-sized page - one definition of "default", not two. */
function normalizeStatementResult(statement, maxRows) {
    const cap = resolveMaxRows(maxRows);
    const cols = statement?.manifest?.schema?.columns || [];
    const columns = cols.map(c => String(c?.name ?? ''));
    const data = statement?.result?.data_array || statement?.result?.data_typed_array || [];
    const rows = Array.isArray(data) ? data.slice(0, cap) : [];
    return {
        columns,
        rows,
        truncated: Array.isArray(data) && data.length > cap,
        totalRows: Array.isArray(data) ? data.length : 0,
    };
}

/**
 * Execute one dataset of one dashboard.
 *
 * `datasetName` is the ONLY caller-controlled input that reaches SQL, and it is
 * used to look a statement up, never to build one.
 */
async function runDashboardDataset(profile, dashboardId, datasetName, {
    request,
    execute,
    ttlMs = DEFAULT_DATA_TTL_MS,
    specTtlMs = DEFAULT_SPEC_TTL_MS,
    maxRows = DEFAULT_RENDER_ROWS,
    widgetName = null,
} = {}) {
    const cap = resolveMaxRows(maxRows);
    const { spec, warehouseId } = await fetchDashboardSpec(profile, dashboardId, { request, ttlMs: specTtlMs });
    const sql = datasetSqlByName(spec, datasetName);
    if (!sql) {
        const err = new Error(`dataset "${datasetName}" is not defined by dashboard ${dashboardId}`);
        err.statusCode = 404;
        err.knownDatasets = listDatasets(spec).map(d => d.name);
        throw err;
    }

    // Push-down aggregation, when the named widget's encodings map confidently.
    // The widget is looked up in the spec WE fetched - the caller supplies a
    // name, never a field or a statement - so no browser input reaches SQL.
    const widget = widgetName ? aggregate.findWidgetByName(spec, widgetName) : null;
    const aggregatedSql = widget ? aggregate.buildAggregateSql(sql, widget) : null;

    const host = String(profile?.host || '').replace(/\/+$/, '');
    const target = aggregatedSql || sql;
    // The cap and the effective statement are both part of the key: a cached
    // 1000-row render must not serve a 2000-row ask, and an aggregated result
    // must not be served as the raw one.
    const cacheKey = `${host}|${dashboardId}|${datasetName}|${cap}|${target.length}:${target.slice(0, 120)}`;
    const cached = dataCache.get(cacheKey);
    if (cached) return { ...cached, cached: true };

    const runProfile = { ...profile, warehouseId: warehouseId || profile.warehouseId };
    let statement;
    let aggregated = !!aggregatedSql;
    if (aggregatedSql) {
        try {
            statement = await execute(runProfile, aggregatedSql);
        } catch (err) {
            // The author's SQL may already aggregate, in which case the derived
            // GROUP BY references a column that does not exist. Rather than
            // reason about SUM-of-SUM, fall back to the statement that was
            // always correct. One extra round trip, only on the failing path.
            aggregated = false;
            statement = await execute(runProfile, sql);
        }
    } else {
        statement = await execute(runProfile, sql);
    }

    const result = normalizeStatementResult(statement, cap);
    const value = { dashboardId, datasetName, aggregated, ...result };
    dataCache.set(cacheKey, value, ttlMs);
    return { ...value, cached: false };
}

module.exports = {
    fetchDashboardSpec,
    datasetSqlByName,
    listDatasets,
    normalizeStatementResult,
    resolveMaxRows,
    runDashboardDataset,
    __resetLakeviewCaches,
    MAX_ROWS,
    DEFAULT_RENDER_ROWS,
    DEFAULT_SPEC_TTL_MS,
    DEFAULT_DATA_TTL_MS,
};
