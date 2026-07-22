'use strict';

/**
 * registries.js — the three connector routing registries the connector-host
 * surface builds on top of: conversationDispatch, callLlmProviders, and
 * sectionedRunners. Each is a small, dependency-free ordered collection.
 *
 * Phase B: built and unit-tested here. server.js constructs one instance of
 * each at boot and passes them into buildConnectorHost so real connector
 * modules can register into them, but the existing monolithic
 * /assistant/conversations/start + /messages handlers remain the active
 * dispatch path until a connector is actually migrated onto
 * conversationDispatch — this file does not change live routing by itself.
 */

/**
 * conversationDispatch — powers /assistant/conversations/start + /messages.
 * Entries: {id, priority, match(profile), start(req,res), send(req,res)}.
 * Lower priority number wins; resolve() returns the first match in priority
 * order (ties broken by registration order, since Array.sort is stable).
 */
function createConversationDispatch() {
    const entries = [];
    return {
        add(entry) {
            if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
                throw new TypeError('conversationDispatch.add: entry.id must be a non-empty string');
            }
            if (typeof entry.priority !== 'number' || Number.isNaN(entry.priority)) {
                throw new TypeError('conversationDispatch.add: entry.priority must be a number');
            }
            if (typeof entry.match !== 'function') {
                throw new TypeError('conversationDispatch.add: entry.match must be a function');
            }
            if (entries.some((e) => e.id === entry.id)) {
                throw new Error(`conversationDispatch.add: duplicate entry id "${entry.id}"`);
            }
            entries.push(entry);
            entries.sort((a, b) => a.priority - b.priority);
        },
        /** First entry (in priority order) whose match(profile) returns
         *  truthy, or undefined if none matches. A throwing match() is
         *  treated as a non-match rather than aborting resolution. */
        resolve(profile) {
            return entries.find((e) => {
                try { return !!e.match(profile); } catch { return false; }
            });
        },
        list() { return entries.slice(); },
    };
}

/**
 * callLlmProviders — a typed Map<engine, build(profile) => async(messages)
 * => text>. Consumed by /insights/suggest-metric-rules to call whichever
 * LLM engine the resolved profile wants.
 */
function createCallLlmProviders() {
    const providers = new Map();
    return {
        register(engine, build) {
            if (!engine || typeof engine !== 'string') {
                throw new TypeError('callLlmProviders.register: engine must be a non-empty string');
            }
            if (typeof build !== 'function') {
                throw new TypeError('callLlmProviders.register: build must be a function');
            }
            providers.set(engine, build);
        },
        get(engine) { return providers.get(engine); },
        has(engine) { return providers.has(engine); },
        list() { return Array.from(providers.keys()); },
    };
}

/**
 * sectionedRunners — powers SSE /assistant/conversations/start-sectioned.
 * Entries: {id, priority, backendKind, resolve(profile), buildRunSection}.
 * Same lower-priority-wins convention as conversationDispatch.
 */
function createSectionedRunners() {
    const entries = [];
    return {
        add(entry) {
            if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
                throw new TypeError('sectionedRunners.add: entry.id must be a non-empty string');
            }
            if (typeof entry.priority !== 'number' || Number.isNaN(entry.priority)) {
                throw new TypeError('sectionedRunners.add: entry.priority must be a number');
            }
            if (typeof entry.resolve !== 'function') {
                throw new TypeError('sectionedRunners.add: entry.resolve must be a function');
            }
            if (typeof entry.buildRunSection !== 'function') {
                throw new TypeError('sectionedRunners.add: entry.buildRunSection must be a function');
            }
            if (entries.some((e) => e.id === entry.id)) {
                throw new Error(`sectionedRunners.add: duplicate entry id "${entry.id}"`);
            }
            entries.push(entry);
            entries.sort((a, b) => a.priority - b.priority);
        },
        resolveRunner(profile) {
            return entries.find((e) => {
                try { return !!e.resolve(profile); } catch { return false; }
            });
        },
        list() { return entries.slice(); },
    };
}

module.exports = { createConversationDispatch, createCallLlmProviders, createSectionedRunners };
