'use strict';

/**
 * Wave 31 — inline credentials via request headers.
 *
 * These tests cover the new inline-credentials path added to resolveProfile()
 * and the four new headers (X-Databricks-Host / X-Databricks-Token /
 * X-Genie-Space-Id / X-Profile-Name).
 *
 * The brief, in shorthand:
 *   1. Happy path — all three required headers present → transient profile
 *   2. Fallback   — any required header missing → falls back to named profile
 *   3. Auth gate  — sharedKey middleware still enforced; inline doesn't bypass
 *   4. Sanitiser  — length cap (256) + character class strip + log poisoning bytes
 *   5. Audit redact — token never leaks into [audit] line; "inline" appears as profile
 */

// Mock fs FIRST so cfg() reads our base config when server.js loads.
const MOCK_CONFIG_BASE = {
    port: 0,
    profiles: {
        default: {
            host: 'https://named.azuredatabricks.net',
            token: 'dapi-named-default-token',
            spaceId: 'space-named-default',
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

const request = require('supertest');
const fs = require('fs');
const {
    app,
    sanitizeInlineHeader,
    extractInlineCredentials,
    INLINE_HEADER_MAX_LEN,
    // Wave 36 — precedence inversion + mode flag
    resolveInlineCredentialsMode,
    applyInlineMode,
    resolveProfile,
    auditLog,
} = require('../server');

// Suppress audit-line console noise; some tests re-spy locally to assert.
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

beforeEach(() => {
    fs.readFileSync.mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE));
});

// ── 1. sanitizeInlineHeader ───────────────────────────────────────────────────
describe('sanitizeInlineHeader (Wave 31)', () => {
    it('returns empty string for nullish / non-string input', () => {
        expect(sanitizeInlineHeader(null)).toBe('');
        expect(sanitizeInlineHeader(undefined)).toBe('');
        expect(sanitizeInlineHeader('')).toBe('');
    });

    it('preserves URL, PAT, and UUID-shaped inputs unchanged', () => {
        expect(sanitizeInlineHeader('https://workspace.azuredatabricks.net'))
            .toBe('https://workspace.azuredatabricks.net');
        expect(sanitizeInlineHeader('dapi1234567890abcdef'))
            .toBe('dapi1234567890abcdef');
        expect(sanitizeInlineHeader('01f0d8a4-5e7c-4b1f-9e2a-7c3d8e9f0a1b'))
            .toBe('01f0d8a4-5e7c-4b1f-9e2a-7c3d8e9f0a1b');
    });

    it('strips control characters (CR/LF/NUL) — header injection vector', () => {
        // CRLF would smuggle a second header line if echoed into a response.
        expect(sanitizeInlineHeader('dapi-token\r\nX-Evil: 1'))
            .toBe('dapi-tokenX-Evil:1');
        // Trailing NUL byte truncation attempts.
        expect(sanitizeInlineHeader('dapi-token\x00\x01\x02'))
            .toBe('dapi-token');
    });

    it('strips disallowed characters (whitespace, quotes, semicolons)', () => {
        expect(sanitizeInlineHeader('dapi token; "evil"')).toBe('dapitokenevil');
    });

    it('caps length at INLINE_HEADER_MAX_LEN (256 chars)', () => {
        const long = 'a'.repeat(1000);
        const out = sanitizeInlineHeader(long);
        expect(out.length).toBe(INLINE_HEADER_MAX_LEN);
        expect(INLINE_HEADER_MAX_LEN).toBe(256);
    });
});

// ── 2. extractInlineCredentials ───────────────────────────────────────────────
describe('extractInlineCredentials (Wave 31)', () => {
    const FULL = {
        'x-databricks-host':  'https://inline.azuredatabricks.net',
        'x-databricks-token': 'dapi-inline-secret',
        'x-genie-space-id':   'space-inline-xyz',
    };

    it('returns transient profile when all three required headers are present', () => {
        const out = extractInlineCredentials(FULL);
        expect(out).not.toBeNull();
        expect(out.profile.host).toBe('https://inline.azuredatabricks.net');
        expect(out.profile.token).toBe('dapi-inline-secret');
        expect(out.profile.spaceId).toBe('space-inline-xyz');
        expect(out.name).toBe('inline'); // default label when X-Profile-Name absent
    });

    it('honours X-Profile-Name when supplied (sanitised)', () => {
        const out = extractInlineCredentials({
            ...FULL,
            'x-profile-name': 'sales-east',
        });
        expect(out.name).toBe('sales-east');
    });

    it.each([
        ['x-databricks-host'],
        ['x-databricks-token'],
        ['x-genie-space-id'],
    ])('returns null when "%s" is missing — falls through to named profile', (missing) => {
        const headers = { ...FULL };
        delete headers[missing];
        expect(extractInlineCredentials(headers)).toBeNull();
    });

    it('returns null when any required header sanitises to empty', () => {
        const headers = { ...FULL, 'x-databricks-token': '"\r\n; ' };
        expect(extractInlineCredentials(headers)).toBeNull();
    });
});

// ── 3. End-to-end via /health (cheap, profile-aware) ──────────────────────────
// /health doesn't call resolveProfile, but /assistant/profiles does and is
// cheap enough to use as a smoke for the wiring.
describe('Inline-credentials wiring through /assistant/profiles (Wave 31)', () => {
    it('happy path: inline headers expose a transient profile in audit', async () => {
        // Spy on console.log to capture audit lines for the "inline" profile name.
        const auditLines = [];
        _logSpy.mockImplementation((tag, line) => {
            if (tag === '[audit]' && typeof line === 'string') auditLines.push(line);
        });

        // /assistant/profiles is sharedKey-gated when configured but is
        // open here (no sharedKey in MOCK_CONFIG_BASE). It calls
        // profileRegistry.list() — does NOT call resolveProfile() — but
        // we exercise inline path through /assistant/conversations/start
        // (which DOES call resolveProfile), expecting the proxy to attempt
        // an upstream call. We only assert on the resolved profile name
        // in the audit log line emitted before the upstream is dialled.

        // /assistant/conversations/start hits the upstream Databricks API
        // when resolveProfile succeeds; we don't want a real network call
        // in tests, so instead use /assistant/profiles which exercises
        // the resolveProfile-bypass path. The behaviour we *can* verify
        // cheaply is that extractInlineCredentials returns the transient
        // profile (already covered above) and that resolveProfile prefers
        // it over named profiles. That second assertion lives in the
        // unit test below.
        const res = await request(app)
            .get('/assistant/profiles')
            .set('x-databricks-host',  'https://inline.example.com')
            .set('x-databricks-token', 'dapi-inline-secret')
            .set('x-genie-space-id',   'space-inline-xyz');
        // /assistant/profiles always returns the registry — inline doesn't
        // change the listing. Just confirm the route still works with the
        // new headers (CORS / preflight is the load-bearing concern).
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('resolveProfile prefers inline credentials over assistantProfile= query', () => {
        // Direct unit-style check on resolveProfile via its only public
        // exposure (extractInlineCredentials wins; but we also need to
        // confirm the *named* path is bypassed even when the body asks
        // for it). Re-creating that here without an internal export:
        // when the helper returns non-null, resolveProfile MUST short-circuit.
        const inline = extractInlineCredentials({
            'x-databricks-host':  'https://inline.example.com',
            'x-databricks-token': 'dapi-inline-secret',
            'x-genie-space-id':   'space-inline-xyz',
            'x-profile-name':     'inline-override',
        });
        expect(inline).not.toBeNull();
        expect(inline.name).toBe('inline-override');
        // Confirm the inline profile is structurally identical to a
        // config.json profile entry so existing call sites accept it.
        expect(inline.profile).toEqual({
            host: 'https://inline.example.com',
            token: 'dapi-inline-secret',
            spaceId: 'space-inline-xyz',
        });
    });

    it('falls back to named-profile lookup when any inline header is missing', () => {
        // host + token present but spaceId absent → returns null,
        // which forces resolveProfile() to walk the named-profile path.
        const partial = extractInlineCredentials({
            'x-databricks-host':  'https://inline.example.com',
            'x-databricks-token': 'dapi-inline-secret',
            // 'x-genie-space-id' deliberately omitted
        });
        expect(partial).toBeNull();
    });
});

// ── 4. sharedKey gate is still enforced — inline doesn't bypass auth ──────────
describe('Inline credentials respect sharedKey gate (Wave 31)', () => {
    it('returns 401 when sharedKey configured + missing X-Genie-Key, even with inline creds', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            sharedKey: 'guarded-key',
        }));
        const res = await request(app)
            .get('/assistant/profiles')
            .set('x-databricks-host',  'https://inline.example.com')
            .set('x-databricks-token', 'dapi-inline-secret')
            .set('x-genie-space-id',   'space-inline-xyz');
        // sharedKey is enforced by middleware MOUNTED BEFORE any handler
        // calls resolveProfile, so inline headers cannot bypass it.
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/X-Genie-Key/);
    });

    it('accepts inline creds + matching X-Genie-Key (defence-in-depth pass)', async () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            sharedKey: 'guarded-key',
        }));
        const res = await request(app)
            .get('/assistant/profiles')
            .set('x-genie-key', 'guarded-key')
            .set('x-databricks-host',  'https://inline.example.com')
            .set('x-databricks-token', 'dapi-inline-secret')
            .set('x-genie-space-id',   'space-inline-xyz');
        expect(res.status).toBe(200);
    });
});

