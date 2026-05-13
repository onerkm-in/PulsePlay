// playground/src/components/__tests__/SustainabilityIndicator.test.tsx
//
// Rendering tests for the SustainabilityIndicator. Follows the
// react-dom/client + act() pattern used by the rest of the project.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type React from "react";
import { SustainabilityIndicator } from "../SustainabilityIndicator";
import {
    recordResponse,
    resetSessionUsage,
    __resetUsageTrackerForTests,
    type SessionUsage,
} from "../../lib/usageTracker";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, root };
}

function unmount(state: MountState) {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

function readyUsage(): SessionUsage {
    return {
        totalTokens: 0, inputTokens: 0, outputTokens: 0, questionCount: 0,
        hasRealData: false, hasEstimates: false, tier: "ready",
    };
}
function leanUsage(): SessionUsage {
    return {
        totalTokens: 1500, inputTokens: 1200, outputTokens: 300, questionCount: 2,
        hasRealData: true, hasEstimates: false, tier: "lean",
    };
}
function heavyUsage(): SessionUsage {
    return {
        totalTokens: 25_000, inputTokens: 20_000, outputTokens: 5_000, questionCount: 12,
        hasRealData: true, hasEstimates: false, tier: "heavy",
    };
}

beforeEach(() => {
    __resetUsageTrackerForTests();
    document.body.innerHTML = "";
});
afterEach(() => {
    document.body.innerHTML = "";
});

/* ─── Rendering states ──────────────────────────────────────────────── */

describe("SustainabilityIndicator — rendering states", () => {
    it("renders the 'ready' state with 0 tokens", () => {
        const state = mount(<SustainabilityIndicator override={readyUsage()} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        expect(root.dataset.tier).toBe("ready");
        const label = state.container.querySelector("[data-testid='pp-sustainability-label']");
        expect(label?.textContent).toBe("Ready");
        const tokens = state.container.querySelector("[data-testid='pp-sustainability-tokens']");
        expect(tokens?.textContent).toMatch(/0 tokens/);
        unmount(state);
    });

    it("renders the 'lean' state with a token count", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        expect(root.dataset.tier).toBe("lean");
        const label = state.container.querySelector("[data-testid='pp-sustainability-label']");
        expect(label?.textContent).toBe("Lean");
        const tokens = state.container.querySelector("[data-testid='pp-sustainability-tokens']");
        expect(tokens?.textContent).toMatch(/1\.5k tokens/);
        unmount(state);
    });

    it("renders the 'heavy' state", () => {
        const state = mount(<SustainabilityIndicator override={heavyUsage()} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        expect(root.dataset.tier).toBe("heavy");
        const tokens = state.container.querySelector("[data-testid='pp-sustainability-tokens']");
        expect(tokens?.textContent).toMatch(/25k tokens/);
        unmount(state);
    });

    it("compact mode omits the bar", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} compact />);
        const bar = state.container.querySelector(".pp-sustainability__bar");
        expect(bar).toBeNull();
        unmount(state);
    });

    it("non-compact mode includes the bar", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        const bar = state.container.querySelector(".pp-sustainability__bar");
        expect(bar).not.toBeNull();
        unmount(state);
    });

    it("prefixes a '~' marker when token counts are estimates only", () => {
        const estimated: SessionUsage = {
            ...leanUsage(),
            hasRealData: false,
            hasEstimates: true,
        };
        const state = mount(<SustainabilityIndicator override={estimated} />);
        const tokens = state.container.querySelector("[data-testid='pp-sustainability-tokens']");
        expect(tokens?.textContent).toMatch(/~/);
        unmount(state);
    });

    it("does NOT prefix '~' when all data is real", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        const tokens = state.container.querySelector("[data-testid='pp-sustainability-tokens']");
        expect(tokens?.textContent || "").not.toMatch(/~/);
        unmount(state);
    });
});

/* ─── Tooltip on hover ──────────────────────────────────────────────── */

