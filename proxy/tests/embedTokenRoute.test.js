'use strict';

/**
 * embedTokenRoute.test.js — Cycle A.
 *
 * Covers POST /assistant/embed-token/:vendor — currently only
 * vendor=powerbi. Drives the route via supertest with a mocked
 * Microsoft AAD + Power BI REST fetch implementation so we never
 * touch real Microsoft endpoints.
 *
 * Profile setup follows foundationRoute.test.js's pattern: NODE_ENV=test
 * makes cfg() re-merge env vars on every request, so profile fields can
 * be set via PROXY_PROFILE_<NAME>_<FIELD> env vars before requiring the
 * server.
 *
 * Coverage:
 *   • 200 happy path with mocked AAD + GenerateToken
 *   • Server-derived RLS identities only; browser-supplied identities rejected
 *   • Edit embed tokens denied by default and gated by profile policy
 *   • 503 when powerBi* fields are missing on the profile
 *   • 401/403 propagation when AAD or PBI returns auth failures
 *   • Cache hit on a second call within TTL (no re-fetch) and identity-safe cache slots
 *   • Single-flight: 5 concurrent requests produce 1 AAD fetch
 *   • Audit log entry created
 *   • Client secret NEVER appears in any response or log
 *   • 404 for an unsupported vendor
 *   • 400 when groupId / reportId are missing
 */

process.env.NODE_ENV = 'test';
process.env.PROXY_PROFILE_PBITEST_HOST = 'https://example.azuredatabricks.net';
process.env.PROXY_PROFILE_PBITEST_TOKEN = 'dapi_test_pbi_route';
process.env.PROXY_PROFILE_PBITEST_POWER_BI_CLIENT_ID = 'aad-client-id-uuid';
process.env.PROXY_PROFILE_PBITEST_POWER_BI_CLIENT_SECRET = 'AAD_CLIENT_SECRET_DO_NOT_LEAK';
process.env.PROXY_PROFILE_PBITEST_POWER_BI_TENANT_ID = 'aad-tenant-id-uuid';
// Provide a profile WITHOUT the powerBi* fields to test the 503 path.
process.env.PROXY_PROFILE_NOPBI_HOST = 'https://example2.azuredatabricks.net';
process.env.PROXY_PROFILE_NOPBI_TOKEN = 'dapi_test_no_pbi';
// SUPERVISOR_ENABLED off so it doesn't auto-inject a profile that confuses
// resolveProfile when no `default` is configured.
process.env.SUPERVISOR_ENABLED = 'false';

const request = require('supertest');
const {
    app,
    _setPowerBiFetchImplForTests,
    _resetPowerBiTokenCacheForTests,
} = require('../server');

// ── Fixture helpers ─────────────────────────────────────────────────────────

const SECRET_VALUE = 'AAD_CLIENT_SECRET_DO_NOT_LEAK';

function aadOkResponse() {
    return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ access_token: 'aad-access-token', expires_in: 3599, token_type: 'Bearer' }),
    };
}
function pbiOkResponse(token = 'pbi-embed-token-zzz') {
    return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
            token,
            tokenId: 'tok-id-1',
            expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
    };
}
function authFailResponse(status, message) {
    return {
        ok: false,
        status,
        text: async () => message,
        json: async () => ({ error: message }),
    };
}

// Each test installs its own fetch impl that records calls.
function makeFetchRecorder(seq) {
    const calls = [];
    const responses = seq.slice();
    const impl = async (url, init) => {
        calls.push({ url: String(url), init });
        if (responses.length === 0) {
            throw new Error(`Unexpected fetch (${calls.length}) — no fixture queued`);
        }
        const next = responses.shift();
        if (typeof next === 'function') return next(url, init);
        return next;
    };
    return { impl, calls };
}

