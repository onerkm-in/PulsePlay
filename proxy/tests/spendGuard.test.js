const path = require('path');
process.env.PP_SPEND_LEDGER = path.join(__dirname, '.tmp-spend-ledger.json');
const guard = require('../lib/spendGuard');

/**
 * The guardrail is what makes an agentic executor safe to ship: one click can
 * fan out into many model calls, so "one click = one unit of spend" stops
 * holding. These pin the properties that make it a guard rather than decoration.
 */
describe('spendGuard', () => {
    beforeEach(() => {
        guard.__reset();
        process.env.PP_AGENT_MAX_TOKENS_PER_RUN = '10000';
        process.env.PP_AGENT_MAX_TOKENS_PER_DAY = '25000';
        process.env.PP_AGENT_MAX_STEPS = '4';
    });
    afterAll(() => guard.__reset());

    test('FAILS CLOSED when a caller does not declare an estimate', () => {
        expect(guard.reserve({}).ok).toBe(false);
        expect(guard.reserve({ estimateTokens: 0 }).ok).toBe(false);
        expect(guard.reserve({ estimateTokens: 'lots' }).ok).toBe(false);
    });

    test('refuses a run over the per-run ceiling', () => {
        const r = guard.reserve({ estimateTokens: 10001 });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('per-run-cap');
    });

    test('refuses a run planning more steps than allowed', () => {
        const r = guard.reserve({ estimateTokens: 100, steps: 5 });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('step-cap');
    });

    test('CONCURRENT runs cannot each see an empty budget (reserve before settle)', () => {
        // Without reservation both would pass and together blow the daily cap.
        expect(guard.reserve({ estimateTokens: 9000 }).ok).toBe(true);
        expect(guard.reserve({ estimateTokens: 9000 }).ok).toBe(true);
        const third = guard.reserve({ estimateTokens: 9000 });
        expect(third.ok).toBe(false);
        expect(third.reason).toBe('daily-cap');
    });

    test('settling to a lower actual returns the unused budget', () => {
        const r = guard.reserve({ estimateTokens: 9000 });
        guard.settle({ reserved: r.reserved, actualTokens: 1000 });
        expect(guard.committed()).toBe(1000);
        expect(guard.status().remainingTokens).toBe(24000);
    });

    test('an unknown actual settles at the reservation, never at zero', () => {
        const r = guard.reserve({ estimateTokens: 5000 });
        guard.settle({ reserved: r.reserved });           // provider omitted usage
        expect(guard.committed()).toBe(5000);
    });

    test('status reports the budget a user can see before spending it', () => {
        const s = guard.status();
        expect(s.dailyLimitTokens).toBe(25000);
        expect(s.remainingTokens).toBe(25000);
        expect(s._storageNote).toMatch(/demo scale/i);
    });
});
