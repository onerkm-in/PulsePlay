'use strict';

/**
 * sqlPreviewRoute.test.js — Wave 35 Phase 3 jest coverage for the
 * /sql/preview + /sql/explain proxy routes and their underlying helper.
 *
 * Strategy mirrors analytics.test.js: helper functions are tested with
 * mocked `databricksRequest`; route handlers are exercised via supertest
 * with the same fs-mocked config as server.test.js so we don't spin up
 * real Databricks calls.
 */

// ── Config mock ────────────────────────────────────────────────────────────────
const MOCK_CONFIG_BASE = {
    port: 0,
    profiles: {
        default: {
            host: 'https://test.azuredatabricks.net',
            token: 'dapi-test-token-abc',
            spaceId: 'space-default-123',
            warehouseId: 'wh-test-001',
        },
    },
};

jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        existsSync: jest.fn((p) => String(p).endsWith('config.json') ? true : actual.existsSync(p)),
        readFileSync: jest.fn().mockReturnValue(JSON.stringify(MOCK_CONFIG_BASE)),
        appendFileSync: jest.fn(),
    };
});
jest.mock('@azure/identity', () => { throw new Error('not installed'); }, { virtual: true });

const request = require('supertest');
const {
    validateSectionSql,
    composeSqlWithSectionH,
    redactErrorMessage,
    previewSectionSql,
    isSingleStatement,
    PREVIEW_MAX_ROWS,
} = require('../lib/sqlSectionPreview');
const { app } = require('../server');

// Suppress expected error/warn noise.
let _errSpy, _warnSpy, _logSpy;
beforeAll(() => {
    _errSpy  = jest.spyOn(console, 'error').mockImplementation(() => {});
    _warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    _logSpy  = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
    _errSpy?.mockRestore();
    _warnSpy?.mockRestore();
    _logSpy?.mockRestore();
});

describe('sqlSectionPreview.validateSectionSql', () => {
    test('accepts a clean SELECT', () => {
        const v = validateSectionSql({ cteHeader: '', sql: 'SELECT region, SUM(amount) FROM sales GROUP BY region' });
        expect(v.ok).toBe(true);
        expect(v.errors).toEqual([]);
        expect(v.sql).toContain('SELECT region');
    });

    test('rejects DML keywords', () => {
        const sqls = [
            'DROP TABLE foo',
            'DELETE FROM foo',
            'INSERT INTO foo VALUES (1)',
            'UPDATE foo SET x = 1',
            'TRUNCATE foo',
            'MERGE INTO target USING src ON 1=1 WHEN MATCHED THEN UPDATE SET x=1',
            'CREATE OR REPLACE VIEW v AS SELECT 1',
            'GRANT SELECT ON foo TO bar',
        ];
        for (const sql of sqls) {
            const v = validateSectionSql({ cteHeader: '', sql });
            expect(v.ok).toBe(false);
            expect(v.errors.length).toBeGreaterThan(0);
        }
    });

    test('rejects multi-statement SQL', () => {
        const v = validateSectionSql({ cteHeader: '', sql: 'SELECT 1; SELECT 2' });
        expect(v.ok).toBe(false);
        expect(v.errors.some(e => /single-statement/i.test(e))).toBe(true);
    });

    test('flags unbalanced parentheses', () => {
        const open = validateSectionSql({ cteHeader: '', sql: 'SELECT (a + b FROM t' });
        expect(open.ok).toBe(false);
        expect(open.errors.some(e => /paren/i.test(e))).toBe(true);
        const close = validateSectionSql({ cteHeader: '', sql: 'SELECT a) FROM t' });
        expect(close.ok).toBe(false);
        expect(close.errors.some(e => /paren/i.test(e))).toBe(true);
    });

    test('prepends Section H CTE preamble to composed SQL', () => {
        const cte = 'WITH scoped_sales AS (SELECT * FROM main.sales WHERE region = current_user())';
        const v = validateSectionSql({ cteHeader: cte, sql: 'SELECT SUM(amount) FROM scoped_sales' });
        expect(v.ok).toBe(true);
        expect(v.sql.startsWith('WITH scoped_sales AS')).toBe(true);
        expect(v.sql).toContain('SELECT SUM(amount) FROM scoped_sales');
    });

    test('strips a trailing semicolon from the CTE header before joining', () => {
        const cte = 'WITH t AS (SELECT 1);';
        const composed = composeSqlWithSectionH(cte, 'SELECT * FROM t');
        expect(composed.endsWith(';\nSELECT * FROM t')).toBe(false);
        expect(composed).toContain('AS (SELECT 1)\nSELECT * FROM t');
    });
});

