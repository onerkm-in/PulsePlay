/**
 * canvasSection.js — the Universal CanvasSection contract + validation (v3.2 §11).
 *
 * Every meaningful generated section (a decision prompt, a grounded answer, a data
 * insight, a BI view state) passes through one shared typed shape before it can be
 * saved. Arbitrary DOM fragments are NOT eligible. This module is the server-side
 * authority for the shape, the content hash, and what a caller is allowed to supply
 * vs. what the server derives. The frontend mirrors this shape in
 * playground/src/canvas/canvasSection.ts.
 *
 * The server NEVER persists a client-supplied owner, persona, role, permission,
 * severity, confidence, action level, or executable query. Those are derived or
 * dropped here.
 */
'use strict';

const crypto = require('crypto');

const SCHEMA_VERSION = 1;

const SECTION_TYPES = Object.freeze(['decision_prompt', 'data_insight', 'grounded_answer', 'bi_view_state']);
const SAVE_STATES = Object.freeze(['none', 'pinned', 'bookmarked', 'pinned-and-bookmarked']);
const FRESHNESS = Object.freeze(['current', 'changed', 'stale', 'resolved', 'revoked']);
const EMPHASIS = Object.freeze(['normal', 'highlighted']);
const SIZES = Object.freeze(['small', 'medium', 'large']);
const CLASSIFICATIONS = Object.freeze(['internal', 'confidential', 'restricted', 'public']);

const MAX_TITLE = 200;
const MAX_NOTE = 2000;
const MAX_TAGS = 12;
const MAX_TAG = 40;

class CanvasValidationError extends Error {
    constructor(message) { super(message); this.name = 'CanvasValidationError'; this.status = 400; }
}

function sha256(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

/** Stable content hash over the governed, order-independent part of a section. */
function computeContentHash(section) {
    const canonical = {
        type: section.type,
        title: section.title,
        source: sortedSource(section.source),
        semantic_ref: section.provenance?.semantic_ref ?? null,
        evidence_ref: section.provenance?.evidence_ref ?? null,
        filters: sortObject(section.provenance?.filters || {}),
        data_as_of: section.provenance?.data_as_of ?? null,
    };
    return sha256(canonical);
}

function sortObject(o) {
    if (!o || typeof o !== 'object') return o;
    const out = {};
    for (const k of Object.keys(o).sort()) out[k] = o[k];
    return out;
}
function sortedSource(s) {
    return sortObject({
        surface: s?.surface ?? null,
        prompt_id: s?.prompt_id ?? null,
        rule_id: s?.rule_id ?? null,
        conversation_id: s?.conversation_id ?? null,
        message_id: s?.message_id ?? null,
        source_object_id: s?.source_object_id ?? null,
    });
}

function str(v, max, field) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') throw new CanvasValidationError(`${field} must be a string`);
    const norm = v.normalize('NFC');
    if (norm.length > max) throw new CanvasValidationError(`${field} exceeds ${max} chars`);
    return norm;
}

/** Default per-type capabilities. A grounded answer can't be refreshed as a live
 *  tile; a BI view can. Decision prompts can be acted on. */
function defaultCapabilities(type) {
    switch (type) {
        case 'decision_prompt':
            return { can_pin: true, can_bookmark: true, can_snapshot: true, can_highlight: true, can_note: true, can_refresh: false, can_act: true };
        case 'bi_view_state':
            return { can_pin: true, can_bookmark: true, can_snapshot: true, can_highlight: true, can_note: true, can_refresh: true, can_act: false };
        case 'data_insight':
            return { can_pin: true, can_bookmark: true, can_snapshot: true, can_highlight: true, can_note: true, can_refresh: true, can_act: false };
        case 'grounded_answer':
        default:
            return { can_pin: true, can_bookmark: true, can_snapshot: true, can_highlight: true, can_note: true, can_refresh: false, can_act: false };
    }
}

/**
 * Validate + normalize a client-proposed section into a server-owned section body.
 * `ownerActorId` and timestamps are supplied by the store, never the client.
 * Returns the governed fields only; forbidden client fields are dropped.
 */
