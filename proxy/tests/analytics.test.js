/**
 * analytics.test.js — IDEA-040 Cycle 7 Phase 1 MVP coverage.
 *
 * Tests the SQL executor + LLM orchestrator units (no live Databricks
 * or OpenAI required; all upstream calls mocked).
 */

const { isSelectOnly, __test_internals: sqlInternals } = require('../lib/sqlExecutor');
const {
    extractSqlFromResponse,
    buildNarrativePrompt,
    renderRowsAsMarkdown,
    orchestrateGroundedAnswer,
} = require('../lib/llmOrchestrator');

describe('sqlExecutor.isSelectOnly', () => {
    test.each([
        ['SELECT * FROM sales', true],
        ['select region from t', true],
        ['WITH cte AS (SELECT 1) SELECT * FROM cte', true],
        // Note: WITH is the modern CTE pattern; the regex treats it as SELECT-equivalent.
    ])('allows pure SELECT: %s', (sql, expected) => {
        expect(isSelectOnly(sql)).toBe(expected);
    });

    test.each([
        ['DELETE FROM users', false],
        ['INSERT INTO orders VALUES (1)', false],
        ['UPDATE customers SET email = NULL', false],
        ['DROP TABLE pii_audit', false],
        ['CREATE OR REPLACE VIEW v AS SELECT 1', false],
        ['ALTER TABLE x ADD COLUMN y INT', false],
        ['TRUNCATE TABLE staging', false],
        ['MERGE INTO tgt USING src ON x', false],
        ['REPLACE INTO log VALUES (1)', false],
        ['GRANT SELECT ON t TO foo', false],
    ])('refuses DML/DDL: %s', (sql, expected) => {
        expect(isSelectOnly(sql)).toBe(expected);
    });

    test('refuses empty / non-string input', () => {
        expect(isSelectOnly('')).toBe(false);
        expect(isSelectOnly(null)).toBe(false);
        expect(isSelectOnly(undefined)).toBe(false);
        expect(isSelectOnly(42)).toBe(false);
    });
});

describe('llmOrchestrator.extractSqlFromResponse', () => {
    test('extracts SQL from a fenced sql block', () => {
        const r = '```sql\nSELECT * FROM sales\n```';
        expect(extractSqlFromResponse(r)).toBe('SELECT * FROM sales');
    });

    test('extracts SQL from a generic fenced block', () => {
        const r = 'Here is the query:\n```\nSELECT region FROM t\n```\nAll done.';
        expect(extractSqlFromResponse(r)).toBe('SELECT region FROM t');
    });

    test('extracts bare SELECT when no fence is present', () => {
        const r = 'SELECT region, SUM(sales) FROM t GROUP BY region';
        expect(extractSqlFromResponse(r)).toBe(r);
    });

    test('extracts bare WITH when no fence is present', () => {
        const r = 'WITH x AS (SELECT 1) SELECT * FROM x';
        expect(extractSqlFromResponse(r)).toBe(r);
    });

    test('returns null when response is pure prose', () => {
        expect(extractSqlFromResponse('I cannot answer that question.')).toBeNull();
    });

    test('returns null when response is empty', () => {
        expect(extractSqlFromResponse('')).toBeNull();
        expect(extractSqlFromResponse(null)).toBeNull();
    });
});

describe('llmOrchestrator.renderRowsAsMarkdown', () => {
    test('builds a pipe-table from columns + rows', () => {
        const md = renderRowsAsMarkdown(['Region', 'Sales'], [['North', 100], ['South', 200]]);
        expect(md).toContain('| Region | Sales |');
        expect(md).toContain('| --- | --- |');
        expect(md).toContain('| North | 100 |');
    });

    test('handles empty rows gracefully', () => {
        expect(renderRowsAsMarkdown(['A'], [])).toContain('no rows');
    });

    test('handles missing columns gracefully', () => {
        expect(renderRowsAsMarkdown([], [])).toContain('no result columns');
    });

    test('coerces null/undefined cells to empty string', () => {
        const md = renderRowsAsMarkdown(['A', 'B'], [[null, undefined]]);
        expect(md).toContain('|  |  |');
    });
});

