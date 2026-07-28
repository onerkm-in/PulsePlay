'use strict';

/**
 * decision-assist.js — the Decision Assist drop-in connector.
 *
 * Mounts the governed Decision Prompt serving routes under /decision-assist/*:
 *   GET  /decision-assist/health          store readiness
 *   GET  /decision-assist/prompts         persona-filtered proactive stack
 *   POST /decision-assist/prompts/:id/action   HITL-gated action (logged-only)
 *
 * These are the same handlers behind the legacy /insights/action-insights routes
 * (mounted from server.js for the current UI), so authority and behavior can never
 * diverge between the two paths. Authority + I/O live in the reusable libs:
 *   personaGate.js · hitlGate.js · decisionPromptStore.js
 *
 * Route-only connector: it serves any warehouse-capable profile the request
 * resolves to, so matchProfile returns false (it claims no per-request dispatch).
 */

const actionInsights = require('../lib/actionInsights');
const store = require('../lib/decisionPromptStore');
const personaGate = require('../lib/personaGate');
const { getActionRequestStore, RequestError, PLANNER: AR_PLANNER, MANAGER: AR_MANAGER } = require('../lib/actionRequestStore');

/** Immutable server-owned actor identity (issuer|tenant|subject). */
function actorId(req) {
    const u = (req && req.user) || {};
    return `${u.iss || u.issuer || 'dev'}|${u.tid || u.tenant_id || 'dev'}|${u.sub || u.oid || u.email || 'dev-user'}`;
}
/** Map the resolved Action-Insights persona to the canonical Action-Request persona. */
function arPersona(req) {
    const { persona } = personaGate.resolvePersona(req);
    return persona === personaGate.MANAGER ? AR_MANAGER : AR_PLANNER;
}
function noStore(res) { res.set('Cache-Control', 'private, no-store'); }
function sendReqErr(res, err) {
    const status = err instanceof RequestError ? err.status : 500;
    return res.status(status).json({ ok: false, error: String(err.message || err).slice(0, 300), code: err.code });
}

