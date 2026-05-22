// playground/src/settings/__tests__/embedConfigStore.test.tsx
//
// Coverage for the dedicated embedConfigStore that powers the
// Settings BI Embed leaf (Phase 3 / fix #6 — Phase A only).
//
// Until Codex finishes the Allowlist fail-closed lane in
// settingsStore.tsx, the playground's bi-embed config lives in this
// separate module to avoid merge conflicts. App.tsx adopts the store
// in Phase B (read-from-store + storage-event subscription).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    getEmbedConfig,
    setEmbedConfig,
    useEmbedConfig,
    __resetEmbedConfigStore,
    EMBED_CONFIG_STORAGE_KEY,
    EMBED_CONFIG_CHANGE_EVENT,
} from "../embedConfigStore";

beforeEach(() => {
    __resetEmbedConfigStore();
    try { window.localStorage.removeItem(EMBED_CONFIG_STORAGE_KEY); } catch { /* swallow */ }
});

afterEach(() => {
    __resetEmbedConfigStore();
    try { window.localStorage.removeItem(EMBED_CONFIG_STORAGE_KEY); } catch { /* swallow */ }
});

describe("getEmbedConfig", () => {
    it("returns empty object when localStorage is empty", () => {
        expect(getEmbedConfig()).toEqual({});
    });

    it("reads JSON value from localStorage on first call", () => {
        window.localStorage.setItem(
            EMBED_CONFIG_STORAGE_KEY,
            JSON.stringify({ type: "report", id: "report-1", groupId: "ws-1" }),
        );
        expect(getEmbedConfig()).toEqual({
            type: "report",
            id: "report-1",
            groupId: "ws-1",
        });
    });

    it("caches the parsed value in memory (does not re-read on every call)", () => {
        window.localStorage.setItem(
            EMBED_CONFIG_STORAGE_KEY,
            JSON.stringify({ id: "first" }),
        );
        expect(getEmbedConfig().id).toBe("first");
        // Mutate localStorage directly — without resetting the in-memory
        // cache, getEmbedConfig should still return the cached value.
        window.localStorage.setItem(
            EMBED_CONFIG_STORAGE_KEY,
            JSON.stringify({ id: "second" }),
        );
        expect(getEmbedConfig().id).toBe("first");
    });

    it("rejects malformed JSON gracefully", () => {
        window.localStorage.setItem(EMBED_CONFIG_STORAGE_KEY, "not-json{");
        expect(getEmbedConfig()).toEqual({});
    });

    it("rejects non-object payloads (arrays, primitives, null)", () => {
        window.localStorage.setItem(EMBED_CONFIG_STORAGE_KEY, JSON.stringify([1, 2, 3]));
        expect(getEmbedConfig()).toEqual({});
        __resetEmbedConfigStore();
        window.localStorage.setItem(EMBED_CONFIG_STORAGE_KEY, JSON.stringify("string"));
        expect(getEmbedConfig()).toEqual({});
        __resetEmbedConfigStore();
        window.localStorage.setItem(EMBED_CONFIG_STORAGE_KEY, JSON.stringify(null));
        expect(getEmbedConfig()).toEqual({});
    });
});

describe("setEmbedConfig", () => {
    it("persists the value to localStorage", () => {
        setEmbedConfig({ id: "r1", groupId: "ws1" });
        const raw = window.localStorage.getItem(EMBED_CONFIG_STORAGE_KEY);
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw!)).toEqual({ id: "r1", groupId: "ws1" });
    });

    it("broadcasts a CHANGE_EVENT on the window with the new value", () => {
        const events: Array<{ value: unknown }> = [];
        const handler = (e: Event) => {
            events.push(((e as CustomEvent).detail as { value: unknown }));
        };
        window.addEventListener(EMBED_CONFIG_CHANGE_EVENT, handler as EventListener);
        setEmbedConfig({ id: "r1" });
        setEmbedConfig({ id: "r2" });
        window.removeEventListener(EMBED_CONFIG_CHANGE_EVENT, handler as EventListener);
        expect(events).toHaveLength(2);
        expect((events[0].value as { id: string }).id).toBe("r1");
        expect((events[1].value as { id: string }).id).toBe("r2");
    });

    it("treats null + empty object as clear (removes from localStorage)", () => {
        setEmbedConfig({ id: "r1" });
        expect(window.localStorage.getItem(EMBED_CONFIG_STORAGE_KEY)).toBeTruthy();
        setEmbedConfig(null);
        expect(window.localStorage.getItem(EMBED_CONFIG_STORAGE_KEY)).toBeNull();
        setEmbedConfig({ id: "r2" });
        setEmbedConfig({});
        expect(window.localStorage.getItem(EMBED_CONFIG_STORAGE_KEY)).toBeNull();
    });

    it("rejects non-object input defensively (treats as clear)", () => {
        setEmbedConfig({ id: "r1" });
        // Defensive: a misbehaving caller passing an array should not corrupt state.
        setEmbedConfig([1, 2, 3] as unknown as Record<string, unknown>);
        expect(window.localStorage.getItem(EMBED_CONFIG_STORAGE_KEY)).toBeNull();
        expect(getEmbedConfig()).toEqual({});
    });
});

