'use strict';

/**
 * foundationSectionPromptIR.test.js — the first Prompt IR serving slice.
 *
 * /foundation/section previously injected no pack context at all (packBlock
 * was hard-null), so wiring the IR dispatcher in is additive. These tests pin
 * the three-way precedence:
 *
 *   explicit systemPrompt  >  pack's prompt-ir.yaml via the foundation-model
 *   translator  >  defaultSystemPromptForSection
 *
 * The authored cpg-fmcg/supply-chain IR in pulsepacks/ is used as-is — it is
 * repo content, not a fixture, which also proves the authored IRs actually
 * load. callFoundationModel is mocked to capture what the route sends.
 */

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';
process.env.PROXY_PROFILE_FOUNDATION_TYPE = 'foundation-model';
process.env.PROXY_PROFILE_FOUNDATION_HOST = 'https://dbc-test.cloud.databricks.com';
process.env.PROXY_PROFILE_FOUNDATION_TOKEN = 'dapi_test';
process.env.PROXY_PROFILE_FOUNDATION_FOUNDATION_MODEL_ENDPOINT = 'databricks-meta-llama-3-3-70b-instruct';

const request = require('supertest');

jest.mock('../lib/foundationModelClient', () => {
    const real = jest.requireActual('../lib/foundationModelClient');
    return { ...real, callFoundationModel: jest.fn() };
});

const { callFoundationModel } = require('../lib/foundationModelClient');
const { app } = require('../server');

function sentSystemPrompt() {
    const args = callFoundationModel.mock.calls[0];
    const opts = args[2];
    return opts.messages.find((m) => m.role === 'system').content;
}

describe('POST /foundation/section — Prompt IR system prompt', () => {
    beforeEach(() => {
        callFoundationModel.mockReset();
        callFoundationModel.mockResolvedValue({ content: 'ok', parsedJson: null });
    });

    test('pack + subVertical with no systemPrompt uses the authored IR', async () => {
        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Summarize OTIF.', pack: 'cpg-fmcg', subVertical: 'supply-chain' });

        expect(res.status).toBe(200);
        const sys = sentSystemPrompt();
        // Authored IR content, not the default formatting header.
        expect(sys).toContain('CPG/FMCG supply chain analyst');
        expect(sys).toContain('OTIF');
        expect(sys).not.toContain('You are an analytics formatting assistant.');
    });

    test('no pack keeps the default section prompt exactly as before', async () => {
        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Summarize revenue.' });

        expect(res.status).toBe(200);
        expect(sentSystemPrompt()).toContain('You are an analytics formatting assistant.');
    });

    test('an explicit systemPrompt beats the pack IR', async () => {
        const res = await request(app)
            .post('/foundation/section')
            .send({
                profile: 'foundation',
                userPrompt: 'Summarize.',
                systemPrompt: 'CUSTOM CALLER PROMPT',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
            });

        expect(res.status).toBe(200);
        const sys = sentSystemPrompt();
        expect(sys).toContain('CUSTOM CALLER PROMPT');
        expect(sys).not.toContain('CPG/FMCG supply chain analyst');
    });

    test('an unknown pack falls back to the default prompt instead of failing', async () => {
        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Summarize.', pack: 'no-such-pack', subVertical: 'nope' });

        expect(res.status).toBe(200);
        expect(sentSystemPrompt()).toContain('You are an analytics formatting assistant.');
    });

    test('IR injection still composes with groundedData blocks', async () => {
        callFoundationModel.mockResolvedValueOnce({ content: 'OTIF was 94.45%.', parsedJson: null });
        const res = await request(app)
            .post('/foundation/section')
            .send({
                profile: 'foundation',
                userPrompt: 'Cite OTIF.',
                pack: 'cpg-fmcg',
                subVertical: 'supply-chain',
                groundedData: { columns: ['measure', 'value'], rows: [['OTIF Pct', 94.45]] },
            });

        expect(res.status).toBe(200);
        expect(res.body.grounding.status).toBe('verified');
        const sys = sentSystemPrompt();
        expect(sys).toContain('CPG/FMCG supply chain analyst');
        expect(sys).toContain('94.45'); // grounded block folded in alongside the IR prompt
    });
});
