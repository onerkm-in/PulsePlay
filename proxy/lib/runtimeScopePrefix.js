// @ts-check
'use strict';

/**
 * runtimeScopePrefix.js — SERVER-SIDE runtime governance prefix for NL→SQL.
 *
 * Port of playground/src/pulse/genie.ts buildRuntimeScopePrefix (Wave 22).
 * Until now that governance — forbidden columns, forbidden tables, mandatory
 * row filter, read-only enforcement, CTE preamble, role scoping hint — existed
 * ONLY as a prompt prefix the BROWSER prepends before calling the proxy; the
 * proxy forwarded content verbatim and trusted the client to have applied it
 * (see the Wave 22 note above runLocalSupervisor). Any non-browser caller —
 * pulse-pbi, the desktop enabler, curl, or an automated agent — therefore got
 * ZERO of it.
 *
 * This module gives the proxy a server-owned governance floor:
 *   • Fields are read from the PROFILE (proxy config.json), same names the
 *     client settings use, so one vocabulary describes governance everywhere.
 *   • If the incoming content ALREADY carries the client-built prefix, it is
 *     left untouched (never strip, never double-apply — the Wave 22 contract).
 *   • If not, and the profile declares governance, the server prepends the
 *     SAME text the client would have built. Prompt behaviour is identical
 *     whichever side applies it.
 *
 * The wording below is copied verbatim from the client. If you change it,
 * change genie.ts in the same commit — divergent wording means divergent
 * governance depending on which client called, which is worse than either
 * wording alone.
 */

const MAX_CTE_LEN = 5000;
const MAX_ROW_FILTER_LEN = 1000;
const MAX_LIST_LEN = 2000;          // forbidden columns / tables (comma-sep)
const MAX_ROLE_LEN = 64;

const IDENTIFIER_RE = /^(?:[A-Za-z_][\w.]{0,63}|`[\w.]{1,63}`|\[[\w.]{1,63}\]|"[\w.]{1,63}"|'[\w.]{1,63}')$/;
const SQL_KEYWORD_STRIP_RE = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|REPLACE|UNION|EXEC|EXECUTE|GRANT|REVOKE|FROM|WHERE|JOIN|INTO|TABLE|VIEW|DATABASE|SCHEMA)\b/gi;

/** The exact header the client emits — used both to build and to DETECT. */
const GOVERNANCE_HEADER = '[Governance rules enforced by this report — follow exactly]:';

function sanitizeInstructionText(s) {
    return String(s || '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function sanitizeIdentifierList(s, maxLen) {
    return sanitizeInstructionText(s)
        .slice(0, maxLen)
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0 && c.length <= 65 && IDENTIFIER_RE.test(c));
}

function sanitizeTemplateValue(s) {
    return String(s || '')
        .replace(/[';"\\\r\n\t]/g, '')
        .replace(/--/g, '')
        .replace(/\/\*/g, '')
        .replace(/\*\//g, '')
        .replace(/[^\w\-. ]/g, '')
        .slice(0, MAX_ROLE_LEN)
        .replace(SQL_KEYWORD_STRIP_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function applyTemplateVars(text, userRole) {
    const today = new Date();
    const yyyy = today.getFullYear().toString();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const safeRole = sanitizeTemplateValue(userRole || 'viewer');
    return String(text)
        .replace(/\{\{role\}\}/gi, safeRole)
        .replace(/\{\{currentDate\}\}/gi, `${yyyy}-${mm}-${dd}`)
        .replace(/\{\{year\}\}/gi, yyyy);
}

/**
 * Build the governance prefix from profile-level fields. Same field names as
 * the client settings; empty string when the profile declares nothing.
 *
 * @param {object} profile   proxy profile (config.json entry)
 * @param {string} [userRole] verified viewer role (IdP claim), for {{role}} + the RLS hint
 * @returns {string} '' or a prefix ending in a blank line, ready to prepend
 */
function buildServerScopePrefix(profile, userRole) {
    if (!profile || typeof profile !== 'object') return '';
    const parts = [];

    const forbiddenCols = sanitizeIdentifierList(profile.runtimeForbiddenColumns || '', MAX_LIST_LEN);
    if (forbiddenCols.length > 0) {
        parts.push(`[MANDATORY] DO NOT query, reference, or expose the following columns in any SQL or answer: ${forbiddenCols.join(', ')}.`);
    }

    const rowFilterRaw = sanitizeInstructionText(profile.runtimeMandatoryRowFilter || '').slice(0, MAX_ROW_FILTER_LEN);
    const rowFilter = rowFilterRaw ? applyTemplateVars(rowFilterRaw, userRole) : '';
    if (rowFilter) {
        parts.push(`[MANDATORY] Every SQL query MUST include the filter: WHERE ${rowFilter} (or AND ${rowFilter} if there is already a WHERE clause).`);
    }

    if (profile.runtimeReadOnlyEnforced === true || profile.runtimeReadOnlyEnforced === 'true') {
        parts.push('[MANDATORY] Only SELECT statements are permitted. Do NOT generate INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, or MERGE statements for any reason.');
    }

    const cteRaw = sanitizeInstructionText(profile.sqlCtePreamble || '').slice(0, MAX_CTE_LEN);
    const ctePreamble = cteRaw ? applyTemplateVars(cteRaw, userRole) : '';
    if (ctePreamble) {
        parts.push(
            '[MANDATORY] You MUST use the following CTE preamble in every SQL query you write. ' +
            'Build all analysis exclusively on top of this pre-filtered dataset — do NOT query the ' +
            `underlying base tables directly:\n\`\`\`sql\n${ctePreamble}\n\`\`\``
        );
    }

    const forbiddenTables = sanitizeIdentifierList(profile.sqlForbiddenTables || '', MAX_LIST_LEN);
    if (forbiddenTables.length > 0) {
        parts.push(`[MANDATORY] DO NOT reference or query the following tables/views in any SQL: ${forbiddenTables.join(', ')}.`);
    }

    if ((profile.sqlRlsHintEnabled === true || profile.sqlRlsHintEnabled === 'true') && userRole) {
        const safeRole = sanitizeTemplateValue(userRole);
        if (safeRole) {
            parts.push(`[Context] Current viewer role: "${safeRole}". Apply role-appropriate row scoping in every SQL query.`);
        }
    }

    if (parts.length === 0) return '';
    return `${GOVERNANCE_HEADER}\n${parts.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n`;
}

/** True when the content already carries a governance prefix (client-applied). */
function hasGovernancePrefix(content) {
    return typeof content === 'string' && content.includes(GOVERNANCE_HEADER);
}

/**
 * Apply the server governance floor to an outgoing NL→SQL question.
 * Never strips or rewrites a client-applied prefix.
 *
 * @returns {{ content: string, applied: boolean, source: 'client'|'server'|'none' }}
 */
function applyServerScopePrefix({ content, profile, userRole }) {
    const text = typeof content === 'string' ? content : '';
    if (hasGovernancePrefix(text)) {
        return { content: text, applied: false, source: 'client' };
    }
    const prefix = buildServerScopePrefix(profile, userRole);
    if (!prefix) {
        return { content: text, applied: false, source: 'none' };
    }
    return { content: prefix + text, applied: true, source: 'server' };
}

module.exports = {
    GOVERNANCE_HEADER,
    buildServerScopePrefix,
    hasGovernancePrefix,
    applyServerScopePrefix,
    // exported for tests
    __internals: { sanitizeIdentifierList, sanitizeTemplateValue, sanitizeInstructionText, applyTemplateVars },
};
