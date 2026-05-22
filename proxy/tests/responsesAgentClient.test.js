/**
 * responsesAgentClient.test.js
 *
 * Covers the body builder, OpenAI-Responses-API output flattening, custom-
 * outputs extraction, usage extraction, and call orchestration via an
 * injected mock databricksRequest. Same pattern as
 * foundationModelClient.test.js — keep the transforms pure + unit-tested
 * separately from the HTTP path.
 */

const {
    callResponsesAgent,
    buildResponsesAgentBody,
    extractResponsesAgentText,
    extractCustomOutputs,
    extractUsage,
} = require('../lib/responsesAgentClient');

describe('buildResponsesAgentBody', () => {
    test('builds the Responses-API body from input[] with defaults', () => {
        const body = buildResponsesAgentBody({
            input: [{ role: 'user', content: 'hi' }],
        });
        expect(body).toEqual({
            input: [{ role: 'user', content: 'hi' }],
            temperature: 0.2,
            max_output_tokens: 2048,
        });
    });

    test('accepts messages[] alias and maps to input[] (Chat-Completions back-compat)', () => {
        const body = buildResponsesAgentBody({
            messages: [{ role: 'user', content: 'hi' }],
        });
        expect(body.input).toEqual([{ role: 'user', content: 'hi' }]);
    });

    test('input[] wins when both input and messages provided', () => {
        const body = buildResponsesAgentBody({
            input: [{ role: 'user', content: 'from-input' }],
            messages: [{ role: 'user', content: 'from-messages' }],
        });
        expect(body.input[0].content).toBe('from-input');
    });

    test('threads instructions as top-level field, not as a system message', () => {
        const body = buildResponsesAgentBody({
            input: [{ role: 'user', content: 'hi' }],
            instructions: 'be concise',
        });
        expect(body.instructions).toBe('be concise');
        // No role:"system" entry should have been injected.
        expect(body.input.find(m => m.role === 'system')).toBeUndefined();
    });

    test('trims whitespace-only instructions out', () => {
        const body = buildResponsesAgentBody({
            input: [{ role: 'user', content: 'hi' }],
            instructions: '   \n  ',
        });
        expect(body.instructions).toBeUndefined();
    });

    test('threads customInputs through as custom_inputs (snake_case for API)', () => {
        const body = buildResponsesAgentBody({
            input: [{ role: 'user', content: 'hi' }],
            customInputs: { vendor: 'powerbi', filters: { region: ['EU'] } },
        });
        expect(body.custom_inputs).toEqual({ vendor: 'powerbi', filters: { region: ['EU'] } });
    });

    test('merges extra fields like top_p and stop', () => {
        const body = buildResponsesAgentBody({
            input: [{ role: 'user', content: 'hi' }],
            extra: { top_p: 0.95, stop: ['\n\n'] },
        });
        expect(body.top_p).toBe(0.95);
        expect(body.stop).toEqual(['\n\n']);
    });

    test('rejects empty / missing input + messages', () => {
        expect(() => buildResponsesAgentBody({})).toThrow(/input\[\] \(or messages\[\]\) is required/);
        expect(() => buildResponsesAgentBody({ input: [] })).toThrow(/input\[\] \(or messages\[\]\) is required/);
    });

    test('rejects malformed entries (missing role or content)', () => {
        expect(() => buildResponsesAgentBody({
            input: [{ role: 'user' /* no content */ }],
        })).toThrow(/role \+ content/);
        expect(() => buildResponsesAgentBody({
            input: [{ content: 'hi' /* no role */ }],
        })).toThrow(/role \+ content/);
    });
});

describe('extractResponsesAgentText', () => {
    test('flattens output[*].content[*].text in order', () => {
        const raw = {
            output: [
                { role: 'assistant', content: [
                    { type: 'output_text', text: 'first' },
                    { type: 'output_text', text: 'second' },
                ]},
            ],
        };
        expect(extractResponsesAgentText(raw)).toBe('first\nsecond');
    });

    test('tolerates content parts that elide the type discriminator', () => {
        const raw = {
            output: [
                { content: [{ text: 'bare-text' }] },
            ],
        };
        expect(extractResponsesAgentText(raw)).toBe('bare-text');
    });

    test('handles multiple output items and dotted-text fallback', () => {
        const raw = {
            output: [
                { content: [{ output_text: 'alt-field' }] },
                { content: [{ text: 'normal-field' }] },
            ],
        };
        expect(extractResponsesAgentText(raw)).toBe('alt-field\nnormal-field');
    });

    test('returns empty string for empty / malformed response', () => {
        expect(extractResponsesAgentText(null)).toBe('');
        expect(extractResponsesAgentText({})).toBe('');
        expect(extractResponsesAgentText({ output: [] })).toBe('');
        expect(extractResponsesAgentText({ output: [{}] })).toBe('');
    });

    test('skips non-text content parts (image / tool_use) without crashing', () => {
        const raw = {
            output: [
                { content: [
                    { type: 'image', url: 'https://x/y.png' },
                    { type: 'output_text', text: 'after image' },
                ]},
            ],
        };
        expect(extractResponsesAgentText(raw)).toBe('after image');
    });
});

