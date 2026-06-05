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
// 2026-05-27 — sourced from lib/timeoutPolicy.js per the central
// policy ("simple → 3 min, complex → 5 min"). Socket = simple
// metadata fetch; ExecuteQueries = full DAX execution (complex).
const { SIMPLE_REQUEST_TIMEOUT_MS, COMPLEX_REQUEST_TIMEOUT_MS } = require('./timeoutPolicy');
const SOCKET_TIMEOUT_MS = SIMPLE_REQUEST_TIMEOUT_MS;   // was 10s
const EXECUTE_QUERIES_TIMEOUT_MS = COMPLEX_REQUEST_TIMEOUT_MS;  // was 30s
const TOKEN_EARLY_REFRESH_MS = 5 * 60 * 1000;
const TRANSIENT_FETCH_RETRY_DELAY_MS = 350;

// Cache key: `${authMode}|${tenantId}|${clientId}` → { accessToken, expiresAt, refreshToken?, inFlight? }
const _tokenCache = new Map();

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function _isTransientFetchError(err) {
    if (!err) return false;
    const code = String(err.code || err.cause?.code || '').toUpperCase();
    if ([
        'ECONNRESET',
        'ECONNREFUSED',
        'EPIPE',
        'ETIMEDOUT',
        'EAI_AGAIN',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_SOCKET',
    ].includes(code)) {
        return true;
    }
    const msg = `${err.message || ''} ${err.cause?.message || ''}`.toLowerCase();
    return /fetch failed|socket hang up|network error|connection reset|timed out/.test(msg);
}

function _describeFetchError(err) {
    const code = err?.cause?.code || err?.code || '';
    const msg = err?.cause?.message || err?.message || String(err || '');
    return code ? `${code}: ${msg}` : msg;
}

function _transportError(label, err) {
    const out = new Error(`${label} transport failed: ${_describeFetchError(err)}`);
    out.cause = err;
    return out;
}

async function _fetchWithTransientRetry(fetchImpl, url, buildOptions, label) {
    try {
        return await fetchImpl(url, buildOptions());
    } catch (err) {
        if (!_isTransientFetchError(err)) throw err;
        await _sleep(TRANSIENT_FETCH_RETRY_DELAY_MS);
        try {
            return await fetchImpl(url, buildOptions());
        } catch (retryErr) {
            if (_isTransientFetchError(retryErr)) throw _transportError(label, retryErr);
            throw retryErr;
        }
    }
}

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
        const resp = await _fetchWithTransientRetry(f, tokenUrl, () => ({
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
        }), 'Azure AD token request');
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

/* ───── OAuth On-Behalf-Of (OBO) — RLS-preserving query path ────────
 *
 * 2026-05-22 spike: Microsoft's executeQueries REST API has a hard
 * documented constraint — Service Principal + RLS = BLOCKED. The only
 * supported path for querying an RLS-enforced dataset programmatically
 * is OAuth On-Behalf-Of: exchange the SIGNED-IN USER'S existing OAuth
 * token for a Power BI access token, then call executeQueries AS the
 * user. RLS applies natively to the user's identity in the token; no
 * `impersonatedUserName` needed.
 *
 * Source: docs/research/EXTERNAL_REFERENCES.md "powerbi-semantic-model
 * deep-dive" entry — Microsoft Fabric Community thread + Microsoft
 * Learn executeQueries reference.
 *
 * Deployer prerequisites (one-time):
 *   1. Azure AD app registration must have `Power BI Service`
 *      delegated permission `Dataset.Read.All` (or `Dataset.ReadWrite.All`)
 *      granted with admin consent.
 *   2. The Azure AD app must be configured to allow OBO grant flow
 *      (default for delegated permissions).
 *   3. PulsePlay's upstream IdP must forward the user's OAuth access
 *      token in the `Authorization: Bearer <user-token>` header — the
 *      token must have an audience that matches PulsePlay's AAD app
 *      registration (so it can be exchanged on behalf of the user).
 *   4. The signed-in user must be a Power BI Pro / PPU / Premium user
 *      AND have at least Read access to the target workspace/dataset.
 *      PulsePlay cannot grant access the user does not have.
 *
 * Per-user cache: OBO tokens are scoped to the (tenant, client, user)
 * triple. The user identifier is derived from the assertion token's
 * `sub` claim (sha256 hash, never the raw value). TTL respects AAD's
 * `expires_in` with a 5-minute early-refresh window.
 */
const _oboTokenCache = new Map();

function _hashUserAssertion(assertion) {
    // Hash a stable per-user fragment of the assertion token. We DO NOT
    // log the raw value anywhere. Falls back to the full token hash if
    // the JWT can't be parsed (defensive — never throws).
    const crypto = require('crypto');
    try {
        const parts = String(assertion || '').split('.');
        if (parts.length >= 2) {
            // base64url decode the JWT payload, hash the `sub` claim
            // if present (most stable per-user identifier in AAD).
            const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const json = Buffer.from(padded, 'base64').toString('utf8');
            const claims = JSON.parse(json);
            const sub = String(claims?.sub || claims?.oid || claims?.upn || '');
            if (sub) {
                return crypto.createHash('sha256').update(sub).digest('hex').slice(0, 16);
            }
        }
    } catch { /* fall through */ }
    return crypto.createHash('sha256').update(String(assertion || '')).digest('hex').slice(0, 16);
}

