/**
 * decisionNotifier — closes the HITL loop by telling the OWNER an approval is
 * waiting. These tests pin the three properties that matter operationally:
 * it never throws, it never claims a delivery it didn't make, and it leaks no
 * evidence/secrets into the payload.
 */
'use strict';

const { notifyPendingApproval, buildPendingApprovalMessage, resolveConfig } = require('../lib/decisionNotifier');

const PROMPT = {
    prompt_id: '634f855b95eaa51e',
    rule_id: 'SCM-FA-001',
    owner: 'Supply Chain Manager',
    severity: 'critical',
    headline: 'Forecast Accuracy is not looking good for APAC / Seasonal',
    business_impact_value: 90166,
    business_impact_unit: 'units',
    evidence_sql: 'WITH cur AS (SELECT secret_col FROM main.supply_chain.fact)',
};

describe('resolveConfig', () => {
    test('defaults to the honest log channel', () => {
        expect(resolveConfig(null, null).channel).toBe('log');
        expect(resolveConfig({}, {}).channel).toBe('log');
    });
    test('profile settings override top-level', () => {
        const c = resolveConfig(
            { notifications: { channel: 'log', webhookUrl: 'https://top' } },
            { notifications: { channel: 'webhook', webhookUrl: 'https://per-profile' } },
        );
        expect(c.channel).toBe('webhook');
        expect(c.webhookUrl).toBe('https://per-profile');
    });
    test('an unknown channel falls back to log rather than failing open', () => {
        expect(resolveConfig({ notifications: { channel: 'carrier-pigeon' } }, null).channel).toBe('log');
    });
});

describe('buildPendingApprovalMessage', () => {
    test('carries who must act, who asked, and the impact', () => {
        const m = buildPendingApprovalMessage({
            prompt: PROMPT, requestedBy: 'planner@x.com', persona: 'Supply Chain Planner',
            actionCode: 'trigger_forecast_review', linkBaseUrl: 'https://pulseplay.example/',
        });
        expect(m.owner).toBe('Supply Chain Manager');
        expect(m.requested_by).toBe('planner@x.com');
        expect(m.action).toBe('trigger_forecast_review');
        expect(m.impact).toBe('90166 units');
        expect(m.text).toMatch(/Approval needed/);
        expect(m.text).toMatch(/Supply Chain Manager/);
    });

    test('NEVER leaks evidence SQL or the raw row', () => {
        const m = buildPendingApprovalMessage({
            prompt: PROMPT, requestedBy: 'p@x', persona: 'Supply Chain Planner', actionCode: 'trigger_forecast_review',
        });
        const blob = JSON.stringify(m);
        expect(blob).not.toMatch(/evidence_sql|secret_col|WITH cur/);
    });

    test('degrades to safe wording when fields are missing', () => {
        const m = buildPendingApprovalMessage({ prompt: {}, actionCode: 'x' });
        expect(m.owner).toBe('the owner');
        expect(m.text).toContain('Approval needed');
    });
});

describe('notifyPendingApproval', () => {
    test('log channel reports NOT delivered — it never fakes a receipt', async () => {
        const r = await notifyPendingApproval({ cfg: {}, profile: {}, prompt: PROMPT, requestedBy: 'p@x', actionCode: 'trigger_forecast_review' });
        expect(r.channel).toBe('log');
        expect(r.delivered).toBe(false);
        expect(r.detail).toMatch(/Supply Chain Manager/);
    });

    test('webhook posts the message and reports delivered', async () => {
        const calls = [];
        const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
        const r = await notifyPendingApproval(
            { cfg: { notifications: { channel: 'webhook', webhookUrl: 'https://hook.example/x' } }, profile: {}, prompt: PROMPT, requestedBy: 'p@x', actionCode: 'trigger_forecast_review' },
            { fetchImpl },
        );
        expect(r.delivered).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('https://hook.example/x');
        expect(JSON.parse(calls[0].init.body).kind).toBe('decision.pending-approval');
    });

    test('a failing webhook NEVER throws and reports not-delivered', async () => {
        const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
        const r = await notifyPendingApproval(
            { cfg: { notifications: { channel: 'webhook', webhookUrl: 'https://dead' } }, profile: {}, prompt: PROMPT, actionCode: 'a' },
            { fetchImpl },
        );
        expect(r.delivered).toBe(false);
        expect(r.detail).toMatch(/ECONNREFUSED/);
    });

    test('a non-2xx webhook reports not-delivered with the status', async () => {
        const fetchImpl = async () => ({ ok: false, status: 500 });
        const r = await notifyPendingApproval(
            { cfg: { notifications: { channel: 'webhook', webhookUrl: 'https://x' } }, profile: {}, prompt: PROMPT, actionCode: 'a' },
            { fetchImpl },
        );
        expect(r.delivered).toBe(false);
        expect(r.detail).toBe('http-500');
    });

    test('webhook channel with no URL admits misconfiguration instead of silently passing', async () => {
        const r = await notifyPendingApproval(
            { cfg: { notifications: { channel: 'webhook' } }, profile: {}, prompt: PROMPT, actionCode: 'a' },
            { fetchImpl: async () => ({ ok: true, status: 200 }) },
        );
        expect(r.delivered).toBe(false);
        expect(r.detail).toBe('webhookUrl-missing');
    });
});
