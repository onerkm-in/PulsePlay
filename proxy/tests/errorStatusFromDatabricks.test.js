'use strict';

/**
 * errorStatusFromDatabricks.test.js — Slice 1c P0-4 coverage.
 *
 * The locked Error Intelligence Layer requires that NO upstream
 * authentication / token-acquisition error leaks raw credentials,
 * client_id detail, or upstream response bodies to the client. The
 * normalizer at proxy/server.js:errorStatusFromDatabricks() is the
 * single chokepoint that 14 call sites currently route through; this
 * file pins the recognised error shapes so a future refactor can't
 * silently drop one.
 *
 * Recognised shapes (in match-precedence order):
 *   1. "Databricks OAuth token request failed (NNN): <detail>"
 *      — from resolveDatabricksOAuthToken() /oidc/v1/token failures
 *   2. "Azure AD response missing access_token"
 *   3. "Power BI GenerateToken response missing token"
 *      — from /assistant/embed-token/* IdP contract violations
 *   4. "Databricks NNN: <detail>"
 *      — from databricksRequest() generic upstream errors
 *
 * Anything else falls through to fallbackStatus with the raw message
 * (Slice 1d territory; this file does not assert that path).
 */

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';

const { errorStatusFromDatabricks, oauthTokenCache } = require('../server');

describe('errorStatusFromDatabricks — existing Databricks NNN: shapes (regression)', () => {
    test('401 from databricksRequest returns 401 + auth-failure sentinel', () => {
        const out = errorStatusFromDatabricks(new Error('Databricks 401: invalid token'));
        expect(out.status).toBe(401);
        expect(out.error).toMatch(/Databricks authentication failed/i);
        // Never leaks the raw upstream detail.
        expect(out.error).not.toContain('invalid token');
    });

    test('403 returns 403 + same auth-failure sentinel', () => {
        const out = errorStatusFromDatabricks(new Error('Databricks 403: forbidden'));
        expect(out.status).toBe(403);
        expect(out.error).toMatch(/Databricks authentication failed/i);
    });

    test('500 returns 500 + redacted message', () => {
        const out = errorStatusFromDatabricks(new Error("Databricks 500: column 'CUSTOMER_AGE' not found in table 'SALES'"));
        expect(out.status).toBe(500);
        expect(out.error).toContain('column [redacted]');
        expect(out.error).toContain('table [redacted]');
        expect(out.error).not.toContain('CUSTOMER_AGE');
        expect(out.error).not.toContain('SALES');
    });

    test('401 with a profile arg invalidates the OAuth cache', () => {
        // Seed a cache entry so we can prove deletion.
        const cacheKey = 'https://dbc-test.cloud.databricks.com|test-client-id';
        oauthTokenCache.set(cacheKey, { token: 'stub', expiresAt: Date.now() + 60000, refreshPromise: null });
        expect(oauthTokenCache.has(cacheKey)).toBe(true);

        const profile = {
            authMode: 'oauth-m2m',
            clientId: 'test-client-id',
            host: 'https://dbc-test.cloud.databricks.com',
        };
        errorStatusFromDatabricks(new Error('Databricks 401: token revoked'), 500, profile);
        expect(oauthTokenCache.has(cacheKey)).toBe(false);
    });
});

