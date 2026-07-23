// playground/src/experience/DecisionCanvasShell.tsx
//
// "My Decision Canvas" — the combined single-workspace experience (v3.2 §10/§10
// combined-mode order). This is the FIRST vertical slice: the Action Inbox is
// real and governed (it reuses the same ActionInsightsPanel + Decision Assist
// backend as segregated mode — no forked business logic), the existing surfaces
// remain reachable from one workspace, and the deferred Canvas regions (My
// Canvas, Saved Items, Suggested, Since You Last Visited) are shown as honest
// "arriving in a later phase" scaffolds rather than fabricated content.
//
// Segregated mode is unaffected and remains the default + fail-safe fallback.

import { ActionInsightsPanel } from "../components/ActionInsightsPanel";

function readProxyBase(): string {
    if (typeof window === "undefined") return "/api";
    try {
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        if (raw) {
            const v = JSON.parse(raw)?.apiBaseUrl;
            if (typeof v === "string" && v.trim() && /\/api$/.test(v.trim())) return v.trim();
        }
    } catch { /* swallow */ }
    return "/api";
}

function readActiveProfile(): string {
    if (typeof window === "undefined") return "";
    try {
        const p = window.localStorage.getItem("pulseplay:active-ai-profile");
        if (p && p.trim()) return p.trim();
    } catch { /* swallow */ }
    return "";
}

function goToSurface(surface: string): void {
    try {
        const url = new URL(window.location.href);
        url.searchParams.set("surface", surface);
        window.history.pushState({}, "", url.toString());
        window.dispatchEvent(new PopStateEvent("popstate"));
    } catch { /* swallow */ }
}

const SURFACE_LINKS: Array<{ id: string; label: string; hint: string }> = [
    { id: "ai-insights", label: "AI Insights", hint: "Narrative summary of the current scope" },
    { id: "ask-pulse", label: "Ask Pulse", hint: "Grounded natural-language follow-ups" },
    { id: "bi-viz", label: "Dashboard", hint: "The embedded BI surface" },
];

function DeferredRegion({ title, note }: { title: string; note: string }) {
    return (
        <section style={{
            border: "1px dashed rgba(128,128,128,0.35)", borderRadius: 12, padding: "14px 16px",
            background: "rgba(127,127,127,0.03)",
        }}>
            <div style={{ fontSize: 12, letterSpacing: 0.6, fontWeight: 700, color: "var(--pp-muted,#98a2b3)" }}>
                {title.toUpperCase()}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--pp-muted,#98a2b3)", marginTop: 6, lineHeight: 1.5 }}>
                {note}
            </div>
        </section>
    );
}

export function DecisionCanvasShell(): React.ReactElement {
    const proxyBase = readProxyBase();
    const activeProfile = readActiveProfile();

    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--pp-app-bg, transparent)" }}>
            {/* Context bar */}
            <header style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 20px", borderBottom: "1px solid rgba(128,128,128,0.2)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ fontSize: 15.5 }}>My Decision Canvas</strong>
                    <span style={{
                        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, padding: "2px 8px", borderRadius: 999,
                        background: "rgba(37,99,235,0.12)", color: "#2563eb",
                    }}>COMBINED</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--pp-muted,#98a2b3)" }}>
                    One workspace: see the issue, inspect evidence, act. Segregated screens stay available in Settings.
                </div>
            </header>

            <main style={{
                flex: "1 1 auto", display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
                gap: 16, padding: 20, alignItems: "start",
            }}>
                {/* Primary column: Action Inbox (real, governed) */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                    <section style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{
                            padding: "10px 16px", borderBottom: "1px solid rgba(128,128,128,0.2)",
                            fontSize: 12, letterSpacing: 0.6, fontWeight: 700, color: "var(--pp-muted,#667085)",
                        }}>ACTION INBOX</div>
                        <ActionInsightsPanel proxyBase={proxyBase} assistantProfile={activeProfile} />
                    </section>

                    <DeferredRegion
                        title="My Canvas"
                        note="Pinned sections in your saved order arrive with the CanvasSection persistence phase. Server-owned per-user Canvas storage depends on the approved decision-schema tables, which are not reachable on this workspace yet."
                    />
                </div>

                {/* Side column: surface hub + deferred regions */}
                <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 20 }}>
                    <section style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, letterSpacing: 0.6, fontWeight: 700, color: "var(--pp-muted,#667085)", marginBottom: 8 }}>
                            OPEN A SURFACE
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {SURFACE_LINKS.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => goToSurface(s.id)}
                                    style={{
                                        textAlign: "left", padding: "9px 11px", borderRadius: 9, cursor: "pointer",
                                        border: "1px solid rgba(128,128,128,0.3)", background: "transparent", color: "inherit",
                                    }}
                                >
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                                    <div style={{ fontSize: 11, color: "var(--pp-muted,#98a2b3)" }}>{s.hint}</div>
                                </button>
                            ))}
                        </div>
                    </section>

                    <DeferredRegion
                        title="Saved Items"
                        note="Bookmarks and snapshots not currently on the Canvas will list here once server-side saved-item persistence ships."
                    />
                    <DeferredRegion
                        title="Suggested for You"
                        note="Up to three explainable, governed suggestions arrive with the relevance phase. Suggestions never change your permissions or a decision's severity."
                    />
                </aside>
            </main>
        </div>
    );
}