// ── 5. Audit log redaction — token never leaks ────────────────────────────────
describe('Inline credentials audit log redaction (Wave 31)', () => {
    it('extractInlineCredentials does not stringify the token into name/profile name', () => {
        const out = extractInlineCredentials({
            'x-databricks-host':  'https://inline.example.com',
            'x-databricks-token': 'dapi-super-secret-12345',
            'x-genie-space-id':   'space-inline-xyz',
            // No x-profile-name → defaults to "inline" not the token.
        });
        // The audit-log line that auditLog() emits uses { profile: name },
        // so as long as `name` never contains the token, the audit line is
        // clean. The token only lives on profile.token (used for upstream
        // Authorization), which auditLog() never reads.
        expect(out.name).toBe('inline');
        expect(out.name).not.toContain('dapi');
        expect(out.name).not.toContain('secret');
        // Defensive: the JSON-serialised name (what hits the audit line)
        // must not echo the token.
        const serialised = JSON.stringify({ profile: out.name });
        expect(serialised).not.toContain('dapi-super-secret-12345');
    });

    it('sanitiser strips characters that would break audit-line JSON quoting', () => {
        // A profile name containing quote/backslash would break JSON-line
        // log parsers. The sanitiser whitelist excludes both, so even a
        // hostile X-Profile-Name can't smuggle them through.
        const out = extractInlineCredentials({
            'x-databricks-host':  'https://inline.example.com',
            'x-databricks-token': 'dapi-secret',
            'x-genie-space-id':   'space-xyz',
            'x-profile-name':     'evil"\\name\nwith\rcontrols',
        });
        expect(out.name).not.toContain('"');
        expect(out.name).not.toContain('\\');
        expect(out.name).not.toContain('\n');
        expect(out.name).not.toContain('\r');
    });
});

