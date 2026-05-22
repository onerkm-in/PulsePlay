'use strict';

/**
 * supervisorUsageAggregation.test.js
 *
 * Coverage for the Supervisor sub-call usage aggregation (closes the [RISK]
 * note from the 2026-05-13 proxy usage-passthrough commit).
 *
 * The supervisor fans queries across N helper spaces, then synthesizes a
 * unified answer via a Foundation Model serving endpoint. Today only the
 * synthesis-LLM call surfaces real `usage` tokens (Genie has no upstream
 * exposure). The aggregation logic supports summing helper usage too — for
 * future helpers backed by Foundation Model / OpenAI / Bedrock.
 *
 * These tests exercise the pure aggregation helper (no network) so the
 * contract stays under regression without needing a live Genie / FM cell.
 */

const { _aggregateUsageBlocks } = require('../server');

describe('_aggregateUsageBlocks helper', () => {
    test('returns null for an empty array', () => {
        expect(_aggregateUsageBlocks([])).toBeNull();
    });

    test('returns null for non-array input', () => {
        expect(_aggregateUsageBlocks(null)).toBeNull();
        expect(_aggregateUsageBlocks(undefined)).toBeNull();
        expect(_aggregateUsageBlocks('oops')).toBeNull();
    });

    test('returns null when every entry is null/undefined', () => {
        expect(_aggregateUsageBlocks([null, undefined, null])).toBeNull();
    });

    test('sums a single OpenAI-shape block (synthesis-only case)', () => {
        const out = _aggregateUsageBlocks([
            { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 },
        ]);
        expect(out).toEqual({
            prompt_tokens: 1200,
            completion_tokens: 400,
            total_tokens: 1600,
        });
    });

    test('sums multiple OpenAI-shape blocks (synthesis + 2 helper calls)', () => {
        const out = _aggregateUsageBlocks([
            { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 }, // synthesis
            { prompt_tokens: 800,  completion_tokens: 200, total_tokens: 1000 }, // helper-1
            { prompt_tokens: 600,  completion_tokens: 150, total_tokens: 750  }, // helper-2
        ]);
        expect(out).toEqual({
            prompt_tokens: 2600,
            completion_tokens: 750,
            total_tokens: 3350,
        });
    });

    test('skips null/undefined entries while summing the rest (mixed-backend case)', () => {
        // Genie helpers don't expose usage (null), but synthesis + a future
        // Foundation Model helper would.
        const out = _aggregateUsageBlocks([
            { prompt_tokens: 1000, completion_tokens: 300, total_tokens: 1300 }, // synthesis
            null,                                                                  // Genie helper-1
            null,                                                                  // Genie helper-2
            { prompt_tokens: 500,  completion_tokens: 150, total_tokens: 650  }, // FM helper-3
        ]);
        expect(out).toEqual({
            prompt_tokens: 1500,
            completion_tokens: 450,
            total_tokens: 1950,
        });
    });

    test('accepts Anthropic-shape blocks (input_tokens/output_tokens) and normalises', () => {
        const out = _aggregateUsageBlocks([
            { input_tokens: 800, output_tokens: 250 },
            { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
        ]);
        expect(out.prompt_tokens).toBe(1000);
        expect(out.completion_tokens).toBe(300);
        // Total derives from sum of derived totals (1050 + 250).
        expect(out.total_tokens).toBe(1300);
    });

    test('computes total when total_tokens is absent on an input', () => {
        const out = _aggregateUsageBlocks([
            { prompt_tokens: 500, completion_tokens: 100 }, // no total
            { prompt_tokens: 300, completion_tokens: 50, total_tokens: 350 },
        ]);
        expect(out.total_tokens).toBe((500 + 100) + 350);
    });

    test('treats negative or NaN values as zero (defensive)', () => {
        const out = _aggregateUsageBlocks([
            { prompt_tokens: -5, completion_tokens: NaN, total_tokens: 'bad' },
            { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 },
        ]);
        expect(out).toEqual({
            prompt_tokens: 100,
            completion_tokens: 25,
            total_tokens: 125,
        });
    });

    test('floors fractional inputs (token counts are integers)', () => {
        const out = _aggregateUsageBlocks([
            { prompt_tokens: 100.7, completion_tokens: 50.3, total_tokens: 151.0 },
        ]);
        expect(out.prompt_tokens).toBe(100);
        expect(out.completion_tokens).toBe(50);
        expect(out.total_tokens).toBe(151);
    });
});

describe('_aggregateUsageBlocks — supervisor scenario shapes', () => {
    test('Genie-only fan-out + Foundation Model synthesis (today\'s common shape)', () => {
        // Today: 4 Genie helpers (each null usage) + 1 synthesis call.
        const blocks = [
            { prompt_tokens: 2400, completion_tokens: 800, total_tokens: 3200 }, // synthesis
            null, null, null, null,                                                 // 4 Genie helpers
        ];
        const out = _aggregateUsageBlocks(blocks);
        expect(out).toEqual({
            prompt_tokens: 2400,
            completion_tokens: 800,
            total_tokens: 3200,
        });
    });

    test('all helpers and synthesis are unmetered → null', () => {
        // Edge case: synthesis fallback path (FM endpoint unavailable) + Genie helpers.
        // No usage exposed anywhere. The supervisor response omits the field entirely.
        const blocks = [null, null, null, null, null];
        expect(_aggregateUsageBlocks(blocks)).toBeNull();
    });
});
