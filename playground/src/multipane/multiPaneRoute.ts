// playground/src/multipane/multiPaneRoute.ts
//
// Part C P1-PROOF — route hook for the /multi-pane-demo surface. Mirrors the
// existing per-route hooks (PowerBiQnARoute / knowledgeRoute). The route itself
// is always reachable by URL; the MultiPaneDemoShell gates its CONTENT on the
// multiConnectorPanes flag (default OFF), so visiting the URL with the flag off
// shows only the "enable the flag" gate — the single-pane app is untouched.

import { useEffect, useState } from "react";

export const MULTI_PANE_PATH = "/multi-pane-demo";

export function isMultiPaneRoute(pathname: string): boolean {
    return pathname === MULTI_PANE_PATH || pathname.startsWith(MULTI_PANE_PATH + "/");
}

export function useMultiPaneRoute(): { isMultiPaneRoute: boolean } {
    const [path, setPath] = useState(() => (typeof window !== "undefined" ? window.location.pathname : "/"));
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setPath(window.location.pathname);
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
    }, []);
    return { isMultiPaneRoute: isMultiPaneRoute(path) };
}

export function navigateToMultiPaneDemo(): void {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== MULTI_PANE_PATH) {
        window.history.pushState({}, "", MULTI_PANE_PATH);
        window.dispatchEvent(new PopStateEvent("popstate"));
    }
}
