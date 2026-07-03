/**
 * actionInsights.js — Action Insights serving layer (topology T2).
 *
 * Reads governed Decision Prompts produced by the Python detection engine
 * (main.action_insights.decision_prompts) and mediates human actions
 * (trigger / approve / reject / snooze / false-positive) with server-side
 * permission enforcement, HITL status transitions, and a Delta audit trail.
 *
 * Design contract (matches docs/action-insights in the AgenticSolve repo):
 *   Rules detect. LLM explains. Humans approve. Systems execute. Everything audits.
 *   - MVP action ceiling = Level 3. Triggered actions are LOGGED-ONLY (no external send).
 *   - Persona/capabilities resolved server-side. Client persona is never trusted for
 *     authorization when a verified IdP role is present. Unauthorized → 403 + audit.
 *
 * This module reuses the proxy's own plumbing (resolveProfile, databricksRequest,
 * executeSqlStatement, auditLog) — passed in via register() — so it adds no new
 * Databricks client and honors existing auth/rate-limit/allowlist middleware.
 */

'use strict';

const { executeSqlStatement } = require('./sqlExecutor');

const PROMPT_TABLE = process.env.AI_PROMPT_STORE || 'main.action_insights.decision_prompts';
const AUDIT_TABLE = process.env.AI_AUDIT_TABLE || 'main.action_insights.decision_audit';
// Demo persona switching (header/query) is allowed unless explicitly disabled.
// In production set AI_ALLOW_DEMO_PERSONA=false so persona comes only from IdP roles.
const ALLOW_DEMO_PERSONA = process.env.AI_ALLOW_DEMO_PERSONA !== 'false';

const PLANNER = 'Supply Chain Planner';
const MANAGER = 'Supply Chain Manager';

// persona -> capability set (server-side source of truth)
const CAPABILITIES = {
    [PLANNER]: new Set([
        'can_view_prompts', 'can_view_evidence', 'can_trigger_request',
        'can_snooze', 'can_mark_false_positive',
    ]),
    [MANAGER]: new Set([
        'can_view_prompts', 'can_view_evidence', 'can_trigger_request',
        'can_snooze', 'can_mark_false_positive', 'can_approve_hitl', 'can_reject',
    ]),
};

