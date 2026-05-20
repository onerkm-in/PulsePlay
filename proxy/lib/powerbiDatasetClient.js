// @ts-check
'use strict';

/**
 * powerbiDatasetClient.js — Power BI semantic-model AI brain.
 *
 * Cycle 15 — adds Power BI dataset (semantic model) as an AI connector
 * alongside Genie / Foundation Model / OpenAI / Bedrock / Supervisor.
 *
 * Design contract
 * ────────────────
 * A deployer publishes a tabular dataset to a Power BI workspace. PulsePlay
 * uses Power BI's REST API to:
 *   1. Introspect the dataset schema (tables / columns / measures) via the
 *      INFO.* DAX functions (DEFINE EVALUATE INFO.MEASURES() etc).
 *   2. Execute DAX queries through `POST .../datasets/{id}/executeQueries`
 *      to answer specific questions deterministically.
 *
 * No LLM is invoked anywhere in this path. The question → DAX mapping is
 * done by `powerbiQuestionMatcher.js` (pure keyword + schema lookup).
 *
 * Auth model
 * ──────────
 * Azure AD Service Principal (client_credentials grant). Token scope:
 *   https://analysis.windows.net/powerbi/api/.default
 *
 * Setup requirements:
 *   - AAD app registration with a client secret.
 *   - Service Principal added to the target Power BI workspace as a member
 *     (Power BI Admin can do this via "Workspace access" UI).
 *   - Tenant admin grant: "Service principals can use Power BI APIs"
 *     setting enabled in the Power BI admin portal.
 *
 * Profile shape
 * ─────────────
 *   {
 *     "type": "powerbi-semantic-model",
 *     "displayName": "...",
 *     "aadTenantId": "...",          // OR powerBiTenantId (back-compat)
 *     "aadClientId": "...",          // OR powerBiClientId
 *     "aadClientSecret": "...",      // OR powerBiClientSecret
 *     "powerbiGroupId": "...",       // workspace GUID; "me" is not supported
 *     "powerbiDatasetId": "...",     // dataset GUID
 *     "dataDomain": "Sales performance"
 *   }
 *
 * Defensive posture
 * ─────────────────
 * Auth + REST calls have a 10s socket timeout. Token acquisition is
 * single-flight per (tenantId, clientId): concurrent requests reuse the
 * same in-flight promise. Tokens are refreshed 5min before expiry.
 *
 * No retry — surface failures to the caller (probe adapter / route
 * handler), let them decide how to render. Mirrors the probe-never-throw
 * contract used by other proxy adapters.
 */

const PBI_API_BASE = 'https://api.powerbi.com';
const AAD_TOKEN_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
const SOCKET_TIMEOUT_MS = 10_000;
const EXECUTE_QUERIES_TIMEOUT_MS = 30_000;
const TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000;

const _tokenCache = new Map(); // key: tenantId|clientId → { accessToken, expiresAt, inFlight? }

/* ───── Profile field accessors (with back-compat aliases) ────────── */

function _tenantId(p) {
    return String(p?.aadTenantId || p?.powerBiTenantId || '').trim();
}
function _clientId(p) {
    return String(p?.aadClientId || p?.powerBiClientId || '').trim();
}
function _clientSecret(p) {
    // Never logged. Falsy-check only.
    return p?.aadClientSecret || p?.powerBiClientSecret || '';
}
function _groupId(p) {
    return String(p?.powerbiGroupId || p?.powerBiGroupId || '').trim();
}
function _datasetId(p) {
    return String(p?.powerbiDatasetId || p?.powerBiDatasetId || '').trim();
}

/* ───── Token acquisition + cache ──────────────────────────────────── */

/**
 * Acquire an AAD access token for Power BI. Caches per (tenant, client)
 * with single-flight on concurrent requests and a 5-min early refresh
 * window so a token never falls off mid-request.
 *
 * @param {object} profile
 * @param {function} [fetchImpl]   Test injection seam.
 * @returns {Promise<string>}      The bearer access token.
 */
async function acquirePbiAccessToken(profile, fetchImpl) {
    const tenant = _tenantId(profile);
    const client = _clientId(profile);
    const secret = _clientSecret(profile);
    if (!tenant) throw new Error('Power BI profile missing aadTenantId');
    if (!client) throw new Error('Power BI profile missing aadClientId');
    if (!secret) throw new Error('Power BI profile missing aadClientSecret');

    const f = fetchImpl || globalThis.fetch;
    const key = `${tenant}|${client}`;
    const now = Date.now();
    const cached = _tokenCache.get(key);
    if (cached && !cached.inFlight && cached.expiresAt > now + TOKEN_EARLY_REFRESH_MS) {
        return cached.accessToken;
    }
    if (cached?.inFlight) {
        return cached.inFlight;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        client_id: client,
        client_secret: secret,
        grant_type: 'client_credentials',
        scope: AAD_TOKEN_SCOPE,
    }).toString();

    const inFlight = (async () => {
        const resp = await f(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
        });
        if (!resp.ok) {
            const detail = (await resp.text()).slice(0, 300);
            throw new Error(`Azure AD token request failed (${resp.status}): ${detail}`);
        }
        const data = await resp.json();
        if (!data?.access_token) throw new Error('Azure AD response missing access_token');
        const expiresInSec = Number(data.expires_in || 3600);
        const entry = {
            accessToken: String(data.access_token),
            expiresAt: Date.now() + expiresInSec * 1000,
        };
        _tokenCache.set(key, entry);
        return entry.accessToken;
    })();

    // Park the in-flight promise so concurrent callers share it.
    _tokenCache.set(key, { ...(cached || {}), inFlight });
    try {
        return await inFlight;
    } catch (err) {
        // Clear cache on failure so the next request retries cleanly.
        _tokenCache.delete(key);
        throw err;
    }
}

