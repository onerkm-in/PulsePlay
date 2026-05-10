/**
 * schemaIntrospector.test.js — IDEA-040 Phase 2.
 *
 * Covers the cache (TTL + LRU + key composition), the SQL output shape,
 * the prompt formatter, and the input-validation guards. The actual
 * Databricks call is mocked via the `executor` injection seam so no
 * network access is required.
 */

'use strict';

const {
    getSchemaForProfile,
    getCachedSchema,
    setCachedSchema,
    clearCache,
    formatSchemaForPrompt,
    __test_internals,
} = require('../lib/schemaIntrospector');

beforeEach(() => clearCache());

const baseProfile = {
    host: 'https://acme.cloud.databricks.com',
    token: 'dapi-x',
    warehouseId: 'wh-1',
    catalog: 'main',
    schema: 'analytics',
};

const fakeColumnsResult = {
    columns: ['table_name', 'column_name', 'full_data_type', 'is_nullable', 'ordinal_position'],
    rows: [
        ['orders', 'id', 'BIGINT', 'NO', 1],
        ['orders', 'amount', 'DOUBLE', 'YES', 2],
        ['customers', 'id', 'BIGINT', 'NO', 1],
        ['customers', 'email', 'STRING', 'YES', 2],
    ],
    truncated: false,
    executionTimeMs: 1,
    statementId: 's1',
    totalRowCount: 4,
    rowsReturned: 4,
};

describe('schemaIntrospector — getSchemaForProfile happy path', () => {
    test('returns the {tables: [{name, columns}]} shape', async () => {
        const exec = jest.fn().mockResolvedValue(fakeColumnsResult);
        const out = await getSchemaForProfile({
            profile: baseProfile,
            databricksRequest: jest.fn(),
            executor: exec,
        });
        expect(out.tables).toHaveLength(2);
        const orders = out.tables.find(t => t.name === 'orders');
        expect(orders.columns).toEqual([
            { name: 'id', type: 'BIGINT', nullable: false },
            { name: 'amount', type: 'DOUBLE', nullable: true },
        ]);
        // Verify the SQL went to information_schema and quotes the catalog.
        const sentSql = exec.mock.calls[0][0].sql;
        expect(sentSql).toContain('information_schema.columns');
        expect(sentSql).toContain('`main`');
        expect(sentSql).toContain("'analytics'");
    });

    test('throws when warehouseId is missing', async () => {
        await expect(getSchemaForProfile({
            profile: { ...baseProfile, warehouseId: undefined },
            databricksRequest: jest.fn(),
            executor: jest.fn(),
        })).rejects.toThrow(/warehouseId/);
    });

    test('throws when catalog or schema is missing', async () => {
        await expect(getSchemaForProfile({
            profile: { ...baseProfile, catalog: undefined },
            databricksRequest: jest.fn(),
            executor: jest.fn(),
        })).rejects.toThrow(/catalog and profile.schema/);
    });

    test('accepts databricksCatalog/databricksSchema as legacy aliases', async () => {
        const exec = jest.fn().mockResolvedValue(fakeColumnsResult);
        const profile = {
            host: 'https://x',
            warehouseId: 'wh-1',
            databricksCatalog: 'main',
            databricksSchema: 'analytics',
        };
        const out = await getSchemaForProfile({
            profile,
            databricksRequest: jest.fn(),
            executor: exec,
        });
        expect(out.tables.length).toBeGreaterThan(0);
    });
});

