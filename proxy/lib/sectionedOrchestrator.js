// @ts-check
'use strict';

const { randomUUID } = require('crypto');

/**
 * Sectioned orchestrator — Phase D.1.
 *
 * Implements the "1-then-3" staged rendering flow described in
 * docs/STAGED_RENDERING.md, generalised to ANY ordered stage schedule.
 *
 * The orchestrator is intentionally TRANSPORT-AGNOSTIC. It returns an
 * async iterable of events; the SSE endpoint (Phase D.2) wraps the iterable
 * into `text/event-stream` frames, and unit tests consume it directly.
 *
 * It is also LLM-AGNOSTIC. Callers inject:
 *   • `runProbe({ ir, request, signal })` → async, resolves to probe rows
 *   • `runSection({ sectionId, ir, request, probeRows, headlineResult, signal })`
 *     → async, resolves to `{ body, sql?, usage? }`
 *
 * That keeps the orchestrator unit-testable with synchronous stubs and
 * lets the endpoint wire the real Genie / Foundation Model translators in
 * without bleeding their concerns into the orchestrator core.
 *
 * Schedule shape (user-amended 2026-05-20: HEADLINE alone first):
 *   [
 *     { sections: ['HEADLINE'],                              spreadMs: 0    },
 *     { sections: ['KPI', 'TRENDS'],                         spreadMs: 2000 },
 *     { sections: ['RISKS', 'RECOMMENDED_ACTIONS'],          spreadMs: 0    },
 *     { sections: ['OPPORTUNITIES'],                         spreadMs: 0    },
 *   ]
 *
 *   • Stage N waits for ALL sections in stage N-1 to complete (or fail)
 *     before any section in stage N starts. HEADLINE running alone in
 *     stage 0 guarantees later sections see its result in the shared
 *     conversation context (Genie reuses the same `conversation_id`
 *     across all section calls).
 *   • Within a stage, sections start concurrently but are shifted by
 *     `spreadMs` between starts (so the LLM backend isn't hit with a
 *     thundering herd).
 *   • `spreadMs=0` means all sections in the stage start in the same tick.
 *
 * Event vocabulary (matches docs/STAGED_RENDERING.md):
 *   { kind: 'probe-started',     renderId, probeId }
 *   { kind: 'probe-completed',   renderId, probeId, rows, durationMs }
 *   { kind: 'probe-failed',      renderId, probeId, error, durationMs }
 *   { kind: 'section-started',   renderId, sectionId, stageIndex }
 *   { kind: 'section-completed', renderId, sectionId, body, sql?, usage?, durationMs }
 *   { kind: 'section-failed',    renderId, sectionId, error, durationMs }
 *   { kind: 'all-completed',     renderId, totals: { sections, durationMs } }
 */

/**
 * @typedef {{ id: string, required?: boolean }} SectionDef
 * @typedef {{ sections: string[], spreadMs?: number }} Stage
 * @typedef {{
 *   ir?: object,
 *   request?: object,
 *   schedule?: Stage[],
 *   runProbe?: (ctx: { ir?: object, request?: object, signal?: AbortSignal }) => Promise<{ rows?: any[] } | null | undefined>,
 *   runSection: (ctx: { sectionId: string, ir?: object, request?: object, probeRows?: any[], headlineResult?: any, signal?: AbortSignal }) => Promise<{ body: any, sql?: object, usage?: object }>,
 *   regenerateOnly?: string[],
 *   probeCache?: { rows?: any[] },
 *   headlineCache?: any,
 *   renderId?: string,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   signal?: AbortSignal,
 * }} OrchestratorOptions
 */

const DEFAULT_SCHEDULE = Object.freeze([
    { sections: ['HEADLINE'], spreadMs: 0 },
    { sections: ['KPI', 'TRENDS'], spreadMs: 2000 },
    { sections: ['RISKS', 'RECOMMENDED_ACTIONS'], spreadMs: 0 },
    { sections: ['OPPORTUNITIES'], spreadMs: 0 },
]);

const SPREAD_MAX_MS = 30_000;
const RENDER_ID_MAX_LENGTH = 200;

