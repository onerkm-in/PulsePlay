'use strict';

/**
 * sectionedRoute.test.js — Phase D.2.
 *
 * Integration tests for the SSE endpoint /assistant/conversations/start-sectioned.
 *
 * Coverage:
 *   - 400 bombs for missing userPrompt / sections / unresolvable profile / bad schedule
 *   - Default schedule (head=2 with 2000ms spread, then 2-each) is fired in stage order
 *   - SSE frames are formatted `event: <kind>\ndata: <json>\n\n`
 *   - Section payloads carry the FM-call body + usage
 *   - One section failing emits section-failed; peers + later stages still finish
 *   - regenerateOnly skips probe machinery + only fires the named sections,
 *     reusing probeCache + headlineCache for downstream context
 *   - Headers include text/event-stream + X-Accel-Buffering: no
 */

process.env.NODE_ENV = 'test';
process.env.SUPERVISOR_ENABLED = 'false';
process.env.PROXY_PROFILE_FOUNDATION_TYPE = 'foundation-model';
process.env.PROXY_PROFILE_FOUNDATION_HOST = 'https://dbc-test.cloud.databricks.com';
process.env.PROXY_PROFILE_FOUNDATION_TOKEN = 'dapi_test';
process.env.PROXY_PROFILE_FOUNDATION_FOUNDATION_MODEL_ENDPOINT = 'databricks-meta-llama-3-1-405b-instruct';

const request = require('supertest');

jest.mock('../lib/foundationModelClient', () => {
    const real = jest.requireActual('../lib/foundationModelClient');
    return {
        ...real,
        callFoundationModel: jest.fn(),
    };
});
// Skip the slow head-stage spread sleep in unit tests by mocking the
// orchestrator wrapper used by the route. We patch the underlying module so
// that route-level orchestrate() still works end-to-end but with sleep
// stubbed to a microtask.
jest.mock('../lib/sectionedOrchestrator', () => {
    const real = jest.requireActual('../lib/sectionedOrchestrator');
    const fastOrchestrate = (opts) => real.orchestrate({
        ...opts,
        sleep: () => Promise.resolve(),
    });
    return { ...real, orchestrate: fastOrchestrate };
});

const { callFoundationModel } = require('../lib/foundationModelClient');
const { app } = require('../server');

/**
 * Send a POST that buffers the entire SSE response body into `res.text`.
 * supertest/superagent doesn't recognise text/event-stream as a buffered
 * type by default, so we register an explicit parser.
 */
function postSse(path, body) {
    return request(app)
        .post(path)
        .send(body)
        .buffer(true)
        .parse((res, callback) => {
            res.setEncoding('utf8');
            let acc = '';
            res.on('data', (chunk) => { acc += chunk; });
            res.on('end', () => callback(null, acc));
        });
}

function parseSseFrames(rawBody) {
    if (!rawBody || typeof rawBody !== 'string') return [];
    // Split on the SSE record terminator. Each frame is `event: X\ndata: Y`.
    return rawBody
        .split('\n\n')
        .map(f => f.trim())
        .filter(Boolean)
        .map(frame => {
            const lines = frame.split('\n');
            const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
            const dataLine = lines.find(l => l.startsWith('data:'))?.slice(5).trim();
            return {
                event,
                data: dataLine ? JSON.parse(dataLine) : null,
            };
        });
}