describe('schemaIntrospector — cache behavior', () => {
    test('second call within TTL hits cache and skips executor', async () => {
        const exec = jest.fn().mockResolvedValue(fakeColumnsResult);
        await getSchemaForProfile({ profile: baseProfile, databricksRequest: jest.fn(), executor: exec });
        await getSchemaForProfile({ profile: baseProfile, databricksRequest: jest.fn(), executor: exec });
        expect(exec).toHaveBeenCalledTimes(1);
    });

    test('forceRefresh bypasses the cache', async () => {
        const exec = jest.fn().mockResolvedValue(fakeColumnsResult);
        await getSchemaForProfile({ profile: baseProfile, databricksRequest: jest.fn(), executor: exec });
        await getSchemaForProfile({
            profile: baseProfile, databricksRequest: jest.fn(), executor: exec, forceRefresh: true,
        });
        expect(exec).toHaveBeenCalledTimes(2);
    });

    test('TTL expiry forces a fresh fetch', async () => {
        const exec = jest.fn().mockResolvedValue(fakeColumnsResult);
        await getSchemaForProfile({
            profile: baseProfile, databricksRequest: jest.fn(), executor: exec, ttlMs: 5,
        });
        // Sleep beyond the 5ms TTL.
        await new Promise(r => setTimeout(r, 25));
        await getSchemaForProfile({
            profile: baseProfile, databricksRequest: jest.fn(), executor: exec, ttlMs: 5,
        });
        expect(exec).toHaveBeenCalledTimes(2);
    });

    test('cache key is composed from host + catalog + schema (case-insensitive)', () => {
        setCachedSchema(baseProfile, { tables: [{ name: 't', columns: [] }] });
        // Same host/catalog/schema but different case → should still hit.
        const got = getCachedSchema({
            ...baseProfile,
            host: 'HTTPS://ACME.CLOUD.DATABRICKS.COM',
            catalog: 'MAIN',
            schema: 'ANALYTICS',
        });
        expect(got?.tables?.[0]?.name).toBe('t');
    });

    test('LRU eviction caps the cache at 50 entries', () => {
        const cap = __test_internals.LRU_CAP;
        for (let i = 0; i < cap + 5; i++) {
            setCachedSchema({ host: `host-${i}`, catalog: 'c', schema: 's' }, { tables: [] });
        }
        expect(__test_internals._cache.size).toBe(cap);
        // The first 5 entries should be evicted.
        for (let i = 0; i < 5; i++) {
            expect(getCachedSchema({ host: `host-${i}`, catalog: 'c', schema: 's' })).toBeNull();
        }
        // The latest entries should still be present.
        for (let i = 5; i < cap + 5; i++) {
            expect(getCachedSchema({ host: `host-${i}`, catalog: 'c', schema: 's' })).not.toBeNull();
        }
    });

    test('reading an entry refreshes its LRU position', () => {
        const cap = __test_internals.LRU_CAP;
        setCachedSchema({ host: 'a', catalog: 'c', schema: 's' }, { tables: [] });
        setCachedSchema({ host: 'b', catalog: 'c', schema: 's' }, { tables: [] });
        // Bump 'a' to most-recently-used by reading it (order is now ['b','a']).
        getCachedSchema({ host: 'a', catalog: 'c', schema: 's' });
        // Fill the rest of the cache exactly to capacity (cap - 2 more entries).
        for (let i = 0; i < cap - 2; i++) {
            setCachedSchema({ host: `pad-${i}`, catalog: 'c', schema: 's' }, { tables: [] });
        }
        expect(__test_internals._cache.size).toBe(cap);
        // Adding one more entry should evict the oldest = 'b' (NOT 'a').
        setCachedSchema({ host: 'final', catalog: 'c', schema: 's' }, { tables: [] });
        expect(getCachedSchema({ host: 'a', catalog: 'c', schema: 's' })).not.toBeNull();
        expect(getCachedSchema({ host: 'b', catalog: 'c', schema: 's' })).toBeNull();
    });

    test('clearCache wipes all entries', () => {
        setCachedSchema(baseProfile, { tables: [] });
        expect(__test_internals._cache.size).toBeGreaterThan(0);
        clearCache();
        expect(__test_internals._cache.size).toBe(0);
    });
});

describe('schemaIntrospector — formatSchemaForPrompt', () => {
    test('renders compact TABLE/column block', () => {
        const out = formatSchemaForPrompt({
            tables: [
                { name: 'orders', columns: [
                    { name: 'id', type: 'BIGINT', nullable: false },
                    { name: 'amount', type: 'DOUBLE', nullable: true },
                ]},
            ],
        });
        expect(out).toContain('TABLE orders');
        expect(out).toContain('id BIGINT NOT NULL');
        expect(out).toContain('amount DOUBLE');
        expect(out).not.toContain('amount DOUBLE NOT NULL');
    });

    test('returns empty string for empty schema', () => {
        expect(formatSchemaForPrompt({ tables: [] })).toBe('');
        expect(formatSchemaForPrompt(null)).toBe('');
        expect(formatSchemaForPrompt(undefined)).toBe('');
    });

    test('truncates beyond maxChars cap', () => {
        const cols = Array.from({ length: 500 }, (_, i) => ({
            name: `col_${i}`, type: 'STRING', nullable: true,
        }));
        const out = formatSchemaForPrompt({ tables: [{ name: 'big', columns: cols }] }, 500);
        expect(out.length).toBeLessThanOrEqual(500);
        expect(out).toContain('schema truncated');
    });
});
