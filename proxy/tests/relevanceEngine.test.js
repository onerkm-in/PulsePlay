/**
 * Relevance engine tests (v3.2 §14): governed tier dominates personal relevance,
 * ≤3 suggestions, deterministic "why", and control semantics (follow / dismiss 7d /
 * suppress 30d / correct / reset) with an injectable clock.
 */
'use strict';

const { RelevanceEngine, MAX_SUGGESTIONS } = require('../lib/relevanceEngine');

const OWNER = 'idp|t|alice';
let t;
function clock() { return t; }
let e;
beforeEach(() => { t = 1_000_000; e = new RelevanceEngine(clock); });

function cand(over) {
    return { content_hash: 'h', tier: 'medium', rule_id: 'R', entity_scope: 'US', kpi: 'OTIF', ...over };
}

describe('governed tier dominates personal relevance', () => {
    test('a followed medium item cannot outrank a critical item', () => {
        e.follow(OWNER, 'OTIF', 'US');
        const out = e.suggest(OWNER, [
            cand({ content_hash: 'crit', tier: 'critical', kpi: 'FILL' }),
            cand({ content_hash: 'med', tier: 'medium', kpi: 'OTIF' }), // followed
        ]);
        expect(out[0].content_hash).toBe('crit');
    });

    test('within the same tier, a followed KPI ranks first with the right reason', () => {
        e.follow(OWNER, 'OTIF', 'US');
        const out = e.suggest(OWNER, [
            cand({ content_hash: 'a', tier: 'high', kpi: 'FILL' }),
            cand({ content_hash: 'b', tier: 'high', kpi: 'OTIF' }),
        ]);
        expect(out[0].content_hash).toBe('b');
        expect(out[0].why_factor).toBe('followed-kpi');
    });

    test('pending-approval relevance ranks within tier and has its reason', () => {
        const out = e.suggest(OWNER, [
            cand({ content_hash: 'x', tier: 'high' }),
            cand({ content_hash: 'y', tier: 'high', related_to_pending_approval: true }),
        ]);
        expect(out[0].content_hash).toBe('y');
        expect(out[0].why).toMatch(/pending approval/i);
    });
});

test('never returns more than 3 suggestions', () => {
    const many = Array.from({ length: 10 }, (_, i) => cand({ content_hash: `h${i}` }));
    expect(e.suggest(OWNER, many)).toHaveLength(MAX_SUGGESTIONS);
});

describe('control semantics', () => {
    test('dismiss hides the exact item for 7 days, then it returns', () => {
        e.dismiss(OWNER, 'h');
        expect(e.suggest(OWNER, [cand()])).toHaveLength(0);
        t += 8 * 24 * 60 * 60 * 1000; // +8 days
        expect(e.suggest(OWNER, [cand()])).toHaveLength(1);
    });

    test('suppress hides rule+scope+kpi for 30 days', () => {
        e.suppress(OWNER, 'R', 'US', 'OTIF');
        expect(e.suggest(OWNER, [cand()])).toHaveLength(0);
        t += 31 * 24 * 60 * 60 * 1000;
        expect(e.suggest(OWNER, [cand()])).toHaveLength(1);
    });

    test('excludeContentHashes dedupes against inbox/canvas', () => {
        expect(e.suggest(OWNER, [cand()], { excludeContentHashes: ['h'] })).toHaveLength(0);
    });

    test('correct marks a reason inapplicable but does not change tier/eligibility', () => {
        e.follow(OWNER, 'OTIF', 'US');
        e.correct(OWNER, 'followed-kpi');
        const out = e.suggest(OWNER, [cand({ content_hash: 'b', tier: 'high', kpi: 'OTIF' })]);
        expect(out).toHaveLength(1);                 // still eligible
        expect(out[0].why_factor).not.toBe('followed-kpi'); // reason downgraded
    });

    test('reset clears all non-audit preferences', () => {
        e.follow(OWNER, 'OTIF', 'US'); e.dismiss(OWNER, 'h'); e.suppress(OWNER, 'R', 'US', 'OTIF');
        e.reset(OWNER);
        const p = e.profile(OWNER);
        expect(p.follows).toHaveLength(0);
        expect(p.dismissed).toHaveLength(0);
        expect(p.suppressed).toHaveLength(0);
    });

    test('profile exposes each explicit preference for inspection', () => {
        e.follow(OWNER, 'OTIF', 'US');
        const p = e.profile(OWNER);
        expect(p.follows[0].kpi).toBe('OTIF');
    });
});

describe('invariant: relevance cannot alter authority', () => {
    test('a suggestion carries no permission/severity mutation — only ordering + reason', () => {
        const out = e.suggest(OWNER, [cand({ content_hash: 'a', tier: 'critical', severity: 'critical' })]);
        // the engine returns the candidate as-is plus suggestion_id/why; it never writes
        // severity/tier/permission fields itself.
        expect(out[0].severity).toBe('critical');
        expect(out[0].tier).toBe('critical');
        expect(out[0]).toHaveProperty('why');
    });
});
