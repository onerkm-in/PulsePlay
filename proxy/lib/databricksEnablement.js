'use strict';

function trimSlash(value) {
    return String(value || '').replace(/\/+$/, '');
}

function firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
}

function buildWorkspaceUrl(host, path) {
    const base = trimSlash(host);
    if (!base) return '';
    const suffix = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
    return `${base}${suffix}`;
}

function arrayFromPayload(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys || []) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
}

function normalizeLakeviewDashboard(raw, host) {
    const id = firstString(raw?.dashboard_id, raw?.dashboardId, raw?.id, raw?.resource_id);
    const path = firstString(raw?.path, raw?.parent_path);
    const title = firstString(raw?.display_name, raw?.name, raw?.title, path ? path.split('/').filter(Boolean).pop() : '');
    return {
        kind: 'lakeview-dashboard',
        id,
        title: title || id || '(untitled dashboard)',
        path,
        lifecycleState: firstString(raw?.lifecycle_state, raw?.lifecycleState),
        updatedAt: firstString(raw?.update_time, raw?.updated_at, raw?.modified_at),
        workspaceUrl: trimSlash(host),
        openUrl: id ? buildWorkspaceUrl(host, `/dashboards/${encodeURIComponent(id)}`) : '',
        embedUrl: id ? buildWorkspaceUrl(host, `/embed/dashboardsv3/${encodeURIComponent(id)}`) : '',
        raw,
    };
}

function normalizeGenieSpace(raw, host) {
    const id = firstString(raw?.space_id, raw?.spaceId, raw?.id);
    const title = firstString(raw?.title, raw?.name, raw?.display_name, raw?.description);
    return {
        kind: 'genie-space',
        id,
        title: title || id || '(untitled Genie Space)',
        description: firstString(raw?.description),
        workspaceUrl: trimSlash(host),
        openUrl: id ? buildWorkspaceUrl(host, `/genie/rooms/${encodeURIComponent(id)}`) : '',
        embedUrl: firstString(raw?.embed_url, raw?.embedUrl, raw?.url),
        raw,
    };
}

function normalizeServingEndpoint(raw, host) {
    const name = firstString(raw?.name, raw?.endpoint_name, raw?.id);
    const state = raw?.state || raw?.config_update || {};
    return {
        kind: 'serving-endpoint',
        id: name,
        title: name || '(unnamed endpoint)',
        state: firstString(state?.ready, state?.config_update, raw?.state),
        creator: firstString(raw?.creator, raw?.creator_user_name),
        workspaceUrl: trimSlash(host),
        openUrl: name ? buildWorkspaceUrl(host, `/ml/endpoints/${encodeURIComponent(name)}`) : '',
        raw,
    };
}

function normalizeDatabricksApp(raw, host) {
    const name = firstString(raw?.name, raw?.app_name, raw?.id);
    return {
        kind: 'databricks-app',
        id: name,
        title: firstString(raw?.display_name, raw?.name, raw?.app_name) || '(unnamed app)',
        state: firstString(raw?.state, raw?.status),
        workspaceUrl: trimSlash(host),
        openUrl: firstString(raw?.url, raw?.app_url) || (name ? buildWorkspaceUrl(host, `/apps/${encodeURIComponent(name)}`) : ''),
        raw,
    };
}

function normalizeSqlWarehouse(raw, host) {
    const id = firstString(raw?.id, raw?.warehouse_id);
    return {
        kind: 'sql-warehouse',
        id,
        title: firstString(raw?.name, raw?.title) || id || '(unnamed warehouse)',
        state: firstString(raw?.state),
        size: firstString(raw?.cluster_size, raw?.size),
        workspaceUrl: trimSlash(host),
        openUrl: id ? buildWorkspaceUrl(host, `/sql/warehouses/${encodeURIComponent(id)}`) : '',
        raw,
    };
}

function normalizeMetricView(raw) {
    const catalog = firstString(raw?.catalog_name, raw?.catalogName);
    const schema = firstString(raw?.schema_name, raw?.schemaName);
    const name = firstString(raw?.name, raw?.table_name, raw?.tableName);
    const fullName = firstString(raw?.full_name, raw?.fullName)
        || [catalog, schema, name].filter(Boolean).join('.');
    return {
        kind: 'metric-view',
        id: fullName,
        title: name || fullName || '(unnamed metric view)',
        fullName,
        catalog,
        schema,
        tableType: firstString(raw?.table_type, raw?.tableType),
        owner: firstString(raw?.owner),
        comment: firstString(raw?.comment),
        raw,
    };
}

function isMetricView(raw) {
    const tableType = firstString(raw?.table_type, raw?.tableType).toUpperCase();
    return tableType === 'METRIC_VIEW';
}

function buildLaunchpadPayload({ items, sourcePath, profileName, host, raw }) {
    return {
        ok: true,
        assistantProfile: profileName || 'default',
        workspaceUrl: trimSlash(host),
        sourcePath,
        count: Array.isArray(items) ? items.length : 0,
        items: Array.isArray(items) ? items : [],
        raw,
        fetchedAt: new Date().toISOString(),
    };
}

function sanitizeVectorSearchQuery(body, fallbackIndexName) {
    const indexName = firstString(body?.indexName, body?.index, fallbackIndexName);
    const queryText = firstString(body?.queryText, body?.query, body?.text);
    const numResultsRaw = Number(body?.numResults ?? body?.num_results ?? 5);
    const numResults = Math.max(1, Math.min(Number.isFinite(numResultsRaw) ? Math.floor(numResultsRaw) : 5, 50));
    const columns = Array.isArray(body?.columns)
        ? body.columns.map(v => String(v).trim()).filter(Boolean).slice(0, 50)
        : undefined;
    const payload = {
        num_results: numResults,
        query_text: queryText,
    };
    if (columns && columns.length > 0) payload.columns = columns;
    if (body?.filters && typeof body.filters === 'object') payload.filters_json = JSON.stringify(body.filters);
    if (body?.reranker && typeof body.reranker === 'object') payload.reranker = body.reranker;
    return { indexName, queryText, payload };
}

module.exports = {
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
};
