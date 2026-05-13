'use strict';

const MOCK_CONFIG_BASE = {
    port: 0,
    profiles: {
        default: {
            host: 'https://test.azuredatabricks.net',
            token: 'dapi-test-token-abc',
            spaceId: 'space-default-123',
        },
    },
};

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

jest.mock('@azure/identity', () => { throw new Error('not installed'); }, { virtual: true });

const express = require('express');
const request = require('supertest');
const fs = require('fs');
const {
    resolveProxyAuthMode,
    validateProductionAuthConfig,
    normalizeIdpUserClaims,
    sharedKeyMiddleware,
} = require('../server');

async function withEnv(overrides, fn) {
    const previous = {
        NODE_ENV: process.env.NODE_ENV,
        PROXY_AUTH_MODE: process.env.PROXY_AUTH_MODE,
        PROXY_REQUIRE_AUTH: process.env.PROXY_REQUIRE_AUTH,
        PROXY_IDP_REQUIRED: process.env.PROXY_IDP_REQUIRED,
        PROXY_IDP_JWKS_URL: process.env.PROXY_IDP_JWKS_URL,
        PROXY_SHARED_KEY: process.env.PROXY_SHARED_KEY,
        PROXY_KEY: process.env.PROXY_KEY,
        GENIE_PROXY_SHARED_KEY: process.env.GENIE_PROXY_SHARED_KEY,
    };
    for (const key of Object.keys(previous)) delete process.env[key];
    Object.assign(process.env, overrides);
    try {
        return await fn();
    } finally {
        for (const key of Object.keys(previous)) {
            if (previous[key] == null) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
}

function makeAuthHarness({ user } = {}) {
    const app = express();
    app.use(express.json());
    if (user) {
        app.use((req, _res, next) => {
            req.user = user;
            next();
        });
    }
    app.get('/cost', sharedKeyMiddleware, (_req, res) => res.json({ ok: true }));
    return app;
}

let logSpy;
let capturedLogs = [];

beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation((...args) => {
        capturedLogs.push(args.map(String).join(' '));
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

beforeEach(() => {
    capturedLogs = [];
    fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
});

describe('production auth mode resolution', () => {
    test('defaults production to idp-or-shared-key', async () => {
        await withEnv({ NODE_ENV: 'production' }, () => {
            expect(resolveProxyAuthMode(process.env, MOCK_CONFIG_BASE)).toBe('idp-or-shared-key');
        });
    });

    test('defaults dev/test with no key to none', async () => {
        await withEnv({ NODE_ENV: 'test' }, () => {
            expect(resolveProxyAuthMode(process.env, MOCK_CONFIG_BASE)).toBe('none');
        });
    });

    test('preserves legacy shared-key gate when a key is configured without explicit auth mode', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_KEY: 'legacy-secret' }, () => {
            expect(resolveProxyAuthMode(process.env, MOCK_CONFIG_BASE)).toBe('shared-key');
        });
    });

    test('treats PROXY_IDP_REQUIRED as legacy idp mode when no explicit auth mode exists', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_IDP_REQUIRED: 'true' }, () => {
            expect(resolveProxyAuthMode(process.env, MOCK_CONFIG_BASE)).toBe('idp');
        });
    });
});