describe('llmOrchestrator.buildNarrativePrompt', () => {
    test('includes question, SQL, and result table', () => {
        const p = buildNarrativePrompt('Q?', 'SELECT 1', ['A'], [[1]], false, 1);
        expect(p).toContain('Question: Q?');
        expect(p).toContain('```sql');
        expect(p).toContain('SELECT 1');
        expect(p).toContain('| A |');
    });

    test('flags truncation in the note', () => {
        const p = buildNarrativePrompt('Q', 'S', ['A'], [[1]], true, 50000);
        expect(p).toContain('truncated');
        expect(p).toContain('50000');
    });

    test('caps prompt sample at 100 rows even when result has more', () => {
        const rows = Array.from({ length: 250 }, (_, i) => [i]);
        const p = buildNarrativePrompt('Q', 'S', ['n'], rows, false, 250);
        // The markdown table only shows the sample; 100 row markers max
        const rowMarkers = (p.match(/\| \d+ \|/g) || []).length;
        expect(rowMarkers).toBeLessThanOrEqual(100);
        expect(p).toContain('Only the first 100 of 250');
    });
});

describe('llmOrchestrator — prompt-injection-from-BI-data hardening', () => {
    test('escapes a pipe in a column name so it cannot forge a table column', () => {
        const md = renderRowsAsMarkdown(['Region | DROP'], [['North']]);
        // The injected pipe is escaped (\|) — it does NOT create a second column.
        expect(md).toContain('Region \\| DROP');
        expect(md).not.toContain('| Region | DROP |'); // fails-on-old: old left it raw
    });

    test('escapes pipes in a cell value so it cannot inject extra columns', () => {
        const md = renderRowsAsMarkdown(['A'], [['x | INJECTED | y']]);
        expect(md).toContain('x \\| INJECTED \\| y');
        // Exactly one body row (header, separator, one data row) — no forged rows.
        expect(md.split('\n')).toHaveLength(3);
    });

    test('collapses newlines in a cell so it cannot start a fake row', () => {
        const md = renderRowsAsMarkdown(['A'], [['North\n| FAKE | ROW']]);
        // Newline → space; pipes escaped. Still exactly 3 lines (no injected row).
        expect(md.split('\n')).toHaveLength(3);
        expect(md).not.toMatch(/\n\| FAKE \| ROW \|/);
    });

    test('neutralizes backticks in a cell (no markdown code span)', () => {
        const md = renderRowsAsMarkdown(['A'], [['`rm -rf`']]);
        expect(md).not.toContain('`');
    });

    test('length-caps an oversized injected cell', () => {
        const huge = 'A'.repeat(5000);
        const md = renderRowsAsMarkdown(['A'], [[huge]]);
        expect(md).toContain('...');
        expect(md.length).toBeLessThan(400);
    });

    test('buildNarrativePrompt fences the result data as untrusted', () => {
        const p = buildNarrativePrompt('Q?', 'SELECT 1', ['A'], [[1]], false, 1);
        expect(p).toContain('<<<RESULT DATA>>>');
        expect(p).toContain('<<<END RESULT DATA>>>');
    });

    test('normal data still renders unchanged (no over-escaping)', () => {
        const md = renderRowsAsMarkdown(['Region', 'Sales'], [['North', 100]]);
        expect(md).toContain('| Region | Sales |');
        expect(md).toContain('| North | 100 |');
    });
});