// action code -> { capability required, resulting status (null = no status change), level }
const ACTIONS = {
    view_evidence:            { cap: 'can_view_evidence',       status: null,               level: 1 },
    snooze:                   { cap: 'can_snooze',              status: 'snoozed',          level: 1 },
    mark_false_positive:      { cap: 'can_mark_false_positive', status: 'false-positive',   level: 1 },
    reject:                   { cap: 'can_reject',              status: 'rejected',         level: 1 },
    approve:                  { cap: 'can_approve_hitl',        status: 'actioned',         level: 3 },
    trigger_supplier_review:  { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_replenishment:    { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_forecast_review:  { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_supplier_perf:    { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_inventory_review: { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
};
const MVP_ACTION_LEVEL_CEILING = 3;
const ACTIONABLE_FROM_NEW = new Set(['new', 'refreshed']);

// ── helpers ─────────────────────────────────────────────────────────────────
function sq(v) {
    if (v === null || v === undefined) return 'NULL';
    return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}
function isPromptId(v) { return typeof v === 'string' && /^[0-9a-f]{16}$/.test(v); }

function hashPayload(obj) {
    // small non-crypto content hash for the logged-only action payload
    const s = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return `pl_${(h >>> 0).toString(16)}`;
}

/**
 * Resolve persona from verified IdP roles first; fall back to a demo persona
 * only when no role is present AND demo switching is allowed. Client-supplied
 * persona is never trusted when a role exists.
 */
function resolvePersona(req) {
    const roles = (req.user && Array.isArray(req.user.roles)) ? req.user.roles : [];
    for (const r of roles) {
        const s = String(r).toLowerCase();
        if (/manager|approver|s&op|director|lead/.test(s)) return { persona: MANAGER, source: 'idp-role' };
        if (/planner|analyst|supply/.test(s)) return { persona: PLANNER, source: 'idp-role' };
    }
    if (ALLOW_DEMO_PERSONA) {
        const claimed = String(req.get('x-pp-persona') || req.query.persona || '').trim();
        if (claimed === MANAGER || claimed === PLANNER) return { persona: claimed, source: 'demo' };
    }
    return { persona: PLANNER, source: 'default' }; // least privilege
}

function caps(persona) { return CAPABILITIES[persona] || CAPABILITIES[PLANNER]; }

function allowedActionsFor(promptRow, persona) {
    const cap = caps(persona);
    const out = [];
    if (cap.has('can_view_evidence')) out.push('view_evidence');
    const status = promptRow.status;
    if (ACTIONABLE_FROM_NEW.has(status)) {
        // the prompt's own governed trigger action (from the rule)
        const triggerCode = promptRow.action_code;
        if (ACTIONS[triggerCode] && ACTIONS[triggerCode].cap === 'can_trigger_request'
            && cap.has('can_trigger_request')) out.push(triggerCode);
        if (cap.has('can_snooze')) out.push('snooze');
        if (cap.has('can_mark_false_positive')) out.push('mark_false_positive');
        if (cap.has('can_reject')) out.push('reject');
    } else if (status === 'pending-approval') {
        if (cap.has('can_approve_hitl')) out.push('approve');
        if (cap.has('can_reject')) out.push('reject');
    }
    return out;
}

async function runSql(profile, databricksRequest, sql) {
    return executeSqlStatement({ profile, sql, databricksRequest });
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

// ── route registration ────────────────────────────────────────────────────────
function register(app, deps) {
    const { resolveProfile, databricksRequest, auditLog, sendNoMatchingProfile } = deps;

    // GET /insights/action-insights/health — lightweight readiness
    app.get('/insights/action-insights/health', async (req, res) => {
        const resolved = resolveProfile(req.body, req.query, req.headers, req);
        if (!resolved) return sendNoMatchingProfile(req, res);
        try {
            const r = await runSql(resolved.profile, databricksRequest,
                `SELECT COUNT(*) FROM ${PROMPT_TABLE}`);
            return res.json({ ok: true, promptStore: PROMPT_TABLE, promptCount: Number(r.rows?.[0]?.[0] || 0) });
        } catch (err) {
            return res.status(503).json({ ok: false, error: String(err.message || err).slice(0, 200) });
        }
    });

    // GET /insights/action-insights — proactive prompt stack for the persona
    app.get('/insights/action-insights', async (req, res) => {
        const resolved = resolveProfile(req.body, req.query, req.headers, req);
        if (!resolved) return sendNoMatchingProfile(req, res);
        const { persona, source } = resolvePersona(req);
        const cap = caps(persona);
        if (!cap.has('can_view_prompts')) {
            auditLog(req, { action: 'action-insights.list', status: 403, detail: `persona=${persona}` });
            return res.status(403).json({ error: 'Not permitted to view Action Insights.' });
        }
        // Manager sees all; Planner sees own persona's prompts.
        const where = persona === MANAGER ? '' : `WHERE persona = ${sq(PLANNER)}`;
        const sql = `SELECT prompt_id, rule_id, kpi, severity, confidence, confidence_score,
            headline, issue, root_cause, root_cause_category, recommended_action, action_code,
            action_level, approval_required, business_impact_value, business_impact_unit,
            business_impact_label, persona, owner, status, evidence_signature, category, region,
            month_key, narrative
            FROM ${PROMPT_TABLE} ${where}
            ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                     WHEN 'medium' THEN 2 ELSE 3 END, confidence_score DESC`;
        try {
            const { columns, rows } = await runSql(resolved.profile, databricksRequest, sql);
            const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
            const prompts = rows.map((r) => {
                const row = {};
                for (const c of columns) row[c] = r[idx[c]];
                row.allowed_actions = allowedActionsFor(row, persona);
                return row;
            });
            auditLog(req, { action: 'action-insights.list', status: 200,
                detail: `persona=${persona} source=${source} n=${prompts.length}` });
            return res.json({
                ok: true, persona, personaSource: source,
                capabilities: [...cap], prompts,
            });
        } catch (err) {
            // Fail-safe: caller (UI) renders no Action Insights, existing screens unaffected.
            auditLog(req, { action: 'action-insights.list', status: 500,
                detail: String(err.message || err).slice(0, 160) });
            return res.status(500).json({ error: 'Action Insights fetch failed.', ok: false });
        }
    });

    // POST /insights/action-insights/:id/action — governed action (HITL, logged-only)
    app.post('/insights/action-insights/:id/action', async (req, res) => {
        const resolved = resolveProfile(req.body, req.query, req.headers, req);
        if (!resolved) return sendNoMatchingProfile(req, res);
        const promptId = String(req.params.id || '');
        const actionCode = String(req.body?.action || '');
        const rationale = req.body?.rationale ? String(req.body.rationale).slice(0, 1000) : null;
        const { persona } = resolvePersona(req);
        const userId = (req.user && (req.user.email || req.user.sub)) || 'anonymous';

        if (!isPromptId(promptId)) return res.status(400).json({ error: 'Invalid prompt id.' });
        const spec = ACTIONS[actionCode];
        if (!spec) return res.status(400).json({ error: `Unknown action: ${actionCode}` });
        if (spec.level > MVP_ACTION_LEVEL_CEILING) {
            return res.status(400).json({ error: 'Action exceeds MVP Level-3 ceiling.' });
        }

        // Load current prompt (source of truth for status + evidence).
        let promptRow;
        try {
            const { columns, rows } = await runSql(resolved.profile, databricksRequest,
                `SELECT rule_id, status, evidence_signature, approval_required, action_code
                 FROM ${PROMPT_TABLE} WHERE prompt_id = ${sq(promptId)}`);
            if (!rows.length) return res.status(404).json({ error: 'Prompt not found.' });
            const i = Object.fromEntries(columns.map((c, k) => [c, k]));
            promptRow = {
                rule_id: rows[0][i.rule_id], status: rows[0][i.status],
                evidence_signature: rows[0][i.evidence_signature],
                approval_required: rows[0][i.approval_required], action_code: rows[0][i.action_code],
            };
        } catch (err) {
            return res.status(500).json({ error: 'Failed to load prompt.', detail: String(err.message).slice(0, 160) });
        }

        // Server-side permission gate. Unauthorized → 403 + audit, NO state change.
        const permitted = caps(persona).has(spec.cap)
            && allowedActionsFor({ ...promptRow }, persona).includes(actionCode);
        if (!permitted) {
            await writeAudit(resolved.profile, databricksRequest, {
                prompt_id: promptId, user_id: userId, persona, action: actionCode,
                previous_status: promptRow.status, new_status: promptRow.status,
                rule_id: promptRow.rule_id, evidence_signature: promptRow.evidence_signature,
                permission_result: 'denied', approval_required: promptRow.approval_required,
                rationale, request_status: 'rejected',
            }).catch(() => {});
            auditLog(req, { action: 'action-insights.action', status: 403,
                detail: `persona=${persona} action=${actionCode}` });
            return res.status(403).json({ error: 'Not permitted for this persona/status.', ok: false });
        }

        // Apply (logged-only). Level-3 triggers prepare a payload but send nothing external.
        const newStatus = spec.status || promptRow.status;
        const payloadHash = spec.status === 'pending-approval'
            ? hashPayload({ promptId, actionCode, persona, rationale }) : null;
        try {
            if (spec.status) {
                await runSql(resolved.profile, databricksRequest,
                    `UPDATE ${PROMPT_TABLE} SET status = ${sq(newStatus)}, updated_ts = current_timestamp()
                     WHERE prompt_id = ${sq(promptId)}`);
            }
            await writeAudit(resolved.profile, databricksRequest, {
                prompt_id: promptId, user_id: userId, persona, action: actionCode,
                previous_status: promptRow.status, new_status: newStatus,
                rule_id: promptRow.rule_id, evidence_signature: promptRow.evidence_signature,
                permission_result: 'allowed', approval_required: promptRow.approval_required,
                rationale, request_payload_hash: payloadHash,
                request_status: spec.status === 'pending-approval' ? 'prepared-logged-only' : 'recorded',
            });
        } catch (err) {
            return res.status(500).json({ error: 'Action failed.', detail: String(err.message).slice(0, 160) });
        }
        auditLog(req, { action: 'action-insights.action', status: 200,
            detail: `persona=${persona} action=${actionCode} ${promptRow.status}->${newStatus}` });
        return res.json({
            ok: true, prompt_id: promptId, action: actionCode,
            previous_status: promptRow.status, status: newStatus,
            logged_only: spec.status === 'pending-approval',
        });
    });
}

module.exports = { register, __test: { resolvePersona, allowedActionsFor, ACTIONS, CAPABILITIES, sq, isPromptId } };
