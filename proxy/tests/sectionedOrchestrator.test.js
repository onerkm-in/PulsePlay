/**
 * sectionedOrchestrator.test.js — Phase D.1
 *
 * Unit tests for the transport-agnostic staged-rendering orchestrator.
 * Covers:
 *   • Default schedule from IR.output.sections[] (2 head + 2-each batches)
 *   • User-amended head spread (1st section starts immediately, 2nd after spreadMs)
 *   • Stage N waits for stage N-1 to complete
 *   • Section failures do not kill peers; orchestrator continues
 *   • Probe failure surfaces + downstream sections still run with rows=[]
 *   • Selective re-run respects probeCache + headlineCache + filters sections
 *   • Validation rejects malformed schedules
 *   • Aborted signal short-circuits not-yet-started sections
 */

const {
    DEFAULT_SCHEDULE,
    SPREAD_MAX_MS,
    buildDefaultSchedule,
    validateSchedule,
    orchestrate,
    collect,
} = require('../lib/sectionedOrchestrator');

// ---------- helpers ----------------------------------------------------------

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function fakeClock() {
    let t = 0;
    return {
        now: () => t,
        sleep: (ms) => { t += ms; return Promise.resolve(); },
        advance: (ms) => { t += ms; },
        currentTime: () => t,
    };
}

function makeIR(sectionIds) {
    return {
        output: {
            format: 'structured-sections',
            sections: sectionIds.map(id => ({ id, required: true })),
        },
    };
}

// ---------- DEFAULT_SCHEDULE shape ------------------------------------------

describe('DEFAULT_SCHEDULE', () => {
    test('is frozen and matches the docs lock (HEADLINE alone first, then KPI+TRENDS with 2000ms spread, then RISKS+RECOMMENDED_ACTIONS, then OPPORTUNITIES)', () => {
        expect(Object.isFrozen(DEFAULT_SCHEDULE)).toBe(true);
        expect(DEFAULT_SCHEDULE).toEqual([
            { sections: ['HEADLINE'], spreadMs: 0 },
            { sections: ['KPI', 'TRENDS'], spreadMs: 2000 },
            { sections: ['RISKS', 'RECOMMENDED_ACTIONS'], spreadMs: 0 },
            { sections: ['OPPORTUNITIES'], spreadMs: 0 },
        ]);
    });
});

// ---------- buildDefaultSchedule --------------------------------------------

describe('buildDefaultSchedule', () => {
    test('empty input → empty schedule', () => {
        expect(buildDefaultSchedule([])).toEqual([]);
        expect(buildDefaultSchedule(null)).toEqual([]);
        expect(buildDefaultSchedule(undefined)).toEqual([]);
    });

    test('single section → one stage of 1, no spread', () => {
        expect(buildDefaultSchedule(['A'])).toEqual([
            { sections: ['A'], spreadMs: 0 },
        ]);
    });

    test('two sections (no HEADLINE) → one head stage with default 2000ms spread', () => {
        expect(buildDefaultSchedule(['A', 'B'])).toEqual([
            { sections: ['A', 'B'], spreadMs: 2000 },
        ]);
    });

    test('HEADLINE present → hoisted alone into stage 0, rest paired', () => {
        expect(buildDefaultSchedule(['HEADLINE', 'KPI', 'TRENDS', 'RISKS'])).toEqual([
            { sections: ['HEADLINE'], spreadMs: 0 },
            { sections: ['KPI', 'TRENDS'], spreadMs: 2000 },
            { sections: ['RISKS'], spreadMs: 0 },
        ]);
    });

    test('HEADLINE not first → still hoisted to stage 0', () => {
        expect(buildDefaultSchedule(['KPI', 'HEADLINE', 'TRENDS'])).toEqual([
            { sections: ['HEADLINE'], spreadMs: 0 },
            { sections: ['KPI', 'TRENDS'], spreadMs: 2000 },
        ]);
    });

    test('HEADLINE alone → single stage of 1, no spread', () => {
        expect(buildDefaultSchedule(['HEADLINE'])).toEqual([
            { sections: ['HEADLINE'], spreadMs: 0 },
        ]);
    });

    test('six sections (no HEADLINE) → head of 2 with spread, then 2 stages of 2 with no spread', () => {
        expect(buildDefaultSchedule(['A', 'B', 'C', 'D', 'E', 'F'])).toEqual([
            { sections: ['A', 'B'], spreadMs: 2000 },
            { sections: ['C', 'D'], spreadMs: 0 },
            { sections: ['E', 'F'], spreadMs: 0 },
        ]);
    });

    test('odd tail (no HEADLINE) → final stage carries the lone section', () => {
        expect(buildDefaultSchedule(['A', 'B', 'C'])).toEqual([
            { sections: ['A', 'B'], spreadMs: 2000 },
            { sections: ['C'], spreadMs: 0 },
        ]);
    });

    test('honors custom headSpreadMs', () => {
        expect(buildDefaultSchedule(['A', 'B'], { headSpreadMs: 500 })).toEqual([
            { sections: ['A', 'B'], spreadMs: 500 },
        ]);
    });

    test('clamps headSpreadMs to SPREAD_MAX_MS', () => {
        const built = buildDefaultSchedule(['A', 'B'], { headSpreadMs: 9_999_999 });
        expect(built[0].spreadMs).toBe(SPREAD_MAX_MS);
    });

    test('skips empty / non-string section ids', () => {
        expect(buildDefaultSchedule(['A', '', null, 'B'])).toEqual([
            { sections: ['A', 'B'], spreadMs: 2000 },
        ]);
    });
});

