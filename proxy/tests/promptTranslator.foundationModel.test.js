'use strict';

/**
 * promptTranslator.foundationModel.test.js — Phase 11a.
 *
 * Verifies that the Foundation Model translator emits the OpenAI
 * chat-completions-shaped payload defined in
 * docs/PROMPT_IR_ARCHITECTURE.md:
 *
 *   - System message carries persona / audience / tone / vocabulary /
 *     guardrails / output-format hint.
 *   - examples[] expand into alternating user/assistant turns BEFORE the
 *     real user question.
 *   - functions[] become OpenAI-native `tools: [{type:'function', ...}]`.
 *   - structured-sections output becomes `response_format.json_schema`.
 *   - Synthetic-IR fallback lifts the legacy markdown into the system
 *     message (worse than authored, but better than feeding Genie-shaped
 *     markdown as a single user turn).
 */

const { buildSyntheticIR } = require('../lib/promptIR');
const foundationModel = require('../lib/promptTranslators/foundationModel');

/* ─── Authored IR ────────────────────────────────────────────────── */

describe('foundationModel.translate — authored IR', () => {
    const authoredIR = {
        schemaVersion: 1,
        id: 'cpg-fmcg/supply-chain',
        role: {
            persona: 'CPG/FMCG supply chain analyst',
            audience: 'planners and S&OP leads',
            tone: 'terse, evidence-led',
        },
        task: { kind: 'answer-grounded', scope: 'connected space', freshness: 'latest refresh' },
        vocabulary: [
            { term: 'OTIF', definition: 'On-Time-In-Full.', units: 'percentage', direction: 'higher-is-better' },
        ],
        functions: [
            {
                name: 'compute_kpi',
                description: 'Compute a named KPI.',
                parameters: {
                    kpi: { type: 'string', enum: ['OTIF', 'fill_rate'] },
                    window: { type: 'string' },
                },
            },
        ],
        guardrails: {
            must: ['Cite the certified KPI definition.'],
            mustNot: ['Hallucinate retailer fines.'],
        },
        output: {
            format: 'structured-sections',
            sections: [
                { id: 'HEADLINE', required: true, maxChars: 280 },
                { id: 'TRENDS', required: false },
            ],
        },
        examples: [
            { q: 'How is supply chain this week?', a: 'OTIF at 92% (target 95%).' },
        ],
        overrides: {},
        meta: {},
    };

    test('builds an OpenAI-shaped messages array', () => {
        const out = foundationModel.translate(authoredIR, { userQuestion: 'Latest OTIF?' });
        expect(out.kind).toBe('openai-compatible');
        expect(Array.isArray(out.messages)).toBe(true);
        expect(out.messages[0].role).toBe('system');
        expect(out.messages[out.messages.length - 1].role).toBe('user');
        expect(out.messages[out.messages.length - 1].content).toBe('Latest OTIF?');
    });

    test('system message mentions persona, audience, tone, vocabulary, guardrails', () => {
        const out = foundationModel.translate(authoredIR, { userQuestion: 'Q' });
        const sys = out.messages[0].content;
        expect(sys).toMatch(/CPG\/FMCG supply chain analyst/);
        expect(sys).toMatch(/Audience: planners/);
        expect(sys).toMatch(/Tone: terse/);
        expect(sys).toMatch(/Domain vocabulary/);
        expect(sys).toMatch(/OTIF: On-Time-In-Full/);
        expect(sys).toMatch(/MUST: Cite the certified KPI/);
        expect(sys).toMatch(/MUST NOT: Hallucinate retailer fines/);
        expect(sys).toMatch(/Output sections: HEADLINE \(required\), TRENDS/);
    });

    test('Phase B: system message adds a CTE-labelling directive citing section IDs', () => {
        const out = foundationModel.translate(authoredIR, { userQuestion: 'Q' });
        const sys = out.messages[0].content;
        expect(sys).toMatch(/\/\* Section: <SECTION_ID> \*\//);
        expect(sys).toMatch(/HEADLINE, TRENDS/);
    });

    test('Phase B: directive is absent when IR has no structured sections', () => {
        const ir = { ...authoredIR, output: { format: 'free-text' } };
        const out = foundationModel.translate(ir, { userQuestion: 'Q' });
        const sys = out.messages[0].content;
        expect(sys).not.toMatch(/Section: <SECTION_ID>/);
    });

    test('examples expand into alternating user/assistant turns BEFORE the user question', () => {
        const out = foundationModel.translate(authoredIR, { userQuestion: 'New Q' });
        // [system, user(example.q), assistant(example.a), user(New Q)]
        expect(out.messages.length).toBe(4);
        expect(out.messages[1]).toEqual({ role: 'user', content: 'How is supply chain this week?' });
        expect(out.messages[2]).toEqual({ role: 'assistant', content: 'OTIF at 92% (target 95%).' });
        expect(out.messages[3].content).toBe('New Q');
    });

    test('functions[] become OpenAI tools', () => {
        const out = foundationModel.translate(authoredIR, { userQuestion: 'Q' });
        expect(Array.isArray(out.tools)).toBe(true);
        expect(out.tools).toHaveLength(1);
        expect(out.tools[0].type).toBe('function');
        expect(out.tools[0].function.name).toBe('compute_kpi');
        expect(out.tools[0].function.description).toBe('Compute a named KPI.');
        expect(out.tools[0].function.parameters.type).toBe('object');
        expect(out.tools[0].function.parameters.properties.kpi).toBeDefined();
        expect(out.tools[0].function.parameters.properties.window).toBeDefined();
        expect(Array.isArray(out.tools[0].function.parameters.required)).toBe(true);
    });

    test('structured-sections output becomes json_schema response_format', () => {
        const out = foundationModel.translate(authoredIR, { userQuestion: 'Q' });
        expect(out.response_format.type).toBe('json_schema');
        expect(out.response_format.json_schema.name).toBe('pulseplay_structured_answer');
        const schema = out.response_format.json_schema.schema;
        expect(schema.type).toBe('object');
        expect(schema.properties.HEADLINE).toBeDefined();
        expect(schema.properties.HEADLINE.type).toBe('string');
        expect(schema.properties.HEADLINE.maxLength).toBe(280);
        expect(schema.properties.TRENDS).toBeDefined();
        expect(schema.required).toEqual(['HEADLINE']);
        expect(schema.additionalProperties).toBe(false);
    });

    test('format=json (free-form JSON) becomes json_object response_format', () => {
        const ir = { ...authoredIR, output: { format: 'json' } };
        const out = foundationModel.translate(ir, { userQuestion: 'Q' });
        expect(out.response_format).toEqual({ type: 'json_object' });
    });

    test('format=free-text omits response_format', () => {
        const ir = { ...authoredIR, output: { format: 'free-text' } };
        const out = foundationModel.translate(ir, { userQuestion: 'Q' });
        expect(out.response_format).toBeUndefined();
    });

    test('meta carries translator + IR identifiers', () => {
        const out = foundationModel.translate(authoredIR, { userQuestion: 'Q' });
        expect(out.meta.translator).toBe('foundation-model');
        expect(out.meta.irId).toBe('cpg-fmcg/supply-chain');
        expect(out.meta.irVersion).toBe(1);
        expect(out.meta.synthetic).toBe(false);
    });

    test('schemaContext from request lands in the system prompt', () => {
        const out = foundationModel.translate(authoredIR, {
            userQuestion: 'Q',
            schemaContext: 'fct_otif_weekly(date, otif_pct)',
        });
        expect(out.messages[0].content).toMatch(/Schema context/);
        expect(out.messages[0].content).toMatch(/fct_otif_weekly/);
    });
});

/* ─── Synthetic IR ────────────────────────────────────────────────── */

describe('foundationModel.translate — synthetic IR fallback', () => {
    test('synthetic IR lifts legacyPreamble into the system prompt', () => {
        const ir = buildSyntheticIR('cpg-fmcg', 'supply-chain');
        expect(ir).not.toBeNull();
        const out = foundationModel.translate(ir, { userQuestion: 'Q?' });
        expect(out.messages[0].role).toBe('system');
        expect(out.messages[0].content).toMatch(/Domain reference/);
        // Verify some content from the actual prompt-context.md leaks through.
        expect(out.messages[0].content.length).toBeGreaterThan(100);
        expect(out.messages[out.messages.length - 1]).toEqual({ role: 'user', content: 'Q?' });
        expect(out.meta.synthetic).toBe(true);
        expect(out.tools).toBeUndefined();
        expect(out.response_format).toBeUndefined();
    });

    test('synthetic IR without legacyPreamble still produces a usable payload (system block may be empty)', () => {
        const ir = {
            schemaVersion: 1, id: 'p/sv',
            role: {}, task: { kind: 'answer-grounded' },
            vocabulary: [], functions: [],
            guardrails: { must: [], mustNot: [] },
            output: {}, examples: [],
            overrides: { genie: { legacyPreamble: '' } },
            meta: { synthetic: true },
        };
        const out = foundationModel.translate(ir, { userQuestion: 'just-q' });
        // Empty system content → system message is omitted entirely.
        expect(out.messages[0].role).toBe('user');
        expect(out.messages[0].content).toBe('just-q');
    });
});

/* ─── Defensive ──────────────────────────────────────────────────── */

describe('foundationModel.translate — defensive', () => {
    test('coerces missing userQuestion to empty string', () => {
        const ir = { schemaVersion: 1, id: 'x/y' };
        const out = foundationModel.translate(ir, {});
        expect(out.messages[out.messages.length - 1]).toEqual({ role: 'user', content: '' });
    });

    test('function with JSON-Schema-shaped parameters passes through unchanged', () => {
        const ir = {
            schemaVersion: 1, id: 'p/sv',
            functions: [{
                name: 'fn',
                description: 'd',
                parameters: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
            }],
        };
        const out = foundationModel.translate(ir, { userQuestion: 'Q' });
        expect(out.tools[0].function.parameters).toEqual({
            type: 'object',
            properties: { x: { type: 'string' } },
            required: ['x'],
        });
    });

    test('exposes type identifier', () => {
        expect(foundationModel.type).toBe('foundation-model');
    });
});