// Suppress audit log noise but capture what's logged so we can grep for
// secret leaks.
let logSpy, errSpy, warnSpy;
let capturedLog = [];
beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
        capturedLog.push(args.map(String).join(' '));
    });
    errSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
        capturedLog.push(args.map(String).join(' '));
    });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation((...args) => {
        capturedLog.push(args.map(String).join(' '));
    });
});
afterAll(() => {
    logSpy?.mockRestore();
    errSpy?.mockRestore();
    warnSpy?.mockRestore();
});
beforeEach(() => {
    capturedLog = [];
    _resetPowerBiTokenCacheForTests();
});
afterEach(() => {
    _setPowerBiFetchImplForTests(null);
    delete process.env.PROXY_PROFILE_PBITEST_POWER_BI_ALLOW_EDIT;
    delete process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_ENABLED;
    delete process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_REQUIRED;
    delete process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_USERNAME;
    delete process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_USERNAME_CLAIM;
    delete process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_ROLES;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /assistant/embed-token/powerbi — happy path', () => {
    test('200 with embedToken + embedUrl + ISO expiry; correct AAD + PBI calls', async () => {
        const { impl, calls } = makeFetchRecorder([aadOkResponse(), pbiOkResponse('embed-tkn-1')]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                permissions: 'View',
            });

        expect(res.status).toBe(200);
        expect(res.body.embedToken).toBe('embed-tkn-1');
        expect(res.body.embedUrl).toContain('reportEmbed?');
        expect(res.body.embedUrl).toContain('reportId=rep-uuid');
        expect(res.body.embedUrl).toContain('groupId=wsp-uuid');
        expect(typeof res.body.expiry).toBe('string');
        expect(res.body.cached).toBe(false);

        // First call is AAD; body must include the client_credentials grant +
        // the right scope.
        expect(calls).toHaveLength(2);
        expect(calls[0].url).toContain('login.microsoftonline.com/aad-tenant-id-uuid/oauth2/v2.0/token');
        expect(String(calls[0].init.body)).toContain('grant_type=client_credentials');
        expect(String(calls[0].init.body)).toContain('scope=https%3A%2F%2Fanalysis.windows.net%2Fpowerbi%2Fapi%2F.default');

        // Second call is GenerateToken with the AAD bearer token.
        expect(calls[1].url).toBe('https://api.powerbi.com/v1.0/myorg/groups/wsp-uuid/reports/rep-uuid/GenerateToken');
        expect(calls[1].init.headers.Authorization).toBe('Bearer aad-access-token');
        const pbiBody = JSON.parse(calls[1].init.body);
        expect(pbiBody.accessLevel).toBe('View');
    });

    test('Edit accessLevel is denied unless the profile explicitly opts in', async () => {
        let attempted = false;
        _setPowerBiFetchImplForTests(async () => {
            attempted = true;
            throw new Error('should not fetch');
        });

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                permissions: 'Edit',
            });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Edit embed tokens are disabled/);
        expect(attempted).toBe(false);
    });

    test('Edit accessLevel propagates only when the profile opts in', async () => {
        process.env.PROXY_PROFILE_PBITEST_POWER_BI_ALLOW_EDIT = 'true';
        const { impl, calls } = makeFetchRecorder([aadOkResponse(), pbiOkResponse('embed-tkn-edit')]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                permissions: 'Edit',
            });
        expect(res.status).toBe(200);
        const pbiBody = JSON.parse(calls[1].init.body);
        expect(pbiBody.accessLevel).toBe('Edit');
    });

    test('client-supplied identities are rejected before any Microsoft call', async () => {
        let attempted = false;
        _setPowerBiFetchImplForTests(async () => {
            attempted = true;
            throw new Error('should not fetch');
        });

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                datasetId: 'ds-uuid',
                identities: [{ username: 'alice@example.com', roles: ['Sales'], datasets: ['ds-uuid'] }],
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/client-supplied identity/i);
        expect(attempted).toBe(false);
    });

    test('datasetId + server-configured RLS identity flow through to PBI body', async () => {
        process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_USERNAME = 'alice@example.com';
        process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_ROLES = 'Sales, West';
        const { impl, calls } = makeFetchRecorder([aadOkResponse(), pbiOkResponse('embed-tkn-rls')]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                datasetId: 'ds-uuid',
            });
        expect(res.status).toBe(200);
        const pbiBody = JSON.parse(calls[1].init.body);
        expect(pbiBody.datasetId).toBe('ds-uuid');
        expect(pbiBody.identities).toBeDefined();
        expect(pbiBody.identities[0].username).toBe('alice@example.com');
        expect(pbiBody.identities[0].datasets).toEqual(['ds-uuid']);
        expect(pbiBody.identities[0].roles).toEqual(['Sales', 'West']);
    });
});

