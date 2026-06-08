'use strict';

/**
 * connectorRegistry.test.js — Phase A (scaffolding) of the connector-plugin
 * architecture (docs/AGENT_SYNC.md [DECISION] 2026-05-20).
 *
 * Covers the drop-in discovery/validation/registration logic + the host
 * factory, and asserts the key Phase-A invariant: the REAL proxy/connectors/
 * dir discovers ZERO connectors (only _template.js + infra files), so boot is a
 * pure no-op and existing routes are unaffected.
 */

const path = require('path');
const {
    discoverConnectors,
    registerConnectors,
    validateConnector,
    isConnectorFile,
    INFRA_FILES,
} = require('../connectors/connectorRegistry');
const { buildConnectorHost, REQUIRED_DEP_KEYS, OPTIONAL_DEP_KEYS } = require('../connectors/connectorHost');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'connectors');
const DUPE_DIR = path.join(__dirname, 'fixtures', 'connectors-dupe');
const REAL_DIR = path.join(__dirname, '..', 'connectors');

function mockDeps(extra = {}) {
    const deps = {};
    for (const k of REQUIRED_DEP_KEYS) deps[k] = () => {};
    deps.app = { post() {}, get() {} };
    deps.profileRegistry = { get() {}, list() { return []; } };
    return { ...deps, ...extra };
}

describe('validateConnector', () => {
    const base = { id: 'x', matchProfile() {}, register() {} };
    test('accepts a minimal valid connector', () => {
        expect(validateConnector(base)).toBeNull();
    });
    test('accepts optional probe/unregister/displayName', () => {
        expect(validateConnector({ ...base, displayName: 'X', probe: async () => {}, unregister: async () => {} })).toBeNull();
    });
    test.each([
        ['non-object', 42, /not an object/],
        ['missing id', { matchProfile() {}, register() {} }, /missing string `id`/],
        ['blank id', { id: '   ', matchProfile() {}, register() {} }, /missing string `id`/],
        ['missing matchProfile', { id: 'x', register() {} }, /missing `matchProfile/],
        ['missing register', { id: 'x', matchProfile() {} }, /missing `register/],
        ['non-fn probe', { ...base, probe: 'nope' }, /`probe` must be a function/],
        ['non-fn unregister', { ...base, unregister: 5 }, /`unregister` must be a function/],
    ])('rejects %s', (_label, mod, re) => {
        expect(validateConnector(mod)).toMatch(re);
    });
});

describe('isConnectorFile', () => {
    test('accepts a plain .js module name', () => expect(isConnectorFile('genie.js')).toBe(true));
    test('skips underscore-prefixed', () => expect(isConnectorFile('_template.js')).toBe(false));
    test('skips non-.js', () => expect(isConnectorFile('readme.txt')).toBe(false));
    test('skips infra files', () => {
        for (const f of INFRA_FILES) expect(isConnectorFile(f)).toBe(false);
    });
});

describe('discoverConnectors', () => {
    test('loads only the valid, non-underscore, non-infra .js module', () => {
        const warns = [];
        const found = discoverConnectors(FIXTURE_DIR, { onWarn: (m) => warns.push(m) });
        expect(found.map((c) => c.id)).toEqual(['sample-conn']);
        // bad.js is reported; _skip.js + readme.txt are silently filtered by name/ext
        expect(warns.some((w) => /bad\.js ignored/.test(w))).toBe(true);
        expect(warns.some((w) => /skip/.test(w))).toBe(false);
    });

    test('dedupes by id (first filename wins, alphabetically) + warns', () => {
        const warns = [];
        const found = discoverConnectors(DUPE_DIR, { onWarn: (m) => warns.push(m) });
        expect(found.map((c) => c.id)).toEqual(['dup']);
        expect(found[0].displayName).toBe('Dupe A'); // a.js sorts before b.js
        expect(warns.some((w) => /duplicate connector id "dup"/.test(w))).toBe(true);
    });

    test('returns [] for a missing directory (never throws)', () => {
        expect(discoverConnectors(path.join(__dirname, 'no-such-dir-xyz'))).toEqual([]);
    });

    test('skips a module that throws at require time, keeps the rest', () => {
        const warns = [];
        const requireFn = (p) => {
            if (p.endsWith('sample.js')) throw new Error('kaboom');
            return { id: path.basename(p, '.js'), matchProfile() {}, register() {} };
        };
        const found = discoverConnectors(FIXTURE_DIR, { onWarn: (m) => warns.push(m), requireFn });
        // sample.js throws → skipped + warned; bad.js "loads" via the valid stub
        expect(found.map((c) => c.id)).toEqual(['bad']);
        expect(warns.some((w) => /sample\.js failed to load: kaboom/.test(w))).toBe(true);
    });
});

describe('registerConnectors', () => {
    test('calls register(host) and returns registered ids', () => {
        const order = [];
        const host = { __registered: order };
        const connectors = [
            { id: 'a', matchProfile() {}, register(h) { h.__registered.push('a'); } },
            { id: 'b', matchProfile() {}, register(h) { h.__registered.push('b'); } },
        ];
        expect(registerConnectors(connectors, host)).toEqual(['a', 'b']);
        expect(order).toEqual(['a', 'b']);
    });

    test('one connector throwing does not abort the others; warns', () => {
        const warns = [];
        const connectors = [
            { id: 'ok1', matchProfile() {}, register() {} },
            { id: 'boom', matchProfile() {}, register() { throw new Error('nope'); } },
            { id: 'ok2', matchProfile() {}, register() {} },
        ];
        const registered = registerConnectors(connectors, {}, { onWarn: (m) => warns.push(m) });
        expect(registered).toEqual(['ok1', 'ok2']);
        expect(warns.some((w) => /connector "boom" register\(\) threw: nope/.test(w))).toBe(true);
    });

    test('tolerates null connector list', () => {
        expect(registerConnectors(null, {})).toEqual([]);
    });
});

describe('buildConnectorHost', () => {
    test('throws without a deps object', () => {
        expect(() => buildConnectorHost()).toThrow(/deps object is required/);
    });

    test('throws listing every missing required dep', () => {
        expect(() => buildConnectorHost({ app: {} })).toThrow(/missing required host deps:/);
    });

    test('exposes the required surface + freezes the host', () => {
        const host = buildConnectorHost(mockDeps());
        for (const k of REQUIRED_DEP_KEYS) expect(host[k]).toBeDefined();
        expect(Object.isFrozen(host)).toBe(true);
        expect(() => { host.app = null; }).toThrow();
    });

    test('wires optional helpers only when supplied', () => {
        const without = buildConnectorHost(mockDeps());
        for (const k of OPTIONAL_DEP_KEYS) expect(without[k]).toBeUndefined();
        const withOpt = buildConnectorHost(mockDeps({ validateFrame: () => {}, prependFrameContext: () => {} }));
        for (const k of OPTIONAL_DEP_KEYS) expect(typeof withOpt[k]).toBe('function');
    });
});

describe('Phase A invariant — real proxy/connectors/ registers nothing', () => {
    test('the live connectors dir discovers ZERO connectors (only _template + infra)', () => {
        const warns = [];
        const found = discoverConnectors(REAL_DIR, { onWarn: (m) => warns.push(m) });
        expect(found).toEqual([]);
        expect(warns).toEqual([]); // nothing malformed; _template + infra are filtered silently
    });
});
