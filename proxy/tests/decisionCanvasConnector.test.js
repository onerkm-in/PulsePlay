/**
 * Integration + negative-security tests for the /decision-canvas connector.
 * Exercises the real handlers against the in-memory store with distinct verified
 * identities, proving server-derived ownership + cross-user isolation, optimistic
 * concurrency (409), idempotency, dedupe, and the save/snapshot lifecycle.
 */
'use strict';

const connector = require('../connectors/decision-canvas');
const { getCanvasStore } = require('../lib/canvasStore');

function makeHost() {
    const routes = { get: {}, post: {}, patch: {}, delete: {} };
    return {
        _routes: routes,
        app: {
            get(p, h) { routes.get[p] = h; },
            post(p, h) { routes.post[p] = h; },
            patch(p, h) { routes.patch[p] = h; },
            delete(p, h) { routes.delete[p] = h; },
        },
        auditLog: () => {},
    };
}
function makeRes() {
    return {
        statusCode: 200, body: null, headers: {},
        set(k, v) { this.headers[k] = v; return this; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}
function req({ user, params = {}, body = {}, query = {}, headers = {} } = {}) {
    return { user, params, body, query, headers, get: (h) => headers[h.toLowerCase()] || headers[h] || null };
}

const ALICE = { iss: 'https://idp', tid: 't1', sub: 'alice' };
const BOB = { iss: 'https://idp', tid: 't1', sub: 'bob' };

function proposedBody() {
    return {
        section: {
            type: 'decision_prompt',
            title: 'OTIF below target',
            source: { surface: 'action-insights', prompt_id: 'pp_1' },
            provenance: { data_as_of: '2026-07-23' },
        },
    };
}

let R;
beforeEach(() => {
    getCanvasStore()._reset();
    const host = makeHost();
    connector.register(host);
    R = host._routes;
});

test('connector mounts the documented routes', () => {
    expect(Object.keys(R.get)).toEqual(expect.arrayContaining([
        '/decision-canvas/health', '/decision-canvas/sections', '/decision-canvas/snapshots']));
    expect(Object.keys(R.post)).toEqual(expect.arrayContaining([
        '/decision-canvas/sections', '/decision-canvas/sections/:id/snapshots', '/decision-canvas/snapshots/:id/restore']));
    expect(Object.keys(R.patch)).toContain('/decision-canvas/sections/:id');
    expect(Object.keys(R.delete)).toContain('/decision-canvas/sections/:id');
});

test('responses are private, no-store', () => {
    const res = makeRes();
    R.get['/decision-canvas/sections'](req({ user: ALICE }), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
});

test('create returns 201 and a server-owned section; client owner is ignored', () => {
    const res = makeRes();
    const body = proposedBody();
    body.section.owner_actor_id = 'https://idp|t1|attacker';
    R.post['/decision-canvas/sections'](req({ user: ALICE, body }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.section.owner_actor_id).toBe('https://idp|t1|alice');
});

describe('cross-user isolation (negative security)', () => {
    let sectionId;
    beforeEach(() => {
        const res = makeRes();
        R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody() }), res);
        sectionId = res.body.section.section_id;
    });

    test("Bob cannot read Alice's section (404, existence not revealed)", () => {
        const res = makeRes();
        R.get['/decision-canvas/sections/:id'](req({ user: BOB, params: { id: sectionId } }), res);
        expect(res.statusCode).toBe(404);
    });

    test("Bob cannot pin Alice's section (404)", () => {
        const res = makeRes();
        R.patch['/decision-canvas/sections/:id'](req({ user: BOB, params: { id: sectionId }, body: { action: 'pin', expected_version: 0 } }), res);
        expect(res.statusCode).toBe(404);
    });

    test("Bob cannot delete Alice's section (404); Alice's list still has it", () => {
        const del = makeRes();
        R.delete['/decision-canvas/sections/:id'](req({ user: BOB, params: { id: sectionId }, query: {} }), del);
        expect(del.statusCode).toBe(404);
        const list = makeRes();
        R.get['/decision-canvas/sections'](req({ user: ALICE }), list);
        expect(list.body.sections).toHaveLength(1);
    });

    test("Bob's list never contains Alice's section", () => {
        const res = makeRes();
        R.get['/decision-canvas/sections'](req({ user: BOB }), res);
        expect(res.body.sections).toHaveLength(0);
    });
});

describe('governance', () => {
    test('dedupe: pinning the same source twice does not duplicate', () => {
        const a = makeRes(); R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody() }), a);
        const b = makeRes(); R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody() }), b);
        expect(b.body.deduped).toBe(true);
        expect(b.body.section.section_id).toBe(a.body.section.section_id);
    });

    test('optimistic concurrency: stale expected_version → 409', () => {
        const c = makeRes(); R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody() }), c);
        const id = c.body.section.section_id;
        R.patch['/decision-canvas/sections/:id'](req({ user: ALICE, params: { id }, body: { action: 'pin', expected_version: 0 } }), makeRes());
        const stale = makeRes();
        R.patch['/decision-canvas/sections/:id'](req({ user: ALICE, params: { id }, body: { action: 'bookmark', expected_version: 0 } }), stale);
        expect(stale.statusCode).toBe(409);
    });

    test('idempotency: same key replays without duplicating', () => {
        const a = makeRes(); R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody(), headers: { 'idempotency-key': 'K' } }), a);
        const b = makeRes(); R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody(), headers: { 'idempotency-key': 'K' } }), b);
        expect(b.body.section.section_id).toBe(a.body.section.section_id);
    });

    test('unknown action → 400', () => {
        const c = makeRes(); R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody() }), c);
        const res = makeRes();
        R.patch['/decision-canvas/sections/:id'](req({ user: ALICE, params: { id: c.body.section.section_id }, body: { action: 'destroy' } }), res);
        expect(res.statusCode).toBe(400);
    });

    test('ineligible type is rejected (400)', () => {
        const res = makeRes();
        R.post['/decision-canvas/sections'](req({ user: ALICE, body: { section: { type: 'iframe_html', title: 'x' } } }), res);
        expect(res.statusCode).toBe(400);
    });
});

describe('snapshot lifecycle', () => {
    test('snapshot then restore reports current; Bob cannot restore', () => {
        const c = makeRes(); R.post['/decision-canvas/sections'](req({ user: ALICE, body: proposedBody() }), c);
        const id = c.body.section.section_id;
        const snap = makeRes(); R.post['/decision-canvas/sections/:id/snapshots'](req({ user: ALICE, params: { id } }), snap);
        expect(snap.statusCode).toBe(201);
        const snapId = snap.body.snapshot.snapshot_id;
        const restore = makeRes(); R.post['/decision-canvas/snapshots/:id/restore'](req({ user: ALICE, params: { id: snapId } }), restore);
        expect(restore.body.freshness).toBe('current');
        const bob = makeRes(); R.post['/decision-canvas/snapshots/:id/restore'](req({ user: BOB, params: { id: snapId } }), bob);
        expect(bob.statusCode).toBe(404);
    });
});
