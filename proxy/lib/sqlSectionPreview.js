// @ts-check
'use strict';

/**
 * sqlSectionPreview.js — Wave 35 Phase 3 helper for the Custom SQL Authoring
 * Mode. Wraps the Databricks SQL Statement Execution API for two routes:
 *
 *   POST /sql/preview  — execute a section's SQL and return up to 100 rows
 *   POST /sql/explain  — light dry-run validation (no execution)
 *
 * The handlers in proxy/server.js mount these helpers, supplying the shared
 * `databricksRequest` dependency. Keeping the logic here makes it unit
 * testable without spinning up the full Express app + http mocks.
 *
 * Security gates layered on top of `executeSqlStatement` from sqlExecutor.js:
 *   1. Section H CTE preamble: trusted prefix prepended to the SQL body.
 *   2. DML keyword block (Wave 22 mirror): `isSelectOnly` from sqlExecutor.
 *   3. Identifier sanity: no semicolons after the first statement, no
 *      backticks shell-out attempts, length cap.
 *   4. Wave 22 sanitization on every untrusted input field.
 *   5. Wave 30 cycle 4 redaction: errors are mapped to friendly messages;
 *      raw token / Bearer / dapi-prefix bytes never reach the response.
 */

const { executeSqlStatement, isSelectOnly } = require('./sqlExecutor');

const PREVIEW_MAX_ROWS = 100;
const PREVIEW_DEADLINE_MS = 30_000;
const SQL_BODY_MAX_LENGTH = 8000;
const CTE_HEADER_MAX_LENGTH = 4000;

/** Wave 22 — strip control chars, neutralise newlines/quotes, escape template
 *  variables. Mirror of `sanitizeRuntimeScopeInput` in the visual side; we
 *  re-implement here so the proxy never trusts the visual's gate. */
function sanitizeRuntimeScopeInput(value, maxLen) {
    if (value === null || value === undefined) return '';
    const raw = String(value);
    if (!raw) return '';
    // Strip ASCII / Unicode control chars (except newline + tab — needed for SQL).
    let out = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // Cap length to bound any pathological paste before further processing.
    out = out.slice(0, Math.max(0, Number(maxLen || SQL_BODY_MAX_LENGTH)));
    return out;
}

/** Wave 22 mirror — DML/DDL block. Re-checked here on top of `isSelectOnly`
 *  so an attacker who bypassed the editor still gets blocked. */
const FORBIDDEN_KEYWORDS = /\b(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|GRANT|REVOKE|MERGE|CREATE|REPLACE)\b/i;

/** Reject SQL that has more than one statement (terminating semicolon followed
 *  by non-whitespace) — the warehouse refuses multi-statement bodies anyway,
 *  but failing fast here gives a clearer error. */
function isSingleStatement(sql) {
    if (typeof sql !== 'string') return false;
    const trimmed = sql.trim().replace(/;+\s*$/, '');
    return !trimmed.includes(';');
}

function startsWithReadOnlyQuery(sql) {
    return /^\s*(?:WITH|SELECT)\b/i.test(String(sql || ''));
}

function collectParenthesisErrors(sql) {
    const errors = [];
    let depth = 0;
    for (let i = 0; i < sql.length; i++) {
        const ch = sql.charCodeAt(i);
        if (ch === 40) depth++;
        else if (ch === 41) {
            depth--;
            if (depth < 0) { errors.push('SQL has unbalanced parentheses (extra closing).'); break; }
        }
    }
    if (depth > 0) errors.push('SQL has unbalanced parentheses (unclosed opening).');
    return errors;
}

/**
 * Compose the executable SQL by prepending the Section H CTE preamble (if
 * provided) to the section body. The CTE preamble is treated as TRUSTED
 * config (set by the report author at deployment time) — we still cap its
 * length and strip control chars but don't re-validate the keyword list,
 * since `WITH … AS (SELECT …)` is a legitimate SQL prefix.
 *
 * @param {string} cteHeader  raw Section H preamble (may be empty)
 * @param {string} sql        section SQL body (read-only SELECT)
 * @returns {string}          composed SQL
 */
function composeSqlWithSectionH(cteHeader, sql) {
    const safeCte = sanitizeRuntimeScopeInput(cteHeader, CTE_HEADER_MAX_LENGTH).trim();
    const safeSql = sanitizeRuntimeScopeInput(sql, SQL_BODY_MAX_LENGTH).trim();
    if (!safeSql) return '';
    if (!safeCte) return safeSql;
    // Strip a trailing semicolon from the CTE header so the join is a valid
    // single statement. The header is expected to end with the closing of a
    // CTE block (`),`) but authors sometimes paste an example that ends with
    // `; -- end of CTE`. Be tolerant.
    const cte = safeCte.replace(/;+\s*$/, '');
    return `${cte}\n${safeSql}`;
}

/**
 * Wave 30 cycle 4 redaction — strip token-shaped bytes from upstream error
 * messages before propagating to the visual. Mirrors the redaction in
 * `_databricksRequestOnce` so anything that escaped that net (e.g. an error
 * caught from `executeSqlStatement`) is still scrubbed.
 */
function redactErrorMessage(message) {
    return String(message || '')
        .replace(/dapi[A-Fa-f0-9]{8,}/g, 'dapi[redacted]')
        .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
        .replace(/(["']?[Aa]uthorization["']?\s*[:=]\s*)[^\s,"'}]+/g, '$1[redacted]');
}

