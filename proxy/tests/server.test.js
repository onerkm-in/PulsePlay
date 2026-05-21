'use strict';

/**
 * Integration tests for proxy/server.js
 *
 * Strategy:
 *  - fs.readFileSync is mocked (Jest hoisting) so cfg() returns controlled config.
 *  - fs.appendFileSync is mocked so feedback-log writes are captured, not real.
 *  - https/http.request is NOT mocked in unit-level tests; routes that would
 *    reach Databricks are tested for request-routing correctness only (no real
 *    network calls). Integration-style "full request" tests mock the Databricks
 *    layer via the returned spy functions.
 */

// ── Config mock ────────────────────────────────────────────────────────────────
const MOCK_CONFIG_BASE = {
    port: 0,
    profiles: {
        default: {
            host: 'https://test.azuredatabricks.net',
            token: 'dapi-test-token-abc',
            spaceId: 'space-default-123',
        },
        analytics: {
            host: 'https://analytics.azuredatabricks.net',
            token: 'dapi-analytics-token',
            spaceId: 'space-analytics-456',
        },
    },
};

// Mock fs BEFORE requiring server so cfg() gets our mock config on load.
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        existsSync: jest.fn((filePath) =>
            String(filePath).endsWith('config.json') ? true : actual.existsSync(filePath)
        ),
        readFileSync: jest.fn().mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)),
        appendFileSync: jest.fn(),
    };
});

// @azure/identity is optional — mock it as absent (PAT-only mode for tests).
jest.mock('@azure/identity', () => { throw new Error('not installed'); }, { virtual: true });

const mockGetCapabilities = jest.fn(async ({ profile, profileName }) => ({
    ok: true,
    assistantProfile: profileName || 'default',
    spaceId: profile?.spaceId || '',
    profile: {
        name: profileName || 'default',
        host: profile?.host || '',
        spaceId: profile?.spaceId || '',
        warehouseId: profile?.warehouseId || '',
        type: profile?.type || 'genie',
    },
    capabilities: {
        genie: true,
        lakeview: false,
        servingEndpoints: false,
        apps: false,
        vectorSearch: false,
        jobs: false,
    },
    details: {},
    counts: {},
    ttlMs: 300000,
    fetchedAt: '2026-05-17T00:00:00.000Z',
    cacheExpiresAt: '2026-05-17T00:05:00.000Z',
    cached: false,
}));

jest.mock('../lib/databricksCapabilityRegistry', () => ({
    getCapabilities: mockGetCapabilities,
    reset: jest.fn(),
}));

const request = require('supertest');
const {
    app,
    conversationMap,
    normalizeGenieResponse,
    loadEnvProfiles,
    isTransientNetError,
    handleUnexpectedProxyError,
    RENDERABLE_BACKEND_GOVERNANCE,
    governanceSubjectRefForRequest,
    governanceForBackend,
    withGovernance,
    safeStreamErrorText,
} = require('../server');
const { UNEXPECTED_INTERNAL_SENTINEL } = require('../lib/problemDetails');
const fs = require('fs');

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Override the fs mock to return a different config for one test block. */
function withConfig(overrides, fn) {
    const merged = JSON.stringify({ ...MOCK_CONFIG_BASE, ...overrides });
    beforeEach(() => fs.readFileSync.mockReturnValue(merged));
    afterEach(() => fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)));
    fn();
}

async function withEnv(overrides, fn) {
    const previous = {};
    for (const key of Object.keys(overrides)) {
        previous[key] = process.env[key];
        if (overrides[key] === undefined) delete process.env[key];
        else process.env[key] = overrides[key];
    }
    try {
        return await fn();
    } finally {
        for (const key of Object.keys(overrides)) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
}

// H2 — suppress expected console.error/warn noise from negative-path tests
// (auth failures, malformed responses, etc.) so real failures stand out in CI
// logs. Restored after the suite. Tests that need to assert on a specific
// log line can locally `jest.spyOn(console, 'error')` again — these spies
// don't block re-mocking.
let _consoleErrorSpy;
let _consoleWarnSpy;
let _consoleLogSpy;
beforeAll(() => {
    _consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    _consoleWarnSpy  = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // [audit] log() lines are not test-relevant — silence them too.
    _consoleLogSpy   = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
    _consoleErrorSpy?.mockRestore();
    _consoleWarnSpy?.mockRestore();
    _consoleLogSpy?.mockRestore();
});

beforeEach(() => {
    conversationMap.clear();
});

// ── G3 governance route registry ─────────────────────────────────────────────
describe('G3 renderable backend governance registry', () => {
    const expectedBackendIds = [
        'genie',
        'azure-openai-chat',
        'azure-openai-analytics',
        'bedrock-rag',
        'bedrock-direct',
        'foundation-model',
        'supervisor',
        'supervisor-local',
        'responses-agent',
        'powerbi-semantic-model',
        // SS2 — proxy-backed shell smoke. Dev/test only; `authority: "mock"`
        // is rejected by buildGovernanceAttestation in production.
        'smoke-fixture',
    ];

    it('declares every renderable backend path exactly once', () => {
        expect(Object.keys(RENDERABLE_BACKEND_GOVERNANCE).sort()).toEqual([...expectedBackendIds].sort());
    });

    it('stamps a valid attestation for every registered backend', () => {
        for (const backendId of expectedBackendIds) {
            const payload = withGovernance(
                { requestId: `req-${backendId}`, headers: {}, pulseClient: { clientApp: 'pulseplay' } },
                { type: backendId },
                backendId,
                { status: 'COMPLETED', content: 'ok' },
            );
            expect(payload.governance).toMatchObject({
                enforced: true,
                authority: RENDERABLE_BACKEND_GOVERNANCE[backendId].authority,
                subjectRef: 'local-dev',
                requestId: `req-${backendId}`,
                policyVersion: 'g3-v1',
            });
        }
    });

    it('refuses unknown backend ids so new routes cannot silently skip mapping', () => {
        expect(() => governanceForBackend({ requestId: 'req-1', headers: {} }, {}, 'new-backend'))
            .toThrow(/No governance mapping registered/);
    });

    it('does not let route-local extras override registry-owned attestation fields', () => {
        const attestation = governanceForBackend(
            { requestId: 'req-real', headers: {}, user: { email: 'viewer@example.com' } },
            {},
            'bedrock-direct',
            {
                authority: 'unity-catalog',
                subjectRef: 'spoofed-user',
                requestId: 'spoofed-request',
                policyVersion: 'spoofed-policy',
                enforced: false,
                cacheHit: true,
            },
        );
        expect(attestation).toMatchObject({
            enforced: true,
            authority: 'warehouse',
            requestId: 'req-real',
            policyVersion: 'g3-v1',
            cacheHit: true,
        });
        expect(attestation.subjectRef).toMatch(/^user:[a-f0-9]{12}$/);
        expect(attestation.subjectRef).not.toBe('spoofed-user');
    });

    it('hashes verified user identifiers instead of echoing PII', () => {
        const subjectRef = governanceSubjectRefForRequest(
            { user: { email: 'person@example.com' }, headers: {} },
            {},
        );
        expect(subjectRef).toMatch(/^user:[a-f0-9]{12}$/);
        expect(subjectRef).not.toContain('person');
        expect(subjectRef).not.toContain('@');
    });
});

// ── /health ────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
    it('returns 200 with profile names', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.profiles).toEqual(expect.arrayContaining(['default', 'analytics']));
    });

    it('reports the effective authMode (IDEA-015)', async () => {
        const res = await request(app).get('/health');
        // No auth env var and no sharedKey in MOCK_CONFIG_BASE.
        expect(res.body.authMode).toBe('none');
    });

    it('echoes PX1 client identity and request id without auth', async () => {
        const res = await request(app)
            .get('/health')
            .set('X-Pulse-Client', 'pulse-pbi')
            .set('X-Pulse-Client-Version', '3.4.5 beta')
            .set('X-Pulse-Request-Id', 'pulse rid<>');

        expect(res.status).toBe(200);
        expect(res.headers['x-request-id']).toBe('pulserid');
        expect(res.headers['x-pulse-request-id']).toBe('pulserid');
        expect(res.headers['x-pulse-client']).toBe('pulse-pbi');
        expect(res.body.client).toEqual({
            app: 'pulse-pbi',
            version: '3.4.5beta',
            requestId: 'pulserid',
        });
    });

    it('filters _doc_* keys out of the public profile list (BUG-013 + IDEA-015)', async () => {
        // mockReturnValueOnce to avoid leaking the mutated config into
        // downstream tests in this file (the existing withConfig helper
        // uses beforeEach/afterEach for the same reason).
        fs.readFileSync.mockReturnValueOnce(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                ...MOCK_CONFIG_BASE.profiles,
                _doc_displayName: 'docs only',
            },
        }));
        const res = await request(app).get('/health');
        expect(res.body.profiles).not.toContain('_doc_displayName');
        expect(res.body.profiles).toEqual(expect.arrayContaining(['default', 'analytics']));
    });
});

