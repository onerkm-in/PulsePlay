/**
 * spHashing.test.js — Tier B Day 3+4 coverage.
 *
 * Day 3: opaque, deterministic, non-reversible Service Principal identity
 *        hash that is included in audit-log lines instead of the raw
 *        clientId. Format: `sp:<first 12 hex of sha256(clientId)>`.
 *
 * Day 4: 401-invalidation wiring at additional call sites (supervisor stream,
 *        supervisor sync, /confidence). Errors that mention `401` must drop
 *        the OAuth cache entry so the next call re-auths cleanly.
 */

'use strict';

// fs mock — avoid depending on a real config.json in CI.
const MOCK_CONFIG_BASE = {
    port: 0,
    profiles: {
        default: { host: 'https://named.azuredatabricks.net', token: 'dapi-pat' },
        m2m_test: {
            authMode: 'oauth-m2m',
            host: 'https://m2m.example.com',
            clientId: 'sp-12345-abc',
            clientSecret: 'super-secret',
        },
    },
};
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        existsSync: jest.fn((p) =>
            String(p).endsWith('config.json') ? true : actual.existsSync(p)
        ),
        readFileSync: jest.fn().mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)),
        appendFileSync: jest.fn(),
    };
});
jest.mock('@azure/identity', () => { throw new Error('not installed'); }, { virtual: true });

// Suppress console noise; some tests re-spy locally to assert.
let _logSpy, _warnSpy, _errSpy;
beforeAll(() => {
    _logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
    _warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    _errSpy  = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
    _logSpy?.mockRestore();
    _warnSpy?.mockRestore();
    _errSpy?.mockRestore();
});

const {
    hashServicePrincipalId,
    spHashForProfile,
    auditLog,
    invalidateOAuthCacheForProfile,
    resolveDatabricksOAuthToken,
    oauthTokenCache,
} = require('../server');

// ── 1. hashServicePrincipalId — basic shape ─────────────────────────────────
describe('Tier B Day 3 — hashServicePrincipalId', () => {
    test('returns null for nullish / non-string / empty input', () => {
        expect(hashServicePrincipalId(null)).toBeNull();
        expect(hashServicePrincipalId(undefined)).toBeNull();
        expect(hashServicePrincipalId('')).toBeNull();
        // @ts-expect-error — runtime guard test
        expect(hashServicePrincipalId(12345)).toBeNull();
        // @ts-expect-error — runtime guard test
        expect(hashServicePrincipalId({})).toBeNull();
    });

    test('returns "sp:<12-hex>" format', () => {
        const out = hashServicePrincipalId('client-id-1');
        expect(out).toMatch(/^sp:[0-9a-f]{12}$/);
    });

    test('is deterministic — same clientId always produces the same hash', () => {
        const a = hashServicePrincipalId('stable-client-id');
        const b = hashServicePrincipalId('stable-client-id');
        const c = hashServicePrincipalId('stable-client-id');
        expect(a).toBe(b);
        expect(b).toBe(c);
    });

    test('different clientIds produce different hashes (collision-resistant)', () => {
        const seen = new Set();
        for (let i = 0; i < 100; i++) {
            const h = hashServicePrincipalId(`sp-client-${i}`);
            expect(h).not.toBeNull();
            expect(seen.has(h)).toBe(false);
            seen.add(h);
        }
        expect(seen.size).toBe(100);
    });

    test('is non-reversible — output never contains the input', () => {
        const SECRET_ID = 'super-recognisable-clientid-12345';
        const out = hashServicePrincipalId(SECRET_ID);
        expect(out).not.toContain('super');
        expect(out).not.toContain('recognisable');
        expect(out).not.toContain('clientid');
        expect(out).not.toContain('12345');
    });

    test('matches a known SHA-256 truncation (algorithm pin)', () => {
        // Pin the algorithm so a future "improvement" doesn't silently
        // re-hash all production audit logs differently. SHA-256 of the
        // string "abc" → ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
        // → first 12 = "ba7816bf8f01"
        expect(hashServicePrincipalId('abc')).toBe('sp:ba7816bf8f01');
    });
});