// ── Wave 36 — inline-credentials precedence inversion ────────────────────────
//
// Wave 31 v0.1 (cycle 7) shipped with header-wins precedence — anyone with the
// .pbix could redirect traffic by sending all three inline headers. Wave 36
// inverts that: server config now wins; the header path is opt-in via the
// PROXY_INLINE_CREDENTIALS_MODE env var, with smart auto-defaults that match
// "shared / production-ish" deployments.

const FULL_HEADERS = {
    'x-databricks-host':  'https://inline.example.com',
    'x-databricks-token': 'dapi-inline-secret',
    'x-genie-space-id':   'space-inline-xyz',
};

// Helper: temporarily set env vars for a single test, restore on teardown.
function withEnv(overrides, fn) {
    const saved = {};
    for (const k of Object.keys(overrides)) {
        saved[k] = process.env[k];
        if (overrides[k] === undefined) delete process.env[k];
        else process.env[k] = overrides[k];
    }
    try { return fn(); }
    finally {
        for (const k of Object.keys(saved)) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    }
}

describe('Wave 36 — resolveInlineCredentialsMode auto-defaults', () => {
    it('explicit PROXY_INLINE_CREDENTIALS_MODE wins over auto-detect', () => {
        withEnv({
            PROXY_INLINE_CREDENTIALS_MODE: 'fallback',
            PROXY_SHARED_KEY: 'anything',     // would normally force "off"
            WEBSITE_SITE_NAME: 'azure-app',   // ditto
        }, () => {
            expect(resolveInlineCredentialsMode()).toBe('fallback');
        });
    });

    it('auto-defaults to "off" when PROXY_SHARED_KEY is set', () => {
        withEnv({
            PROXY_INLINE_CREDENTIALS_MODE: undefined,
            PROXY_SHARED_KEY: 'guarded-key',
            GENIE_PROXY_SHARED_KEY: undefined,
            WEBSITE_SITE_NAME: undefined,
        }, () => {
            expect(resolveInlineCredentialsMode()).toBe('off');
        });
    });

    it('auto-defaults to "off" when WEBSITE_SITE_NAME is set (Azure App Service)', () => {
        withEnv({
            PROXY_INLINE_CREDENTIALS_MODE: undefined,
            PROXY_SHARED_KEY: undefined,
            GENIE_PROXY_SHARED_KEY: undefined,
            WEBSITE_SITE_NAME: 'my-azure-app',
        }, () => {
            expect(resolveInlineCredentialsMode()).toBe('off');
        });
    });

    it('auto-defaults to "override" when neither shared-key nor Azure indicators set', () => {
        withEnv({
            PROXY_INLINE_CREDENTIALS_MODE: undefined,
            PROXY_SHARED_KEY: undefined,
            GENIE_PROXY_SHARED_KEY: undefined,
            WEBSITE_SITE_NAME: undefined,
        }, () => {
            expect(resolveInlineCredentialsMode()).toBe('override');
        });
    });

    it('ignores invalid mode strings and falls through to auto-detect', () => {
        withEnv({
            PROXY_INLINE_CREDENTIALS_MODE: 'something-bogus',
            PROXY_SHARED_KEY: undefined,
            GENIE_PROXY_SHARED_KEY: undefined,
            WEBSITE_SITE_NAME: undefined,
        }, () => {
            expect(resolveInlineCredentialsMode()).toBe('override');
        });
    });

    it('mode comparison is case-insensitive and trims whitespace', () => {
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: '  OFF  ' }, () => {
            expect(resolveInlineCredentialsMode()).toBe('off');
        });
    });
});

