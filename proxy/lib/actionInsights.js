/**
 * actionInsights.js — Action Insights / Decision Assist serving layer (topology T2).
 *
 * Reads governed Decision Prompts produced by the Python detection engine and
 * mediates human actions (trigger / approve / reject / snooze / false-positive)
 * with server-side permission enforcement, HITL status transitions, and a Delta
 * audit trail.
 *
 * Design contract:
 *   Rules detect. Governed config recommends. LLMs explain. Humans approve.
 *   Everything audits.
 *   - MVP action ceiling = Level 3. Triggered actions are logged-only (no external send).
 *   - Persona/capabilities resolved server-side (personaGate). Client persona is never
 *     trusted for authorization when a verified IdP role is present. Unauthorized -> 403 + audit.
 *
 * Authority + I/O are split into reusable libs so the same handlers serve both the
 * legacy /insights/action-insights routes and the drop-in /decision-assist connector:
 *   - personaGate.js      persona + capability policy (server-owned authority)
 *   - hitlGate.js         the governed action verdict (invalid / ceiling / denied / allow)
 *   - decisionPromptStore.js  Delta reads, status updates, audit writes (config-driven tables)
 */
'use strict';

const personaGate = require('./personaGate');
const hitlGate = require('./hitlGate');
const notifier = require('./decisionNotifier');
const store = require('./decisionPromptStore');

const { PLANNER, MANAGER, resolvePersona, caps, allowedActionsFor, describePersonaSwitch } = personaGate;

/** GET handler: proactive prompt stack filtered to the resolved persona. */
function makeListHandler(deps) {
    const { resolveProfile, databricksRequest, auditLog, sendNoMatchingProfile } = deps;
    return async function listHandler(req, res) {
        const resolved = resolveProfile(req.body, req.query, req.headers, req);
        if (!resolved) return sendNoMatchingProfile(req, res);
        const { persona, source } = resolvePersona(req);
        const cap = caps(persona);
        if (!cap.has('can_view_prompts')) {
            auditLog(req, { action: 'action-insights.list', status: 403, detail: `persona=${persona}` });
            return res.status(403).json({ error: 'Not permitted to view Action Insights.' });
        }
        // Decisions run on the governed Databricks decision store (a Delta table
        // on a SQL warehouse). A connector without a Databricks warehouse — e.g.
        // a Power BI semantic-model profile — cannot query it. Degrade
        // gracefully with a clear notice instead of leaking a raw HTTP 500.
        const dbxHost = String(resolved.profile.host || '');
        const warehouseId = String(resolved.profile.warehouseId || resolved.profile.warehouse_id || '');
        const isDatabricksBacked = /databricks/i.test(dbxHost) && !!warehouseId;
        if (!isDatabricksBacked) {
            auditLog(req, { action: 'action-insights.list', status: 200, detail: `unavailable profile=${resolved.name}` });
            return res.json({
                ok: false,
                unavailable: true,
                persona,
                personaSource: source,
                capabilities: [...cap],
                personaSwitch: describePersonaSwitch(req),
                prompts: [],
                notice: `Decisions run on the governed Databricks decision store. The active connector "${resolved.name}" has no Databricks warehouse, so there are no decision prompts to show here. Switch to a Databricks/Genie connector to use Decisions.`,
            });
        }
        // Manager sees all; Planner sees own persona's prompts.
        // Domain scope: a deployment can declare which rule family its
        // decision feed shows (profile `decisionRulePrefix`, e.g. "SCM-").
        // The store may hold prompts from several demo domains; without the
        // scope a supply-chain cockpit surfaced customer-support SLA cards
        // (user 2026-07-29: "our source should be our synthetic data only,
        // that too supply chain"). Filtered at the QUERY - never deleted
        // (decision_prompts is append-audit, bulk deletes are forbidden).
        const rawPrefix = String(resolved.profile.decisionRulePrefix || '').trim();
        const rulePrefix = /^[A-Za-z0-9_-]{1,32}$/.test(rawPrefix) ? rawPrefix : '';
        const clauses = [];
        if (persona !== MANAGER) clauses.push(`persona = ${store.sq(PLANNER)}`);
        if (rulePrefix) clauses.push(`rule_id LIKE ${store.sq(rulePrefix + '%')}`);
        const personaWhere = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        try {
            const prompts = await store.listPrompts(resolved.profile, databricksRequest, { personaWhere });
            for (const row of prompts) row.allowed_actions = allowedActionsFor(row, persona);
            auditLog(req, { action: 'action-insights.list', status: 200,
                detail: `persona=${persona} source=${source} n=${prompts.length}` });
            return res.json({ ok: true, persona, personaSource: source, capabilities: [...cap], personaSwitch: describePersonaSwitch(req), prompts });
        } catch (err) {
            // Fail-safe: caller (UI) renders no Action Insights, existing screens unaffected.
            auditLog(req, { action: 'action-insights.list', status: 500,
                detail: String(err.message || err).slice(0, 160) });
            return res.status(500).json({ error: 'Action Insights fetch failed.', ok: false });
        }
    };
}