describe("SustainabilityIndicator — tooltip", () => {
    it("is hidden by default", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        expect(state.container.querySelector("[data-testid='pp-sustainability-tooltip']")).toBeNull();
        unmount(state);
    });

    it("appears on mouseenter and shows the token breakdown", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        act(() => { root.focus(); });
        const tt = state.container.querySelector("[data-testid='pp-sustainability-tooltip']");
        expect(tt).not.toBeNull();
        expect(tt!.textContent || "").toMatch(/1\.5k.*tokens/);
        expect(tt!.textContent || "").toMatch(/2 questions/);
        unmount(state);
    });

    it("includes input/output split when both are non-zero", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        act(() => { root.focus(); });
        const tt = state.container.querySelector("[data-testid='pp-sustainability-tooltip']")!;
        expect(tt.textContent || "").toMatch(/1\.2k in/);
        expect(tt.textContent || "").toMatch(/300 out/);
        unmount(state);
    });

    it("calls out estimation when hasEstimates is true and hasRealData false", () => {
        const estimated: SessionUsage = { ...leanUsage(), hasRealData: false, hasEstimates: true };
        const state = mount(<SustainabilityIndicator override={estimated} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        act(() => { root.focus(); });
        const tt = state.container.querySelector("[data-testid='pp-sustainability-tooltip']")!;
        expect(tt.textContent || "").toMatch(/Estimated from text length/);
        unmount(state);
    });

    it("calls out mixed real+estimated state", () => {
        const mixed: SessionUsage = { ...leanUsage(), hasRealData: true, hasEstimates: true };
        const state = mount(<SustainabilityIndicator override={mixed} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        act(() => { root.focus(); });
        const tt = state.container.querySelector("[data-testid='pp-sustainability-tooltip']")!;
        expect(tt.textContent || "").toMatch(/Mix of real \+ estimated/);
        unmount(state);
    });

    it("disappears on mouseleave", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        act(() => { root.focus(); });
        expect(state.container.querySelector("[data-testid='pp-sustainability-tooltip']")).not.toBeNull();
        act(() => { root.blur(); });
        expect(state.container.querySelector("[data-testid='pp-sustainability-tooltip']")).toBeNull();
        unmount(state);
    });

    it("tooltip still appears on hover when in 'ready' state (questionCount=0)", () => {
        const state = mount(<SustainabilityIndicator override={readyUsage()} />);
        const root = state.container.querySelector("[data-testid='pp-sustainability']") as HTMLElement;
        act(() => { root.focus(); });
        const tt = state.container.querySelector("[data-testid='pp-sustainability-tooltip']");
        expect(tt).not.toBeNull();
        expect(tt!.textContent || "").toMatch(/Ready/);
        unmount(state);
    });
});

/* ─── Reset button ──────────────────────────────────────────────────── */

describe("SustainabilityIndicator — reset button", () => {
    it("is hidden by default (showReset omitted)", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} />);
        expect(state.container.querySelector(".pp-sustainability__reset")).toBeNull();
        unmount(state);
    });

    it("is hidden in 'ready' state even when showReset=true", () => {
        const state = mount(<SustainabilityIndicator override={readyUsage()} showReset />);
        expect(state.container.querySelector(".pp-sustainability__reset")).toBeNull();
        unmount(state);
    });

    it("appears when showReset=true and there is usage", () => {
        const state = mount(<SustainabilityIndicator override={leanUsage()} showReset />);
        const btn = state.container.querySelector(".pp-sustainability__reset");
        expect(btn).not.toBeNull();
        unmount(state);
    });

    it("clicking the reset button calls resetSessionUsage and updates display", () => {
        // Seed real tracker (not override) so the reset effect is visible.
        recordResponse({ usage: { prompt_tokens: 800, completion_tokens: 200 } });
        const state = mount(<SustainabilityIndicator showReset />);
        const btn = state.container.querySelector(".pp-sustainability__reset") as HTMLButtonElement;
        expect(btn).not.toBeNull();
        act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        // After reset, tracker is ready and button is hidden.
        const label = state.container.querySelector("[data-testid='pp-sustainability-label']");
        expect(label?.textContent).toBe("Ready");
        expect(state.container.querySelector(".pp-sustainability__reset")).toBeNull();
        unmount(state);
    });
});

/* ─── Live subscribe behaviour ──────────────────────────────────────── */

describe("SustainabilityIndicator — live subscription (no override)", () => {
    it("re-renders when usage tracker fires", () => {
        const state = mount(<SustainabilityIndicator />);
        let label = state.container.querySelector("[data-testid='pp-sustainability-label']");
        expect(label?.textContent).toBe("Ready");
        act(() => { recordResponse({ usage: { prompt_tokens: 800, completion_tokens: 200 } }); });
        label = state.container.querySelector("[data-testid='pp-sustainability-label']");
        expect(label?.textContent).toBe("Lean");
        unmount(state);
    });

    it("unmount stops subscriptions (no errors after recordResponse)", () => {
        const state = mount(<SustainabilityIndicator />);
        unmount(state);
        // Calling recordResponse post-unmount must not throw.
        expect(() => recordResponse({ usage: { prompt_tokens: 100, completion_tokens: 0 } })).not.toThrow();
    });
});