function createRenderId() {
    if (typeof randomUUID === 'function') {
        return `render-${randomUUID()}`;
    }
    return `render-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRenderId(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed.slice(0, RENDER_ID_MAX_LENGTH);
    }
    return createRenderId();
}

/**
 * Build a default schedule from the IR's `output.sections[]` when no
 * explicit schedule is supplied. Pattern (template-agnostic):
 *   • Stage 0: the FIRST template section, alone. Lets the LLM ground
 *     the conversation before the rest of the sections run, and gives
 *     them its result via the shared conversation_id.
 *   • Subsequent stages: `batchSize` sections at a time (default 2,
 *     clamped to 1–3), in the order they appear in the template.
 *   • `headSpreadMs` (default 2000 ms) is applied between starts of
 *     sections within the FIRST multi-section stage only; later stages
 *     start their sections in the same tick (spreadMs=0).
 *
 * The section ORDER is whatever the caller's IR specifies — we don't
 * special-case section ids like HEADLINE here. Templates own the order.
 *
 * @param {string[]} sectionIds
 * @param {{ headSpreadMs?: number, batchSize?: number }} [opts]
 * @returns {Stage[]}
 */
function buildDefaultSchedule(sectionIds, opts = {}) {
    const ids = Array.isArray(sectionIds) ? sectionIds.filter(s => typeof s === 'string' && s.trim().length > 0) : [];
    if (ids.length === 0) return [];
    const headSpread = Number.isFinite(opts.headSpreadMs) && opts.headSpreadMs >= 0
        ? Math.min(opts.headSpreadMs, SPREAD_MAX_MS)
        : 2000;
    const rawBatch = Number.isFinite(opts.batchSize) ? Math.trunc(opts.batchSize) : 2;
    const batchSize = Math.max(1, Math.min(3, rawBatch));

    /** @type {Stage[]} */
    const stages = [];
    let rest = ids.slice();

    // Stage 0: first template section alone.
    stages.push({ sections: [rest.shift()], spreadMs: 0 });

    // First post-head batch carries the head spread; subsequent batches use 0.
    let firstBatch = true;
    while (rest.length > 0) {
        const batch = rest.slice(0, batchSize);
        rest = rest.slice(batch.length);
        stages.push({ sections: batch, spreadMs: firstBatch && batch.length > 1 ? headSpread : 0 });
        firstBatch = false;
    }
    return stages;
}

/**
 * Validate a schedule shape. Returns an array of human-readable problems;
 * empty array means valid.
 *
 * @param {any} schedule
 * @returns {string[]}
 */
function validateSchedule(schedule) {
    /** @type {string[]} */
    const problems = [];
    if (!Array.isArray(schedule)) {
        problems.push('schedule must be an array of stages');
        return problems;
    }
    const seen = new Set();
    schedule.forEach((stage, i) => {
        if (!stage || typeof stage !== 'object') {
            problems.push(`schedule[${i}] must be an object`);
            return;
        }
        if (!Array.isArray(stage.sections) || stage.sections.length === 0) {
            problems.push(`schedule[${i}].sections must be a non-empty array`);
            return;
        }
        stage.sections.forEach((sid, j) => {
            if (typeof sid !== 'string' || sid.trim().length === 0) {
                problems.push(`schedule[${i}].sections[${j}] must be a non-empty string`);
                return;
            }
            if (seen.has(sid)) {
                problems.push(`schedule[${i}].sections[${j}] duplicate section id "${sid}"`);
            } else {
                seen.add(sid);
            }
        });
        if (stage.spreadMs !== undefined) {
            if (typeof stage.spreadMs !== 'number' || !Number.isFinite(stage.spreadMs) || stage.spreadMs < 0) {
                problems.push(`schedule[${i}].spreadMs must be a non-negative finite number`);
            } else if (stage.spreadMs > SPREAD_MAX_MS) {
                problems.push(`schedule[${i}].spreadMs ${stage.spreadMs} exceeds max ${SPREAD_MAX_MS}`);
            }
        }
    });
    return problems;
}

/**
 * Returns an async iterable of orchestration events for the supplied IR +
 * schedule. The iterable yields events in the order they happen on the
 * orchestrator's clock — probe first (if any), then per-stage section
 * starts/completions, then a final `all-completed`.
 *
 * Section failures emit `section-failed` and DO NOT short-circuit other
 * sections in the stage — they only block the NEXT stage's `dependsOn`
 * (`HEADLINE` is always implicitly depended on by later stages; if
 * HEADLINE fails, later sections still run but receive `headlineResult=null`).
 *
 * Probe failures emit `probe-failed` and the orchestrator continues with
 * `probeRows=[]` so the LLM still has a chance to produce a useful answer.
 *
 * @param {OrchestratorOptions} opts
 */
function orchestrate(opts) {
    if (!opts || typeof opts !== 'object') {
        throw new TypeError('orchestrate(opts): opts is required');
    }
    if (typeof opts.runSection !== 'function') {
        throw new TypeError('orchestrate(opts): opts.runSection is required');
    }
    const now = typeof opts.now === 'function' ? opts.now : Date.now;
    const sleep = typeof opts.sleep === 'function'
        ? opts.sleep
        : (/** @type {number} */ ms) => new Promise(resolve => setTimeout(resolve, ms));

    const schedule = Array.isArray(opts.schedule) && opts.schedule.length > 0
        ? opts.schedule
        : buildDefaultSchedule(_irSectionIds(opts.ir));
    const problems = validateSchedule(schedule);
    if (problems.length > 0) {
        throw new Error(`invalid schedule: ${problems.join('; ')}`);
    }
    const renderId = resolveRenderId(opts.renderId);

    const regenerateOnly = Array.isArray(opts.regenerateOnly) && opts.regenerateOnly.length > 0
        ? new Set(opts.regenerateOnly.map(s => String(s)))
        : null;

    /** @type {Array<{ resolve: (v: { value: any, done?: boolean }) => void }>} */
    const consumers = [];
    /** @type {any[]} */
    const buffer = [];
    let done = false;
    /** @type {Error | null} */
    let fatalError = null;

    function emit(event) {
        if (done) return;
        const eventWithRenderId = event && typeof event === 'object' && !Array.isArray(event)
            ? { ...event, renderId }
            : event;
        if (consumers.length > 0) {
            const c = consumers.shift();
            c.resolve({ value: eventWithRenderId, done: false });
        } else {
            buffer.push(eventWithRenderId);
        }
    }
    function finish(err) {
        if (done) return;
        done = true;
        if (err) fatalError = err;
        while (consumers.length > 0) {
            const c = consumers.shift();
            if (err) {
                try { c.resolve(Promise.reject(err)); } catch (_) { /* swallow */ }
            } else {
                c.resolve({ value: undefined, done: true });
            }
        }
    }

    // Driver — runs in parallel with consumer's iteration. We use an
    // immediately-invoked async function and intentionally do NOT await it
    // at the top level; events are pushed via emit() as they happen.
    (async () => {
        const start = now();
        try {
            // 1) Probe — skipped on regenerate-only requests (we reuse the cached probe rows).
            /** @type {any[]} */
            let probeRows = [];
            if (regenerateOnly && opts.probeCache && Array.isArray(opts.probeCache.rows)) {
                probeRows = opts.probeCache.rows.slice();
            } else if (typeof opts.runProbe === 'function') {
                const probeId = 'probe-1';
                const probeStart = now();
                emit({ kind: 'probe-started', probeId });
                try {
                    const probeResult = await opts.runProbe({ ir: opts.ir, request: opts.request, signal: opts.signal });
                    probeRows = Array.isArray(probeResult?.rows) ? probeResult.rows : [];
                    emit({
                        kind: 'probe-completed',
                        probeId,
                        rows: probeRows,
                        durationMs: now() - probeStart,
                    });
                } catch (probeErr) {
                    emit({
                        kind: 'probe-failed',
                        probeId,
                        error: _errorPayload(probeErr),
                        durationMs: now() - probeStart,
                    });
                    probeRows = [];
                }
            }

            // 2) Stages.
            /** @type {any} */
            let headlineResult = opts.headlineCache !== undefined ? opts.headlineCache : null;
            let totalSections = 0;
            for (let stageIndex = 0; stageIndex < schedule.length; stageIndex++) {
                const stage = schedule[stageIndex];
                const spread = Math.max(0, Number(stage.spreadMs) || 0);
                const targets = stage.sections.filter(sid => !regenerateOnly || regenerateOnly.has(sid));
                if (targets.length === 0) continue;

                const promises = targets.map((sectionId, idx) => {
                    return (async () => {
                        if (spread > 0 && idx > 0) {
                            await sleep(spread * idx);
                        }
                        if (opts.signal && opts.signal.aborted) {
                            emit({ kind: 'section-failed', sectionId, error: { message: 'aborted' }, durationMs: 0 });
                            return null;
                        }
                        const sectionStart = now();
                        emit({ kind: 'section-started', sectionId, stageIndex });
                        try {
                            const result = await opts.runSection({
                                sectionId,
                                ir: opts.ir,
                                request: opts.request,
                                probeRows,
                                headlineResult,
                                signal: opts.signal,
                            });
                            const body = result?.body;
                            const sql = result?.sql;
                            const usage = result?.usage;
                            emit({
                                kind: 'section-completed',
                                sectionId,
                                body,
                                ...(sql !== undefined ? { sql } : {}),
                                ...(usage !== undefined ? { usage } : {}),
                                durationMs: now() - sectionStart,
                            });
                            totalSections += 1;
                            return { sectionId, body };
                        } catch (sectionErr) {
                            emit({
                                kind: 'section-failed',
                                sectionId,
                                error: _errorPayload(sectionErr),
                                durationMs: now() - sectionStart,
                            });
                            return null;
                        }
                    })();
                });

                const settled = await Promise.all(promises);
                // Capture HEADLINE result for subsequent stages (regardless of stage index — if
                // HEADLINE is in stage 0, later stages get it; if HEADLINE somehow lives
                // outside stage 0, the first stage to complete it sets it).
                for (const s of settled) {
                    if (s && s.sectionId === 'HEADLINE') headlineResult = s.body;
                }
            }

            emit({
                kind: 'all-completed',
                totals: { sections: totalSections, durationMs: now() - start },
            });
            finish();
        } catch (err) {
            finish(err);
        }
    })();

    const iterator = {
        next() {
            if (buffer.length > 0) {
                return Promise.resolve({ value: buffer.shift(), done: false });
            }
            if (done) {
                if (fatalError) return Promise.reject(fatalError);
                return Promise.resolve({ value: undefined, done: true });
            }
            return new Promise(resolve => { consumers.push({ resolve }); });
        },
        return() {
            finish();
            return Promise.resolve({ value: undefined, done: true });
        },
        [Symbol.asyncIterator]() { return this; },
        renderId,
    };
    return iterator;
}

function _irSectionIds(ir) {
    const sections = ir && ir.output && Array.isArray(ir.output.sections) ? ir.output.sections : [];
    return sections.map(s => (s && typeof s.id === 'string') ? s.id : null).filter(Boolean);
}

function _errorPayload(err) {
    if (!err) return { message: 'unknown error' };
    if (typeof err === 'string') return { message: err };
    const message = (err && typeof err.message === 'string') ? err.message : String(err);
    const code = err && typeof err.code === 'string' ? err.code : undefined;
    /** @type {{ message: string, code?: string }} */
    const payload = { message };
    if (code) payload.code = code;
    return payload;
}

/**
 * Collect every event from an orchestrator iterable into an array.
 * Convenience for tests + non-streaming callers that want the final bundle.
 *
 * @param {AsyncIterable<any>} iterable
 */
async function collect(iterable) {
    const out = [];
    for await (const event of iterable) out.push(event);
    return out;
}

module.exports = {
    DEFAULT_SCHEDULE,
    SPREAD_MAX_MS,
    createRenderId,
    resolveRenderId,
    buildDefaultSchedule,
    validateSchedule,
    orchestrate,
    collect,
};
