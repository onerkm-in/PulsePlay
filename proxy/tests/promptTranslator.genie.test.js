'use strict';

/**
 * promptTranslator.genie.test.js — Phase 11a.
 *
 * The CRITICAL backward-compatibility test for Phase 11a:
 *
 *   For a synthetic IR (built from `prompt-context.md` by buildSyntheticIR),
 *   `genie.translate(ir, { userQuestion }).userMessage` MUST equal
 *   `packPromptInjector.wrapAsGenieUserMessage(packContext, pack, sv, userQuestion)`
 *   BYTE FOR BYTE.
 *
 * If this assertion ever loosens, ALL packs that haven't migrated to an
 * authored prompt-ir.yaml/json will see their Genie prompt change — i.e.
 * 100% of today's packs. The dispatcher migration in Phase 11b leans on
 * this guarantee.
 *
 * We also cover the authored-IR path: the structured user message must
 * include the IR's role, vocabulary, guardrails, etc.
 */

const fs = require('fs');
const path = require('path');

const { buildSyntheticIR, __rebuildIRCache } = require('../lib/promptIR');
const { loadPromptContext, __rebuildCache: __rebuildLoaderCache } = require('../lib/packPromptLoader');
const { wrapAsGenieUserMessage } = require('../lib/packPromptInjector');
const genie = require('../lib/promptTranslators/genie');

beforeEach(() => {
    __rebuildIRCache();
    __rebuildLoaderCache();
});

/* ─── Backward-compat byte-identical regression ─────────────────────── */

describe('genie.translate — byte-identical to wrapAsGenieUserMessage for synthetic IR', () => {
    test('cpg-fmcg/supply-chain: synthetic-IR Genie output equals legacy wrapAsGenieUserMessage output', () => {
        // The real supply-chain pack ships with an authored prompt-ir.yaml,
        // so loadIR() would skip the synthetic path. We bypass loadIR and
        // construct a synthetic IR directly from the legacy markdown so the
        // backward-compat invariant is exercised against the actual file
        // content the project ships with.
        const ir = buildSyntheticIR('cpg-fmcg', 'supply-chain');
        expect(ir).not.toBeNull();
        expect(ir.meta.synthetic).toBe(true);

        const legacyContent = ir.overrides.genie.legacyPreamble;
        const userQuestion = 'How is supply-chain doing this week?';

        const fromTranslator = genie.translate(ir, { userQuestion }).userMessage;
        const fromLegacy = wrapAsGenieUserMessage(
            legacyContent,
            'cpg-fmcg',
            'supply-chain',
            userQuestion,
        );

        expect(fromTranslator).toBe(fromLegacy);
    });

    test('cpg-fmcg/sustainability (no authored IR yet) round-trip is byte-identical', () => {
        const ir = buildSyntheticIR('cpg-fmcg', 'sustainability');
        expect(ir).not.toBeNull();
        const userQuestion = 'How are we trending on scope-3 emissions?';

        const fromTranslator = genie.translate(ir, { userQuestion }).userMessage;
        const fromLegacy = wrapAsGenieUserMessage(
            ir.overrides.genie.legacyPreamble,
            'cpg-fmcg',
            'sustainability',
            userQuestion,
        );
        expect(fromTranslator).toBe(fromLegacy);
    });

    test('matches the exact "[Pack Context: <tag>]\\n\\n...\\n\\n[User Question]\\n\\n..." shape', () => {
        const ir = buildSyntheticIR('cpg-fmcg', 'supply-chain');
        const out = genie.translate(ir, { userQuestion: 'X' }).userMessage;
        expect(out.startsWith('[Pack Context: cpg-fmcg/supply-chain]\n\n')).toBe(true);
        expect(out.endsWith('\n\n[User Question]\n\nX')).toBe(true);
    });

    test('synthetic with whitespace-only legacy preamble degrades to bare userQuestion', () => {
        const ir = {
            schemaVersion: 1,
            id: 'p/sv',
            role: {}, task: { kind: 'answer-grounded' },
            vocabulary: [], functions: [],
            guardrails: { must: [], mustNot: [] },
            output: { format: 'free-text', sections: [] },
            examples: [],
            overrides: { genie: { legacyPreamble: '   \n\t   ' } },
            meta: { synthetic: true },
        };
        const out = genie.translate(ir, { userQuestion: 'Just the question.' }).userMessage;
        expect(out).toBe('Just the question.');
    });
});

/* ─── Authored-IR path ────────────────────────────────────────────── */

