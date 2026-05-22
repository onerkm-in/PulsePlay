// playground/src/lib/desktopRuntimeClient.ts
//
// React-side client for the desktop launcher's /runtime/* endpoints
// (docs/DX1_LAUNCHER_CONTRACT.md §8). All exported functions are no-ops
// in browser mode (no launch token in sessionStorage) so the same
// playground bundle works in both deployments.
//
// EXE-mode detection rule: presence of `pulseplay:desktop-launch-token`
// in sessionStorage. The /launch shim served by the app server puts it
// there on first load (HTML at runtime/appServer.mjs launchHtml()).

const LAUNCH_TOKEN_KEY = "pulseplay:desktop-launch-token";
const LAUNCH_TOKEN_HEADER = "X-PulsePlay-Launch-Token";
const RECON_DISMISS_LOCAL_KEY = "pulseplay:desktop-recon-disclaimer-dismissed";
const SETTINGS_SAVED_EVENT = "pulseplay:settings-saved";
const HEARTBEAT_INTERVAL_MS = 15_000;
const PULSEPLAY_PREFIX = "pulseplay:";

// Local copy of the META_KEYS set from settings/useSettingsDraft so the
// desktop client doesn't import from a UI module (avoids circular deps).
// Keep in sync with useSettingsDraft.META_KEYS.
const SETTINGS_META_KEYS: ReadonlySet<string> = new Set([
    "pulseplay:wizard-dismissed",
    "pulseplay:wizard-force",
    "pulseplay:wizard-draft",
    "pulseplay:settings-last-group",
    "pulseplay:pinned-viewport-pane",
    "pulseplay:enabled-components:legacy-both-migrated",
    "pulseplay:display-change",
]);

function isUserSettingsKey(k: string): boolean {
    return k.startsWith(PULSEPLAY_PREFIX) && !SETTINGS_META_KEYS.has(k);
}

