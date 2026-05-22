// playground/src/powerbi/PowerBiQnARoute.tsx
//
// Cycle 15.5 — standalone full-page Q&A surface at /powerbi/qna.
//
// Renders the <PowerBiQnA /> component at full viewport with a small
// header strip (title, back-to-app button). Kept separate from the
// Pulse-mode tab strip so this cycle doesn't have to touch the
// Pulse-PBI compat shim's activeTab state.

import { useState, useEffect } from "react";
import { PowerBiQnA } from "../components/PowerBiQnA";

const ACTIVE_PROFILE_KEY = "pulseplay:active-ai-profile";

export function isPowerBiQnaRoute(pathname: string): boolean {
    return pathname === "/powerbi/qna" || pathname.startsWith("/powerbi/qna/");
}

export function usePowerBiQnaRoute(): { isPowerBiQnaRoute: boolean } {
    const [path, setPath] = useState(() => (typeof window !== "undefined" ? window.location.pathname : "/"));
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setPath(window.location.pathname);
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
    }, []);
    return { isPowerBiQnaRoute: isPowerBiQnaRoute(path) };
}

export function navigateToPowerBiQna(): void {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/powerbi/qna") {
        window.history.pushState({}, "", "/powerbi/qna");
        window.dispatchEvent(new PopStateEvent("popstate"));
    }
}

export function PowerBiQnaShell(): React.ReactElement {
    const [profile, setProfile] = useState<string>(() => {
        try {
            return (window.localStorage.getItem(ACTIVE_PROFILE_KEY) || "").trim();
        } catch {
            return "";
        }
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => {
            try {
                setProfile((window.localStorage.getItem(ACTIVE_PROFILE_KEY) || "").trim());
            } catch { /* swallow */ }
        };
        window.addEventListener("storage", sync);
        window.addEventListener("pulseplay:display-change", sync as EventListener);
        return () => {
            window.removeEventListener("storage", sync);
            window.removeEventListener("pulseplay:display-change", sync as EventListener);
        };
    }, []);

    const onBack = () => {
        if (typeof window === "undefined") return;
        window.history.pushState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
    };

    return (
        <div style={shellStyle} data-route="powerbi-qna">
            <header style={headerStyle}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20 }}>Power BI Q&amp;A</h1>
                    <p style={{ margin: "2px 0 0", opacity: 0.7, fontSize: 12 }}>
                        Microsoft's natural-language layer over your dataset. No PulsePlay LLM call.
                    </p>
                </div>
                <button type="button" onClick={onBack} style={backBtnStyle} data-action="back">
                    ← Back to app
                </button>
            </header>
            <div style={{ flex: 1, padding: 20 }}>
                <PowerBiQnA profile={profile || undefined} height="100%" />
            </div>
        </div>
    );
}

const shellStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "var(--pp-bg, #fff)",
};

const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
};

const backBtnStyle: React.CSSProperties = {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
    background: "transparent",
    borderRadius: 4,
    cursor: "pointer",
};
