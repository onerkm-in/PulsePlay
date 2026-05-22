// @ts-check
'use strict';

/**
 * Prompt dispatcher. Phase 11a.
 *
 * Top-level facade that loads the active pack's IR, looks up the per-profile
 * translator, and returns the backend-native payload.
 *
 * Backward-compatibility — this module DOES NOT replace
 * `packPromptInjector.resolvePackContext` / `wrapAsGenieUserMessage` calls
 * in the existing route handlers. The dispatcher is additive in Phase 11a:
 *
 *   • Existing routes continue calling packPromptInjector for now. Their
 *     behaviour is unchanged.
 *   • New surfaces (the upcoming Knowledge Base "Show translated prompt"
 *     preview, the `check-prompt-ir.js` CLI, future analytics-mode routes)
 *     call buildBackendPayload here.
 *   • Phase 11b migrates the route handlers to the dispatcher one at a
 *     time, with a regression test per migration confirming the Genie
 *     output is byte-identical to the legacy wrapAsGenieUserMessage output
 *     when the synthetic IR path is exercised.
 */

const { loadIR, buildSyntheticIR } = require('./promptIR');
const { getTranslator } = require('./promptTranslators');

/**
 * @typedef {import('./promptIR').IR} IR
 * @typedef {{ pack?: string, subVertical?: string, userQuestion: string, biContext?: object, spaces?: string[], schemaContext?: string, synthesisEndpoint?: string }} DispatchRequest
 */

/**
 * Build the backend payload for a given profile + pack request.
 *
 * Returns `{ payload, ir, translator, irSource }` where `irSource` is one
 * of:
 *   • 'yaml'      — loaded prompt-ir.yaml
 *   • 'json'      — loaded prompt-ir.json
 *   • 'synthetic' — built from existing markdown
 *   • 'none'      — pack/subVertical not supplied; payload is a minimal
 *                   passthrough using just request.userQuestion
 *
 * Never throws on missing pack/IR — falls through to a synthetic IR (which
 * itself returns null for sub-verticals without any markdown). When the IR
 * is null (no pack supplied OR pack content is missing), we synthesize a
 * minimal "empty" IR so the translator can still emit a valid payload that
 * carries the user question through.
 *
 * @param {{ type?: string }} profile  Resolved profile from config.json
 * @param {DispatchRequest} request
 * @param {{ packsRoot?: string, log?: (msg: string) => void }} [opts]
 */
function buildBackendPayload(profile, request, opts = {}) {
    const log = opts.log || (() => {});
    const translator = getTranslator(profile?.type);
    if (!translator) {
        // No registered translator for this profile type — Phase 11a is
        // additive, so the caller's existing code path keeps working.
        // We return null so callers can detect this and route to the
        // legacy injector.
        return null;
    }

    let ir = null;
    let irSource = 'none';
    if (request?.pack) {
        ir = loadIR(request.pack, request.subVertical || '', opts);
        if (ir) {
            irSource = ir.meta?.synthetic ? 'synthetic' : _detectAuthoredSource(request, opts);
        } else {
            log(`[promptDispatcher] no IR for ${request.pack}/${request.subVertical || ''} — using empty fallback`);
        }
    }
    if (!ir) ir = _emptyIR();

    return {
        payload: translator.translate(ir, request),
        ir,
        translator: translator.type,
        irSource,
    };
}

function _detectAuthoredSource(request, opts) {
    // The loader doesn't tell us which file it picked. Re-check the
    // filesystem just for the diagnostic stamp. Cheap (single fs.existsSync
    // call) and only fires when the IR is authored, not on every request.
    const fs = require('fs');
    const path = require('path');
    const packsRoot = opts.packsRoot || require('./promptIR').DEFAULT_PACKS_ROOT;
    const dir = path.join(packsRoot, request.pack, 'sub-verticals', request.subVertical || '');
    if (fs.existsSync(path.join(dir, 'prompt-ir.yaml'))) return 'yaml';
    if (fs.existsSync(path.join(dir, 'prompt-ir.json'))) return 'json';
    return 'synthetic';
}

function _emptyIR() {
    return {
        schemaVersion: 1,
        id: '(empty)',
        role: {},
        task: { kind: 'answer-grounded' },
        vocabulary: [],
        functions: [],
        guardrails: { must: [], mustNot: [] },
        output: { format: 'free-text', sections: [] },
        examples: [],
        overrides: {},
        meta: { synthetic: true },
    };
}

module.exports = {
    buildBackendPayload,
    // Re-export pieces tests / introspection callers want.
    loadIR,
    buildSyntheticIR,
};
