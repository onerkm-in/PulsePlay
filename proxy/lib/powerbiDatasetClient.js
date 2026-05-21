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
 * TWO supported auth modes (selected by profile.authMode; default "service-principal"):
 *
 *   "service-principal" (default, production-shape):
 *     Azure AD app registration + client secret. client_credentials grant against
 *     https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token with scope
 *     https://analysis.windows.net/powerbi/api/.default. Requires the SP to be
 *     added to the workspace as Member/Contributor AND the tenant setting
 *     "Service principals can use Power BI APIs" to be enabled.
 *
 *   "user-refresh" (demo / setup-incomplete fallback):
 *     MSAL device-code flow run once (e.g. via scripts/get-pbi-user-refresh-token.mjs)
 *     captures a refresh_token tied to the signed-in user. Profile carries that
 *     refresh_token; acquirePbiAccessToken redeems it for fresh access tokens
 *     using refresh_token grant against the same OAuth endpoint. Public client
 *     (no secret). Refresh-token rotation is honored — the latest refresh_token
 *     is kept in the in-memory cache for the lifetime of the proxy process.
 *     Access uses the signed-in user's existing Power BI permissions, so no
 *     tenant SP toggle / no workspace SP add is required.
 *
 * Profile shape
 * ─────────────
 *   // service-principal mode (default)
 *   {
 *     "type": "powerbi-semantic-model",
 *     "displayName": "...",
 *     "authMode": "service-principal",   // optional; default
 *     "aadTenantId": "...",              // OR powerBiTenantId (back-compat)
 *     "aadClientId": "...",              // OR powerBiClientId
 *     "aadClientSecret": "...",          // OR powerBiClientSecret
 *     "powerbiGroupId": "...",           // workspace GUID; "me" is not supported
 *     "powerbiDatasetId": "...",         // dataset GUID
 *     "dataDomain": "Sales performance"
 *   }
 *
 *   // user-refresh mode (demo fallback)
 *   {
 *     "type": "powerbi-semantic-model",
 *     "authMode": "user-refresh",
 *     "aadTenantId": "...",              // tenant the user signed into
 *     "userClientId": "...",             // optional; defaults to Azure CLI public client
 *     "userRefreshToken": "...",         // captured via device-code flow once
 *     "powerbiGroupId": "...",
 *     "powerbiDatasetId": "..."
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
const AAD_USER_SCOPE = 'https://analysis.windows.net/powerbi/api/.default offline_access';
const AZURE_CLI_PUBLIC_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';
const SOCKET_TIMEOUT_MS = 10_000;
const EXECUTE_QUERIES_TIMEOUT_MS = 30_000;
const TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000;

// Cache key: `${authMode}|${tenantId}|${clientId}` → { accessToken, expiresAt, refreshToken?, inFlight? }
const _tokenCache = new Map();

/* ───── Profile field accessors (with back-compat aliases) ────────── */

function _authMode(p) {
    const m = String(p?.authMode || '').trim().toLowerCase();
    return (m === 'user-refresh' || m === 'user-token') ? 'user-refresh' : 'service-principal';
}
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
function _userClientId(p) {
    return String(p?.userClientId || '').trim() || AZURE_CLI_PUBLIC_CLIENT_ID;
}
function _userRefreshToken(p) {
    // Never logged. Falsy-check only.
    return p?.userRefreshToken || '';
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
    const mode = _authMode(profile);
    const tenant = _tenantId(profile);
    if (!tenant) throw new Error('Power BI profile missing aadTenantId');

    // Mode-specific validation + body construction
    let client, key, bodyParams;
    if (mode === 'user-refresh') {
        client = _userClientId(profile);
        const cached = _tokenCache.get(`user-refresh|${tenant}|${client}`);
        // Prefer the latest cached refresh_token (rotation), fall back to profile-provided.
        const refreshToken = (cached && cached.refreshToken) || _userRefreshToken(profile);
        if (!refreshToken) {
            throw new Error('Power BI user-refresh mode requires userRefreshToken (run scripts/get-pbi-user-refresh-token.mjs once)');
        }
        bodyParams = {
            client_id: client,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            scope: AAD_USER_SCOPE,
        };
        key = `user-refresh|${tenant}|${client}`;
    } else {
        client = _clientId(profile);
        const secret = _clientSecret(profile);
        if (!client) throw new Error('Power BI profile missing aadClientId');
        if (!secret) throw new Error('Power BI profile missing aadClientSecret');
        bodyParams = {
            client_id: client,
            client_secret: secret,
            grant_type: 'client_credentials',
            scope: AAD_TOKEN_SCOPE,
        };
        key = `service-principal|${tenant}|${client}`;
    }

    const f = fetchImpl || globalThis.fetch;
    const now = Date.now();
    const cached = _tokenCache.get(key);
    if (cached && !cached.inFlight && cached.expiresAt > now + TOKEN_EARLY_REFRESH_MS) {
        return cached.accessToken;
    }
    if (cached?.inFlight) {
        return cached.inFlight;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
    const body = new URLSearchParams(bodyParams).toString();

    const inFlight = (async () => {
        const resp = await f(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
        });
        if (!resp.ok) {
            const detail = (await resp.text()).slice(0, 300);
            throw new Error(`Azure AD token request failed (${resp.status}, mode=${mode}): ${detail}`);
        }
        const data = await resp.json();
        if (!data?.access_token) throw new Error('Azure AD response missing access_token');
        const expiresInSec = Number(data.expires_in || 3600);
        const entry = {
            accessToken: String(data.access_token),
            expiresAt: Date.now() + expiresInSec * 1000,
        };
        // Persist rotated refresh_token if AAD returned one (user-refresh only)
        if (mode === 'user-refresh' && data.refresh_token) {
            entry.refreshToken = String(data.refresh_token);
        }
        _tokenCache.set(key, entry);
        return entry.accessToken;
    })();

    _tokenCache.set(key, { ...(cached || {}), inFlight });
    try {
        return await inFlight;
    } catch (err) {
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

/* ───── Q&A embed token ────────────────────────────────────────────── */

/**
 * Mint a Power BI embed token scoped to the dataset, suitable for the
 * Q&A embed surface (Microsoft's NL → DAX visual). The token is generated
 * via the dataset's own `/GenerateToken` endpoint — NOT the report one —
 * because Q&A doesn't bind to a report.
 *
 * Returned shape matches what the powerbi-client SDK expects to embed
 * Q&A: { accessToken, embedUrl, datasetId, groupId, expiresAt }.
 *
 * @param {object} profile
 * @param {{ fetchImpl?: function, accessLevel?: "View"|"Edit", identities?: Array<object> }} [opts]
 * @returns {Promise<{ accessToken: string, embedUrl: string, datasetId: string, groupId: string, expiresAt: number, tokenId?: string }>}
 */
async function generateQnAEmbedToken(profile, opts = {}) {
    const groupId = _groupId(profile);
    if (!groupId) throw new Error('Power BI profile missing powerbiGroupId');
    const datasetId = _datasetId(profile);
    if (!datasetId) throw new Error('Power BI profile missing powerbiDatasetId');

    const token = await acquirePbiAccessToken(profile, opts.fetchImpl);
    const url = `${PBI_API_BASE}/v1.0/myorg/groups/${encodeURIComponent(groupId)}/datasets/${encodeURIComponent(datasetId)}/GenerateToken`;
    const body = {
        accessLevel: opts.accessLevel || 'View',
        ...(Array.isArray(opts.identities) && opts.identities.length > 0
            ? { identities: opts.identities }
            : {}),
    };
    const f = opts.fetchImpl || globalThis.fetch;
    const resp = await f(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
    });
    if (!resp.ok) {
        const detail = (await resp.text()).slice(0, 300);
        const err = new Error(`Power BI dataset GenerateToken failed (${resp.status}): ${detail}`);
        // @ts-expect-error — attach status for callers
        err.statusCode = resp.status;
        throw err;
    }
    const data = await resp.json();
    if (!data?.token) throw new Error('Power BI dataset GenerateToken response missing token');
    const expiresAt = data.expiration ? new Date(data.expiration).getTime() : Date.now() + 60 * 60 * 1000;
    return {
        accessToken: String(data.token),
        embedUrl: `https://app.powerbi.com/qnaEmbed?groupId=${encodeURIComponent(groupId)}`,
        datasetId,
        groupId,
        expiresAt,
        tokenId: data.tokenId ? String(data.tokenId) : undefined,
    };
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
    generateQnAEmbedToken,
    // Internal exports for tests + probe-adapter reuse.
    __internals: {
        tenantId: _tenantId,
        clientId: _clientId,
        groupId: _groupId,
        datasetId: _datasetId,
    },
    __resetCacheForTests,
};
