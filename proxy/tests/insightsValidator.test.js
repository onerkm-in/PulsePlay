/**
 * insightsValidator.test.js — Cycle 47.5 (parity with the TS validator suite).
 *
 * The proxy ships a JS mirror of genieChatVisual/src/insightsStageValidator.ts
 * (see proxy/lib/insightsValidator.js). Cycle 44 added the module and noted
 * "TODO: add proxy/tests/insightsValidator.test.js" — cycle 47.5 closes that
 * TODO and pins the new semantic checks (numbers in actions, ≥2 numeric
 * tokens in trends, half-of-drivers must cite metrics) so the JS path
 * doesn't drift from the TS source of truth.
 */

const {
    validateStageOutput,
    validateCompositeResponse,
    buildRetryPrompt,
    UNIVERSAL_VALIDATED_TITLES,
} = require('../lib/insightsValidator');

describe('UNIVERSAL_VALIDATED_TITLES', () => {
    test('enumerates the validated titles', () => {
        expect(UNIVERSAL_VALIDATED_TITLES.has('RECOMMENDED ACTIONS')).toBe(true);
        expect(UNIVERSAL_VALIDATED_TITLES.has('TRENDS')).toBe(true);
        expect(UNIVERSAL_VALIDATED_TITLES.has('RISKS')).toBe(true);
        expect(UNIVERSAL_VALIDATED_TITLES.has('DRIVERS')).toBe(true);
        expect(UNIVERSAL_VALIDATED_TITLES.has('OPPORTUNITIES')).toBe(true);
    });
});

describe('RECOMMENDED ACTIONS', () => {
    test('passes a 3-item imperative list with metrics', () => {
        const body = [
            '1. Reallocate budget from Furniture (2.49% margin) to Technology (17.40%) to lift portfolio margin by 1pp.',
            '2. Audit Furniture pricing in Central region; recover 2pp by Q4.',
            '3. Pilot Consumer-segment retention in West (1,611 orders) to defend the leading order base.',
        ].join('\n');
        expect(validateStageOutput('RECOMMENDED ACTIONS', body)).toEqual({ ok: true });
    });

    test('fails when body is descriptive prose (cycle 23 noun-phrase guard)', () => {
        const body = 'Profit margins vary widely across segments and categories.';
        const r = validateStageOutput('RECOMMENDED ACTIONS', body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/numbered list|prose|noun/);
    });

    test('fails when no item cites a numeric impact (cycle 47.5 semantic)', () => {
        const body = [
            '1. Reallocate budget to improve Furniture performance soon.',
            '2. Audit pricing in Central to recover lost ground.',
            '3. Pilot a retention offer in West to defend the order base.',
        ].join('\n');
        const r = validateStageOutput('RECOMMENDED ACTIONS', body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/numeric/);
    });
});

describe('TRENDS', () => {
    test('passes when body cites multiple numeric values', () => {
        const body = 'Sales rose from $484K in 2014 to $733K in 2017 (+51%).';
        expect(validateStageOutput('TRENDS', body)).toEqual({ ok: true });
    });

    test('fails when body has fewer than 2 numeric tokens (cycle 47.5)', () => {
        const body = 'Sales increased by a notable amount this year.';
        const r = validateStageOutput('TRENDS', body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/numeric/);
    });
});

describe('RISKS', () => {
    test('passes a 3-bullet list with magnitudes', () => {
        const body = [
            '- **Margin compression in Furniture**: 2.49% margin vs 17.40% in Technology — 14.9pp gap.',
            '- **Central underperformance**: 23% of orders, only 9% of profit.',
            '- **Customer concentration**: top 5 customers = 18% of $733K total sales.',
        ].join('\n');
        expect(validateStageOutput('RISKS', body)).toEqual({ ok: true });
    });

    test('fails when no risk cites a numeric magnitude (cycle 47.5)', () => {
        const body = [
            '- **Customer concentration**: a few customers drive most sales.',
            '- **Margin compression**: Furniture is dragging the portfolio down.',
            '- **Regional risk**: Central is underperforming versus other regions.',
        ].join('\n');
        const r = validateStageOutput('RISKS', body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/numeric magnitude/);
    });
});

