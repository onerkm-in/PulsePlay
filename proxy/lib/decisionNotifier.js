// @ts-check
'use strict';

/**
 * decisionNotifier.js — closes the second half of the HITL loop.
 *
 * The approval gate worked but was one-way: a planner's Level-3 trigger moved a
 * prompt to `pending-approval` and then NOTHING told the owner it was waiting.
 * The item just sat in the store until someone happened to open Decisions.
 *
 * This dispatches a notification when a prompt enters `pending-approval`.
 *
 * Design constraints (deliberate):
 *  • VENDOR-AGNOSTIC. No Teams/Slack/ServiceNow SDK. The "webhook" channel is a
 *    plain JSON POST, which every one of those accepts via an inbound webhook.
 *    Adding a channel = adding a case here, not touching the route.
 *  • NEVER FATAL. Notification is a side-effect of an already-committed state
 *    change. A dead webhook must not fail the user's action or roll anything
 *    back — every path resolves, and the outcome is returned for auditing.
 *  • HONEST DEFAULT. With no config the channel is `log`: it records that a
 *    notification was due and to whom. It does NOT claim an email was sent.
 *    Silence is better than a fake delivery receipt.
 *  • NO SECRETS IN THE PAYLOAD. Business content only (headline/impact/owner) —
 *    never evidence SQL, tokens, or the raw row.
 *
 * Config (proxy config.json, per profile or top-level `notifications`):
 *   { "notifications": { "channel": "log" | "webhook",
 *                        "webhookUrl": "https://…",
 *                        "linkBaseUrl": "https://pulseplay.example" } }
 */

const { SIMPLE_REQUEST_TIMEOUT_MS } = require('./timeoutPolicy');

/** Resolve notification settings: profile-level overrides top-level. */
function resolveConfig(cfg, profile) {
    const top = (cfg && cfg.notifications) || {};
    const per = (profile && profile.notifications) || {};
    const merged = { ...top, ...per };
    const channel = String(merged.channel || 'log').trim().toLowerCase();
    return {
        channel: channel === 'webhook' ? 'webhook' : 'log',
        webhookUrl: String(merged.webhookUrl || '').trim(),
        linkBaseUrl: String(merged.linkBaseUrl || '').replace(/\/$/, ''),
    };
}

/**
 * Build the notification body. Pure + separately testable so the wording can be
 * asserted without a network. Business content only.
 */
function buildPendingApprovalMessage(input) {
    const { prompt, requestedBy, persona, actionCode, linkBaseUrl } = input;
    const owner = (prompt && prompt.owner) || 'the owner';
    const headline = (prompt && prompt.headline) || (prompt && prompt.rule_id) || 'A decision prompt';
    const impact = prompt && prompt.business_impact_value != null
        ? `${prompt.business_impact_value}${prompt.business_impact_unit ? ' ' + prompt.business_impact_unit : ''}`
        : null;
    const link = linkBaseUrl ? `${linkBaseUrl}/?surface=action-insights` : null;
    return {
        kind: 'decision.pending-approval',
        prompt_id: prompt && prompt.prompt_id,
        rule_id: prompt && prompt.rule_id,
        owner,
        requested_by: requestedBy || 'unknown',
        requested_persona: persona || null,
        action: actionCode,
        severity: (prompt && prompt.severity) || null,
        headline,
        impact,
        link,
        text: `Approval needed — ${headline}. Requested by ${requestedBy || 'a planner'}`
            + ` (${actionCode}). Owner: ${owner}.`
            + (impact ? ` Impact: ${impact}.` : '')
            + (link ? ` ${link}` : ''),
    };
}

/**
 * Dispatch a pending-approval notification. Never throws.
 * @returns {Promise<{ delivered: boolean, channel: string, detail: string }>}
 */
async function notifyPendingApproval(input, deps = {}) {
    const { cfg, profile, prompt, requestedBy, persona, actionCode } = input;
    const fetchImpl = deps.fetchImpl || globalThis.fetch;
    let conf;
    try {
        conf = resolveConfig(cfg, profile);
    } catch {
        return { delivered: false, channel: 'log', detail: 'config-unreadable' };
    }

    const message = buildPendingApprovalMessage({
        prompt, requestedBy, persona, actionCode, linkBaseUrl: conf.linkBaseUrl,
    });

    if (conf.channel === 'webhook') {
        if (!conf.webhookUrl) {
            // Configured for webhook but no URL — say so rather than pretending.
            return { delivered: false, channel: 'webhook', detail: 'webhookUrl-missing' };
        }
        try {
            const resp = await fetchImpl(conf.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message),
                signal: AbortSignal.timeout(SIMPLE_REQUEST_TIMEOUT_MS),
            });
            if (!resp || !resp.ok) {
                return { delivered: false, channel: 'webhook', detail: `http-${resp ? resp.status : 'no-response'}` };
            }
            return { delivered: true, channel: 'webhook', detail: `http-${resp.status}` };
        } catch (err) {
            return { delivered: false, channel: 'webhook', detail: String((err && err.message) || err).slice(0, 120) };
        }
    }

    // `log` channel — the honest default. The caller writes this to the audit
    // trail; we do not claim delivery to a human.
    return { delivered: false, channel: 'log', detail: `pending-approval owner=${message.owner}` };
}

module.exports = { notifyPendingApproval, buildPendingApprovalMessage, resolveConfig };
