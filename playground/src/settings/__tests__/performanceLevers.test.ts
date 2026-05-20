// @ts-check
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    PERFORMANCE_LEVERS_KEY,
    PERFORMANCE_LEVERS_EVENT,
    PERFORMANCE_LEVERS_DEFAULTS,
    PERFORMANCE_LEVERS_BOUNDS,
    loadPerformanceLevers,
    savePerformanceLevers,
    resetPerformanceLevers,
} from "../performanceLevers";

describe("performanceLevers — loadPerformanceLevers", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("returns spec defaults when nothing is persisted", () => {
        expect(loadPerformanceLevers()).toEqual(PERFORMANCE_LEVERS_DEFAULTS);
    });

    it("hydrates each field from a complete persisted object", () => {
        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify({
            revealCadence: "fast",
            discoveryPrewarmEnabled: false,
            insightsCacheTtlMinutes: 60,
            maxValidationRetries: 2,
        }));
        expect(loadPerformanceLevers()).toEqual({
            revealCadence: "fast",
            discoveryPrewarmEnabled: false,
            insightsCacheTtlMinutes: 60,
            maxValidationRetries: 2,
        });
    });

    it("falls back to defaults for any malformed field", () => {
        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify({
            revealCadence: "nonsense",
            discoveryPrewarmEnabled: "not-a-boolean",
            insightsCacheTtlMinutes: "not-a-number",
            maxValidationRetries: null,
        }));
        expect(loadPerformanceLevers()).toEqual(PERFORMANCE_LEVERS_DEFAULTS);
    });

    it("returns defaults on JSON-parse failure", () => {
        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, "not-json{");
        expect(loadPerformanceLevers()).toEqual(PERFORMANCE_LEVERS_DEFAULTS);
    });

    it("returns defaults when stored value is not an object", () => {
        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify("just a string"));
        expect(loadPerformanceLevers()).toEqual(PERFORMANCE_LEVERS_DEFAULTS);
    });

    it("clamps insightsCacheTtlMinutes to bounds", () => {
        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify({
            insightsCacheTtlMinutes: 9999,
        }));
        expect(loadPerformanceLevers().insightsCacheTtlMinutes)
            .toBe(PERFORMANCE_LEVERS_BOUNDS.insightsCacheTtlMinutes.max);

        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify({
            insightsCacheTtlMinutes: -5,
        }));
        expect(loadPerformanceLevers().insightsCacheTtlMinutes)
            .toBe(PERFORMANCE_LEVERS_BOUNDS.insightsCacheTtlMinutes.min);
    });

    it("clamps maxValidationRetries to 0..3", () => {
        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify({
            maxValidationRetries: 99,
        }));
        expect(loadPerformanceLevers().maxValidationRetries)
            .toBe(PERFORMANCE_LEVERS_BOUNDS.maxValidationRetries.max);

        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify({
            maxValidationRetries: -1,
        }));
        expect(loadPerformanceLevers().maxValidationRetries)
            .toBe(PERFORMANCE_LEVERS_BOUNDS.maxValidationRetries.min);
    });

    it("rounds non-integer maxValidationRetries to nearest int", () => {
        window.localStorage.setItem(PERFORMANCE_LEVERS_KEY, JSON.stringify({
            maxValidationRetries: 1.7,
        }));
        expect(loadPerformanceLevers().maxValidationRetries).toBe(2);
    });
});

describe("performanceLevers — savePerformanceLevers", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("persists a single-field patch over the defaults", () => {
        savePerformanceLevers({ revealCadence: "full" });
        expect(loadPerformanceLevers()).toEqual({
            ...PERFORMANCE_LEVERS_DEFAULTS,
            revealCadence: "full",
        });
    });

    it("ignores unknown cadence values and falls back to default", () => {
        savePerformanceLevers({ revealCadence: "made-up" as never });
        expect(loadPerformanceLevers().revealCadence).toBe(PERFORMANCE_LEVERS_DEFAULTS.revealCadence);
    });

    it("clamps out-of-range numeric inputs", () => {
        savePerformanceLevers({ insightsCacheTtlMinutes: 99999, maxValidationRetries: 5 });
        const out = loadPerformanceLevers();
        expect(out.insightsCacheTtlMinutes).toBe(PERFORMANCE_LEVERS_BOUNDS.insightsCacheTtlMinutes.max);
        expect(out.maxValidationRetries).toBe(PERFORMANCE_LEVERS_BOUNDS.maxValidationRetries.max);
    });

    it("dispatches the levers-change event with the new snapshot", () => {
        const handler = vi.fn();
        window.addEventListener(PERFORMANCE_LEVERS_EVENT, handler);
        try {
            savePerformanceLevers({ discoveryPrewarmEnabled: false });
        } finally {
            window.removeEventListener(PERFORMANCE_LEVERS_EVENT, handler);
        }
        expect(handler).toHaveBeenCalled();
        const ev = handler.mock.calls[0][0] as CustomEvent;
        expect(ev.detail).toMatchObject({ discoveryPrewarmEnabled: false });
    });

    it("composes with the default reads when a patch only sets one field", () => {
        savePerformanceLevers({ maxValidationRetries: 3 });
        const out = loadPerformanceLevers();
        expect(out).toEqual({
            ...PERFORMANCE_LEVERS_DEFAULTS,
            maxValidationRetries: 3,
        });
    });
});

describe("performanceLevers — resetPerformanceLevers", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("removes the persisted key and returns defaults", () => {
        savePerformanceLevers({ revealCadence: "fast", insightsCacheTtlMinutes: 100 });
        expect(window.localStorage.getItem(PERFORMANCE_LEVERS_KEY)).not.toBeNull();

        const out = resetPerformanceLevers();
        expect(out).toEqual(PERFORMANCE_LEVERS_DEFAULTS);
        expect(window.localStorage.getItem(PERFORMANCE_LEVERS_KEY)).toBeNull();
    });

    it("dispatches the levers-change event with defaults", () => {
        const handler = vi.fn();
        window.addEventListener(PERFORMANCE_LEVERS_EVENT, handler);
        try {
            resetPerformanceLevers();
        } finally {
            window.removeEventListener(PERFORMANCE_LEVERS_EVENT, handler);
        }
        expect(handler).toHaveBeenCalled();
        const ev = handler.mock.calls[0][0] as CustomEvent;
        expect(ev.detail).toEqual(PERFORMANCE_LEVERS_DEFAULTS);
    });
});

describe("performanceLevers — bounds metadata", () => {
    it("exposes the canonical cadence list in author-readable order", () => {
        expect(PERFORMANCE_LEVERS_BOUNDS.revealCadence).toEqual([
            "instant", "fast", "balanced", "full",
        ]);
    });

    it("exposes sane min/max for the numeric levers", () => {
        expect(PERFORMANCE_LEVERS_BOUNDS.insightsCacheTtlMinutes.min).toBe(1);
        expect(PERFORMANCE_LEVERS_BOUNDS.insightsCacheTtlMinutes.max).toBe(180);
        expect(PERFORMANCE_LEVERS_BOUNDS.maxValidationRetries.min).toBe(0);
        expect(PERFORMANCE_LEVERS_BOUNDS.maxValidationRetries.max).toBe(3);
    });
});
