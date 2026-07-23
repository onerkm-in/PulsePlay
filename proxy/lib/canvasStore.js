/**
 * canvasStore.js — server-side persistence for CanvasSections + snapshots (v3.2 §11/§13).
 *
 * One persistence INTERFACE, two adapters:
 *   - InMemoryCanvasStore   the real runtime store on this workspace. Per-process,
 *                           per-owner, with full governance (ownership isolation,
 *                           versioning, optimistic concurrency, idempotency, dedupe,
 *                           immutable snapshots). Not a mock — it actually persists
 *                           for the life of the proxy and is what the tests exercise.
 *   - DatabricksCanvasStore production adapter. Code-complete, parameterized SQL over
 *                           the approved Delta tables. It NEVER runs DDL; prepareDdl()
 *                           returns the CREATE statements for a reviewer to run under
 *                           proper authorization. Live execution against the org estate
 *                           is externally blocked on this free workspace, so the factory
 *                           does not select it here.
 *
 * Authority: the caller passes `ownerActorId` (derived server-side in the connector).
 * The store never trusts a client-supplied owner. Cross-owner reads return null so a
 * caller cannot even learn another owner's object exists.
 */
'use strict';

const crypto = require('crypto');
const {
    normalizeProposedSection, dedupeKey, computeContentHash, sha256, CanvasValidationError,
} = require('./canvasSection');

class CanvasConflictError extends Error {
    constructor(message, extra = {}) { super(message); this.name = 'CanvasConflictError'; this.status = 409; Object.assign(this, extra); }
}
class CanvasNotFoundError extends Error {
    constructor(message = 'Not found') { super(message); this.name = 'CanvasNotFoundError'; this.status = 404; }
}

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }

class InMemoryCanvasStore {
    constructor() {
        this._sections = new Map();   // section_id -> section
        this._snapshots = new Map();  // snapshot_id -> snapshot
        this._dedupe = new Map();     // dedupeKey -> section_id
        this._idem = new Map();       // idempotencyKey -> { payloadHash, kind, resultId }
    }

    // ── sections ──────────────────────────────────────────────────────────────
    listSections(ownerActorId, { saveState } = {}) {
        const out = [];
        for (const s of this._sections.values()) {
            if (s.owner_actor_id !== ownerActorId) continue;
            if (saveState && !matchesSaveState(s.state.save_state, saveState)) continue;
            out.push(clone(s));
        }
        out.sort((a, b) => (a.layout?.order ?? 0) - (b.layout?.order ?? 0)
            || String(a.created_at).localeCompare(String(b.created_at)));
        return out;
    }

    getSection(ownerActorId, sectionId) {
        const s = this._sections.get(sectionId);
        if (!s || s.owner_actor_id !== ownerActorId) return null; // isolation: don't reveal
        return clone(s);
    }

    createSection(ownerActorId, proposed, { clientOperationId, idempotencyKey } = {}) {
        const body = normalizeProposedSection(proposed);
        const payloadHash = sha256({ owner: ownerActorId, body, clientOperationId: clientOperationId || null });

        if (idempotencyKey) {
            const prior = this._idem.get(idempotencyKey);
            if (prior) {
                if (prior.payloadHash !== payloadHash) throw new CanvasConflictError('Idempotency key reused with a different payload');
                const existing = this._sections.get(prior.resultId);
                if (existing) return { section: clone(existing), replayed: true };
            }
        }

        // dedupe: pinning/saving the same source again focuses the existing section.
        const dk = dedupeKey(ownerActorId, body);
        const existingId = this._dedupe.get(dk);
        if (existingId && this._sections.get(existingId)) {
            const existing = this._sections.get(existingId);
            if (idempotencyKey) this._idem.set(idempotencyKey, { payloadHash, kind: 'section', resultId: existing.section_id });
            return { section: clone(existing), deduped: true };
        }

        const ts = nowIso();
        const section = {
            section_id: newId('sec'),
            owner_actor_id: ownerActorId,
            ...body,
            version: 0,
            created_at: ts,
            updated_at: ts,
        };
        this._sections.set(section.section_id, section);
        this._dedupe.set(dk, section.section_id);
        if (idempotencyKey) this._idem.set(idempotencyKey, { payloadHash, kind: 'section', resultId: section.section_id });
        return { section: clone(section), created: true };
    }