function safeGetSessionItem(key: string): string | null {
    try {
        return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

function safeSetSessionItem(key: string, value: string): void {
    try {
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
    } catch { /* private browsers may block; silent */ }
}

export function getLaunchToken(): string | null {
    return safeGetSessionItem(LAUNCH_TOKEN_KEY);
}

/** Returns true when running inside the packaged desktop launcher. */
export function isDesktopMode(): boolean {
    return getLaunchToken() !== null;
}

/**
 * Detect a launch URL fragment of the form `#token=<base64url>` (set by
 * the /launch shim only when JS is disabled or the shim never ran),
 * move the token into sessionStorage, and clear the URL. Safe to call
 * in browser mode (no fragment present = no-op).
 */
export function ingestLaunchFragmentIfPresent(): void {
    if (typeof window === "undefined") return;
    try {
        const hash = window.location.hash || "";
        const m = hash.match(/(?:^|&|#)token=([A-Za-z0-9_-]+)/);
        if (m && m[1]) {
            safeSetSessionItem(LAUNCH_TOKEN_KEY, m[1]);
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
    } catch { /* swallow */ }
}

function authHeaders(token: string): Record<string, string> {
    return { [LAUNCH_TOKEN_HEADER]: token };
}

interface RuntimeStateEnvelope {
    profile: string;
    state: Record<string, unknown>;
}

export async function fetchRuntimeState(): Promise<RuntimeStateEnvelope | null> {
    const token = getLaunchToken();
    if (!token) return null;
    try {
        const res = await fetch("/runtime/state", { headers: authHeaders(token) });
        if (!res.ok) return null;
        return (await res.json()) as RuntimeStateEnvelope;
    } catch {
        return null;
    }
}

/**
 * Restore the playground's pulseplay:* localStorage snapshot from the
 * desktop launcher's persisted state. Idempotent. Returns the number
 * of keys restored, or 0 in browser mode / when nothing to restore.
 */
export async function bootstrapDesktopMode(): Promise<number> {
    if (!isDesktopMode()) return 0;
    const env = await fetchRuntimeState();
    if (!env) return 0;
    const ls = (env.state && typeof env.state === "object" ? env.state : null) as
        | { settings?: { localStorage?: Record<string, unknown> } }
        | null;
    const snapshot = ls?.settings?.localStorage;
    if (!snapshot || typeof snapshot !== "object") return 0;
    let count = 0;
    try {
        for (const [k, v] of Object.entries(snapshot)) {
            if (typeof v === "string" && isUserSettingsKey(k)) {
                localStorage.setItem(k, v);
                count += 1;
            }
        }
    } catch { /* localStorage may be blocked in some private modes */ }
    return count;
}

export interface PushOutcome {
    ok: boolean;
    status?: number;
    error?: string;
}

/**
 * Snapshot the playground's pulseplay:* localStorage keys (excluding
 * META_KEYS) and PUT to /runtime/state under scope='settings'. Returns
 * { ok } so the caller can show a "not synced" chip if the push failed.
 */
export async function pushSettingsSnapshot(snapshot?: Record<string, string>): Promise<PushOutcome> {
    const token = getLaunchToken();
    if (!token) return { ok: false, error: "not in desktop mode" };
    const ls: Record<string, string> = snapshot ?? snapshotLocalStorage();
    try {
        const res = await fetch("/runtime/state", {
            method: "PUT",
            headers: { ...authHeaders(token), "content-type": "application/json" },
            body: JSON.stringify({ scope: "settings", patch: { localStorage: ls } }),
        });
        return { ok: res.ok, status: res.status };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export function snapshotLocalStorage(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
        if (typeof localStorage === "undefined") return out;
        for (let i = 0; i < localStorage.length; i += 1) {
            const k = localStorage.key(i);
            if (k && isUserSettingsKey(k)) {
                const v = localStorage.getItem(k);
                if (v !== null) out[k] = v;
            }
        }
    } catch { /* swallow */ }
    return out;
}

/**
 * Best-effort heartbeat POST. Returns true on 2xx, false otherwise.
 * Designed to be cheap to call on a setInterval - failure is silent.
 */
export async function sendHeartbeat(): Promise<boolean> {
    const token = getLaunchToken();
    if (!token) return false;
    try {
        const res = await fetch("/runtime/heartbeat", {
            method: "POST",
            headers: authHeaders(token),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function requestQuit(): Promise<boolean> {
    const token = getLaunchToken();
    if (!token) return false;
    try {
        const res = await fetch("/runtime/quit", {
            method: "POST",
            headers: authHeaders(token),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Recon-disclaimer dismissal lives in BOTH localStorage (so the UI
 *  doesn't flash) AND in /runtime/state under desktop scope (so it
 *  survives a profile reset on the launcher side). */
export function isReconDisclaimerDismissed(): boolean {
    try {
        return localStorage.getItem(RECON_DISMISS_LOCAL_KEY) === "true";
    } catch {
        return false;
    }
}

export async function dismissReconDisclaimer(): Promise<void> {
    try { localStorage.setItem(RECON_DISMISS_LOCAL_KEY, "true"); } catch { /* swallow */ }
    const token = getLaunchToken();
    if (!token) return;
    try {
        await fetch("/runtime/state", {
            method: "PUT",
            headers: { ...authHeaders(token), "content-type": "application/json" },
            body: JSON.stringify({
                scope: "desktop",
                patch: { reconDisclaimerDismissed: new Date().toISOString() },
            }),
        });
    } catch { /* swallow */ }
}

/**
 * Kick off the desktop runtime side effects: heartbeat interval and
 * settings-saved subscription. Safe to call once at app startup; no-op
 * in browser mode. Returns a teardown function for tests.
 */
export function startDesktopRuntime(): () => void {
    if (typeof window === "undefined") return () => {};
    if (!isDesktopMode()) return () => {};

    const heartbeat = setInterval(() => { void sendHeartbeat(); }, HEARTBEAT_INTERVAL_MS);
    // Fire one beat now so the watchdog kicks immediately rather than
    // waiting HEARTBEAT_INTERVAL_MS for the first tick.
    void sendHeartbeat();

    const onSaved = (event: Event) => {
        const detail = (event as CustomEvent<{ snapshot?: Record<string, string> }>).detail;
        const snap = detail?.snapshot ?? snapshotLocalStorage();
        void pushSettingsSnapshot(snap);
    };
    window.addEventListener(SETTINGS_SAVED_EVENT, onSaved as EventListener);

    return () => {
        clearInterval(heartbeat);
        window.removeEventListener(SETTINGS_SAVED_EVENT, onSaved as EventListener);
    };
}

export const __forTests = {
    LAUNCH_TOKEN_KEY,
    LAUNCH_TOKEN_HEADER,
    RECON_DISMISS_LOCAL_KEY,
    SETTINGS_SAVED_EVENT,
    SETTINGS_META_KEYS,
    isUserSettingsKey,
};