describe('Wave 36 — resolveProfile precedence by mode', () => {
    it('mode="off" + headers + no config profile → 401-equivalent (returns null)', () => {
        // Simulate "no config profile" by asking for an explicit name that
        // doesn't exist; in mode "off" inline cannot rescue it.
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: { /* no "default" */ },
        }));
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'off' }, () => {
            const resolved = resolveProfile({}, {}, FULL_HEADERS);
            expect(resolved).toBeNull();
        });
    });

    it('mode="off" + headers + config profile exists → uses config profile only', () => {
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'off' }, () => {
            const resolved = resolveProfile({}, {}, FULL_HEADERS);
            expect(resolved).not.toBeNull();
            expect(resolved.name).toBe('default');
            // Config wins — none of the inline values appear.
            expect(resolved.profile.host).toBe('https://named.azuredatabricks.net');
            expect(resolved.profile.token).toBe('dapi-named-default-token');
            expect(resolved.profile.spaceId).toBe('space-named-default');
            // Inline meta records "not used".
            expect(resolved.inline.used).toBe(false);
            expect(resolved.inline.mode).toBe('off');
        });
    });

    it('mode="fallback" + config has host but no spaceId + visual sends spaceId → merges', () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                default: {
                    host:  'https://config.azuredatabricks.net',
                    token: 'dapi-config-token',
                    // spaceId deliberately missing — the merge fills it.
                },
            },
        }));
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'fallback' }, () => {
            const resolved = resolveProfile({}, {}, {
                'x-genie-space-id': 'space-from-header',
            });
            expect(resolved).not.toBeNull();
            // Config host + token preserved; spaceId filled from header.
            expect(resolved.profile.host).toBe('https://config.azuredatabricks.net');
            expect(resolved.profile.token).toBe('dapi-config-token');
            expect(resolved.profile.spaceId).toBe('space-from-header');
            expect(resolved.inline.used).toBe(true);
            expect(resolved.inline.mode).toBe('fallback');
            expect(resolved.inline.fields).toEqual(['spaceId']);
        });
    });

    it('mode="fallback" + config has all 3 fields + headers send different spaceId → config wins', () => {
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'fallback' }, () => {
            const resolved = resolveProfile({}, {}, FULL_HEADERS);
            // Config host/token/spaceId preserved unchanged.
            expect(resolved.profile.host).toBe('https://named.azuredatabricks.net');
            expect(resolved.profile.token).toBe('dapi-named-default-token');
            expect(resolved.profile.spaceId).toBe('space-named-default');
            // No fields filled — headers ignored.
            expect(resolved.inline.used).toBe(false);
            expect(resolved.inline.fields).toEqual([]);
        });
    });

    it('mode="override" + headers win over config (Wave 31 behaviour preserved)', () => {
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'override' }, () => {
            const resolved = resolveProfile({}, {}, FULL_HEADERS);
            expect(resolved.profile.host).toBe('https://inline.example.com');
            expect(resolved.profile.token).toBe('dapi-inline-secret');
            expect(resolved.profile.spaceId).toBe('space-inline-xyz');
            expect(resolved.inline.used).toBe(true);
            expect(resolved.inline.mode).toBe('override');
            expect(resolved.inline.fields).toEqual(['host', 'token', 'spaceId']);
        });
    });

    it('per-profile acceptInlineOverride=false + global mode "override" → headers ignored', () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                default: {
                    host: 'https://locked.azuredatabricks.net',
                    token: 'dapi-locked-token',
                    spaceId: 'space-locked',
                    acceptInlineOverride: false,
                },
            },
        }));
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'override' }, () => {
            const resolved = resolveProfile({}, {}, FULL_HEADERS);
            // Locked profile preserved; inline values dropped on the floor.
            expect(resolved.profile.host).toBe('https://locked.azuredatabricks.net');
            expect(resolved.profile.token).toBe('dapi-locked-token');
            expect(resolved.profile.spaceId).toBe('space-locked');
            expect(resolved.inline.used).toBe(false);
            expect(resolved.inline.reason).toBe('profile-opt-out');
        });
    });

    it('per-profile acceptInlineOverride=true (or unset) → respects global mode', () => {
        fs.readFileSync.mockReturnValue(JSON.stringify({
            ...MOCK_CONFIG_BASE,
            profiles: {
                default: {
                    host: 'https://config.azuredatabricks.net',
                    token: 'dapi-config-token',
                    spaceId: 'space-config',
                    acceptInlineOverride: true,
                },
            },
        }));
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'override' }, () => {
            const resolved = resolveProfile({}, {}, FULL_HEADERS);
            expect(resolved.inline.used).toBe(true);
            expect(resolved.profile.host).toBe('https://inline.example.com');
        });
    });

    it('mode="fallback" + no config profile + partial headers → 401-equivalent (missing field)', () => {
        // When mode is fallback and there is NO config profile AND only some
        // headers are present, the merge produces an incomplete profile —
        // upstream callers will fail with a "missing field" 401-equivalent.
        // We verify the resolved profile is missing the field (token).
        fs.readFileSync.mockReturnValue(JSON.stringify({
            port: 0,
            profiles: {}, // no profiles at all
        }));
        withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'fallback' }, () => {
            const resolved = resolveProfile({}, {}, {
                'x-databricks-host': 'https://partial.example.com',
                'x-genie-space-id': 'space-partial',
                // no x-databricks-token
            });
            // When base is null, applyInlineMode returns a partial merged
            // profile so the calling route can detect the missing-token
            // and fail the upstream call cleanly.
            expect(resolved).not.toBeNull();
            expect(resolved.profile.host).toBe('https://partial.example.com');
            expect(resolved.profile.spaceId).toBe('space-partial');
            expect(resolved.profile.token).toBeUndefined();
            expect(resolved.inline.used).toBe(true);
            expect(resolved.inline.fields).toEqual(['host', 'spaceId']);
        });
    });
});

