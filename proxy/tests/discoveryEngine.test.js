'use strict';

/**
 * discoveryEngine.test.js — Phase A.
 *
 * Unit tests for the discovery fusion logic. Exercises:
 *   • parsePackKpis against the real cpg-fmcg pack
 *   • buildSnapshot fusion across (probe, biMetadata, pack) variants
 *   • evaluateReachability per frame
 *   • Cache (set / get / TTL / LRU eviction)
 *
 * Patterns mirror packPromptLoader.test.js — real fs over fs mocks.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    buildSnapshot,
    parsePackKpis,
    evaluateReachability,
    fuseKpis,
    computeCacheKey,
    getCachedSnapshot,
    setCachedSnapshot,
    __resetCacheForTests,
    FRAME_PREREQUISITES,
    DEFAULT_CACHE_TTL_MS,
} = require('../lib/discoveryEngine');

function makeTmpPacksRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'pulseplay-disc-test-'));
}
function writePackFile(root, relPath, content) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return full;
}
function rmrf(p) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

beforeEach(() => {
    __resetCacheForTests();
});

/* ─── parsePackKpis ──────────────────────────────────────────────────── */

describe('parsePackKpis — real cpg-fmcg pack', () => {
    test('parses cpg-fmcg/supply-chain kpis.md into structured KPIs', () => {
        const kpis = parsePackKpis('cpg-fmcg', 'supply-chain');
        expect(kpis.length).toBeGreaterThan(0);
        const otif = kpis.find(k => /^OTIF/i.test(k.name));
        expect(otif).toBeDefined();
        expect(otif.definition.length).toBeGreaterThan(20);
        // OTIF definition mentions "percentage" → units should detect as percent.
        expect(otif.units).toBe('percent');
    });

    test('returns empty array for unsafe pack segments', () => {
        expect(parsePackKpis('../etc', 'sv')).toEqual([]);
        expect(parsePackKpis('cpg-fmcg', '../escape')).toEqual([]);
        expect(parsePackKpis('UPPER', 'sv')).toEqual([]);
    });

    test('returns empty array for missing pack', () => {
        expect(parsePackKpis('no-such-pack', 'sv')).toEqual([]);
    });
});

describe('parsePackKpis — synthetic fixtures', () => {
    let tmpRoot;

    beforeEach(() => { tmpRoot = makeTmpPacksRoot(); });
    afterEach(() => rmrf(tmpRoot));

    test('parses level-2 headings as KPI names with first paragraph as definition', () => {
        writePackFile(tmpRoot, 'p/sub-verticals/sv/kpis.md', [
            '# Pack KPIs',
            '',
            'Some preamble that should be skipped.',
            '',
            '## Margin %',
            '',
            'Net profit / revenue, expressed as a percentage. Higher is better.',
            '',
            'A second paragraph that should NOT be in the definition.',
            '',
            '## Cycle Time (CT)',
            '',
            'Average days between order and delivery.',
            '',
            '## Notes',
            '',
            'Housekeeping section — should be skipped.',
        ].join('\n'));

        const kpis = parsePackKpis('p', 'sv', { packsRoot: tmpRoot });
        expect(kpis).toHaveLength(2);
        expect(kpis[0].name).toBe('Margin %');
        expect(kpis[0].definition).toMatch(/Net profit/);
        expect(kpis[0].definition).not.toMatch(/second paragraph/);
        expect(kpis[0].units).toBe('percent');
        expect(kpis[0].direction).toBe('higher-is-better');
        expect(kpis[1].name).toBe('Cycle Time');
        expect(kpis[1].units).toBe('days');
    });

    test('detects currency / count / ratio / score units from definition text', () => {
        writePackFile(tmpRoot, 'p/sub-verticals/sv/kpis.md', [
            '## Revenue', '', 'Total revenue in dollars.',
            '', '## SKU Count', '', 'Number of distinct SKUs.',
            '', '## Stock Ratio', '', 'On-hand vs daily demand ratio.',
            '', '## NPS Score', '', 'Net Promoter score.',
        ].join('\n'));
        const kpis = parsePackKpis('p', 'sv', { packsRoot: tmpRoot });
        expect(kpis.find(k => k.name === 'Revenue').units).toBe('currency');
        expect(kpis.find(k => k.name === 'SKU Count').units).toBe('count');
        expect(kpis.find(k => k.name === 'Stock Ratio').units).toBe('ratio');
        expect(kpis.find(k => k.name === 'NPS Score').units).toBe('score');
    });

    test('skips appendix/notes headings', () => {
        writePackFile(tmpRoot, 'p/sub-verticals/sv/kpis.md', [
            '## OTIF', '', 'On-time in-full.',
            '', '## Cross-references', '', 'Linked KPIs.',
            '', '## Appendix', '', 'Extra notes.',
        ].join('\n'));
        const kpis = parsePackKpis('p', 'sv', { packsRoot: tmpRoot });
        expect(kpis.map(k => k.name)).toEqual(['OTIF']);
    });
});

