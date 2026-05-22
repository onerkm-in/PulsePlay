// playground/src/pulse/state/__tests__/stagedReveal.test.ts
import { describe, it, expect } from "vitest";
import {
    DEFAULT_REVEAL_SCHEDULE,
    STAGE_GAP_MAX_MS,
    computeRevealState,
    nextRevealTickMs,
    validateSchedule,
    type RevealSchedule,
} from "../stagedReveal";

const ALL_SECTIONS = ["HEADLINE", "KPI SNAPSHOT", "TRENDS", "RISKS", "RECOMMENDED ACTIONS"];

describe("stagedReveal — DEFAULT_REVEAL_SCHEDULE", () => {
    it("is frozen and shaped per Rajesh 2026-05-20 brief (1 → 10s → 2-each)", () => {
        expect(Object.isFrozen(DEFAULT_REVEAL_SCHEDULE)).toBe(true);
        expect(DEFAULT_REVEAL_SCHEDULE.map(s => s.atMs)).toEqual([0, 10000, 20000, 30000]);
        expect(DEFAULT_REVEAL_SCHEDULE[0].sections).toEqual(["HEADLINE"]);
        expect(DEFAULT_REVEAL_SCHEDULE[1].sections).toEqual(["KPI SNAPSHOT", "TRENDS"]);
        expect(DEFAULT_REVEAL_SCHEDULE[2].sections).toEqual(["RISKS", "RECOMMENDED ACTIONS"]);
        expect(DEFAULT_REVEAL_SCHEDULE[3].sections).toEqual(["OPPORTUNITIES"]);
    });
});

describe("stagedReveal — validateSchedule", () => {
    it("accepts the default schedule", () => {
        expect(validateSchedule(DEFAULT_REVEAL_SCHEDULE)).toEqual([]);
    });

    it("rejects empty/missing", () => {
        expect(validateSchedule(null)).toHaveLength(1);
        expect(validateSchedule([])).toHaveLength(1);
    });

    it("rejects non-decreasing atMs", () => {
        const bad: RevealSchedule = [
            { atMs: 10000, sections: ["A"] },
            { atMs: 5000, sections: ["B"] },
        ];
        const problems = validateSchedule(bad);
        expect(problems.some(p => /non-decreasing/.test(p.message))).toBe(true);
    });

    it("flags suspicious giant gaps (likely seconds-vs-ms)", () => {
        const bad: RevealSchedule = [
            { atMs: 0, sections: ["A"] },
            { atMs: STAGE_GAP_MAX_MS + 1000, sections: ["B"] },
        ];
        const problems = validateSchedule(bad);
        expect(problems.some(p => /exceeds/.test(p.message))).toBe(true);
    });

    it("rejects malformed entries (atMs negative, sections not array)", () => {
        const bad: RevealSchedule = [
            { atMs: -1, sections: ["A"] } as unknown as RevealSchedule[0],
            { atMs: 100, sections: "oops" } as unknown as RevealSchedule[0],
        ];
        expect(validateSchedule(bad).length).toBeGreaterThanOrEqual(2);
    });
});

describe("stagedReveal — computeRevealState (cadence)", () => {
    it("at t=0 reveals only HEADLINE", () => {
        const state = computeRevealState(DEFAULT_REVEAL_SCHEDULE, 0, ALL_SECTIONS);
        expect([...state.visibleSections].sort()).toEqual(["HEADLINE"]);
        expect(state.currentStageIndex).toBe(0);
        expect(state.totalStages).toBe(3); // OPPORTUNITIES absent → pruned
        expect(state.msUntilNextStage).toBe(10000);
        expect(state.isRevealing).toBe(true);
    });

    it("just before 10s, still only HEADLINE", () => {
        const state = computeRevealState(DEFAULT_REVEAL_SCHEDULE, 9999, ALL_SECTIONS);
        expect([...state.visibleSections].sort()).toEqual(["HEADLINE"]);
        expect(state.msUntilNextStage).toBe(1);
    });

    it("at t=10s reveals HEADLINE + KPI SNAPSHOT + TRENDS", () => {
        const state = computeRevealState(DEFAULT_REVEAL_SCHEDULE, 10000, ALL_SECTIONS);
        expect([...state.visibleSections].sort()).toEqual(["HEADLINE", "KPI SNAPSHOT", "TRENDS"]);
        expect(state.currentStageIndex).toBe(1);
        expect(state.msUntilNextStage).toBe(10000);
    });

    it("at t=20s reveals all 5 scheduled sections", () => {
        const state = computeRevealState(DEFAULT_REVEAL_SCHEDULE, 20000, ALL_SECTIONS);
        expect([...state.visibleSections].sort()).toEqual([
            "HEADLINE", "KPI SNAPSHOT", "RECOMMENDED ACTIONS", "RISKS", "TRENDS",
        ]);
        expect(state.currentStageIndex).toBe(2);
        expect(state.msUntilNextStage).toBe(null);
        expect(state.isRevealing).toBe(false);
    });
});