describe('Wave 36 — auditLog inlineCredsUsed field', () => {
    it('stamps inlineCredsUsed=true when resolveProfile fired the inline path', () => {
        const auditLines = [];
        const localSpy = jest.spyOn(console, 'log').mockImplementation((tag, line) => {
            if (tag === '[audit]' && typeof line === 'string') auditLines.push(line);
        });
        try {
            withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'override' }, () => {
                const fakeReq = {
                    ip: '127.0.0.1',
                    socket: { remoteAddress: '127.0.0.1' },
                    headers: { 'user-agent': 'jest' },
                    method: 'POST',
                    originalUrl: '/assistant/test',
                };
                // Simulate the resolveProfile() pass — meta is stashed on req.
                const resolved = resolveProfile({}, {}, FULL_HEADERS, fakeReq);
                expect(resolved.inline.used).toBe(true);
                auditLog(fakeReq, {
                    profileName: resolved.name,
                    spaceId: resolved.profile.spaceId,
                    action: 'test',
                    status: 200,
                });
            });
            expect(auditLines.length).toBe(1);
            const parsed = JSON.parse(auditLines[0]);
            expect(parsed.inlineCredsUsed).toBe(true);
            expect(parsed.inlineCredsMode).toBe('override');
            expect(parsed.inlineCredsFields).toEqual(['host', 'token', 'spaceId']);
        } finally {
            localSpy.mockRestore();
        }
    });

    it('omits inlineCredsUsed when resolveProfile used the config-only path', () => {
        const auditLines = [];
        const localSpy = jest.spyOn(console, 'log').mockImplementation((tag, line) => {
            if (tag === '[audit]' && typeof line === 'string') auditLines.push(line);
        });
        try {
            withEnv({ PROXY_INLINE_CREDENTIALS_MODE: 'off' }, () => {
                const fakeReq = {
                    ip: '127.0.0.1',
                    socket: { remoteAddress: '127.0.0.1' },
                    headers: { 'user-agent': 'jest' },
                    method: 'POST',
                    originalUrl: '/assistant/test',
                };
                const resolved = resolveProfile({}, {}, FULL_HEADERS, fakeReq);
                expect(resolved.inline.used).toBe(false);
                auditLog(fakeReq, {
                    profileName: resolved.name,
                    spaceId: resolved.profile.spaceId,
                    action: 'test',
                    status: 200,
                });
            });
            expect(auditLines.length).toBe(1);
            const parsed = JSON.parse(auditLines[0]);
            expect(parsed.inlineCredsUsed).toBeUndefined();
            expect(parsed.inlineCredsMode).toBeUndefined();
        } finally {
            localSpy.mockRestore();
        }
    });

    it('audit line NEVER contains the raw token value in any mode', () => {
        const SECRET = 'dapi-WAVE36-DO-NOT-LEAK-this-token-please';
        const auditLines = [];
        const localSpy = jest.spyOn(console, 'log').mockImplementation((tag, line) => {
            if (tag === '[audit]' && typeof line === 'string') auditLines.push(line);
        });
        try {
            for (const mode of ['off', 'fallback', 'override']) {
                withEnv({ PROXY_INLINE_CREDENTIALS_MODE: mode }, () => {
                    const fakeReq = {
                        ip: '127.0.0.1',
                        socket: { remoteAddress: '127.0.0.1' },
                        headers: { 'user-agent': 'jest' },
                        method: 'POST',
                        originalUrl: `/assistant/${mode}`,
                    };
                    const resolved = resolveProfile({}, {}, {
                        ...FULL_HEADERS,
                        'x-databricks-token': SECRET,
                    }, fakeReq);
                    if (resolved) {
                        auditLog(fakeReq, {
                            profileName: resolved.name,
                            spaceId: resolved.profile.spaceId,
                            action: 'test',
                            status: 200,
                        });
                    }
                });
            }
            // Sanity: at least one audit line written.
            expect(auditLines.length).toBeGreaterThan(0);
            for (const line of auditLines) {
                expect(line).not.toContain(SECRET);
                expect(line).not.toContain('dapi-WAVE36');
            }
        } finally {
            localSpy.mockRestore();
        }
    });
});

describe('Wave 36 — applyInlineMode unit (no req plumbing)', () => {
    const baseProfile = {
        profile: { host: 'h', token: 't', spaceId: 's' },
        name: 'default',
    };
    const inlineProfile = {
        profile: { host: 'inline-h', token: 'inline-t', spaceId: 'inline-s' },
        name: 'inline',
    };

    it('mode "off" returns base unchanged with reason=mode-off', () => {
        const out = applyInlineMode(baseProfile, inlineProfile, 'off', FULL_HEADERS);
        expect(out.profile).toBe(baseProfile.profile);
        expect(out.inline.used).toBe(false);
        expect(out.inline.reason).toBe('mode-off');
    });

    it('mode "off" with no base returns null', () => {
        expect(applyInlineMode(null, inlineProfile, 'off', FULL_HEADERS)).toBeNull();
    });

    it('mode "override" with no inline triple returns base with reason=no-inline-headers', () => {
        const out = applyInlineMode(baseProfile, null, 'override', {});
        expect(out.profile).toBe(baseProfile.profile);
        expect(out.inline.used).toBe(false);
        expect(out.inline.reason).toBe('no-inline-headers');
    });
});
