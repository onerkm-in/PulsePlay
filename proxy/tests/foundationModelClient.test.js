/**
 * foundationModelClient.test.js — Cycle 47.6 + 47.7
 *
 * Covers the OpenAI-compatible body builder, response parsing, the
 * structured-output JSON path (including markdown-fence-wrapped JSON
 * recovery), the section markdown renderers, and the call orchestration
 * via an injected mock databricksRequest.
 */

const {
    callFoundationModel,
    RESPONSE_SCHEMAS,
    SECTION_RENDERERS,
    __test_internals: {
        buildFoundationModelBody,
        extractAssistantContent,
        tryParseJson,
        renderActionsMarkdown,
        renderRisksMarkdown,
        renderOpportunitiesMarkdown,
    },
} = require('../lib/foundationModelClient');

describe('buildFoundationModelBody', () => {
    test('builds the OpenAI chat body with defaults', () => {
        const body = buildFoundationModelBody({
            messages: [{ role: 'user', content: 'hi' }],
        });
        expect(body).toEqual({
            messages: [{ role: 'user', content: 'hi' }],
            temperature: 0.2,
            max_tokens: 2048,
        });
    });

    test('passes through responseFormat for structured output', () => {
        const body = buildFoundationModelBody({
            messages: [{ role: 'user', content: 'hi' }],
            responseFormat: RESPONSE_SCHEMAS.recommendedActions,
        });
        expect(body.response_format).toBe(RESPONSE_SCHEMAS.recommendedActions);
    });

    test('merges extra fields like top_p and stop', () => {
        const body = buildFoundationModelBody({
            messages: [{ role: 'user', content: 'hi' }],
            extra: { top_p: 0.95, stop: ['\n\n'] },
        });
        expect(body.top_p).toBe(0.95);
        expect(body.stop).toEqual(['\n\n']);
    });

    test('rejects empty / non-array messages', () => {
        expect(() => buildFoundationModelBody({ messages: [] })).toThrow(/messages\[\] is required/);
        expect(() => buildFoundationModelBody({})).toThrow(/messages\[\] is required/);
    });

    test('rejects malformed messages', () => {
        expect(() => buildFoundationModelBody({
            messages: [{ role: 'user' /* missing content */ }],
        })).toThrow(/string role \+ content/);
    });
});

describe('extractAssistantContent', () => {
    test('reads choices[0].message.content from an OpenAI response', () => {
        const raw = {
            choices: [{ message: { role: 'assistant', content: 'hello world' } }],
        };
        expect(extractAssistantContent(raw)).toBe('hello world');
    });

    test('returns empty string on missing/malformed shape', () => {
        expect(extractAssistantContent(null)).toBe('');
        expect(extractAssistantContent({})).toBe('');
        expect(extractAssistantContent({ choices: [] })).toBe('');
        expect(extractAssistantContent({ choices: [{}] })).toBe('');
    });
});