describe('DRIVERS', () => {
    test('passes when at least half the items cite metrics', () => {
        const body = '- **Technology**: $836K (52%)\n- **West region**: 1,611 orders';
        expect(validateStageOutput('DRIVERS', body)).toEqual({ ok: true });
    });

    test('fails when no driver cites a metric (cycle 47.5)', () => {
        const body = '- Top driver: Technology revenue\n- Second driver: West region order volume';
        const r = validateStageOutput('DRIVERS', body);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/cite a metric/);
    });
});

describe('KPI SNAPSHOT', () => {
    test('passes a markdown pipe table', () => {
        const body = '| Metric | Value |\n|---|---|\n| Sales | $733K |\n| Profit | $93K |';
        expect(validateStageOutput('KPI SNAPSHOT', body)).toEqual({ ok: true });
    });

    test('passes a metric-bullet list with ≥3 values', () => {
        const body = '- Sales: $733K\n- Profit: $93K\n- Margin: 12.7%';
        expect(validateStageOutput('KPI SNAPSHOT', body)).toEqual({ ok: true });
    });

    test('fails when body has < 3 metrics and no table', () => {
        const body = 'Sales were strong overall this period.';
        const r = validateStageOutput('KPI SNAPSHOT', body);
        expect(r.ok).toBe(false);
    });
});

describe('Custom / unknown titles', () => {
    test('returns ok:true for unrecognized titles', () => {
        expect(validateStageOutput('CATEGORY MIX', 'whatever the author wants').ok).toBe(true);
        expect(validateStageOutput('REGIONAL BREAKDOWN', 'free text').ok).toBe(true);
    });
});

describe('validateCompositeResponse', () => {
    test('parses multi-section composite and reports per-section status', () => {
        const composite = [
            '## TRENDS',
            'Sales rose from $484K in 2014 to $733K in 2017 (+51%).',
            '',
            '## RISKS',
            '- **Margin compression in Furniture**: 2.49% margin vs 17.40% in Technology.',
            '- **Central underperformance**: 23% of orders, 9% of profit.',
            '- **Customer concentration**: top 5 = 18% of sales.',
        ].join('\n');
        const r = validateCompositeResponse(composite);
        expect(r.ok).toBe(true);
        expect(r.sections.length).toBe(2);
        expect(r.failures.length).toBe(0);
    });

    test('flags failing sections and exposes firstFailure', () => {
        const composite = [
            '## TRENDS',
            'Sales were strong this year.',  // < 2 numeric tokens — cycle 47.5 fail
        ].join('\n');
        const r = validateCompositeResponse(composite);
        expect(r.ok).toBe(false);
        expect(r.failures.length).toBe(1);
        expect(r.firstFailure.title).toBe('TRENDS');
    });

    test('returns ok:true on null/empty content', () => {
        expect(validateCompositeResponse(null)).toEqual({ ok: true, sections: [] });
        expect(validateCompositeResponse('')).toEqual({ ok: true, sections: [] });
    });
});

describe('buildRetryPrompt', () => {
    test('includes the directive and the failed body verbatim', () => {
        const original = 'Original instructions go here.';
        const failed = 'Profit margins vary widely…';
        const retry = buildRetryPrompt(original, 'RECOMMENDED ACTIONS', failed, {
            ok: false,
            retryDirective: 'STRUCTURAL FAILURE: rewrite as 3 imperative actions.',
        });
        expect(retry).toContain('STRUCTURAL FAILURE: rewrite as 3 imperative actions.');
        expect(retry).toContain('Profit margins vary widely…');
        expect(retry).toContain('Original instructions go here.');
    });

    test('caps the failed body at 1500 chars', () => {
        const huge = 'x'.repeat(5000);
        const retry = buildRetryPrompt('orig', 'TRENDS', huge, { ok: false });
        // The huge string should be truncated to ≤1500 chars in the embedded snippet.
        const matches = retry.match(/x{1500,}/g);
        expect(matches).not.toBeNull();
        expect(matches[0].length).toBeLessThanOrEqual(1500);
    });
});
