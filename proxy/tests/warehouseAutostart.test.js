'use strict';

// Warehouse auto-start hardening (2026-06-05). Covers:
//   A — a PERMANENT 4xx (serverless disabled) fails fast, never a 5-min poll
//   A' — the permanent failure is memoized so the NEXT call fails fast with 0
//        network calls (no re-poll of a dead warehouse)
//   B — concurrent callers for the same warehouse share ONE ensure (dedup)
//   D — an aborted signal stops the poll instead of running to the ceiling
//   classifier — isPermanentDatabricksError (4xx permanent, 5xx/socket transient)

process.env.NODE_ENV = 'test';

const https = require('https');
const {
    ensureWarehouseRunning,
    isPermanentDatabricksError,
    _resetWarehouseLogsForTests,
} = require('../server');

const ORIGINAL_REQUEST = https.request;
const PROFILE = { host: 'https://x.databricks.com', token: 'dapi-test', warehouseId: 'wh-test' };

// Build a controllable https.request mock. `handler({method, path})` returns
// `{ statusCode, body }` (or a Promise of it). Tracks every call.
function makeHttpsMock(handler) {
    const calls = [];
    const fn = jest.fn((options, cb) => {
        calls.push({ method: options.method, path: options.path });
        Promise.resolve(handler({ method: options.method, path: options.path })).then(({ statusCode, body }) => {
            const raw = typeof body === 'string' ? body : JSON.stringify(body ?? {});
            const resp = {
                statusCode,
                on(event, h) {
                    if (event === 'data') h(Buffer.from(raw));
                    if (event === 'end') h();
                },
            };
            cb(resp);
        });
        return { on: jest.fn(), write: jest.fn(), end: jest.fn(), setTimeout: jest.fn(), destroy: jest.fn() };
    });
    fn.calls = calls;
    return fn;
}

beforeEach(() => {
    _resetWarehouseLogsForTests();
});

afterEach(() => {
    https.request = ORIGINAL_REQUEST;
    jest.restoreAllMocks();
});

describe('isPermanentDatabricksError', () => {
    it('treats 4xx Databricks errors as permanent', () => {
        expect(isPermanentDatabricksError(new Error('Databricks 400: serverless disabled'))).toBe(true);
        expect(isPermanentDatabricksError(new Error('Databricks 401: token expired'))).toBe(true);
        expect(isPermanentDatabricksError(new Error('Databricks 404: no such warehouse'))).toBe(true);
        expect(isPermanentDatabricksError(new Error('Databricks 429: rate limited'))).toBe(true);
    });
    it('treats 5xx + socket + unknown errors as transient (not permanent)', () => {
        expect(isPermanentDatabricksError(new Error('Databricks 500: internal'))).toBe(false);
        expect(isPermanentDatabricksError(new Error('Databricks 503: unavailable'))).toBe(false);
        expect(isPermanentDatabricksError(new Error('socket hang up'))).toBe(false);
        expect(isPermanentDatabricksError(new Error('Non-JSON from Databricks (502): <html>'))).toBe(false);
        expect(isPermanentDatabricksError(null)).toBe(false);
        expect(isPermanentDatabricksError(undefined)).toBe(false);
    });
});

