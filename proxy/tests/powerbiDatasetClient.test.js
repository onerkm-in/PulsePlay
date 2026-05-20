// @ts-check
'use strict';

const {
    acquirePbiAccessToken,
    getDatasetMetadata,
    executeDax,
    executeDaxNormalized,
    __resetCacheForTests,
} = require('../lib/powerbiDatasetClient');

const baseProfile = {
    type: 'powerbi-semantic-model',
    aadTenantId: 'tenant-aaa',
    aadClientId: 'client-bbb',
    aadClientSecret: 'secret-ccc',
    powerbiGroupId: 'group-ddd',
    powerbiDatasetId: 'dataset-eee',
};

function makeFetchStub(handlers) {
    return async (url, opts) => {
        for (const h of handlers) {
            if (h.match(url, opts)) return h.respond(url, opts);
        }
        throw new Error(`Unstubbed fetch: ${url}`);
    };
}

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
    };
}

beforeEach(() => {
    __resetCacheForTests();
});

describe('acquirePbiAccessToken', () => {
    test('throws on missing tenant / client / secret', async () => {
        await expect(acquirePbiAccessToken({})).rejects.toThrow(/tenant/i);
        await expect(acquirePbiAccessToken({ aadTenantId: 't' })).rejects.toThrow(/client/i);
        await expect(acquirePbiAccessToken({ aadTenantId: 't', aadClientId: 'c' })).rejects.toThrow(/secret/i);
    });

    test('fetches from login.microsoftonline.com with client_credentials grant', async () => {
        let captured;
        const fetchImpl = makeFetchStub([{
            match: url => url.includes('login.microsoftonline.com'),
            respond: (url, opts) => { captured = { url, body: opts.body }; return jsonResponse({ access_token: 'tok-1', expires_in: 3600 }); },
        }]);
        const token = await acquirePbiAccessToken(baseProfile, fetchImpl);
        expect(token).toBe('tok-1');
        expect(captured.url).toMatch(/login\.microsoftonline\.com\/tenant-aaa\/oauth2\/v2\.0\/token/);
        expect(captured.body).toContain('grant_type=client_credentials');
        expect(captured.body).toContain('client_id=client-bbb');
        expect(captured.body).toContain('client_secret=secret-ccc');
        expect(captured.body).toMatch(/analysis\.windows\.net%2Fpowerbi%2Fapi%2F\.default/);
    });

    test('reuses cached token on second call within early-refresh window', async () => {
        let calls = 0;
        const fetchImpl = makeFetchStub([{
            match: url => url.includes('login.microsoftonline.com'),
            respond: () => { calls++; return jsonResponse({ access_token: `tok-${calls}`, expires_in: 3600 }); },
        }]);
        const t1 = await acquirePbiAccessToken(baseProfile, fetchImpl);
        const t2 = await acquirePbiAccessToken(baseProfile, fetchImpl);
        expect(t1).toBe('tok-1');
        expect(t2).toBe('tok-1');
        expect(calls).toBe(1);
    });

    test('single-flight: concurrent acquisitions share the same in-flight promise', async () => {
        let calls = 0;
        let resolveToken;
        const fetchImpl = makeFetchStub([{
            match: url => url.includes('login.microsoftonline.com'),
            respond: () => {
                calls++;
                return new Promise(resolve => { resolveToken = () => resolve(jsonResponse({ access_token: 'tok-cf', expires_in: 3600 })); });
            },
        }]);
        const p1 = acquirePbiAccessToken(baseProfile, fetchImpl);
        const p2 = acquirePbiAccessToken(baseProfile, fetchImpl);
        const p3 = acquirePbiAccessToken(baseProfile, fetchImpl);
        // All three should be in flight; only one underlying fetch.
        expect(calls).toBe(1);
        resolveToken();
        const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
        expect(t1).toBe('tok-cf');
        expect(t2).toBe('tok-cf');
        expect(t3).toBe('tok-cf');
    });

    test('clears cache on AAD failure so next call retries', async () => {
        let calls = 0;
        const fetchImpl = makeFetchStub([{
            match: url => url.includes('login.microsoftonline.com'),
            respond: () => {
                calls++;
                if (calls === 1) return jsonResponse({ error: 'invalid_client' }, 401);
                return jsonResponse({ access_token: 'tok-retry', expires_in: 3600 });
            },
        }]);
        await expect(acquirePbiAccessToken(baseProfile, fetchImpl)).rejects.toThrow(/Azure AD/i);
        const t2 = await acquirePbiAccessToken(baseProfile, fetchImpl);
        expect(t2).toBe('tok-retry');
        expect(calls).toBe(2);
    });

    test('accepts legacy powerBiTenantId / powerBiClientId / powerBiClientSecret aliases', async () => {
        let captured;
        const fetchImpl = makeFetchStub([{
            match: url => url.includes('login.microsoftonline.com'),
            respond: (url, opts) => { captured = { url, body: opts.body }; return jsonResponse({ access_token: 'tok-alias', expires_in: 3600 }); },
        }]);
        const token = await acquirePbiAccessToken({
            powerBiTenantId: 'legacy-tenant',
            powerBiClientId: 'legacy-client',
            powerBiClientSecret: 'legacy-secret',
        }, fetchImpl);
        expect(token).toBe('tok-alias');
        expect(captured.url).toContain('legacy-tenant');
        expect(captured.body).toContain('client_id=legacy-client');
    });
});

