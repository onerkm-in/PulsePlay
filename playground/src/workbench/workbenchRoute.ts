// playground/src/workbench/workbenchRoute.ts
//
// Path-based router slice for the Unified Workbench (Step 6 wiring).
//
// The route is gated by a feature flag — the workbench is preview-grade
// until Step 6 + Step 7 land. The flag is checked once at render time;
// admins can toggle it via:
//   - Vite env var: VITE_PULSEPLAY_ENABLE_WORKBENCH=true (build-time)
//   - localStorage key: pulseplay:workbench-preview = "on" (runtime)

import { useEffect, useState } from 'react';

export interface WorkbenchRouteState {
    readonly isWorkbenchRoute: boolean;
    readonly enabled: boolean;
}

const PREFIX = '/workbench';
const LOCAL_FLAG = 'pulseplay:workbench-preview';

export function parseWorkbenchRoute(pathname: string): boolean {
    return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`);
}

export function isWorkbenchEnabled(): boolean {
    // Build-time flag.
    try {
        const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
        if (env && env.VITE_PULSEPLAY_ENABLE_WORKBENCH === 'true') return true;
    } catch { /* swallow */ }
    // Runtime flag (per-browser opt-in).
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(LOCAL_FLAG) === 'on';
    } catch {
        return false;
    }
}

export function setWorkbenchPreviewEnabled(value: boolean): void {
    if (typeof window === 'undefined') return;
    try {
        if (value) window.localStorage.setItem(LOCAL_FLAG, 'on');
        else window.localStorage.removeItem(LOCAL_FLAG);
    } catch { /* swallow */ }
}

export function useWorkbenchRoute(): WorkbenchRouteState {
    const [pathname, setPathname] = useState<string>(() =>
        typeof window !== 'undefined' ? window.location.pathname : '',
    );
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sync = () => setPathname(window.location.pathname);
        window.addEventListener('popstate', sync);
        window.addEventListener('pulseplay:workbench-navigate', sync as EventListener);
        return () => {
            window.removeEventListener('popstate', sync);
            window.removeEventListener('pulseplay:workbench-navigate', sync as EventListener);
        };
    }, []);

    const isWorkbenchRoute = parseWorkbenchRoute(pathname);
    return { isWorkbenchRoute, enabled: isWorkbenchEnabled() };
}

export function navigateToWorkbench(): void {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === PREFIX) return;
    window.history.pushState({}, '', PREFIX);
    window.dispatchEvent(new CustomEvent('pulseplay:workbench-navigate'));
}