// ── 2. spHashForProfile — gate on authMode ──────────────────────────────────
describe('Tier B Day 3 — spHashForProfile', () => {
    test('returns null for PAT profiles', () => {
        expect(spHashForProfile({ host: 'h', token: 'dapi-pat' })).toBeNull();
    });

    test('returns null for profiles missing authMode=oauth-m2m', () => {
        expect(spHashForProfile({ host: 'h', clientId: 'cid' })).toBeNull();
        expect(spHashForProfile({ host: 'h', authMode: 'pat', clientId: 'cid' })).toBeNull();
    });

    test('returns null when authMode=oauth-m2m but clientId is missing', () => {
        expect(spHashForProfile({ host: 'h', authMode: 'oauth-m2m' })).toBeNull();
        expect(spHashForProfile({ host: 'h', authMode: 'oauth-m2m', clientId: '' })).toBeNull();
    });

    test('returns hash for valid OAuth M2M profile', () => {
        const out = spHashForProfile({
            host: 'h',
            authMode: 'oauth-m2m',
            clientId: 'real-sp-clientid',
        });
        expect(out).toMatch(/^sp:[0-9a-f]{12}$/);
    });

    test('returns null for null/undefined input (defensive)', () => {
        expect(spHashForProfile(null)).toBeNull();
        expect(spHashForProfile(undefined)).toBeNull();
    });
});

// ── 3. auditLog — emits spIdentityHash conditionally ────────────────────────
describe('Tier B Day 3 — auditLog includes spIdentityHash', () => {
    function captureAuditLines(fn) {
        const lines = [];
        _logSpy.mockImplementation((tag, line) => {
            if (tag === '[audit]' && typeof line === 'string') lines.push(line);
        });
        fn();
        return lines;
    }
    const fakeReq = {
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'user-agent': 'jest' },
        method: 'GET',
        originalUrl: '/test',
        requestId: 'req-1',
    };

    test('emits spIdentityHash field when supplied', () => {
        const lines = captureAuditLines(() => {
            auditLog(fakeReq, {
                profileName: 'm2m_test',
                action: 'poll',
                status: 'COMPLETED',
                spIdentityHash: 'sp:abc123def456',
            });
        });
        expect(lines.length).toBe(1);
        const parsed = JSON.parse(lines[0]);
        expect(parsed.spIdentityHash).toBe('sp:abc123def456');
        expect(parsed.profile).toBe('m2m_test');
    });

    test('omits spIdentityHash field entirely when not supplied (clean line for PAT profiles)', () => {
        const lines = captureAuditLines(() => {
            auditLog(fakeReq, {
                profileName: 'default',
                action: 'poll',
                status: 'COMPLETED',
            });
        });
        const parsed = JSON.parse(lines[0]);
        expect(parsed).not.toHaveProperty('spIdentityHash');
    });

    test('omits spIdentityHash when explicitly null (no noisy null in line)', () => {
        const lines = captureAuditLines(() => {
            auditLog(fakeReq, {
                profileName: 'default',
                action: 'poll',
                status: 'COMPLETED',
                spIdentityHash: null,
            });
        });
        const parsed = JSON.parse(lines[0]);
        expect(parsed).not.toHaveProperty('spIdentityHash');
    });

    test('audit line never contains the raw clientId — only the hash', () => {
        const RAW = 'raw-sp-clientid-confidential-12345';
        const hash = hashServicePrincipalId(RAW);
        const lines = captureAuditLines(() => {
            auditLog(fakeReq, {
                profileName: 'm2m_test',
                action: 'start',
                status: 200,
                spIdentityHash: hash,
            });
        });
        expect(lines[0]).toContain(hash);
        expect(lines[0]).not.toContain(RAW);
    });
});

