/**
 * connectorManifests.test.js — Cycle 20 / S1 (2026-05-20).
 *
 * Acceptance tests adopted from PR #8 §12 + Codex's "Test bar" section.
 *
 * Covers:
 *   - The manifest table validates cleanly (12 entries, vendor-grouped).
 *   - Manifest schema enforcement (reject malformed manifests).
 *   - Registry list/get/filter contract.
 *   - matchProfileToConnectors() soft-migration (Q1):
 *       * profile.type === 'genie' → ['genie']
 *       * profile.spaceId without type (legacy) → ['genie']
 *       * profile.type === 'powerbi-semantic-model' (legacy combined) →
 *         ['powerbi-dataset-dax', 'powerbi-dataset-qna']
 *   - describeRuntimeState() shape + secret-status derivation.
 *   - Secrets NEVER appear in describeRuntimeState() output.
 *   - GET /assistant/connector-types returns the response shape locked
 *     in PR #8 §12 "S1 scope (committed) #4".
 */

'use strict';

const request = require('supertest');
const {
    MANIFESTS,
    validation,
} = require('../lib/connectorManifests');
const {
    listManifests,
    getManifest,
    matchProfileToConnectors,
    describeRuntimeState,
} = require('../lib/connectorRegistry');
const {
    validateManifest,
    validateManifests,
} = require('../lib/connectorManifestSchema');