/* ───── Dataset metadata + DAX execution ──────────────────────────── */

/**
 * Fetch a one-shot dataset summary from the GET /v1.0/myorg/groups/{g}/datasets/{d}
 * endpoint. Returns the raw JSON (name, configuredBy, isRefreshable, etc).
 * Adds no synthesis — synthesis happens in the probe adapter.
 *
 * @param {object} profile
 * @param {{ fetchImpl?: function }} [opts]
 * @returns {Promise<object>}
 */
async function getDatasetMetadata(profile, opts = {}) {
    const groupId = _groupId(profile);
    if (!groupId) throw new Error('Power BI profile missing powerbiGroupId');
    const datasetId = _datasetId(profile);
    if (!datasetId) throw new Error('Power BI profile missing powerbiDatasetId');

    const token = await acquirePbiAccessToken(profile, opts.fetchImpl);
    const url = `${PBI_API_BASE}/v1.0/myorg/groups/${encodeURIComponent(groupId)}/datasets/${encodeURIComponent(datasetId)}`;
    const f = opts.fetchImpl || globalThis.fetch;
    const resp = await f(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
    });
    if (!resp.ok) {
        const detail = (await resp.text()).slice(0, 300);
        const err = new Error(`Power BI dataset metadata fetch failed (${resp.status}): ${detail}`);
        // @ts-expect-error — attach status for callers
        err.statusCode = resp.status;
        throw err;
    }
    return resp.json();
}

/**
 * Execute a DAX query against the dataset's `/executeQueries` endpoint.
 * Returns the canonical Microsoft response shape: `{ results: [{ tables: [{ rows: [...] }] }] }`.
 *
 * The `serializerSettings.includeNulls = true` flag preserves NULL cells so
 * caller renderers don't have to guess at missing columns.
 *
 * @param {object} profile
 * @param {string} daxQuery
 * @param {{ fetchImpl?: function, impersonatedUserName?: string }} [opts]
 * @returns {Promise<{ results: Array<{ tables: Array<{ rows: any[] }> }> }>}
 */
async function executeDax(profile, daxQuery, opts = {}) {
    if (!daxQuery || typeof daxQuery !== 'string' || !daxQuery.trim()) {
        throw new Error('executeDax requires a non-empty DAX string');
    }
    const groupId = _groupId(profile);
    if (!groupId) throw new Error('Power BI profile missing powerbiGroupId');
    const datasetId = _datasetId(profile);
    if (!datasetId) throw new Error('Power BI profile missing powerbiDatasetId');

    const token = await acquirePbiAccessToken(profile, opts.fetchImpl);
    const url = `${PBI_API_BASE}/v1.0/myorg/groups/${encodeURIComponent(groupId)}/datasets/${encodeURIComponent(datasetId)}/executeQueries`;
    const body = {
        queries: [{ query: daxQuery }],
        serializerSettings: { includeNulls: true },
        ...(opts.impersonatedUserName ? { impersonatedUserName: opts.impersonatedUserName } : {}),
    };
    const f = opts.fetchImpl || globalThis.fetch;
    const resp = await f(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(EXECUTE_QUERIES_TIMEOUT_MS),
    });
    if (!resp.ok) {
        const detail = (await resp.text()).slice(0, 500);
        const err = new Error(`Power BI executeQueries failed (${resp.status}): ${detail}`);
        // @ts-expect-error — attach status for callers
        err.statusCode = resp.status;
        throw err;
    }
    return resp.json();
}

/**
 * Convenience: run a DAX query and flatten the first result table into
 * the canonical { columns, rows } shape PulsePlay uses throughout.
 * Power BI returns rows as Array<Record<column, value>>; we normalise
 * to columns: string[] and rows: any[][] so it matches sqlExecutor's
 * shape.
 *
 * @param {object} profile
 * @param {string} daxQuery
 * @param {{ fetchImpl?: function, impersonatedUserName?: string }} [opts]
 * @returns {Promise<{ columns: string[], rows: any[][], truncated: boolean }>}
 */
async function executeDaxNormalized(profile, daxQuery, opts = {}) {
    const data = await executeDax(profile, daxQuery, opts);
    const firstTable = data?.results?.[0]?.tables?.[0];
    if (!firstTable || !Array.isArray(firstTable.rows)) {
        return { columns: [], rows: [], truncated: false };
    }
    const rowObjs = firstTable.rows;
    if (rowObjs.length === 0) {
        return { columns: [], rows: [], truncated: false };
    }
    // Preserve column order from the first row's keys.
    const columns = Object.keys(rowObjs[0]);
    const rows = rowObjs.map(r => columns.map(c => r[c]));
    return { columns, rows, truncated: false };
}

/* ───── Module exports ─────────────────────────────────────────────── */

function __resetCacheForTests() {
    _tokenCache.clear();
}

module.exports = {
    acquirePbiAccessToken,
    getDatasetMetadata,
    executeDax,
    executeDaxNormalized,
    // Internal exports for tests + probe-adapter reuse.
    __internals: {
        tenantId: _tenantId,
        clientId: _clientId,
        groupId: _groupId,
        datasetId: _datasetId,
    },
    __resetCacheForTests,
};