describe('POST /assistant/embed-token/powerbi — 503 when not configured', () => {
    test('503 with explicit "not configured" error when powerBi* fields are missing', async () => {
        // Ensure no fetch is ever attempted.
        let attempted = false;
        _setPowerBiFetchImplForTests(async () => { attempted = true; throw new Error('should not fetch'); });

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'nopbi',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
            });
        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/not configured/);
        expect(res.body.error).toMatch(/powerBiClientId/);
        expect(attempted).toBe(false);
    });
});

describe('POST /assistant/embed-token/powerbi — auth failure propagation', () => {
    test('401 from AAD propagates as 401', async () => {
        const { impl, calls } = makeFetchRecorder([authFailResponse(401, 'invalid_client')]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
            });
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/embed-token issuance failed/);
        expect(calls).toHaveLength(1);
    });

    test('403 from PBI GenerateToken propagates as 403', async () => {
        const { impl } = makeFetchRecorder([
            aadOkResponse(),
            authFailResponse(403, 'PowerBINotAuthorizedException'),
        ]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
            });
        expect(res.status).toBe(403);
    });

    test('5xx from AAD becomes 502 (we got an upstream error)', async () => {
        const { impl } = makeFetchRecorder([authFailResponse(500, 'azure-down')]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
            });
        expect(res.status).toBe(502);
    });
});

