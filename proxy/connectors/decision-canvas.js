'use strict';

/**
 * decision-canvas.js — the My Decision Canvas persistence connector (v3.2 §9/§11).
 *
 * Mounts /decision-canvas/* for server-owned CanvasSections + snapshots. The owner
 * is ALWAYS derived server-side from the verified identity; the client never supplies
 * it, and cross-owner references return 404 (never revealing that another owner's
 * object exists). User-specific responses are private, no-store.
 *
 * Route-only connector (no BI profile), so matchProfile returns false. The store is
 * the process singleton from canvasStore.js (InMemory here; the Databricks adapter is
 * code-complete but its live tables are org-scoped + unreachable on this workspace).
 */

const { getCanvasStore, CanvasConflictError, CanvasNotFoundError } = require('../lib/canvasStore');
const { CanvasValidationError } = require('../lib/canvasSection');
const { getRelevanceEngine } = require('../lib/relevanceEngine');
const { getActionRequestStore } = require('../lib/actionRequestStore');

/** Immutable server-owned identity. In prod this is issuer+tenant+subject from a
 *  verified token; with no IdP locally every caller is one dev actor. Email/display
 *  names are never the ownership key. */
function ownerActorId(req) {
    const u = (req && req.user) || {};
    const iss = u.iss || u.issuer || 'dev';
    const tenant = u.tid || u.tenant_id || 'dev';
    const sub = u.sub || u.oid || u.email || 'dev-user';
    return `${iss}|${tenant}|${sub}`;
}

function noStore(res) { res.set('Cache-Control', 'private, no-store'); }

function sendErr(res, err) {
    const status = err && err.status ? err.status : 500;
    const body = { ok: false, error: (err && err.message) ? String(err.message).slice(0, 300) : 'error' };
    return res.status(status).json(body);
}

function toVersion(v) { return v === undefined || v === null || v === '' ? undefined : Number(v); }

