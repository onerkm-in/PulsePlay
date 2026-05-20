// @ts-check
'use strict';

/**
 * discoveryPromptInjector.js — Discovery-snapshot context injection.
 *
 * Companion to packPromptInjector.js. The client (App.tsx) pre-warms a
 * DiscoverySnapshot on screen-load via getDiscoverySnapshot(); the Pulse
 * genie pipeline then attaches a compact `discoveryContext` summary on
 * every /assistant/conversations/start request. This helper formats the
 * summary as a fenced header that the route handler prepends to the
 * user's question — same delivery pattern as the pack context, so Genie
 * sees the discovery facts BEFORE the question.
 *
 * Defensive: malformed / missing input yields `null`; the route handler
 * then falls back to an unaugmented prompt.
 */

/**
 * @typedef {Object} DiscoveryContextSummary
 * @property {number} [snapshotVersion]
 * @property {{
 *   probe?: { connectorType?: string, displayName?: string, tableCount?: number,
 *             metadataAvailability?: string }|null,
 *   biMetadata?: object|null,
 *   packKpiCount?: number
 * }} [sources]
 * @property {Array<string>} [availableKpis]
 * @property {Array<string>} [reachableFrames]
 */

const MAX_KPIS = 20;
const MAX_FRAMES = 12;

/**
 * Format a compact DiscoveryContextSummary as a fenced prompt header.
 * Returns null when there's nothing useful to inject.
 *
 * @param {DiscoveryContextSummary|null|undefined} ctx
 * @returns {string|null}
 */
function formatDiscoveryContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return null;
    const lines = [];

    const probe = ctx.sources && ctx.sources.probe;
    if (probe && typeof probe === 'object') {
        const parts = [];
        if (probe.connectorType) parts.push(String(probe.connectorType));
        if (probe.displayName) parts.push(`"${String(probe.displayName).slice(0, 80)}"`);
        const md = probe.metadataAvailability || 'unknown';
        parts.push(`metadata=${md}`);
        if (typeof probe.tableCount === 'number' && probe.tableCount > 0) {
            parts.push(`${probe.tableCount} table(s)`);
        }
        lines.push(`- Connector: ${parts.join(', ')}`);
    }

    if (Array.isArray(ctx.availableKpis) && ctx.availableKpis.length > 0) {
        const safe = ctx.availableKpis
            .filter(s => typeof s === 'string' && s.length > 0)
            .slice(0, MAX_KPIS);
        if (safe.length > 0) lines.push(`- Available KPIs: ${safe.join(', ')}`);
    }

    if (Array.isArray(ctx.reachableFrames) && ctx.reachableFrames.length > 0) {
        const safe = ctx.reachableFrames
            .filter(s => typeof s === 'string' && s.length > 0)
            .slice(0, MAX_FRAMES);
        if (safe.length > 0) lines.push(`- Reachable analysis frames: ${safe.join(', ')}`);
    }

    if (lines.length === 0) return null;
    return lines.join('\n');
}

/**
 * Build the audit-log detail for a discovery-context injection.
 * @param {string|null} discoveryBlock
 * @returns {{ resolved: boolean, contextLength: number }}
 */
function buildAuditDetail(discoveryBlock) {
    return {
        resolved: !!discoveryBlock,
        contextLength: discoveryBlock ? discoveryBlock.length : 0,
    };
}

/**
 * Compose a unified user-message context prefix that stacks the available
 * context blocks above a `[User Question]` header. Used by every backend
 * route that prepends context to a single user message (Genie poll path,
 * Bedrock RAG, Supervisor).
 *
 * @param {object} input
 * @param {string|null} input.discoveryBlock  Output of formatDiscoveryContext, or null.
 * @param {string|null} input.packBlock       Resolved pack-context string, or null.
 * @param {string|null} [input.packTag]       Pack tag like "cpg-fmcg/supply-chain" used in the header label.
 * @param {string} input.userQuestion         The base content to wrap.
 * @returns {string} If neither block is present, returns `userQuestion` byte-identically.
 */
function composeUserMessageWithContext({ discoveryBlock, packBlock, packTag, userQuestion }) {
    const hasDiscovery = !!discoveryBlock;
    const hasPack = !!packBlock;
    if (!hasDiscovery && !hasPack) return userQuestion;
    const parts = [];
    if (hasDiscovery) parts.push(`[Discovery Context]\n\n${discoveryBlock}`);
    if (hasPack) {
        const tag = packTag || 'pack';
        parts.push(`[Pack Context: ${tag}]\n\n${packBlock}`);
    }
    parts.push(`[User Question]\n\n${userQuestion}`);
    return parts.join('\n\n');
}

/**
 * Compose a unified SYSTEM-prompt augmentation. Used by backends that
 * accept a separate system message (Foundation Model, OpenAI Chat
 * Completions, Bedrock InvokeModel via Anthropic Messages, etc.).
 *
 * Returns the augmented system-prompt string. If neither context block
 * is present, returns the original system prompt byte-identically.
 *
 * @param {object} input
 * @param {string|null} input.systemPrompt    The original system prompt.
 * @param {string|null} input.discoveryBlock  Output of formatDiscoveryContext, or null.
 * @param {string|null} [input.packBlock]     Resolved pack context string, or null.
 * @param {string|null} [input.packTag]       Pack tag for the header label.
 * @returns {string}
 */
function composeSystemPromptWithContext({ systemPrompt, discoveryBlock, packBlock, packTag }) {
    const hasDiscovery = !!discoveryBlock;
    const hasPack = !!packBlock;
    if (!hasDiscovery && !hasPack) return systemPrompt || '';
    const parts = [];
    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
        parts.push(systemPrompt.trim());
    }
    if (hasDiscovery) parts.push(`[Discovery Context]\n${discoveryBlock}`);
    if (hasPack) {
        const tag = packTag || 'pack';
        parts.push(`[Pack Context: ${tag}]\n${packBlock}`);
    }
    return parts.join('\n\n');
}

module.exports = {
    formatDiscoveryContext,
    buildAuditDetail,
    composeUserMessageWithContext,
    composeSystemPromptWithContext,
    MAX_KPIS,
    MAX_FRAMES,
};
