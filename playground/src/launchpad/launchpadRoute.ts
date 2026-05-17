import { useEffect, useState } from "react";

export interface LaunchpadRouteState {
    isLaunchpadRoute: boolean;
}

const PREFIX = "/launchpad";

export function parseLaunchpadRoute(pathname: string): LaunchpadRouteState {
    return { isLaunchpadRoute: pathname === PREFIX || pathname.startsWith(`${PREFIX}/`) };
}

export function useLaunchpadRoute(): LaunchpadRouteState {
    const [state, setState] = useState<LaunchpadRouteState>(() =>
        typeof window !== "undefined" ? parseLaunchpadRoute(window.location.pathname) : { isLaunchpadRoute: false },
    );
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setState(parseLaunchpadRoute(window.location.pathname));
        window.addEventListener("popstate", sync);
        window.addEventListener("pulseplay:launchpad-navigate", sync as EventListener);
        return () => {
            window.removeEventListener("popstate", sync);
            window.removeEventListener("pulseplay:launchpad-navigate", sync as EventListener);
        };
    }, []);
    return state;
}

function pushUrl(pathname: string): void {
    if (typeof window === "undefined") return;
    if (window.location.pathname === pathname) return;
    window.history.pushState({}, "", pathname);
    window.dispatchEvent(new CustomEvent("pulseplay:launchpad-navigate"));
}

export function navigateToLaunchpad(): void {
    pushUrl(PREFIX);
}

export function navigateToApp(): void {
    pushUrl("/");
}