describe('POST /assistant/conversations/start-sectioned — validation', () => {
    beforeEach(() => callFoundationModel.mockReset());

    test('400 when userPrompt is missing', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start-sectioned')
            .send({ profile: 'foundation', sections: ['HEADLINE'] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/userPrompt is required/);
    });

    test('400 when neither sections nor explicit schedule is supplied', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start-sectioned')
            .send({ profile: 'foundation', userPrompt: 'why?' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/sections\[\] \(or an explicit schedule\) is required/);
    });

    test('400 when explicit profile cannot be resolved to a foundation profile', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start-sectioned')
            .send({ profile: 'no-such', userPrompt: 'why?', sections: ['HEADLINE'] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/No foundation-model profile/);
    });

    test('400 when explicit schedule is malformed (duplicate section id)', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start-sectioned')
            .send({
                profile: 'foundation',
                userPrompt: 'why?',
                sections: ['HEADLINE'],
                schedule: [
                    { sections: ['HEADLINE'], spreadMs: 0 },
                    { sections: ['HEADLINE'], spreadMs: 0 },
                ],
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid schedule/);
        expect(Array.isArray(res.body.problems)).toBe(true);
        expect(res.body.problems.join(' ')).toMatch(/duplicate section id/);
    });

    test('400 when explicit schedule has spreadMs over SPREAD_MAX_MS', async () => {
        const res = await request(app)
            .post('/assistant/conversations/start-sectioned')
            .send({
                profile: 'foundation',
                userPrompt: 'why?',
                sections: ['HEADLINE'],
                schedule: [{ sections: ['HEADLINE'], spreadMs: 9_999_999 }],
            });
        expect(res.status).toBe(400);
        expect(res.body.problems.join(' ')).toMatch(/exceeds max/);
    });
});

