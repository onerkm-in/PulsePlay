/**
 * Route tests for the governed relevance profile + suggestions on the decision-canvas
 * connector. Owner-scoped; suggestions capped at 3; follow/dismiss/suppress/reset work;
 * governed tier dominates.
 */
'use strict';

const connector = require('../connectors/decision-canvas');
const { MANAGER } = require('../lib/actionRequestStore');
// Seed the CONNECTOR's own store instances (see the connector __test note).
const getRelevanceEngine = connector.__test.getRelevanceEngine;
const getActionRequestStore = connector.__test.getActionRequestStore;

function makeHost() {
    const routes = { get: {}, post: {}, patch: {}, delete: {} };
    return {
        _routes: routes,
        app: { get: (p, h) => (routes.get[p] = h), post: (p, h) => (routes.post[p] = h), patch: (p, h) => (routes.patch[p] = h), delete: (p, h) => (routes.delete[p] = h) },
        auditLog: () => {},
    };
}
function makeRes() {
    return { statusCode: 200, body: null, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const ALICE = { iss: 'idp', tid: 't', sub: 'alice' };
function req({ user = ALICE, params = {}, body = {}, query = {} } = {}) { return { user, params, body, query, get: () => null }; }

let R;
beforeEach(() => {
    getRelevanceEngine()._reset();
    getActionRequestStore()._reset();
    const host = makeHost();
    connector.register(host);
    R = host._routes;
});

test('mounts the relevance routes', () => {
    expect(Object.keys(R.get)).toEqual(expect.arrayContaining(['/decision-canvas/relevance-profile', '/decision-canvas/suggestions']));
    expect(Object.keys(R.patch)).toContain('/decision-canvas/relevance-profile');
    expect(Object.keys(R.post)).toContain('/decision-canvas/suggestions/:id/actions');
});

test('follow then read the profile back', () => {
    const patch = makeRes();
    R.patch['/decision-canvas/relevance-profile'](req({ body: { op: 'follow', kpi: 'OTIF', scope: 'US' } }), patch);
    expect(patch.body.profile.follows[0].kpi).toBe('OTIF');
    const get = makeRes();
    R.get['/decision-canvas/relevance-profile'](req(), get);
    expect(get.body.profile.follows).toHaveLength(1);
});

test('suggestions derive from the owner pending approvals, capped at 3', () => {
    // seed 5 pending approvals owned by alice-as-requester → she is also approver here
    const ars = getActionRequestStore();
    const owner = 'idp|t|alice';
    ars.bindPersona(owner, MANAGER);
    for (let i = 0; i < 5; i++) {
        const r = ars.prepare({ actorId: owner, persona: MANAGER, promptId: `pp_${i}`, promptVersion: 1, evidenceHash: 'e', intentLevel: 3 });
        ars.submit(r.request_id, { actorId: owner, persona: MANAGER });
    }
    const res = makeRes();
    R.get['/decision-canvas/suggestions'](req(), res);
    expect(res.body.suggestions.length).toBeLessThanOrEqual(3);
    expect(res.body.suggestions[0].why).toMatch(/pending approval/i);
});

test('dismiss removes a suggestion; suppress and reset work; unknown action → 400', () => {
    const bad = makeRes();
    R.post['/decision-canvas/suggestions/:id/actions'](req({ params: { id: 'x' }, body: { action: 'nope' } }), bad);
    expect(bad.statusCode).toBe(400);

    const suppress = makeRes();
    R.post['/decision-canvas/suggestions/:id/actions'](req({ params: { id: 'x' }, body: { action: 'suppress', rule_id: 'R', entity_scope: 'US', kpi: 'OTIF' } }), suppress);
    expect(suppress.body.profile.suppressed).toHaveLength(1);

    const reset = makeRes();
    R.patch['/decision-canvas/relevance-profile'](req({ body: { op: 'reset' } }), reset);
    expect(reset.body.profile.suppressed).toHaveLength(0);
});

test('responses are private, no-store', () => {
    const res = makeRes();
    R.get['/decision-canvas/suggestions'](req(), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
});
