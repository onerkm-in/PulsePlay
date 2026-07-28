/**
 * decisionPromptStore.js — Delta I/O for the Decision Assist prompt store.
 *
 * Reads governed Decision Prompts produced by the Python detection engine and
 * mediates prompt status transitions + the audit trail. All table coordinates
 * come from configuration (env-first), never hardcoded into a caller. Reuses the
 * proxy's own executeSqlStatement so it adds no new Databricks client.
 *
 * SQL literal safety: single quotes are doubled (Spark SQL), backslashes escaped.
 * This is the repository's verified convention and is locked by unit tests — do
 * not switch to backslash-quote escaping.
 */
'use strict';

const { executeSqlStatement } = require('./sqlExecutor');

const PROMPT_TABLE = process.env.AI_PROMPT_STORE || 'main.action_insights.decision_prompts';
const AUDIT_TABLE = process.env.AI_AUDIT_TABLE || 'main.action_insights.decision_audit';

function sq(v) {
    if (v === null || v === undefined) return 'NULL';
    return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function isPromptId(v) { return typeof v === 'string' && /^[0-9a-f]{16}$/.test(v); }

function hashPayload(obj) {
    // small non-crypto content hash for the logged-only action payload + audit id
    const s = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return `pl_${(h >>> 0).toString(16)}`;
}

async function runSql(profile, databricksRequest, sql) {
    return executeSqlStatement({ profile, sql, databricksRequest });
}

async function healthCount(profile, databricksRequest) {
    const r = await runSql(profile, databricksRequest, `SELECT COUNT(*) FROM ${PROMPT_TABLE}`);
    return Number(r.rows?.[0]?.[0] || 0);
}

async function listPrompts(profile, databricksRequest, { personaWhere = '' } = {}) {
    const sql = `SELECT prompt_id, rule_id, kpi, severity, confidence, confidence_score,
        headline, issue, root_cause, root_cause_category, recommended_action, action_code,
        action_level, approval_required, business_impact_value, business_impact_unit,
        business_impact_label, persona, owner, status, evidence_signature, evidence_sql,
        category, region, month_key, narrative
        FROM ${PROMPT_TABLE} ${personaWhere}
        ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                 WHEN 'medium' THEN 2 ELSE 3 END, confidence_score DESC`;
    const { columns, rows } = await runSql(profile, databricksRequest, sql);
    const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
    return rows.map((r) => {
        const row = {};
        for (const c of columns) row[c] = r[idx[c]];
        return row;
    });
}

async function loadPrompt(profile, databricksRequest, promptId) {
    // Authority columns first (status/approval drive the HITL verdict), then the
    // descriptive ones the owner notification needs — without them a
    // pending-approval alert said only "PRIORITY-MIX-003 / the owner" and
    // carried no headline, severity, or impact (live repro 2026-07-27). Read in
    // ONE query: a second round-trip would spend warehouse time per action.
    const { columns, rows } = await runSql(profile, databricksRequest,
        `SELECT rule_id, status, evidence_signature, approval_required, action_code,
                prompt_id, owner, severity, headline, business_impact_value, business_impact_unit
         FROM ${PROMPT_TABLE} WHERE prompt_id = ${sq(promptId)}`);
    if (!rows.length) return null;
    const i = Object.fromEntries(columns.map((c, k) => [c, k]));
    const at = (name) => (i[name] === undefined ? null : rows[0][i[name]]);
    return {
        rule_id: rows[0][i.rule_id], status: rows[0][i.status],
        evidence_signature: rows[0][i.evidence_signature],
        approval_required: rows[0][i.approval_required], action_code: rows[0][i.action_code],
        // descriptive (notification only — never used for authorization)
        prompt_id: at('prompt_id'), owner: at('owner'), severity: at('severity'),
        headline: at('headline'),
        business_impact_value: at('business_impact_value'),
        business_impact_unit: at('business_impact_unit'),
    };
}

async function updateStatus(profile, databricksRequest, promptId, newStatus) {
    await runSql(profile, databricksRequest,
        `UPDATE ${PROMPT_TABLE} SET status = ${sq(newStatus)}, updated_ts = current_timestamp()
         WHERE prompt_id = ${sq(promptId)}`);
}

async function writeAudit(profile, databricksRequest, ev) {
    const cols = 'event_id, prompt_id, user_id, persona, action, previous_status, new_status, '
        + 'rule_id, source_table, evidence_signature, permission_result, approval_required, '
        + 'rationale, request_payload_hash, request_status, event_ts';
    const eid = `evt_${hashPayload(ev)}`;
    const vals = [
        sq(eid), sq(ev.prompt_id), sq(ev.user_id), sq(ev.persona), sq(ev.action),
        sq(ev.previous_status), sq(ev.new_status), sq(ev.rule_id), sq(PROMPT_TABLE),
        sq(ev.evidence_signature), sq(ev.permission_result), ev.approval_required ? 'true' : 'false',
        sq(ev.rationale || null), sq(ev.request_payload_hash || null), sq(ev.request_status || null),
        'current_timestamp()',
    ].join(', ');
    await runSql(profile, databricksRequest, `INSERT INTO ${AUDIT_TABLE} (${cols}) VALUES (${vals})`);
    return eid;
}

module.exports = {
    PROMPT_TABLE, AUDIT_TABLE,
    sq, isPromptId, hashPayload,
    healthCount, listPrompts, loadPrompt, updateStatus, writeAudit,
};