function registerActionRequests(host) {
    const app = host.app;
    const audit = host.auditLog || (() => {});
    const ars = getActionRequestStore();

    const bind = (req) => {
        const id = actorId(req);
        const persona = arPersona(req);
        ars.bindPersona(id, persona);
        return { id, persona };
    };

    // create a durable Action Request from a prompt (prepare L2/L3)
    app.post('/decision-assist/prompts/:prompt_id/actions', (req, res) => {
        noStore(res);
        const { id, persona } = bind(req);
        try {
            const action = req.body?.action;
            if (action !== 'prepare') return res.status(400).json({ ok: false, error: 'Only prepare creates an Action Request here.' });
            const r = ars.prepare({
                actorId: id, persona, promptId: String(req.params.prompt_id),
                promptVersion: Number(req.body?.expected_prompt_version ?? 0),
                evidenceHash: req.body?.expected_evidence_hash, intentLevel: Number(req.body?.intent_level ?? 3),
                payload: req.body?.payload, idempotencyKey: req.get && req.get('Idempotency-Key'),
            });
            audit(req, { action: 'decision-assist.prepare', status: 200, detail: `req=${r.request_id} L${r.intent_level}` });
            res.status(201).json({ ok: true, request: r });
        } catch (err) { sendReqErr(res, err); }
    });

    app.get('/decision-assist/action-requests', (req, res) => {
        noStore(res);
        const { id } = bind(req);
        res.json({ ok: true, requests: ars.listRequests(id, { state: req.query.state, due: req.query.due }) });
    });

    app.get('/decision-assist/action-requests/:request_id', (req, res) => {
        noStore(res);
        bind(req);
        const r = ars.deriveRequest(String(req.params.request_id));
        if (!r) return res.status(404).json({ ok: false, error: 'Not found.' });
        res.json({ ok: true, request: r, events: ars.events(r.request_id) });
    });

    // requester-scoped transitions
    app.post('/decision-assist/action-requests/:request_id/actions', (req, res) => {
        noStore(res);
        const { id, persona } = bind(req);
        const rid = String(req.params.request_id);
        const opts = { actorId: id, persona, expectedVersion: req.body?.expected_request_version, evidenceHash: req.body?.expected_evidence_hash, idempotencyKey: req.get && req.get('Idempotency-Key') };
        try {
            let r;
            switch (req.body?.action) {
                case 'submit': case 'resubmit': r = ars.submit(rid, opts); break;
                case 'cancel': r = ars.cancel(rid, opts); break;
                case 'attest-implemented':
                    r = ars.attestImplemented(rid, { ...opts, implementedAt: req.body?.implemented_at, evidenceRef: req.body?.implementation_evidence_ref }); break;
                default: return res.status(400).json({ ok: false, error: `Unknown action: ${req.body?.action}` });
            }
            audit(req, { action: 'decision-assist.request.action', status: 200, detail: `${req.body.action} ${r.state}` });
            res.json({ ok: true, request: r });
        } catch (err) { sendReqErr(res, err); }
    });

    // approver-scoped decisions
    app.post('/decision-assist/action-requests/:request_id/decisions', (req, res) => {
        noStore(res);
        const { id, persona } = bind(req);
        const rid = String(req.params.request_id);
        const opts = { actorId: id, persona, expectedVersion: req.body?.expected_request_version, evidenceHash: req.body?.expected_evidence_hash, rationale: req.body?.rationale, deferUntil: req.body?.defer_until, payload: req.body?.modified_payload };
        try {
            let r;
            switch (req.body?.decision) {
                case 'approve': r = ars.approve(rid, opts); break;
                case 'reject': r = ars.reject(rid, opts); break;
                case 'defer': r = ars.defer(rid, opts); break;
                case 'modify': r = ars.modify(rid, opts); break;
                default: return res.status(400).json({ ok: false, error: `Unknown decision: ${req.body?.decision}` });
            }
            audit(req, { action: 'decision-assist.request.decision', status: 200, detail: `${req.body.decision} ${r.state}` });
            res.json({ ok: true, request: r });
        } catch (err) { sendReqErr(res, err); }
    });

    app.post('/decision-assist/action-requests/:request_id/outcomes', (req, res) => {
        noStore(res);
        const { id, persona } = bind(req);
        try {
            const r = ars.recordOutcome(String(req.params.request_id), {
                actorId: id, persona,
                outcome: {
                    assessment: req.body?.assessment, baseline_kpi: req.body?.baseline_kpi,
                    observed_kpi: req.body?.observed_kpi, evidence_ref: req.body?.evidence_ref, note: req.body?.note,
                },
            });
            res.json({ ok: true, request: r });
        } catch (err) { sendReqErr(res, err); }
    });
}

module.exports = {
    id: 'decision-assist',
    displayName: 'Decision Assist (Action Insights)',

    // Not a profile-owning backend — it serves prompts for whatever profile the
    // request resolves to. So it never claims a profile in per-request dispatch.
    matchProfile() {
        return false;
    },

    register(host) {
        const deps = {
            resolveProfile: host.resolveProfile,
            databricksRequest: host.databricksRequest,
            auditLog: host.auditLog,
            sendNoMatchingProfile: host.sendNoMatchingProfile,
            // See server.js: needed for owner notification on pending-approval.
            cfg: host.cfg,
        };
        actionInsights.mount(host.app, deps, {
            health: '/decision-assist/health',
            list: '/decision-assist/prompts',
            action: '/decision-assist/prompts/:id/action',
        });
        registerActionRequests(host);
    },

    // Convenience export for a health surface / tests — reports the store table.
    __meta: { promptStore: store.PROMPT_TABLE, auditStore: store.AUDIT_TABLE },
    __test: { actorId, arPersona },
};
