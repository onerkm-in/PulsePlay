// playground/src/lib/__tests__/desktopRuntimeClient.test.ts
//
// vitest coverage for the desktop runtime client. Uses the playground's
// existing jsdom environment + vitest's vi.stubGlobal for fetch.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
    isDesktopMode,
    getLaunchToken,
    ingestLaunchFragmentIfPresent,
    fetchRuntimeState,
    bootstrapDesktopMode,
    pushSettingsSnapshot,
    snapshotLocalStorage,
    sendHeartbeat,
    isReconDisclaimerDismissed,
    dismissReconDisclaimer,
    startDesktopRuntime,
    __forTests,
} from "../desktopRuntimeClient";

const { LAUNCH_TOKEN_KEY, LAUNCH_TOKEN_HEADER, SETTINGS_SAVED_EVENT, RECON_DISMISS_LOCAL_KEY, isUserSettingsKey } = __forTests;

const TOKEN = "test-launch-token-abcdef1234567890";

function setToken(t = TOKEN) {
    sessionStorage.setItem(LAUNCH_TOKEN_KEY, t);
}

function clearAll() {
    sessionStorage.clear();
    localStorage.clear();
}

describe("desktopRuntimeClient", () => {
    beforeEach(() => {
        clearAll();
        // jsdom defaults the URL to about:blank with no hash; reset for fragment tests.
        window.history.replaceState(null, "", "/");
    });
    afterEach(() => {
        vi.restoreAllMocks();
        clearAll();
    });

    it("isDesktopMode is false without a launch token", () => {
        expect(isDesktopMode()).toBe(false);
        expect(getLaunchToken()).toBeNull();
    });

    it("isDesktopMode is true once a launch token lives in sessionStorage", () => {
        setToken();
        expect(isDesktopMode()).toBe(true);
        expect(getLaunchToken()).toBe(TOKEN);
    });

    it("ingestLaunchFragmentIfPresent moves #token=... to sessionStorage and clears the URL", () => {
        window.history.replaceState(null, "", "/some-path#token=fragment-token-1234");
        ingestLaunchFragmentIfPresent();
        expect(sessionStorage.getItem(LAUNCH_TOKEN_KEY)).toBe("fragment-token-1234");
        expect(window.location.hash).toBe("");
        expect(window.location.pathname).toBe("/some-path");
    });

    it("ingestLaunchFragmentIfPresent is a no-op when no token fragment is present", () => {
        window.history.replaceState(null, "", "/just-a-path");
        ingestLaunchFragmentIfPresent();
        expect(sessionStorage.getItem(LAUNCH_TOKEN_KEY)).toBeNull();
    });

    it("fetchRuntimeState returns null without a token", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const v = await fetchRuntimeState();
        expect(v).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetchRuntimeState fetches /runtime/state with the launch-token header", async () => {
        setToken();
        const env = { profile: "default", state: { settings: { localStorage: { "pulseplay:foo": "bar" } } } };
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => env }));
        vi.stubGlobal("fetch", fetchMock);
        const v = await fetchRuntimeState();
        expect(v).toEqual(env);
        expect(fetchMock).toHaveBeenCalledWith("/runtime/state", expect.objectContaining({
            headers: expect.objectContaining({ [LAUNCH_TOKEN_HEADER]: TOKEN }),
        }));
    });

    it("bootstrapDesktopMode restores user-settings keys from /runtime/state, skips meta keys", async () => {
        setToken();
        const env = {
            profile: "default",
            state: {
                settings: {
                    localStorage: {
                        "pulseplay:theme": "slate-dark",                  // user-settings, restored
                        "pulseplay:layout-mode": "split",                 // user-settings, restored
                        "pulseplay:wizard-dismissed": "true",             // meta, NOT restored
                        "pulseplay:display-change": "noise",              // meta, NOT restored
                        "totally-different-key": "x",                     // non-prefix, NOT restored
                        nestedObject: { not: "a string" } as unknown,     // non-string, NOT restored
                    },
                },
            },
        };
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => env })));

        const count = await bootstrapDesktopMode();
        expect(count).toBe(2);
        expect(localStorage.getItem("pulseplay:theme")).toBe("slate-dark");
        expect(localStorage.getItem("pulseplay:layout-mode")).toBe("split");
        expect(localStorage.getItem("pulseplay:wizard-dismissed")).toBeNull();
        expect(localStorage.getItem("totally-different-key")).toBeNull();
    });

    it("bootstrapDesktopMode returns 0 in browser mode without fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const n = await bootstrapDesktopMode();
        expect(n).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("snapshotLocalStorage returns only pulseplay:* user-settings keys", () => {
        localStorage.setItem("pulseplay:foo", "1");
        localStorage.setItem("pulseplay:bar", "2");
        localStorage.setItem("pulseplay:wizard-dismissed", "true");  // meta
        localStorage.setItem("other:thing", "3");                    // non-prefix
        const snap = snapshotLocalStorage();
        expect(snap).toEqual({ "pulseplay:foo": "1", "pulseplay:bar": "2" });
    });

    it("pushSettingsSnapshot PUTs the patch with scope=settings and forwards the token", async () => {
        setToken();
        localStorage.setItem("pulseplay:foo", "bar");
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const out = await pushSettingsSnapshot();
        expect(out).toEqual({ ok: true, status: 200 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/runtime/state");
        expect(init.method).toBe("PUT");
        expect(init.headers[LAUNCH_TOKEN_HEADER]).toBe(TOKEN);
        const body = JSON.parse(init.body);
        expect(body.scope).toBe("settings");
        expect(body.patch.localStorage["pulseplay:foo"]).toBe("bar");
    });

    it("pushSettingsSnapshot returns ok=false in browser mode without fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const out = await pushSettingsSnapshot();
        expect(out.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sendHeartbeat POSTs /runtime/heartbeat and returns true on 2xx", async () => {
        setToken();
        const fetchMock = vi.fn(async () => ({ ok: true }));
        vi.stubGlobal("fetch", fetchMock);
        const ok = await sendHeartbeat();
        expect(ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith("/runtime/heartbeat", expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({ [LAUNCH_TOKEN_HEADER]: TOKEN }),
        }));
    });

    it("sendHeartbeat returns false in browser mode without fetching", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const ok = await sendHeartbeat();
        expect(ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("dismissReconDisclaimer flips the localStorage flag and PUTs desktop scope", async () => {
        setToken();
        expect(isReconDisclaimerDismissed()).toBe(false);
        const fetchMock = vi.fn(async () => ({ ok: true }));
        vi.stubGlobal("fetch", fetchMock);

        await dismissReconDisclaimer();
        expect(isReconDisclaimerDismissed()).toBe(true);
        expect(localStorage.getItem(RECON_DISMISS_LOCAL_KEY)).toBe("true");
        expect(fetchMock).toHaveBeenCalledWith("/runtime/state", expect.objectContaining({
            method: "PUT",
        }));
        const init = fetchMock.mock.calls[0][1];
        const body = JSON.parse(init.body);
        expect(body.scope).toBe("desktop");
        expect(body.patch.reconDisclaimerDismissed).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("startDesktopRuntime returns a no-op teardown in browser mode", () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const teardown = startDesktopRuntime();
        expect(typeof teardown).toBe("function");
        teardown();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("startDesktopRuntime pushes a snapshot when pulseplay:settings-saved fires", async () => {
        setToken();
        const fetchMock = vi.fn(async () => ({ ok: true }));
        vi.stubGlobal("fetch", fetchMock);

        const teardown = startDesktopRuntime();
        // First fetch from startDesktopRuntime is the initial heartbeat.
        await Promise.resolve();
        fetchMock.mockClear();

        window.dispatchEvent(new CustomEvent(SETTINGS_SAVED_EVENT, {
            detail: { snapshot: { "pulseplay:foo": "bar" } },
        }));
        // Microtask flush so the async PUT runs.
        await new Promise((r) => setTimeout(r, 0));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/runtime/state");
        expect(init.method).toBe("PUT");
        const body = JSON.parse(init.body);
        expect(body.scope).toBe("settings");
        expect(body.patch.localStorage["pulseplay:foo"]).toBe("bar");

        teardown();
    });

    it("isUserSettingsKey filters meta keys", () => {
        expect(isUserSettingsKey("pulseplay:foo")).toBe(true);
        expect(isUserSettingsKey("pulseplay:wizard-dismissed")).toBe(false);
        expect(isUserSettingsKey("pulseplay:display-change")).toBe(false);
        expect(isUserSettingsKey("other:thing")).toBe(false);
    });
});
