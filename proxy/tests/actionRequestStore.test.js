/**
 * Event-sourced Action Request tests (v3.2 §8): lifecycle, separation of duties,
 * L3-requires-approval, idempotency, optimistic concurrency, evidence freshness,
 * modify-new-version, attest, and T+14 outcome. All derived from the event log.
 */
'use strict';

const { ActionRequestStore, RequestError, PLANNER, MANAGER } = require('../lib/actionRequestStore');

const ALICE = 'idp|t1|alice';   // planner (requester)
const BOB = 'idp|t1|bob';       // manager (approver)

let s;
beforeEach(() => {
    s = new ActionRequestStore();
    s.bindPersona(ALICE, PLANNER);
    s.bindPersona(BOB, MANAGER);
});

function prepareL3(idem) {
    return s.prepare({ actorId: ALICE, persona: PLANNER, promptId: 'pp_1', promptVersion: 3, evidenceHash: 'ev1', intentLevel: 3, payload: { note: 'x' }, idempotencyKey: idem });
}

describe('prepare', () => {
    test('L2 ends terminal at prepared-complete', () => {
        const r = s.prepare({ actorId: ALICE, persona: PLANNER, promptId: 'pp_1', promptVersion: 3, evidenceHash: 'ev1', intentLevel: 2 });
        expect(r.state).toBe('prepared-complete');
    });
    test('L3 is resumable prepared', () => {
        expect(prepareL3().state).toBe('prepared');
    });
    test('a planner cannot approve (only prepare/submit)', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        expect(() => s.approve(r.request_id, { actorId: BOB, persona: PLANNER }))
            .toThrow(/permitted/i);
    });
});

describe('L3 lifecycle + separation of duties', () => {
    test('prepare → submit → approve reaches approved-awaiting-implementation', () => {
        const r = prepareL3();
        const submitted = s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        expect(submitted.state).toBe('pending-approval');
        const approved = s.approve(r.request_id, { actorId: BOB, persona: MANAGER });
        expect(approved.state).toBe('approved-awaiting-implementation');
    });

    test('the requester cannot approve their own request', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        // even if Alice somehow had the manager persona, separation-of-duties blocks self-approval
        s.bindPersona(ALICE, MANAGER);
        expect(() => s.approve(r.request_id, { actorId: ALICE, persona: MANAGER }))
            .toThrow(/requester cannot/i);
    });

    test('an L3 request cannot be marked complete before approval', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        expect(() => s.attestImplemented(r.request_id, { actorId: BOB, persona: MANAGER, implementedAt: '2026-07-23', evidenceRef: 'ref' }))
            .toThrow(/Cannot attest-implemented from state pending-approval/);
    });

    test('reject requires rationale and moves to rejected', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        expect(() => s.reject(r.request_id, { actorId: BOB, persona: MANAGER })).toThrow(/rationale/);
        const rej = s.reject(r.request_id, { actorId: BOB, persona: MANAGER, rationale: 'not now' });
        expect(rej.state).toBe('rejected');
    });

    test('defer requires rationale + defer_until, then resubmit', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        const def = s.defer(r.request_id, { actorId: BOB, persona: MANAGER, rationale: 'later', deferUntil: '2026-08-01' });
        expect(def.state).toBe('deferred');
        expect(def.defer_until).toBe('2026-08-01');
        const re = s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        expect(re.state).toBe('pending-approval');
    });

    test('modify creates a new immutable version and stays pending-approval', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        const mod = s.modify(r.request_id, { actorId: BOB, persona: MANAGER, payload: { amount: 5 }, evidenceHash: 'ev1' });
        expect(mod.state).toBe('pending-approval');
        expect(mod.version).toBe(1);
    });
});

describe('idempotency + concurrency', () => {
    test('prepare replays under the same idempotency key', () => {
        const a = prepareL3('K');
        const b = prepareL3('K');
        expect(b.request_id).toBe(a.request_id);
    });

    test('concurrent approve/reject: exactly one transition is accepted', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        const approved = s.approve(r.request_id, { actorId: BOB, persona: MANAGER });
        expect(approved.state).toBe('approved-awaiting-implementation');
        // a second decision on the now-non-pending request is rejected
        expect(() => s.reject(r.request_id, { actorId: BOB, persona: MANAGER, rationale: 'race' }))
            .toThrow(/Cannot reject from state/);
    });

    test('stale evidence hash is rejected', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        expect(() => s.approve(r.request_id, { actorId: BOB, persona: MANAGER, evidenceHash: 'STALE' }))
            .toThrow(/evidence/i);
    });
});

describe('attest + T+14 outcome', () => {
    function toAwaiting() {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        s.approve(r.request_id, { actorId: BOB, persona: MANAGER });
        return r.request_id;
    }
    test('attest → logged-only-complete sets outcome_due_at 14 days out', () => {
        const id = toAwaiting();
        const done = s.attestImplemented(id, { actorId: ALICE, persona: PLANNER, implementedAt: '2026-07-23T00:00:00.000Z', evidenceRef: 'ticket-42' });
        expect(done.state).toBe('logged-only-complete');
        expect(done.outcome_due_at).toBe('2026-08-06T00:00:00.000Z');
    });
    test('record outcome requires a valid assessment', () => {
        const id = toAwaiting();
        s.attestImplemented(id, { actorId: ALICE, persona: PLANNER, implementedAt: '2026-07-23T00:00:00.000Z', evidenceRef: 'r' });
        expect(() => s.recordOutcome(id, { actorId: ALICE, persona: PLANNER, outcome: { assessment: 'meh' } })).toThrow(/assessment/);
        const r = s.recordOutcome(id, { actorId: ALICE, persona: PLANNER, outcome: { assessment: 'improved', baseline_kpi: 90, observed_kpi: 94 } });
        expect(r.outcome.assessment).toBe('improved');
    });
    test('outcome cannot be recorded before implementation', () => {
        const r = prepareL3();
        expect(() => s.recordOutcome(r.request_id, { actorId: ALICE, persona: PLANNER, outcome: { assessment: 'improved' } }))
            .toThrow(/after implementation/);
    });
});

describe('audit event log', () => {
    test('every transition appends an immutable event', () => {
        const r = prepareL3();
        s.submit(r.request_id, { actorId: ALICE, persona: PLANNER });
        s.approve(r.request_id, { actorId: BOB, persona: MANAGER });
        const evs = s.events(r.request_id).map((e) => e.event_type);
        expect(evs).toEqual(['prepare', 'submit', 'approve', 'assign-owner']);
        // events carry actor + prev/new state
        expect(s.events(r.request_id).every((e) => e.event_id && e.actor_id && e.new_state)).toBe(true);
    });
});