describe('getDatasetMetadata', () => {
    test('GETs /v1.0/myorg/groups/{g}/datasets/{d} with Bearer token', async () => {
        let captured;
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'tok-meta', expires_in: 3600 }) },
            { match: u => u.includes('/v1.0/myorg/groups/'), respond: (url, opts) => {
                captured = { url, auth: opts.headers.Authorization };
                return jsonResponse({ id: 'dataset-eee', name: 'Sales', configuredBy: 'sp@tenant', isRefreshable: true });
            }},
        ]);
        const meta = await getDatasetMetadata(baseProfile, { fetchImpl });
        expect(meta.name).toBe('Sales');
        expect(captured.url).toContain('/groups/group-ddd/datasets/dataset-eee');
        expect(captured.auth).toBe('Bearer tok-meta');
    });

    test('throws with status code on Power BI error response', async () => {
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'tok-err', expires_in: 3600 }) },
            { match: u => u.includes('/v1.0/myorg/groups/'), respond: () => jsonResponse({ error: 'DatasetNotFound' }, 404) },
        ]);
        await expect(getDatasetMetadata(baseProfile, { fetchImpl })).rejects.toThrow(/404/);
    });

    test('throws when profile lacks groupId or datasetId', async () => {
        await expect(getDatasetMetadata({ ...baseProfile, powerbiGroupId: '' })).rejects.toThrow(/groupId/i);
        await expect(getDatasetMetadata({ ...baseProfile, powerbiDatasetId: '' })).rejects.toThrow(/datasetId/i);
    });
});

describe('executeDax', () => {
    test('POSTs DAX to /executeQueries with serializerSettings.includeNulls=true', async () => {
        let captured;
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'tok-dax', expires_in: 3600 }) },
            { match: u => u.includes('/executeQueries'), respond: (url, opts) => {
                captured = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization };
                return jsonResponse({ results: [{ tables: [{ rows: [{ '[Revenue]': 100 }] }] }] });
            }},
        ]);
        const result = await executeDax(baseProfile, 'EVALUATE { [Revenue] }', { fetchImpl });
        expect(captured.url).toContain('/groups/group-ddd/datasets/dataset-eee/executeQueries');
        expect(captured.auth).toBe('Bearer tok-dax');
        expect(captured.body.queries[0].query).toBe('EVALUATE { [Revenue] }');
        expect(captured.body.serializerSettings.includeNulls).toBe(true);
        expect(result.results[0].tables[0].rows[0]['[Revenue]']).toBe(100);
    });

    test('forwards impersonatedUserName when supplied (RLS)', async () => {
        let captured;
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'tok-rls', expires_in: 3600 }) },
            { match: u => u.includes('/executeQueries'), respond: (url, opts) => {
                captured = JSON.parse(opts.body);
                return jsonResponse({ results: [{ tables: [{ rows: [] }] }] });
            }},
        ]);
        await executeDax(baseProfile, 'EVALUATE { 1 }', { fetchImpl, impersonatedUserName: 'alice@org' });
        expect(captured.impersonatedUserName).toBe('alice@org');
    });

    test('throws on empty DAX', async () => {
        await expect(executeDax(baseProfile, '')).rejects.toThrow(/DAX/);
        await expect(executeDax(baseProfile, '   ')).rejects.toThrow(/DAX/);
    });
});

