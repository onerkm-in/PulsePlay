import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
    useExperienceMode,
    setPreviewMode,
    readPreviewMode,
    EXPERIENCE_FALLBACK_MODE,
} from "../experienceMode";

function mockConfig(served: string, published = served, extra: Record<string, unknown> = {}) {
    return vi.fn(async () => ({
        ok: true,
        json: async () => ({ served_mode: served, published_mode: published, version: 3, kill_switch: false, ...extra }),
    })) as unknown as typeof fetch;
}

describe("experience mode resolution", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("uses the server-published served mode", async () => {
        vi.stubGlobal("fetch", mockConfig("combined"));
        const { result } = renderHook(() => useExperienceMode());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.servedMode).toBe("combined");
        expect(result.current.effectiveMode).toBe("combined");
    });

    test("falls back to segregated when the server is unreachable", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch);
        const { result } = renderHook(() => useExperienceMode());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.effectiveMode).toBe(EXPERIENCE_FALLBACK_MODE);
        expect(result.current.effectiveMode).toBe("segregated");
    });

    test("author preview overrides the served mode for this session only", async () => {
        vi.stubGlobal("fetch", mockConfig("segregated"));
        const { result } = renderHook(() => useExperienceMode());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.effectiveMode).toBe("segregated");
        act(() => setPreviewMode("combined"));
        await waitFor(() => expect(result.current.effectiveMode).toBe("combined"));
        // served mode is unchanged — preview is local only
        expect(result.current.servedMode).toBe("segregated");
    });

    test("clearing preview returns to the served mode", async () => {
        vi.stubGlobal("fetch", mockConfig("segregated"));
        const { result } = renderHook(() => useExperienceMode());
        await waitFor(() => expect(result.current.loading).toBe(false));
        act(() => setPreviewMode("combined"));
        await waitFor(() => expect(result.current.effectiveMode).toBe("combined"));
        act(() => setPreviewMode(null));
        await waitFor(() => expect(result.current.effectiveMode).toBe("segregated"));
    });

    test("an invalid server mode resolves to segregated (fail-safe)", async () => {
        vi.stubGlobal("fetch", mockConfig("nonsense"));
        const { result } = renderHook(() => useExperienceMode());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.effectiveMode).toBe("segregated");
    });

    test("readPreviewMode ignores a garbage sessionStorage value", () => {
        window.sessionStorage.setItem("pulseplay:experience-preview", "banana");
        expect(readPreviewMode()).toBeNull();
    });
});