describe('extractCustomOutputs', () => {
    test('returns snake_case custom_outputs verbatim', () => {
        expect(extractCustomOutputs({ custom_outputs: { citations: ['x'] } }))
            .toEqual({ citations: ['x'] });
    });

    test('accepts camelCase customOutputs (defensive)', () => {
        expect(extractCustomOutputs({ customOutputs: { tools: 2 } }))
            .toEqual({ tools: 2 });
    });

    test('returns null when absent', () => {
        expect(extractCustomOutputs({})).toBeNull();
        expect(extractCustomOutputs(null)).toBeNull();
    });
});

describe('extractUsage', () => {
    test('accepts input_tokens / output_tokens (Responses-API native)', () => {
        expect(extractUsage({ usage: { input_tokens: 10, output_tokens: 20 } }))
            .toEqual({ input_tokens: 10, output_tokens: 20 });
    });

    test('accepts prompt_tokens / completion_tokens (Chat-Completions legacy)', () => {
        expect(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 20 } }))
            .toEqual({ prompt_tokens: 10, completion_tokens: 20 });
    });

    test('returns null when usage absent or empty', () => {
        expect(extractUsage({})).toBeNull();
        expect(extractUsage({ usage: {} })).toBeNull();
    });

    test('ignores non-numeric values defensively', () => {
        expect(extractUsage({ usage: { input_tokens: 'twenty', total_tokens: 30 } }))
            .toEqual({ total_tokens: 30 });
    });
});

describe('callResponsesAgent — orchestration', () => {
    test('POSTs to /serving-endpoints/<name>/invocations with the built body', async () => {
        const calls = [];
        const mockReq = async (profile, method, path, body) => {
            calls.push({ profile, method, path, body });
            return { output: [{ content: [{ type: 'output_text', text: 'pong' }] }] };
        };
        const result = await callResponsesAgent(mockReq, {
            host: 'https://x.example',
            token: 'pat',
            responsesAgentEndpoint: 'knowledge-assistant-prod',
        }, {
            input: [{ role: 'user', content: 'ping' }],
            instructions: 'reply with pong',
            customInputs: { lang: 'en' },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe('POST');
        expect(calls[0].path).toBe('/serving-endpoints/knowledge-assistant-prod/invocations');
        expect(calls[0].body.input).toEqual([{ role: 'user', content: 'ping' }]);
        expect(calls[0].body.instructions).toBe('reply with pong');
        expect(calls[0].body.custom_inputs).toEqual({ lang: 'en' });
        expect(result.content).toBe('pong');
    });

    test('threads customOutputs + usage into the result when present', async () => {
        const mockReq = async () => ({
            output: [{ content: [{ text: 'ok' }] }],
            custom_outputs: { citations: ['a', 'b'] },
            usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 },
        });
        const result = await callResponsesAgent(mockReq, {
            host: 'https://x.example',
            responsesAgentEndpoint: 'agent-prod',
        }, {
            input: [{ role: 'user', content: 'hi' }],
        });
        expect(result.customOutputs).toEqual({ citations: ['a', 'b'] });
        expect(result.usage).toEqual({ input_tokens: 5, output_tokens: 10, total_tokens: 15 });
    });

    test('rejects when profile.responsesAgentEndpoint missing', async () => {
        const mockReq = async () => ({});
        await expect(callResponsesAgent(mockReq, { host: 'https://x.example' }, {
            input: [{ role: 'user', content: 'hi' }],
        })).rejects.toThrow(/responsesAgentEndpoint required/);
    });

    test('wraps upstream errors with endpoint name for clarity', async () => {
        const mockReq = async () => { throw new Error('429 rate limited'); };
        await expect(callResponsesAgent(mockReq, {
            host: 'https://x.example',
            responsesAgentEndpoint: 'agent-prod',
        }, {
            input: [{ role: 'user', content: 'hi' }],
        })).rejects.toThrow(/ResponsesAgent invocation failed \(agent-prod\): 429 rate limited/);
    });
});
