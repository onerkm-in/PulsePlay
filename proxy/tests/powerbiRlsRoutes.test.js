'use strict';

/**
 * powerbiRlsRoutes.test.js — PBI-RLS fail-closed wiring (2026-06-04).
 *
 * The fail-closed identity resolver (_resolvePowerBIIdentities) was previously
 * wired ONLY into POST /assistant/embed-token/powerbi. The Q&A embed-token route
 * and the deterministic DAX-execution route minted tokens / ran DAX under the
 * service principal with NO effective identity — an RLS bypass for any profile
 * with RLS configured.
 *
 * These tests prove the gate now fires on BOTH routes. NODE_ENV=test bypasses
 * the IdP middleware, so there is never a server-side user claim — an
 * RLS-required profile must therefore be REJECTED (fail-closed). The reject
 * paths fire BEFORE any Microsoft call, so they need no fetch mock and never
 * touch a real endpoint.
 *
 * NOTE: the semantic-model routes select the profile via `body.profile` /
 * `x-assistant-profile` header (NOT `body.assistantProfile`), and fall through
 * to the first configured semantic-model profile when neither is set — so the
 * test MUST pin `profile` to its own fixture to avoid selecting a real
 * config.json profile.
 */

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';

// Profile WITH RLS required + no static username/claim → must fail closed.
process.env.PROXY_PROFILE_PBIRLS_TYPE = 'powerbi-semantic-model';
process.env.PROXY_PROFILE_PBIRLS_POWERBI_GROUP_ID = 'wsp-guid';
process.env.PROXY_PROFILE_PBIRLS_POWERBI_DATASET_ID = 'ds-guid';
process.env.PROXY_PROFILE_PBIRLS_POWER_BI_RLS_REQUIRED = 'true';
process.env.PROXY_PROFILE_PBIRLS_POWER_BI_CLIENT_ID = 'aad-client-id';
process.env.PROXY_PROFILE_PBIRLS_POWER_BI_CLIENT_SECRET = 'AAD_SECRET_NO_LEAK';
process.env.PROXY_PROFILE_PBIRLS_POWER_BI_TENANT_ID = 'aad-tenant-id';

const request = require('supertest');
const {
    app,
    _setPowerBiFetchImplForTests,
    _resetPowerBiTokenCacheForTests,
} = require('../server');

let logSpy, errSpy, warnSpy;
beforeAll(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => { logSpy?.mockRestore(); errSpy?.mockRestore(); warnSpy?.mockRestore(); });
beforeEach(() => { _resetPowerBiTokenCacheForTests?.(); });
afterEach(() => { _setPowerBiFetchImplForTests?.(null); });

describe('PBI-RLS fail-closed — Q&A embed-token route', () => {
    test('RLS-required profile with no resolvable identity → 401, before any Microsoft call', async () => {
        let fetched = false;
        _setPowerBiFetchImplForTests(async () => { fetched = true; throw new Error('should not fetch'); });

        const res = await request(app)
            .post('/powerbi/qna/embed-token')
            .send({ profile: 'pbirls' });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/RLS/i);
        expect(fetched).toBe(false); // gate fires before token issuance — no real call
    });
});

describe('PBI-RLS fail-closed — deterministic DAX route', () => {
    test('RLS-required profile with no resolvable identity → 401, before executeDax', async () => {
        let fetched = false;
        _setPowerBiFetchImplForTests(async () => { fetched = true; throw new Error('should not executeDax'); });

        const res = await request(app)
            .post('/powerbi/conversations/start')
            .send({ profile: 'pbirls', content: 'What is the total sales?' });

        expect(res.status).toBe(401);
        expect(String(JSON.stringify(res.body))).toMatch(/RLS/i);
        expect(fetched).toBe(false); // DAX never executes for an unidentified RLS request
    });
});
