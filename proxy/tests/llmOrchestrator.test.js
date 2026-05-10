/**
 * llmOrchestrator.test.js — IDEA-040 Phase 2.
 *
 * Covers withRetryOnBadSql + isSyntacticSqlError. The Phase 1 orchestrator
 * happy-path tests live in analytics.test.js — this file focuses purely on
 * the retry surface so a regression in the retry gate is easy to localise.
 */

'use strict';

const {
    withRetryOnBadSql,
    isSyntacticSqlError,
    __retry_internals,
} = require('../lib/llmOrchestrator');

describe('isSyntacticSqlError — gate logic', () => {
    test.each([
        ['UNRESOLVED_COLUMN: column foo not found'],
        ['TABLE_OR_VIEW_NOT_FOUND: sales'],
        ['org.apache.spark.sql.AnalysisException: cannot resolve column'],
        ['ParseException: missing FROM clause'],
        ['column foo cannot be resolved'],
        ['no such table: orders'],
        ['SYNTAX_ERROR near GROUP BY'],
        ['PARSE_SYNTAX_ERROR: unexpected token'],
    ])('flags syntactic error: %s', (msg) => {
        expect(isSyntacticSqlError(msg)).toBe(true);
    });

    test.each([
        ['UNAUTHORIZED: token expired'],
        ['PERMISSION_DENIED on schema sales'],
        ['Databricks 401: invalid bearer'],
        ['Databricks 403: not authorized'],
        ['Insufficient privileges to read table'],
        ['authentication failed'],
        // Mixed message — auth substring dominates and blocks retry.
        ['UNAUTHORIZED: also column not found'],
    ])('blocks auth/permission error: %s', (msg) => {
        expect(isSyntacticSqlError(msg)).toBe(false);
    });

    test('returns false for empty / non-string input', () => {
        expect(isSyntacticSqlError('')).toBe(false);
        expect(isSyntacticSqlError(null)).toBe(false);
        expect(isSyntacticSqlError(undefined)).toBe(false);
        expect(isSyntacticSqlError(42)).toBe(false);
        expect(isSyntacticSqlError({ a: 1 })).toBe(false);
    });

    test('exposes the gate regex constants for diagnostics', () => {
        expect(__retry_internals.SYNTACTIC_ERROR_PATTERNS.length).toBeGreaterThan(5);
        expect(__retry_internals.NON_RETRYABLE_PATTERNS.length).toBeGreaterThan(3);
    });
});

describe('withRetryOnBadSql — single retry semantics', () => {
    const baseArgs = {
        profile: { warehouseId: 'w1' },
        question: 'How many orders by region?',
        schemaContext: 'TABLE orders(region STRING)',
        callLlm: () => {},
        databricksRequest: () => {},
        convId: 'c1',
        msgId: 'm1',
    };

    test('does not retry on COMPLETED success', async () => {
        const handler = jest.fn().mockResolvedValue({
            status: 'COMPLETED', content: 'ok', sqlQuery: 'SELECT 1',
        });
        const out = await withRetryOnBadSql(handler, baseArgs);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(out.attempts).toBe(1);
        expect(out.retried).toBe(false);
        expect(out.result.status).toBe('COMPLETED');
    });

    test('retries once on syntactic FAILED and returns the second result', async () => {
        const handler = jest.fn()
            .mockResolvedValueOnce({
                status: 'FAILED', content: 'SQL execution failed', sqlQuery: 'SELECT bogus FROM t',
                error: 'UNRESOLVED_COLUMN: bogus',
            })
            .mockResolvedValueOnce({
                status: 'COMPLETED', content: 'fixed', sqlQuery: 'SELECT good FROM t',
            });
        const out = await withRetryOnBadSql(handler, baseArgs);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(out.retried).toBe(true);
        expect(out.attempts).toBe(2);
        expect(out.result.status).toBe('COMPLETED');
        // The retry must augment the question with the prior failure.
        const secondCallArgs = handler.mock.calls[1][0];
        expect(secondCallArgs.question).toContain('previous attempt failed');
        expect(secondCallArgs.question).toContain('UNRESOLVED_COLUMN');
        expect(secondCallArgs.question).toContain('SELECT bogus FROM t');
        // Other args should be passed through verbatim.
        expect(secondCallArgs.profile).toBe(baseArgs.profile);
        expect(secondCallArgs.convId).toBe('c1');
    });

    test('does NOT retry on auth/permission FAILED', async () => {
        const handler = jest.fn().mockResolvedValueOnce({
            status: 'FAILED', content: 'Permission denied', sqlQuery: 'SELECT x FROM secret',
            error: 'PERMISSION_DENIED: cannot read schema',
        });
        const out = await withRetryOnBadSql(handler, baseArgs);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(out.retried).toBe(false);
        expect(out.attempts).toBe(1);
        expect(out.result.status).toBe('FAILED');
    });

    test('only retries ONCE — second failure is returned as-is', async () => {
        const handler = jest.fn()
            .mockResolvedValueOnce({
                status: 'FAILED', content: 'fail', sqlQuery: 'SELECT a',
                error: 'UNRESOLVED_COLUMN a',
            })
            .mockResolvedValueOnce({
                status: 'FAILED', content: 'fail2', sqlQuery: 'SELECT b',
                error: 'UNRESOLVED_COLUMN b',
            });
        const out = await withRetryOnBadSql(handler, baseArgs);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(out.retried).toBe(true);
        expect(out.attempts).toBe(2);
        expect(out.result.status).toBe('FAILED');
        expect(out.result.error).toContain('UNRESOLVED_COLUMN b');
    });

    test('does not retry when result has no error field (e.g. INSUFFICIENT SCHEMA path)', async () => {
        const handler = jest.fn().mockResolvedValue({
            status: 'COMPLETED', content: "can't be answered from schema",
        });
        const out = await withRetryOnBadSql(handler, baseArgs);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(out.retried).toBe(false);
    });

    test('does not retry when error is missing despite FAILED status', async () => {
        // Defensive: shouldn't happen in practice (orchestrator always sets
        // error on FAILED), but if it does we don't want to crash.
        const handler = jest.fn().mockResolvedValue({
            status: 'FAILED', content: 'oops',
        });
        const out = await withRetryOnBadSql(handler, baseArgs);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(out.retried).toBe(false);
    });

    test('truncates very long error messages in the retry prompt (Wave 22 hardening)', async () => {
        const longErr = 'UNRESOLVED_COLUMN ' + 'x'.repeat(2000);
        const handler = jest.fn()
            .mockResolvedValueOnce({
                status: 'FAILED', content: 'fail', sqlQuery: 'SELECT 1', error: longErr,
            })
            .mockResolvedValueOnce({
                status: 'COMPLETED', content: 'ok',
            });
        await withRetryOnBadSql(handler, baseArgs);
        const augmented = handler.mock.calls[1][0].question;
        // Original question is preserved.
        expect(augmented.startsWith(baseArgs.question)).toBe(true);
        // But the appended error portion is capped (≤ 500 chars worth of x's)
        const xMatches = augmented.match(/x{1,}/);
        expect(xMatches[0].length).toBeLessThanOrEqual(500);
    });
});