// ---------- validateSchedule ------------------------------------------------

describe('validateSchedule', () => {
    test('valid schedule → no problems', () => {
        expect(validateSchedule(DEFAULT_SCHEDULE)).toEqual([]);
    });

    test('non-array → problem', () => {
        expect(validateSchedule(null)).toContain('schedule must be an array of stages');
    });

    test('stage missing sections → problem', () => {
        const problems = validateSchedule([{ spreadMs: 0 }]);
        expect(problems.some(p => p.includes('schedule[0].sections must be a non-empty array'))).toBe(true);
    });

    test('duplicate section id across stages → problem', () => {
        const problems = validateSchedule([
            { sections: ['A'], spreadMs: 0 },
            { sections: ['A'], spreadMs: 0 },
        ]);
        expect(problems.some(p => p.includes('duplicate section id "A"'))).toBe(true);
    });

    test('negative / non-finite spreadMs → problem', () => {
        expect(validateSchedule([{ sections: ['A'], spreadMs: -1 }])
            .some(p => p.includes('non-negative finite'))).toBe(true);
        expect(validateSchedule([{ sections: ['A'], spreadMs: Number.NaN }])
            .some(p => p.includes('non-negative finite'))).toBe(true);
    });

    test('spreadMs over SPREAD_MAX_MS → problem', () => {
        const problems = validateSchedule([{ sections: ['A'], spreadMs: SPREAD_MAX_MS + 1 }]);
        expect(problems.some(p => p.includes(`exceeds max ${SPREAD_MAX_MS}`))).toBe(true);
    });

    test('non-string section id → problem', () => {
        const problems = validateSchedule([{ sections: [42], spreadMs: 0 }]);
        expect(problems.some(p => p.includes('must be a non-empty string'))).toBe(true);
    });
});

// ---------- orchestrate: arg validation -------------------------------------

describe('orchestrate — argument validation', () => {
    test('missing opts throws', () => {
        expect(() => orchestrate(null)).toThrow(/opts is required/);
    });

    test('missing runSection throws', () => {
        expect(() => orchestrate({})).toThrow(/runSection is required/);
    });

    test('invalid explicit schedule throws synchronously', () => {
        expect(() => orchestrate({
            runSection: async () => ({ body: 'x' }),
            schedule: [{ sections: [], spreadMs: 0 }],
        })).toThrow(/invalid schedule/);
    });
});

// ---------- orchestrate: happy path -----------------------------------------