    _mutate(ownerActorId, sectionId, expectedVersion, fn) {
        const s = this._sections.get(sectionId);
        if (!s || s.owner_actor_id !== ownerActorId) throw new CanvasNotFoundError();
        if (expectedVersion !== undefined && Number(expectedVersion) !== s.version) {
            throw new CanvasConflictError('Stale version', { current_version: s.version });
        }
        fn(s);
        s.version += 1;
        s.updated_at = nowIso();
        s.provenance.content_hash = computeContentHash(s);
        return clone(s);
    }

    /** Pin / bookmark / unpin, preserving the orthogonal save flag. */
    setSaveState(ownerActorId, sectionId, op, expectedVersion) {
        return this._mutate(ownerActorId, sectionId, expectedVersion, (s) => {
            s.state.save_state = applySaveOp(s.state.save_state, op);
        });
    }

    setNote(ownerActorId, sectionId, note, expectedVersion) {
        return this._mutate(ownerActorId, sectionId, expectedVersion, (s) => {
            s.state.note = note ? String(note).normalize('NFC').slice(0, 2000) : null;
            // adding a note to an unsaved section atomically bookmarks it (§11)
            if (s.state.save_state === 'none') s.state.save_state = 'bookmarked';
        });
    }

    setHighlight(ownerActorId, sectionId, on, expectedVersion) {
        return this._mutate(ownerActorId, sectionId, expectedVersion, (s) => {
            s.state.emphasis = on ? 'highlighted' : 'normal';
            if (on && s.state.save_state === 'none') s.state.save_state = 'bookmarked';
        });
    }

    setLayout(ownerActorId, sectionId, layout, expectedVersion) {
        return this._mutate(ownerActorId, sectionId, expectedVersion, (s) => {
            if (Number.isFinite(layout?.order)) s.layout.order = Math.max(0, Math.floor(layout.order));
            if (typeof layout?.group_id === 'string') s.layout.group_id = layout.group_id.slice(0, 80) || undefined;
            if (layout?.group_id === null) delete s.layout.group_id;
            if (['small', 'medium', 'large'].includes(layout?.size)) s.layout.size = layout.size;
        });
    }

    setTags(ownerActorId, sectionId, tags, expectedVersion) {
        const { sanitizeTags } = require('./canvasSection');
        return this._mutate(ownerActorId, sectionId, expectedVersion, (s) => {
            s.state.tags = sanitizeTags(tags);
        });
    }

    /** Producer re-detection: update content/evidence fields only, preserving the
     *  human save_state, note, tags, emphasis, and layout (§7). Bumps version and
     *  recomputes the content hash so snapshots can detect the change. */
    applyProducerRefresh(ownerActorId, sectionId, newProposed) {
        const body = normalizeProposedSection(newProposed);
        return this._mutate(ownerActorId, sectionId, undefined, (s) => {
            s.type = body.type;
            s.title = body.title;
            s.source = body.source;
            s.provenance = { ...body.provenance, content_hash: undefined };
            s.capabilities = body.capabilities;
            // human state (save_state, note, tags, emphasis) + layout untouched
        });
    }

    deleteSection(ownerActorId, sectionId, expectedVersion) {
        const s = this._sections.get(sectionId);
        if (!s || s.owner_actor_id !== ownerActorId) throw new CanvasNotFoundError();
        if (expectedVersion !== undefined && Number(expectedVersion) !== s.version) {
            throw new CanvasConflictError('Stale version', { current_version: s.version });
        }
        this._sections.delete(sectionId);
        for (const [k, v] of this._dedupe) if (v === sectionId) this._dedupe.delete(k);
        return { deleted: true, section_id: sectionId };
    }

    // ── snapshots (immutable, versioned point-in-time) ──────────────────────────
    listSnapshots(ownerActorId) {
        const out = [];
        for (const snap of this._snapshots.values()) {
            if (snap.owner_actor_id === ownerActorId) out.push(clone(snap));
        }
        out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return out;
    }