/** POST handler: governed action, HITL-gated, logged-only. */
function makeActionHandler(deps) {
    const { resolveProfile, databricksRequest, auditLog, sendNoMatchingProfile } = deps;
    return async function actionHandler(req, res) {
        const resolved = resolveProfile(req.body, req.query, req.headers, req);
        if (!resolved) return sendNoMatchingProfile(req, res);
        const promptId = String(req.params.id || '');
        const actionCode = String(req.body?.action || '');
        const rationale = req.body?.rationale ? String(req.body.rationale).slice(0, 1000) : null;
        const { persona } = resolvePersona(req);
        const userId = (req.user && (req.user.email || req.user.sub)) || 'anonymous';

        if (!store.isPromptId(promptId)) return res.status(400).json({ error: 'Invalid prompt id.' });

        // Load current prompt (server-side source of truth for status + evidence).
        let promptRow;
        try {
            promptRow = await store.loadPrompt(resolved.profile, databricksRequest, promptId);
            if (!promptRow) return res.status(404).json({ error: 'Prompt not found.' });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to load prompt.', detail: String(err.message).slice(0, 160) });
        }

        // Governed verdict — authority derived from the stored prompt + persona policy.
        const verdict = hitlGate.evaluate(promptRow, persona, actionCode);
        if (verdict.decision === 'invalid-action') {
            return res.status(400).json({ error: `Unknown action: ${actionCode}` });
        }
        if (verdict.decision === 'exceeds-ceiling') {
            return res.status(400).json({ error: 'Action exceeds MVP Level-3 ceiling.' });
        }
        if (verdict.decision === 'denied') {
            await store.writeAudit(resolved.profile, databricksRequest, {
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
        const newStatus = verdict.newStatus;
        const payloadHash = verdict.loggedOnly
            ? store.hashPayload({ promptId, actionCode, persona, rationale }) : null;
        try {
            if (verdict.spec.status) {
                await store.updateStatus(resolved.profile, databricksRequest, promptId, newStatus);
            }
            await store.writeAudit(resolved.profile, databricksRequest, {
                prompt_id: promptId, user_id: userId, persona, action: actionCode,
                previous_status: promptRow.status, new_status: newStatus,
                rule_id: promptRow.rule_id, evidence_signature: promptRow.evidence_signature,
                permission_result: 'allowed', approval_required: promptRow.approval_required,
                rationale, request_payload_hash: payloadHash,
                request_status: verdict.loggedOnly ? 'prepared-logged-only' : 'recorded',
            });
        } catch (err) {
            return res.status(500).json({ error: 'Action failed.', detail: String(err.message).slice(0, 160) });
        }
        auditLog(req, { action: 'action-insights.action', status: 200,
            detail: `persona=${persona} action=${actionCode} ${promptRow.status}->${newStatus}` });

        // Close the loop: tell the OWNER something is waiting on them. Until now
        // an approval request was silent — the prompt moved to pending-approval
        // and sat there until someone happened to open Decisions. Dispatched
        // AFTER the state change is committed and deliberately non-fatal: a dead
        // webhook must never fail an action the store already accepted.
        let notified = null;
        if (newStatus === 'pending-approval') {
            try {
                notified = await notifier.notifyPendingApproval({
                    cfg: deps.cfg ? deps.cfg() : null,
                    profile: resolved.profile,
                    prompt: promptRow,
                    requestedBy: userId,
                    persona,
                    actionCode,
                });
            } catch (err) {
                notified = { delivered: false, channel: 'unknown', detail: String(err && err.message).slice(0, 120) };
            }
            auditLog(req, {
                action: 'action-insights.notify',
                status: notified.delivered ? 200 : 202,
                detail: `channel=${notified.channel} delivered=${notified.delivered} ${notified.detail}`,
            });
        }

        return res.json({
            ok: true, prompt_id: promptId, action: actionCode,
            previous_status: promptRow.status, status: newStatus,
            logged_only: verdict.loggedOnly,
            ...(notified ? { notification: { channel: notified.channel, delivered: notified.delivered } } : {}),
        });
    };
}

/** GET handler: lightweight readiness of the prompt store. */
function makeHealthHandler(deps) {
    const { resolveProfile, databricksRequest, sendNoMatchingProfile } = deps;
    return async function healthHandler(req, res) {
        const resolved = resolveProfile(req.body, req.query, req.headers, req);
        if (!resolved) return sendNoMatchingProfile(req, res);
        try {
            const promptCount = await store.healthCount(resolved.profile, databricksRequest);
            return res.json({ ok: true, promptStore: store.PROMPT_TABLE, promptCount });
        } catch (err) {
            return res.status(503).json({ ok: false, error: String(err.message || err).slice(0, 200) });
        }
    };
}

/** Mount the handlers on a given base path. Used by both the legacy route set
 *  and the /decision-assist drop-in connector so behavior can never diverge. */
function mount(app, deps, basePaths) {
    app.get(basePaths.health, makeHealthHandler(deps));
    app.get(basePaths.list, makeListHandler(deps));
    app.post(basePaths.action, makeActionHandler(deps));
}

// Legacy registration — keeps the /insights/action-insights routes the current UI calls.
function register(app, deps) {
    mount(app, deps, {
        health: '/insights/action-insights/health',
        list: '/insights/action-insights',
        action: '/insights/action-insights/:id/action',
    });
}

module.exports = {
    register, mount,
    makeListHandler, makeActionHandler, makeHealthHandler,
    // Back-compat test surface — now sourced from the extracted authority libs.
    __test: {
        resolvePersona, allowedActionsFor,
        ACTIONS: personaGate.ACTIONS, CAPABILITIES: personaGate.CAPABILITIES,
        sq: store.sq, isPromptId: store.isPromptId,
    },
};