describe('POST /assistant/embed-token/powerbi — cache + single-flight', () => {
    test('cache hit on second call within TTL — only one AAD round-trip', async () => {
        const { impl, calls } = makeFetchRecorder([aadOkResponse(), pbiOkResponse('cached-token')]);
        _setPowerBiFetchImplForTests(impl);

        const first = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' });
        expect(first.status).toBe(200);
        expect(first.body.cached).toBe(false);
        expect(calls).toHaveLength(2);

        const second = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' });
        expect(second.status).toBe(200);
        expect(second.body.cached).toBe(true);
        expect(second.body.embedToken).toBe('cached-token');
        // No new AAD or PBI calls — still the original 2.
        expect(calls).toHaveLength(2);
    });

    test('a near-expiry cached token is NOT served — it re-mints (60s buffer guard)', async () => {
        // First mint returns a token that expires in 30s — INSIDE the 60s
        // EMBED_TOKEN_BUFFER_MS window. The hot path requires
        // expiry > now + 60s, so the second call must re-mint rather than
        // serve the about-to-expire token. This pins the stale-token guard:
        // expiry is read from the mint response (PBI `expiration`), and a
        // token within the buffer is treated as already-stale.
        const pbiExpiringSoon = (token) => ({
            ok: true,
            status: 200,
            text: async () => '',
            json: async () => ({
                token,
                tokenId: 'tok-id-soon',
                expiration: new Date(Date.now() + 30 * 1000).toISOString(), // 30s < 60s buffer
            }),
        });
        const { impl, calls } = makeFetchRecorder([
            aadOkResponse(), pbiExpiringSoon('near-expiry-token'),
            aadOkResponse(), pbiOkResponse('fresh-token'),
        ]);
        _setPowerBiFetchImplForTests(impl);

        const first = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' });
        expect(first.status).toBe(200);
        expect(first.body.cached).toBe(false);
        expect(first.body.embedToken).toBe('near-expiry-token');
        expect(calls).toHaveLength(2);

        const second = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' });
        expect(second.status).toBe(200);
        // The near-expiry token was NOT served; a fresh AAD + PBI round-trip ran.
        expect(second.body.cached).toBe(false);
        expect(second.body.embedToken).toBe('fresh-token');
        expect(calls).toHaveLength(4);
    });

    test('different accessLevel uses a different cache slot', async () => {
        process.env.PROXY_PROFILE_PBITEST_POWER_BI_ALLOW_EDIT = 'true';
        const { impl, calls } = makeFetchRecorder([
            aadOkResponse(), pbiOkResponse('view-token'),
            aadOkResponse(), pbiOkResponse('edit-token'),
        ]);
        _setPowerBiFetchImplForTests(impl);

        const v = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid', permissions: 'View' });
        expect(v.body.embedToken).toBe('view-token');

        const e = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid', permissions: 'Edit' });
        expect(e.body.embedToken).toBe('edit-token');
        expect(calls).toHaveLength(4);
    });

    test('different server-derived RLS identities use different cache slots', async () => {
        const { impl, calls } = makeFetchRecorder([
            aadOkResponse(), pbiOkResponse('alice-token'),
            aadOkResponse(), pbiOkResponse('bob-token'),
        ]);
        _setPowerBiFetchImplForTests(impl);

        process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_USERNAME = 'alice@example.com';
        const first = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                datasetId: 'ds-uuid',
            });
        expect(first.status).toBe(200);
        expect(first.body.embedToken).toBe('alice-token');
        expect(first.body.cached).toBe(false);

        process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_USERNAME = 'bob@example.com';
        const second = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                datasetId: 'ds-uuid',
            });
        expect(second.status).toBe(200);
        expect(second.body.embedToken).toBe('bob-token');
        expect(second.body.cached).toBe(false);
        expect(calls).toHaveLength(4);

        const firstPbiBody = JSON.parse(calls[1].init.body);
        const secondPbiBody = JSON.parse(calls[3].init.body);
        expect(firstPbiBody.identities[0].username).toBe('alice@example.com');
        expect(secondPbiBody.identities[0].username).toBe('bob@example.com');
    });

    test('5 concurrent calls share a single AAD round-trip (single-flight)', async () => {
        // Use a deferred promise for the AAD response so all 5 requests
        // race in flight at the same time.
        let resolveAad;
        const aadPromise = new Promise(resolve => { resolveAad = resolve; });
        let aadCallCount = 0;
        let pbiCallCount = 0;

        _setPowerBiFetchImplForTests(async (url) => {
            const u = String(url);
            if (u.includes('login.microsoftonline.com')) {
                aadCallCount++;
                await aadPromise;
                return aadOkResponse();
            }
            if (u.includes('GenerateToken')) {
                pbiCallCount++;
                return pbiOkResponse('shared-token');
            }
            throw new Error('unexpected ' + u);
        });

        // Fire 5 simultaneous requests for the same key.
        const promises = Array.from({ length: 5 }, () =>
            request(app)
                .post('/assistant/embed-token/powerbi')
                .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' })
        );

        // Tick once so all 5 reach the AAD await.
        await new Promise(r => setImmediate(r));
        // Now release the AAD response.
        resolveAad();
        const responses = await Promise.all(promises);

        for (const r of responses) {
            expect(r.status).toBe(200);
            expect(r.body.embedToken).toBe('shared-token');
        }
        // Single-flight contract: exactly one AAD round-trip + one PBI round-trip.
        expect(aadCallCount).toBe(1);
        expect(pbiCallCount).toBe(1);
    });
});

