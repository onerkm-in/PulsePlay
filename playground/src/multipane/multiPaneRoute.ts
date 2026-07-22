// Route hook for the /multi-pane-demo surface, mirroring the existing
// per-route hooks (PowerBiQnARoute, knowledgeRoute). The route is always
// reachable by URL, but MultiPaneDemoShell gates its content on the
// multiConnectorPanes flag (default off), so visiting with the flag off
// shows only the enable-the-flag gate and the single-pane app is untouched.

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

