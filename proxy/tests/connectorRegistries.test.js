'use strict';

/**
 * connectorRegistries.test.js — unit coverage for the three connector
 * routing registries (proxy/connectors/registries.js): conversationDispatch,
 * callLlmProviders, sectionedRunners. Phase B scaffolding — these are not
 * yet consumed by server.js's live routing (see registries.js header).
 */

const {
    createConversationDispatch,
    createCallLlmProviders,
    createSectionedRunners,
} = require('../connectors/registries');

describe('conversationDispatch', () => {
    test('resolve() returns the lowest-priority matching entry', () => {
        const d = createConversationDispatch();
        d.add({ id: 'genie', priority: 1000, match: () => true, start() {}, send() {} });
        d.add({ id: 'powerbi', priority: 10, match: (p) => p.type === 'powerbi-semantic-model', start() {}, send() {} });
        d.add({ id: 'foundation', priority: 20, match: (p) => p.type === 'foundation-model', start() {}, send() {} });

        expect(d.resolve({ type: 'powerbi-semantic-model' }).id).toBe('powerbi');
        expect(d.resolve({ type: 'foundation-model' }).id).toBe('foundation');
        // Nothing else matches → falls through to the lowest-priority catch-all.
        expect(d.resolve({ type: 'something-else' }).id).toBe('genie');
    });

    test('resolve() returns undefined when nothing matches', () => {
        const d = createConversationDispatch();
        d.add({ id: 'powerbi', priority: 10, match: () => false, start() {}, send() {} });
        expect(d.resolve({})).toBeUndefined();
    });

    test('a throwing match() is treated as a non-match, not an abort', () => {
        const d = createConversationDispatch();
        d.add({ id: 'bad', priority: 1, match: () => { throw new Error('boom'); }, start() {}, send() {} });
        d.add({ id: 'ok', priority: 2, match: () => true, start() {}, send() {} });
        expect(d.resolve({}).id).toBe('ok');
    });

    test('rejects a duplicate id', () => {
        const d = createConversationDispatch();
        d.add({ id: 'x', priority: 1, match: () => true, start() {}, send() {} });
        expect(() => d.add({ id: 'x', priority: 2, match: () => true, start() {}, send() {} }))
            .toThrow(/duplicate entry id "x"/);
    });

    test('rejects entries missing id, priority, or match', () => {
        const d = createConversationDispatch();
        expect(() => d.add({ priority: 1, match: () => true })).toThrow(/entry.id must be a non-empty string/);
        expect(() => d.add({ id: 'x', match: () => true })).toThrow(/entry.priority must be a number/);
        expect(() => d.add({ id: 'x', priority: 1 })).toThrow(/entry.match must be a function/);
    });

    test('list() returns entries sorted by priority', () => {
        const d = createConversationDispatch();
        d.add({ id: 'c', priority: 30, match: () => false, start() {}, send() {} });
        d.add({ id: 'a', priority: 10, match: () => false, start() {}, send() {} });
        d.add({ id: 'b', priority: 20, match: () => false, start() {}, send() {} });
        expect(d.list().map((e) => e.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('callLlmProviders', () => {
    test('registers and retrieves a build function by engine name', () => {
        const p = createCallLlmProviders();
        const build = (profile) => async (messages) => `${profile.name}:${messages.length}`;
        p.register('openai', build);
        expect(p.get('openai')).toBe(build);
        expect(p.has('openai')).toBe(true);
        expect(p.has('bedrock-direct')).toBe(false);
        expect(p.list()).toEqual(['openai']);
    });

    test('rejects a non-string engine or non-function build', () => {
        const p = createCallLlmProviders();
        expect(() => p.register('', () => {})).toThrow(/engine must be a non-empty string/);
        expect(() => p.register('openai', 'nope')).toThrow(/build must be a function/);
    });

    test('re-registering the same engine overwrites (last write wins, no throw)', () => {
        const p = createCallLlmProviders();
        const first = () => {};
        const second = () => {};
        p.register('openai', first);
        p.register('openai', second);
        expect(p.get('openai')).toBe(second);
    });
});

describe('sectionedRunners', () => {
    test('resolveRunner() returns the lowest-priority matching entry (FM-first)', () => {
        const r = createSectionedRunners();
        r.add({ id: 'genie', priority: 20, backendKind: 'genie', resolve: () => true, buildRunSection() {} });
        r.add({ id: 'foundation', priority: 10, backendKind: 'foundation-model', resolve: () => true, buildRunSection() {} });
        expect(r.resolveRunner({}).id).toBe('foundation');
    });

    test('a throwing resolve() is treated as a non-match', () => {
        const r = createSectionedRunners();
        r.add({ id: 'bad', priority: 1, backendKind: 'x', resolve: () => { throw new Error('boom'); }, buildRunSection() {} });
        r.add({ id: 'ok', priority: 2, backendKind: 'y', resolve: () => true, buildRunSection() {} });
        expect(r.resolveRunner({}).id).toBe('ok');
    });

    test('rejects entries missing id, priority, resolve, or buildRunSection', () => {
        const r = createSectionedRunners();
        expect(() => r.add({ priority: 1, resolve: () => true, buildRunSection() {} }))
            .toThrow(/entry.id must be a non-empty string/);
        expect(() => r.add({ id: 'x', resolve: () => true, buildRunSection() {} }))
            .toThrow(/entry.priority must be a number/);
        expect(() => r.add({ id: 'x', priority: 1, buildRunSection() {} }))
            .toThrow(/entry.resolve must be a function/);
        expect(() => r.add({ id: 'x', priority: 1, resolve: () => true }))
            .toThrow(/entry.buildRunSection must be a function/);
    });

    test('rejects a duplicate id', () => {
        const r = createSectionedRunners();
        r.add({ id: 'x', priority: 1, resolve: () => true, buildRunSection() {} });
        expect(() => r.add({ id: 'x', priority: 2, resolve: () => true, buildRunSection() {} }))
            .toThrow(/duplicate entry id "x"/);
    });
});
