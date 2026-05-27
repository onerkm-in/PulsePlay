/**
 * sqlExecutor.js — Databricks SQL Statement Execution API wrapper.
 *
 * Used by the OpenAI / Bedrock analytics-grounding orchestrator to run the
 * SQL the LLM produces. Mirrors what Genie does internally: write SQL,
 * execute against the user's warehouse, return columns + rows.
 *
 * IDEA-040 Cycle 7 — Phase 1 MVP. Synchronous (waits for COMPLETE) with
 * a hard deadline; returns truncation flag if result set exceeds maxRows.
 *
 * Phase 2 will add:
 *  - Async polling for long-running statements (currently fails after deadline)
 *  - Pagination via next_page_token for results > 10K rows
 *  - Per-warehouse fan-out and load balancing
 */

const { COMPLEX_REQUEST_TIMEOUT_MS } = require('./timeoutPolicy');

const STATEMENT_PATH = '/api/2.0/sql/statements';
// 2026-05-27 — wait_timeout caps at 50s in the Databricks SQL API
// (server-side limit, not ours). Keep DEFAULT_TIMEOUT_S = 50 since the
// API rejects values >50. The DEADLINE — total time we'll wait for the
// statement to complete across polls — promotes to COMPLEX (5 min) per
// the central timeout policy.
const DEFAULT_TIMEOUT_S = 50;     // server-side wait_timeout cap (DBR API max)
const DEFAULT_DEADLINE_MS = COMPLEX_REQUEST_TIMEOUT_MS; // was 90s; now 5 min
const DEFAULT_MAX_ROWS = 10_000;

/**
 * Execute a SQL statement against the configured warehouse.
 *
 * @param {object} args
 * @param {object} args.profile        Profile object with host + token + warehouseId.
 * @param {string} args.sql            SQL to execute (must be a single statement).
 * @param {function} args.databricksRequest  The shared databricksRequest helper from server.js.
 * @param {number} [args.maxRows]      Cap rows returned (default 10K).
 * @param {number} [args.deadlineMs]   Total wall-clock budget (default 90s).
 * @returns {Promise<{ columns: string[], rows: any[][], truncated: boolean, executionTimeMs: number, statementId: string }>}
 */
async function executeSqlStatement({ profile, sql, databricksRequest, maxRows, deadlineMs }) {
    if (!profile?.warehouseId) {
        throw new Error('SQL execution requires a warehouseId in the profile.');
    }
    if (!sql || typeof sql !== 'string' || !sql.trim()) {
        throw new Error('SQL statement is empty.');
    }
    const cap = maxRows || DEFAULT_MAX_ROWS;
    const startedAt = Date.now();
    const deadlineAt = startedAt + (deadlineMs || DEFAULT_DEADLINE_MS);

    // Submit the statement. wait_timeout=50s means the API blocks up to
    // 50s inline — perfect for the common case of a sub-minute query.
    // Anything longer falls into our polling loop below.
    const submitBody = {
        warehouse_id: profile.warehouseId,
        statement: sql,
        wait_timeout: `${DEFAULT_TIMEOUT_S}s`,
        on_wait_timeout: 'CONTINUE',
        format: 'JSON_ARRAY',
        disposition: 'INLINE',
        row_limit: cap,
    };

    let resp = await databricksRequest(profile, 'POST', STATEMENT_PATH, submitBody);
    let statementId = resp.statement_id;
    let status = resp.status?.state;

    // Poll until terminal or deadline.
    while (status && status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'CANCELED' && status !== 'CLOSED') {
        if (Date.now() > deadlineAt) {
            // Best-effort cancel so the statement doesn't keep running
            // on the warehouse when nobody is waiting for it.
            try { await databricksRequest(profile, 'POST', `${STATEMENT_PATH}/${statementId}/cancel`); } catch { /* ignore */ }
            throw new Error(`SQL execution exceeded ${deadlineMs || DEFAULT_DEADLINE_MS}ms deadline (state=${status}).`);
        }
        await new Promise(r => setTimeout(r, 800));
        resp = await databricksRequest(profile, 'GET', `${STATEMENT_PATH}/${statementId}`);
        status = resp.status?.state;
    }

    if (status !== 'SUCCEEDED') {
        const errMsg = resp.status?.error?.message || `SQL ended with status ${status}.`;
        const err = new Error(errMsg);
        err.statementId = statementId;
        err.statementState = status;
        throw err;
    }

    const manifest = resp.manifest;
    const result = resp.result || {};
    const columns = (manifest?.schema?.columns || []).map(c => c.name);
    const rows = result.data_array || [];
    const totalRowCount = manifest?.total_row_count ?? rows.length;
    const truncated = totalRowCount > rows.length || rows.length >= cap;

    return {
        columns,
        rows,
        truncated,
        executionTimeMs: Date.now() - startedAt,
        statementId,
        totalRowCount,
        rowsReturned: rows.length,
    };
}

/**
 * Validate that a SQL string is SELECT-only — no DML/DDL. Used by the
 * orchestrator to refuse statements the LLM might have generated against
 * the system prompt's intent. Mirrors the genie.ts DML_RE from Wave 22 —
 * each verb requires its own followup pattern so identifier names like
 * CREATED_AT / UPDATED_BY don't false-flag, AND `UPDATE <ident> SET` is
 * caught even though it doesn't follow the INTO/FROM/TABLE pattern.
 */
const DML_RE = new RegExp(
    "(?:^|;|\\n)\\s*(?:" +
        "INSERT\\s+INTO" +
        "|UPDATE\\s+[\\w\\.\\[\\]`\"']+\\s+SET" +
        "|DELETE\\s+FROM" +
        "|DROP\\s+(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER|IF)" +
        "|CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER)" +
        "|ALTER\\s+(?:TABLE|VIEW|INDEX|DATABASE|SCHEMA)" +
        "|TRUNCATE\\s+(?:TABLE\\s+)?[\\w\\.\\[\\]`\"']" +
        "|MERGE\\s+INTO" +
        "|REPLACE\\s+INTO" +
        "|GRANT\\s+\\w+" +
        "|REVOKE\\s+\\w+" +
    ")",
    "i"
);
function isSelectOnly(sql) {
    if (!sql || typeof sql !== 'string') return false;
    return !DML_RE.test(sql);
}

module.exports = {
    executeSqlStatement,
    isSelectOnly,
    __test_internals: { DML_RE, STATEMENT_PATH, DEFAULT_TIMEOUT_S, DEFAULT_DEADLINE_MS, DEFAULT_MAX_ROWS },
};
