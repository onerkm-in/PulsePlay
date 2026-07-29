const path = require('path');
process.env.PP_SPEND_LEDGER = path.join(__dirname, '.tmp-agentic-ledger.json');
const spendGuard = require('../lib/spendGuard');
const { investigate, buildPlan } = require('../lib/agenticInvestigate');

/**
 * The executor is allowed to run inside a governed decision path only because
 * of the properties below. Each test is one of the reasons an enterprise
 * reviewer would ask about.
 */
const PROMPT = {
    prompt_id: 'p1', rule_id: 'SCM-OTIF-001', kpi: 'OTIF',
    region: 'EMEA', category: 'Carbonated Drinks', severity: 'high', status: 'new',
};

function okAsker(answer = 'because supplier X slipped') {
    return jest.fn().mockResolvedValue({ ok: true, answer, conversationId: 'c1', messageId: 'm1' });
}

describe('agentic investigate', () => {
    beforeEach(() => {
        spendGuard.__reset();
        process.env.PP_AGENT_MAX_TOKENS_PER_RUN = '100000';
        process.env.PP_AGENT_MAX_TOKENS_PER_DAY = '100000';
        process.env.PP_AGENT_MAX_STEPS = '6';
    });
    afterAll(() => spendGuard.__reset());

    test('the plan is fixed and inspectable BEFORE it runs (not model-authored)', () => {
        const plan = buildPlan(PROMPT);
        expect(plan.map(s => s.id)).toEqual(['trend', 'compare', 'driver']);
        // questions are built from the decision's own fields
        expect(plan[0].question).toContain('EMEA / Carbonated Drinks');
        expect(plan[0].question).toContain('OTIF');
        // grounded in the decision's own finding, so the space answers instead
        // of asking a clarifying question (observed live before this)
        expect(plan[0].question).toContain('a monitoring rule flagged this');
    });

    test('NEVER mutates the decision — the read-only contract is in the payload', async () => {
        const r = await investigate({ prompt: PROMPT, profileName: 'g', deps: { askGenie: okAsker() } });
        expect(r.effects).toEqual({ mutatedDecision: false, changedSeverity: false, changedPermissions: false });
    });

    test('surfaces the identity caveat rather than hiding it', async () => {
        const r = await investigate({ prompt: PROMPT, profileName: 'g', deps: { askGenie: okAsker() } });
        expect(r.identity.onBehalfOfUser).toBe(false);
        expect(r.identity.caveat).toMatch(/service identity/i);
    });

    test('refuses to start when the budget is gone, and says why', async () => {
        process.env.PP_AGENT_MAX_TOKENS_PER_DAY = '1000';   // less than one step
        const ask = okAsker();
        const r = await investigate({ prompt: PROMPT, profileName: 'g', deps: { askGenie: ask } });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('daily-cap');
        expect(ask).not.toHaveBeenCalled();                  // no spend on a refusal
    });

    test('is bounded by the step cap even if more steps are requested', async () => {
        process.env.PP_AGENT_MAX_STEPS = '2';
        const ask = okAsker();
        await investigate({ prompt: PROMPT, profileName: 'g', steps: 99, deps: { askGenie: ask } });
        expect(ask).toHaveBeenCalledTimes(2);
    });

    test('FAILS SOFT: a throwing backend yields findings, not an exception', async () => {
        const ask = jest.fn().mockRejectedValue(new Error('genie down'));
        const r = await investigate({ prompt: PROMPT, profileName: 'g', deps: { askGenie: ask } });
        expect(r.ok).toBe(false);
        expect(r.findings.length).toBeGreaterThan(0);
        expect(r.findings[0].answer).toContain('genie down');
    });

    test('releases its budget reservation even when steps fail', async () => {
        const before = spendGuard.status().remainingTokens;
        const ask = jest.fn().mockRejectedValue(new Error('boom'));
        await investigate({ prompt: PROMPT, profileName: 'g', deps: { askGenie: ask } });
        // reservation released; only settled (estimated) cost is committed
        expect(spendGuard.status().inFlightTokens).toBe(0);
        expect(spendGuard.status().remainingTokens).toBeLessThanOrEqual(before);
    });

    test('refuses cleanly when no agent backend is wired', async () => {
        const r = await investigate({ prompt: PROMPT, profileName: 'g', deps: {} });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('not-configured');
    });
});
