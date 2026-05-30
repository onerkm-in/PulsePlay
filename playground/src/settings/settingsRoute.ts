// playground/src/settings/settingsRoute.ts
//
// Tiny path-based router for the /settings surface. No new dep — the
// playground intentionally stays lean (see package.json comments).
//
// Routes:
//   /                              → playground (default)
//   /settings                      → SettingsShell at default group (last-visited or "setup")
//   /settings/<group>              → SettingsShell at named group
//   /settings/<group>/<leaf>       → SettingsShell at named group, scroll to leaf
//
// Browser back/forward works because we use history.pushState + popstate.
// Vite dev server's SPA fallback handles deep-link reload.

import { useEffect, useState } from "react";

export type SettingsGroupId = "setup" | "bi" | "ai" | "preferences" | "system" | "advanced";

export const SETTINGS_GROUP_IDS: ReadonlyArray<SettingsGroupId> = [
    "setup",
    "bi",
    "ai",
    "preferences",
    "system",
    "advanced",
];

export interface SettingsRouteState {
    /** True when the URL starts with /settings. */
    isSettingsRoute: boolean;
    /** Active group from the URL (defaults to "setup" if /settings has no group). */
    group: SettingsGroupId;
    /** Optional leaf segment (e.g., "provider" for /settings/bi/provider). */
    leaf: string | null;
}

const SETTINGS_PREFIX = "/settings";
const LAST_GROUP_KEY = "pulseplay:settings-last-group";

function isValidGroup(value: string): value is SettingsGroupId {
    return (SETTINGS_GROUP_IDS as ReadonlyArray<string>).includes(value);
}

function readLastGroup(): SettingsGroupId {
    // UX-ARCH-0B.2 Phase C — default landing is now AI Setup (was "setup").
    // The legacy `setup` group is being absorbed into AI/BI Setup; defaulting
    // fresh visits to `ai` lands them on a stable rebuilt surface instead of
    // the migration-banner'd Quick start.
    if (typeof window === "undefined") return "ai";
    try {
        const raw = window.localStorage.getItem(LAST_GROUP_KEY);
        if (raw && isValidGroup(raw)) return raw;
    } catch {
        /* swallow */
    }
    return "ai";
}

function writeLastGroup(group: SettingsGroupId): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(LAST_GROUP_KEY, group);
    } catch {
        /* swallow */
    }
}

/** Parse window.location.pathname into a SettingsRouteState. */
export function parseSettingsRoute(pathname: string): SettingsRouteState {
    if (!pathname.startsWith(SETTINGS_PREFIX)) {
        return { isSettingsRoute: false, group: readLastGroup(), leaf: null };
    }
    const remainder = pathname.slice(SETTINGS_PREFIX.length).replace(/^\/+|\/+$/g, "");
    if (!remainder) {
        return { isSettingsRoute: true, group: readLastGroup(), leaf: null };
    }
    const segments = remainder.split("/").filter(Boolean);
    const groupSegment = segments[0];
    const group: SettingsGroupId = isValidGroup(groupSegment) ? groupSegment : readLastGroup();
    const leaf = segments[1] || null;
    return { isSettingsRoute: true, group, leaf };
}

/** React hook — subscribes to pathname changes via popstate + a custom
 *  "pulseplay:settings-navigate" event the navigateTo* helpers below
 *  dispatch when they call history.pushState (popstate does NOT fire on
 *  pushState; we wire our own broadcast). */
export function useSettingsRoute(): SettingsRouteState {
    const [state, setState] = useState<SettingsRouteState>(() =>
        typeof window !== "undefined"
            ? parseSettingsRoute(window.location.pathname)
            : { isSettingsRoute: false, group: "setup", leaf: null }
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setState(parseSettingsRoute(window.location.pathname));
        window.addEventListener("popstate", sync);
        window.addEventListener("pulseplay:settings-navigate", sync as EventListener);
        return () => {
            window.removeEventListener("popstate", sync);
            window.removeEventListener("pulseplay:settings-navigate", sync as EventListener);
        };
    }, []);

    // Remember the latest user-visited group so the next "open settings"
    // (without a specific group) lands where they were.
    useEffect(() => {
        if (state.isSettingsRoute) writeLastGroup(state.group);
    }, [state.isSettingsRoute, state.group]);

    return state;
}

function pushUrl(pathname: string): void {
    if (typeof window === "undefined") return;
    if (window.location.pathname === pathname) return;
    window.history.pushState({}, "", pathname);
    window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate"));
}

/** Navigate to /settings (default group is last-visited). */
export function navigateToSettings(group?: SettingsGroupId, leaf?: string): void {
    const targetGroup = group && isValidGroup(group) ? group : readLastGroup();
    const url = leaf ? `${SETTINGS_PREFIX}/${targetGroup}/${leaf}` : `${SETTINGS_PREFIX}/${targetGroup}`;
    pushUrl(url);
}

/** Navigate back to the playground at "/". */
export function navigateToApp(): void {
    pushUrl("/");
}