function normalizeProposedSection(input) {
    if (!input || typeof input !== 'object') throw new CanvasValidationError('section body required');
    const type = input.type;
    if (!SECTION_TYPES.includes(type)) {
        throw new CanvasValidationError(`type must be one of ${SECTION_TYPES.join(', ')}`);
    }
    const title = str(input.title, MAX_TITLE, 'title');
    if (!title) throw new CanvasValidationError('title required');

    const src = input.source || {};
    const source = {
        surface: str(src.surface, 60, 'source.surface'),
        prompt_id: str(src.prompt_id, 80, 'source.prompt_id'),
        rule_id: str(src.rule_id, 80, 'source.rule_id'),
        conversation_id: str(src.conversation_id, 120, 'source.conversation_id'),
        message_id: str(src.message_id, 120, 'source.message_id'),
        source_object_id: str(src.source_object_id, 200, 'source.source_object_id'),
    };

    const prov = input.provenance || {};
    const classification = CLASSIFICATIONS.includes(prov.classification) ? prov.classification : 'internal';
    const provenance = {
        semantic_ref: str(prov.semantic_ref, 400, 'provenance.semantic_ref') || source.surface || type,
        evidence_ref: str(prov.evidence_ref, 400, 'provenance.evidence_ref'),
        refresh_binding_id: str(prov.refresh_binding_id, 200, 'provenance.refresh_binding_id'),
        data_as_of: str(prov.data_as_of, 40, 'provenance.data_as_of'),
        filters: sanitizeFilters(prov.filters),
        classification,
    };

    const tags = sanitizeTags(input.state?.tags);
    const note = str(input.state?.note, MAX_NOTE, 'state.note');
    const emphasis = EMPHASIS.includes(input.state?.emphasis) ? input.state.emphasis : 'normal';

    const body = {
        schema_version: SCHEMA_VERSION,
        type,
        title,
        source,
        provenance,
        state: {
            lifecycle: 'active',
            freshness: 'current',
            save_state: 'none',
            emphasis,
            note,
            tags,
        },
        capabilities: defaultCapabilities(type),
        layout: normalizeLayout(input.layout),
    };
    body.provenance.content_hash = computeContentHash(body);
    return body;
}

function sanitizeFilters(filters) {
    if (!filters || typeof filters !== 'object') return {};
    const out = {};
    let n = 0;
    for (const k of Object.keys(filters)) {
        if (n >= 40) break;
        const v = filters[k];
        const key = String(k).slice(0, 60);
        if (Array.isArray(v)) out[key] = v.slice(0, 40).map((x) => coerceScalar(x));
        else out[key] = coerceScalar(v);
        n += 1;
    }
    return out;
}
function coerceScalar(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    return String(v).slice(0, 200);
}
function sanitizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    const out = [];
    for (const t of tags) {
        if (out.length >= MAX_TAGS) break;
        const norm = String(t).normalize('NFC').slice(0, MAX_TAG).trim();
        if (norm && !out.includes(norm)) out.push(norm);
    }
    return out;
}
function normalizeLayout(layout) {
    if (!layout || typeof layout !== 'object') return { order: 0 };
    const order = Number.isFinite(layout.order) ? Math.max(0, Math.floor(layout.order)) : 0;
    const size = SIZES.includes(layout.size) ? layout.size : undefined;
    const group_id = layout.group_id ? String(layout.group_id).slice(0, 80) : undefined;
    const out = { order };
    if (size) out.size = size;
    if (group_id) out.group_id = group_id;
    return out;
}

/** The dedup identity: the same source pinned twice must focus the existing
 *  section, not create a duplicate. */
function dedupeKey(ownerActorId, body) {
    const s = body.source || {};
    const sourceIdentity = s.prompt_id || s.source_object_id || s.message_id
        || `${body.type}:${body.provenance.content_hash}`;
    return sha256({ owner: ownerActorId, type: body.type, sourceIdentity });
}

module.exports = {
    SCHEMA_VERSION, SECTION_TYPES, SAVE_STATES, FRESHNESS, EMPHASIS, SIZES, CLASSIFICATIONS,
    CanvasValidationError,
    sha256, computeContentHash, normalizeProposedSection, dedupeKey, defaultCapabilities,
    sanitizeTags, normalizeLayout,
};
