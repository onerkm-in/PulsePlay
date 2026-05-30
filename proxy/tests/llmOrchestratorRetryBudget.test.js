/**
 * llmOrchestratorRetryBudget.test.js — Cycle 17 (2026-05-20).
 *
 * Proves that orchestrateGroundedAnswer's server-side narrative validator
 * honors the per-request `clientMaxRetries` override symmetrically with the
 * Genie poll path (proxy/server.js#maybeValidateGeniePollResponse).
 *
 * The clamping/resolution math itself is covered in
 * validationRetryBudget.test.js. This file proves end-to-end that the
 * override flips behavior — presence of `validationDiagnostics` on the
 * response signals the validator branch ran, which only happens when
 * `orchestratorRetryBudget > 0`.
 */

'use strict';

// Mock sqlExecutor so executeSqlStatement returns a static result and we
// never actually contact Databricks.
jest.mock('../lib/sqlExecutor', () => ({
    executeSqlStatement: jest.fn().mockResolvedValue({
        columns: ['n'],
        rows: [[1]],
        truncated: false,
        rowsReturned: 1,
        totalRowCount: 1,
        statementId: 'stmt-1',
        executionTimeMs: 5,
    }),
    isSelectOnly: jest.fn().mockReturnValue(true),
}));

const { orchestrateGroundedAnswer } = require('../lib/llmOrchestrator');

const baseArgs = {
    profile: { warehouseId: 'w1' },
    question: 'How many orders?',
    schemaContext: 'TABLE orders(id INT)',
    convId: 'c1',
    msgId: 'm1',
    databricksRequest: jest.fn(),
};

// callLlm stub: first call returns SQL inside a fence, second call returns
// a markdown-formatted multi-section narrative that the validator will
// reject (TRENDS body has 0 numeric tokens). The retry pass returns the
// same body so retriedNoImprovement is set — what we care about is just
// whether the validator runs at all, signalled by `validationDiagnostics`.
function makeCallLlm() {
    let n = 0;
    return jest.fn().mockImplementation(() => {
        n += 1;
        if (n === 1) return Promise.resolve('```sql\nSELECT COUNT(*) AS n FROM orders\n```');
        return Promise.resolve('## HEADLINE\nThere are 1 orders.\n\n## TRENDS\nFlat.');
    });
}

describe('orchestrateGroundedAnswer — clientMaxRetries symmetry (cycle 17)', () => {
    const ORIGINAL_ENV = process.env.ORCHESTRATOR_VALIDATE_RETRIES;

    afterEach(() => {
        if (ORIGINAL_ENV === undefined) delete process.env.ORCHESTRATOR_VALIDATE_RETRIES;
        else process.env.ORCHESTRATOR_VALIDATE_RETRIES = ORIGINAL_ENV;
    });

    test('clientMaxRetries > 0 enables validation when env baseline is 0', async () => {
        // Without the wiring the Settings lever silently no-ops: env=0
        // means the validator never ran. With the wiring, client=2 wins
        // and validationDiagnostics is emitted.
        delete process.env.ORCHESTRATOR_VALIDATE_RETRIES;
        const out = await orchestrateGroundedAnswer({
            ...baseArgs,
            callLlm: makeCallLlm(),
            clientMaxRetries: 2,
        });
        expect(out.validationDiagnostics).toBeDefined();
        expect(out.validationDiagnostics.attempts).toBeGreaterThanOrEqual(1);
    });

    test('clientMaxRetries = 0 DISABLES validation even when env baseline is high', async () => {
        // Inverse: env says "validate up to 2" but the lever override
        // says "skip" — the override wins.
        process.env.ORCHESTRATOR_VALIDATE_RETRIES = '2';
        const out = await orchestrateGroundedAnswer({
            ...baseArgs,
            callLlm: makeCallLlm(),
            clientMaxRetries: 0,
        });
        expect(out.validationDiagnostics).toBeUndefined();
    });

    test('clientMaxRetries undefined falls back to env baseline (preserves legacy)', async () => {
        // Existing deployers who DO NOT set the Settings lever still get
        // ORCHESTRATOR_VALIDATE_RETRIES behavior — back-compat is intact.
        process.env.ORCHESTRATOR_VALIDATE_RETRIES = '1';
        const out = await orchestrateGroundedAnswer({
            ...baseArgs,
            callLlm: makeCallLlm(),
            // clientMaxRetries intentionally omitted
        });
        expect(out.validationDiagnostics).toBeDefined();
    });

    test('clientMaxRetries null treated as "no override" (Genie-path symmetry)', async () => {
        // The Genie poll path passes `null` when neither query nor body
        // supplies a value (proxy/server.js#parseClientMaxRetries returns
        // null). The orchestrator must treat null identically to "no
        // override" — env baseline drives.
        process.env.ORCHESTRATOR_VALIDATE_RETRIES = '0';
        const out = await orchestrateGroundedAnswer({
            ...baseArgs,
            callLlm: makeCallLlm(),
            clientMaxRetries: null,
        });
        expect(out.validationDiagnostics).toBeUndefined();
    });
});