describe('llmOrchestrator.orchestrateGroundedAnswer — happy path', () => {
    const profile = { host: 'https://x', token: 't', warehouseId: 'w1' };
    const schema = 'TABLE sales (region STRING, amount DOUBLE)';
    const convId = 'conv-1';
    const msgId = 'msg-1';

    test('returns Genie-shape on success', async () => {
        const callLlm = jest.fn()
            .mockResolvedValueOnce('```sql\nSELECT region, SUM(amount) FROM sales GROUP BY region\n```')
            .mockResolvedValueOnce('Sales were highest in the North region at $100.');
        const databricksRequest = jest.fn().mockResolvedValueOnce({
            statement_id: 'stmt-1',
            status: { state: 'SUCCEEDED' },
            manifest: { schema: { columns: [{ name: 'region' }, { name: 'total' }] }, total_row_count: 2 },
            result: { data_array: [['North', 100], ['South', 80]] },
        });
        const out = await orchestrateGroundedAnswer({
            profile, question: 'Sales by region?', schemaContext: schema,
            callLlm, databricksRequest, convId, msgId,
        });
        expect(out.status).toBe('COMPLETED');
        expect(out.sqlQuery).toContain('SELECT region');
        expect(out.queryResult.columns).toEqual(['region', 'total']);
        expect(out.queryResult.rows).toEqual([['North', 100], ['South', 80]]);
        expect(out.content).toContain('North');
        expect(callLlm).toHaveBeenCalledTimes(2);
    });

    test('refuses when LLM produces non-SELECT', async () => {
        const callLlm = jest.fn().mockResolvedValueOnce('```sql\nDELETE FROM sales\n```');
        const databricksRequest = jest.fn();
        const out = await orchestrateGroundedAnswer({
            profile, question: 'Wipe sales?', schemaContext: schema,
            callLlm, databricksRequest, convId, msgId,
        });
        expect(out.status).toBe('FAILED');
        expect(out.content).toContain('non-SELECT');
        expect(databricksRequest).not.toHaveBeenCalled();
    });

    test('handles INSUFFICIENT SCHEMA marker gracefully', async () => {
        const callLlm = jest.fn().mockResolvedValueOnce('```\n-- INSUFFICIENT SCHEMA --\n```');
        const out = await orchestrateGroundedAnswer({
            profile, question: 'Unknown?', schemaContext: schema,
            callLlm, databricksRequest: jest.fn(), convId, msgId,
        });
        expect(out.status).toBe('COMPLETED');
        expect(out.content).toContain("can't be answered");
    });

    test('handles SQL execution failure with FAILED status + error msg', async () => {
        const callLlm = jest.fn().mockResolvedValueOnce('```sql\nSELECT * FROM sales\n```');
        const databricksRequest = jest.fn().mockResolvedValueOnce({
            statement_id: 'stmt-x',
            status: { state: 'FAILED', error: { message: 'Table not found' } },
        });
        const out = await orchestrateGroundedAnswer({
            profile, question: 'Q', schemaContext: schema,
            callLlm, databricksRequest, convId, msgId,
        });
        expect(out.status).toBe('FAILED');
        expect(out.content).toContain('Table not found');
        expect(out.sqlQuery).toContain('SELECT * FROM sales');
    });

    test('returns helpful message when SQL extraction fails (LLM returns prose)', async () => {
        const callLlm = jest.fn().mockResolvedValueOnce("I'm sorry, I can't help.");
        const out = await orchestrateGroundedAnswer({
            profile, question: 'Q', schemaContext: schema,
            callLlm, databricksRequest: jest.fn(), convId, msgId,
        });
        expect(out.status).toBe('COMPLETED');
        expect(out.content).toContain('could not produce');
    });

    test('throws when schemaContext is missing', async () => {
        await expect(orchestrateGroundedAnswer({
            profile, question: 'Q', schemaContext: '',
            callLlm: jest.fn(), databricksRequest: jest.fn(), convId, msgId,
        })).rejects.toThrow(/Schema context is required/);
    });

    test('falls back gracefully when narrative pass fails post-execution', async () => {
        const callLlm = jest.fn()
            .mockResolvedValueOnce('```sql\nSELECT 1\n```')
            .mockRejectedValueOnce(new Error('Network timeout'));
        const databricksRequest = jest.fn().mockResolvedValueOnce({
            statement_id: 'stmt-2',
            status: { state: 'SUCCEEDED' },
            manifest: { schema: { columns: [{ name: 'one' }] }, total_row_count: 1 },
            result: { data_array: [[1]] },
        });
        const out = await orchestrateGroundedAnswer({
            profile, question: 'Q', schemaContext: schema,
            callLlm, databricksRequest, convId, msgId,
        });
        expect(out.status).toBe('COMPLETED');
        expect(out.content).toContain('narrative pass failed');
        // Data is still surfaced
        expect(out.queryResult.rows).toEqual([[1]]);
    });
});