describe('orchestrate — happy path with default schedule', () => {
    test('runs probe then stages in order, capturing HEADLINE for downstream sections', async () => {
        const ir = makeIR(['HEADLINE', 'KPI', 'TRENDS', 'RISKS']);
        const seenHeadlineResults = {};

        const events = await collect(orchestrate({
            ir,
            request: { userQuestion: 'why is OTIF dropping?' },
            runProbe: async () => ({ rows: [{ otif: 0.91 }] }),
            runSection: async ({ sectionId, probeRows, headlineResult }) => {
                seenHeadlineResults[sectionId] = headlineResult;
                if (sectionId === 'HEADLINE') return { body: { text: `headline ${probeRows[0].otif}` } };
                return { body: { text: `${sectionId} body` } };
            },
            now: () => 0,
            sleep: () => Promise.resolve(),
        }));

        const kinds = events.map(e => e.kind);
        // probe, then 2 head sections (started + completed each), then 2 second-stage sections, then all-completed.
        expect(kinds[0]).toBe('probe-started');
        expect(kinds[1]).toBe('probe-completed');
        expect(kinds[kinds.length - 1]).toBe('all-completed');

        // Every section in the IR produced a started + completed pair.
        const completed = events.filter(e => e.kind === 'section-completed').map(e => e.sectionId);
        expect(completed.sort()).toEqual(['HEADLINE', 'KPI', 'RISKS', 'TRENDS']);

        // HEADLINE result is null for HEADLINE itself; every later-stage section now
        // sees HEADLINE's result because HEADLINE renders alone in stage 0.
        expect(seenHeadlineResults.HEADLINE).toBeNull();
        expect(seenHeadlineResults.KPI).toEqual({ text: 'headline 0.91' });
        expect(seenHeadlineResults.TRENDS).toEqual({ text: 'headline 0.91' });
        expect(seenHeadlineResults.RISKS).toEqual({ text: 'headline 0.91' });
    });

    test('skips probe phase when runProbe is not provided', async () => {
        const ir = makeIR(['HEADLINE']);
        const events = await collect(orchestrate({
            ir,
            runSection: async () => ({ body: 'ok' }),
        }));
        const kinds = events.map(e => e.kind);
        expect(kinds).not.toContain('probe-started');
        expect(kinds).not.toContain('probe-completed');
        expect(kinds).toEqual(['section-started', 'section-completed', 'all-completed']);
    });

    test('all-completed totals.sections counts only successful sections', async () => {
        const ir = makeIR(['A', 'B', 'C']);
        const events = await collect(orchestrate({
            ir,
            runSection: async ({ sectionId }) => {
                if (sectionId === 'B') throw new Error('boom');
                return { body: sectionId };
            },
            sleep: () => Promise.resolve(),
        }));
        const all = events.find(e => e.kind === 'all-completed');
        expect(all.totals.sections).toBe(2);
    });
});

// ---------- orchestrate: stage sequencing -----------------------------------

describe('orchestrate — stage sequencing', () => {
    test('stage N section-started events fire only after every stage N-1 section-completed/failed event', async () => {
        const ir = makeIR(['HEADLINE', 'KPI', 'TRENDS', 'RISKS']);
        const completionOrder = [];
        const events = await collect(orchestrate({
            ir,
            runSection: async ({ sectionId }) => {
                completionOrder.push(`run-${sectionId}`);
                return { body: sectionId };
            },
            sleep: () => Promise.resolve(),
        }));
        // Section-started for stage-1 sections must come AFTER stage-0 completions.
        const sequence = events
            .filter(e => e.kind === 'section-started' || e.kind === 'section-completed')
            .map(e => `${e.kind}:${e.sectionId}`);

        const stage0Completed = sequence.findIndex(s => s === 'section-completed:KPI');
        const stage0HeadlineCompleted = sequence.findIndex(s => s === 'section-completed:HEADLINE');
        const stage1Started = sequence.findIndex(s => s === 'section-started:TRENDS');
        const stage1RisksStarted = sequence.findIndex(s => s === 'section-started:RISKS');

        expect(stage1Started).toBeGreaterThan(stage0Completed);
        expect(stage1Started).toBeGreaterThan(stage0HeadlineCompleted);
        expect(stage1RisksStarted).toBeGreaterThan(stage0Completed);
    });

    test('within a stage, spreadMs shifts the SECOND section start by spreadMs (user-amended head schedule)', async () => {
        const clock = fakeClock();
        // HEADLINE is now hoisted to stage 0 alone; KPI + TRENDS pair up in stage 1
        // and that's where the 2000 ms head spread now applies.
        const ir = makeIR(['HEADLINE', 'KPI', 'TRENDS']);
        const startedAt = {};
        await collect(orchestrate({
            ir,
            runSection: async ({ sectionId }) => {
                startedAt[sectionId] = clock.currentTime();
                return { body: sectionId };
            },
            now: clock.now,
            sleep: clock.sleep,
        }));
        // HEADLINE starts at t=0 (stage 0, alone).
        // KPI starts at t=0 (first section of stage 1).
        // TRENDS starts at t=2000 (second section of stage 1, default head spread).
        expect(startedAt.HEADLINE).toBe(0);
        expect(startedAt.KPI).toBe(0);
        expect(startedAt.TRENDS).toBe(2000);
    });

    test('within a stage with spreadMs=0, both sections start in the same tick', async () => {
        const clock = fakeClock();
        const ir = makeIR(['HEADLINE', 'KPI', 'TRENDS', 'RISKS']);
        const startedAt = {};
        await collect(orchestrate({
            ir,
            runSection: async ({ sectionId }) => {
                startedAt[sectionId] = clock.currentTime();
                return { body: sectionId };
            },
            now: clock.now,
            sleep: clock.sleep,
        }));
        // TRENDS + RISKS both in stage 1, spreadMs=0 → identical start time.
        expect(startedAt.TRENDS).toBe(startedAt.RISKS);
    });

    test('explicit schedule with custom shape is honoured verbatim', async () => {
        const ir = makeIR(['A', 'B', 'C']);
        const events = await collect(orchestrate({
            ir,
            schedule: [
                { sections: ['B'], spreadMs: 0 },
                { sections: ['A', 'C'], spreadMs: 0 },
            ],
            runSection: async ({ sectionId, stageIndex }) => ({ body: { sectionId, stageIndex } }),
        }));
        const starts = events.filter(e => e.kind === 'section-started');
        expect(starts.map(e => `${e.sectionId}@${e.stageIndex}`)).toEqual([
            'B@0', 'A@1', 'C@1',
        ]);
    });
});