function register(host) {
    const app = host.app;
    const audit = host.auditLog || (() => {});
    const store = getCanvasStore();

    app.get('/decision-canvas/health', (req, res) => {
        noStore(res);
        res.json({ ok: true, store: 'in-memory', owner: ownerActorId(req) });
    });

    // list own sections (optional ?save_state=pinned|bookmarked|pinned-and-bookmarked)
    app.get('/decision-canvas/sections', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        try {
            const sections = store.listSections(owner, { saveState: req.query.save_state });
            res.json({ ok: true, sections });
        } catch (err) { sendErr(res, err); }
    });

    app.get('/decision-canvas/sections/:id', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        const s = store.getSection(owner, String(req.params.id));
        if (!s) return res.status(404).json({ ok: false, error: 'Not found.' });
        res.json({ ok: true, section: s });
    });

    // create / pin a section from an eligible source (dedupe focuses an existing one)
    app.post('/decision-canvas/sections', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        try {
            const idempotencyKey = req.get && req.get('Idempotency-Key');
            const clientOperationId = req.body && req.body.client_operation_id;
            const result = store.createSection(owner, req.body && req.body.section, { idempotencyKey, clientOperationId });
            // an explicit save intent (pin/bookmark) applies on top of create
            const saveOp = req.body && req.body.save_op;
            let section = result.section;
            if (saveOp && ['pin', 'bookmark'].includes(saveOp)) {
                section = store.setSaveState(owner, section.section_id, saveOp, section.version);
            }
            audit(req, { action: 'canvas.section.create', status: 200, detail: `type=${section.type} deduped=${!!result.deduped}` });
            res.status(result.created ? 201 : 200).json({ ok: true, section, deduped: !!result.deduped, replayed: !!result.replayed });
        } catch (err) {
            if (err instanceof CanvasValidationError || err instanceof CanvasConflictError) return sendErr(res, err);
            sendErr(res, err);
        }
    });

    // mutate save-state / note / highlight / layout / tags via an action verb
    app.patch('/decision-canvas/sections/:id', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        const id = String(req.params.id);
        const action = req.body && req.body.action;
        const ev = toVersion(req.body && req.body.expected_version);
        try {
            let section;
            switch (action) {
                case 'pin': case 'unpin': case 'bookmark': case 'unbookmark':
                    section = store.setSaveState(owner, id, action, ev); break;
                case 'note':
                    section = store.setNote(owner, id, req.body.note, ev); break;
                case 'highlight':
                    section = store.setHighlight(owner, id, true, ev); break;
                case 'unhighlight':
                    section = store.setHighlight(owner, id, false, ev); break;
                case 'reorder': case 'group': case 'layout':
                    section = store.setLayout(owner, id, req.body.layout || {}, ev); break;
                case 'tags':
                    section = store.setTags(owner, id, req.body.tags, ev); break;
                default:
                    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
            }
            audit(req, { action: 'canvas.section.update', status: 200, detail: `${action} v${section.version}` });
            res.json({ ok: true, section });
        } catch (err) {
            if (err instanceof CanvasNotFoundError) return res.status(404).json({ ok: false, error: 'Not found.' });
            sendErr(res, err);
        }
    });

    app.delete('/decision-canvas/sections/:id', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        try {
            const ev = toVersion(req.query.expected_version);
            const r = store.deleteSection(owner, String(req.params.id), ev);
            audit(req, { action: 'canvas.section.delete', status: 200, detail: String(req.params.id) });
            res.json({ ok: true, ...r });
        } catch (err) {
            if (err instanceof CanvasNotFoundError) return res.status(404).json({ ok: false, error: 'Not found.' });
            sendErr(res, err);
        }
    });

    // ── snapshots ──────────────────────────────────────────────────────────────
    app.get('/decision-canvas/snapshots', (req, res) => {
        noStore(res);
        res.json({ ok: true, snapshots: store.listSnapshots(ownerActorId(req)) });
    });

    app.post('/decision-canvas/sections/:id/snapshots', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        try {
            const snap = store.createSnapshot(owner, { sectionId: String(req.params.id) });
            audit(req, { action: 'canvas.snapshot.create', status: 200, detail: snap.snapshot_id });
            res.status(201).json({ ok: true, snapshot: snap });
        } catch (err) {
            if (err instanceof CanvasNotFoundError) return res.status(404).json({ ok: false, error: 'Not found.' });
            sendErr(res, err);
        }
    });

    // snapshot an unsaved eligible source (creates a minimal backing section)
    app.post('/decision-canvas/snapshots', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        try {
            const snap = store.createSnapshot(owner, { proposed: req.body && req.body.section });
            res.status(201).json({ ok: true, snapshot: snap });
        } catch (err) { sendErr(res, err); }
    });

    app.get('/decision-canvas/snapshots/:id', (req, res) => {
        noStore(res);
        const snap = store.getSnapshot(ownerActorId(req), String(req.params.id));
        if (!snap) return res.status(404).json({ ok: false, error: 'Not found.' });
        res.json({ ok: true, snapshot: snap });
    });

    app.post('/decision-canvas/snapshots/:id/restore', (req, res) => {
        noStore(res);
        try {
            const r = store.restoreSnapshot(ownerActorId(req), String(req.params.id));
            res.json({ ok: true, ...r });
        } catch (err) {
            if (err instanceof CanvasNotFoundError) return res.status(404).json({ ok: false, error: 'Not found.' });
            sendErr(res, err);
        }
    });

    app.delete('/decision-canvas/snapshots/:id', (req, res) => {
        noStore(res);
        try {
            const r = store.deleteSnapshot(ownerActorId(req), String(req.params.id));
            res.json({ ok: true, ...r });
        } catch (err) {
            if (err instanceof CanvasNotFoundError) return res.status(404).json({ ok: false, error: 'Not found.' });
            sendErr(res, err);
        }
    });

    // ── governed relevance profile + suggestions (§14) ──────────────────────────
    const relevance = getRelevanceEngine();

    app.get('/decision-canvas/relevance-profile', (req, res) => {
        noStore(res);
        res.json({ ok: true, profile: relevance.profile(ownerActorId(req)) });
    });

    // explicit preference edits only (follow/unfollow). Never persona/permission/severity.
    app.patch('/decision-canvas/relevance-profile', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        const op = req.body && req.body.op;
        try {
            if (op === 'follow') relevance.follow(owner, String(req.body.kpi || ''), req.body.scope);
            else if (op === 'unfollow') relevance.unfollow(owner, String(req.body.kpi || ''), req.body.scope);
            else if (op === 'reset') relevance.reset(owner);
            else return res.status(400).json({ ok: false, error: 'op must be follow | unfollow | reset' });
            res.json({ ok: true, profile: relevance.profile(owner) });
        } catch (err) { sendErr(res, err); }
    });

    // at most 3 governed, explainable suggestions. Candidates are the caller's own
    // pending approvals + any server-eligible extras; ACL/scope pre-filtered by owner.
    app.get('/decision-canvas/suggestions', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        const candidates = buildCandidatesFor(owner);
        res.json({ ok: true, suggestions: relevance.suggest(owner, candidates) });
    });

    app.post('/decision-canvas/suggestions/:id/actions', (req, res) => {
        noStore(res);
        const owner = ownerActorId(req);
        const action = req.body && req.body.action;
        try {
            let out;
            switch (action) {
                case 'dismiss': out = relevance.dismiss(owner, String(req.body.content_hash || req.params.id)); break;
                case 'suppress': out = relevance.suppress(owner, req.body.rule_id, req.body.entity_scope, req.body.kpi); break;
                case 'follow': out = relevance.follow(owner, String(req.body.kpi || ''), req.body.scope); break;
                case 'correct': out = relevance.correct(owner, String(req.body.reason_key || '')); break;
                default: return res.status(400).json({ ok: false, error: 'action must be dismiss | suppress | follow | correct' });
            }
            res.json({ ok: true, ...out, profile: relevance.profile(owner) });
        } catch (err) { sendErr(res, err); }
    });
}

/** Build suggestion candidates for an owner from their pending Action Requests.
 *  Real + self-contained (no warehouse): each pending approval assigned to the owner
 *  becomes a governed candidate tagged related_to_pending_approval. */
function buildCandidatesFor(owner) {
    let requests = [];
    try {
        requests = getActionRequestStore().listRequests(owner, { state: 'pending-approval' });
    } catch { /* store may be empty */ }
    return requests.map((r) => ({
        content_hash: r.request_id,
        tier: 'overdue-approval',
        rule_id: r.prompt_id,
        entity_scope: null,
        kpi: 'decision',
        related_to_pending_approval: true,
        request_id: r.request_id,
    }));
}

module.exports = {
    id: 'decision-canvas',
    displayName: 'My Decision Canvas (persistence)',
    matchProfile() { return false; },
    register,
    // The connector's OWN store references, so tests seed the same instances the
    // routes read (avoids a jest module-registry quirk that can hand the same
    // require path two instances; in Node these are always one singleton).
    __test: { ownerActorId, getActionRequestStore, getRelevanceEngine, getCanvasStore },
};
