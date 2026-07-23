/**
 * actionRequestStore.js — event-sourced Action Requests (v3.2 §8).
 *
 * Decision Prompt state and Action Request state are SEPARATE. An L3 submission
 * creates a durable Action Request; the request's state is derived from an
 * append-only event log (the authoritative single-table event-sourced model,
 * `tbl_pp_decision_events`), never from an independently writable status column.
 *
 * This module is the in-memory runtime store on this workspace (the Delta table is
 * org-scoped + unreachable). It is NOT a mock: it enforces the full lifecycle,
 * separation of duties (requester != approver), authority per transition,
 * idempotency, optimistic concurrency, evidence-hash freshness, and the T+14
 * outcome — and every mutation appends an immutable audit event.
 *
 * The connector derives `actor_id` server-side and passes it in; this module never
 * trusts a client-supplied actor, role, level, or approval flag.
 */
'use strict';

const crypto = require('crypto');

// ── capability model (action-request lifecycle; distinct from the simpler
//    Action Insights capabilities in personaGate) ──────────────────────────────
const PLANNER = 'Supply Chain Planner';
const MANAGER = 'Operations Manager';

const CAPS = {
    [PLANNER]: new Set([
        'can_prepare_action', 'can_trigger_request', 'can_attest_implementation', 'can_record_outcome',
    ]),
    [MANAGER]: new Set([
        'can_prepare_action', 'can_trigger_request', 'can_approve_hitl', 'can_reject_hitl',
        'can_defer_hitl', 'can_modify_hitl', 'can_attest_implementation', 'can_record_outcome',
    ]),
};

// request lifecycle states (§8)
const STATES = Object.freeze([
    'prepared', 'prepared-complete', 'pending-approval', 'approved',
    'approved-awaiting-implementation', 'rejected', 'deferred', 'cancelled',
    'expired', 'logged-only-complete',
]);

const OUTCOME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

class RequestError extends Error {
    constructor(message, status = 400, code = 'REQUEST_ERROR') {
        super(message); this.name = 'RequestError'; this.status = status; this.code = code;
    }
}