/* ─── fuseKpis ───────────────────────────────────────────────────────── */

describe('fuseKpis', () => {
    test('pack KPIs win; probe-only KPIs added as source=probe', () => {
        const fused = fuseKpis({
            packKpis: [{ name: 'OTIF', definition: 'On-Time-In-Full', units: 'percent' }],
            probe: {
                declaredKpis: [
                    { name: 'OTIF', description: 'duplicate' },
                    { name: 'Fill Rate', description: 'cases on first pass' },
                ],
            },
            biMetadata: null,
        });
        expect(fused).toHaveLength(2);
        expect(fused[0]).toMatchObject({ name: 'OTIF', source: 'pack' });
        expect(fused[1]).toMatchObject({ name: 'Fill Rate', source: 'probe' });
    });

    test('BI-visible measures unique to BI are added with source=bi-surface', () => {
        const fused = fuseKpis({
            packKpis: [{ name: 'OTIF', definition: '' }],
            probe: { declaredKpis: ['Fill Rate'] },
            biMetadata: {
                visibleMeasures: [
                    { name: 'OTIF' },
                    { name: 'Margin %' },
                ],
            },
        });
        // Margin % is unique to BI → added; OTIF is duplicate → skipped (pack wins).
        const names = fused.map(k => k.name);
        expect(names).toEqual(['OTIF', 'Fill Rate', 'Margin %']);
        expect(fused.find(k => k.name === 'Margin %').source).toBe('bi-surface');
    });

    test('aligned=true when pack KPI matches a probe schema column', () => {
        const fused = fuseKpis({
            packKpis: [{ name: 'OTIF', definition: 'On-Time-In-Full', units: 'percent' }],
            probe: {
                schema: {
                    tables: [{
                        name: 'fct_otif',
                        columns: [{ name: 'otif' }, { name: 'week' }],
                    }],
                },
            },
            biMetadata: null,
        });
        expect(fused[0].aligned).toBe(true);
        expect(fused[0].grounded).toEqual([{ table: 'fct_otif', column: 'otif' }]);
    });

    test('aligned=false when no column match exists', () => {
        const fused = fuseKpis({
            packKpis: [{ name: 'OTIF', definition: '' }],
            probe: { schema: { tables: [{ name: 'fct_foo', columns: [{ name: 'something_else' }] }] } },
            biMetadata: null,
        });
        expect(fused[0].aligned).toBe(false);
        expect(fused[0].grounded).toEqual([]);
    });

    test('fuzzy match ignores underscores / case / hyphens', () => {
        const fused = fuseKpis({
            packKpis: [{ name: 'Cost-To-Serve', definition: '' }],
            probe: {
                schema: { tables: [{ name: 't', columns: [{ name: 'cost_to_serve' }] }] },
            },
            biMetadata: null,
        });
        expect(fused[0].aligned).toBe(true);
    });
});

/* ─── evaluateReachability ───────────────────────────────────────────── */

