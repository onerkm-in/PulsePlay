/**
 * Governance tests for the CanvasSection store (v3.2 §11/§13): ownership isolation,
 * versioning, optimistic concurrency, idempotency, dedupe, save-state ops, snapshots.
 */
'use strict';

const { InMemoryCanvasStore, CanvasConflictError, CanvasNotFoundError } = require('../lib/canvasStore');
const { DatabricksCanvasStore, ExternalRuntimeBlockedError } = require('../lib/canvasStoreDatabricks');

const USER_A = 'iss|tenant|alice';
const USER_B = 'iss|tenant|bob';

function proposed(overrides = {}) {
    return {
        type: 'decision_prompt',
        title: 'OTIF below target',
        source: { surface: 'action-insights', prompt_id: 'pp_abc', rule_id: 'SC-OTIF-001' },
        provenance: { data_as_of: '2026-07-23', classification: 'internal' },
        ...overrides,
    };
}

let store;
beforeEach(() => { store = new InMemoryCanvasStore(); });

describe('create + validation + content hash', () => {
    test('creates a section with server-owned fields', () => {
        const { section, created } = store.createSection(USER_A, proposed());
        expect(created).toBe(true);
        expect(section.section_id).toMatch(/^sec_/);
        expect(section.owner_actor_id).toBe(USER_A);
        expect(section.version).toBe(0);
        expect(section.provenance.content_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(section.state.save_state).toBe('none');
    });

    test('a client-supplied owner/version is ignored', () => {
        const { section } = store.createSection(USER_A, proposed({ owner_actor_id: 'attacker', version: 99 }));
        expect(section.owner_actor_id).toBe(USER_A);
        expect(section.version).toBe(0);
    });

    test('rejects an unknown type', () => {
        expect(() => store.createSection(USER_A, proposed({ type: 'iframe_blob' }))).toThrow(/type must be/);
    });
});

describe('dedupe', () => {
    test('saving the same source twice focuses the existing section (no duplicate)', () => {
        const first = store.createSection(USER_A, proposed());
        const second = store.createSection(USER_A, proposed());
        expect(second.deduped).toBe(true);
        expect(second.section.section_id).toBe(first.section.section_id);
        expect(store.listSections(USER_A)).toHaveLength(1);
    });

    test('a different owner pinning the same source gets their own section', () => {
        store.createSection(USER_A, proposed());
        const b = store.createSection(USER_B, proposed());
        expect(b.created).toBe(true);
        expect(store.listSections(USER_A)).toHaveLength(1);
        expect(store.listSections(USER_B)).toHaveLength(1);
    });
});

describe('idempotency', () => {
    test('same key + same payload replays the original', () => {
        const a = store.createSection(USER_A, proposed(), { idempotencyKey: 'k1' });
        const b = store.createSection(USER_A, proposed(), { idempotencyKey: 'k1' });
        expect(b.replayed).toBe(true);
        expect(b.section.section_id).toBe(a.section.section_id);
    });
    test('same key + different payload → 409', () => {
        store.createSection(USER_A, proposed(), { idempotencyKey: 'k2' });
        expect(() => store.createSection(USER_A, proposed({ title: 'Different' }), { idempotencyKey: 'k2' }))
            .toThrow(CanvasConflictError);
    });
});

describe('ownership isolation', () => {
    test('user B cannot read user A section (returns null, not an error that reveals existence)', () => {
        const { section } = store.createSection(USER_A, proposed());
        expect(store.getSection(USER_B, section.section_id)).toBeNull();
    });
    test('user B cannot mutate user A section (404)', () => {
        const { section } = store.createSection(USER_A, proposed());
        expect(() => store.setSaveState(USER_B, section.section_id, 'pin')).toThrow(CanvasNotFoundError);
    });
    test('user B cannot delete user A section (404)', () => {
        const { section } = store.createSection(USER_A, proposed());
        expect(() => store.deleteSection(USER_B, section.section_id)).toThrow(CanvasNotFoundError);
        expect(store.listSections(USER_A)).toHaveLength(1);
    });
    test('list only returns own sections', () => {
        store.createSection(USER_A, proposed());
        store.createSection(USER_B, proposed({ source: { surface: 'ask-pulse', message_id: 'm1' } }));
        expect(store.listSections(USER_A)).toHaveLength(1);
    });
});

describe('save-state ops', () => {
    test('pin then bookmark yields pinned-and-bookmarked; unpin drops to bookmarked', () => {
        const { section } = store.createSection(USER_A, proposed());
        let s = store.setSaveState(USER_A, section.section_id, 'pin', 0);
        expect(s.state.save_state).toBe('pinned');
        s = store.setSaveState(USER_A, section.section_id, 'bookmark', 1);
        expect(s.state.save_state).toBe('pinned-and-bookmarked');
        s = store.setSaveState(USER_A, section.section_id, 'unpin', 2);
        expect(s.state.save_state).toBe('bookmarked');
    });

    test('note on an unsaved section atomically bookmarks it', () => {
        const { section } = store.createSection(USER_A, proposed());
        const s = store.setNote(USER_A, section.section_id, 'follow up Monday', 0);
        expect(s.state.note).toBe('follow up Monday');
        expect(s.state.save_state).toBe('bookmarked');
    });

    test('highlight on an unsaved section atomically bookmarks it', () => {
        const { section } = store.createSection(USER_A, proposed());
        const s = store.setHighlight(USER_A, section.section_id, true, 0);
        expect(s.state.emphasis).toBe('highlighted');
        expect(s.state.save_state).toBe('bookmarked');
    });

    test('reorder + group persist in layout', () => {
        const { section } = store.createSection(USER_A, proposed());
        const s = store.setLayout(USER_A, section.section_id, { order: 5, group_id: 'g1' }, 0);
        expect(s.layout.order).toBe(5);
        expect(s.layout.group_id).toBe('g1');
    });

    test('listSections filters by pinned save state', () => {
        const a = store.createSection(USER_A, proposed());
        const b = store.createSection(USER_A, proposed({ source: { surface: 'ask-pulse', message_id: 'm2' } }));
        store.setSaveState(USER_A, a.section.section_id, 'pin', 0);
        store.setSaveState(USER_A, b.section.section_id, 'bookmark', 0);
        expect(store.listSections(USER_A, { saveState: 'pinned' })).toHaveLength(1);
        expect(store.listSections(USER_A, { saveState: 'bookmarked' })).toHaveLength(1);
    });
});

describe('optimistic concurrency', () => {
    test('stale expected version → 409', () => {
        const { section } = store.createSection(USER_A, proposed());
        store.setSaveState(USER_A, section.section_id, 'pin', 0); // now version 1
        expect(() => store.setSaveState(USER_A, section.section_id, 'bookmark', 0)).toThrow(CanvasConflictError);
    });
});

describe('snapshots', () => {
    test('snapshot an existing section; restore reports current when unchanged', () => {
        const { section } = store.createSection(USER_A, proposed());
        const snap = store.createSnapshot(USER_A, { sectionId: section.section_id });
        expect(snap.snapshot_id).toMatch(/^snap_/);
        const restored = store.restoreSnapshot(USER_A, snap.snapshot_id);
        expect(restored.freshness).toBe('current');
    });

    test('a note change does NOT change content (data unchanged → current)', () => {
        const { section } = store.createSection(USER_A, proposed());
        const snap = store.createSnapshot(USER_A, { sectionId: section.section_id });
        store.setNote(USER_A, section.section_id, 'a user note', 0); // user state, not content
        expect(store.restoreSnapshot(USER_A, snap.snapshot_id).freshness).toBe('current');
    });

    test('a producer re-detection with new content → changed, and preserves human save state', () => {
        const { section } = store.createSection(USER_A, proposed());
        store.setSaveState(USER_A, section.section_id, 'pin', 0);
        store.setNote(USER_A, section.section_id, 'keep me', 1);
        const snap = store.createSnapshot(USER_A, { sectionId: section.section_id });
        // producer re-runs with a newer data_as_of (content changes)
        store.applyProducerRefresh(USER_A, section.section_id, proposed({ provenance: { data_as_of: '2026-08-01', classification: 'internal' } }));
        const restored = store.restoreSnapshot(USER_A, snap.snapshot_id);
        expect(restored.freshness).toBe('changed');
        // human state survived the producer refresh
        const live = store.getSection(USER_A, section.section_id);
        expect(live.state.save_state).toBe('pinned');
        expect(live.state.note).toBe('keep me');
    });

    test('restore reports revoked after the section is deleted', () => {
        const { section } = store.createSection(USER_A, proposed());
        const snap = store.createSnapshot(USER_A, { sectionId: section.section_id });
        store.deleteSection(USER_A, section.section_id, 0);
        expect(store.restoreSnapshot(USER_A, snap.snapshot_id).freshness).toBe('revoked');
    });

    test('user B cannot read or restore user A snapshot', () => {
        const { section } = store.createSection(USER_A, proposed());
        const snap = store.createSnapshot(USER_A, { sectionId: section.section_id });
        expect(store.getSnapshot(USER_B, snap.snapshot_id)).toBeNull();
        expect(() => store.restoreSnapshot(USER_B, snap.snapshot_id)).toThrow(CanvasNotFoundError);
    });

    test('snapshot from an unsaved proposed source creates a backing section (save_state none)', () => {
        const snap = store.createSnapshot(USER_A, { proposed: proposed({ source: { surface: 'ask-pulse', message_id: 'm9' } }) });
        const backing = store.getSection(USER_A, snap.section_id);
        expect(backing.state.save_state).toBe('none');
    });
});

describe('Databricks adapter is code-complete but externally blocked here', () => {
    test('every live op throws EXTERNAL_RUNTIME_VALIDATION_BLOCKED when not enabled', async () => {
        const db = new DatabricksCanvasStore({});
        await expect(db.listSections(USER_A)).rejects.toThrow(ExternalRuntimeBlockedError);
        await expect(db.createSection(USER_A, proposed())).rejects.toThrow(/EXTERNAL_RUNTIME_VALIDATION_BLOCKED/);
    });
    test('prepareDdl returns CREATE statements without executing anything', () => {
        const db = new DatabricksCanvasStore({});
        const ddl = db.prepareDdl();
        expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS uc_dev_snt_supplychain_01/);
        expect(ddl).toMatch(/tbl_pp_canvas_sections/);
        expect(ddl).toMatch(/tbl_pp_context_snapshots/);
    });
});