describe('genie.translate — authored IR (structured user message)', () => {
    const authoredIR = {
        schemaVersion: 1,
        id: 'cpg-fmcg/supply-chain',
        role: { persona: 'CPG/FMCG supply chain analyst', audience: 'planners' },
        task: { kind: 'answer-grounded' },
        vocabulary: [
            { term: 'OTIF', definition: 'On-Time-In-Full.', units: 'percentage', direction: 'higher-is-better' },
            { term: 'fill rate', definition: 'Cases shipped vs ordered.', direction: 'higher-is-better' },
        ],
        functions: [
            { name: 'compute_kpi', description: 'Compute a named KPI.' },
        ],
        guardrails: {
            must: ['Cite KPI definition from vocabulary.'],
            mustNot: ['Hallucinate retailer fines.'],
        },
        output: {
            format: 'structured-sections',
            sections: [
                { id: 'HEADLINE', required: true },
                { id: 'TRENDS', required: false },
            ],
        },
        examples: [],
        overrides: { genie: { extraUserPreamble: 'Prefer SQL over narrative.' } },
        meta: {},
    };

    test('includes persona, vocabulary, guardrails, output-format, and question', () => {
        const out = genie.translate(authoredIR, { userQuestion: 'Q?' }).userMessage;
        expect(out).toMatch(/\[Persona\]/);
        expect(out).toMatch(/supply chain analyst/);
        expect(out).toMatch(/\[Vocabulary\]/);
        expect(out).toMatch(/OTIF: On-Time-In-Full/);
        expect(out).toMatch(/\[higher-is-better\]/);
        expect(out).toMatch(/\(units: percentage\)/);
        expect(out).toMatch(/\[Guardrails\]/);
        expect(out).toMatch(/DO: Cite KPI definition/);
        expect(out).toMatch(/AVOID: Hallucinate retailer fines/);
        expect(out).toMatch(/\[Available concepts\]/);
        expect(out).toMatch(/- compute_kpi: Compute a named KPI\./);
        expect(out).toMatch(/\[Notes\]/);
        expect(out).toMatch(/Prefer SQL over narrative\./);
        expect(out).toMatch(/\[Output format\]/);
        expect(out).toMatch(/HEADLINE, TRENDS/);
        expect(out).toMatch(/\[Question\]\n\nQ\?$/);
    });

    test('omits sections when their IR fields are absent', () => {
        const minimal = {
            schemaVersion: 1, id: 'x/y',
            role: {}, vocabulary: [], functions: [],
            guardrails: { must: [], mustNot: [] },
            output: {}, examples: [],
            overrides: {}, meta: {},
        };
        const out = genie.translate(minimal, { userQuestion: 'hello' }).userMessage;
        // With no IR content, the translator emits just the bare question.
        expect(out).toBe('hello');
    });

    test('Phase B: structured-sections output adds an SQL-provenance directive citing the section IDs', () => {
        const out = genie.translate(authoredIR, { userQuestion: 'Q?' }).userMessage;
        expect(out).toMatch(/\[SQL provenance\]/);
        expect(out).toMatch(/\/\* Section: <SECTION_ID> \*\//);
        // Section IDs verbatim from the IR (HEADLINE, TRENDS in this fixture).
        expect(out).toMatch(/HEADLINE, TRENDS/);
    });

    test('Phase B: SQL-provenance directive is absent when IR has no sections', () => {
        const ir = {
            ...authoredIR,
            output: { format: 'free-text', sections: [] },
        };
        const out = genie.translate(ir, { userQuestion: 'Q' }).userMessage;
        expect(out).not.toMatch(/\[SQL provenance\]/);
    });

    test('omits Guardrails block when both must and mustNot are empty', () => {
        const ir = {
            ...authoredIR,
            guardrails: { must: [], mustNot: [] },
        };
        const out = genie.translate(ir, { userQuestion: 'Q' }).userMessage;
        expect(out).not.toMatch(/\[Guardrails\]/);
    });

    test('returns kind + meta diagnostics', () => {
        const payload = genie.translate(authoredIR, { userQuestion: 'Q' });
        expect(payload.kind).toBe('genie');
        expect(payload.meta.translator).toBe('genie');
        expect(payload.meta.irId).toBe('cpg-fmcg/supply-chain');
        expect(payload.meta.irVersion).toBe(1);
        expect(payload.meta.synthetic).toBe(false);
    });

    test('marks synthetic=true in meta when IR is synthetic', () => {
        const ir = buildSyntheticIR('cpg-fmcg', 'supply-chain');
        const payload = genie.translate(ir, { userQuestion: 'Q' });
        expect(payload.meta.synthetic).toBe(true);
    });
});

/* ─── Defensive paths ─────────────────────────────────────────────── */

describe('genie.translate — defensive', () => {
    test('coerces missing userQuestion to empty string', () => {
        const ir = buildSyntheticIR('cpg-fmcg', 'supply-chain');
        const out = genie.translate(ir, {}).userMessage;
        expect(out.endsWith('[User Question]\n\n')).toBe(true);
    });

    test('does NOT call wrapAsGenieUserMessage but produces identical bytes — paranoid double-check using a fresh load via loadPromptContext', () => {
        // Build the legacy header from packPromptInjector's loadPromptContext
        // path (different code from buildSyntheticIR) and assert equivalence.
        const loaded = loadPromptContext('cpg-fmcg', 'supply-chain');
        expect(loaded).not.toBeNull();
        const legacyHeader = wrapAsGenieUserMessage(loaded.content, 'cpg-fmcg', 'supply-chain', 'paranoid-Q');

        const ir = buildSyntheticIR('cpg-fmcg', 'supply-chain');
        const translatorOut = genie.translate(ir, { userQuestion: 'paranoid-Q' }).userMessage;
        expect(translatorOut).toBe(legacyHeader);
    });

    test('exposes type identifier', () => {
        expect(genie.type).toBe('genie');
    });
});
