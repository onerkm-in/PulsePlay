/**
 * Route-level tests for the event-sourced Action Request endpoints on the
 * decision-assist connector. Proves the full HTTP lifecycle + separation of duties
 * with distinct verified identities, plus forged-flag resistance.
 */
'use strict';

process.env.AI_ALLOW_DEMO_PERSONA = 'true'; // let the header pick persona in this test

const connector = require('../connectors/decision-assist');
const { getActionRequestStore } = require('../lib/actionRequestStore');

function makeHost() {
    const routes = { get: {}, post: {}, patch: {}, delete: {} };
    return {
        _routes: routes,
        app: {
            get(p, h) { routes.get[p] = h; }, post(p, h) { routes.post[p] = h; },
            patch(p, h) { routes.patch[p] = h; }, delete(p, h) { routes.delete[p] = h; },
        },
        auditLog: () => {},
        resolveProfile: () => ({ profile: {} }),
        databricksRequest: async () => ({}),
        sendNoMatchingProfile: (req, res) => res.status(503).json({}),
    };
}
function makeRes() {
    return { statusCode: 200, body: null, headers: {},
        set(k, v) { this.headers[k] = v; return this; },
        status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
// distinct identities; persona chosen by the demo header (server-resolved, not trusted body)
function planner(extra = {}) { return req({ user: { iss: 'idp', tid: 't', sub: 'alice' }, headers: { 'x-pp-persona': 'Supply Chain Planner' }, ...extra }); }
function manager(extra = {}) { return req({ user: { iss: 'idp', tid: 't', sub: 'bob' }, headers: { 'x-pp-persona': 'Supply Chain Manager' }, ...extra }); }
function req({ user, params = {}, body = {}, query = {}, headers = {} } = {}) {
    return { user, params, body, query, headers, get: (h) => headers[h.toLowerCase()] || headers[h] || null };
}

let R;
beforeEach(() => {
    getActionRequestStore()._reset();
    const host = makeHost();
    connector.register(host);
    R = host._routes;
});

function prepare(reqObj) {
    const res = makeRes();
    R.post['/decision-assist/prompts/:prompt_id/actions'](reqObj({ params: { prompt_id: 'pp_1' }, body: { action: 'prepare', intent_level: 3, expected_prompt_version: 3, expected_evidence_hash: 'ev1' } }), res);
    return res;
}

test('prepare creates an Action Request (201), server-derived requester', () => {
    const res = prepare(planner);
    expect(res.statusCode).toBe(201);
    expect(res.body.request.state).toBe('prepared');
    expect(res.body.request.requester_actor_id).toBe('idp|t|alice');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
});

test('full HTTP lifecycle: prepare → submit → approve → attest → outcome', () => {
    const rid = prepare(planner).body.request.request_id;
    const submit = makeRes();
    R.post['/decision-assist/action-requests/:request_id/actions'](planner({ params: { request_id: rid }, body: { action: 'submit' } }), submit);
    expect(submit.body.request.state).toBe('pending-approval');

    const decide = makeRes();
    R.post['/decision-assist/action-requests/:request_id/decisions'](manager({ params: { request_id: rid }, body: { decision: 'approve' } }), decide);
    expect(decide.body.request.state).toBe('approved-awaiting-implementation');

    const attest = makeRes();
    R.post['/decision-assist/action-requests/:request_id/actions'](planner({ params: { request_id: rid }, body: { action: 'attest-implemented', implemented_at: '2026-07-23T00:00:00.000Z', implementation_evidence_ref: 'ticket-9' } }), attest);
    expect(attest.body.request.state).toBe('logged-only-complete');

    const outcome = makeRes();
    R.post['/decision-assist/action-requests/:request_id/outcomes'](planner({ params: { request_id: rid }, body: { assessment: 'improved', baseline_kpi: 90, observed_kpi: 94 } }), outcome);
    expect(outcome.body.request.outcome.assessment).toBe('improved');
});

test('the requester cannot approve their own request (403 separation of duties)', () => {
    const rid = prepare(planner).body.request.request_id;
    R.post['/decision-assist/action-requests/:request_id/actions'](planner({ params: { request_id: rid }, body: { action: 'submit' } }), makeRes());
    // Alice tries to approve as a "manager" via forged header — same actor, blocked
    const res = makeRes();
    R.post['/decision-assist/action-requests/:request_id/decisions'](planner({ params: { request_id: rid }, headers: { 'x-pp-persona': 'Supply Chain Manager' }, body: { decision: 'approve' } }), res);
    // planner header keeps her a planner; even as manager the actor equals requester → 403
    expect(res.statusCode).toBe(403);
});

test('a planner cannot approve (403) — only a manager can', () => {
    const rid = prepare(planner).body.request.request_id;
    R.post['/decision-assist/action-requests/:request_id/actions'](planner({ params: { request_id: rid }, body: { action: 'submit' } }), makeRes());
    const res = makeRes();
    R.post['/decision-assist/action-requests/:request_id/decisions'](planner({ params: { request_id: rid }, body: { decision: 'approve' } }), res);
    expect(res.statusCode).toBe(403);
});

test('reject without rationale → 400; with rationale → rejected', () => {
    const rid = prepare(planner).body.request.request_id;
    R.post['/decision-assist/action-requests/:request_id/actions'](planner({ params: { request_id: rid }, body: { action: 'submit' } }), makeRes());
    const bad = makeRes();
    R.post['/decision-assist/action-requests/:request_id/decisions'](manager({ params: { request_id: rid }, body: { decision: 'reject' } }), bad);
    expect(bad.statusCode).toBe(400);
    const ok = makeRes();
    R.post['/decision-assist/action-requests/:request_id/decisions'](manager({ params: { request_id: rid }, body: { decision: 'reject', rationale: 'no' } }), ok);
    expect(ok.body.request.state).toBe('rejected');
});

test('approve twice: the second decision is a 409 invalid transition', () => {
    const rid = prepare(planner).body.request.request_id;
    R.post['/decision-assist/action-requests/:request_id/actions'](planner({ params: { request_id: rid }, body: { action: 'submit' } }), makeRes());
    R.post['/decision-assist/action-requests/:request_id/decisions'](manager({ params: { request_id: rid }, body: { decision: 'approve' } }), makeRes());
    const second = makeRes();
    R.post['/decision-assist/action-requests/:request_id/decisions'](manager({ params: { request_id: rid }, body: { decision: 'reject', rationale: 'race' } }), second);
    expect(second.statusCode).toBe(409);
});

test('GET action-requests returns the derived projection + events', () => {
    const rid = prepare(planner).body.request.request_id;
    const res = makeRes();
    R.get['/decision-assist/action-requests/:request_id'](planner({ params: { request_id: rid } }), res);
    expect(res.body.request.request_id).toBe(rid);
    expect(res.body.events[0].event_type).toBe('prepare');
});
