'use strict';

/**
 * foundationGrounding.test.js — grounded Foundation Model narration.
 *
 * Verifies the /foundation/section route, when given caller-supplied
 * `groundedData` rows:
 *   - stamps a `grounding` verdict by cross-checking the FM prose against
 *     those rows (verified vs partial),
 *   - echoes `queryResult` so the (fail-closed) frontend advisory can see
 *     the rows and render grounded instead of "Illustrative",
 *   - omits both fields entirely when no groundedData is supplied (clean
 *     fallback for ungrounded callers).
 *
 * callFoundationModel is mocked so we test the route's grounding layer, not
 * the model.
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

const GROUNDED = {
    columns: ['period', 'revenue'],
    rows: [['Q1', 100], ['Q2', 200], ['Q3', 300], ['Q4', 250]],
};

describe('POST /foundation/section — grounding verdict', () => {
    beforeEach(() => callFoundationModel.mockReset());

    test('stamps grounding=verified + echoes queryResult when prose cites only grounded numbers', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: 'Q4 revenue of 250 led the year; total revenue was $850.',
            parsedJson: null,
        });

        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Summarize revenue.', groundedData: GROUNDED });

        expect(res.status).toBe(200);
        expect(res.body.grounding).toBeTruthy();
        expect(res.body.grounding.status).toBe('verified');
        expect(res.body.grounding.grounded).toBe(true);
        expect(res.body.grounding.rowCount).toBe(4);
        // rows echoed so the frontend grounding advisory sees them
        expect(res.body.queryResult.rows).toHaveLength(4);
    });

    test('stamps grounding=partial and lists the invented figure', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: 'Q4 revenue was 250, and the pipeline is worth $9,999.',
            parsedJson: null,
        });

        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Summarize revenue.', groundedData: GROUNDED });

        expect(res.status).toBe(200);
        expect(res.body.grounding.status).toBe('partial');
        expect(res.body.grounding.grounded).toBe(false);
        expect(res.body.grounding.unmatched).toHaveLength(1);
        expect(res.body.grounding.unmatched[0].value).toBeCloseTo(9999, 0);
    });

    test('passes the grounded rows into the FM system prompt', async () => {
        callFoundationModel.mockResolvedValueOnce({ content: 'ok', parsedJson: null });

        await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'Summarize.', groundedData: GROUNDED });

        const opts = callFoundationModel.mock.calls[0][2];
        const systemMsg = opts.messages.find(m => m.role === 'system');
        expect(systemMsg.content).toContain('[Grounded Data]');
        expect(systemMsg.content).toContain('period | revenue');
        expect(systemMsg.content).toMatch(/ONLY source of truth/i);
    });

    test('omits grounding + queryResult entirely when no groundedData supplied', async () => {
        callFoundationModel.mockResolvedValueOnce({ content: 'A narrative answer.', parsedJson: null });

        const res = await request(app)
            .post('/foundation/section')
            .send({ profile: 'foundation', userPrompt: 'narrative please' });

        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('grounding');
        expect(res.body).not.toHaveProperty('queryResult');
    });
});
