/**
 * hitlGate.js — the governed human-in-the-loop decision for a Decision Assist action.
 *
 * Given the stored prompt, the server-resolved persona, and a requested action code,
 * it returns a single verdict the route maps to an HTTP response. All authority comes
 * from the stored prompt + the persona policy in personaGate — never from the client.
 *
 * Verdict decisions:
 *   'invalid-action'   → 400 (unknown action code)
 *   'exceeds-ceiling'  → 400 (action level above the MVP L3 ceiling; never downgraded)
 *   'denied'           → 403 (persona lacks capability or action not allowed in this status)
 *   'allow'            → apply newStatus (may be the same status for view-only L1)
 */
'use strict';

const { ACTIONS, MVP_ACTION_LEVEL_CEILING, caps, allowedActionsFor } = require('./personaGate');

function evaluate(promptRow, persona, actionCode) {
    const spec = ACTIONS[actionCode];
    if (!spec) return { decision: 'invalid-action' };
    if (spec.level > MVP_ACTION_LEVEL_CEILING) return { decision: 'exceeds-ceiling', level: spec.level };

    const permitted = caps(persona).has(spec.cap)
        && allowedActionsFor(promptRow, persona).includes(actionCode);
    if (!permitted) return { decision: 'denied', spec };

    const newStatus = spec.status || promptRow.status;
    return {
        decision: 'allow',
        spec,
        newStatus,
        level: spec.level,
        // an L3 trigger prepares a payload that stays pending until an approver acts;
        // it is logged, not sent.
        loggedOnly: spec.status === 'pending-approval',
    };
}

module.exports = { evaluate };