describe('ensureWarehouseRunning — fail fast on a permanent start failure (A)', () => {
    it('rejects immediately on a 400 /start instead of polling for 5 minutes', async () => {
        const mock = makeHttpsMock(({ method, path }) => {
            if (method === 'GET') return { statusCode: 200, body: { state: 'STOPPED' } };
            if (method === 'POST' && path.endsWith('/start')) {
                return { statusCode: 400, body: { error_code: 'BAD_REQUEST', message: 'serverless compute disabled' } };
            }
            return { statusCode: 200, body: {} };
        });
        https.request = mock;

        await expect(ensureWarehouseRunning(PROFILE)).rejects.toThrow(/Databricks 400/);
        // Exactly one GET (state) + one POST (/start) — NO poll-loop GETs.
        expect(mock.calls.filter(c => c.method === 'GET')).toHaveLength(1);
        expect(mock.calls.filter(c => c.method === 'POST')).toHaveLength(1);
    });

    it('memoizes the permanent failure: the NEXT call fails fast with ZERO network calls', async () => {
        const mock = makeHttpsMock(({ method, path }) => {
            if (method === 'POST' && path.endsWith('/start')) {
                return { statusCode: 400, body: { message: 'serverless compute disabled' } };
            }
            return { statusCode: 200, body: { state: 'STOPPED' } };
        });
        https.request = mock;

        await expect(ensureWarehouseRunning(PROFILE)).rejects.toThrow(/Databricks 400/);
        const callsAfterFirst = mock.calls.length;

        // Second call within the failed-TTL window must short-circuit.
        await expect(ensureWarehouseRunning(PROFILE)).rejects.toThrow(/Databricks 400/);
        expect(mock.calls.length).toBe(callsAfterFirst); // no new network calls
    });
});

describe('ensureWarehouseRunning — concurrent dedup (B)', () => {
    it('shares ONE ensure across concurrent callers (single GET, not N)', async () => {
        let releaseGet;
        const gate = new Promise(r => { releaseGet = r; });
        const mock = makeHttpsMock(async ({ method }) => {
            if (method === 'GET') { await gate; return { statusCode: 200, body: { state: 'RUNNING' } }; }
            return { statusCode: 200, body: {} };
        });
        https.request = mock;

        const p1 = ensureWarehouseRunning(PROFILE);
        const p2 = ensureWarehouseRunning(PROFILE);
        const p3 = ensureWarehouseRunning(PROFILE);

        // Let the first ensure reach its GET (token resolution + dispatch are a
        // few microtasks deep). p2/p3 dedup synchronously onto the in-flight
        // promise, so only ONE GET is ever issued.
        await new Promise(r => setImmediate(r));
        expect(mock.calls.filter(c => c.method === 'GET')).toHaveLength(1);

        releaseGet();
        await Promise.all([p1, p2, p3]);
        expect(mock.calls.filter(c => c.method === 'GET')).toHaveLength(1);
    });
});

describe('ensureWarehouseRunning — abort honors client disconnect (D)', () => {
    it('throws an abort error instead of polling when the signal is aborted', async () => {
        const mock = makeHttpsMock(({ method, path }) => {
            if (method === 'GET') return { statusCode: 200, body: { state: 'STOPPED' } };
            if (method === 'POST' && path.endsWith('/start')) return { statusCode: 200, body: {} };
            return { statusCode: 200, body: { state: 'STOPPED' } };
        });
        https.request = mock;

        const ac = new AbortController();
        ac.abort(); // client already gone

        await expect(ensureWarehouseRunning(PROFILE, ac.signal)).rejects.toThrow(/aborted/i);
        // GET(state) + POST(start) only — the poll loop bailed before its first
        // 5s sleep, so there are no poll-loop GETs.
        expect(mock.calls.filter(c => c.method === 'GET')).toHaveLength(1);
    });
});

describe('ensureWarehouseRunning — happy + skip paths', () => {
    it('no-ops when the profile has no warehouseId', async () => {
        const mock = makeHttpsMock(() => ({ statusCode: 200, body: {} }));
        https.request = mock;
        await expect(ensureWarehouseRunning({ host: 'https://x', token: 't' })).resolves.toBeUndefined();
        expect(mock.calls).toHaveLength(0);
    });

    it('returns immediately and caches when the warehouse is already RUNNING', async () => {
        const mock = makeHttpsMock(() => ({ statusCode: 200, body: { state: 'RUNNING' } }));
        https.request = mock;
        await expect(ensureWarehouseRunning(PROFILE)).resolves.toBeUndefined();
        // First call probes once; the second is served from the RUNNING cache.
        await expect(ensureWarehouseRunning(PROFILE)).resolves.toBeUndefined();
        expect(mock.calls.filter(c => c.method === 'GET')).toHaveLength(1);
    });
});
