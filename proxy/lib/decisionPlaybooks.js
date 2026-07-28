// @ts-check
'use strict';

/**
 * decisionPlaybooks.js — deterministic investigation plans for decision prompts.
 *
 * A fired prompt tells you WHAT is off ("OTIF 86.9% vs 94% target") and the
 * rule's own guess at WHY ("supplier late deliveries"). It does not tell you
 * which suppliers, which lanes, or whether this is a spike or a trend — so an
 * analyst re-derives that by hand every time.
 *
 * Each rule already declares a `root_cause_category`, and rules in the same
 * category always want the same follow-ups. So this maps category -> a fixed,
 * ordered set of read-only questions. New rules in a known category get an
 * investigation plan for free, with no new code.
 *
 * Deliberately NOT an LLM agent:
 *  • The questions are the same every time for the same input, so the plan is
 *    reviewable and diffable — you can argue with a playbook, not with a
 *    model's mood.
 *  • Nothing here executes. It returns questions; the caller decides whether to
 *    spend anything running them. That keeps the no-spend-without-intent rule
 *    intact and makes this safe to call anywhere.
 *  • Read-only by construction — these are questions, never actions.
 *
 * A model-driven loop is the sensible upgrade ONLY where a playbook provably
 * falls short, and by then there are real examples proving it.
 */

/** Hard cap on steps per prompt. An investigation that fans out without a
 *  ceiling is how a "helpful" feature becomes a warehouse bill. */
const MAX_STEPS = 4;

/** Category playbooks. Each step is a template + the reason it earns its cost. */
const PLAYBOOKS = Object.freeze({
    supply: [
        { id: 'supplier-concentration', why: 'Shows whether the shortfall is concentrated in a few suppliers or is systemic',
          q: c => `Which suppliers had the lowest on-time delivery rate${c.scopeClause}?` },
        { id: 'lane-concentration', why: 'Separates a supplier problem from a lane or destination problem',
          q: c => `Which plants or destinations had the lowest ${c.kpiLabel}${c.scopeClause}?` },
    ],
    demand: [
        { id: 'bias-direction', why: 'Distinguishes persistent over-forecasting from random error',
          q: c => `What is the forecast bias by month${c.scopeClause}?` },
        { id: 'volatility', why: 'Identifies whether specific products drive the inaccuracy',
          q: c => `Which products had the largest gap between forecast and actual${c.scopeClause}?` },
    ],
    inventory: [
        { id: 'stockout-depth', why: 'Quantifies how far below safety stock the position actually is',
          q: c => `Which items are furthest below their safety stock level${c.scopeClause}?` },
        { id: 'coverage', why: 'Shows whether the shortfall is about to worsen',
          q: c => `What are the days of supply by product${c.scopeClause}?` },
    ],
    quality: [
        { id: 'defect-concentration', why: 'Locates the defect source before a line-wide response',
          q: c => `Which plants had the highest defect rate${c.scopeClause}?` },
    ],
});

/** Applies to every category: is this a blip or a direction? Asked last so the
 *  cheap, specific questions come first if the caller truncates. */
const UNIVERSAL_TREND_STEP = {
    id: 'trend',
    why: 'Separates a one-off spike from a sustained decline, which changes the response',
    q: c => `How has ${c.kpiLabel} changed month over month over the last 12 months${c.scopeClause}?`,
};

function cleanText(v) {
    return typeof v === 'string' ? v.trim() : '';
}

/**
 * Build the scope phrase from whatever dimensions the prompt actually carries.
 * Never invents a scope — an unscoped question is honest; a wrongly-scoped one
 * silently answers about the wrong slice.
 */
function buildScopeClause(prompt) {
    const parts = [];
    const region = cleanText(prompt && (prompt.region || prompt.dim_region));
    const category = cleanText(prompt && (prompt.category || prompt.dim_category));
    if (region) parts.push(region);
    if (category) parts.push(category);
    if (parts.length === 0) return '';
    return ` for ${parts.join(' / ')}`;
}

/**
 * Deterministic investigation plan for a decision prompt.
 *
 * @param {object} prompt  stored prompt row (rule_id, kpi, root_cause_category, region, category…)
 * @param {{ maxSteps?: number }} [opts]
 * @returns {{ steps: Array<{id:string, question:string, why:string}>, category: string|null, reason?: string }}
 */
function buildInvestigationPlan(prompt, opts = {}) {
    if (!prompt || typeof prompt !== 'object') {
        return { steps: [], category: null, reason: 'no-prompt' };
    }
    const category = cleanText(prompt.root_cause_category).toLowerCase();
    const kpiLabel = cleanText(prompt.kpi) || cleanText(prompt.rule_id) || 'this metric';
    const scopeClause = buildScopeClause(prompt);
    const ctx = { kpiLabel, scopeClause };

    const book = PLAYBOOKS[category];
    if (!book) {
        // Unknown category: the trend question is still universally valid, and
        // one honest question beats four guessed ones.
        return {
            steps: [{ id: UNIVERSAL_TREND_STEP.id, question: UNIVERSAL_TREND_STEP.q(ctx), why: UNIVERSAL_TREND_STEP.why }],
            category: category || null,
            reason: category ? 'unknown-category' : 'no-category',
        };
    }

    const cap = Math.max(1, Math.min(Number(opts.maxSteps) || MAX_STEPS, MAX_STEPS));
    const steps = [];
    for (const s of book) {
        if (steps.length >= cap) break;
        steps.push({ id: s.id, question: s.q(ctx), why: s.why });
    }
    if (steps.length < cap) {
        steps.push({ id: UNIVERSAL_TREND_STEP.id, question: UNIVERSAL_TREND_STEP.q(ctx), why: UNIVERSAL_TREND_STEP.why });
    }
    return { steps, category };
}

/** Categories with a real playbook — useful for coverage reporting. */
function supportedCategories() {
    return Object.keys(PLAYBOOKS);
}

module.exports = { buildInvestigationPlan, supportedCategories, MAX_STEPS };