describe('evaluateReachability', () => {
    test('alwaysReachable frame is always ok', () => {
        const swot = FRAME_PREREQUISITES.find(f => f.id === 'swot-analysis');
        const verdict = evaluateReachability(swot, {
            fusedKpis: [],
            biDimensions: [],
            hasTimeDim: false,
        });
        expect(verdict.ok).toBe(true);
        expect(verdict.rationale).toMatch(/qualitative/i);
    });

    test('BCG matrix blocked when no currency measure available', () => {
        const bcg = FRAME_PREREQUISITES.find(f => f.id === 'bcg-matrix');
        const verdict = evaluateReachability(bcg, {
            fusedKpis: [],
            biDimensions: [{ name: 'Product', kind: 'product' }],
            hasTimeDim: true,
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.blockedBy).toMatch(/currency measure/);
    });

    test('BCG matrix blocked when no time dimension', () => {
        const bcg = FRAME_PREREQUISITES.find(f => f.id === 'bcg-matrix');
        const verdict = evaluateReachability(bcg, {
            fusedKpis: [{ name: 'Revenue', units: 'currency' }],
            biDimensions: [{ name: 'Product', kind: 'product' }],
            hasTimeDim: false,
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.blockedBy).toMatch(/time dimension/);
    });

    test('BCG matrix blocked when no shareable categorical dimension', () => {
        const bcg = FRAME_PREREQUISITES.find(f => f.id === 'bcg-matrix');
        const verdict = evaluateReachability(bcg, {
            fusedKpis: [{ name: 'Revenue', units: 'currency' }],
            biDimensions: [{ name: 'Date', kind: 'time' }],
            hasTimeDim: true,
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.blockedBy).toMatch(/product\/customer\/any dimension/);
    });

    test('BCG matrix reachable when all prerequisites satisfied', () => {
        const bcg = FRAME_PREREQUISITES.find(f => f.id === 'bcg-matrix');
        const verdict = evaluateReachability(bcg, {
            fusedKpis: [{ name: 'Revenue', units: 'currency' }, { name: 'OTIF', units: 'percent' }],
            biDimensions: [{ name: 'Product', kind: 'product' }, { name: 'Quarter', kind: 'time' }],
            hasTimeDim: true,
        });
        expect(verdict.ok).toBe(true);
        expect(verdict.rationale).toMatch(/currency measure/);
        expect(verdict.rationale).toMatch(/time dimension/);
    });

    test('Pareto reachable with currency measure + any categorical, no time required', () => {
        const pareto = FRAME_PREREQUISITES.find(f => f.id === 'pareto-8020');
        const verdict = evaluateReachability(pareto, {
            fusedKpis: [{ name: 'Revenue', units: 'currency' }],
            biDimensions: [{ name: 'Region', kind: 'geography' }],
            hasTimeDim: false,
        });
        expect(verdict.ok).toBe(true);
    });

    test('Supply chain frame reachable when at least one percent KPI present', () => {
        const sc = FRAME_PREREQUISITES.find(f => f.id === 'cpg-fmcg-supply-chain');
        const verdict = evaluateReachability(sc, {
            fusedKpis: [{ name: 'OTIF', units: 'percent' }],
            biDimensions: [],
            hasTimeDim: false,
        });
        expect(verdict.ok).toBe(true);
    });

    test('Supply chain frame blocked when no percent KPI present', () => {
        const sc = FRAME_PREREQUISITES.find(f => f.id === 'cpg-fmcg-supply-chain');
        const verdict = evaluateReachability(sc, {
            fusedKpis: [{ name: 'Revenue', units: 'currency' }],
            biDimensions: [],
            hasTimeDim: false,
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.blockedBy).toMatch(/percent/);
    });
});

/* ─── buildSnapshot — integration ─────────────────────────────────────── */

describe('buildSnapshot — fusion integration', () => {
    test('returns a snapshot with required fields when probe + pack supplied', () => {
        const snap = buildSnapshot({
            pack: 'cpg-fmcg',
            subVertical: 'supply-chain',
            cacheKey: 'test-key',
            probe: {
                profile: 'genie-default',
                connectorType: 'genie',
                metadataAvailability: 'rich',
                schema: { tables: [{ name: 'fct_otif', columns: [{ name: 'otif' }, { name: 'week' }] }] },
                declaredKpis: ['Fill Rate'],
            },
            biMetadata: {
                visibleMeasures: [{ name: 'OTIF', kind: 'percent' }],
                visibleDimensions: [
                    { name: 'Region', kind: 'geography' },
                    { name: 'Quarter', kind: 'time' },
                ],
            },
        });
        expect(snap.snapshotVersion).toBe(1);
        expect(snap.cacheKey).toBe('test-key');
        expect(typeof snap.fetchedAt).toBe('string');
        expect(typeof snap.expiresAt).toBe('string');
        expect(snap.sources.probe.connectorType).toBe('genie');
        expect(snap.sources.biMetadata).toBeTruthy();
        expect(snap.sources.packKpis.length).toBeGreaterThan(0);
        expect(snap.fused.availableKpis.length).toBeGreaterThan(0);
        expect(snap.fused.reachableFrames.length).toBeGreaterThan(0);
        // Supply chain MUST be reachable when supply-chain pack + percent KPI.
        expect(snap.fused.reachableFrames.find(f => f.frameId === 'cpg-fmcg-supply-chain')).toBeTruthy();
        // SWOT is alwaysReachable.
        expect(snap.fused.reachableFrames.find(f => f.frameId === 'swot-analysis')).toBeTruthy();
    });

    test('handles probe-only inputs (no pack, no biMetadata) gracefully', () => {
        const snap = buildSnapshot({
            probe: { profile: 'g', connectorType: 'genie', metadataAvailability: 'minimal' },
        });
        expect(snap.snapshotVersion).toBe(1);
        expect(snap.sources.packKpis).toEqual([]);
        expect(snap.fused.availableKpis).toEqual([]);
        // SWOT is alwaysReachable so it should appear.
        expect(snap.fused.reachableFrames.some(f => f.frameId === 'swot-analysis')).toBe(true);
        // BCG should NOT be reachable (no measures, no time dim).
        expect(snap.fused.unreachableFrames.some(f => f.frameId === 'bcg-matrix')).toBe(true);
    });

    test('null probe + null biMetadata still produces a usable snapshot', () => {
        const snap = buildSnapshot({ probe: null, biMetadata: null });
        expect(snap.snapshotVersion).toBe(1);
        expect(snap.sources.probe).toBeNull();
        expect(snap.fused.reachableFrames.some(f => f.frameId === 'swot-analysis')).toBe(true);
    });

    test('snapshot probe summary keeps only documented fields (raw probe not leaked)', () => {
        const snap = buildSnapshot({
            probe: {
                profile: 'g',
                connectorType: 'genie',
                metadataAvailability: 'rich',
                displayName: 'Sample Superstore',
                schema: { tables: [{ name: 't1', columns: [{ name: 'c1' }] }] },
                declaredKpis: ['A', 'B'],
                sampleQuestions: ['q1', 'q2'],
                warnings: ['w1'],
                // Sensitive-looking fields that should NOT appear in the summary:
                secret: 'should-not-leak',
            },
        });
        const summary = snap.sources.probe;
        expect(summary.tableCount).toBe(1);
        expect(summary.declaredKpiCount).toBe(2);
        expect(summary.sampleQuestionCount).toBe(2);
        expect(summary.warnings).toEqual(['w1']);
        expect(summary).not.toHaveProperty('secret');
        expect(summary).not.toHaveProperty('schema');
    });
});

/* ─── Cache ──────────────────────────────────────────────────────────── */

describe('discovery cache', () => {
    test('computeCacheKey is stable for same inputs, different for different inputs', () => {
        const a = computeCacheKey({ assistantProfile: 'p', pack: 'cpg-fmcg', subVertical: 'sc', biUrlHash: 'h1' });
        const b = computeCacheKey({ assistantProfile: 'p', pack: 'cpg-fmcg', subVertical: 'sc', biUrlHash: 'h1' });
        const c = computeCacheKey({ assistantProfile: 'p', pack: 'cpg-fmcg', subVertical: 'sc', biUrlHash: 'h2' });
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });

    test('cached entry returned within TTL, evicted after', () => {
        const key = computeCacheKey({ assistantProfile: 'p', pack: 'x', subVertical: 'y', biUrlHash: '' });
        const snap = { snapshotVersion: 1, marker: 'one' };
        setCachedSnapshot(key, snap, 1000);
        expect(getCachedSnapshot(key).marker).toBe('one');
        // Past expiry → null.
        expect(getCachedSnapshot(key, Date.now() + 2000)).toBeNull();
    });

    test('LRU eviction at max entries', () => {
        // Create 205 keys to force eviction of the first few.
        const keys = [];
        for (let i = 0; i < 205; i++) {
            const key = computeCacheKey({ assistantProfile: `p${i}`, pack: '', subVertical: '', biUrlHash: '' });
            keys.push(key);
            setCachedSnapshot(key, { snapshotVersion: 1, marker: `m${i}` });
        }
        // Oldest entries should be evicted (max is 200).
        expect(getCachedSnapshot(keys[0])).toBeNull();
        expect(getCachedSnapshot(keys[204])).toBeTruthy();
    });

    test('__resetCacheForTests clears all entries', () => {
        const key = computeCacheKey({ assistantProfile: 'p', pack: '', subVertical: '', biUrlHash: '' });
        setCachedSnapshot(key, { snapshotVersion: 1 });
        expect(getCachedSnapshot(key)).toBeTruthy();
        __resetCacheForTests();
        expect(getCachedSnapshot(key)).toBeNull();
    });

    test('getCachedSnapshot with null/missing key returns null', () => {
        expect(getCachedSnapshot(null)).toBeNull();
        expect(getCachedSnapshot('non-existent-key')).toBeNull();
    });
});

/* ─── Module constants ───────────────────────────────────────────────── */

describe('module exports', () => {
    test('FRAME_PREREQUISITES contains the strategic + vertical frames', () => {
        const ids = FRAME_PREREQUISITES.map(f => f.id);
        expect(ids).toEqual(expect.arrayContaining([
            'swot-analysis',
            'bcg-matrix',
            'pareto-8020',
            'cpg-fmcg-supply-chain',
            'cpg-fmcg-finance-fpa',
        ]));
    });

    test('DEFAULT_CACHE_TTL_MS is 60 seconds', () => {
        expect(DEFAULT_CACHE_TTL_MS).toBe(60 * 1000);
    });
});