describe('production auth startup validation', () => {
    test('refuses production PROXY_AUTH_MODE=none', async () => {
        await withEnv({ NODE_ENV: 'production', PROXY_AUTH_MODE: 'none' }, () => {
            const result = validateProductionAuthConfig({ env: process.env, config: MOCK_CONFIG_BASE, idpConfigured: true });
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('auth.production-refuses-none');
        });
    });

    test('refuses production when neither IdP nor shared key is configured', async () => {
        await withEnv({ NODE_ENV: 'production' }, () => {
            const result = validateProductionAuthConfig({ env: process.env, config: MOCK_CONFIG_BASE, idpConfigured: false });
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('auth.missing-idp,auth.missing-shared-key');
        });
    });

    test('allows production idp mode when IdP verification is configured', async () => {
        await withEnv({ NODE_ENV: 'production', PROXY_AUTH_MODE: 'idp' }, () => {
            const result = validateProductionAuthConfig({ env: process.env, config: MOCK_CONFIG_BASE, idpConfigured: true });
            expect(result.ok).toBe(true);
        });
    });

    test('allows production shared-key mode when PROXY_KEY is configured', async () => {
        await withEnv({ NODE_ENV: 'production', PROXY_AUTH_MODE: 'shared-key', PROXY_KEY: 'prod-secret' }, () => {
            const result = validateProductionAuthConfig({ env: process.env, config: MOCK_CONFIG_BASE, idpConfigured: false });
            expect(result.ok).toBe(true);
        });
    });

    test('allows dev/test with no auth configured', async () => {
        await withEnv({ NODE_ENV: 'test' }, () => {
            const result = validateProductionAuthConfig({ env: process.env, config: MOCK_CONFIG_BASE, idpConfigured: false });
            expect(result.ok).toBe(true);
            expect(result.mode).toBe('none');
        });
    });
});

describe('auth mode request enforcement', () => {
    test('shared-key mode accepts valid X-Genie-Key', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_AUTH_MODE: 'shared-key', PROXY_KEY: 'secret-123' }, async () => {
            const res = await request(makeAuthHarness())
                .get('/cost')
                .set('x-genie-key', 'secret-123');
            expect(res.status).toBe(200);
        });
    });

    test('shared-key mode rejects missing key and audits auth.missing-shared-key', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_AUTH_MODE: 'shared-key', PROXY_KEY: 'secret-123' }, async () => {
            const res = await request(makeAuthHarness()).get('/cost');
            expect(res.status).toBe(401);
            expect(capturedLogs.join('\n')).toContain('auth.missing-shared-key');
        });
    });

    test('idp mode accepts an already-verified IdP user', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_AUTH_MODE: 'idp' }, async () => {
            const res = await request(makeAuthHarness({ user: { sub: 'u-1', email: 'u@example.com' } })).get('/cost');
            expect(res.status).toBe(200);
        });
    });

    test('idp mode rejects missing IdP user and audits auth.missing-idp', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_AUTH_MODE: 'idp' }, async () => {
            const res = await request(makeAuthHarness()).get('/cost');
            expect(res.status).toBe(401);
            expect(capturedLogs.join('\n')).toContain('auth.missing-idp');
        });
    });

    test('idp-or-shared-key mode accepts either verified user or shared key', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_AUTH_MODE: 'idp-or-shared-key', PROXY_KEY: 'secret-123' }, async () => {
            const byUser = await request(makeAuthHarness({ user: { preferredUsername: 'u@example.com' } })).get('/cost');
            const byKey = await request(makeAuthHarness()).get('/cost').set('x-pulseplay-key', 'secret-123');
            expect(byUser.status).toBe(200);
            expect(byKey.status).toBe(200);
        });
    });

    test('idp-or-shared-key mode rejects when both credentials are absent', async () => {
        await withEnv({ NODE_ENV: 'test', PROXY_AUTH_MODE: 'idp-or-shared-key', PROXY_KEY: 'secret-123' }, async () => {
            const res = await request(makeAuthHarness()).get('/cost');
            expect(res.status).toBe(401);
            expect(capturedLogs.join('\n')).toContain('auth.missing-idp,auth.missing-shared-key');
        });
    });
});

describe('IdP claim normalization', () => {
    test('preserves the email / preferredUsername / upn fallback chain', () => {
        const user = normalizeIdpUserClaims({
            sub: 'sub-1',
            preferred_username: 'preferred@example.com',
            upn: 'upn@example.com',
            roles: 'Analyst',
            groups: ['app.pulseplay.users'],
        });
        expect(user.email).toBe('preferred@example.com');
        expect(user.preferredUsername).toBe('preferred@example.com');
        expect(user.preferred_username).toBe('preferred@example.com');
        expect(user.upn).toBe('upn@example.com');
        expect(user.roles).toEqual(['Analyst']);
        expect(user.groups).toEqual(['app.pulseplay.users']);
    });
});
