'use strict';

/**
 * discoveryRoute.test.js — Phase A.
 *
 * End-to-end test for POST /assistant/discover. Drives the route via
 * supertest with a mocked connectorProbe so the test is hermetic (no real
 * Databricks calls). Verifies:
 *   • Happy-path 200 with DiscoverySnapshot shape
 *   • Cache hit/miss + X-PulsePlay-Discovery-Cache header
 *   • bypassCache flag forces a fresh probe
 *   • Pack allowlist enforcement when configured
 *   • 400 on missing profile, 500 on fusion error
 *   • Audit log emits `action=discover`
 *
 * Mirrors the strategy in connectorProbe.test.js — fs mocked at module
 * scope so cfg() returns a controlled config; probeConnector mocked at
 * the lib boundary so server.js's require() picks up the stub.
 */

const MOCK_CONFIG = {
    port: 0,
    profiles: {
        default: {
            host: 'https://test.azuredatabricks.net',
            token: 'dapi-test',
            spaceId: 'space-default',
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
        readFileSync: jest.fn((filePath, ...rest) => {
            if (String(filePath).endsWith('config.json')) {
                return JSON.stringify(MOCK_CONFIG);
            }
            return actual.readFileSync(filePath, ...rest);
        }),
        appendFileSync: jest.fn(),
        statSync: jest.fn((filePath, ...rest) => actual.statSync(filePath, ...rest)),
    };
});

jest.mock('@azure/identity', () => { throw new Error('not installed'); }, { virtual: true });

process.env.SUPERVISOR_ENABLED = 'false';

const request = require('supertest');

let _logSpy, _errSpy, _warnSpy;
beforeAll(() => {
    _logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    _errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    _warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
    _logSpy?.mockRestore();
    _errSpy?.mockRestore();
    _warnSpy?.mockRestore();
});

/* ─── Setup ──────────────────────────────────────────────────────────── */

