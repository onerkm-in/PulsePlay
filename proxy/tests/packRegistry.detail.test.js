// proxy/tests/packRegistry.detail.test.js
//
// Phase 8 (KB UI) — loadPackDetail + loadSubVerticalDetail return content
// for one pack / one sub-vertical respectively, with the same path-traversal
// safety check as packPromptLoader.

const path = require('path');
const { loadPackDetail, loadSubVerticalDetail, isSafePackSegment } = require('../lib/packRegistry');

const PACKS_ROOT = path.resolve(__dirname, '..', '..', 'pulsepacks');

describe('loadPackDetail', () => {
    test('returns full content for an installed pack', () => {
        const detail = loadPackDetail('cpg-fmcg', { packsRoot: PACKS_ROOT });
        expect(detail).not.toBeNull();
        expect(detail.name).toBe('cpg-fmcg');
        expect(typeof detail.displayName).toBe('string');
        expect(Array.isArray(detail.subVerticals)).toBe(true);
        expect(Array.isArray(detail.installedSubVerticals)).toBe(true);
        expect(detail.installedSubVerticals.length).toBeGreaterThan(0);
        // knowledge-base/* files are present in the cpg-fmcg reference pack.
        expect(typeof detail.knowledgeBase.glossary).toBe('string');
        expect(detail.knowledgeBase.glossary.length).toBeGreaterThan(0);
    });

    test('returns null for an unknown pack', () => {
        const detail = loadPackDetail('no-such-pack', { packsRoot: PACKS_ROOT });
        expect(detail).toBeNull();
    });

    test('rejects path-traversal pack identifiers', () => {
        expect(loadPackDetail('../etc/passwd', { packsRoot: PACKS_ROOT })).toBeNull();
        expect(loadPackDetail('..', { packsRoot: PACKS_ROOT })).toBeNull();
        expect(loadPackDetail('cpg/../other', { packsRoot: PACKS_ROOT })).toBeNull();
    });
});

describe('loadSubVerticalDetail', () => {
    test('returns content for an installed sub-vertical', () => {
        const detail = loadSubVerticalDetail('cpg-fmcg', 'supply-chain', { packsRoot: PACKS_ROOT });
        expect(detail).not.toBeNull();
        expect(detail.pack).toBe('cpg-fmcg');
        expect(detail.subVertical).toBe('supply-chain');
        // The cpg-fmcg supply-chain sub-vertical has prompt-context, kpis, sample-questions, bi-ai-fit.
        expect(typeof detail.promptContext).toBe('string');
        expect(typeof detail.kpis).toBe('string');
    });

    test('returns null for an unknown sub-vertical', () => {
        const detail = loadSubVerticalDetail('cpg-fmcg', 'nonexistent-sv', { packsRoot: PACKS_ROOT });
        expect(detail).toBeNull();
    });

    test('rejects path-traversal sub-vertical identifiers', () => {
        expect(loadSubVerticalDetail('cpg-fmcg', '../../etc/passwd', { packsRoot: PACKS_ROOT })).toBeNull();
        expect(loadSubVerticalDetail('cpg-fmcg', '..', { packsRoot: PACKS_ROOT })).toBeNull();
    });
});

describe('isSafePackSegment', () => {
    test('mirrors the packPromptLoader identifier regex', () => {
        expect(isSafePackSegment('cpg-fmcg')).toBe(true);
        expect(isSafePackSegment('supply-chain')).toBe(true);
        expect(isSafePackSegment('../etc')).toBe(false);
        expect(isSafePackSegment('CPG')).toBe(false); // uppercase not allowed
    });
});
