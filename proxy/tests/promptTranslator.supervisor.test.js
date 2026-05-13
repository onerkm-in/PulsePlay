'use strict';

/**
 * promptTranslator.supervisor.test.js — Phase 11a.
 *
 * The Supervisor translator fans queries across multiple Genie spaces and
 * then synthesises the answers via the Foundation Model translator. This
 * test verifies the structural shape of that payload — the runtime fan-out
 * itself is tested in proxy/tests/server.test.js against the live server.
 */

const supervisor = require('../lib/promptTranslators/supervisor');
const genie = require('../lib/promptTranslators/genie');
const foundationModel = require('../lib/promptTranslators/foundationModel');

const baseIR = {
    schemaVersion: 1,
    id: 'cpg-fmcg/supply-chain',
    role: { persona: 'analyst' },
    task: { kind: 'answer-grounded' },
    vocabulary: [{ term: 'OTIF', definition: 'On-Time-In-Full.' }],
    functions: [],
    guardrails: { must: [], mustNot: [] },
    output: { format: 'free-text', sections: [] },
    examples: [],
    overrides: {},
    meta: {},
};

describe('supervisor.translate — fan-out', () => {
    test('returns kind=supervisor with fanOut array sized to spaces', () => {
        const out = supervisor.translate(baseIR, {
            userQuestion: 'How are we doing?',
            spaces: ['space-a', 'space-b', 'space-c'],
        });
        expect(out.kind).toBe('supervisor');
        expect(Array.isArray(out.fanOut)).toBe(true);
        expect(out.fanOut).toHaveLength(3);
        expect(out.fanOut.map(f => f.space)).toEqual(['space-a', 'space-b', 'space-c']);
    });

    test('each fan-out entry payload comes from the Genie translator', () => {
        const out = supervisor.translate(baseIR, {
            userQuestion: 'Q',
            spaces: ['space-a'],
        });
        const expected = genie.translate(baseIR, { userQuestion: 'Q', spaces: ['space-a'] });
        expect(out.fanOut[0].payload.kind).toBe('genie');
        expect(out.fanOut[0].payload.userMessage).toBe(expected.userMessage);
    });

    test('empty spaces → empty fanOut + synthesis still present', () => {
        const out = supervisor.translate(baseIR, { userQuestion: 'Q', spaces: [] });
        expect(out.fanOut).toEqual([]);
        expect(out.synthesis).toBeDefined();
        expect(out.synthesis.kind).toBe('openai-compatible');
    });

    test('missing spaces → empty fanOut + synthesis still present', () => {
        const out = supervisor.translate(baseIR, { userQuestion: 'Q' });
        expect(out.fanOut).toEqual([]);
        expect(out.synthesis).toBeDefined();
    });
});

describe('supervisor.translate — synthesis step', () => {
    test('synthesis uses Foundation Model translator with task.kind=summarise', () => {
        const out = supervisor.translate(baseIR, { userQuestion: 'Q', spaces: ['s1'] });
        expect(out.synthesis.kind).toBe('openai-compatible');
        // The synthesis system prompt should say "Task: summarise" because we
        // bumped task.kind for the synthesis IR. Verify by comparing against
        // an explicit foundationModel.translate call with the bumped IR.
        const synthIR = { ...baseIR, task: { ...baseIR.task, kind: 'summarise' } };
        const expected = foundationModel.translate(synthIR, { userQuestion: 'Q', spaces: ['s1'] });
        expect(out.synthesis.messages[0].content).toBe(expected.messages[0].content);
        expect(out.synthesis.messages[0].content).toMatch(/Task: summarise/);
    });

    test('synthesis carries the user question through', () => {
        const out = supervisor.translate(baseIR, { userQuestion: 'Compare regions', spaces: ['s1', 's2'] });
        const last = out.synthesis.messages[out.synthesis.messages.length - 1];
        expect(last).toEqual({ role: 'user', content: 'Compare regions' });
    });
});

describe('supervisor.translate — meta', () => {
    test('reports translator, IR identifiers, and space count', () => {
        const out = supervisor.translate(baseIR, { userQuestion: 'Q', spaces: ['a', 'b'] });
        expect(out.meta.translator).toBe('supervisor');
        expect(out.meta.irId).toBe('cpg-fmcg/supply-chain');
        expect(out.meta.irVersion).toBe(1);
        expect(out.meta.synthetic).toBe(false);
        expect(out.meta.spaceCount).toBe(2);
    });

    test('propagates synthetic flag from IR meta', () => {
        const ir = { ...baseIR, meta: { synthetic: true } };
        const out = supervisor.translate(ir, { userQuestion: 'Q' });
        expect(out.meta.synthetic).toBe(true);
    });
});

describe('supervisor.translate — type identifier', () => {
    test('exposes type', () => {
        expect(supervisor.type).toBe('supervisor');
    });
});
