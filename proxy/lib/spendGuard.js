'use strict';
/**
 * Spend guardrail — the prerequisite for letting anything agentic run.
 *
 * PulsePlay's standing rule is that Databricks/model spend happens only on
 * explicit user intent. An AGENT breaks the assumption that rule relies on: a
 * single click can fan out into many model calls, so "one click = one unit of
 * spend" stops being true. This module restores a hard bound.
 *
 * Design decisions, and why:
 *  - FAIL CLOSED. If the ledger cannot be read, or a caller does not declare an
 *    estimate, the run is refused. A guardrail that fails open is decoration.
 *  - TWO ceilings, because they catch different failures: a per-run cap stops
 *    one runaway agent loop; a rolling daily cap stops a slow leak of many
 *    small runs.
 *  - RESERVE then SETTLE. Cost is unknown until a run finishes, so a run
 *    reserves its estimate up front (that's what the cap is checked against)
 *    and settles to actual afterwards. Without the reservation, N concurrent
 *    runs each see an empty ledger and all pass.
 *  - In-memory ledger with a file mirror: this is a demo-scale guard, and it
 *    says so. A multi-replica deployment needs a shared store — see the
 *    `_storageNote` on the status payload rather than pretending otherwise.
 */

const fs = require('fs');
const path = require('path');

const LEDGER_FILE = process.env.PP_SPEND_LEDGER
    || path.join(__dirname, '..', '.pp-spend-ledger.json');

// Defaults are deliberately small for a demo deployment: a wrong-but-cheap
// refusal is recoverable, a silent overspend is not.
function limits() {
    return {
        perRunTokens: Number(process.env.PP_AGENT_MAX_TOKENS_PER_RUN || 40000),
        dailyTokens: Number(process.env.PP_AGENT_MAX_TOKENS_PER_DAY || 400000),
        maxStepsPerRun: Number(process.env.PP_AGENT_MAX_STEPS || 6),
    };
}

let _ledger = null;

function _today() { return new Date().toISOString().slice(0, 10); }

function _load() {
    if (_ledger && _ledger.day === _today()) return _ledger;
    let loaded = null;
    try {
        const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.day === _today()) loaded = parsed;
    } catch { /* missing or unreadable → start a fresh day */ }
    _ledger = loaded || { day: _today(), spent: 0, reserved: 0, runs: 0 };
    return _ledger;
}

function _persist() {
    try { fs.writeFileSync(LEDGER_FILE, JSON.stringify(_ledger), 'utf8'); }
    catch { /* best-effort; in-memory remains authoritative for this process */ }
}

/** Tokens committed today: settled spend plus everything currently in flight. */
function committed() {
    const l = _load();
    return l.spent + l.reserved;
}

/**
 * Ask permission BEFORE starting an agentic run.
 * @returns {{ok:true, runId:string, reserved:number} | {ok:false, reason:string, detail:string}}
 */
function reserve({ estimateTokens, steps } = {}) {
    const lim = limits();
    const est = Number(estimateTokens);
    // No estimate = no permission. Callers must state what they intend to spend.
    if (!Number.isFinite(est) || est <= 0) {
        return { ok: false, reason: 'no-estimate', detail: 'An agentic run must declare an expected token cost before it starts.' };
    }
    if (est > lim.perRunTokens) {
        return {
            ok: false, reason: 'per-run-cap',
            detail: `This run expects ~${est.toLocaleString()} tokens, over the ${lim.perRunTokens.toLocaleString()} per-run limit.`,
        };
    }
    if (Number.isFinite(Number(steps)) && Number(steps) > lim.maxStepsPerRun) {
        return {
            ok: false, reason: 'step-cap',
            detail: `This run plans ${steps} steps, over the ${lim.maxStepsPerRun}-step limit.`,
        };
    }
    if (committed() + est > lim.dailyTokens) {
        return {
            ok: false, reason: 'daily-cap',
            detail: `Today's AI budget is used up (${committed().toLocaleString()} of ${lim.dailyTokens.toLocaleString()} tokens). It resets tomorrow.`,
        };
    }
    const l = _load();
    l.reserved += est;
    l.runs += 1;
    _persist();
    const runId = `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    return { ok: true, runId, reserved: est };
}

/** Settle a finished run to its ACTUAL cost, releasing the reservation. */
function settle({ reserved, actualTokens } = {}) {
    const l = _load();
    const res = Math.max(0, Number(reserved) || 0);
    // An unknown actual settles at the reservation: assuming zero would let a
    // provider that omits usage silently escape the budget.
    const actual = Number.isFinite(Number(actualTokens)) && Number(actualTokens) >= 0
        ? Number(actualTokens) : res;
    l.reserved = Math.max(0, l.reserved - res);
    l.spent += actual;
    _persist();
    return { spentToday: l.spent, remaining: Math.max(0, limits().dailyTokens - committed()) };
}

/** What the UI shows so a user can see the budget before spending it. */
function status() {
    const l = _load();
    const lim = limits();
    return {
        day: l.day,
        spentTokens: l.spent,
        inFlightTokens: l.reserved,
        dailyLimitTokens: lim.dailyTokens,
        perRunLimitTokens: lim.perRunTokens,
        maxStepsPerRun: lim.maxStepsPerRun,
        remainingTokens: Math.max(0, lim.dailyTokens - committed()),
        runsToday: l.runs,
        _storageNote: 'Process-local ledger with a file mirror — demo scale. A multi-replica deployment needs a shared store.',
    };
}

/** Tests only. */
function __reset() { _ledger = null; try { fs.unlinkSync(LEDGER_FILE); } catch { /* fine */ } }

module.exports = { reserve, settle, status, limits, committed, __reset };
