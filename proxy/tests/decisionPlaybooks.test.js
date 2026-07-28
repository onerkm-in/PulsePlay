/**
 * decisionPlaybooks — deterministic investigation plans.
 *
 * The properties worth pinning are the ones that keep this safe to call
 * anywhere: it is bounded, it never invents scope, it is reproducible, and it
 * returns questions rather than doing anything.
 */
'use strict';

const { buildInvestigationPlan, supportedCategories, MAX_STEPS } = require('../lib/decisionPlaybooks');

const OTIF = {
    rule_id: 'SCM-OTIF-001',
    kpi: 'OTIF',
    root_cause_category: 'supply',
    region: 'EMEA',
    category: 'Refrigeration',
};

describe('buildInvestigationPlan — bounded', () => {
    test('never exceeds MAX_STEPS', () => {
        const plan = buildInvestigationPlan(OTIF, { maxSteps: 99 });
        expect(plan.steps.length).toBeLessThanOrEqual(MAX_STEPS);
    });

    test('honours a lower caller cap', () => {
        expect(buildInvestigationPlan(OTIF, { maxSteps: 1 }).steps).toHaveLength(1);
    });

    test('always returns at least one step for a known category', () => {
        for (const c of supportedCategories()) {
            const plan = buildInvestigationPlan({ kpi: 'X', root_cause_category: c });
            expect(plan.steps.length).toBeGreaterThan(0);
        }
    });
});

describe('buildInvestigationPlan — never invents scope', () => {
    test('includes the scope when the prompt carries it', () => {
        const plan = buildInvestigationPlan(OTIF);
        expect(plan.steps.every(s => s.question.includes('EMEA / Refrigeration'))).toBe(true);
    });

    test('asks unscoped questions when the prompt has no dimensions', () => {
        const plan = buildInvestigationPlan({ kpi: 'OTIF', root_cause_category: 'supply' });
        expect(plan.steps.every(s => !/ for /.test(s.question))).toBe(true);
    });
});

describe('buildInvestigationPlan — degrades honestly', () => {
    test('unknown category still yields the universally-valid trend question', () => {
        const plan = buildInvestigationPlan({ kpi: 'OTIF', root_cause_category: 'wormholes' });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0].id).toBe('trend');
        expect(plan.reason).toBe('unknown-category');
    });

    test('missing category is reported, not guessed', () => {
        const plan = buildInvestigationPlan({ kpi: 'OTIF' });
        expect(plan.reason).toBe('no-category');
        expect(plan.category).toBeNull();
    });

    test('a non-object prompt returns no steps rather than throwing', () => {
        expect(buildInvestigationPlan(null).steps).toEqual([]);
        expect(buildInvestigationPlan('nope').steps).toEqual([]);
    });

    test('falls back to rule_id when kpi is absent, never a blank metric name', () => {
        const plan = buildInvestigationPlan({ rule_id: 'SCM-FA-001', root_cause_category: 'demand' });
        expect(plan.steps.every(s => s.question.trim().length > 0)).toBe(true);
        expect(plan.steps.some(s => /SCM-FA-001|forecast/i.test(s.question))).toBe(true);
    });
});

describe('buildInvestigationPlan — reproducible and explainable', () => {
    test('same input produces an identical plan', () => {
        expect(buildInvestigationPlan(OTIF)).toEqual(buildInvestigationPlan(OTIF));
    });

    test('every step explains why it earns its cost', () => {
        const plan = buildInvestigationPlan(OTIF);
        for (const s of plan.steps) {
            expect(typeof s.why).toBe('string');
            expect(s.why.trim().length).toBeGreaterThan(0);
            expect(s.id).toBeTruthy();
        }
    });

    test('supply playbook asks about suppliers before the generic trend', () => {
        const plan = buildInvestigationPlan(OTIF);
        expect(plan.steps[0].question).toMatch(/supplier/i);
        expect(plan.steps[plan.steps.length - 1].id).toBe('trend');
    });

    test('returns questions only — no SQL, no action codes', () => {
        const blob = JSON.stringify(buildInvestigationPlan(OTIF));
        expect(blob).not.toMatch(/SELECT |UPDATE |DELETE |trigger_/i);
    });
});