function nowIso() { return new Date().toISOString(); }
function uuid() { return crypto.randomUUID(); }
function sha256(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex'); }

class ActionRequestStore {
    constructor() {
        this._events = [];            // append-only event log (authoritative)
        this._idem = new Map();       // idempotency_key -> { payloadHash, requestId }
        this._byRequest = new Map();  // request_id -> events[] (index; rebuildable cache)
    }

    capabilities(persona) { return CAPS[persona] || CAPS[PLANNER]; }

    _append(ev) {
        const event = { event_id: uuid(), event_ts: nowIso(), ...ev };
        this._events.push(event);
        if (!this._byRequest.has(event.request_id)) this._byRequest.set(event.request_id, []);
        this._byRequest.get(event.request_id).push(event);
        return event;
    }

    /** Derive the current request projection from its event log. */
    deriveRequest(requestId) {
        const evs = this._byRequest.get(requestId);
        if (!evs || !evs.length) return null;
        const first = evs[0];
        let state = first.new_state;
        let version = 0;
        let payload = first.payload || null;
        let evidence_hash = first.evidence_hash;
        let defer_until = null;
        let implemented_at = null;
        let outcome_due_at = null;
        let outcome = null;
        for (const e of evs) {
            state = e.new_state;
            if (e.event_type === 'modify') { version += 1; payload = e.payload || payload; evidence_hash = e.evidence_hash || evidence_hash; }
            if (e.event_type === 'defer') defer_until = e.defer_until || null;
            if (e.event_type === 'attest-implemented') { implemented_at = e.implemented_at; outcome_due_at = new Date(new Date(e.implemented_at).getTime() + OUTCOME_WINDOW_MS).toISOString(); }
            if (e.event_type === 'record-outcome') outcome = e.outcome || null;
        }
        return {
            request_id: requestId,
            prompt_id: first.prompt_id,
            prompt_version: first.prompt_version,
            intent_level: first.intent_level,
            requester_actor_id: first.actor_id,
            state,
            version,
            evidence_hash,
            payload,
            defer_until,
            implemented_at,
            outcome_due_at,
            outcome,
            created_at: first.event_ts,
            updated_at: evs[evs.length - 1].event_ts,
        };
    }

    listRequests(actorId, { state, due } = {}) {
        const ids = new Set();
        for (const e of this._events) ids.add(e.request_id);
        const out = [];
        for (const id of ids) {
            const r = this.deriveRequest(id);
            if (!r) continue;
            // an actor sees requests they raised or (for approvers) any pending one
            const isRequester = r.requester_actor_id === actorId;
            const isApprover = this.capabilities(this._personaOf(actorId)).has('can_approve_hitl');
            if (!isRequester && !isApprover) continue;
            if (state && r.state !== state) continue;
            if (due === 'outcome' && !(r.outcome_due_at && !r.outcome)) continue;
            out.push(r);
        }
        return out.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    }

    // persona lookup is provided by the connector via a side channel; default planner
    _personaOf(actorId) { return this._personaMap?.get(actorId) || PLANNER; }
    bindPersona(actorId, persona) {
        if (!this._personaMap) this._personaMap = new Map();
        this._personaMap.set(actorId, persona);
    }

    _idemGuard(idempotencyKey, payload) {
        if (!idempotencyKey) return null;
        const payloadHash = sha256(payload);
        const prior = this._idem.get(idempotencyKey);
        if (prior) {
            if (prior.payloadHash !== payloadHash) throw new RequestError('Idempotency key reused with a different payload', 409, 'IDEMPOTENCY_CONFLICT');
            return prior.requestId; // replay
        }
        return undefined; // new; caller records after
    }
    _idemRecord(idempotencyKey, payload, requestId) {
        if (idempotencyKey) this._idem.set(idempotencyKey, { payloadHash: sha256(payload), requestId });
    }

    /**
     * Prepare a new request. L2 ends terminal at prepared-complete; L3 is a resumable
     * `prepared` pre-submission state. Requires can_prepare_action.
     */
    prepare({ actorId, persona, promptId, promptVersion, evidenceHash, intentLevel, payload, idempotencyKey }) {
        if (!this.capabilities(persona).has('can_prepare_action')) throw new RequestError('Not permitted to prepare an action.', 403, 'FORBIDDEN');
        if (![2, 3].includes(intentLevel)) throw new RequestError('intent_level must be 2 or 3', 400);
        const replay = this._idemGuard(idempotencyKey, { op: 'prepare', promptId, promptVersion, intentLevel, actorId });
        if (replay) return this.deriveRequest(replay);
        const requestId = `req_${uuid()}`;
        const newState = intentLevel === 2 ? 'prepared-complete' : 'prepared';
        this._append({
            event_type: 'prepare', request_id: requestId, prompt_id: promptId, prompt_version: promptVersion,
            evidence_hash: evidenceHash, intent_level: intentLevel, actor_id: actorId, actor_type: 'human',
            persona, prev_state: null, new_state: newState, payload: payload || null,
            idempotency_key: idempotencyKey || null,
        });
        this._idemRecord(idempotencyKey, { op: 'prepare', promptId, promptVersion, intentLevel, actorId }, requestId);
        return this.deriveRequest(requestId);
    }

    /** Generic guarded transition with optimistic concurrency + evidence freshness. */
    _transition(requestId, { actorId, persona, capability, from, to, eventType, expectedVersion, evidenceHash, extra = {}, idempotencyKey, requireDifferentActor }) {
        const cur = this.deriveRequest(requestId);
        if (!cur) throw new RequestError('Request not found.', 404, 'NOT_FOUND');
        if (capability && !this.capabilities(persona).has(capability)) throw new RequestError('Not permitted for this action.', 403, 'FORBIDDEN');
        const allowedFrom = Array.isArray(from) ? from : [from];
        if (!allowedFrom.includes(cur.state)) throw new RequestError(`Cannot ${eventType} from state ${cur.state}.`, 409, 'INVALID_TRANSITION');
        if (expectedVersion !== undefined && Number(expectedVersion) !== cur.version) throw new RequestError('Stale request version.', 409, 'STALE_VERSION');
        if (evidenceHash !== undefined && evidenceHash !== cur.evidence_hash) throw new RequestError('Stale evidence hash.', 409, 'STALE_EVIDENCE');
        if (requireDifferentActor && cur.requester_actor_id === actorId) throw new RequestError('The requester cannot perform this action on their own request.', 403, 'SEPARATION_OF_DUTIES');
        const replay = this._idemGuard(idempotencyKey, { op: eventType, requestId, actorId, ...extra });
        if (replay) return this.deriveRequest(replay);
        this._append({
            event_type: eventType, request_id: requestId, prompt_id: cur.prompt_id, prompt_version: cur.prompt_version,
            evidence_hash: cur.evidence_hash, intent_level: cur.intent_level, actor_id: actorId, actor_type: 'human',
            persona, prev_state: cur.state, new_state: to, idempotency_key: idempotencyKey || null, ...extra,
        });
        this._idemRecord(idempotencyKey, { op: eventType, requestId, actorId, ...extra }, requestId);
        return this.deriveRequest(requestId);
    }

    submit(requestId, opts) {
        return this._transition(requestId, { ...opts, capability: 'can_trigger_request', from: ['prepared', 'deferred'], to: 'pending-approval', eventType: 'submit' });
    }
    approve(requestId, opts) {
        const r = this._transition(requestId, { ...opts, capability: 'can_approve_hitl', from: 'pending-approval', to: 'approved', eventType: 'approve', requireDifferentActor: true });
        // system transition: approved → approved-awaiting-implementation
        return this._transition(requestId, { actorId: 'system', persona: MANAGER, from: 'approved', to: 'approved-awaiting-implementation', eventType: 'assign-owner' });
    }
    reject(requestId, opts) {
        if (!opts.rationale) throw new RequestError('Reject requires a rationale.', 400);
        return this._transition(requestId, { ...opts, capability: 'can_reject_hitl', from: 'pending-approval', to: 'rejected', eventType: 'reject', requireDifferentActor: true, extra: { rationale: opts.rationale } });
    }
    defer(requestId, opts) {
        if (!opts.rationale || !opts.deferUntil) throw new RequestError('Defer requires a rationale and defer_until.', 400);
        return this._transition(requestId, { ...opts, capability: 'can_defer_hitl', from: 'pending-approval', to: 'deferred', eventType: 'defer', requireDifferentActor: true, extra: { rationale: opts.rationale, defer_until: opts.deferUntil } });
    }
    modify(requestId, opts) {
        if (!opts.payload) throw new RequestError('Modify requires a payload.', 400);
        // a modification creates a new immutable version and returns to pending-approval
        return this._transition(requestId, { ...opts, capability: 'can_modify_hitl', from: 'pending-approval', to: 'pending-approval', eventType: 'modify', requireDifferentActor: true, extra: { payload: opts.payload, evidence_hash: opts.evidenceHash } });
    }
    cancel(requestId, opts) {
        return this._transition(requestId, { ...opts, from: ['prepared', 'pending-approval', 'deferred'], to: 'cancelled', eventType: 'cancel' });
    }
    attestImplemented(requestId, opts) {
        if (!opts.implementedAt || !opts.evidenceRef) throw new RequestError('Attestation requires implemented_at and an evidence reference.', 400);
        return this._transition(requestId, { ...opts, capability: 'can_attest_implementation', from: 'approved-awaiting-implementation', to: 'logged-only-complete', eventType: 'attest-implemented', extra: { implemented_at: opts.implementedAt, implementation_evidence_ref: opts.evidenceRef } });
    }
    recordOutcome(requestId, opts) {
        const cur = this.deriveRequest(requestId);
        if (!cur) throw new RequestError('Request not found.', 404, 'NOT_FOUND');
        if (cur.state !== 'logged-only-complete') throw new RequestError('Outcome can only be recorded after implementation.', 409, 'INVALID_TRANSITION');
        if (!this.capabilities(opts.persona).has('can_record_outcome')) throw new RequestError('Not permitted to record an outcome.', 403, 'FORBIDDEN');
        const assessment = opts.outcome?.assessment;
        if (!['improved', 'no-change', 'worsened', 'unknown'].includes(assessment)) throw new RequestError('assessment must be improved|no-change|worsened|unknown', 400);
        this._append({
            event_type: 'record-outcome', request_id: requestId, prompt_id: cur.prompt_id, prompt_version: cur.prompt_version,
            evidence_hash: cur.evidence_hash, intent_level: cur.intent_level, actor_id: opts.actorId, actor_type: 'human',
            persona: opts.persona, prev_state: cur.state, new_state: cur.state, outcome: opts.outcome,
        });
        return this.deriveRequest(requestId);
    }

    /** The immutable audit trail (the event log itself). */
    events(requestId) { return (this._byRequest.get(requestId) || []).map((e) => ({ ...e })); }

    _reset() { this._events = []; this._idem.clear(); this._byRequest.clear(); this._personaMap = new Map(); }
}

let _store = null;
function getActionRequestStore() { if (!_store) _store = new ActionRequestStore(); return _store; }

module.exports = { ActionRequestStore, getActionRequestStore, RequestError, STATES, CAPS, PLANNER, MANAGER };
