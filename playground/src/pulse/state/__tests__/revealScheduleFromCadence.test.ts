import { describe, expect, it } from "vitest";
import {
    DEFAULT_REVEAL_SCHEDULE,
    FAST_REVEAL_SCHEDULE,
    FULL_REVEAL_SCHEDULE,
    INSTANT_REVEAL_SCHEDULE,
    revealScheduleFromCadence,
} from "../stagedReveal";

describe("revealScheduleFromCadence", () => {
    it("maps 'instant' to the empty schedule (no staging)", () => {
        expect(revealScheduleFromCadence("instant")).toBe(INSTANT_REVEAL_SCHEDULE);
        expect(INSTANT_REVEAL_SCHEDULE.length).toBe(0);
    });

    it("maps 'fast' to a two-stage schedule (headline + body at t=4s)", () => {
        const out = revealScheduleFromCadence("fast");
        expect(out).toBe(FAST_REVEAL_SCHEDULE);
        expect(out.map(s => s.atMs)).toEqual([0, 4000]);
        expect(out[0].sections).toEqual(["HEADLINE"]);
    });

    it("maps 'balanced' (and unknown labels) to DEFAULT_REVEAL_SCHEDULE", () => {
        expect(revealScheduleFromCadence("balanced")).toBe(DEFAULT_REVEAL_SCHEDULE);
        expect(revealScheduleFromCadence(undefined)).toBe(DEFAULT_REVEAL_SCHEDULE);
        expect(revealScheduleFromCadence("not-a-real-cadence")).toBe(DEFAULT_REVEAL_SCHEDULE);
    });

    it("maps 'full' to a 6-stage schedule with 8 s spacing", () => {
        const out = revealScheduleFromCadence("full");
        expect(out).toBe(FULL_REVEAL_SCHEDULE);
        expect(out.length).toBe(6);
        expect(out.map(s => s.atMs)).toEqual([0, 8000, 16000, 24000, 32000, 40000]);
    });

    it("each preset is frozen so consumers can't accidentally mutate", () => {
        expect(Object.isFrozen(INSTANT_REVEAL_SCHEDULE)).toBe(true);
        expect(Object.isFrozen(FAST_REVEAL_SCHEDULE)).toBe(true);
        expect(Object.isFrozen(DEFAULT_REVEAL_SCHEDULE)).toBe(true);
        expect(Object.isFrozen(FULL_REVEAL_SCHEDULE)).toBe(true);
    });
});
