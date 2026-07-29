'use strict';
/**
 * Agentic investigation of ONE governed decision.
 *
 * What this is: a bounded, read-only agent that asks the data a short series
 * of follow-up questions about a decision the deterministic engine already
 * raised, and returns what it found with provenance.
 *
 * What this is NOT, deliberately, and why each line matters in an enterprise:
 *
 *  - It NEVER mutates decision state. Severity, status, approval and
 *    permissions are set by the governed engine and the HITL gate. An agent
 *    that could change them would put a non-deterministic component inside an
 *    audited control path. This module has no write path at all.
 *  - It NEVER runs free-form SQL of its own composition. It asks questions;
 *    the Genie space resolves them under the space's own governance.
 *  - It is BOUNDED before it starts: the spend guard must approve an estimate,
 *    and the plan length is capped. An agent whose cost is discovered only
 *    afterwards is not shippable.
 *  - It FAILS CLOSED and it fails SOFT: no budget, no agent, or a dead step
 *    returns a refusal/partial with the reason — the decision surface keeps
 *    working, because the deterministic path is the product and this is an
 *    enhancement on top of it.
 *
 * IDENTITY CAVEAT (the real enterprise blocker, surfaced not hidden):
 * steps execute under the PROFILE's credential, not the calling user's. On a
 * workspace where Unity Catalog grants differ per user, that means results are
 * scoped to the service identity. Every response therefore carries
 * `identity: { mode, onBehalfOfUser: false, caveat }` so a caller can display
 * it, and enterprise deployments should route this through on-behalf-of-user
 * auth (Databricks managed MCP) before enabling it for real users. See
 * AGENDA MCP-CONNECTOR.
 */

const spendGuard = require('./spendGuard');

// Rough cost of one Genie round trip on this dataset. Used ONLY to ask the
// guard for permission up front; actual settle happens after the run.
const NL = String.fromCharCode(10);
const EST_TOKENS_PER_STEP = Number(process.env.PP_AGENT_EST_TOKENS_PER_STEP || 4000);

/**
 * The plan. Fixed, inspectable, and derived from the decision's own fields —
 * not model-authored. A model-authored plan would need its own guardrail and
 * could not be reviewed before it ran.
 */
function buildPlan(prompt) {
    // Grounding matters more than phrasing: a question that says "the affected
    // area" when the rule is supplier-scoped (no region/category) makes the
    // space ask for clarification instead of answering — observed live. Every
    // question therefore carries the decision's own finding as context.
    const slice = [prompt.region, prompt.category].filter(Boolean).join(' / ');
    const kpi = prompt.kpi || 'this measure';
    const where = slice || (prompt.issue ? 'the area described below' : 'the affected area');
    const context = [
        `Context — a monitoring rule flagged this:`,
        prompt.headline ? `"${String(prompt.headline).slice(0, 240)}"` : '',
        prompt.issue && prompt.issue !== prompt.headline ? String(prompt.issue).slice(0, 300) : '',
        `Answer with data. If a detail is ambiguous, choose the most reasonable reading and state it — do not ask a clarifying question.`,
    ].filter(Boolean).join(NL);
    const ground = (q) => context + NL + NL + 'Question: ' + q;
    return [
        {
            id: 'trend',
            label: 'Is it getting worse?',
            question: ground(`For ${where}, how has ${kpi} changed month over month across the last 6 months? Return month and value.`),
        },
        {
            id: 'compare',
            label: 'Is it specific to this area?',
            question: ground(`Compare ${kpi} for ${where} against the other slices in the latest month. Return the comparison.`),
        },
        {
            id: 'driver',
            label: "What's driving it?",
            question: ground(`For ${where} in the latest month, which sub-category or supplier contributes most to the ${kpi} shortfall? Return the top contributors.`),
        },
    ];
}

/**
 * Run the investigation.
 *
 * @param {object} deps
 *   - askGenie(profileName, question): the host's existing Genie round-trip.
 *   - auditLog(entry): the host's audit sink.
 * @returns {Promise<object>} never throws — failures come back as data.
 */
async function investigate({ prompt, profileName, steps, deps }) {
    const { askGenie, auditLog } = deps || {};
    if (typeof askGenie !== 'function') {
        return { ok: false, reason: 'not-configured', detail: 'No agent backend is wired for this deployment.' };
    }
    if (!prompt || !prompt.prompt_id) {
        return { ok: false, reason: 'no-prompt', detail: 'An investigation needs a decision to investigate.' };
    }

    const limits = spendGuard.limits();
    const plan = buildPlan(prompt).slice(0, Math.max(1, Math.min(
        Number(steps) || 3, limits.maxStepsPerRun,
    )));

    // Permission BEFORE any spend. A refusal here is a normal outcome, not an
    // error — the caller shows the reason and the page keeps working.
    const grant = spendGuard.reserve({
        estimateTokens: plan.length * EST_TOKENS_PER_STEP,
        steps: plan.length,
    });
    if (!grant.ok) {
        if (auditLog) auditLog({ action: 'agentic.investigate.refused', status: 429, detail: grant.reason });
        return { ok: false, reason: grant.reason, detail: grant.detail, budget: spendGuard.status() };
    }

    const findings = [];
    let actualTokens = 0;
    try {
        for (const step of plan) {
            let res;
            try {
                res = await askGenie(profileName, step.question);
            } catch (err) {
                res = { ok: false, answer: String(err?.message || err).slice(0, 200) };
            }
            const usage = Number(res?.usage?.total_tokens);
            if (Number.isFinite(usage)) actualTokens += usage;
            findings.push({
                id: step.id,
                label: step.label,
                question: step.question,
                ok: !!res?.ok,
                answer: String(res?.answer || '').slice(0, 4000),
                // Provenance so a reader can trace any claim back to its run.
                conversationId: res?.conversationId || null,
                messageId: res?.messageId || null,
            });
            // One dead step does not sink the run; report what we have.
            if (!res?.ok && findings.filter(f => !f.ok).length >= 2) break;
        }
    } finally {
        // Settle even on an unexpected throw — a reservation that is never
        // released would silently shrink the day's budget.
        spendGuard.settle({ reserved: grant.reserved, actualTokens: actualTokens || undefined });
    }

    if (auditLog) {
        auditLog({
            action: 'agentic.investigate',
            status: 200,
            detail: JSON.stringify({
                prompt_id: prompt.prompt_id, rule_id: prompt.rule_id,
                steps: findings.length, ok: findings.filter(f => f.ok).length,
                runId: grant.runId,
            }),
        });
    }

    return {
        ok: findings.some(f => f.ok),
        runId: grant.runId,
        prompt_id: prompt.prompt_id,
        findings,
        // Read-only contract, stated in the payload so a UI cannot imply more.
        effects: { mutatedDecision: false, changedSeverity: false, changedPermissions: false },
        identity: {
            mode: 'service-profile',
            onBehalfOfUser: false,
            caveat: 'Answers are scoped to the connector\'s service identity, not your personal data permissions.',
        },
        budget: spendGuard.status(),
    };
}

module.exports = { investigate, buildPlan, EST_TOKENS_PER_STEP };
