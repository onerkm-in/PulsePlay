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
const MAX_GROUNDED_ROWS = 50;
const MAX_CELL_CHARS = 80;

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
 * @typedef {Object} GroundedData
 * @property {Array<string>} columns
 * @property {Array<Array<*>>} rows
 */

/**
 * Format caller-supplied grounded result rows (the EXACT numbers a
 * deterministic query returned) as a compact, fenced data block. This is
 * the values-carrying counterpart to formatDiscoveryContext, which only
 * carries metadata/names. When a backend folds this into the system prompt,
 * the model is told the figures it is allowed to cite.
 *
 * Defensive: a missing/malformed shape or zero rows yields `null` (the
 * caller then proceeds ungrounded). Rows are capped at MAX_GROUNDED_ROWS and
 * each cell truncated to MAX_CELL_CHARS so a fat result set can't blow the
 * prompt budget.
 *
 * @param {GroundedData|null|undefined} data
 * @returns {string|null}
 */
function formatGroundedData(data) {
    if (!data || typeof data !== 'object') return null;
    const columns = Array.isArray(data.columns) ? data.columns : [];
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length === 0) return null;

    const cell = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.length > MAX_CELL_CHARS ? s.slice(0, MAX_CELL_CHARS) + '…' : s;
    };
    const header = columns.length > 0
        ? columns.map(cell).join(' | ')
        : null;
    const shown = rows.slice(0, MAX_GROUNDED_ROWS);
    const bodyLines = shown.map(r => (Array.isArray(r) ? r : [r]).map(cell).join(' | '));

    const lines = [];
    if (header) lines.push(header);
    lines.push(...bodyLines);
    if (rows.length > shown.length) {
        lines.push(`… (${shown.length} of ${rows.length} rows shown)`);
    }
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
 * @param {string|null} [input.groundedBlock] Output of formatGroundedData, or null.
 *   When present, the model is instructed to cite figures ONLY from these rows.
 * @returns {string}
 */
function composeSystemPromptWithContext({ systemPrompt, discoveryBlock, packBlock, packTag, groundedBlock }) {
    const hasDiscovery = !!discoveryBlock;
    const hasPack = !!packBlock;
    const hasGrounded = !!groundedBlock;
    if (!hasDiscovery && !hasPack && !hasGrounded) return systemPrompt || '';
    const parts = [];
    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
        parts.push(systemPrompt.trim());
    }
    if (hasDiscovery) parts.push(`[Discovery Context]\n${discoveryBlock}`);
    if (hasPack) {
        const tag = packTag || 'pack';
        parts.push(`[Pack Context: ${tag}]\n${packBlock}`);
    }
    if (hasGrounded) {
        // Grounded data goes LAST (closest to the question) and carries an
        // explicit no-fabrication instruction. These rows are the only
        // figures the model may cite verbatim; anything else must be framed
        // qualitatively, not as a specific number.
        parts.push(
            '[Grounded Data]\n'
            + 'The rows below are the ONLY source of truth for figures. When you cite a '
            + 'number, it MUST appear in (or be directly computed from) these rows. Do '
            + 'NOT invent or estimate any figure that is not derivable from this data.\n\n'
            + groundedBlock,
        );
    }
    return parts.join('\n\n');
}

module.exports = {
    formatDiscoveryContext,
    formatGroundedData,
    buildAuditDetail,
    composeUserMessageWithContext,
    composeSystemPromptWithContext,
    MAX_KPIS,
    MAX_FRAMES,
    MAX_GROUNDED_ROWS,
};