/**
 * Exchange the user's existing OAuth assertion token for a Power BI
 * access token via the Azure AD On-Behalf-Of grant flow.
 *
 * @param {object} profile               PulsePlay profile (must have aadTenantId + aadClientId + aadClientSecret)
 * @param {string} userAssertion         The user's OAuth token (typically from `Authorization: Bearer …` header)
 * @param {function} [fetchImpl]         Test injection seam
 * @returns {Promise<string>}            User-delegated Power BI access token
 */
async function acquirePbiAccessTokenOnBehalfOf(profile, userAssertion, fetchImpl) {
    const tenant = _tenantId(profile);
    if (!tenant) throw new Error('Power BI profile missing aadTenantId');
    const client = _clientId(profile);
    if (!client) throw new Error('Power BI profile missing aadClientId (OBO requires confidential client)');
    const secret = _clientSecret(profile);
    if (!secret) throw new Error('Power BI profile missing aadClientSecret (OBO requires confidential client)');
    if (!userAssertion || typeof userAssertion !== 'string' || !userAssertion.trim()) {
        throw new Error('OBO requires the signed-in user OAuth assertion token');
    }

    const userKey = _hashUserAssertion(userAssertion);
    const key = `obo|${tenant}|${client}|${userKey}`;
    const f = fetchImpl || globalThis.fetch;
    const now = Date.now();
    const cached = _oboTokenCache.get(key);
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
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: userAssertion,
        requested_token_use: 'on_behalf_of',
        scope: 'https://analysis.windows.net/powerbi/api/Dataset.Read.All offline_access',
    }).toString();

    const inFlight = (async () => {
        const resp = await _fetchWithTransientRetry(f, tokenUrl, () => ({
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
        }), 'Azure AD OBO token request');
        if (!resp.ok) {
            const detail = (await resp.text()).slice(0, 300);
            // 400 typically means consent missing or assertion expired;
            // 401 means client credentials wrong. Either way the deployer
            // must fix configuration; we surface a clear message.
            const err = new Error(`Azure AD OBO token request failed (${resp.status}): ${detail}`);
            // @ts-expect-error attach status for callers
            err.statusCode = resp.status;
            throw err;
        }
        const data = await resp.json();
        if (!data?.access_token) throw new Error('Azure AD OBO response missing access_token');
        const expiresInSec = Number(data.expires_in || 3600);
        const entry = {
            accessToken: String(data.access_token),
            expiresAt: Date.now() + expiresInSec * 1000,
        };
        _oboTokenCache.set(key, entry);
        return entry.accessToken;
    })();

    _oboTokenCache.set(key, { ...(cached || {}), inFlight });
    try {
        return await inFlight;
    } catch (err) {
        _oboTokenCache.delete(key);
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
    const resp = await _fetchWithTransientRetry(f, url, () => ({
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
    }), 'Power BI dataset metadata fetch');
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
 * @param {{ fetchImpl?: function, impersonatedUserName?: string, userAssertion?: string }} [opts]
 *   - `userAssertion`: when present, takes the OBO path (user-delegated
 *     token). REQUIRED for querying RLS-enforced datasets — Microsoft's
 *     executeQueries API blocks Service Principal + RLS combos. The
 *     `impersonatedUserName` option is IGNORED in OBO mode (RLS applies
 *     natively to the user's identity in the access token).
 *   - `impersonatedUserName`: legacy SP-mode RLS hint (non-RLS datasets
 *     only). Use `userAssertion` for any RLS-enforced dataset.
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

    // 2026-05-22 spike: prefer OBO when the user assertion is available.
    // RLS applies natively to the user's identity in the access token, so
    // `impersonatedUserName` is ignored in OBO mode (Microsoft docs).
    const useObo = !!(opts.userAssertion && String(opts.userAssertion).trim());
    const token = useObo
        ? await acquirePbiAccessTokenOnBehalfOf(profile, opts.userAssertion, opts.fetchImpl)
        : await acquirePbiAccessToken(profile, opts.fetchImpl);
    const url = `${PBI_API_BASE}/v1.0/myorg/groups/${encodeURIComponent(groupId)}/datasets/${encodeURIComponent(datasetId)}/executeQueries`;
    const body = {
        queries: [{ query: daxQuery }],
        serializerSettings: { includeNulls: true },
        // impersonatedUserName is ONLY honored in non-OBO (Service Principal)
        // mode for non-RLS datasets. In OBO mode it's silently ignored.
        ...((!useObo && opts.impersonatedUserName) ? { impersonatedUserName: opts.impersonatedUserName } : {}),
    };
    const f = opts.fetchImpl || globalThis.fetch;
    const resp = await _fetchWithTransientRetry(f, url, () => ({
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(EXECUTE_QUERIES_TIMEOUT_MS),
    }), 'Power BI executeQueries');
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
 * @param {{ fetchImpl?: function, impersonatedUserName?: string, userAssertion?: string }} [opts]
 *   - `userAssertion`: prefer OBO (user-delegated). REQUIRED for RLS datasets.
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
    const resp = await _fetchWithTransientRetry(f, url, () => ({
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
    }), 'Power BI dataset GenerateToken');
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
    _oboTokenCache.clear();
}

module.exports = {
    acquirePbiAccessToken,
    acquirePbiAccessTokenOnBehalfOf,
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
        hashUserAssertion: _hashUserAssertion,
    },
    __resetCacheForTests,
};
