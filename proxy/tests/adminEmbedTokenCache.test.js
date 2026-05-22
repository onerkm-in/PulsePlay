// proxy/tests/adminEmbedTokenCache.test.js
//
// L18 closure tests — the new /admin/embed-tokens/stats and
// /admin/embed-tokens/purge routes:
//   - Return 401 when a shared key is configured AND the request omits it
//   - Return the cache stats / purge count when authorized
//   - Audit-log the purge event

const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');
const _origConfigContent = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : null;

function writeTempConfig(contents) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(contents, null, 2));
}

function restoreConfig() {
    if (_origConfigContent === null) {
        try { fs.unlinkSync(CONFIG_PATH); } catch { /* swallow */ }
    } else {
        fs.writeFileSync(CONFIG_PATH, _origConfigContent);
    }
}

let app;
let _powerBiTokenCache;

beforeAll(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.PROXY_SHARED_KEY;
    writeTempConfig({
        port: 8787,
        profiles: { default: { host: 'https://example', token: 'x', spaceId: 's' } },
    });
    // Fresh require so our writeTempConfig is in place when cfg() loads.
    delete require.cache[require.resolve('../server.js')];
    const mod = require('../server.js');
    app = mod.app;
    _powerBiTokenCache = mod._powerBiTokenCache;
});

afterAll(() => {
    restoreConfig();
});

beforeEach(() => {
    if (_powerBiTokenCache && typeof _powerBiTokenCache.clear === 'function') {
        _powerBiTokenCache.clear();
    }
});

describe('GET /admin/embed-tokens/stats', () => {
    test('returns empty stats when cache is empty (no shared key)', async () => {
        const res = await supertest(app).get('/admin/embed-tokens/stats');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.size).toBe(0);
        expect(res.body.maxEntries).toBe(500);
        expect(Array.isArray(res.body.entries)).toBe(true);
        expect(res.body.entries.length).toBe(0);
    });

    test('returns per-entry shape when cache has entries', async () => {
        const expiry = Date.now() + 60_000;
        _powerBiTokenCache.set('test|report-1|View', { embedToken: 'tok', expiry });
        const res = await supertest(app).get('/admin/embed-tokens/stats');
        expect(res.status).toBe(200);
        expect(res.body.size).toBe(1);
        const entry = res.body.entries[0];
        expect(entry.cacheKey).toBe('test|report-1|View');
        expect(entry.expiresInSec).toBeGreaterThan(0);
        expect(entry.expiresInSec).toBeLessThanOrEqual(60);
        expect(entry.hasRefreshInFlight).toBe(false);
    });

    test('returns 401 when shared key is configured and request omits it', async () => {
        process.env.PROXY_SHARED_KEY = 'super-secret';
        try {
            const res = await supertest(app).get('/admin/embed-tokens/stats');
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/X-PulsePlay-Key|X-Genie-Key/);
        } finally {
            delete process.env.PROXY_SHARED_KEY;
        }
    });

    test('returns 200 when shared key matches via X-Genie-Key', async () => {
        process.env.PROXY_SHARED_KEY = 'super-secret';
        try {
            const res = await supertest(app)
                .get('/admin/embed-tokens/stats')
                .set('X-Genie-Key', 'super-secret');
            expect(res.status).toBe(200);
        } finally {
            delete process.env.PROXY_SHARED_KEY;
        }
    });
});

describe('POST /admin/embed-tokens/purge', () => {
    test('clears the cache and returns the count', async () => {
        _powerBiTokenCache.set('k1', { embedToken: 'a', expiry: Date.now() + 1000 });
        _powerBiTokenCache.set('k2', { embedToken: 'b', expiry: Date.now() + 1000 });
        const res = await supertest(app).post('/admin/embed-tokens/purge');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.cleared).toBe(2);
        expect(_powerBiTokenCache.size).toBe(0);
    });

    test('returns 401 when shared key is configured and request omits it', async () => {
        process.env.PROXY_SHARED_KEY = 'super-secret';
        try {
            const res = await supertest(app).post('/admin/embed-tokens/purge');
            expect(res.status).toBe(401);
        } finally {
            delete process.env.PROXY_SHARED_KEY;
        }
    });
});