describe("stagedReveal — computeRevealState (composition)", () => {
    it("normalises lower/mixed-case parsed IDs against UPPER schedule", () => {
        const state = computeRevealState(DEFAULT_REVEAL_SCHEDULE, 10000, ["headline", "Kpi Snapshot", "trends"]);
        expect([...state.visibleSections].sort()).toEqual(["HEADLINE", "KPI SNAPSHOT", "TRENDS"]);
    });

    it("always reveals sections present but not named in any stage (custom Adjust output)", () => {
        const state = computeRevealState(
            DEFAULT_REVEAL_SCHEDULE,
            0,
            ["HEADLINE", "STRENGTHS", "WEAKNESSES"],
        );
        // HEADLINE from stage 0 + STRENGTHS + WEAKNESSES as tail
        expect([...state.visibleSections].sort()).toEqual(["HEADLINE", "STRENGTHS", "WEAKNESSES"]);
    });

    it("prunes stages whose sections aren't present in the parsed content", () => {
        const state = computeRevealState(DEFAULT_REVEAL_SCHEDULE, 0, ["HEADLINE", "TRENDS"]);
        // Default schedule: stage 0 (HEADLINE), stage 1 (KPI+TRENDS), stage 2 (RISKS+RA), stage 3 (OPP)
        // Present: HEADLINE, TRENDS → only stages 0 and 1 keep ≥1 present section
        expect(state.totalStages).toBe(2);
    });

    it("stageProgress reports pending → current → done correctly", () => {
        const mid = computeRevealState(DEFAULT_REVEAL_SCHEDULE, 10000, ALL_SECTIONS);
        expect(mid.stageProgress.map(s => s.status)).toEqual(["done", "current", "pending"]);
    });

    it("custom label survives onto stageProgress", () => {
        const sched: RevealSchedule = [
            { atMs: 0, sections: ["HEADLINE"], label: "Lead" },
            { atMs: 5000, sections: ["TRENDS"], label: "Follow-ups" },
        ];
        const s = computeRevealState(sched, 0, ["HEADLINE", "TRENDS"]);
        expect(s.stageProgress.map(p => p.label)).toEqual(["Lead", "Follow-ups"]);
    });
});

describe("stagedReveal — nextRevealTickMs", () => {
    it("returns the next stage's atMs while stages remain", () => {
        expect(nextRevealTickMs(DEFAULT_REVEAL_SCHEDULE, 0, ALL_SECTIONS)).toBe(10000);
        expect(nextRevealTickMs(DEFAULT_REVEAL_SCHEDULE, 10000, ALL_SECTIONS)).toBe(20000);
        expect(nextRevealTickMs(DEFAULT_REVEAL_SCHEDULE, 19999, ALL_SECTIONS)).toBe(20000);
        expect(nextRevealTickMs(DEFAULT_REVEAL_SCHEDULE, 20000, ALL_SECTIONS)).toBe(null);
    });

    it("skips stages whose sections aren't present (no phantom tick)", () => {
        // Parsed content has no OPPORTUNITIES → no 30000 tick should be reported.
        expect(nextRevealTickMs(DEFAULT_REVEAL_SCHEDULE, 20000, ALL_SECTIONS)).toBe(null);
    });
});
