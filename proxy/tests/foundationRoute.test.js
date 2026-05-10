/**
 * foundationRoute.test.js — Cycle 47.6 + 47.7
 *
 * Express-route tests for /foundation/health and /foundation/section.
 * Wires up an env-var-loaded foundation-model profile, then patches in
 * foundationModelEndpoint via the exported profileRegistry (env-var
 * convention doesn't currently include that field, but config.json does).
 */

const request = require('supertest');

// Set up env BEFORE requiring the server so loadEnvProfiles picks it up.
// In NODE_ENV=test the cfg() helper re-reads + re-merges on every call, so
// in-memory mutations are thrown away — we set ALL the profile fields via
// env vars (cycle 47.6 added FOUNDATION_MODEL_ENDPOINT to the field map
// for exactly this kind of deployment).
process.env.NODE_ENV = 'test';
process.env.PROXY_PROFILE_FOUNDATION_TYPE = 'foundation-model';
process.env.PROXY_PROFILE_FOUNDATION_HOST = 'https://dbc-test.cloud.databricks.com';
process.env.PROXY_PROFILE_FOUNDATION_TOKEN = 'dapi_test';
process.env.PROXY_PROFILE_FOUNDATION_FOUNDATION_MODEL_ENDPOINT = 'databricks-meta-llama-3-1-405b-instruct';

const { app, profileRegistry } = require('../server');

describe('GET /foundation/health', () => {
    test('reports configured profiles when foundation-model profile is wired', () => {
        return request(app).get('/foundation/health').then(res => {
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.configuredProfiles.length).toBeGreaterThanOrEqual(1);
            const found = res.body.configuredProfiles.find(c => c.profile === 'foundation');
            expect(found).toBeTruthy();
            expect(found.endpoint).toBe('databricks-meta-llama-3-1-405b-instruct');
            expect(res.body.sectionPresets).toEqual(expect.arrayContaining(['recommendedActions', 'risks', 'opportunities']));
        });
    });
});

describe('POST /foundation/section', () => {
    test('400 when userPrompt is missing (profile resolves first, so message points at userPrompt)', () => {
        return request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', sectionTitle: 'RECOMMENDED ACTIONS' })
            .then(res => {
                expect(res.status).toBe(400);
                expect(res.body.error).toMatch(/userPrompt is required/);
            });
    });

    test('400 when explicit profile name does not resolve to a foundation profile', () => {
        return request(app)
            .post('/foundation/section')
            .send({ profile: 'no-such-profile', userPrompt: 'hi' })
            .then(res => {
                expect(res.status).toBe(400);
                expect(res.body.error).toMatch(/No foundation-model profile/);
            });
    });

    test('400 when explicit profile name belongs to a non-foundation profile', () => {
        // 'customer' / 'sales' / 'hse' / 'ops' load from real config.json
        // (Genie profiles, not foundation-model). Confirm we reject them.
        const allNames = profileRegistry.list();
        const nonFoundation = allNames.find(n => {
            const p = profileRegistry.get(n);
            return p && p.type !== 'foundation-model' && p.type !== 'foundation';
        });
        if (!nonFoundation) return; // skip if no non-foundation profile present
        return request(app)
            .post('/foundation/section')
            .send({ profile: nonFoundation, userPrompt: 'hi' })
            .then(res => {
                expect(res.status).toBe(400);
                expect(res.body.error).toMatch(/No foundation-model profile/);
            });
    });
});