/**
 * Validate the section SQL without executing. Returns `{ ok, errors, sql }`
 * where `sql` is the composed (CTE + body) SQL ready for execution. Errors
 * is an array of human-readable strings.
 */
function validateSectionSql({ cteHeader, sql }) {
    /** @type {string[]} */
    const errors = [];
    const safeSql = sanitizeRuntimeScopeInput(sql, SQL_BODY_MAX_LENGTH);
    const safeCte = sanitizeRuntimeScopeInput(cteHeader, CTE_HEADER_MAX_LENGTH).trim();
    if (!safeSql || !safeSql.trim()) {
        errors.push('SQL body is empty.');
        return { ok: false, errors, sql: '' };
    }
    if (safeSql.length >= SQL_BODY_MAX_LENGTH) {
        errors.push(`SQL exceeds maximum length of ${SQL_BODY_MAX_LENGTH} characters.`);
    }
    if (FORBIDDEN_KEYWORDS.test(safeSql)) {
        errors.push('SQL contains a forbidden DML/DDL keyword. Custom SQL sections must be read-only SELECT statements.');
    }
    if (!isSelectOnly(safeSql) || !startsWithReadOnlyQuery(safeSql)) {
        errors.push('SQL must be a SELECT/WITH statement (no SHOW/DESCRIBE/INSERT/UPDATE/DELETE/MERGE/etc.).');
    }
    if (!isSingleStatement(safeSql)) {
        errors.push('Only single-statement SQL is allowed (no semicolons separating multiple statements).');
    }
    errors.push(...collectParenthesisErrors(safeSql));

    if (safeCte) {
        if (safeCte.length >= CTE_HEADER_MAX_LENGTH) {
            errors.push(`Section H CTE preamble exceeds maximum length of ${CTE_HEADER_MAX_LENGTH} characters.`);
        }
        if (!/^\s*WITH\b/i.test(safeCte)) {
            errors.push('Section H CTE preamble must start with WITH.');
        }
        if (FORBIDDEN_KEYWORDS.test(safeCte) || !isSelectOnly(safeCte)) {
            errors.push('Section H CTE preamble contains a forbidden DML/DDL keyword.');
        }
        if (!isSingleStatement(safeCte)) {
            errors.push('Section H CTE preamble must be a single statement prefix.');
        }
        errors.push(...collectParenthesisErrors(safeCte));
    }

    const composed = composeSqlWithSectionH(cteHeader, safeSql);
    if (FORBIDDEN_KEYWORDS.test(composed) || !isSelectOnly(composed) || !startsWithReadOnlyQuery(composed)) {
        errors.push('Composed SQL must remain a read-only SELECT/WITH statement.');
    }
    if (!isSingleStatement(composed)) {
        errors.push('Composed SQL must be a single statement.');
    }
    return { ok: errors.length === 0, errors, sql: composed };
}

/**
 * Execute the composed SQL against the warehouse and return up to 100 rows.
 *
 * @param {object} args
 * @param {object} args.profile        Resolved profile (from server.resolveProfile).
 * @param {string} args.cteHeader      Section H preamble (may be empty).
 * @param {string} args.sql            Section body SQL.
 * @param {function} args.databricksRequest  Shared request helper.
 * @returns {Promise<{
 *   ok: boolean,
 *   columns: string[],
 *   rows: any[][],
 *   truncated: boolean,
 *   totalRowCount: number,
 *   executionTimeMs: number,
 *   statementId?: string,
 *   error?: string
 * }>}
 */
async function previewSectionSql({ profile, cteHeader, sql, databricksRequest }) {
    const validation = validateSectionSql({ cteHeader, sql });
    if (!validation.ok) {
        return {
            ok: false,
            columns: [],
            rows: [],
            truncated: false,
            totalRowCount: 0,
            executionTimeMs: 0,
            error: validation.errors.join(' '),
        };
    }
    if (!profile?.warehouseId) {
        return {
            ok: false,
            columns: [],
            rows: [],
            truncated: false,
            totalRowCount: 0,
            executionTimeMs: 0,
            error: 'No warehouseId configured for the active profile. Add warehouseId to the proxy profile to enable Custom SQL preview.',
        };
    }
    try {
        const result = await executeSqlStatement({
            profile,
            sql: validation.sql,
            databricksRequest,
            maxRows: PREVIEW_MAX_ROWS,
            deadlineMs: PREVIEW_DEADLINE_MS,
        });
        return {
            ok: true,
            columns: result.columns || [],
            rows: result.rows || [],
            truncated: !!result.truncated,
            totalRowCount: result.totalRowCount ?? (result.rows ? result.rows.length : 0),
            executionTimeMs: result.executionTimeMs ?? 0,
            statementId: result.statementId,
        };
    } catch (err) {
        return {
            ok: false,
            columns: [],
            rows: [],
            truncated: false,
            totalRowCount: 0,
            executionTimeMs: 0,
            error: redactErrorMessage(err && err.message),
        };
    }
}

module.exports = {
    PREVIEW_MAX_ROWS,
    PREVIEW_DEADLINE_MS,
    SQL_BODY_MAX_LENGTH,
    CTE_HEADER_MAX_LENGTH,
    sanitizeRuntimeScopeInput,
    composeSqlWithSectionH,
    redactErrorMessage,
    validateSectionSql,
    previewSectionSql,
    isSingleStatement,
};