describe('tryParseJson', () => {
    test('parses raw JSON', () => {
        expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    });

    test('peels off markdown ``` fences and parses inner JSON', () => {
        expect(tryParseJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
        expect(tryParseJson('```\n{"a":3}\n```')).toEqual({ a: 3 });
    });

    test('returns null on un-parseable content', () => {
        expect(tryParseJson('not json')).toBeNull();
        expect(tryParseJson('')).toBeNull();
        expect(tryParseJson(null)).toBeNull();
    });
});

describe('section markdown renderers', () => {
    test('renderActionsMarkdown — formats a 3-action object', () => {
        const out = renderActionsMarkdown({
            actions: [
                { verb: 'Reallocate', target: 'budget from Furniture (2.49% margin) to Technology (17.40%)', expected_impact: 'lift portfolio margin by 1pp' },
                { verb: 'Audit', target: 'Furniture pricing in Central', expected_impact: 'recover 2pp by Q4' },
                { verb: 'Pilot', target: 'Consumer-segment retention in West (1,611 orders)', expected_impact: 'defend the leading order base' },
            ],
        });
        expect(out).toMatch(/^## RECOMMENDED ACTIONS\n1\. Reallocate /);
        expect(out.split('\n').length).toBe(4);
    });

    test('renderRisksMarkdown — formats with magnitude in parens', () => {
        const out = renderRisksMarkdown({
            risks: [
                { title: 'Margin compression', magnitude: '14.9pp gap', evidence: 'Furniture 2.49% vs Technology 17.40%' },
            ],
        });
        expect(out).toContain('## RISKS');
        expect(out).toContain('**Margin compression** (14.9pp gap)');
    });

    test('renderOpportunitiesMarkdown — includes why_now line', () => {
        const out = renderOpportunitiesMarkdown({
            opportunities: [
                { title: 'Technology upsell', evidence: '17.40% margin vs 2.49% Furniture', why_now: 'budget cycle in Q4' },
            ],
        });
        expect(out).toContain('## OPPORTUNITIES');
        expect(out).toContain('_Why now:_ budget cycle in Q4');
    });

    test('renderers tolerate empty / null parsed input', () => {
        expect(renderActionsMarkdown(null)).toBe('');
        expect(renderRisksMarkdown({})).toBe('');
        expect(renderOpportunitiesMarkdown({ opportunities: [] })).toBe('## OPPORTUNITIES');
    });

    test('SECTION_RENDERERS dispatch by uppercase title', () => {
        expect(SECTION_RENDERERS['RECOMMENDED ACTIONS']).toBe(renderActionsMarkdown);
        expect(SECTION_RENDERERS.RISKS).toBe(renderRisksMarkdown);
        expect(SECTION_RENDERERS.OPPORTUNITIES).toBe(renderOpportunitiesMarkdown);
    });
});

describe('callFoundationModel', () => {
    const profile = {
        host: 'https://dbc-test.cloud.databricks.com',
        foundationModelEndpoint: 'databricks-meta-llama-3-1-405b-instruct',
        token: 'dapi_test',
    };

    test('happy path — POSTs to /serving-endpoints/{endpoint}/invocations and returns content', async () => {
        const mockReq = jest.fn().mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: 'all good' } }],
        });
        const r = await callFoundationModel(mockReq, profile, {
            messages: [{ role: 'user', content: 'hi' }],
            requestId: 'rid-1',
        });
        expect(r.content).toBe('all good');
        expect(mockReq).toHaveBeenCalledTimes(1);
        const [calledProfile, method, urlPath, body, requestId] = mockReq.mock.calls[0];
        expect(calledProfile).toBe(profile);
        expect(method).toBe('POST');
        expect(urlPath).toBe('/serving-endpoints/databricks-meta-llama-3-1-405b-instruct/invocations');
        expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
        expect(requestId).toBe('rid-1');
    });

    test('structured output — parsed JSON exposed when responseFormat present', async () => {
        const json = { actions: [{ verb: 'Reallocate', target: 'budget', expected_impact: 'lift 1pp' }] };
        const mockReq = jest.fn().mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: JSON.stringify(json) } }],
        });
        const r = await callFoundationModel(mockReq, profile, {
            messages: [{ role: 'user', content: 'recommend actions' }],
            responseFormat: RESPONSE_SCHEMAS.recommendedActions,
        });
        expect(r.parsedJson).toEqual(json);
    });

    test('structured output — recovers JSON wrapped in ``` fences', async () => {
        const json = { risks: [{ title: 'x', magnitude: '1pp', evidence: 'e' }] };
        const fenced = '```json\n' + JSON.stringify(json) + '\n```';
        const mockReq = jest.fn().mockResolvedValue({
            choices: [{ message: { content: fenced } }],
        });
        const r = await callFoundationModel(mockReq, profile, {
            messages: [{ role: 'user', content: 'risks please' }],
            responseFormat: RESPONSE_SCHEMAS.risks,
        });
        expect(r.parsedJson).toEqual(json);
    });

    test('rejects when foundationModelEndpoint is missing', async () => {
        const bad = { ...profile, foundationModelEndpoint: undefined };
        await expect(callFoundationModel(() => {}, bad, {
            messages: [{ role: 'user', content: 'hi' }],
        })).rejects.toThrow(/foundationModelEndpoint required/);
    });

    test('wraps databricksRequest errors in a Foundation-model-tagged Error', async () => {
        const mockReq = jest.fn().mockRejectedValue(new Error('Databricks 503: backend overloaded'));
        await expect(callFoundationModel(mockReq, profile, {
            messages: [{ role: 'user', content: 'hi' }],
        })).rejects.toThrow(/Foundation model invocation failed/);
    });

    test('rejects when databricksRequest function not supplied', async () => {
        await expect(callFoundationModel(null, profile, {
            messages: [{ role: 'user', content: 'hi' }],
        })).rejects.toThrow(/databricksRequest function not supplied/);
    });
});

describe('RESPONSE_SCHEMAS shape', () => {
    test('recommendedActions schema declares strict 3-item structure', () => {
        const s = RESPONSE_SCHEMAS.recommendedActions.json_schema.schema;
        expect(s.required).toEqual(['actions']);
        expect(s.properties.actions.minItems).toBe(3);
        expect(s.properties.actions.maxItems).toBe(3);
        const itemReq = s.properties.actions.items.required;
        expect(itemReq).toEqual(expect.arrayContaining(['verb', 'target', 'expected_impact']));
    });

    test('risks schema requires title + magnitude + evidence', () => {
        const itemReq = RESPONSE_SCHEMAS.risks.json_schema.schema.properties.risks.items.required;
        expect(itemReq).toEqual(expect.arrayContaining(['title', 'magnitude', 'evidence']));
    });

    test('opportunities schema requires title + evidence + why_now', () => {
        const itemReq = RESPONSE_SCHEMAS.opportunities.json_schema.schema.properties.opportunities.items.required;
        expect(itemReq).toEqual(expect.arrayContaining(['title', 'evidence', 'why_now']));
    });
});
