'use strict';

/**
 * usagePassthrough.test.js — token usage plumbing.
 *
 * Verifies the proxy forwards backend `usage` blocks through to the
 * conversation response so the playground SustainabilityIndicator can
 * stop estimating from text length when real data is available.
 *
 * Covers:
 *   • foundationModelClient.extractUsage — normalises raw response shape
 *   • bedrock._extractBedrockUsage — handles both Anthropic + Llama shapes
 *   • llmOrchestrator._accumulateUsage — sums across SQL + narrative calls
 *
 * Route-level end-to-end coverage lives in connectorProbe.test.js +
 * foundationRoute.test.js + llmOrchestrator.test.js; this file focuses on
 * the helper contracts.
 */

describe('foundationModelClient.extractUsage', () => {
    const { extractUsage } = require('../lib/foundationModelClient');

    test('returns the usage block when present (OpenAI shape)', () => {
        const out = extractUsage({
            choices: [{ message: { content: 'hi' } }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        });
        expect(out).toEqual({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
    });

    test('returns null when the response carries no usage block', () => {
        expect(extractUsage({ choices: [{ message: { content: 'hi' } }] })).toBeNull();
    });

    test('returns null when usage is non-object', () => {
        expect(extractUsage({ usage: null })).toBeNull();
        expect(extractUsage({ usage: 'oops' })).toBeNull();
        expect(extractUsage(null)).toBeNull();
    });

    test('drops negative / NaN / non-integer values defensively', () => {
        const out = extractUsage({
            usage: { prompt_tokens: -5, completion_tokens: NaN, total_tokens: 100.7 },
        });
        // -5 dropped, NaN dropped, 100.7 floored to 100.
        expect(out).toEqual({ total_tokens: 100 });
    });

    test('accepts Anthropic-shape input_tokens/output_tokens', () => {
        const out = extractUsage({
            usage: { input_tokens: 80, output_tokens: 30 },
        });
        expect(out).toEqual({ input_tokens: 80, output_tokens: 30 });
    });
});

describe('bedrock._extractBedrockUsage', () => {
    const { _extractBedrockUsage } = require('../lib/bedrock').__test_internals;

    test('normalises Anthropic-on-Bedrock { usage: { input_tokens, output_tokens } }', () => {
        const out = _extractBedrockUsage({
            content: [{ type: 'text', text: 'hi' }],
            usage: { input_tokens: 200, output_tokens: 100 },
        });
        expect(out).toEqual({
            input_tokens: 200,
            prompt_tokens: 200,
            output_tokens: 100,
            completion_tokens: 100,
            total_tokens: 300,
        });
    });

    test('normalises Llama-on-Bedrock { prompt_token_count, generation_token_count }', () => {
        const out = _extractBedrockUsage({
            generation: 'hi',
            prompt_token_count: 50,
            generation_token_count: 25,
        });
        expect(out).toEqual({
            prompt_tokens: 50,
            input_tokens: 50,
            completion_tokens: 25,
            output_tokens: 25,
            total_tokens: 75,
        });
    });

    test('returns null when no usage field is present', () => {
        expect(_extractBedrockUsage({ content: [] })).toBeNull();
        expect(_extractBedrockUsage({})).toBeNull();
        expect(_extractBedrockUsage(null)).toBeNull();
    });

    test('rejects negative values', () => {
        expect(_extractBedrockUsage({ usage: { input_tokens: -1, output_tokens: -2 } })).toBeNull();
        expect(_extractBedrockUsage({ prompt_token_count: -5 })).toBeNull();
    });

    test('handles partial Anthropic usage (only input)', () => {
        const out = _extractBedrockUsage({ usage: { input_tokens: 80 } });
        expect(out).toEqual({ input_tokens: 80, prompt_tokens: 80 });
        // No total_tokens computed when one side is missing.
        expect(out.total_tokens).toBeUndefined();
    });
});

describe('llmOrchestrator._accumulateUsage', () => {
    const { _accumulateUsage } = require('../lib/llmOrchestrator').__usage_internals;

    test('seeds from null accumulator', () => {
        const out = _accumulateUsage(null, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
        expect(out).toEqual({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
    });

    test('sums two OpenAI-shape usage blocks (SQL + narrative)', () => {
        let acc = _accumulateUsage(null, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
        acc = _accumulateUsage(acc, { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 });
        expect(acc).toEqual({ prompt_tokens: 300, completion_tokens: 130, total_tokens: 430 });
    });

    test('accepts Anthropic-shape inputs (input_tokens/output_tokens)', () => {
        const acc = _accumulateUsage(null, { input_tokens: 100, output_tokens: 50 });
        expect(acc.prompt_tokens).toBe(100);
        expect(acc.completion_tokens).toBe(50);
        expect(acc.total_tokens).toBe(150);
    });

    test('computes total when absent from next-block', () => {
        const acc = _accumulateUsage(null, { prompt_tokens: 100, completion_tokens: 50 });
        expect(acc.total_tokens).toBe(150);
    });

    test('drops invalid values and treats them as 0', () => {
        const acc = _accumulateUsage(null, { prompt_tokens: -1, completion_tokens: NaN, total_tokens: 'x' });
        expect(acc).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    });
});

describe('orchestrator end-to-end usage accumulation', () => {
    const llmOrchestrator = require('../lib/llmOrchestrator');

    // Lightweight stub for the orchestrator's required dependencies. The
    // SQL executor is stubbed via the orchestrator's exec injection — see
    // its tests for the canonical pattern.
    test('callLlm returning { content, usage } accumulates across SQL + narrative calls', async () => {
        const callsLogged = [];
        const callLlm = async (messages) => {
            // First call (SQL) — 100 tokens; second (narrative) — 80.
            const turn = callsLogged.length;
            callsLogged.push(messages);
            if (turn === 0) {
                return {
                    content: 'SELECT 1 AS x',
                    usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
                };
            }
            return {
                content: 'The answer narrative.',
                usage: { prompt_tokens: 60, completion_tokens: 20, total_tokens: 80 },
            };
        };
        const databricksRequest = async () => ({
            // Minimal SQL-statement response stub.
            statement_id: 'stmt-1',
            status: { state: 'SUCCEEDED' },
            result: {
                data_array: [['1']],
                schema: { columns: [{ name: 'x' }] },
                row_count: 1,
            },
            manifest: {
                schema: { columns: [{ name: 'x' }] },
                truncated: false,
                total_row_count: 1,
            },
        });

        const result = await llmOrchestrator.orchestrateGroundedAnswer({
            profile: { warehouseId: 'w', host: 'https://x' },
            question: 'Q?',
            schemaContext: 'TABLE t (x INT)',
            callLlm,
            databricksRequest,
            convId: 'c1',
            msgId: 'm1',
        });

        expect(result.status).toBe('COMPLETED');
        // Usage accumulated: 80+60 prompt, 20+20 completion, 100+80 total.
        expect(result.usage).toEqual({
            prompt_tokens: 140,
            completion_tokens: 40,
            total_tokens: 180,
        });
    });

    test('callLlm returning bare strings (legacy contract) → no usage on result', async () => {
        const callLlm = async () => 'SELECT 1';
        // Trip the early-exit path so we don't need a SQL-execute stub.
        const result = await llmOrchestrator.orchestrateGroundedAnswer({
            profile: { warehouseId: 'w' },
            question: 'Q?',
            schemaContext: 'TABLE t (x INT)',
            callLlm: async () => '',  // empty → orchestrator returns the "couldn't produce SQL" path.
            databricksRequest: async () => ({}),
            convId: 'c1',
            msgId: 'm1',
        });

        expect(result.status).toBe('COMPLETED');
        expect(result.usage).toBeUndefined();
    });
});
