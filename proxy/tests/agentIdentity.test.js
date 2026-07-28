/**
 * Agent identity — the attribution + containment prerequisite for any agentic
 * work. Three claims, each load-bearing:
 *   1. An automated caller CAN identify itself (the client contract accepts it).
 *   2. Declaring agenthood is SELF-DEMOTION ONLY — it can never add authority,
 *      and it beats whatever roles the bearer token carries.
 *   3. An AGENT can read (prompts, evidence) but every state change is denied
 *      by the existing capability model — hitlGate needed zero changes.
 */
'use strict';

const {
    normalizePulseClient,
    resolveActorContext,
    SUPPORTED_PULSE_CLIENTS,
} = require('../lib/pulseClientContext');
const personaGate = require('../lib/personaGate');
const hitlGate = require('../lib/hitlGate');

const { AGENT, MANAGER, PLANNER, resolvePersona, allowedActionsFor, caps } = personaGate;

function agentReq(extraHeaders = {}, user = undefined) {
    return {
        headers: { 'x-pulse-client': 'pulseplay-agent', ...extraHeaders },
        user,
        get: () => null,
    };
}

describe('client contract — agents can self-identify', () => {
    test('pulseplay-agent is a supported client', () => {
        expect(SUPPORTED_PULSE_CLIENTS).toContain('pulseplay-agent');
    });

    test('aliases normalize; junk still collapses to unknown', () => {
        expect(normalizePulseClient('agent')).toBe('pulseplay-agent');
        expect(normalizePulseClient('PulsePlay_Agent')).toBe('pulseplay-agent');
        expect(normalizePulseClient('skynet')).toBe('unknown');
    });

    test('actor context carries sanitized run/parent correlation ids', () => {
        const a = resolveActorContext({
            'x-pulse-client': 'pulseplay-agent',
            'x-agent-run-id': 'run-42<script>',
            'x-parent-request-id': 'srv-123',
        });
        expect(a.actorType).toBe('agent');
        expect(a.agentRunId).toBe('run-42script');   // hostile chars stripped, id kept
        expect(a.parentRequestId).toBe('srv-123');
    });

    test('a browser request is a human actor with no agent ids', () => {
        const a = resolveActorContext({ 'x-pulse-client': 'pulseplay' });
        expect(a).toEqual({ actorType: 'human', agentRunId: null, parentRequestId: null });
    });
});

describe('persona — agenthood is self-demotion only', () => {
    test('agent client resolves to AGENT even when the token carries manager roles', () => {
        const { persona, source } = resolvePersona(agentReq({}, { roles: ['S&OP Manager', 'Director'] }));
        expect(persona).toBe(AGENT);
        expect(source).toBe('agent-client');
    });

    test('AGENT capabilities are strictly a subset of PLANNER (no new authority)', () => {
        const agentCaps = [...caps(AGENT)];
        expect(agentCaps.sort()).toEqual(['can_view_evidence', 'can_view_prompts']);
        for (const c of agentCaps) expect(caps(PLANNER).has(c)).toBe(true);
    });

    test('humans are unaffected: manager roles still resolve MANAGER without the agent header', () => {
        const req = { headers: {}, user: { roles: ['S&OP Manager'] }, get: () => null };
        expect(resolvePersona(req).persona).toBe(MANAGER);
    });
});

describe('containment — reads allowed, every state change denied', () => {
    const NEW_PROMPT = { status: 'new', action_code: 'trigger_supplier_review', approval_required: 'true' };
    const PENDING = { status: 'pending-approval', action_code: 'trigger_supplier_review', approval_required: 'true' };

    test('allowed actions on a fresh prompt: view_evidence only', () => {
        expect(allowedActionsFor(NEW_PROMPT, AGENT)).toEqual(['view_evidence']);
    });

    test('allowed actions on a pending-approval prompt: view_evidence only (never approve)', () => {
        expect(allowedActionsFor(PENDING, AGENT)).toEqual(['view_evidence']);
    });

    test('hitlGate denies every state-changing action for AGENT, unchanged code', () => {
        for (const action of ['trigger_supplier_review', 'snooze', 'mark_false_positive', 'approve', 'reject']) {
            const row = action === 'approve' || action === 'reject' ? PENDING : NEW_PROMPT;
            expect(hitlGate.evaluate(row, AGENT, action).decision).toBe('denied');
        }
    });

    test('hitlGate allows the read-only evidence view', () => {
        const v = hitlGate.evaluate(NEW_PROMPT, AGENT, 'view_evidence');
        expect(v.decision).toBe('allow');
        expect(v.newStatus).toBe('new'); // no status change from a read
    });
});