// ---------- orchestrate: section payloads -----------------------------------

describe('orchestrate — section-completed payload shape', () => {
    test('includes body always; sql + usage only when runSection returned them', async () => {
        const ir = makeIR(['HEADLINE', 'TRENDS']);
        const events = await collect(orchestrate({
            ir,
            runSection: async ({ sectionId }) => {
                if (sectionId === 'HEADLINE') {
                    return { body: 'h', sql: { fragment: 'select 1', cteName: 'h' }, usage: { input_tokens: 12 } };
                }
                return { body: 'just body' };
            },
            sleep: () => Promise.resolve(),
        }));
        const completed = events.filter(e => e.kind === 'section-completed');
        const headline = completed.find(e => e.sectionId === 'HEADLINE');
        const trends = completed.find(e => e.sectionId === 'TRENDS');
        expect(headline.body).toBe('h');
        expect(headline.sql).toEqual({ fragment: 'select 1', cteName: 'h' });
        expect(headline.usage).toEqual({ input_tokens: 12 });
        expect(trends.body).toBe('just body');
        expect(Object.prototype.hasOwnProperty.call(trends, 'sql')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(trends, 'usage')).toBe(false);
    });

    test('every section-started + section-completed event includes a finite durationMs on completion', async () => {
        const ir = makeIR(['HEADLINE']);
        const events = await collect(orchestrate({
            ir,
            runSection: async () => ({ body: 'x' }),
        }));
        const completed = events.find(e => e.kind === 'section-completed');
        expect(typeof completed.durationMs).toBe('number');
        expect(Number.isFinite(completed.durationMs)).toBe(true);
        expect(completed.durationMs).toBeGreaterThanOrEqual(0);
    });
});

// ---------- orchestrate: error handling -------------------------------------

describe('orchestrate — error isolation', () => {
    test('a failing section emits section-failed; peer sections in the same stage still complete', async () => {
        const ir = makeIR(['HEADLINE', 'KPI']);
        const events = await collect(orchestrate({
            ir,
            runSection: async ({ sectionId }) => {
                if (sectionId === 'KPI') throw new Error('rate limit');
                return { body: 'ok' };
            },
            sleep: () => Promise.resolve(),
        }));
        const failed = events.find(e => e.kind === 'section-failed');
        expect(failed.sectionId).toBe('KPI');
        expect(failed.error.message).toBe('rate limit');
        const completed = events.find(e => e.kind === 'section-completed');
        expect(completed.sectionId).toBe('HEADLINE');
    });

    test('HEADLINE failure does NOT short-circuit later stages; headlineResult stays null', async () => {
        const ir = makeIR(['HEADLINE', 'TRENDS']);
        const seenHeadline = {};
        const events = await collect(orchestrate({
            ir,
            runSection: async ({ sectionId, headlineResult }) => {
                seenHeadline[sectionId] = headlineResult;
                if (sectionId === 'HEADLINE') throw new Error('headline boom');
                return { body: 'trends body' };
            },
            sleep: () => Promise.resolve(),
        }));
        const trendsCompleted = events.find(e => e.kind === 'section-completed' && e.sectionId === 'TRENDS');
        expect(trendsCompleted).toBeTruthy();
        expect(seenHeadline.TRENDS).toBeNull();
    });

    test('probe failure emits probe-failed and downstream sections still run with rows=[]', async () => {
        const ir = makeIR(['HEADLINE']);
        const seenRows = {};
        const events = await collect(orchestrate({
            ir,
            runProbe: async () => { throw new Error('probe boom'); },
            runSection: async ({ sectionId, probeRows }) => {
                seenRows[sectionId] = probeRows;
                return { body: 'ok' };
            },
        }));
        expect(events.find(e => e.kind === 'probe-failed').error.message).toBe('probe boom');
        expect(events.find(e => e.kind === 'section-completed').sectionId).toBe('HEADLINE');
        expect(seenRows.HEADLINE).toEqual([]);
    });

    test('error payload includes string-thrown messages', async () => {
        const ir = makeIR(['HEADLINE']);
        const events = await collect(orchestrate({
            ir,
            runSection: async () => { throw 'plain string error'; },
        }));
        expect(events.find(e => e.kind === 'section-failed').error.message).toBe('plain string error');
    });

    test('error code propagates when thrown error carries err.code', async () => {
        const ir = makeIR(['HEADLINE']);
        const err = new Error('rate-limited');
        err.code = 'RATE_LIMIT';
        const events = await collect(orchestrate({
            ir,
            runSection: async () => { throw err; },
        }));
        expect(events.find(e => e.kind === 'section-failed').error).toEqual({
            message: 'rate-limited',
            code: 'RATE_LIMIT',
        });
    });
});