// ── 4. Day 4 — 401-invalidation wiring at supervisor / confidence call sites
describe('Tier B Day 4 — 401-invalidation extends to supervisor + /confidence', () => {
    // The wiring is "if msg matches /\b401\b/ AND profile is OAuth M2M, call
    // invalidateOAuthCacheForProfile". We assert the helper directly + then
    // exercise the message-matching predicate the call sites use.
    test('invalidateOAuthCacheForProfile drops a previously-cached OAuth entry', async () => {
        // Prime the cache via the resolve helper using a mocked fetch.
        const fakeFetch = jest.fn().mockResolvedValue({
            ok: true, status: 200,
            json: () => Promise.resolve({ access_token: 'tok-prime', expires_in: 3600 }),
            text: () => Promise.resolve(''),
        });
        const origFetch = global.fetch;
        global.fetch = fakeFetch;
        try {
            const profile = {
                authMode: 'oauth-m2m',
                host: 'https://m2m-401.example.com',
                clientId: 'sp-401',
                clientSecret: 'sec',
            };
            const tok = await resolveDatabricksOAuthToken(profile);
            expect(tok).toBe('tok-prime');
            const cacheKey = 'https://m2m-401.example.com|sp-401';
            expect(oauthTokenCache.has(cacheKey)).toBe(true);

            // Simulate: a downstream 401 fires the invalidation hook.
            expect(invalidateOAuthCacheForProfile(profile)).toBe(true);
            expect(oauthTokenCache.has(cacheKey)).toBe(false);
        } finally {
            global.fetch = origFetch;
        }
    });

    test('the call-site predicate /\\b401\\b/ matches realistic upstream error messages', () => {
        // These are the messages that bubble out of the supervisor stream's
        // raw https.request handler + the helper's "Databricks 401: ..." form.
        const POSITIVE = [
            'Databricks 401: token expired',
            'Non-JSON response: HTTP/1.1 401 Unauthorized',
            'fetch failed with status 401',
            'Auth error: 401 token revoked',
        ];
        const NEGATIVE = [
            'Databricks 503: service unavailable',
            'ECONNRESET',
            'Bad gateway 502',
            // \b boundary check: digits flanking a digit are still word
            // characters, so "4012" / "X401Y" do NOT match \b401\b.
            'Random message containing 4012 not as a word',
            'Failed at line X401Y of the script',
        ];
        const re = /\b401\b/;
        for (const m of POSITIVE) expect(re.test(m)).toBe(true);
        for (const m of NEGATIVE) expect(re.test(m)).toBe(false);
    });

    test('invalidation is a no-op for PAT-based supervisor profiles (defence-in-depth)', () => {
        const patProfile = { host: 'https://h', token: 'dapi-pat' };
        // Even if a 401 fires from a PAT profile, the helper returns false
        // (no cache key to drop) — so the call-site try/catch wraps it
        // safely. This ensures we never accidentally mutate other state.
        expect(invalidateOAuthCacheForProfile(patProfile)).toBe(false);
    });

    test('invalidation never throws on malformed profile input (resilience)', () => {
        // Day 4 wraps each call in try/catch ("invalidation must never
        // throw"). Confirm the helper itself is also resilient.
        expect(() => invalidateOAuthCacheForProfile(null)).not.toThrow();
        expect(() => invalidateOAuthCacheForProfile(undefined)).not.toThrow();
        expect(() => invalidateOAuthCacheForProfile({})).not.toThrow();
        expect(() => invalidateOAuthCacheForProfile({ authMode: 'oauth-m2m' })).not.toThrow();
        // No clientId + no env var → returns false silently.
        const had = Boolean(process.env.DATABRICKS_CLIENT_ID);
        const prev = process.env.DATABRICKS_CLIENT_ID;
        delete process.env.DATABRICKS_CLIENT_ID;
        try {
            expect(invalidateOAuthCacheForProfile({ authMode: 'oauth-m2m' })).toBe(false);
        } finally {
            if (had) process.env.DATABRICKS_CLIENT_ID = prev;
        }
    });

    test('different SP clientIds invalidate independently (no cross-contamination)', async () => {
        const fakeFetch = jest.fn().mockImplementation((_url) => Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve({ access_token: `tok-${Math.random()}`, expires_in: 3600 }),
            text: () => Promise.resolve(''),
        }));
        const origFetch = global.fetch;
        global.fetch = fakeFetch;
        try {
            const profA = {
                authMode: 'oauth-m2m',
                host: 'https://multi.example.com',
                clientId: 'sp-A',
                clientSecret: 'sec',
            };
            const profB = {
                authMode: 'oauth-m2m',
                host: 'https://multi.example.com',
                clientId: 'sp-B',
                clientSecret: 'sec',
            };
            await resolveDatabricksOAuthToken(profA);
            await resolveDatabricksOAuthToken(profB);
            expect(oauthTokenCache.has('https://multi.example.com|sp-A')).toBe(true);
            expect(oauthTokenCache.has('https://multi.example.com|sp-B')).toBe(true);

            // 401 from sp-A only invalidates sp-A.
            invalidateOAuthCacheForProfile(profA);
            expect(oauthTokenCache.has('https://multi.example.com|sp-A')).toBe(false);
            expect(oauthTokenCache.has('https://multi.example.com|sp-B')).toBe(true);
        } finally {
            global.fetch = origFetch;
        }
    });
});
