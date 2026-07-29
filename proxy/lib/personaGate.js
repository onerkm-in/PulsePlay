/**
 * personaGate.js — server-owned persona + capability authority for Decision Assist.
 *
 * The authority a request carries is derived here from verified identity claims,
 * never from client-supplied values. A browser "Viewing as" selector is
 * presentation only; it can influence the persona only behind an explicit demo
 * opt-in (AI_ALLOW_DEMO_PERSONA=true) and only when no verified role is present.
 *
 * This module holds no I/O and no Databricks calls, so it is cheap to unit test
 * and is reused by both the legacy /insights/action-insights routes and the
 * drop-in /decision-assist connector.
 */
'use strict';

const { resolveActorContext } = require('./pulseClientContext');

const PLANNER = 'Supply Chain Planner';
const MANAGER = 'Supply Chain Manager';
// 2026-07-28 — automated callers get their OWN persona so authority and audit
// can never conflate them with a human. View-only by design: an agent may read
// prompts and evidence to enrich them, but every state change (trigger, snooze,
// approve, reject, false-positive) stays a human act behind the HITL gate.
const AGENT = 'Automated Agent';

// persona -> capability set (server-side source of truth)
const CAPABILITIES = {
    [PLANNER]: new Set([
        'can_view_prompts', 'can_view_evidence', 'can_trigger_request',
        'can_snooze', 'can_mark_false_positive',
    ]),
    [MANAGER]: new Set([
        'can_view_prompts', 'can_view_evidence', 'can_trigger_request',
        'can_snooze', 'can_mark_false_positive', 'can_approve_hitl', 'can_reject',
    ]),
    [AGENT]: new Set([
        'can_view_prompts', 'can_view_evidence',
    ]),
};

// action code -> { capability required, resulting status (null = no change), level }
const ACTIONS = {
    view_evidence:            { cap: 'can_view_evidence',       status: null,               level: 1 },
    snooze:                   { cap: 'can_snooze',              status: 'snoozed',          level: 1 },
    mark_false_positive:      { cap: 'can_mark_false_positive', status: 'false-positive',   level: 1 },
    reject:                   { cap: 'can_reject',              status: 'rejected',         level: 1 },
    approve:                  { cap: 'can_approve_hitl',        status: 'actioned',         level: 3 },
    trigger_supplier_review:  { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_replenishment:    { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_forecast_review:  { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_supplier_perf:    { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
    trigger_inventory_review: { cap: 'can_trigger_request',     status: 'pending-approval', level: 3 },
};

const MVP_ACTION_LEVEL_CEILING = 3;
const ACTIONABLE_FROM_NEW = new Set(['new', 'refreshed']);

/**
 * Resolve persona from verified IdP roles first; fall back to a demo persona
 * only when no role is present AND demo switching is enabled. The env flag is
 * read at call time so a controlled demo toggle takes effect without a restart.
 */
function resolvePersona(req) {
    // A declared agent is resolved FIRST, before IdP roles: an automated caller
    // running under a service token that happens to carry manager-ish roles
    // must never inherit MANAGER capabilities. Declaring the agent client is
    // self-demotion only — spoofing it can only REDUCE authority.
    const actor = resolveActorContext((req && req.headers) || {});
    if (actor.actorType === 'agent') return { persona: AGENT, source: 'agent-client' };
    const roles = (req.user && Array.isArray(req.user.roles)) ? req.user.roles : [];
    for (const r of roles) {
        const s = String(r).toLowerCase();
        if (/manager|approver|s&op|director|lead/.test(s)) return { persona: MANAGER, source: 'idp-role' };
        if (/planner|analyst|supply/.test(s)) return { persona: PLANNER, source: 'idp-role' };
    }
    if (process.env.AI_ALLOW_DEMO_PERSONA === 'true') {
        const claimed = String((req.get && req.get('x-pp-persona')) || (req.query && req.query.persona) || '').trim();
        if (claimed === MANAGER || claimed === PLANNER) return { persona: claimed, source: 'demo' };
    }
    return { persona: PLANNER, source: 'default' }; // least privilege
}

function caps(persona) { return CAPABILITIES[persona] || CAPABILITIES[PLANNER]; }

/**
 * What the UI may render as a persona switch. The client must NEVER hard-code
 * persona labels (plug-and-play: another org's taxonomy differs, and a real
 * IdP login makes switching meaningless — the system already knows your role).
 *
 *  - IdP role present  → not switchable; identity is a fact, no switch shown.
 *  - demo mode enabled → switchable across the personas THIS engine declares.
 *  - otherwise         → not switchable (hints are ignored server-side anyway).
 */
function describePersonaSwitch(req) {
    const roles = (req.user && Array.isArray(req.user.roles)) ? req.user.roles : [];
    const hasIdp = roles.length > 0;
    const demoOn = process.env.AI_ALLOW_DEMO_PERSONA === 'true';
    return {
        switchable: !hasIdp && demoOn,
        // The engine's own taxonomy — the single server-side source of truth.
        // Each option carries its own plain-language job description so the
        // UI can EXPLAIN the role rather than assume the reader knows the
        // proposer-vs-approver governance story.
        options: [
            { name: PLANNER, blurb: 'Watches the operation. Can propose fixes, but big actions need an approval.' },
            { name: MANAGER, blurb: 'The approver. Says yes or no to what planners propose - nothing big runs without this.' },
        ],
    };
}

/**
 * The actions this persona may take on a prompt in its current status. Terminal
 * statuses offer view only; a fresh prompt offers its own governed trigger plus
 * snooze/false-positive/reject; a pending-approval prompt offers approve/reject.
 */
function allowedActionsFor(promptRow, persona) {
    const cap = caps(persona);
    const out = [];
    if (cap.has('can_view_evidence')) out.push('view_evidence');
    const status = promptRow.status;
    if (ACTIONABLE_FROM_NEW.has(status)) {
        const triggerCode = promptRow.action_code;
        if (ACTIONS[triggerCode] && ACTIONS[triggerCode].cap === 'can_trigger_request'
            && cap.has('can_trigger_request')) out.push(triggerCode);
        if (cap.has('can_snooze')) out.push('snooze');
        if (cap.has('can_mark_false_positive')) out.push('mark_false_positive');
        if (cap.has('can_reject')) out.push('reject');
    } else if (status === 'pending-approval') {
        if (cap.has('can_approve_hitl')) out.push('approve');
        if (cap.has('can_reject')) out.push('reject');
    }
    return out;
}

module.exports = {
    PLANNER, MANAGER, AGENT, CAPABILITIES, ACTIONS, MVP_ACTION_LEVEL_CEILING, ACTIONABLE_FROM_NEW,
    resolvePersona, caps, allowedActionsFor, describePersonaSwitch,
};