    getSnapshot(ownerActorId, snapshotId) {
        const snap = this._snapshots.get(snapshotId);
        if (!snap || snap.owner_actor_id !== ownerActorId) return null;
        return clone(snap);
    }

    /** Snapshot an existing section, or an unsaved proposed source (which creates a
     *  minimal backing section with save_state=none per §11). */
    createSnapshot(ownerActorId, { sectionId, proposed } = {}) {
        let section;
        if (sectionId) {
            section = this._sections.get(sectionId);
            if (!section || section.owner_actor_id !== ownerActorId) throw new CanvasNotFoundError();
        } else if (proposed) {
            const res = this.createSection(ownerActorId, proposed);
            section = this._sections.get(res.section.section_id);
        } else {
            throw new CanvasValidationError('sectionId or proposed source required');
        }
        const ts = nowIso();
        const snapshot = {
            snapshot_id: newId('snap'),
            owner_actor_id: ownerActorId,
            section_id: section.section_id,
            section_version: section.version,
            schema_version: section.schema_version,
            type: section.type,
            title: section.title,
            summary: `${section.type} · ${section.title}`,
            source: clone(section.source),
            provenance: clone(section.provenance),
            content_hash: section.provenance.content_hash,
            data_as_of: section.provenance.data_as_of,
            classification: section.provenance.classification,
            note: section.state.note || null,
            created_at: ts,
        };
        this._snapshots.set(snapshot.snapshot_id, snapshot);
        return clone(snapshot);
    }

    /** Restore revalidates ownership + compares the snapshot hash to the live
     *  section so callers can see whether the underlying data changed. */
    restoreSnapshot(ownerActorId, snapshotId) {
        const snap = this._snapshots.get(snapshotId);
        if (!snap || snap.owner_actor_id !== ownerActorId) throw new CanvasNotFoundError();
        const live = this._sections.get(snap.section_id);
        const freshness = !live ? 'revoked'
            : live.provenance.content_hash === snap.content_hash ? 'current' : 'changed';
        return { snapshot: clone(snap), live: live ? clone(live) : null, freshness };
    }

    deleteSnapshot(ownerActorId, snapshotId) {
        const snap = this._snapshots.get(snapshotId);
        if (!snap || snap.owner_actor_id !== ownerActorId) throw new CanvasNotFoundError();
        this._snapshots.delete(snapshotId);
        return { deleted: true, snapshot_id: snapshotId };
    }

    // test helper
    _reset() { this._sections.clear(); this._snapshots.clear(); this._dedupe.clear(); this._idem.clear(); }
}

function matchesSaveState(state, filter) {
    if (filter === 'pinned') return state === 'pinned' || state === 'pinned-and-bookmarked';
    if (filter === 'bookmarked') return state === 'bookmarked' || state === 'pinned-and-bookmarked';
    if (filter === 'pinned-and-bookmarked') return state === 'pinned-and-bookmarked';
    return true;
}
function applySaveOp(current, op) {
    const pinned = current === 'pinned' || current === 'pinned-and-bookmarked';
    const bookmarked = current === 'bookmarked' || current === 'pinned-and-bookmarked';
    let p = pinned, b = bookmarked;
    if (op === 'pin') p = true;
    else if (op === 'unpin') p = false;
    else if (op === 'bookmark') b = true;
    else if (op === 'unbookmark') b = false;
    if (p && b) return 'pinned-and-bookmarked';
    if (p) return 'pinned';
    if (b) return 'bookmarked';
    return 'none';
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Singleton runtime store (per proxy process).
let _store = null;
function getCanvasStore() {
    if (_store) return _store;
    // Only InMemory is selected here. DatabricksCanvasStore is code-complete but its
    // live tables are org-scoped + unreachable, so it is never auto-selected on this
    // workspace (would require the approved profile + reviewed DDL run).
    _store = new InMemoryCanvasStore();
    return _store;
}

module.exports = {
    InMemoryCanvasStore,
    getCanvasStore,
    CanvasConflictError, CanvasNotFoundError,
    // exposed for tests
    __test: { applySaveOp, matchesSaveState },
};