describe('POST /assistant/conversations/start-sectioned — SSE happy path', () => {
    beforeEach(() => callFoundationModel.mockReset());

    test('sends text/event-stream headers and emits all section events + all-completed', async () => {
        callFoundationModel.mockImplementation(async (_dbreq, _profile, opts) => {
            // Match section id back from the user message we built in the route
            const userMsg = opts.messages.find(m => m.role === 'user').content;
            const sectionId = /^Section:\s*([A-Z_]+)/.exec(userMsg)?.[1] || 'UNKNOWN';
            return {
                content: `body-for-${sectionId}`,
                parsedJson: null,
                usage: { input_tokens: 10, output_tokens: 5 },
            };
        });

        const res = await postSse('/assistant/conversations/start-sectioned', {
            profile: 'foundation',
            userPrompt: 'why is OTIF down?',
            sections: ['HEADLINE', 'TRENDS'],
        });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        expect(res.headers['cache-control']).toMatch(/no-cache/);
        expect(res.headers['x-accel-buffering']).toBe('no');

        const frames = parseSseFrames(res.body || res.text);
        const events = frames.map(f => f.event);
        // 2 sections → 2 started + 2 completed + 1 all-completed = 5 frames.
        expect(events).toContain('section-started');
        expect(events).toContain('section-completed');
        expect(events[events.length - 1]).toBe('all-completed');

        const completed = frames.filter(f => f.event === 'section-completed');
        expect(completed.map(f => f.data.sectionId).sort()).toEqual(['HEADLINE', 'TRENDS']);
        // Body forwarded from FM client; usage block surfaces.
        const headline = completed.find(f => f.data.sectionId === 'HEADLINE');
        expect(headline.data.body).toBe('body-for-HEADLINE');
        expect(headline.data.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
        expect(typeof headline.data.durationMs).toBe('number');
    });

    test('forwards parsedJson as the section body when the FM returns structured output', async () => {
        callFoundationModel.mockResolvedValue({
            content: '{"actions":[]}',
            parsedJson: { actions: [{ id: 'a1', text: 'investigate region west' }] },
            usage: null,
        });
        const res = await postSse('/assistant/conversations/start-sectioned', {
            profile: 'foundation',
            userPrompt: 'recommend actions',
            sections: ['RECOMMENDED_ACTIONS'],
        });
        const frames = parseSseFrames(res.body || res.text);
        const completed = frames.find(f => f.event === 'section-completed');
        expect(completed.data.body).toEqual({ actions: [{ id: 'a1', text: 'investigate region west' }] });
    });

    test('section-started events for stage N do not appear before every stage N-1 section-completed event', async () => {
        callFoundationModel.mockImplementation(async (_d, _p, opts) => {
            const userMsg = opts.messages.find(m => m.role === 'user').content;
            const sectionId = /^Section:\s*([A-Z_]+)/.exec(userMsg)?.[1] || 'UNKNOWN';
            return { content: `body-${sectionId}`, parsedJson: null };
        });

        const res = await postSse('/assistant/conversations/start-sectioned', {
            profile: 'foundation',
            userPrompt: 'q',
            // Forces the 1-then-2-each default schedule:
            sections: ['HEADLINE', 'KPI', 'TRENDS', 'RISKS'],
        });

        const frames = parseSseFrames(res.body || res.text);
        const eventSeq = frames.map(f => `${f.event}:${f.data?.sectionId || ''}`);
        const headlineCompleted = eventSeq.indexOf('section-completed:HEADLINE');
        const kpiCompleted = eventSeq.indexOf('section-completed:KPI');
        const trendsStarted = eventSeq.indexOf('section-started:TRENDS');
        expect(trendsStarted).toBeGreaterThan(headlineCompleted);
        expect(trendsStarted).toBeGreaterThan(kpiCompleted);
    });

    test('an explicit schedule is honoured verbatim (callers can pin custom stages)', async () => {
        callFoundationModel.mockResolvedValue({ content: 'ok', parsedJson: null });
        const res = await postSse('/assistant/conversations/start-sectioned', {
            profile: 'foundation',
            userPrompt: 'q',
            sections: ['A', 'B', 'C'],
            schedule: [
                { sections: ['B'], spreadMs: 0 },
                { sections: ['A', 'C'], spreadMs: 0 },
            ],
        });
        const frames = parseSseFrames(res.body || res.text);
        const startOrder = frames
            .filter(f => f.event === 'section-started')
            .map(f => f.data.sectionId);
        expect(startOrder[0]).toBe('B');
        expect(startOrder.slice(1).sort()).toEqual(['A', 'C']);
    });
});

describe('POST /assistant/conversations/start-sectioned — error isolation', () => {
    beforeEach(() => callFoundationModel.mockReset());

    test('one section throwing emits section-failed, peer + later sections still complete', async () => {
        callFoundationModel.mockImplementation(async (_d, _p, opts) => {
            const userMsg = opts.messages.find(m => m.role === 'user').content;
            const sectionId = /^Section:\s*([A-Z_]+)/.exec(userMsg)?.[1] || 'UNKNOWN';
            if (sectionId === 'KPI') throw new Error('rate limited');
            return { content: `ok-${sectionId}`, parsedJson: null };
        });

        const res = await postSse('/assistant/conversations/start-sectioned', {
            profile: 'foundation',
            userPrompt: 'q',
            sections: ['HEADLINE', 'KPI', 'TRENDS'],
        });

        const frames = parseSseFrames(res.body || res.text);
        const failed = frames.find(f => f.event === 'section-failed');
        expect(failed.data.sectionId).toBe('KPI');
        expect(failed.data.error.message).toMatch(/rate limited/);

        const completed = frames.filter(f => f.event === 'section-completed').map(f => f.data.sectionId).sort();
        expect(completed).toEqual(['HEADLINE', 'TRENDS']);

        const all = frames.find(f => f.event === 'all-completed');
        expect(all.data.totals.sections).toBe(2);
    });
});

describe('POST /assistant/conversations/start-sectioned — selective re-run', () => {
    beforeEach(() => callFoundationModel.mockReset());

    test('regenerateOnly fires ONLY the named section and reuses probeCache + headlineCache (no FM call for skipped sections)', async () => {
        callFoundationModel.mockImplementation(async (_d, _p, opts) => {
            const userMsg = opts.messages.find(m => m.role === 'user').content;
            const sectionId = /^Section:\s*([A-Z_]+)/.exec(userMsg)?.[1] || 'UNKNOWN';
            return { content: `regen-${sectionId}`, parsedJson: null };
        });

        const res = await postSse('/assistant/conversations/start-sectioned', {
            profile: 'foundation',
            userPrompt: 'q',
            sections: ['HEADLINE', 'KPI', 'TRENDS', 'RISKS'],
            regenerateOnly: ['RISKS'],
            probeCache: { rows: [{ x: 1 }] },
            headlineCache: 'cached-headline-body',
        });

        expect(callFoundationModel).toHaveBeenCalledTimes(1);
        const frames = parseSseFrames(res.body || res.text);
        const completed = frames.filter(f => f.event === 'section-completed');
        expect(completed.length).toBe(1);
        expect(completed[0].data.sectionId).toBe('RISKS');
        expect(completed[0].data.body).toBe('regen-RISKS');
        const all = frames.find(f => f.event === 'all-completed');
        expect(all.data.totals.sections).toBe(1);
    });
});
