// @ts-check
'use strict';

/**
 * packPromptInjector.js — Cycle C backend.
 *
 * Thin orchestration helper around `packPromptLoader.loadPromptContext`.
 * Encapsulates the small bit of glue used by all three start-conversation
 * routes (Genie, OpenAI orchestrator, Bedrock InvokeModel) so the route
 * handlers don't repeat the same boilerplate (load → audit → format).
 *
 * Two delivery shapes are supported:
 *
 *   - **Genie / first-user-message header**: Genie has no system-prompt API,
 *     so the pack context is prepended to the user's question as a fenced
 *     header. Use `wrapAsGenieUserMessage`.
 *
 *   - **System-prompt augmentation** (OpenAI / Bedrock orchestrator): the
 *     pack context is appended to the LLM's system prompt before SQL +
 *     narrative passes. The orchestrator already accepts a `packContext`
 *     argument; the route handler resolves it via `resolvePackContext` and
 *     forwards the resolved string.
 *
 * The audit-log payload shape is identical across all three backends so a
 * single grep over audit lines (`pack=cpg-fmcg/supply-chain`) surfaces every
 * injection regardless of the connector.
 */

const { loadPromptContext } = require('./packPromptLoader');

/**
 * @typedef {Object} ResolvePackContextResult
 * @property {string|null} content       Raw prompt-context body, or null when nothing was resolved.
 * @property {string|null} source        Absolute path the content was read from, or null.
 * @property {boolean} fallback          True when the glossary fallback supplied the content.
 * @property {string|null} pack          Echo of the requested pack id (null when none was requested).
 * @property {string|null} subVertical   Echo of the requested sub-vertical (null when none was requested).
 * @property {boolean} requested         True when the caller asked for context (pack OR subVertical was set).
 * @property {boolean} resolved          True when content was successfully loaded.
 * @property {string|null} reason        Short human-readable reason when not resolved (e.g. 'no-pack-supplied', 'pack-or-sv-not-found').
 */

/**
 * Look up pack-context for a `(pack, subVertical)` request and return a
 * structured result the caller can use for both LLM-call augmentation AND
 * audit logging.
 *
 * Never throws. Missing / malformed input → `{ requested: false, ... }`.
 *
 * @param {{ pack?: unknown, subVertical?: unknown }} input
 * @param {{ packsRoot?: string }} [opts]
 * @returns {ResolvePackContextResult}
 */
function resolvePackContext(input, opts) {
    const pack = typeof input?.pack === 'string' && input.pack.trim() ? input.pack.trim() : null;
    const subVertical = typeof input?.subVertical === 'string' && input.subVertical.trim()
        ? input.subVertical.trim() : null;

    if (!pack && !subVertical) {
        return {
            content: null, source: null, fallback: false,
            pack: null, subVertical: null,
            requested: false, resolved: false, reason: 'no-pack-supplied',
        };
    }

    if (!pack) {
        // sub-vertical without pack is meaningless — caller should send both.
        return {
            content: null, source: null, fallback: false,
            pack: null, subVertical, requested: true, resolved: false,
            reason: 'pack-missing',
        };
    }

    const loaded = loadPromptContext(pack, subVertical || undefined, opts);
    if (!loaded) {
        return {
            content: null, source: null, fallback: false,
            pack, subVertical, requested: true, resolved: false,
            reason: 'pack-or-sv-not-found',
        };
    }

    return {
        content: loaded.content,
        source: loaded.source,
        fallback: !!loaded.fallback,
        pack, subVertical,
        requested: true, resolved: true, reason: null,
    };
}

/**
 * Format a pack-context block as the head of a Genie user message. Genie has
 * no system-prompt API, so we lead with a fenced "Pack Context" header so
 * the model can clearly distinguish the curated vocabulary from the user's
 * own question.
 *
 * @param {string} packContext   The prompt-context body.
 * @param {string|null} pack
 * @param {string|null} subVertical
 * @param {string} userQuestion  The original user question (must be non-null).
 * @returns {string}
 */
function wrapAsGenieUserMessage(packContext, pack, subVertical, userQuestion) {
    const tag = subVertical ? `${pack}/${subVertical}` : (pack || 'pack');
    return `[Pack Context: ${tag}]\n\n${packContext}\n\n[User Question]\n\n${userQuestion}`;
}

/**
 * Build the structured audit-log detail for a pack-context resolution.
 * Same shape across all three backends so the audit pipeline can consume
 * a single schema.
 *
 * @param {ResolvePackContextResult} resolved
 * @returns {{ pack: string|null, subVertical: string|null, contextLength: number, source: string|null, fallback: boolean, resolved: boolean, reason: string|null }}
 */
function buildAuditDetail(resolved) {
    return {
        pack: resolved.pack,
        subVertical: resolved.subVertical,
        contextLength: resolved.content ? resolved.content.length : 0,
        source: resolved.source,
        fallback: resolved.fallback,
        resolved: resolved.resolved,
        reason: resolved.reason,
    };
}

module.exports = {
    resolvePackContext,
    wrapAsGenieUserMessage,
    buildAuditDetail,
};