describe('POST /assistant/embed-token/powerbi — audit log', () => {
    test('audit log entry created on success (action=embed-token, status=200)', async () => {
        const { impl } = makeFetchRecorder([aadOkResponse(), pbiOkResponse('audit-token')]);
        _setPowerBiFetchImplForTests(impl);

        await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' });

        const auditLines = capturedLog.filter(l => l.includes('[audit]') && l.includes('embed-token'));
        expect(auditLines.length).toBeGreaterThan(0);
        const line = auditLines.join('\n');
        expect(line).toMatch(/"action":"embed-token"/);
        expect(line).toMatch(/"status":200/);
        expect(line).toMatch(/"profile":"pbitest"/);
        // SP identity hash is included (in detail's nested JSON, hence escaped quotes).
        expect(line).toMatch(/spIdHash\\?":\\?"sp:[a-f0-9]{12}\\?"/);
    });

    test('audit log entry created on 503 (creds missing)', async () => {
        await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'nopbi', groupId: 'wsp-uuid', reportId: 'rep-uuid' });

        const auditLines = capturedLog.filter(l => l.includes('[audit]') && l.includes('embed-token'));
        expect(auditLines.length).toBeGreaterThan(0);
        expect(auditLines.join('\n')).toMatch(/"status":503/);
    });
});

describe('POST /assistant/embed-token/powerbi — secret never leaks', () => {
    test('client secret never appears in success response or log', async () => {
        const { impl } = makeFetchRecorder([aadOkResponse(), pbiOkResponse('safe-token')]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' });
        const responseSerialized = JSON.stringify(res.body);
        expect(responseSerialized).not.toContain(SECRET_VALUE);
        expect(capturedLog.join('\n')).not.toContain(SECRET_VALUE);
    });

    test('client secret never appears in error response or log when AAD rejects', async () => {
        // Even if AAD echoes back the "client_secret" string in an error
        // (it does not — but we test the redaction path is in place), our
        // route must not propagate it.
        const { impl } = makeFetchRecorder([
            authFailResponse(401, 'AADSTS70011: invalid request — note the secret was not echoed'),
        ]);
        _setPowerBiFetchImplForTests(impl);

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid', reportId: 'rep-uuid' });
        expect(res.status).toBe(401);
        const responseSerialized = JSON.stringify(res.body);
        expect(responseSerialized).not.toContain(SECRET_VALUE);
        expect(capturedLog.join('\n')).not.toContain(SECRET_VALUE);
    });
});

describe('POST /assistant/embed-token/:vendor — input validation', () => {
    test('404 for unsupported vendor (e.g. tableau)', async () => {
        const res = await request(app)
            .post('/assistant/embed-token/tableau')
            .send({ assistantProfile: 'pbitest', someThing: 'x' });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not implemented/);
    });

    test('400 when groupId is missing', async () => {
        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', reportId: 'rep-uuid' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/groupId and reportId/);
    });

    test('400 when reportId is missing', async () => {
        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({ assistantProfile: 'pbitest', groupId: 'wsp-uuid' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/groupId and reportId/);
    });

    test('400 when effectiveIdentity is supplied by the client', async () => {
        let attempted = false;
        _setPowerBiFetchImplForTests(async () => {
            attempted = true;
            throw new Error('should not fetch');
        });

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
                effectiveIdentity: { username: 'mallory@example.com' },
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/client-supplied identity/i);
        expect(attempted).toBe(false);
    });

    test('400 when server-side RLS is enabled but datasetId is missing', async () => {
        process.env.PROXY_PROFILE_PBITEST_POWER_BI_RLS_USERNAME = 'alice@example.com';
        let attempted = false;
        _setPowerBiFetchImplForTests(async () => {
            attempted = true;
            throw new Error('should not fetch');
        });

        const res = await request(app)
            .post('/assistant/embed-token/powerbi')
            .send({
                assistantProfile: 'pbitest',
                groupId: 'wsp-uuid',
                reportId: 'rep-uuid',
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/datasetId is required/);
        expect(attempted).toBe(false);
    });
});