describe('generateQnAEmbedToken', () => {
    test('POSTs to .../datasets/{id}/GenerateToken with View accessLevel', async () => {
        let captured;
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'aad-tok', expires_in: 3600 }) },
            { match: u => u.includes('/GenerateToken'), respond: (url, opts) => {
                captured = { url, body: JSON.parse(opts.body), auth: opts.headers.Authorization };
                return jsonResponse({ token: 'qna-tok-xyz', tokenId: 'tid-1', expiration: '2099-12-31T23:59:59Z' });
            }},
        ]);
        const { generateQnAEmbedToken } = require('../lib/powerbiDatasetClient');
        const out = await generateQnAEmbedToken(baseProfile, { fetchImpl });
        expect(captured.url).toContain('/groups/group-ddd/datasets/dataset-eee/GenerateToken');
        expect(captured.auth).toBe('Bearer aad-tok');
        expect(captured.body.accessLevel).toBe('View');
        expect(out.accessToken).toBe('qna-tok-xyz');
        expect(out.tokenId).toBe('tid-1');
        expect(out.datasetId).toBe('dataset-eee');
        expect(out.groupId).toBe('group-ddd');
        expect(out.embedUrl).toBe('https://app.powerbi.com/qnaEmbed?groupId=group-ddd');
        expect(out.expiresAt).toBe(new Date('2099-12-31T23:59:59Z').getTime());
    });

    test('forwards RLS identities when supplied', async () => {
        let captured;
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'aad-rls', expires_in: 3600 }) },
            { match: u => u.includes('/GenerateToken'), respond: (url, opts) => {
                captured = JSON.parse(opts.body);
                return jsonResponse({ token: 'qna-rls', expiration: '2099-12-31T23:59:59Z' });
            }},
        ]);
        const { generateQnAEmbedToken } = require('../lib/powerbiDatasetClient');
        await generateQnAEmbedToken(baseProfile, {
            fetchImpl,
            identities: [{ username: 'alice@org', datasets: ['dataset-eee'], roles: ['Sales'] }],
        });
        expect(captured.identities).toEqual([{ username: 'alice@org', datasets: ['dataset-eee'], roles: ['Sales'] }]);
    });

    test('throws when profile missing groupId / datasetId', async () => {
        const { generateQnAEmbedToken } = require('../lib/powerbiDatasetClient');
        await expect(generateQnAEmbedToken({ ...baseProfile, powerbiGroupId: '' })).rejects.toThrow(/groupId/i);
        await expect(generateQnAEmbedToken({ ...baseProfile, powerbiDatasetId: '' })).rejects.toThrow(/datasetId/i);
    });

    test('throws with status code on Power BI 4xx', async () => {
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'aad-err', expires_in: 3600 }) },
            { match: u => u.includes('/GenerateToken'), respond: () => jsonResponse({ error: 'Forbidden' }, 403) },
        ]);
        const { generateQnAEmbedToken } = require('../lib/powerbiDatasetClient');
        await expect(generateQnAEmbedToken(baseProfile, { fetchImpl })).rejects.toThrow(/403/);
    });

    test('falls back to a 1-hour expiry when Power BI returns no expiration field', async () => {
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'aad-noexp', expires_in: 3600 }) },
            { match: u => u.includes('/GenerateToken'), respond: () => jsonResponse({ token: 'qna-noexp' }) },
        ]);
        const before = Date.now();
        const { generateQnAEmbedToken } = require('../lib/powerbiDatasetClient');
        const out = await generateQnAEmbedToken(baseProfile, { fetchImpl });
        expect(out.expiresAt).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 100);
        expect(out.expiresAt).toBeLessThanOrEqual(before + 60 * 60 * 1000 + 5000);
    });
});

describe('executeDaxNormalized', () => {
    test('flattens PBI row-objects into { columns, rows } shape', async () => {
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'tok-norm', expires_in: 3600 }) },
            { match: u => u.includes('/executeQueries'), respond: () => jsonResponse({
                results: [{ tables: [{ rows: [
                    { 'Sales[Region]': 'East', '[Revenue]': 100 },
                    { 'Sales[Region]': 'West', '[Revenue]': 200 },
                ] }] }],
            }) },
        ]);
        const out = await executeDaxNormalized(baseProfile, 'EVALUATE Region', { fetchImpl });
        expect(out.columns).toEqual(['Sales[Region]', '[Revenue]']);
        expect(out.rows).toEqual([['East', 100], ['West', 200]]);
        expect(out.truncated).toBe(false);
    });

    test('handles empty result set', async () => {
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'tok-empty', expires_in: 3600 }) },
            { match: u => u.includes('/executeQueries'), respond: () => jsonResponse({ results: [{ tables: [{ rows: [] }] }] }) },
        ]);
        const out = await executeDaxNormalized(baseProfile, 'EVALUATE { } ', { fetchImpl });
        expect(out.columns).toEqual([]);
        expect(out.rows).toEqual([]);
    });

    test('handles malformed response (no tables) without throwing', async () => {
        const fetchImpl = makeFetchStub([
            { match: u => u.includes('login.microsoftonline.com'), respond: () => jsonResponse({ access_token: 'tok-malformed', expires_in: 3600 }) },
            { match: u => u.includes('/executeQueries'), respond: () => jsonResponse({ results: [] }) },
        ]);
        const out = await executeDaxNormalized(baseProfile, 'EVALUATE { } ', { fetchImpl });
        expect(out.columns).toEqual([]);
        expect(out.rows).toEqual([]);
    });
});
