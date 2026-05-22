import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    PROBE_STATUS_EVENT,
    __resetProbeStatusForTests,
    getProbeStatus,
    subscribeProbeStatus,
    updateProbeStatus,
} from "../probeStatusStore";

beforeEach(() => {
    __resetProbeStatusForTests();
});

afterEach(() => {
    __resetProbeStatusForTests();
});

describe("probeStatusStore — defaults", () => {
    it("starts in 'idle' with no profile and no error", () => {
        const s = getProbeStatus();
        expect(s.phase).toBe("idle");
        expect(s.profile).toBeNull();
        expect(s.error).toBeNull();
        expect(s.cycleCount).toBe(0);
    });
});

describe("probeStatusStore — updateProbeStatus", () => {
    it("transitions to 'probing' with a profile", () => {
        updateProbeStatus({ phase: "probing", profile: "sales", error: null });
        const s = getProbeStatus();
        expect(s.phase).toBe("probing");
        expect(s.profile).toBe("sales");
        expect(s.error).toBeNull();
    });

    it("transitions to 'ready' and increments cycleCount", () => {
        updateProbeStatus({ phase: "probing", profile: "sales" });
        updateProbeStatus({ phase: "ready", profile: "sales" });
        expect(getProbeStatus().cycleCount).toBe(1);
    });

    it("transitions to 'failed' with the error message + increments cycleCount", () => {
        updateProbeStatus({ phase: "probing", profile: "sales" });
        updateProbeStatus({ phase: "failed", profile: "sales", error: "timeout" });
        const s = getProbeStatus();
        expect(s.phase).toBe("failed");
        expect(s.error).toBe("timeout");
        expect(s.cycleCount).toBe(1);
    });

    it("clears error on transition to 'ready' / 'probing' / 'idle'", () => {
        updateProbeStatus({ phase: "failed", profile: "x", error: "bad" });
        updateProbeStatus({ phase: "probing", profile: "x" });
        expect(getProbeStatus().error).toBeNull();
    });

    it("does NOT double-count consecutive 'failed' transitions", () => {
        updateProbeStatus({ phase: "probing", profile: "x" });
        updateProbeStatus({ phase: "failed", profile: "x", error: "a" });
        updateProbeStatus({ phase: "failed", profile: "x", error: "b" });
        // cycleCount only bumps on a transition from probing/idle → terminal.
        expect(getProbeStatus().cycleCount).toBe(1);
    });

    it("preserves prior error when transitioning failed → failed without explicit clear", () => {
        updateProbeStatus({ phase: "failed", profile: "x", error: "first" });
        updateProbeStatus({ phase: "failed", profile: "x" }); // no error arg
        expect(getProbeStatus().error).toBe("first");
    });
});

describe("probeStatusStore — subscribe", () => {
    it("calls the subscriber on every update with the latest snapshot", () => {
        const fn = vi.fn();
        const unsub = subscribeProbeStatus(fn);
        updateProbeStatus({ phase: "probing", profile: "a" });
        updateProbeStatus({ phase: "ready", profile: "a" });
        expect(fn).toHaveBeenCalledTimes(2);
        const lastCall = fn.mock.calls[1][0];
        expect(lastCall.phase).toBe("ready");
        unsub();
    });

    it("stops notifying after unsubscribe", () => {
        const fn = vi.fn();
        const unsub = subscribeProbeStatus(fn);
        updateProbeStatus({ phase: "probing", profile: "a" });
        unsub();
        updateProbeStatus({ phase: "ready", profile: "a" });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("survives a throwing subscriber without stopping the rest of the chain", () => {
        const bad = vi.fn(() => { throw new Error("boom"); });
        const good = vi.fn();
        subscribeProbeStatus(bad);
        subscribeProbeStatus(good);
        updateProbeStatus({ phase: "probing", profile: "a" });
        expect(bad).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
    });
});

describe("probeStatusStore — DOM event", () => {
    it("dispatches PROBE_STATUS_EVENT on window with the new state in detail", () => {
        const handler = vi.fn();
        window.addEventListener(PROBE_STATUS_EVENT, handler);
        try {
            updateProbeStatus({ phase: "probing", profile: "sales" });
        } finally {
            window.removeEventListener(PROBE_STATUS_EVENT, handler);
        }
        expect(handler).toHaveBeenCalled();
        const ev = handler.mock.calls[0][0] as CustomEvent;
        expect(ev.detail.phase).toBe("probing");
        expect(ev.detail.profile).toBe("sales");
    });
});