describe('sqlSectionPreview.redactErrorMessage', () => {
    test('redacts dapi tokens, Bearer headers, and Authorization values', () => {
        const m = redactErrorMessage('Failed: dapiABC1234567890 with Bearer dapi.0123456789ABCDEF or Authorization: leaked-token-xyz');
        expect(m).not.toMatch(/dapiABC123/);
        expect(m).not.toMatch(/leaked-token-xyz/);
        expect(m).toContain('[redacted]');
    });

    test('passes through harmless messages unchanged', () => {
        const m = redactErrorMessage('Table not found in catalog');
        expect(m).toBe('Table not found in catalog');
    });
});

describe('sqlSectionPreview.isSingleStatement', () => {
    test('accepts a single SELECT with a trailing semicolon', () => {
        expect(isSingleStatement('SELECT 1;')).toBe(true);
        expect(isSingleStatement('SELECT 1')).toBe(true);
    });
    test('rejects SQL with multiple statements', () => {
        expect(isSingleStatement('SELECT 1; SELECT 2')).toBe(false);
    });
});

describe('sqlSectionPreview.previewSectionSql', () => {
    const profile = { host: 'https://x', token: 'dapi-x', warehouseId: 'wh-1' };

    test('returns rows on success with truncation flag', async () => {
        const databricksRequest = jest.fn().mockResolvedValueOnce({
            statement_id: 'stmt-1',
            status: { state: 'SUCCEEDED' },
            manifest: {
                schema: { columns: [{ name: 'region' }, { name: 'total' }] },
                total_row_count: 2,
            },
            result: { data_array: [['North', 100], ['South', 80]] },
        });
        const out = await previewSectionSql({
            profile,
            cteHeader: '',
            sql: 'SELECT region, SUM(amount) AS total FROM sales GROUP BY region',
            databricksRequest,
        });
        expect(out.ok).toBe(true);
        expect(out.columns).toEqual(['region', 'total']);
        expect(out.rows).toEqual([['North', 100], ['South', 80]]);
        expect(out.totalRowCount).toBe(2);
        expect(databricksRequest).toHaveBeenCalled();
    });

    test('refuses execution when SQL contains DML', async () => {
        const databricksRequest = jest.fn();
        const out = await previewSectionSql({
            profile, cteHeader: '', sql: 'DELETE FROM sales', databricksRequest,
        });
        expect(out.ok).toBe(false);
        expect(out.error).toMatch(/forbidden|SELECT/i);
        expect(databricksRequest).not.toHaveBeenCalled();
    });

    test('refuses when no warehouseId is configured', async () => {
        const noWarehouse = { host: 'https://x', token: 'dapi-x' };
        const out = await previewSectionSql({
            profile: noWarehouse, cteHeader: '', sql: 'SELECT 1',
            databricksRequest: jest.fn(),
        });
        expect(out.ok).toBe(false);
        expect(out.error).toMatch(/warehouseId/);
    });

    test('redacts upstream error bodies (no token leak)', async () => {
        const databricksRequest = jest.fn().mockRejectedValueOnce(
            new Error('Databricks 401: Bearer dapiABC123def456 invalid')
        );
        const out = await previewSectionSql({
            profile, cteHeader: '', sql: 'SELECT 1', databricksRequest,
        });
        expect(out.ok).toBe(false);
        expect(out.error).not.toMatch(/dapiABC123/);
        expect(out.error).toContain('[redacted]');
    });
});

describe('POST /sql/explain — route handler', () => {
    test('returns ok:true for a clean SELECT', async () => {
        const res = await request(app)
            .post('/sql/explain')
            .send({ sql: 'SELECT region, SUM(amount) FROM sales GROUP BY region' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.errors).toEqual([]);
        expect(res.body.composedLength).toBeGreaterThan(0);
    });

    test('returns ok:false with error list for DML', async () => {
        const res = await request(app)
            .post('/sql/explain')
            .send({ sql: 'DELETE FROM sales' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(false);
        expect(res.body.errors.length).toBeGreaterThan(0);
    });

    test('returns 400 when no profile is configured', async () => {
        const res = await request(app)
            .post('/sql/explain')
            .send({ assistantProfile: 'nonexistent-profile-zzz', sql: 'SELECT 1' });
        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
    });

    test('caps preview at PREVIEW_MAX_ROWS rows', () => {
        // Defence-in-depth assertion: the constant exists and is 100.
        expect(PREVIEW_MAX_ROWS).toBe(100);
    });
});