// ── /clients/compatibility ───────────────────────────────────────────────────
describe('GET /clients/compatibility', () => {
    it.each([
        ['pulseplay', 'top-level-browser', false],
        ['pulse-pbi', 'power-bi-custom-visual', true],
        ['pulseplay-desktop', 'desktop-portable', false],
    ])('returns PX1 contract metadata for %s', async (clientApp, host, powerBiSandbox) => {
        const res = await request(app)
            .get('/clients/compatibility')
            .set('X-Pulse-Client', clientApp)
            .set('X-Pulse-Client-Version', '1.2.3')
            .set('X-Request-Id', `rid-${clientApp}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            ok: true,
            contractVersion: 'px1',
            client: {
                app: clientApp,
                version: '1.2.3',
                requestId: `rid-${clientApp}`,
            },
            compatibility: {
                host,
                powerBiSandbox,
                xhrSafe: true,
            },
            notes: {
                singleProxyContract: true,
            },
        });
        expect(res.body.supportedClients).toEqual(['pulseplay', 'pulse-pbi', 'pulseplay-desktop']);
        expect(res.body.requestHeaders).toContain('X-Pulse-Client');
        expect(res.body.responseHeaders).toContain('X-Pulse-Client');
    });

    it('normalizes unknown clients to unknown rather than trusting arbitrary header values', async () => {
        const res = await request(app)
            .get('/clients/compatibility')
            .set('X-Pulse-Client', 'rogue-tool');

        expect(res.status).toBe(200);
        expect(res.body.client.app).toBe('unknown');
        expect(res.body.compatibility.host).toBe('unknown');
        expect(res.headers['x-pulse-client']).toBe('unknown');
    });
});

// ── /admin/health-summary (M1) ─────────────────────────────────────────────────
describe('GET /admin/health-summary', () => {
    it('returns 200 with the expected counter shape', async () => {
        const res = await request(app).get('/admin/health-summary');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body).toHaveProperty('startedAt');
        expect(res.body).toHaveProperty('uptimeSec');
        expect(res.body).toHaveProperty('totalAudited');
        expect(res.body).toHaveProperty('byStatusClass');
        expect(res.body).toHaveProperty('byAction');
        expect(res.body).toHaveProperty('byProfile');
        expect(Array.isArray(res.body.recentErrors)).toBe(true);
        expect(res.body).toHaveProperty('memoryMb');
        expect(res.body).toHaveProperty('nodeVersion');
    });

    it('rejects calls without the shared key when one is configured', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            sharedKey: 'super-secret-key',
        }));
        try {
            const res = await request(app).get('/admin/health-summary');
            expect(res.status).toBe(401);
        } finally {
            fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        }
    });

    it('accepts calls with a matching shared key', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            sharedKey: 'super-secret-key',
        }));
        try {
            const res = await request(app)
                .get('/admin/health-summary')
                .set('x-genie-key', 'super-secret-key');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        } finally {
            fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        }
    });

    it('accepts calls with the canonical X-PulsePlay-Key header', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            sharedKey: 'super-secret-key',
        }));
        try {
            const res = await request(app)
                .get('/admin/health-summary')
                .set('X-PulsePlay-Key', 'super-secret-key');
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        } finally {
            fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        }
    });

    it('rejects admin access when PROXY_AUTH_MODE=idp has no verified user', async () => {
        await withEnv({ PROXY_AUTH_MODE: 'idp' }, async () => {
            const res = await request(app).get('/admin/health-summary');
            expect(res.status).toBe(401);
        });
    });

    it('applies the same canonical-key gate to query-history', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            sharedKey: 'super-secret-key',
        }));
        try {
            const rejected = await request(app).get('/admin/query-history?profile=missing-profile');
            expect(rejected.status).toBe(401);

            const accepted = await request(app)
                .get('/admin/query-history?profile=missing-profile')
                .set('X-PulsePlay-Key', 'super-secret-key');
            expect(accepted.status).toBe(400);
            expect(accepted.body.error).toMatch(/Unknown profile/);
        } finally {
            fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        }
    });
});

// ── Transient network error detection (long-poll keep-alive ECONNRESET fix) ──
describe('isTransientNetError', () => {
    it('flags ECONNRESET by error code', () => {
        const e = new Error('read ECONNRESET');
        e.code = 'ECONNRESET';
        expect(isTransientNetError(e)).toBe(true);
    });

    it('flags ECONNRESET by message when code is missing', () => {
        expect(isTransientNetError(new Error('read ECONNRESET'))).toBe(true);
    });

    it('flags socket hang up', () => {
        expect(isTransientNetError(new Error('socket hang up'))).toBe(true);
    });

    it('flags ETIMEDOUT, EPIPE, EAI_AGAIN, ECONNREFUSED by code', () => {
        for (const code of ['ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ECONNREFUSED']) {
            const e = new Error('boom'); e.code = code;
            expect(isTransientNetError(e)).toBe(true);
        }
    });

    it('does NOT flag application errors (e.g. 401, 403, 500)', () => {
        expect(isTransientNetError(new Error('Databricks 401: unauthorized'))).toBe(false);
        expect(isTransientNetError(new Error('Databricks 500: internal'))).toBe(false);
    });

    it('handles null / undefined safely', () => {
        expect(isTransientNetError(null)).toBe(false);
        expect(isTransientNetError(undefined)).toBe(false);
    });
});

// ── CORS headers ──────────────────────────────────────────────────────────────
describe('CORS headers', () => {
    it('sets permissive CORS on every response', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.headers['access-control-allow-methods']).toMatch(/GET/);
        expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    });

    it('handles OPTIONS preflight with 204', async () => {
        const res = await request(app).options('/assistant/capabilities');
        expect(res.status).toBe(204);
    });
});

// ── Problem Details foundation (Slice 1b) ────────────────────────────────────
describe('Problem Details foundation', () => {
    it('returns application/problem+json for malformed JSON before auth runs', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start')
            .set('Content-Type', 'application/json')
            .set('X-Request-Id', 'bad id<>')
            .send('{"content":');

        expect(res.status).toBe(400);
        expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
        expect(res.headers['x-request-id']).toBe('badid');
        expect(res.body).toMatchObject({
            type: 'https://pulseplay.local/problems/invalid-json',
            title: 'Invalid JSON body',
            status: 400,
            code: 'INVALID_JSON',
            category: 'validation',
            requestId: 'badid',
            error: 'The request body is not valid JSON. Fix the JSON syntax and try again.',
        });
        expect(res.body.supportCode).toMatch(/^INVALID_JSON-/);
    });

    it('keeps the unexpected fallback as the final Express middleware', () => {
        const stack = (app._router && app._router.stack) || (app.router && app.router.stack) || [];
        const finalLayer = stack[stack.length - 1];
        expect(finalLayer.handle.name).toBe('handleUnexpectedProxyError');
    });

    it('turns uncaught errors into a safe 500 problem envelope', () => {
        const err = new Error('boom dapi12345678901234567890 client_secret=do-not-leak');
        const req = {
            headers: { 'x-request-id': 'rid-500' },
            method: 'POST',
            originalUrl: '/assistant/fail',
        };
        const problemPayloads = [];
        const res = {
            headersSent: false,
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            type: jest.fn().mockReturnThis(),
            json: jest.fn(body => { problemPayloads.push(body); return body; }),
        };
        const next = jest.fn();

        handleUnexpectedProxyError(err, req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.type).toHaveBeenCalledWith('application/problem+json');
        expect(problemPayloads[0]).toMatchObject({
            title: 'Unexpected proxy error',
            status: 500,
            code: 'UNEXPECTED_PROXY_ERROR',
            category: 'unexpected_internal',
            detail: UNEXPECTED_INTERNAL_SENTINEL,
            error: UNEXPECTED_INTERNAL_SENTINEL,
            requestId: 'rid-500',
        });
        expect(JSON.stringify(problemPayloads[0])).not.toContain('do-not-leak');
        expect(JSON.stringify(problemPayloads[0])).not.toContain('dapi12345678901234567890');
    });

    it('passes streaming failures through when headers were already sent', () => {
        const err = new Error('stream already started');
        const req = { headers: {}, method: 'GET', originalUrl: '/supervisor/stream' };
        const res = { headersSent: true };
        const next = jest.fn();

        handleUnexpectedProxyError(err, req, res, next);

        expect(next).toHaveBeenCalledWith(err);
    });
});

// ── /assistant/capabilities ───────────────────────────────────────────────────
describe('GET /assistant/capabilities', () => {
    it('returns profile info for known profile', async () => {
        const res = await request(app)
            .get('/assistant/capabilities?assistantProfile=default');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.spaceId).toBe('space-default-123');
        expect(res.body.capabilities.genie).toBe(true);
        expect(res.body.capabilities.vectorSearch).toBe(false);
    });

    it('returns profile info for named analytics profile', async () => {
        const res = await request(app)
            .get('/assistant/capabilities?assistantProfile=analytics');
        expect(res.status).toBe(200);
        expect(res.body.assistantProfile).toBe('analytics');
    });

    it('returns 404 for unknown profile', async () => {
        const res = await request(app)
            .get('/assistant/capabilities?assistantProfile=nonexistent');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/No matching profile/i);
    });

    it('resolves analytics profile via X-Genie-Target-Host host matching', async () => {
        const res = await request(app)
            .get('/assistant/capabilities')
            .set('X-Genie-Target-Host', 'https://analytics.azuredatabricks.net');
        expect(res.status).toBe(200);
        expect(res.body.spaceId).toBe('space-analytics-456');
    });

    it('resolves via X-Genie-Target-Host header when no profile param', async () => {
        const res = await request(app)
            .get('/assistant/capabilities')
            .set('X-Genie-Target-Host', 'https://test.azuredatabricks.net');
        expect(res.status).toBe(200);
    });

    it('falls back to default profile when host header has no match', async () => {
        // profileByName(undefined) returns null, profileByHost tries host matching.
        // Unknown host falls through to default profile.
        const res = await request(app)
            .get('/assistant/capabilities')
            .set('X-Genie-Target-Host', 'https://unknown.azuredatabricks.net');
        // Falls through to default profile — 200, not 404
        expect(res.status).toBe(200);
        expect(res.body.spaceId).toBe('space-default-123');
    });

    it('returns 404 only when no profile AND no default profile exists', async () => {
        fs.readFileSync.mockReturnValueOnce(JSON.stringify({
            port: 0,
            profiles: {
                analytics: { host: 'https://analytics.azuredatabricks.net', token: 'tok', spaceId: 's1' }
            }
        }));
        // No default profile, no matching named profile param → 404
        const res = await request(app)
            .get('/assistant/capabilities?assistantProfile=ghost');
        expect(res.status).toBe(404);
    });
});

// ── /assistant/home ───────────────────────────────────────────────────────────
describe('POST /assistant/home', () => {
    it('returns empty payload with generatedBy=proxy', async () => {
        const res = await request(app)
            .post('/assistant/home')
            .send({ assistantProfile: 'default', userMode: 'manager' });
        expect(res.status).toBe(200);
        expect(res.body.generatedBy).toBe('proxy');
        expect(Array.isArray(res.body.snapshot)).toBe(true);
        expect(Array.isArray(res.body.suggestedActions)).toBe(true);
    });

    it('returns default profile when no profile specified', async () => {
        const res = await request(app)
            .post('/assistant/home')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.generatedBy).toBe('proxy');
    });

    it('returns correct assistantProfile in response', async () => {
        const res = await request(app)
            .post('/assistant/home')
            .send({ assistantProfile: 'analytics' });
        expect(res.status).toBe(200);
        expect(res.body.assistantProfile).toBe('analytics');
    });
});

// ── /feedback ────────────────────────────────────────────────────────────────
describe('POST /feedback', () => {
    it('always returns 200 ok', async () => {
        const res = await request(app)
            .post('/feedback')
            .send({ rating: 'up', question: 'What is sales?', answer: 'Sales is 100K.' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('does not write log when feedbackLog not configured', async () => {
        fs.appendFileSync.mockClear();
        await request(app).post('/feedback').send({ rating: 'down' });
        expect(fs.appendFileSync).not.toHaveBeenCalled();
    });

    it('writes feedback log entry when feedbackLog is configured', async () => {
        fs.readFileSync.mockReturnValue(
            JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: 'feedback.jsonl' })
        );
        fs.appendFileSync.mockClear();
        await request(app).post('/feedback').send({ rating: 'up', question: 'Test?' });
        fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
        const [logPath, entry] = fs.appendFileSync.mock.calls[0];
        expect(logPath).toMatch(/feedback\.jsonl$/);
        const parsed = JSON.parse(entry.replace(/\n$/, ''));
        expect(parsed.rating).toBe('up');
        expect(parsed.question).toBe('Test?');
        expect(parsed.ts).toBeTruthy();
    });

    it('prevents directory traversal in feedback log path', async () => {
        fs.readFileSync.mockReturnValue(
            JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: '../../etc/passwd' })
        );
        fs.appendFileSync.mockClear();
        await request(app).post('/feedback').send({ rating: 'up' });
        fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        if (fs.appendFileSync.mock.calls.length > 0) {
            const [logPath] = fs.appendFileSync.mock.calls[0];
            // path.basename strips the traversal — should not contain ..
            expect(logPath).not.toContain('..');
            // Must resolve inside __dirname of server.js (proxy/)
            expect(logPath).toMatch(/passwd$/);
        }
        // Either it wrote safely or didn't write at all — both are acceptable
    });

    it('returns 200 even when log write fails', async () => {
        fs.readFileSync.mockReturnValueOnce(
            JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: 'feedback.jsonl' })
        );
        fs.appendFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
        const res = await request(app).post('/feedback').send({ rating: 'up' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// ── /assistant/conversations/start — profile resolution ──────────────────────
describe('POST /assistant/conversations/start — profile resolution', () => {
    it('returns 400 when no matching profile', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'ghost', content: 'Hello' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/No matching profile/i);
    });
});

// ── SS2 — smoke-fixture profile short-circuit ─────────────────────────────────
describe('POST /assistant/conversations/start — smoke-fixture profile', () => {
    const SMOKE_CONFIG = {
        ...MOCK_CONFIG_BASE,
        profiles: {
            ...(MOCK_CONFIG_BASE.profiles || {}),
            smoke: {
                type: 'smoke-fixture',
                displayName: 'SS2 Smoke Fixture',
                dataDomain: 'synthetic smoke data',
            },
        },
    };

    beforeEach(() => {
        fs.readFileSync.mockReturnValue(JSON.stringify(SMOKE_CONFIG));
    });
    afterEach(() => {
        fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
    });

    it('returns COMPLETED + governance attestation without contacting upstream', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'smoke', content: 'What is the SS2 smoke answer?' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('COMPLETED');
        expect(res.body.conversation_id).toMatch(/^smoke-conv-[a-f0-9]{12}$/);
        expect(res.body.message_id).toMatch(/^smoke-msg-[a-f0-9]{12}$/);
        expect(res.body.content).toMatch(/^Smoke fixture answer to: ".+"$/);
        expect(res.body.governance).toMatchObject({
            enforced: true,
            authority: 'mock',
            policyVersion: 'g3-v1',
        });
    });

    it('returns deterministic ids for the same question', async () => {
        const a = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'smoke', content: 'deterministic test' });
        const b = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'smoke', content: 'deterministic test' });
        expect(a.body.conversation_id).toBe(b.body.conversation_id);
        expect(a.body.message_id).toBe(b.body.message_id);
    });

    it('rejects empty content', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'smoke', content: '' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content is required/i);
    });

    // Production-mode rejection is enforced at the attestation builder level —
    // `buildGovernanceAttestation` throws on `authority: "mock"` when
    // NODE_ENV=production, regardless of which route called it. That contract
    // is covered by the unit tests in `proxy/tests/governance.test.js`; we
    // don't re-test it here because the auth middleware would reject this
    // unauthenticated test request with 401 before the route handler runs
    // in production mode anyway. The composition is: middleware blocks
    // first; even if auth was provided, the governance builder still throws
    // and the route returns 500.
});

// ── /assistant/conversations/:id/messages — profile resolution ────────────────
describe('POST /assistant/conversations/:id/messages — profile resolution', () => {
    it('returns 400 when no matching profile', async () => {
        const res = await request(app)
            .post('/assistant/conversations/conv-abc/messages')
            .send({ assistantProfile: 'ghost', content: 'Follow-up' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/No matching profile/i);
    });
});

// ── /assistant/conversations/:id/messages/:msgId — poll resolution ────────────
describe('GET /assistant/conversations/:id/messages/:msgId — profile resolution', () => {
    it('falls through to default profile when conversation not in map (attempts Databricks → 500)', async () => {
        // profileByName(undefined) returns null, host-matching returns null,
        // default profile is used → request reaches Databricks → network error (500).
        const res = await request(app)
            .get('/assistant/conversations/unknown-conv/messages/msg-001');
        // Should fail at Databricks network layer, not at profile resolution
        expect(res.status).toBe(500);
        expect(res.body.error).not.toMatch(/Cannot resolve profile/i);
    });

    it('returns 400 when conversation not in map and no default profile exists', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            port: 0,
            profiles: {
                special: { host: 'https://special.azuredatabricks.net', token: 'tok', spaceId: 's1' }
            }
        }));
        const res = await request(app)
            .get('/assistant/conversations/unknown-conv/messages/msg-001');
        fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Cannot resolve profile/i);
    });

    it('resolves profile from conversationMap after start is stored', async () => {
        // Manually populate conversationMap (simulates a prior start)
        conversationMap.set('known-conv-id', { spaceId: 'space-default-123', profileName: 'default' });
        // This will still fail at Databricks HTTP but should NOT return 400
        const res = await request(app)
            .get('/assistant/conversations/known-conv-id/messages/msg-001');
        // Should reach Databricks layer (500 from no real network), not profile error (400)
        expect(res.status).not.toBe(400);
    });

    it('resolves profile from query param spaceId + assistantProfile', async () => {
        const res = await request(app)
            .get('/assistant/conversations/fresh-conv/messages/msg-001')
            .query({ assistantProfile: 'default', spaceId: 'space-default-123' });
        // Should reach Databricks layer, not profile error
        expect(res.status).not.toBe(400);
    });
});

// ── normalizeGenieResponse — BUG-003 system prompt leak fix ──────────────────
describe('normalizeGenieResponse', () => {
    it('replaces user-prompt content with attachment text content (object form)', () => {
        const data = {
            status: 'COMPLETED',
            content: 'You are Azure Databricks Genie operating inside a Power BI custom visual...',
            attachments: [
                { text: { content: '## HEADLINE\nTotal Sales of $2.30M are on-track.' } }
            ]
        };
        normalizeGenieResponse(data);
        expect(data.content).toBe('## HEADLINE\nTotal Sales of $2.30M are on-track.');
    });

    it('replaces user-prompt content with attachment text content (string form)', () => {
        const data = {
            status: 'COMPLETED',
            content: 'leaked system prompt',
            attachments: [{ text: 'Genie answer text' }]
        };
        normalizeGenieResponse(data);
        expect(data.content).toBe('Genie answer text');
    });

    it('joins multiple text attachments with blank lines', () => {
        const data = {
            status: 'COMPLETED',
            content: 'leaked',
            attachments: [
                { text: { content: 'First section' } },
                { text: { content: 'Second section' } }
            ]
        };
        normalizeGenieResponse(data);
        expect(data.content).toBe('First section\n\nSecond section');
    });

    it('clears content to empty string when no text attachments present', () => {
        const data = {
            status: 'RUNNING',
            content: 'leaked system prompt',
            attachments: []
        };
        normalizeGenieResponse(data);
        expect(data.content).toBe('');
    });

    it('clears content when attachments contain only query (SQL) entries', () => {
        const data = {
            status: 'COMPLETED',
            content: 'leaked',
            attachments: [{ query: { query: 'SELECT 1' } }]
        };
        normalizeGenieResponse(data);
        expect(data.content).toBe('');
    });

    it('preserves attachments unchanged for downstream rendering', () => {
        const sqlAtt = { query: { query: 'SELECT 1', result: { columns: [], data_table: [] } } };
        const textAtt = { text: { content: 'answer' } };
        const data = { status: 'COMPLETED', content: 'leaked', attachments: [textAtt, sqlAtt] };
        normalizeGenieResponse(data);
        expect(data.attachments[0]).toBe(textAtt);
        expect(data.attachments[1]).toBe(sqlAtt);
        expect(data.attachments[1].query.query).toBe('SELECT 1');
    });

    it('handles missing attachments array', () => {
        const data = { status: 'PENDING', content: 'leaked' };
        normalizeGenieResponse(data);
        expect(data.content).toBe('');
    });

    it('returns null/undefined inputs unchanged', () => {
        expect(normalizeGenieResponse(null)).toBe(null);
        expect(normalizeGenieResponse(undefined)).toBe(undefined);
    });

    it('ignores empty/whitespace-only text content', () => {
        const data = {
            status: 'COMPLETED',
            content: 'leaked',
            attachments: [{ text: { content: '   ' } }, { text: '' }]
        };
        normalizeGenieResponse(data);
        expect(data.content).toBe('');
    });
});

// ── /warehouse/status — profile resolution ───────────────────────────────────
describe('GET /warehouse/status', () => {
    it('returns 400 when no matching profile', async () => {
        const res = await request(app)
            .get('/warehouse/status?assistantProfile=ghost');
        expect(res.status).toBe(400);
    });

    it('returns configured:false when profile has no warehouseId', async () => {
        const res = await request(app)
            .get('/warehouse/status?assistantProfile=default');
        expect(res.status).toBe(200);
        expect(res.body.configured).toBe(false);
        expect(res.body.state).toBe('unknown');
    });
});

// ── /warehouse/start — profile resolution ────────────────────────────────────
describe('POST /warehouse/start', () => {
    it('returns 400 when no matching profile', async () => {
        const res = await request(app)
            .post('/warehouse/start')
            .send({ assistantProfile: 'ghost' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when profile has no warehouseId', async () => {
        const res = await request(app)
            .post('/warehouse/start')
            .send({ assistantProfile: 'default' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/No warehouseId/i);
    });
});

// ── storeConversation / conversationMap ───────────────────────────────────────
describe('conversationMap (in-memory conversation store)', () => {
    it('starts empty and clears between tests', () => {
        expect(conversationMap.size).toBe(0);
    });

    it('is populated manually as a prerequisite for poll tests', () => {
        conversationMap.set('test-conv', { spaceId: 'space-abc', profileName: 'default' });
        expect(conversationMap.get('test-conv')).toEqual({ spaceId: 'space-abc', profileName: 'default' });
    });
});

// ── resolveProfile precedence ─────────────────────────────────────────────────
describe('resolveProfile precedence', () => {
    it('prefers named profile over host-match', async () => {
        // analytics profile has a distinct host — requesting with default profile name
        // should land on default, not analytics
        const res = await request(app)
            .get('/assistant/capabilities?assistantProfile=default')
            .set('X-Genie-Target-Host', 'https://analytics.azuredatabricks.net');
        expect(res.status).toBe(200);
        expect(res.body.spaceId).toBe('space-default-123');
    });
});

// ── Token resolution — PAT mode ───────────────────────────────────────────────
describe('token validation', () => {
    it('rejects template-style token (contains YOUR_) with the locked safe sentinel', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                bad: { host: 'https://bad.azuredatabricks.net', token: 'YOUR_TOKEN_HERE', spaceId: 's1' }
            }
        }));
        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'bad', content: 'Test' });
        fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
        // Slice 1d — token-resolution failures fall through
        // errorStatusFromDatabricks to the verbatim safe sentinel. The
        // previous assertion (`/@azure\/identity/i`) leaked the underlying
        // auth-implementation module name to the client; the sentinel
        // removes that disclosure surface. Server-side console.error still
        // has the raw message for operator triage.
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/PulsePlay could not complete this request/i);
        expect(res.body.error).not.toMatch(/@azure\/identity/i);
    });
});

// ── Request body size limit ───────────────────────────────────────────────────
describe('request body limits', () => {
    it('rejects bodies larger than 4 MB', async () => {
        const bigPayload = { content: 'x'.repeat(5 * 1024 * 1024) };
        const res = await request(app)
            .post('/assistant/home')
            .send(bigPayload);
        expect(res.status).toBe(413);
    });
});

// ── Shared-key authentication ─────────────────────────────────────────────────
// Exercise the opt-in X-Genie-Key gate. The default MOCK_CONFIG_BASE has no
// sharedKey, so the existing suite is unaffected; these tests swap in a config
// that enables the gate for the duration of the block.
describe('sharedKey authentication — when sharedKey is configured', () => {
    const SECRET = 'test-shared-secret-abc123';
    const withKeyConfig = JSON.stringify({ ...MOCK_CONFIG_BASE, sharedKey: SECRET });

    beforeEach(() => fs.readFileSync.mockReturnValue(withKeyConfig));
    afterEach(() => fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)));

    it('returns 401 on /assistant/capabilities when header is missing', async () => {
        const res = await request(app)
            .get('/assistant/capabilities')
            .query({ assistantProfile: 'default' });
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/X-Genie-Key/i);
    });

    it('stamps PX1 client identity on auth audit lines', async () => {
        _consoleLogSpy.mockClear();
        const res = await request(app)
            .get('/assistant/capabilities')
            .set('X-Pulse-Client', 'pulse-pbi')
            .set('X-Pulse-Client-Version', '4.5.6')
            .set('X-Pulse-Request-Id', 'audit-rid')
            .query({ assistantProfile: 'default' });

        expect(res.status).toBe(401);
        const auditCall = _consoleLogSpy.mock.calls.find(
            args => args[0] === '[audit]' && typeof args[1] === 'string' && args[1].includes('auth.missing-shared-key')
        );
        expect(auditCall).toBeTruthy();
        const parsed = JSON.parse(auditCall[1]);
        expect(parsed.requestId).toBe('audit-rid');
        expect(parsed.clientApp).toBe('pulse-pbi');
        expect(parsed.clientVersion).toBe('4.5.6');
    });

    it('returns 401 when the header value is wrong', async () => {
        const res = await request(app)
            .get('/assistant/capabilities')
            .set('x-genie-key', 'wrong-value')
            .query({ assistantProfile: 'default' });
        expect(res.status).toBe(401);
    });

    it('allows the call through when the header value matches', async () => {
        const res = await request(app)
            .get('/assistant/capabilities')
            .set('x-genie-key', SECRET)
            .query({ assistantProfile: 'default' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('also gates /warehouse/status', async () => {
        const res = await request(app).get('/warehouse/status');
        expect(res.status).toBe(401);
    });

    it('also gates /feedback', async () => {
        const res = await request(app)
            .post('/feedback')
            .send({ rating: 'up' });
        expect(res.status).toBe(401);
    });

    it('does NOT gate /health (used for liveness checks)', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
    });

    it('treats whitespace-only sharedKey as "no key configured"', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({ ...MOCK_CONFIG_BASE, sharedKey: '   ' }));
        const res = await request(app)
            .get('/assistant/capabilities')
            .query({ assistantProfile: 'default' });
        expect(res.status).toBe(200);
    });
});

describe('sharedKey authentication — default (no key configured)', () => {
    it('passes through without a header when sharedKey is absent', async () => {
        const res = await request(app)
            .get('/assistant/capabilities')
            .query({ assistantProfile: 'default' });
        expect(res.status).toBe(200);
    });
});

// ── CORS advertised headers ───────────────────────────────────────────────────
describe('CORS — required custom headers are advertised', () => {
    it('advertises X-Genie-Target-Host and X-Genie-Key as allowed headers', async () => {
        const res = await request(app).get('/health');
        const allowed = res.headers['access-control-allow-headers'] || '';
        expect(allowed).toMatch(/X-Genie-Target-Host/i);
        expect(allowed).toMatch(/X-Genie-Key/i);
    });

    it('advertises PX1 client identity headers and exposes response correlation headers', async () => {
        const res = await request(app).get('/health');
        const allowed = res.headers['access-control-allow-headers'] || '';
        const exposed = res.headers['access-control-expose-headers'] || '';
        expect(allowed).toMatch(/X-Pulse-Client/i);
        expect(allowed).toMatch(/X-Pulse-Client-Version/i);
        expect(allowed).toMatch(/X-Pulse-Request-Id/i);
        expect(exposed).toMatch(/X-Pulse-Request-Id/i);
        expect(exposed).toMatch(/X-Pulse-Client/i);
    });
});

describe('streaming error redaction', () => {
    it('redacts token and secret shaped substrings before in-band stream writes', () => {
        const safe = safeStreamErrorText('upstream failed client_secret=stream-secret-123 with Bearer abc.def.ghi and dapiABC1234567890', 400);
        expect(safe).not.toContain('stream-secret-123');
        expect(safe).not.toContain('abc.def.ghi');
        expect(safe).not.toContain('dapiABC1234567890');
        expect(safe).toContain('[redacted]');
    });
});

// ── Feedback log redaction ────────────────────────────────────────────────────
describe('/feedback — token redaction', () => {
    it('scrubs dapi-shaped PATs before writing to disk', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: 'test-feedback.log' }));
        fs.appendFileSync.mockClear();
        await request(app)
            .post('/feedback')
            .send({
                rating: 'down',
                comment: 'The token dapi1234567890abcdef1234 was included by mistake',
                question: 'show all users',
            });
        expect(fs.appendFileSync).toHaveBeenCalled();
        const written = fs.appendFileSync.mock.calls[0][1];
        expect(written).not.toMatch(/dapi1234567890abcdef1234/);
        // Wave 28 — typed redaction labels: [REDACTED-TOKEN] / [REDACTED-EMAIL] / [REDACTED-PHONE].
        expect(written).toMatch(/\[REDACTED-TOKEN\]/);
    });

    it('scrubs JWT-shaped tokens in nested fields', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: 'test-feedback.log' }));
        fs.appendFileSync.mockClear();
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9FYR5kAVj5cB8';
        await request(app)
            .post('/feedback')
            .send({
                rating: 'up',
                meta: { trace: `Authorization: Bearer ${jwt}` },
            });
        const written = fs.appendFileSync.mock.calls[0][1];
        expect(written).not.toMatch(/eyJhbGciOiJIUzI1NiJ9/);
        // Wave 28 — typed redaction labels: [REDACTED-TOKEN] / [REDACTED-EMAIL] / [REDACTED-PHONE].
        expect(written).toMatch(/\[REDACTED-TOKEN\]/);
    });

    it('Wave 28 — scrubs email addresses in feedback comment', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: 'test-feedback.log' }));
        fs.appendFileSync.mockClear();
        await request(app)
            .post('/feedback')
            .send({
                rating: 'down',
                comment: 'Please contact alice.smith@example.com about this',
            });
        const written = fs.appendFileSync.mock.calls[0][1];
        expect(written).not.toMatch(/alice\.smith@example\.com/);
        expect(written).toMatch(/\[REDACTED-EMAIL\]/);
    });

    it('Wave 28 — scrubs phone numbers in feedback comment', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: 'test-feedback.log' }));
        fs.appendFileSync.mockClear();
        await request(app)
            .post('/feedback')
            .send({
                rating: 'down',
                comment: 'Call me on +1 555 123 4567 to discuss',
            });
        const written = fs.appendFileSync.mock.calls[0][1];
        expect(written).not.toMatch(/555 123 4567/);
        expect(written).toMatch(/\[REDACTED-PHONE\]/);
    });

    it('returns 200 even if the log path is misconfigured (never crashes the visual)', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({ ...MOCK_CONFIG_BASE, feedbackLog: 'test.log' }));
        fs.appendFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
        const res = await request(app).post('/feedback').send({ rating: 'up' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// ── Rate limiting (the existing limiter is bypassed when NODE_ENV=test, so
// this test just asserts the middleware is wired into the route chain by
// confirming the successful path returns 200 and doesn't mis-handle the
// bypass flag. A full limiter exercise lives in a dedicated integration run.)
describe('rate limit middleware wiring', () => {
    it('does not block legitimate requests under NODE_ENV=test', async () => {
        for (let i = 0; i < 5; i++) {
            const res = await request(app)
                .get('/assistant/capabilities')
                .query({ assistantProfile: 'default' });
            expect(res.status).toBe(200);
        }
    });

    it('does not spend the cost-bearing request budget on cheap metadata reads', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        try {
            for (let i = 0; i < 125; i++) {
                const res = await request(app).get('/assistant/profiles');
                expect(res.status).toBe(200);
            }
        } finally {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });
});

// ── Path-traversal protection on feedback log ─────────────────────────────────
describe('/feedback — log path traversal', () => {
    it('strips directory components from feedbackLog (path.basename only)', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            feedbackLog: '../../etc/passwd',
        }));
        fs.appendFileSync.mockClear();
        await request(app).post('/feedback').send({ rating: 'up' });
        expect(fs.appendFileSync).toHaveBeenCalled();
        const writtenPath = fs.appendFileSync.mock.calls[0][0];
        // The resolved path must live inside the proxy dir, never climb out.
        expect(writtenPath).not.toMatch(/\.\./);
        expect(writtenPath).toMatch(/passwd$/); // basename preserved, dirs stripped
        expect(writtenPath).not.toMatch(/\/etc\//);
    });
});

// ── HTTPS-only enforcement on target host ─────────────────────────────────────
describe('POST /confidence — structural confidence evaluation', () => {
    it('returns high confidence for a clean SQL result with known columns', async () => {
        const res = await request(app)
            .post('/confidence')
            .send({
                profileName: 'sales',
                conversationId: null,
                question: 'What is total sales by region?',
                attachments: [{
                    query: {
                        query: 'SELECT region, SUM(sales) FROM vw_genie_sales_performance WHERE order_year=2023 GROUP BY region',
                        result: {
                            columns: [{ name: 'region' }, { name: 'sales' }],
                            data_table: [['West', 50000], ['East', 40000]]
                        }
                    }
                }]
            });
        expect(res.status).toBe(200);
        const lines = res.text.trim().split('\n').filter(Boolean);
        const phase1 = JSON.parse(lines[0]);
        expect(phase1.phase).toBe(1);
        expect(phase1.level).toBe('high');
        expect(phase1.score).toBeGreaterThanOrEqual(80);
        expect(Array.isArray(phase1.signals)).toBe(true);
    });

    it('returns medium/low confidence when no rows returned', async () => {
        const res = await request(app)
            .post('/confidence')
            .send({
                profileName: 'sales',
                conversationId: null,
                question: 'Sales for 2099?',
                attachments: [{
                    query: {
                        query: 'SELECT region, SUM(sales) FROM vw_genie_sales_performance WHERE order_year=2099 GROUP BY region',
                        result: { columns: [{ name: 'region' }, { name: 'sales' }], data_table: [] }
                    }
                }]
            });
        expect(res.status).toBe(200);
        const lines = res.text.trim().split('\n').filter(Boolean);
        const phase1 = JSON.parse(lines[0]);
        expect(phase1.phase).toBe(1);
        expect(phase1.level).not.toBe('high');
        expect(phase1.signals.some(s => /no data|no records/i.test(s))).toBe(true);
    });

    it('flags synthetic fields in the customer space', async () => {
        const res = await request(app)
            .post('/confidence')
            .send({
                profileName: 'customer',
                conversationId: null,
                question: 'What is the churn risk by segment?',
                attachments: [{
                    query: {
                        query: 'SELECT segment, AVG(churn_risk_score) FROM vw_genie_customer_returns GROUP BY segment',
                        result: {
                            columns: [{ name: 'segment' }, { name: 'churn_risk_score' }],
                            data_table: [['Consumer', 0.32], ['Corporate', 0.18]]
                        }
                    }
                }]
            });
        expect(res.status).toBe(200);
        const lines = res.text.trim().split('\n').filter(Boolean);
        const phase1 = JSON.parse(lines[0]);
        expect(phase1.signals.some(s => /synthetic/i.test(s))).toBe(true);
    });

    it('returns low confidence with enrichmentWarning present', async () => {
        const res = await request(app)
            .post('/confidence')
            .send({
                profileName: 'sales',
                conversationId: null,
                question: 'anything',
                attachments: [{
                    query: {
                        query: 'SELECT region FROM vw_genie_sales_performance',
                        result: { enrichmentWarning: 'no columns returned' }
                    }
                }]
            });
        const lines = res.text.trim().split('\n').filter(Boolean);
        const phase1 = JSON.parse(lines[0]);
        expect(phase1.level).toBe('low');
    });

    it('handles empty attachments gracefully', async () => {
        const res = await request(app)
            .post('/confidence')
            .send({ profileName: 'sales', conversationId: null, question: 'test', attachments: [] });
        const lines = res.text.trim().split('\n').filter(Boolean);
        const phase1 = JSON.parse(lines[0]);
        expect(phase1.phase).toBe(1);
        expect(phase1.level).toBe('low');
    });
});

describe('databricksRequest — URL validation', () => {
    it('rejects profiles with non-URL hosts (Slice 1d: sentinel only, no config-introspection leak)', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                bad: { host: 'not a url', token: 'dapi-x', spaceId: 'sx' },
            },
        }));
        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'bad', content: 'hi' });
        expect(res.status).toBe(500);
        // Slice 1d — URL-validation failures fall through
        // errorStatusFromDatabricks to the verbatim safe sentinel. The
        // previous assertion (`/Invalid target URL|not a valid/i`) leaked
        // the raw URL parser output (which echoed the misconfigured host
        // back to any caller). The sentinel removes that disclosure
        // surface; the operator sees the actual host in console.warn.
        expect(res.body.error).toMatch(/PulsePlay could not complete this request/i);
        expect(res.body.error).not.toMatch(/Invalid target URL/i);
        expect(res.body.error).not.toContain('not a url');
    });
});

describe('POST /supervisor/conversations/start-stream — input validation (IDEA-020 Phase 5)', () => {
    it('returns 400 when no supervisor profile is configured', async () => {
        // The default mock config has only `default` and `analytics` (both
        // plain Genie profiles, no `type: "supervisor-local"`).
        const res = await request(app)
            .post('/supervisor/conversations/start-stream')
            .send({ content: 'hello' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/no supervisor profile/i);
    });

    it('returns 400 when content is empty', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                ...MOCK_CONFIG_BASE.profiles,
                supervisor: {
                    type: 'supervisor-local',
                    host: 'https://x.azuredatabricks.net',
                    token: 'dapi-x',
                    spaces: 'default,analytics',
                    agentName: 'TestSupervisor',
                },
            },
        }));
        const res = await request(app)
            .post('/supervisor/conversations/start-stream')
            .send({ content: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/i);
    });

    it('permits streaming for real-supervisor (type=supervisor) and routes to the Mosaic endpoint', async () => {
        // IDEA-040 / G6: streaming is now supported for both supervisor-local
        // and real Mosaic AI supervisor agents. When the resolved profile is
        // type=supervisor, the proxy emits synthetic "thinking..." events
        // around a non-stream call to the agent's serving endpoint. Since
        // this test mocks a host that won't actually answer, the stream
        // succeeds (HTTP 200, SSE) and emits an error event partway through.
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                ...MOCK_CONFIG_BASE.profiles,
                supervisor: {
                    type: 'supervisor',
                    host: 'https://x.azuredatabricks.net',
                    token: 'dapi-x',
                    endpoint: '/serving-endpoints/foo/invocations',
                },
            },
        }));
        const res = await request(app)
            .post('/supervisor/conversations/start-stream')
            .send({ content: 'hi' });
        // 200 = streaming accepted (was 400 previously when type=supervisor
        // was rejected outright). The body is NDJSON; the first event is
        // fanout.start, then helper.start, then an upstream error since the
        // mock host won't answer.
        expect(res.status).toBe(200);
        expect(res.text).toMatch(/"type":"fanout\.start"/);
    });
});

describe('GET /assistant/profiles — friendly metadata for the Setup screen (BUG-013 fix)', () => {
    it('returns name, displayName, dataDomain — never tokens', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                default: { host: 'https://x.azuredatabricks.net', token: 'dapi-secret-1', spaceId: 'sp-default' },
                sales:   {
                    host: 'https://sales.azuredatabricks.net',
                    token: 'dapi-secret-2',
                    spaceId: 'sp-sales-12345678',
                    displayName: 'Sales helper',
                    dataDomain: 'sales data'
                },
            },
        }));
        const res = await request(app).get('/assistant/profiles');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const sales = res.body.find(p => p.name === 'sales');
        expect(sales).toBeDefined();
        expect(sales.displayName).toBe('Sales helper');
        expect(sales.dataDomain).toBe('sales data');
        // Token must NEVER appear in any field, anywhere on the response.
        const dump = JSON.stringify(res.body);
        expect(dump).not.toContain('dapi-secret-1');
        expect(dump).not.toContain('dapi-secret-2');
    });

    it('falls back to a title-cased profile key when displayName is missing', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                customer_returns: { host: 'https://x.azuredatabricks.net', token: 'dapi-x', spaceId: 'sp-x' },
            },
        }));
        const res = await request(app).get('/assistant/profiles');
        const customer = res.body.find(p => p.name === 'customer_returns');
        expect(customer).toBeDefined();
        expect(customer.displayName).toBe('Customer Returns');
    });

    it('skips documentation entries (keys starting with underscore)', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                default: { host: 'https://x.azuredatabricks.net', token: 'dapi-x', spaceId: 'sp-x' },
                _doc_displayName: 'this is documentation, not a profile',
                _doc_dataDomain: 'also docs',
            },
        }));
        const res = await request(app).get('/assistant/profiles');
        const names = res.body.map(p => p.name);
        expect(names).not.toContain('_doc_displayName');
        expect(names).not.toContain('_doc_dataDomain');
        expect(names).toContain('default');
    });
});

describe('allowlist routes and profile filtering', () => {
    const ALLOWLISTED_CONFIG = {
        ...MOCK_CONFIG_BASE,
        allowlistEnforcement: 'strict',
        allowlist: {
            biProviders: ['powerbi'],
            embedOrigins: { powerbi: ['app.powerbi.com'] },
            powerbiWorkspaces: ['workspace-1'],
            powerbiReports: [],
            aadTenants: ['tenant-1'],
            aiProfiles: { default: ['default'], byGroup: {} },
            genieSpaces: ['space-default-123'],
            supervisorProfiles: [],
            packs: ['cpg-fmcg'],
            knowledgeSources: [],
        },
    };

    beforeEach(() => {
        const actualFs = jest.requireActual('fs');
        fs.readFileSync.mockImplementation((filePath, ...rest) => {
            if (String(filePath).endsWith('config.json')) return JSON.stringify(ALLOWLISTED_CONFIG);
            return actualFs.readFileSync(filePath, ...rest);
        });
    });
    afterEach(() => fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)));

    it('returns user-visible allowlist contents', async () => {
        const res = await request(app).get('/assistant/allowlist');
        expect(res.status).toBe(200);
        expect(res.body.configured).toBe(true);
        expect(res.body.biProviders).toEqual(['powerbi']);
        expect(res.body.aiProfiles).toEqual(['default']);
        expect(res.body.packs).toEqual(['cpg-fmcg']);
    });

    it('filters /assistant/profiles to allowlisted profiles', async () => {
        const res = await request(app).get('/assistant/profiles');
        expect(res.status).toBe(200);
        expect(res.body.map(p => p.name)).toEqual(['default']);
    });

    it('rejects a configured but non-allowlisted profile before connector use', async () => {
        const res = await request(app).get('/assistant/capabilities?assistantProfile=analytics');
        expect(res.status).toBe(403);
        expect(res.body.kind).toBe('aiProfile');
    });

    it('returns the allowlisted pack registry', async () => {
        const res = await request(app).get('/assistant/knowledge/packs');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.packs)).toBe(true);
        expect(res.body.packs.map(p => p.name)).toContain('cpg-fmcg');
    });
});

describe('POST /history — supervisor warehouse fallback (BUG-009)', () => {
    // /history POST calls cfg() multiple times during one request (resolveProfile,
    // historyTableFor, pickHistoryProfile). mockReturnValue keeps the override
    // stable for the full request; restore in afterEach so we don't pollute
    // the rest of the suite.
    const NO_WAREHOUSE_CONFIG = JSON.stringify({
        ...MOCK_CONFIG_BASE,
        // History table must be set so we exercise the warehouse check below;
        // without it the "history disabled" branch fires first.
        chatHistoryTable: 'workspace.test.pulseplay_ai_chat_history',
        profiles: {
            supervisor: {
                type: 'supervisor-local',
                host: 'https://x.azuredatabricks.net',
                token: 'dapi-x',
                spaceId: 'sp-supervisor'
                // no warehouseId
            },
            default: { host: 'https://x.azuredatabricks.net', token: 'dapi-y', spaceId: 'sp-default' },
            analytics: { host: 'https://x.azuredatabricks.net', token: 'dapi-z', spaceId: 'sp-analytics' }
        }
    });

    beforeEach(() => fs.readFileSync.mockReturnValue(NO_WAREHOUSE_CONFIG));
    afterEach(() => fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)));

    it('returns 400 with a descriptive error when no profile has a warehouseId', async () => {
        const res = await request(app)
            .post('/history')
            .send({ assistantProfile: 'supervisor', viewerUserKey: 'u@example.com', question: 'q', answer: 'a' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/No warehouseId configured/i);
        expect(res.body.error).toMatch(/supervisor/);
    });
});

describe('loadEnvProfiles — generic env-var profile loader (IDEA-016 phase 2)', () => {
    it('parses PROXY_PROFILE_<NAME>_<FIELD> entries into a profile map', () => {
        const profiles = loadEnvProfiles({
            PROXY_PROFILE_SALES_HOST: 'https://sales.azuredatabricks.net',
            PROXY_PROFILE_SALES_TOKEN: 'dapi-sales',
            PROXY_PROFILE_SALES_SPACE_ID: '01f1aaaaa',
            PROXY_PROFILE_SALES_WAREHOUSE_ID: '6510111',
            PROXY_PROFILE_SALES_DISPLAY_NAME: 'Sales helper',
            PROXY_PROFILE_SALES_DATA_DOMAIN: 'sales data',
            UNRELATED_VAR: 'ignore me'
        });
        expect(profiles).toEqual({
            sales: {
                host: 'https://sales.azuredatabricks.net',
                token: 'dapi-sales',
                spaceId: '01f1aaaaa',
                warehouseId: '6510111',
                displayName: 'Sales helper',
                dataDomain: 'sales data'
            }
        });
    });

    it('lower-cases the profile name and supports multiple profiles', () => {
        const profiles = loadEnvProfiles({
            PROXY_PROFILE_CUSTOMER_HOST: 'https://x.azuredatabricks.net',
            PROXY_PROFILE_CUSTOMER_SPACE_ID: '01f1bbbbb',
            PROXY_PROFILE_OPS_HOST: 'https://y.azuredatabricks.net',
            PROXY_PROFILE_OPS_SPACE_ID: '01f1ccccc'
        });
        expect(Object.keys(profiles).sort()).toEqual(['customer', 'ops']);
        expect(profiles.customer.host).toBe('https://x.azuredatabricks.net');
        expect(profiles.ops.host).toBe('https://y.azuredatabricks.net');
    });

    it('parses supervisor-local profile fields (TYPE, AGENT_NAME, SYNTHESIS_ENDPOINT, SPACES)', () => {
        const profiles = loadEnvProfiles({
            PROXY_PROFILE_SUPER_TYPE: 'supervisor-local',
            PROXY_PROFILE_SUPER_AGENT_NAME: 'TestSupervisor',
            PROXY_PROFILE_SUPER_SYNTHESIS_ENDPOINT: 'databricks-meta-llama-3-3-70b-instruct',
            PROXY_PROFILE_SUPER_SPACES: 'sales, customer , ops,hse'
        });
        expect(profiles.super).toEqual({
            type: 'supervisor-local',
            agentName: 'TestSupervisor',
            synthesisEndpoint: 'databricks-meta-llama-3-3-70b-instruct',
            spaces: ['sales', 'customer', 'ops', 'hse']
        });
    });

    it('skips empty values + reserved (_*) names + unknown fields', () => {
        const profiles = loadEnvProfiles({
            PROXY_PROFILE_SALES_HOST: '',
            PROXY_PROFILE_SALES_TOKEN: 'dapi-x',
            PROXY_PROFILE__DOC_DISPLAYNAME: 'reserved',
            PROXY_PROFILE_SALES_UNKNOWN_FIELD: 'ignore'
        });
        expect(profiles.sales).toEqual({ token: 'dapi-x' });
        expect(profiles).not.toHaveProperty('_doc');
    });

    it('handles profile names containing underscores (longest-suffix match)', () => {
        const profiles = loadEnvProfiles({
            PROXY_PROFILE_MY_SALES_HOST: 'https://x.azuredatabricks.net',
            PROXY_PROFILE_MY_SALES_SPACE_ID: '01f1ddddd'
        });
        expect(profiles.my_sales).toEqual({
            host: 'https://x.azuredatabricks.net',
            spaceId: '01f1ddddd'
        });
    });

    it('returns an empty object when no PROXY_PROFILE_* vars are set', () => {
        expect(loadEnvProfiles({})).toEqual({});
        expect(loadEnvProfiles({ DATABRICKS_HOST: 'https://x' })).toEqual({});
    });
});

describe('env-var profile layering — overrides config.json fields per-profile', () => {
    it('an env profile with the same name as a config.json profile overrides matching fields', async () => {
        // Combine the doc filter pattern + env-var injection for this single
        // request only (mockReturnValueOnce). The env var stays set for the
        // duration of this test thanks to the layered merge in cfg().
        const ORIG = process.env.PROXY_PROFILE_DEFAULT_DISPLAY_NAME;
        process.env.PROXY_PROFILE_DEFAULT_DISPLAY_NAME = 'Default helper (env-overridden)';
        try {
            const res = await request(app).get('/assistant/profiles');
            const def = res.body.find(p => p.name === 'default');
            expect(def).toBeDefined();
            expect(def.displayName).toBe('Default helper (env-overridden)');
        } finally {
            if (ORIG === undefined) delete process.env.PROXY_PROFILE_DEFAULT_DISPLAY_NAME;
            else process.env.PROXY_PROFILE_DEFAULT_DISPLAY_NAME = ORIG;
        }
    });
});

// ── BUG-015 follow-up: every cost-bearing route is gated by both middlewares ───
//
// The Session 46 fix mounted rateLimitMiddleware + sharedKeyMiddleware against
// each cost-bearing prefix. The Session 48 commits 48.12 (/assistant/space-fetch)
// and 48.16 (/assistant/space-update) inherit the gating via the /assistant
// prefix mount — but that's only true if the prefix mount is preserved. These
// invariants catch a regression where:
//   (a) someone adds a new prefix (e.g. /vertex, /anthropic) and forgets the
//       middleware lines, OR
//   (b) someone refactors the middleware mount block and accidentally drops
//       a prefix, OR
//   (c) someone moves /assistant/space-* off the /assistant prefix and out
//       from under the gating.
//
// Two flavours: structural (introspect the Express router stack) and
// behavioural (every gated path returns 401 when sharedKey is set and the
// header is missing).

describe('BUG-015 — cost-bearing route gating invariants', () => {
    // The full set of prefixes that must carry rateLimitMiddleware. Update
    // this list when adding a new cost-bearing backend (e.g. /vertex).
    const RATE_LIMITED_PREFIXES = ['/assistant', '/warehouse', '/supervisor', '/confidence', '/openai', '/bedrock', '/responses-agent'];
    // The full set of prefixes that must carry sharedKeyMiddleware. /feedback
    // and /history are not rate-limited but are still gated.
    const SHARED_KEY_PREFIXES = ['/assistant', '/warehouse', '/supervisor', '/confidence', '/openai', '/bedrock', '/responses-agent', '/feedback', '/history'];
    const ALLOWLISTED_PREFIXES = ['/assistant', '/warehouse', '/history', '/openai', '/bedrock', '/responses-agent', '/foundation', '/supervisor', '/confidence', '/sql', '/insights'];

    // Walk the Express app's router stack and collect every (prefix, layer-name)
    // pair from `app.use(prefix, middleware)` mounts. Express stores prefix
    // mounts as layers whose `regexp` matches the prefix and whose `handle.name`
    // is the middleware function name. This covers Express 4.x layouts.
    function collectPrefixMounts(app) {
        const out = [];
        const stack = (app._router && app._router.stack) || (app.router && app.router.stack) || [];
        for (const layer of stack) {
            // Only look at app.use() mounts — these have a `regexp` and no `route`.
            if (layer.route) continue;
            // Express stores the mount path on `layer.regexp` — convert via the
            // `path` getter when available, else regex source. Prefer the
            // explicit `path` set by some Express versions; otherwise scrape.
            let prefix = null;
            if (typeof layer.path === 'string') {
                prefix = layer.path;
            } else if (layer.regexp && typeof layer.regexp.source === 'string') {
                // Source looks like '^\/assistant\/?(?=\/|$)' — extract the
                // first segment, unescape, prefix with '/'.
                const m = layer.regexp.source.match(/^\^\\\/([\w\-]+)\\\//);
                if (m) prefix = '/' + m[1];
            }
            const handleName = (layer.handle && layer.handle.name) || '';
            if (prefix) out.push({ prefix, handleName });
        }
        return out;
    }

    describe('structural — middleware is mounted at the right prefix', () => {
        const mounts = collectPrefixMounts(app);

        it.each(RATE_LIMITED_PREFIXES)('rateLimitMiddleware mounted at %s', (prefix) => {
            const found = mounts.some(m => m.prefix === prefix && m.handleName === 'rateLimitMiddleware');
            // Failure message is the test name (it.each interpolates %s) — the
            // assertion below will read "expected false to be true" but the
            // describe + test row identifies the missing prefix.
            expect(found).toBe(true);
        });

        it.each(SHARED_KEY_PREFIXES)('sharedKeyMiddleware mounted at %s', (prefix) => {
            const found = mounts.some(m => m.prefix === prefix && m.handleName === 'sharedKeyMiddleware');
            expect(found).toBe(true);
        });

        it.each(ALLOWLISTED_PREFIXES)('allowlistGuard mounted at %s', (prefix) => {
            const found = mounts.some(m => m.prefix === prefix && m.handleName === 'allowlistGuard');
            expect(found).toBe(true);
        });
    });

    describe('behavioural — sharedKey gating actually fires on each cost-bearing path', () => {
        const SECRET = 'bug015-coverage-secret';
        const withKeyConfig = JSON.stringify({ ...MOCK_CONFIG_BASE, sharedKey: SECRET });
        beforeEach(() => fs.readFileSync.mockReturnValue(withKeyConfig));
        afterEach(() => fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)));

        // Representative path under each prefix. Pick the cheapest verb that
        // exists and is reachable without a real Databricks call. The
        // assertion is "401 returned because sharedKey is missing" — no
        // need to exercise the full happy path.
        const SAMPLE_PATHS = [
            { method: 'get',  url: '/assistant/capabilities?assistantProfile=default' },
            { method: 'get',  url: '/assistant/space-fetch?profile=default&spaceId=space-default-123' }, // 48.12 new route
            { method: 'post', url: '/assistant/space-update', body: { profile: 'default', spaceId: 'space-default-123', serialized_space: '{"version":2}' } }, // 48.16 new route
            { method: 'get',  url: '/warehouse/status' },
            { method: 'post', url: '/supervisor/conversations/start', body: { content: 'test' } },
            { method: 'post', url: '/confidence', body: { question: 'q', attachments: [] } },
            { method: 'post', url: '/openai/chat', body: { messages: [] } },
            { method: 'post', url: '/bedrock/retrieve', body: { input: 'q' } },
            { method: 'get',  url: '/responses-agent/health' },
            { method: 'post', url: '/feedback', body: { rating: 'up' } },
            { method: 'post', url: '/history', body: { conversationId: 'x' } },
        ];

        it.each(SAMPLE_PATHS)('$method $url → 401 when sharedKey header missing', async ({ method, url, body }) => {
            const req = body ? request(app)[method](url).send(body) : request(app)[method](url);
            const res = await req;
            expect(res.status).toBe(401);
        });

        it('the new /assistant/space-fetch route lets a correctly-keyed request through to profile resolution', async () => {
            // Confirms the gating is the only thing blocking — the route
            // itself exists and runs past the auth layer when authenticated.
            // The downstream call would hit Databricks, which we don't mock,
            // so we accept either a 200 (cached) or 5xx (network) — both
            // prove the auth layer let the call through.
            const res = await request(app)
                .get('/assistant/space-fetch')
                .set('x-genie-key', SECRET)
                .query({ profile: 'default', spaceId: 'space-default-123' });
            expect(res.status).not.toBe(401);
        });
    });
});
