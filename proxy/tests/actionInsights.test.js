/**
 * Unit tests for the Action Insights serving module (pure logic; no Databricks).
 */
'use strict';

const { __test } = require('../lib/actionInsights');
const { resolvePersona, allowedActionsFor, ACTIONS, CAPABILITIES, sq, isPromptId } = __test;

const PLANNER = 'Supply Chain Planner';
const MANAGER = 'Supply Chain Manager';

function mockReq({ roles = null, header = null, query = {} } = {}) {
    return {
        user: roles ? { roles, email: 'u@x.com' } : {},
        query,
        get: (h) => (h.toLowerCase() === 'x-pp-persona' ? header : null),
    };
}

describe('resolvePersona (server-side, IdP-first)', () => {
    test('maps a manager/approver role to Manager', () => {
        expect(resolvePersona(mockReq({ roles: ['S&OP Approver'] })).persona).toBe(MANAGER);
    });
    test('maps a planner role to Planner', () => {
        expect(resolvePersona(mockReq({ roles: ['Demand Planner'] })).persona).toBe(PLANNER);
    });
    test('ignores demo header when a verified role is present', () => {
        const r = resolvePersona(mockReq({ roles: ['Demand Planner'], header: MANAGER }));
        expect(r.persona).toBe(PLANNER);
        expect(r.source).toBe('idp-role');
    });
    test('accepts demo persona only when no role present', () => {
        const r = resolvePersona(mockReq({ header: MANAGER }));
        expect(r.persona).toBe(MANAGER);
        expect(r.source).toBe('demo');
    });
    test('defaults to least-privilege Planner', () => {
        expect(resolvePersona(mockReq()).persona).toBe(PLANNER);
    });
});

describe('allowedActionsFor (capability + status gated)', () => {
    const newPrompt = { status: 'new', action_code: 'trigger_supplier_review' };
    test('Planner on a new prompt can trigger/snooze/false-positive/view but not approve/reject', () => {
        const a = allowedActionsFor(newPrompt, PLANNER);
        expect(a).toEqual(expect.arrayContaining([
            'view_evidence', 'trigger_supplier_review', 'snooze', 'mark_false_positive']));
        expect(a).not.toContain('approve');
        expect(a).not.toContain('reject');
    });
    test('Manager can approve/reject a pending-approval prompt', () => {
        const a = allowedActionsFor({ status: 'pending-approval', action_code: 'trigger_supplier_review' }, MANAGER);
        expect(a).toEqual(expect.arrayContaining(['approve', 'reject', 'view_evidence']));
    });
    test('terminal status offers view only', () => {
        expect(allowedActionsFor({ status: 'actioned', action_code: 'trigger_supplier_review' }, MANAGER))
            .toEqual(['view_evidence']);
    });
});

describe('governance invariants', () => {
    test('no action exceeds the MVP Level-3 ceiling', () => {
        for (const [code, spec] of Object.entries(ACTIONS)) {
            expect(spec.level).toBeLessThanOrEqual(3);
        }
    });
    test('Planner cannot approve; Manager can', () => {
        expect(CAPABILITIES[PLANNER].has('can_approve_hitl')).toBe(false);
        expect(CAPABILITIES[MANAGER].has('can_approve_hitl')).toBe(true);
    });
});

describe('sql safety helpers', () => {
    test('sq escapes single quotes', () => {
        expect(sq("a'b")).toBe("'a''b'");
        expect(sq(null)).toBe('NULL');
    });
    test('isPromptId accepts 16-hex only', () => {
        expect(isPromptId('0123456789abcdef')).toBe(true);
        expect(isPromptId("abc'; DROP")).toBe(false);
        expect(isPromptId('short')).toBe(false);
    });
});
