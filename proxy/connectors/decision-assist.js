'use strict';

/**
 * decision-assist.js — the Decision Assist drop-in connector.
 *
 * Mounts the governed Decision Prompt serving routes under /decision-assist/*:
 *   GET  /decision-assist/health          store readiness
 *   GET  /decision-assist/prompts         persona-filtered proactive stack
 *   POST /decision-assist/prompts/:id/action   HITL-gated action (logged-only)
 *
 * These are the same handlers behind the legacy /insights/action-insights routes
 * (mounted from server.js for the current UI), so authority and behavior can never
 * diverge between the two paths. Authority + I/O live in the reusable libs:
 *   personaGate.js · hitlGate.js · decisionPromptStore.js
 *
 * Route-only connector: it serves any warehouse-capable profile the request
 * resolves to, so matchProfile returns false (it claims no per-request dispatch).
 */

const actionInsights = require('../lib/actionInsights');
const store = require('../lib/decisionPromptStore');

module.exports = {
    id: 'decision-assist',
    displayName: 'Decision Assist (Action Insights)',

    // Not a profile-owning backend — it serves prompts for whatever profile the
    // request resolves to. So it never claims a profile in per-request dispatch.
    matchProfile() {
        return false;
    },

    register(host) {
        const deps = {
            resolveProfile: host.resolveProfile,
            databricksRequest: host.databricksRequest,
            auditLog: host.auditLog,
            sendNoMatchingProfile: host.sendNoMatchingProfile,
        };
        actionInsights.mount(host.app, deps, {
            health: '/decision-assist/health',
            list: '/decision-assist/prompts',
            action: '/decision-assist/prompts/:id/action',
        });
    },

    // Convenience export for a health surface / tests — reports the store table.
    __meta: { promptStore: store.PROMPT_TABLE, auditStore: store.AUDIT_TABLE },
};
