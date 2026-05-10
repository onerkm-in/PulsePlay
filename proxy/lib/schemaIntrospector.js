/**
 * schemaIntrospector.js — INFORMATION_SCHEMA auto-discovery + cache.
 *
 * IDEA-040 Phase 2 — for OpenAI / Bedrock-direct profiles that did NOT
 * configure a manual `schemaContext`, we can derive one automatically by
 * querying the warehouse's INFORMATION_SCHEMA. The result is cached for
 * 6 hours per (host, catalog, schema) tuple, with an LRU cap of 50
 * entries to bound memory in shared deployments.
 *
 * Cache keying intentionally excludes profile.token / profile.tokenName so
 * the same catalog browsed by two service principals shares a single cache
 * entry — the schema metadata is identical regardless of who asks.
 *
 * Output shape is small and prompt-injectable:
 *   {
 *     tables: [
 *       { name: "sales", columns: [
 *           { name: "region", type: "STRING", nullable: true },
 *           { name: "amount", type: "DOUBLE", nullable: false },
 *         ]},
 *       ...
 *     ]
 *   }
 *
 * Use `formatSchemaForPrompt()` to render the structure into a compact
 * text block to prepend to the user question.
 */

'use strict';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const LRU_CAP = 50;

// Module-level cache. Map preserves insertion order; we re-insert on read
// to maintain LRU semantics.
const _cache = new Map(); // key → { value, storedAt }

function _makeKey(profile) {
    const host = String(profile?.host || '').replace(/\/$/, '').toLowerCase();
    const catalog = String(profile?.catalog || profile?.databricksCatalog || '').toLowerCase();
    const schema = String(profile?.schema || profile?.databricksSchema || '').toLowerCase();
    return `${host}|${catalog}|${schema}`;
}

function _evictIfFull() {
    while (_cache.size >= LRU_CAP) {
        // Map iterator's first key is the oldest insertion → evict it.
        const oldest = _cache.keys().next().value;
        if (oldest === undefined) break;
        _cache.delete(oldest);
    }
}

/**
 * Look up a cached schema. Returns null when missing or expired.
 * Touches the LRU on read.
 */
function getCachedSchema(profile, ttlMs) {
    const key = _makeKey(profile);
    const entry = _cache.get(key);
    if (!entry) return null;
    const ttl = ttlMs || SIX_HOURS_MS;
    if (Date.now() - entry.storedAt > ttl) {
        _cache.delete(key);
        return null;
    }
    // Re-insert to bump in LRU order.
    _cache.delete(key);
    _cache.set(key, entry);
    return entry.value;
}

function setCachedSchema(profile, value) {
    const key = _makeKey(profile);
    if (_cache.has(key)) _cache.delete(key);
    _evictIfFull();
    _cache.set(key, { value, storedAt: Date.now() });
}

function clearCache() {
    _cache.clear();
}

/**
 * Query INFORMATION_SCHEMA via the SQL Statement API for the profile's
 * catalog/schema. Caches result for 6h. Throws on missing warehouse/catalog.
 *
 * @param {object} args
 * @param {object} args.profile
 * @param {function} args.databricksRequest  Shared helper from server.js.
 * @param {object} [args.executor]           Override sqlExecutor (for tests).
 * @param {number} [args.ttlMs]              Custom TTL (defaults to 6h).
 * @param {boolean} [args.forceRefresh=false]
 * @returns {Promise<{ tables: Array<{name:string, columns:Array<{name,type,nullable}>}> }>}
 */
async function getSchemaForProfile({ profile, databricksRequest, executor, ttlMs, forceRefresh }) {
    if (!profile?.warehouseId) {
        throw new Error('Schema introspection requires a warehouseId in the profile.');
    }
    const catalog = profile.catalog || profile.databricksCatalog;
    const schema = profile.schema || profile.databricksSchema;
    if (!catalog || !schema) {
        throw new Error('Schema introspection requires profile.catalog and profile.schema.');
    }
    if (!forceRefresh) {
        const cached = getCachedSchema(profile, ttlMs);
        if (cached) return cached;
    }

    const exec = executor || require('./sqlExecutor').executeSqlStatement;

    // Quote catalog/schema as backtick identifiers so a profile with
    // mixed-case or hyphenated names still parses. Single quotes inside
    // identifier values are sanitised to defeat SQL injection on the
    // off-chance an attacker controls the profile config (Wave 22).
    const safeCatalog = String(catalog).replace(/`/g, '');
    const safeSchema = String(schema).replace(/`/g, '');
    const quotedCatalog = safeCatalog.replace(/'/g, "''");
    const quotedSchema = safeSchema.replace(/'/g, "''");

    // Single combined query — INFORMATION_SCHEMA.COLUMNS already has
    // table names, so we don't need a separate TABLES round-trip.
    // Rows are ordered by (table_name, ordinal_position) so the consumer
    // can render columns in declaration order.
    const sql =
        `SELECT table_name, column_name, full_data_type, is_nullable, ordinal_position\n` +
        `FROM \`${safeCatalog}\`.information_schema.columns\n` +
        `WHERE table_catalog = '${quotedCatalog}' AND table_schema = '${quotedSchema}'\n` +
        `ORDER BY table_name, ordinal_position`;

    const result = await exec({ profile, sql, databricksRequest });
    const rowsByTable = new Map();
    for (const row of result.rows || []) {
        const [tableName, columnName, dataType, isNullable] = row;
        if (!tableName) continue;
        if (!rowsByTable.has(tableName)) rowsByTable.set(tableName, []);
        rowsByTable.get(tableName).push({
            name: String(columnName ?? ''),
            type: String(dataType ?? ''),
            nullable: String(isNullable ?? '').toUpperCase() !== 'NO',
        });
    }

    const value = {
        tables: Array.from(rowsByTable.entries()).map(([name, columns]) => ({ name, columns })),
    };
    setCachedSchema(profile, value);
    return value;
}

/**
 * Render the introspection result into a compact prompt block. Output is
 * deterministic and small enough to prepend to every LLM call without
 * blowing token budgets (truncated to maxChars when needed).
 */
function formatSchemaForPrompt(schemaObj, maxChars = 8000) {
    if (!schemaObj?.tables?.length) return '';
    const lines = [];
    for (const t of schemaObj.tables) {
        const cols = (t.columns || [])
            .map(c => `  - ${c.name} ${c.type}${c.nullable ? '' : ' NOT NULL'}`)
            .join('\n');
        lines.push(`TABLE ${t.name}:\n${cols}`);
    }
    let out = lines.join('\n\n');
    if (out.length > maxChars) {
        out = out.slice(0, maxChars - 30) + '\n... [schema truncated]';
    }
    return out;
}

module.exports = {
    getSchemaForProfile,
    getCachedSchema,
    setCachedSchema,
    clearCache,
    formatSchemaForPrompt,
    __test_internals: { _cache, _makeKey, SIX_HOURS_MS, LRU_CAP },
};