describe('errorStatusFromDatabricks — Slice 1c OAuth-acquisition shape (P0-4)', () => {
    test('"Databricks OAuth token request failed (401)" returns 401 + credential sentinel', () => {
        const out = errorStatusFromDatabricks(
            new Error('Databricks OAuth token request failed (401): {"error":"unauthorized_client","error_description":"Client authentication failed"}'),
        );
        expect(out.status).toBe(401);
        expect(out.error).toMatch(/OAuth token acquisition failed/i);
        expect(out.error).toMatch(/client_id.*client_secret/i);
        // Never leaks the raw OIDC error_description or client_id.
        expect(out.error).not.toContain('unauthorized_client');
        expect(out.error).not.toContain('Client authentication failed');
    });

    test('"Databricks OAuth token request failed (400)" normalizes 400 → 401 (always a credential issue from client POV)', () => {
        const out = errorStatusFromDatabricks(
            new Error('Databricks OAuth token request failed (400): invalid_grant'),
        );
        // 400 from /oidc/v1/token means invalid_grant — credential issue. The
        // playground's auth-error UX is the right outcome → coerce to 401.
        expect(out.status).toBe(401);
        expect(out.error).toMatch(/OAuth token acquisition failed/i);
        expect(out.error).not.toContain('invalid_grant');
    });

    test('"Databricks OAuth token request failed (403)" preserves 403', () => {
        const out = errorStatusFromDatabricks(
            new Error('Databricks OAuth token request failed (403): forbidden scope'),
        );
        expect(out.status).toBe(403);
    });

    test('"Databricks OAuth token request failed (500)" normalizes 5xx → 401 (still treat as credential UX)', () => {
        const out = errorStatusFromDatabricks(
            new Error('Databricks OAuth token request failed (500): server error'),
        );
        // /oidc/v1/token 5xx is rare but when it happens the client-facing answer
        // is still "fix your credentials or retry"; surface as 401 not 500.
        expect(out.status).toBe(401);
        expect(out.error).not.toContain('server error');
    });

    test('OAuth-acquisition failure with profile invalidates the OAuth cache', () => {
        const cacheKey = 'https://dbc-acq.cloud.databricks.com|acq-client-id';
        oauthTokenCache.set(cacheKey, { token: 'stub', expiresAt: Date.now() + 60000, refreshPromise: null });
        expect(oauthTokenCache.has(cacheKey)).toBe(true);

        const profile = {
            authMode: 'oauth-m2m',
            clientId: 'acq-client-id',
            host: 'https://dbc-acq.cloud.databricks.com',
        };
        errorStatusFromDatabricks(
            new Error('Databricks OAuth token request failed (401): unauthorized_client'),
            500,
            profile,
        );
        expect(oauthTokenCache.has(cacheKey)).toBe(false);
    });

    test('OAuth-acquisition failure without profile does not throw on missing cache helper', () => {
        // Defensive: 14 call sites pass profile, but a few might not (e.g.,
        // a thrown error from a non-Databricks context). Must not throw.
        expect(() => errorStatusFromDatabricks(
            new Error('Databricks OAuth token request failed (401): missing profile case'),
            500,
            undefined,
        )).not.toThrow();
    });
});

describe('errorStatusFromDatabricks — Slice 1c missing-token contract violations', () => {
    test('"Azure AD response missing access_token" returns 502 + safe sentinel', () => {
        const out = errorStatusFromDatabricks(new Error('Azure AD response missing access_token'));
        expect(out.status).toBe(502);
        expect(out.error).toMatch(/Upstream identity provider/i);
        expect(out.error).not.toContain('access_token');
    });

    test('"Power BI GenerateToken response missing token" returns 502 + same sentinel', () => {
        const out = errorStatusFromDatabricks(new Error('Power BI GenerateToken response missing token'));
        expect(out.status).toBe(502);
        expect(out.error).toMatch(/Upstream identity provider/i);
    });
});

describe('errorStatusFromDatabricks — fallback', () => {
    test('unrecognised shape falls through to fallbackStatus (Slice 1d territory)', () => {
        // Sentinel-detail enforcement is Slice 1d — Slice 1c only locks the
        // OAuth shapes. This test pins the current behaviour so a Slice 1d
        // change to redact this path shows up as an intentional test update.
        const out = errorStatusFromDatabricks(new Error('totally unrelated error string'), 503);
        expect(out.status).toBe(503);
        expect(out.error).toBe('totally unrelated error string');
    });

    test('default fallbackStatus is 500', () => {
        const out = errorStatusFromDatabricks(new Error('some other error'));
        expect(out.status).toBe(500);
    });
});

describe('errorStatusFromDatabricks — match precedence', () => {
    test('OAuth-acquisition shape wins over the generic "Databricks NNN:" shape when both could match a substring', () => {
        // The OAuth shape begins with "Databricks OAuth token request failed (NNN)"
        // which does NOT match the /Databricks\s+(\d{3})\s*:/ regex (no `:`
        // immediately after the status). Confirm we route the dedicated OAuth
        // branch and never fall through to the generic redaction path.
        const out = errorStatusFromDatabricks(
            new Error('Databricks OAuth token request failed (401): outer'),
        );
        expect(out.status).toBe(401);
        expect(out.error).toMatch(/OAuth token acquisition failed/i);
        // Generic auth-failure sentinel would have said "Databricks authentication failed" instead.
        expect(out.error).not.toMatch(/Databricks authentication failed/i);
    });
});
