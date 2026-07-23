/**
 * Governed author-selectable interface mode (v3.2 §10).
 * Proves: fail-safe segregated default, author-gated publish, optimistic
 * concurrency, kill switch, and that the served mode never comes from the client.
 */
'use strict';

const mod = require('../lib/experienceConfig');

function makeApp() {
    const routes = { get: {}, put: {} };
    return {
        _routes: routes,
        get(p, h) { routes.get[p] = h; },
        put(p, h) { routes.put[p] = h; },
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
function makeReq({ body = {}, user = {} } = {}) { return { body, user }; }

const deps = { auditLog: () => {} };

function mount() {
    const app = makeApp();
    mod.register(app, deps);
    return app._routes;
}

beforeEach(() => {
    mod.__test.reset();
    delete process.env.PP_EXPERIENCE_KILLSWITCH;
    delete process.env.PP_REQUIRE_AUTHOR_ROLE;
});
afterAll(() => mod.__test.reset());

describe('fail-safe + resolution', () => {
    test('defaults to segregated when nothing is published', () => {
        const r = mount();
        const res = makeRes();
        r.get['/experience/config'](makeReq(), res);
        expect(res.body.served_mode).toBe('segregated');
        expect(res.body.published_mode).toBe('segregated');
        expect(res.body.version).toBe(0);
        expect(res.headers['Cache-Control']).toBe('no-store');
    });

    test('kill switch forces segregated even after combined is published', () => {
        const r = mount();
        r.put['/experience/config'](makeReq({ body: { mode: 'combined' } }), makeRes());
        process.env.PP_EXPERIENCE_KILLSWITCH = 'segregated';
        const res = makeRes();
        r.get['/experience/config'](makeReq(), res);
        expect(res.body.served_mode).toBe('segregated');
        expect(res.body.published_mode).toBe('combined'); // published unchanged
        expect(res.body.kill_switch).toBe(true);
    });
});

describe('author-gated publish', () => {
    test('publishing combined updates served mode + bumps version', () => {
        const r = mount();
        const res = makeRes();
        r.put['/experience/config'](makeReq({ body: { mode: 'combined' } }), res);
        expect(res.statusCode).toBe(200);
        expect(res.body.served_mode).toBe('combined');
        expect(res.body.version).toBe(1);
    });

    test('a non-author (IdP roles present, none authoring) gets 403', () => {
        const r = mount();
        const res = makeRes();
        r.put['/experience/config'](makeReq({ body: { mode: 'combined' }, user: { roles: ['Supply Chain Planner'] } }), res);
        expect(res.statusCode).toBe(403);
        // served mode unchanged
        const g = makeRes();
        r.get['/experience/config'](makeReq(), g);
        expect(g.body.served_mode).toBe('segregated');
    });

    test('with PP_REQUIRE_AUTHOR_ROLE, an identity-less caller cannot publish', () => {
        process.env.PP_REQUIRE_AUTHOR_ROLE = 'true';
        const r = mount();
        const res = makeRes();
        r.put['/experience/config'](makeReq({ body: { mode: 'combined' } }), res);
        expect(res.statusCode).toBe(403);
    });

    test('an author role can publish', () => {
        const r = mount();
        const res = makeRes();
        r.put['/experience/config'](makeReq({ body: { mode: 'combined' }, user: { roles: ['Experience Author'], email: 'a@x.com' } }), res);
        expect(res.statusCode).toBe(200);
        expect(res.body.served_mode).toBe('combined');
    });
});

describe('validation + concurrency', () => {
    test('rejects an unknown mode', () => {
        const r = mount();
        const res = makeRes();
        r.put['/experience/config'](makeReq({ body: { mode: 'fancy' } }), res);
        expect(res.statusCode).toBe(400);
    });

    test('stale expected_version returns 409', () => {
        const r = mount();
        r.put['/experience/config'](makeReq({ body: { mode: 'combined' } }), makeRes()); // version → 1
        const res = makeRes();
        r.put['/experience/config'](makeReq({ body: { mode: 'segregated', expected_version: 0 } }), res);
        expect(res.statusCode).toBe(409);
    });

    test('resolvePublishedMode is the single source of truth (never from client)', () => {
        mount();
        expect(mod.resolvePublishedMode()).toBe('segregated');
    });
});