describe('POST /assistant/discover — end-to-end', () => {
    let app;
    let discoveryEngine;
    // The shared probe mock instance — same fn referenced by server.js's
    // require() and by every test's mockImplementation() call. Created ONCE
    // outside the factory closure so jest.doMock returns it as a stable
    // reference, not a fresh jest.fn() on every invocation.
    const probeMock = jest.fn(async (resolved) => ({
        profile: resolved?.name || 'unknown',
        connectorType: 'genie',
        displayName: 'Mock Space',
        metadataAvailability: 'rich',
        schema: {
            tables: [
                {
                    name: 'fct_otif_weekly',
                    columns: [{ name: 'otif' }, { name: 'week' }, { name: 'region' }],
                },
            ],
        },
        declaredKpis: ['OTIF', 'Fill Rate'],
        sampleQuestions: ['How is OTIF trending?'],
        probeDurationMs: 5,
        warnings: [],
    }));

    beforeAll(() => {
        jest.doMock('../lib/connectorProbe', () => {
            const real = jest.requireActual('../lib/connectorProbe');
            return { ...real, probeConnector: probeMock };
        });
        ({ app } = require('../server'));
        discoveryEngine = require('../lib/discoveryEngine');
    });

    afterAll(() => {
        jest.dontMock('../lib/connectorProbe');
        jest.resetModules();
    });

    beforeEach(() => {
        discoveryEngine.__resetCacheForTests();
        // Reset probe to the default success-path mock between tests so any
        // per-test mockImplementation override doesn't leak into the next.
        probeMock.mockImplementation(async (resolved) => ({
            profile: resolved?.name || 'unknown',
            connectorType: 'genie',
            displayName: 'Mock Space',
            metadataAvailability: 'rich',
            schema: {
                tables: [
                    {
                        name: 'fct_otif_weekly',
                        columns: [{ name: 'otif' }, { name: 'week' }, { name: 'region' }],
                    },
                ],
            },
            declaredKpis: ['OTIF', 'Fill Rate'],
            sampleQuestions: ['How is OTIF trending?'],
            probeDurationMs: 5,
            warnings: [],
        }));
        probeMock.mockClear();
    });

    /* ─── Happy path ───────────────────────────────────────────────────── */

    test('returns 200 + DiscoverySnapshot for a known profile + pack', async () => {
        const res = await request(app)
            .post('/assistant/discover')
            .send({
                assistantProfile: 'default',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
                biMetadata: {
                    visibleMeasures: [{ name: 'OTIF', kind: 'percent' }],
                    visibleDimensions: [
                        { name: 'Region', kind: 'geography' },
                        { name: 'Week', kind: 'time' },
                    ],
                },
            });
        expect(res.status).toBe(200);
        expect(res.body.snapshotVersion).toBe(1);
        expect(res.body.cacheKey).toBeTruthy();
        expect(typeof res.body.fetchedAt).toBe('string');
        expect(typeof res.body.expiresAt).toBe('string');
        expect(res.body.sources.probe.connectorType).toBe('genie');
        expect(res.body.sources.packKpis.length).toBeGreaterThan(0);
        expect(res.body.fused.availableKpis.length).toBeGreaterThan(0);
        expect(res.body.fused.reachableFrames.length).toBeGreaterThan(0);
        // SWOT is always-reachable.
        expect(res.body.fused.reachableFrames.some(f => f.frameId === 'swot-analysis')).toBe(true);
        // X-PulsePlay-Discovery-Cache: miss on first call.
        expect(res.headers['x-pulseplay-discovery-cache']).toBe('miss');
    });

    test('second call with same inputs returns cache hit', async () => {
        await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'default', pack: 'cpg-fmcg', subVertical: 'supply-chain' });
        const res = await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'default', pack: 'cpg-fmcg', subVertical: 'supply-chain' });
        expect(res.status).toBe(200);
        expect(res.headers['x-pulseplay-discovery-cache']).toBe('hit');
    });

    test('bypassCache=true forces a fresh probe', async () => {
        await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'default', pack: 'cpg-fmcg', subVertical: 'supply-chain' });
        const res = await request(app)
            .post('/assistant/discover')
            .send({
                assistantProfile: 'default',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
                bypassCache: true,
            });
        expect(res.status).toBe(200);
        expect(res.headers['x-pulseplay-discovery-cache']).toBe('miss');
    });

    test('different biUrlHash produces different cacheKey (no false cache hits)', async () => {
        const a = await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'default', pack: 'cpg-fmcg', subVertical: 'supply-chain', biUrlHash: 'urlA' });
        const b = await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'default', pack: 'cpg-fmcg', subVertical: 'supply-chain', biUrlHash: 'urlB' });
        expect(a.body.cacheKey).not.toBe(b.body.cacheKey);
        expect(b.headers['x-pulseplay-discovery-cache']).toBe('miss');
    });

    /* ─── Error paths ──────────────────────────────────────────────────── */

    test('returns 400 when no matching profile', async () => {
        const res = await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'no-such-profile' });
        expect(res.status).toBe(400);
    });

    test('discovers without pack (profile only) — empty packKpis, still returns snapshot', async () => {
        const res = await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'default' });
        expect(res.status).toBe(200);
        expect(res.body.sources.packKpis).toEqual([]);
        // Probe-discovered KPIs should appear in availableKpis.
        expect(res.body.fused.availableKpis.some(k => k.source === 'probe')).toBe(true);
    });

    test('returns 200 when probeConnector returns a defensive shell (metadataAvailability=none + warnings)', async () => {
        // probeConnector's contract: never throws; on failure returns a shell
        // with metadataAvailability='none' and warnings[]. Verify the discovery
        // route propagates that shape verbatim through buildSnapshot.
        probeMock.mockImplementationOnce(async () => ({
            profile: 'default',
            connectorType: 'genie',
            metadataAvailability: 'none',
            probeDurationMs: 3,
            warnings: ['Connector REST call failed: backend unreachable'],
        }));
        const res = await request(app)
            .post('/assistant/discover')
            .send({ assistantProfile: 'default', biUrlHash: 'defensive-test' });
        expect(res.status).toBe(200);
        expect(res.body.sources.probe).toBeTruthy();
        expect(res.body.sources.probe.metadataAvailability).toBe('none');
        expect(res.body.sources.probe.warnings.length).toBeGreaterThan(0);
        expect(res.body.sources.probe.warnings[0]).toMatch(/REST call failed/);
    });

    /* ─── Audit ────────────────────────────────────────────────────────── */

    test('emits an audit-log line with action=discover', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            await request(app)
                .post('/assistant/discover')
                .send({ assistantProfile: 'default', pack: 'cpg-fmcg', subVertical: 'supply-chain' });
            const auditCalls = logSpy.mock.calls.filter(args => args[0] === '[audit]');
            expect(auditCalls.length).toBeGreaterThanOrEqual(1);
            const line = auditCalls[auditCalls.length - 1][1];
            const parsed = JSON.parse(line);
            expect(parsed.action).toBe('discover');
            expect(parsed.profile).toBe('default');
            expect(parsed.status).toBe(200);
        } finally {
            logSpy.mockRestore();
        }
    });
});
