// playground/src/settings/__tests__/useSettingsDraft.test.tsx
//
// Snapshot-based dirty tracking. The audit found that meta keys (wizard
// dismissal, settings-last-group, etc) written AFTER the snapshot was
// taken would race the tracker and flip isDirty to true on a fresh page
// load. These tests pin the META_KEYS exclusion so the regression can't
// come back.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSettingsDraft, META_KEYS, LIVE_VIEW_KEYS } from "../useSettingsDraft";

interface Captured {
    isDirty: boolean;
    save: () => void;
    discard: () => void;
}

function HarnessProbe(props: { captured: { current: Captured | null } }) {
    const draft = useSettingsDraft();
    props.captured.current = draft;
    return null;
}

function mountHarness(captured: { current: Captured | null }): { root: Root; container: HTMLElement } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<HarnessProbe captured={captured} />);
    });
    return { root, container };
}

function unmountHarness(state: { root: Root; container: HTMLElement }) {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

describe("useSettingsDraft", () => {
    beforeEach(() => {
        // Clear ALL pulseplay: keys before each test so prior runs don't
        // leak into the snapshot.
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith("pulseplay:")) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
    });

    afterEach(() => {
        // Same cleanup post-test so we don't pollute the next test file.
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith("pulseplay:")) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
    });

    it("isDirty starts false on a clean mount", () => {
        const captured: { current: Captured | null } = { current: null };
        const state = mountHarness(captured);
        try {
            expect(captured.current?.isDirty).toBe(false);
        } finally {
            unmountHarness(state);
        }
    });

    it("isDirty flips when a user-settings key changes after mount", async () => {
        localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        const captured: { current: Captured | null } = { current: null };
        const state = mountHarness(captured);
        try {
            expect(captured.current?.isDirty).toBe(false);
            await act(async () => {
                localStorage.setItem("pulseplay:bi-vendor", "tableau");
                window.dispatchEvent(new CustomEvent("pulseplay:display-change"));
                await new Promise(r => setTimeout(r, 0));
            });
            expect(captured.current?.isDirty).toBe(true);
        } finally {
            unmountHarness(state);
        }
    });

    it("isDirty stays false when only META keys are written after mount", async () => {
        // Empty start state. Mount the tracker — snapshot is empty.
        const captured: { current: Captured | null } = { current: null };
        const state = mountHarness(captured);
        try {
            // Simulate the routing / wizard writes that happen during navigation
            // (the exact race that produced the phantom "Unsaved changes" bug).
            await act(async () => {
                localStorage.setItem("pulseplay:wizard-dismissed", "true");
                localStorage.setItem("pulseplay:settings-last-group", "setup");
                localStorage.setItem("pulseplay:pinned-viewport-pane", "ai");
                window.dispatchEvent(new CustomEvent("pulseplay:display-change"));
                await new Promise(r => setTimeout(r, 0));
            });
            expect(captured.current?.isDirty).toBe(false);
        } finally {
            unmountHarness(state);
        }
    });

    it("discard() restores user-settings keys but leaves META keys alone", async () => {
        // Pre-existing user setting that's in the snapshot.
        localStorage.setItem("pulseplay:bi-vendor", "powerbi");
        const captured: { current: Captured | null } = { current: null };
        const state = mountHarness(captured);
        try {
            // User edits the setting. Routing writes a meta key. Both happen
            // before discard so we can verify each side independently.
            await act(async () => {
                localStorage.setItem("pulseplay:bi-vendor", "tableau");
                localStorage.setItem("pulseplay:settings-last-group", "ai");
                window.dispatchEvent(new CustomEvent("pulseplay:display-change"));
                await new Promise(r => setTimeout(r, 0));
            });
            expect(captured.current?.isDirty).toBe(true);

            act(() => { captured.current?.discard(); });
            expect(localStorage.getItem("pulseplay:bi-vendor")).toBe("powerbi");
            // Meta key is left alone — discarding user-settings must not nuke
            // navigation / wizard state.
            expect(localStorage.getItem("pulseplay:settings-last-group")).toBe("ai");
            expect(captured.current?.isDirty).toBe(false);
        } finally {
            unmountHarness(state);
        }
    });

    it("META_KEYS includes the keys the audit identified", () => {
        // Pin the contract so a future refactor can't quietly drop one of
        // these and reintroduce the phantom-dirty bug.
        expect(META_KEYS.has("pulseplay:wizard-dismissed")).toBe(true);
        expect(META_KEYS.has("pulseplay:wizard-force")).toBe(true);
        expect(META_KEYS.has("pulseplay:wizard-draft")).toBe(true);
        expect(META_KEYS.has("pulseplay:settings-last-group")).toBe(true);
        expect(META_KEYS.has("pulseplay:pinned-viewport-pane")).toBe(true);
    });

    it("does NOT flip isDirty when only live view/layout keys change (2026-05-28)", async () => {
        const captured: { current: Captured | null } = { current: null };
        const state = mountHarness(captured);
        try {
            expect(captured.current?.isDirty).toBe(false);
            await act(async () => {
                // Live view toggles apply instantly; they must not light the bar.
                localStorage.setItem("pulseplay:ui-mode", "v0");
                localStorage.setItem("pulseplay:layout-mode", "ai-right");
                localStorage.setItem("pulseplay:enabled-components", "both");
                localStorage.setItem("pulseplay:active-surface", "ask-pulse");
                window.dispatchEvent(new CustomEvent("pulseplay:display-change"));
                await new Promise(r => setTimeout(r, 0));
            });
            expect(captured.current?.isDirty).toBe(false);
        } finally {
            unmountHarness(state);
        }
    });

    it("STILL flips isDirty for real config changes alongside live view keys", async () => {
        const captured: { current: Captured | null } = { current: null };
        const state = mountHarness(captured);
        try {
            await act(async () => {
                localStorage.setItem("pulseplay:ui-mode", "v0");           // excluded
                localStorage.setItem("pulseplay:active-ai-profile", "x");  // real config
                window.dispatchEvent(new CustomEvent("pulseplay:display-change"));
                await new Promise(r => setTimeout(r, 0));
            });
            expect(captured.current?.isDirty).toBe(true);
        } finally {
            unmountHarness(state);
        }
    });

    it("LIVE_VIEW_KEYS pins the live view/layout exclusion contract", () => {
        expect(LIVE_VIEW_KEYS.has("pulseplay:ui-mode")).toBe(true);
        expect(LIVE_VIEW_KEYS.has("pulseplay:layout-mode")).toBe(true);
        expect(LIVE_VIEW_KEYS.has("pulseplay:enabled-components")).toBe(true);
        expect(LIVE_VIEW_KEYS.has("pulseplay:active-surface")).toBe(true);
        // Real authoring config must NOT be excluded.
        expect(LIVE_VIEW_KEYS.has("pulseplay:active-ai-profile")).toBe(false);
        expect(LIVE_VIEW_KEYS.has("pulseplay:bi-vendor")).toBe(false);
    });
});