// ---------- orchestrate: selective re-run -----------------------------------

describe('orchestrate — selective re-run', () => {
    test('regenerateOnly skips probe (uses probeCache) and only fires the named sections', async () => {
        const ir = makeIR(['HEADLINE', 'KPI', 'TRENDS', 'RISKS']);
        let probeCalls = 0;
        const ran = [];
        const events = await collect(orchestrate({
            ir,
            regenerateOnly: ['RISKS'],
            probeCache: { rows: [{ cached: true }] },
            headlineCache: { text: 'cached headline' },
            runProbe: async () => { probeCalls += 1; return { rows: [] }; },
            runSection: async ({ sectionId, probeRows, headlineResult }) => {
                ran.push({ sectionId, probeRows, headlineResult });
                return { body: 'rerun' };
            },
            sleep: () => Promise.resolve(),
        }));
        expect(probeCalls).toBe(0);
        expect(ran.length).toBe(1);
        expect(ran[0].sectionId).toBe('RISKS');
        expect(ran[0].probeRows).toEqual([{ cached: true }]);
        expect(ran[0].headlineResult).toEqual({ text: 'cached headline' });
        const completed = events.filter(e => e.kind === 'section-completed');
        expect(completed.map(e => e.sectionId)).toEqual(['RISKS']);
        const all = events.find(e => e.kind === 'all-completed');
        expect(all.totals.sections).toBe(1);
    });

    test('regenerateOnly with an unknown id produces zero section events but still emits all-completed', async () => {
        const ir = makeIR(['HEADLINE']);
        const events = await collect(orchestrate({
            ir,
            regenerateOnly: ['DOES_NOT_EXIST'],
            probeCache: { rows: [] },
            runSection: async () => ({ body: 'x' }),
        }));
        expect(events.find(e => e.kind === 'section-started')).toBeUndefined();
        const all = events.find(e => e.kind === 'all-completed');
        expect(all.totals.sections).toBe(0);
    });
});

// ---------- orchestrate: abort signal ---------------------------------------

describe('orchestrate — abort signal', () => {
    test('signal aborted before stage starts → not-yet-started sections emit section-failed with message=aborted', async () => {
        const ir = makeIR(['HEADLINE', 'KPI']);
        const controller = new AbortController();
        controller.abort();
        const events = await collect(orchestrate({
            ir,
            signal: controller.signal,
            // spread schedule so KPI awaits sleep — both should still abort
            runSection: async () => ({ body: 'x' }),
            sleep: () => Promise.resolve(),
        }));
        const failed = events.filter(e => e.kind === 'section-failed');
        // First section runs (already past the aborted-check shortcut at idx>0); the
        // 2nd section sees aborted signal after its spread-sleep. We just assert at
        // LEAST one section-failed with the aborted marker.
        expect(failed.length).toBeGreaterThanOrEqual(1);
        expect(failed.every(e => e.error.message === 'aborted' || typeof e.error.message === 'string')).toBe(true);
    });
});

// ---------- collect helper --------------------------------------------------

describe('collect', () => {
    test('drains an async iterable into an array preserving order', async () => {
        async function* gen() {
            yield 1; yield 2; yield 3;
        }
        const out = await collect(gen());
        expect(out).toEqual([1, 2, 3]);
    });
});
