'use strict';

/**
 * foundationChatGrounding.test.js — bound-measure grounding on the Ask Pulse
 * CHAT path (`startFoundationConversation` via POST /assistant/conversations/
 * start), distinct from the sectioned /foundation/section path covered by
 * foundationGrounding.test.js.
 *
 * The visual sends the bound measures' server-aggregated VALUES as a
 * `boundMeasures` OBJECT ({ "Total Sales": 1250, ... }) rather than pre-shaped
 * grounded rows. The proxy folds that object into
 * { columns: ['Measure','Value'], rows } grounded data, injects it into the FM
 * USER prompt, verifies the answer against it, and echoes `queryResult`.
 * Without boundMeasures the chat response stays clean (ungrounded). This guards
 * the object→rows fold + routing that the section-path test never exercises.
 *
 * callFoundationModel is mocked so we test the route's fold + grounding layer,
 * not the model. Mirrors foundationGrounding.test.js's harness.
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

// Bound-measure VALUES the visual would send for the current filter scope.
const BOUND = { 'Total Sales': 1250, 'Order Count': 42 };

// TRIPWIRE: the /assistant/* routes resolve the profile name from
// `body.assistantProfile` (see resolveProfile in server.js), NOT `body.profile`
// (which the /foundation/* routes read). Sending `profile:` here silently falls
// back to the `default` profile → Genie path → "no access token" → 500.

describe('POST /assistant/conversations/start — foundation chat grounding (boundMeasures)', () => {
    beforeEach(() => callFoundationModel.mockReset());

    test('folds boundMeasures object into grounded rows, verifies, echoes queryResult', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: 'Total Sales were 1250 across 42 orders.',
            parsedJson: null,
        });

        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'foundation', content: 'How are sales?', boundMeasures: BOUND });

        expect(res.status).toBe(200);
        expect(res.body.mode).toBe('foundation-model');
        expect(res.body.grounding).toBeTruthy();
        expect(res.body.grounding.status).toBe('verified');
        expect(res.body.grounding.grounded).toBe(true);
        // object folded to a 2-row Measure/Value table, echoed for the frontend advisory
        expect(res.body.queryResult.columns).toEqual(['Measure', 'Value']);
        expect(res.body.queryResult.rows).toHaveLength(2);
    });

    test('passes the folded measure values into the FM user prompt', async () => {
        callFoundationModel.mockResolvedValueOnce({ content: 'ok', parsedJson: null });

        await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'foundation', content: 'summary', boundMeasures: BOUND });

        const opts = callFoundationModel.mock.calls[0][2];
        const userMsg = opts.messages.find(m => m.role === 'user');
        expect(userMsg.content).toContain('Total Sales');
        expect(userMsg.content).toContain('1250');
    });

    test('stamps grounding=partial when the answer invents an unsupplied figure', async () => {
        callFoundationModel.mockResolvedValueOnce({
            content: 'Total Sales were 1250, with a forecast of 99999.',
            parsedJson: null,
        });

        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'foundation', content: 'forecast?', boundMeasures: BOUND });

        expect(res.status).toBe(200);
        expect(res.body.grounding.status).toBe('partial');
        expect(res.body.grounding.grounded).toBe(false);
        expect(res.body.grounding.unmatched.some(u => Math.abs(u.value - 99999) < 1)).toBe(true);
    });

    test('omits grounding + queryResult when no boundMeasures supplied (ungrounded chat)', async () => {
        callFoundationModel.mockResolvedValueOnce({ content: 'A general answer.', parsedJson: null });

        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'foundation', content: 'hello' });

        expect(res.status).toBe(200);
        expect(res.body.content).toBe('A general answer.');
        expect(res.body).not.toHaveProperty('grounding');
        expect(res.body).not.toHaveProperty('queryResult');
    });

    test('ignores a boundMeasures payload with no numeric/string leaves (no rows → ungrounded)', async () => {
        callFoundationModel.mockResolvedValueOnce({ content: 'answer', parsedJson: null });

        const res = await request(app)
            .post('/assistant/conversations/start')
            .send({ assistantProfile: 'foundation', content: 'q', boundMeasures: { nested: { a: 1 }, arr: [1, 2] } });

        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('grounding');
    });
});
