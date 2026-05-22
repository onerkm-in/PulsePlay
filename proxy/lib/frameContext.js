// @ts-check
'use strict';

/**
 * Frame context helpers — Phase 11b prep for the frontend's
 * "selected analysis frame" feature.
 *
 * The frontend's AISidebar (playground/src/components/AISidebar.tsx)
 * sends a structured `frame: { frameId, label, domain, params }` field
 * in `/assistant/conversations/start` request bodies whenever the user
 * picked a reachable analysis frame in the FramePicker. It ALSO prefixes
 * the human-readable `[Selected analysis frame]` block into the
 * `content` field for any backend that doesn't yet consume the
 * structured signal.
 *
 * This module centralises the proxy-side handling of that field so:
 *
 *   1. Direct API callers (curl, future SDKs) who send only the
 *      structured `body.frame` get the frame info bridged into the
 *      content the backend actually sees, without needing each route
 *      handler to know the format.
 *   2. Audit logs capture frame selection consistently across the
 *      Genie / Foundation Model / Supervisor handlers.
 *   3. Phase 11c (future) — when translators learn to specialize their
 *      output on `frame.frameId` (e.g. force BCG output schema), they
 *      consume the normalized frame shape from here.
 *
 * Byte-identity contract: when `body.frame` is absent or invalid,
 * every helper returns a value that makes the calling path identical
 * to the legacy "no frame" behavior. This is enforced by tests in
 * `proxy/tests/frameContext.test.js`.
 */

/**
 * @typedef {{
 *   frameId: string,
 *   label?: string,
 *   domain?: string,
 *   params?: Record<string, unknown>,
 * }} NormalizedFrame
 */

const FRAME_CONTENT_MARKER = '[Selected analysis frame]';
const FRAME_BRIDGE_HEADER = '[Frame Context]';

/**
 * Validate + normalize the `body.frame` field. Returns `null` for any
 * invalid input (so route handlers can branch on falsy without further
 * type checks). Accepts unknown extra fields but ignores them — the
 * normalized shape is small and stable.
 *
 * Defense in depth: a misbehaving frontend or malicious client could
 * send `frame: { frameId: { __proto__: ... } }` or huge nested objects.
 * We coerce frameId to a string (or reject), truncate label/domain at
 * 256 chars each, and limit params to first 32 keys with primitive
 * values only.
 *
 * @param {unknown} raw
 * @returns {NormalizedFrame|null}
 */
function validateFrame(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = /** @type {Record<string, unknown>} */ (raw);
    const frameId = typeof obj.frameId === 'string' ? obj.frameId.trim() : '';
    if (!frameId) return null;
    if (frameId.length > 128) return null; // suspiciously long frame id

    /** @type {NormalizedFrame} */
    const out = { frameId };
    if (typeof obj.label === 'string' && obj.label.trim()) {
        out.label = obj.label.trim().slice(0, 256);
    }
    if (typeof obj.domain === 'string' && obj.domain.trim()) {
        out.domain = obj.domain.trim().slice(0, 256);
    }
    if (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) {
        const params = /** @type {Record<string, unknown>} */ (obj.params);
        /** @type {Record<string, unknown>} */
        const safeParams = {};
        let count = 0;
        for (const k of Object.keys(params)) {
            if (count >= 32) break;
            if (typeof k !== 'string' || k.length > 64) continue;
            const v = params[k];
            // Primitives + arrays of primitives only — reject nested
            // objects (keeps audit blob bounded; prevents prototype
            // pollution via __proto__/constructor keys).
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                safeParams[k] = typeof v === 'string' ? v.slice(0, 512) : v;
                count += 1;
            } else if (Array.isArray(v) && v.every(x => x === null || ['string', 'number', 'boolean'].includes(typeof x))) {
                safeParams[k] = v.slice(0, 64);
                count += 1;
            }
        }
        if (Object.keys(safeParams).length > 0) out.params = safeParams;
    }
    return out;
}

/**
 * Format a normalized frame into the same `[Selected analysis frame]`
 * block the frontend AISidebar produces, so backends that key off the
 * marker see consistent text regardless of which client sent it.
 *
 * @param {NormalizedFrame} frame
 * @returns {string}
 */
function formatFrameBlock(frame) {
    const lines = [
        FRAME_CONTENT_MARKER,
        `- Frame: ${frame.label || frame.frameId} (${frame.frameId})`,
    ];
    if (frame.domain) lines.push(`- Domain: ${frame.domain}`);
    if (frame.params && Object.keys(frame.params).length > 0) {
        lines.push('- Params:');
        for (const k of Object.keys(frame.params)) {
            const v = frame.params[k];
            const display = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
                ? String(v)
                : JSON.stringify(v);
            lines.push(`  - ${k}: ${display.slice(0, 80)}`);
        }
    }
    return lines.join('\n');
}

/**
 * Bridge structured `frame` into a `content` string for callers that
 * sent only the structured field. Idempotent — if the content already
 * carries the frontend's `[Selected analysis frame]` block, the bridge
 * is a no-op (the frontend already did the work).
 *
 * @param {string} content   The user message content as the caller sent it.
 * @param {NormalizedFrame|null} frame
 * @returns {string}
 */
function prependFrameContext(content, frame) {
    if (!frame) return content;
    if (typeof content !== 'string') return content;
    if (content.includes(FRAME_CONTENT_MARKER)) return content; // already prefixed
    const block = `${FRAME_BRIDGE_HEADER}\n${formatFrameBlock(frame).slice(FRAME_CONTENT_MARKER.length + 1)}`;
    return `${block}\n\n${content}`;
}

/**
 * Structured audit-log payload for a frame selection. Same shape
 * regardless of backend — matches `buildAuditDetail` in
 * packPromptInjector.js so a single audit pipeline can consume both.
 *
 * @param {NormalizedFrame|null} frame
 * @returns {{ frameId: string|null, label: string|null, domain: string|null, paramCount: number, paramKeys: string[] }}
 */
function buildFrameAuditDetail(frame) {
    if (!frame) {
        return { frameId: null, label: null, domain: null, paramCount: 0, paramKeys: [] };
    }
    const paramKeys = frame.params ? Object.keys(frame.params) : [];
    return {
        frameId: frame.frameId,
        label: frame.label || null,
        domain: frame.domain || null,
        paramCount: paramKeys.length,
        // Param VALUES are intentionally excluded from the audit log —
        // they may contain user data; keys are enough for tracing.
        paramKeys,
    };
}

module.exports = {
    validateFrame,
    prependFrameContext,
    formatFrameBlock,
    buildFrameAuditDetail,
    FRAME_CONTENT_MARKER,
    FRAME_BRIDGE_HEADER,
};