/* ─── useEmbedConfig hook ───────────────────────────────────────────── */

describe("useEmbedConfig hook", () => {
    interface MountState {
        container: HTMLElement;
        root: Root;
        lastValue: { current: Record<string, unknown> | null };
        lastSet: { current: ((next: Record<string, unknown> | null) => void) | null };
        lastClear: { current: (() => void) | null };
    }

    function HookProbe(props: {
        valueRef: { current: Record<string, unknown> | null };
        setRef: { current: ((next: Record<string, unknown> | null) => void) | null };
        clearRef: { current: (() => void) | null };
    }) {
        const { embedConfig, setEmbedConfig: set, clearEmbedConfig } = useEmbedConfig();
        props.valueRef.current = embedConfig as Record<string, unknown>;
        props.setRef.current = set as unknown as (next: Record<string, unknown> | null) => void;
        props.clearRef.current = clearEmbedConfig;
        return null;
    }

    function mount(): MountState {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const lastValue: MountState["lastValue"] = { current: null };
        const lastSet: MountState["lastSet"] = { current: null };
        const lastClear: MountState["lastClear"] = { current: null };
        act(() => { root.render(<HookProbe valueRef={lastValue} setRef={lastSet} clearRef={lastClear} />); });
        return { container, root, lastValue, lastSet, lastClear };
    }

    function unmount(s: MountState) {
        act(() => s.root.unmount());
        s.container.remove();
    }

    it("returns the current persisted value on first render", () => {
        setEmbedConfig({ id: "r-init", groupId: "ws-init" });
        const s = mount();
        expect(s.lastValue.current).toEqual({ id: "r-init", groupId: "ws-init" });
        unmount(s);
    });

    it("updates when setEmbedConfig (from the hook) fires", () => {
        const s = mount();
        expect(s.lastValue.current).toEqual({});
        act(() => { s.lastSet.current!({ id: "r-from-hook" }); });
        expect(s.lastValue.current).toEqual({ id: "r-from-hook" });
        unmount(s);
    });

    it("updates when setEmbedConfig (from the module-level imperative API) fires", () => {
        const s = mount();
        act(() => { setEmbedConfig({ id: "r-imperative" }); });
        expect(s.lastValue.current).toEqual({ id: "r-imperative" });
        unmount(s);
    });

    it("clears via clearEmbedConfig", () => {
        const s = mount();
        act(() => { s.lastSet.current!({ id: "r1" }); });
        expect(s.lastValue.current).toEqual({ id: "r1" });
        act(() => { s.lastClear.current!(); });
        expect(s.lastValue.current).toEqual({});
        unmount(s);
    });

    it("reacts to cross-tab storage events", () => {
        const s = mount();
        expect(s.lastValue.current).toEqual({});
        // Simulate another tab writing to the same key.
        window.localStorage.setItem(
            EMBED_CONFIG_STORAGE_KEY,
            JSON.stringify({ id: "r-cross-tab" }),
        );
        act(() => {
            window.dispatchEvent(new StorageEvent("storage", {
                key: EMBED_CONFIG_STORAGE_KEY,
                newValue: JSON.stringify({ id: "r-cross-tab" }),
            }));
        });
        expect(s.lastValue.current).toEqual({ id: "r-cross-tab" });
        unmount(s);
    });

    it("ignores storage events for unrelated keys", () => {
        const s = mount();
        const before = s.lastValue.current;
        act(() => {
            window.dispatchEvent(new StorageEvent("storage", {
                key: "pulseplay:some-other-key",
                newValue: "noise",
            }));
        });
        expect(s.lastValue.current).toBe(before);
        unmount(s);
    });
});