describe('connectorManifests — table integrity (S1)', () => {
    test('exports exactly 12 manifests', () => {
        expect(MANIFESTS).toHaveLength(12);
    });

    test('all 12 manifests validate cleanly at module load', () => {
        expect(validation.ok).toBe(true);
    });

    test('every manifest has a unique id', () => {
        const ids = MANIFESTS.map(m => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('brand grid covers Microsoft / Azure / AWS / Databricks / Demo', () => {
        const categories = new Set(MANIFESTS.map(m => m.category));
        expect([...categories].sort()).toEqual(['aws', 'azure', 'databricks', 'demo', 'microsoft']);
    });

    test('Q9 PBI split: powerbi-dataset-dax + powerbi-dataset-qna both present', () => {
        const ids = MANIFESTS.map(m => m.id);
        expect(ids).toContain('powerbi-dataset-dax');
        expect(ids).toContain('powerbi-dataset-qna');
    });

    test('Q9 OpenAI split: chat + analytics both present', () => {
        const ids = MANIFESTS.map(m => m.id);
        expect(ids).toContain('azure-openai-chat');
        expect(ids).toContain('azure-openai-analytics');
    });

    test('Q9 Bedrock split: direct + RAG both present', () => {
        const ids = MANIFESTS.map(m => m.id);
        expect(ids).toContain('bedrock-direct');
        expect(ids).toContain('bedrock-rag');
    });

    test('Q9 Genie stays single (no split)', () => {
        const genie = MANIFESTS.filter(m => m.id === 'genie' || m.id.startsWith('genie-'));
        expect(genie).toHaveLength(1);
        expect(genie[0].id).toBe('genie');
    });

    test('Q8 every manifest declares capabilities as a boolean map', () => {
        for (const m of MANIFESTS) {
            expect(typeof m.capabilities).toBe('object');
            for (const v of Object.values(m.capabilities)) {
                expect(typeof v).toBe('boolean');
            }
        }
    });

    test('PBI manifests use canonical AAD field names (aadTenantId / aadClientId / aadClientSecret)', () => {
        for (const id of ['powerbi-dataset-dax', 'powerbi-dataset-qna']) {
            const m = getManifest(id);
            expect(m.profileSchema).toHaveProperty('aadTenantId');
            expect(m.profileSchema).toHaveProperty('aadClientId');
            expect(m.profileSchema).toHaveProperty('aadClientSecret');
            expect(m.profileSchema.aadClientSecret.secret).toBe(true);
            expect(m.profileSchema.aadClientSecret.kind).toBe('secret');
        }
    });

    test('PBI Q&A does NOT expose powerbiReportId (Codex Q9 §5 — would look important while doing nothing)', () => {
        const qna = getManifest('powerbi-dataset-qna');
        expect(qna.profileSchema).not.toHaveProperty('powerbiReportId');
    });

    test('PBI Q&A does NOT expose tokenLifetimeMinutes (Codex Q9 §5 — runtime does not accept it yet)', () => {
        const qna = getManifest('powerbi-dataset-qna');
        expect(qna.profileSchema).not.toHaveProperty('tokenLifetimeMinutes');
    });

    test('PBI DAX does NOT expose daxTemplateAllowList / daxQueryTimeoutMs / daxResultCacheTtlSec (Codex Q9 §5)', () => {
        const dax = getManifest('powerbi-dataset-dax');
        expect(dax.profileSchema).not.toHaveProperty('daxTemplateAllowList');
        expect(dax.profileSchema).not.toHaveProperty('daxQueryTimeoutMs');
        expect(dax.profileSchema).not.toHaveProperty('daxResultCacheTtlSec');
        expect(dax.profileSchema).not.toHaveProperty('templateAllowList');
        expect(dax.profileSchema).not.toHaveProperty('queryTimeoutMs');
        expect(dax.profileSchema).not.toHaveProperty('resultCacheTtlSec');
    });

    test('PBI uses existing RLS field family (powerBiRlsEnabled / Required / UsernameClaim / Username / Roles)', () => {
        for (const id of ['powerbi-dataset-dax', 'powerbi-dataset-qna']) {
            const m = getManifest(id);
            const s = m.profileSchema;
            expect(s).toHaveProperty('powerBiRlsEnabled');
            expect(s).toHaveProperty('powerBiRlsRequired');
            expect(s).toHaveProperty('powerBiRlsUsernameClaim');
            expect(s).toHaveProperty('powerBiRlsUsername');
            expect(s).toHaveProperty('powerBiRlsRoles');
            // Should NOT use the invented names Codex flagged.
            expect(s).not.toHaveProperty('enableUserImpersonation');
            expect(s).not.toHaveProperty('rlsRoles');
        }
    });

    test('PBI cards share sharedCredentialHint: "powerbi-aad-sp" (Codex Q9 §4)', () => {
        for (const id of ['powerbi-dataset-dax', 'powerbi-dataset-qna']) {
            expect(getManifest(id).sharedCredentialHint).toBe('powerbi-aad-sp');
        }
    });

    test('every manifest declares at least one route with method + path + purpose', () => {
        for (const m of MANIFESTS) {
            expect(Array.isArray(m.routes)).toBe(true);
            expect(m.routes.length).toBeGreaterThan(0);
            for (const r of m.routes) {
                expect(typeof r.method).toBe('string');
                expect(r.path.startsWith('/')).toBe(true);
                expect(typeof r.purpose).toBe('string');
            }
        }
    });
});

describe('connectorManifestSchema — validator (boot-time enforcement)', () => {
    test('rejects manifest with missing id', () => {
        const r = validateManifest({ version: '1.0.0', displayName: 'X' });
        expect(r.ok).toBe(false);
        expect(r.errors.some(e => /id/.test(e))).toBe(true);
    });

    test('rejects manifest with bad version (not semver)', () => {
        const r = validateManifest({ id: 'x', version: 'abc', displayName: 'X', category: 'demo', maturity: 'preview', icon: 'x', tagline: 't', description: 'd', profileType: 'x', capabilities: {}, profileSchema: {}, setupSteps: ['s'], docsUrl: 'https://x.example', routes: [{ method: 'POST', path: '/x', purpose: 'discovery' }] });
        expect(r.ok).toBe(false);
        expect(r.errors.some(e => /version/.test(e))).toBe(true);
    });

    test('rejects manifest with unknown category', () => {
        const r = validateManifest({ id: 'x', version: '1.0.0', displayName: 'X', category: 'mars', maturity: 'preview', icon: 'x', tagline: 't', description: 'd', profileType: 'x', capabilities: {}, profileSchema: {}, setupSteps: ['s'], docsUrl: 'https://x.example', routes: [{ method: 'POST', path: '/x', purpose: 'discovery' }] });
        expect(r.ok).toBe(false);
        expect(r.errors.some(e => /category/.test(e))).toBe(true);
    });

    test('rejects manifest with neither profileType nor profileTypes', () => {
        const r = validateManifest({ id: 'x', version: '1.0.0', displayName: 'X', category: 'demo', maturity: 'preview', icon: 'x', tagline: 't', description: 'd', capabilities: {}, profileSchema: {}, setupSteps: ['s'], docsUrl: 'https://x.example', routes: [{ method: 'POST', path: '/x', purpose: 'discovery' }] });
        expect(r.ok).toBe(false);
        expect(r.errors.some(e => /profileType/.test(e))).toBe(true);
    });

    test('rejects manifest where secret field has kind != secret', () => {
        const r = validateManifest({
            id: 'x', version: '1.0.0', displayName: 'X', category: 'demo', maturity: 'preview', icon: 'x', tagline: 't', description: 'd',
            profileType: 'x', capabilities: {},
            profileSchema: { token: { kind: 'string', required: true, label: 'Token', secret: true } },
            setupSteps: ['s'], docsUrl: 'https://x.example', routes: [{ method: 'POST', path: '/x', purpose: 'discovery' }],
        });
        expect(r.ok).toBe(false);
        expect(r.errors.some(e => /secret:true/.test(e))).toBe(true);
    });

    test('detects duplicate manifest ids in a batch', () => {
        const r = validateManifests([
            { id: 'dup', version: '1.0.0', displayName: 'A', category: 'demo', maturity: 'preview', icon: 'x', tagline: 't', description: 'd', profileType: 'a', capabilities: {}, profileSchema: {}, setupSteps: ['s'], docsUrl: 'https://x.example', routes: [{ method: 'POST', path: '/a', purpose: 'discovery' }] },
            { id: 'dup', version: '1.0.0', displayName: 'B', category: 'demo', maturity: 'preview', icon: 'x', tagline: 't', description: 'd', profileType: 'b', capabilities: {}, profileSchema: {}, setupSteps: ['s'], docsUrl: 'https://x.example', routes: [{ method: 'POST', path: '/b', purpose: 'discovery' }] },
        ]);
        expect(r.ok).toBe(false);
        const dup = r.report.find(x => x.errors && x.errors.some(e => /duplicate/.test(e)));
        expect(dup).toBeTruthy();
    });
});

describe('connectorRegistry — list / get / filter', () => {
    test('listManifests() returns all 12 with no filter', () => {
        expect(listManifests()).toHaveLength(12);
    });

    test('listManifests({category: "microsoft"}) returns the 2 PBI cards', () => {
        const ms = listManifests({ category: 'microsoft' });
        expect(ms.map(m => m.id).sort()).toEqual(['powerbi-dataset-dax', 'powerbi-dataset-qna']);
    });

    test('listManifests({category: "databricks"}) returns the 5 Databricks cards', () => {
        const db = listManifests({ category: 'databricks' });
        expect(db.map(m => m.id).sort()).toEqual(['foundation-model', 'genie', 'responses-agent', 'supervisor', 'supervisor-local']);
    });

    test('listManifests({maturity: "stable"}) filters by lifecycle', () => {
        const stable = listManifests({ maturity: 'stable' });
        expect(stable.every(m => m.maturity === 'stable')).toBe(true);
    });

    test('listManifests({capability: "qnaEmbedSurface"}) returns only PBI Q&A', () => {
        const qna = listManifests({ capability: 'qnaEmbedSurface' });
        expect(qna).toHaveLength(1);
        expect(qna[0].id).toBe('powerbi-dataset-qna');
    });

    test('getManifest(known id) returns the manifest', () => {
        expect(getManifest('genie').displayName).toMatch(/Genie/);
    });

    test('getManifest(unknown id) returns null', () => {
        expect(getManifest('not-a-thing')).toBeNull();
    });
});

describe('connectorRegistry — Q1 soft-migration (matchProfileToConnectors)', () => {
    test('typed Genie profile → ["genie"]', () => {
        expect(matchProfileToConnectors({ name: 'g', type: 'genie' })).toEqual(['genie']);
    });

    test('legacy Genie profile (spaceId, no type) → ["genie"]', () => {
        expect(matchProfileToConnectors({ name: 'g', spaceId: 'abc' })).toEqual(['genie']);
    });

    test('legacy powerbi-semantic-model profile → both PBI cards (DAX + Q&A)', () => {
        const hits = matchProfileToConnectors({ name: 'p', type: 'powerbi-semantic-model' });
        expect(hits.sort()).toEqual(['powerbi-dataset-dax', 'powerbi-dataset-qna']);
    });

    test('explicit powerbi-dataset-dax type → only DAX', () => {
        expect(matchProfileToConnectors({ name: 'p', type: 'powerbi-dataset-dax' })).toEqual(['powerbi-dataset-dax']);
    });

    test('explicit powerbi-dataset-qna type → only Q&A', () => {
        expect(matchProfileToConnectors({ name: 'p', type: 'powerbi-dataset-qna' })).toEqual(['powerbi-dataset-qna']);
    });

    test('foundation-model type → ["foundation-model"]', () => {
        expect(matchProfileToConnectors({ name: 'f', type: 'foundation-model' })).toEqual(['foundation-model']);
    });

    test('supervisor-local type → ["supervisor-local"]', () => {
        expect(matchProfileToConnectors({ name: 's', type: 'supervisor-local' })).toEqual(['supervisor-local']);
    });

    test('unknown profile (no type, no spaceId) → []', () => {
        expect(matchProfileToConnectors({ name: 'x' })).toEqual([]);
    });

    test('null / non-object profile → []', () => {
        expect(matchProfileToConnectors(null)).toEqual([]);
        expect(matchProfileToConnectors(undefined)).toEqual([]);
        expect(matchProfileToConnectors('string')).toEqual([]);
    });
});

describe('connectorRegistry — describeRuntimeState', () => {
    test('every manifest gets a runtime entry with loadStatus + configuredProfiles', () => {
        const out = describeRuntimeState({ profiles: [] });
        for (const m of MANIFESTS) {
            expect(out[m.id]).toBeDefined();
            expect(out[m.id].loadStatus).toBe('loaded');
            expect(Array.isArray(out[m.id].configuredProfiles)).toBe(true);
        }
    });

    test('configured genie profile shows up under genie runtime', () => {
        const out = describeRuntimeState({
            profiles: [{ name: 'default', type: 'genie', spaceId: 's', host: 'https://x', token: 'pat-xxx' }],
        });
        expect(out.genie.configuredProfiles).toHaveLength(1);
        expect(out.genie.configuredProfiles[0].name).toBe('default');
        expect(out.genie.configuredProfiles[0].valid).toBe(true);
        expect(out.genie.configuredProfiles[0].secretStatus).toBe('present');
        expect(out.genie.configuredProfiles[0].legacyCombined).toBe(false);
    });

    test('legacy powerbi-semantic-model profile appears under BOTH PBI cards as legacyCombined: true', () => {
        const out = describeRuntimeState({
            profiles: [{
                name: 'pbi', type: 'powerbi-semantic-model',
                aadTenantId: 't', aadClientId: 'c', aadClientSecret: 's',
                powerbiGroupId: 'g', powerbiDatasetId: 'd',
            }],
        });
        const dax = out['powerbi-dataset-dax'].configuredProfiles;
        const qna = out['powerbi-dataset-qna'].configuredProfiles;
        expect(dax).toHaveLength(1);
        expect(qna).toHaveLength(1);
        expect(dax[0].legacyCombined).toBe(true);
        expect(qna[0].legacyCombined).toBe(true);
    });

    test('warning surfaced when a required field is missing', () => {
        const out = describeRuntimeState({
            profiles: [{ name: 'broken', type: 'foundation-model' /* missing host, token, foundationModelEndpoint */ }],
        });
        const cp = out['foundation-model'].configuredProfiles;
        expect(cp).toHaveLength(1);
        expect(cp[0].valid).toBe(false);
        expect(cp[0].warnings.length).toBeGreaterThanOrEqual(3); // host, token, foundationModelEndpoint
    });

    test('secretStatus = "missing" when secret field is empty', () => {
        const out = describeRuntimeState({
            profiles: [{ name: 'no-token', type: 'genie', spaceId: 's', host: 'https://x', token: '' }],
        });
        expect(out.genie.configuredProfiles[0].secretStatus).toBe('missing');
    });

    test('SECRET VALUES NEVER appear anywhere in the runtime block', () => {
        const SECRET = 'super-secret-do-not-leak-12345';
        const out = describeRuntimeState({
            profiles: [
                { name: 'g', type: 'genie', spaceId: 's', host: 'https://x', token: SECRET },
                { name: 'p', type: 'powerbi-dataset-dax', aadTenantId: 't', aadClientId: 'c', aadClientSecret: SECRET, powerbiGroupId: 'g', powerbiDatasetId: 'd' },
                { name: 'a', type: 'azure-openai', azureOpenAiEndpoint: 'https://x', azureOpenAiDeployment: 'd', azureOpenAiApiKey: SECRET },
                { name: 'b', type: 'bedrock', bedrockRegion: 'us-east-1', bedrockModelId: 'm', awsAccessKeyId: 'k', awsSecretAccessKey: SECRET },
            ],
        });
        const serialized = JSON.stringify(out);
        expect(serialized).not.toContain(SECRET);
    });

    test('non-array profiles input is tolerated (returns runtime with empty configured arrays)', () => {
        const out = describeRuntimeState({ profiles: null });
        for (const m of MANIFESTS) {
            expect(out[m.id].configuredProfiles).toEqual([]);
        }
    });
});

describe('GET /assistant/connector-types — discovery endpoint', () => {
    let app;
    beforeAll(() => {
        // Late require so manifest validation runs in this jest worker too.
        process.env.NODE_ENV = 'test';
        app = require('../server').app;
    });

    test('returns 200 with { manifests, runtime } shape', async () => {
        const res = await request(app).get('/assistant/connector-types');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.manifests)).toBe(true);
        expect(res.body.manifests).toHaveLength(12);
        expect(typeof res.body.runtime).toBe('object');
    });

    test('every manifest in the response has matching runtime entry', async () => {
        const res = await request(app).get('/assistant/connector-types');
        for (const m of res.body.manifests) {
            expect(res.body.runtime[m.id]).toBeDefined();
            expect(res.body.runtime[m.id].loadStatus).toBe('loaded');
        }
    });

    test('response NEVER contains a secret value (sanity-check the wire)', async () => {
        // The test fixture's config.json has Genie token "test-pat" if defaulted;
        // we just confirm the endpoint response contains no field values from
        // any profile that LOOKS like a token. Tighter coverage is in the
        // describeRuntimeState SECRET test above; this test guards the wire.
        const res = await request(app).get('/assistant/connector-types');
        const serialized = JSON.stringify(res.body.runtime);
        // No field literally called "secret" or "token" in the runtime block.
        expect(serialized).not.toMatch(/"aadClientSecret"\s*:/);
        expect(serialized).not.toMatch(/"awsSecretAccessKey"\s*:/);
        expect(serialized).not.toMatch(/"token"\s*:/);
    });
});
