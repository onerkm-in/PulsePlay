// playground/src/multipane/MultiPaneDemoShell.tsx
//
// Part C P1-PROOF (2026-06-05) — the live two-connector parallel demonstration
// surface, mounted at /multi-pane-demo and GATED on the multiConnectorPanes
// feature flag (default OFF). This is the minimal foundation surface that
// proves the per-pane connector model works end-to-end against LIVE backends:
// each pane carries its OWN PaneConnectorState (vendor + aiProfile), each pane
// fires its OWN /assistant/conversations/start to whatever connector it is
// bound to, and the panes hold INDEPENDENT live state at the same time.
//
// This is NOT P2+ (no per-pane adapter/AISidebar isolation, no BITileGrid
// per-tile config, no UNIFIED/SEGREGATED toggle, no parallel-connect-all). It
// is the P1 proof harness: prove the state model is real and isolated, then
// STOP for approval on the richer phases.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeatureFlag, setFeatureFlag } from "../featureFlags";
import {
    setPaneConnector,
    type PaneConnectorState,
} from "./paneConnectors";

// The connectors a pane can bind to. Each maps to a real proxy profile. The
// `live` flag is honest: Genie is serverless-blocked on this workspace, so it
// is offered but labeled — selecting it proves ISOLATION (its error must not
// poison a healthy pane), not a green Genie round-trip.
interface ConnectorChoice {
    profile: string;
    label: string;
    note: string;
}
const CONNECTOR_CHOICES: ConnectorChoice[] = [
    { profile: "foundation", label: "Foundation Model", note: "Mosaic AI serving endpoint — LIVE" },
    { profile: "powerbi-dwd", label: "Power BI (semantic model)", note: "Deterministic DAX, no LLM — LIVE" },
    { profile: "default", label: "Genie", note: "Serverless-blocked on this workspace — use to prove isolation" },
];

type PaneStatus = "idle" | "loading" | "done" | "error";

interface PaneState {
    paneId: string;
    title: string;
    question: string;
    status: PaneStatus;
    answer: string;
    error: string;
    ms: number | null;
}

const SUGGESTED: Record<string, string> = {
    foundation: "In one sentence, what is a profit margin?",
    "powerbi-dwd": "What is the total sales?",
    default: "What is the total sales?",
};

function profileFor(states: ReadonlyMap<string, PaneConnectorState>, paneId: string, fallback: string): string {
    return states.get(paneId)?.aiProfile ?? fallback;
}

export function MultiPaneDemoShell(): React.ReactElement {
    const flagOn = useFeatureFlag("multiConnectorPanes");

    // Two panes by default — pane 1 bound to Foundation Model, pane 2 to Power
    // BI: two genuinely different live connectors, side by side.
    const [connectorStates, setConnectorStates] = useState<ReadonlyMap<string, PaneConnectorState>>(
        () => {
            let m: ReadonlyMap<string, PaneConnectorState> = new Map();
            m = setPaneConnector(m, "pane-1", { aiProfile: "foundation", vendor: "native" });
            m = setPaneConnector(m, "pane-2", { aiProfile: "powerbi-dwd", vendor: "powerbi" });
            return m;
        },
    );
    const [panes, setPanes] = useState<PaneState[]>(() => [
        { paneId: "pane-1", title: "Pane 1", question: SUGGESTED.foundation, status: "idle", answer: "", error: "", ms: null },
        { paneId: "pane-2", title: "Pane 2", question: SUGGESTED["powerbi-dwd"], status: "idle", answer: "", error: "", ms: null },
    ]);

    const setPane = useCallback((paneId: string, patch: Partial<PaneState>) => {
        setPanes(prev => prev.map(p => (p.paneId === paneId ? { ...p, ...patch } : p)));
    }, []);

    const bindConnector = useCallback((paneId: string, profile: string) => {
        const vendor = profile === "powerbi-dwd" ? "powerbi" : "native";
        setConnectorStates(prev => setPaneConnector(prev, paneId, { aiProfile: profile, vendor }));
        setPane(paneId, { question: SUGGESTED[profile] ?? "", answer: "", error: "", status: "idle", ms: null });
    }, [setPane]);

    // Each pane asks its OWN connector independently. A failure in one pane sets
    // only that pane's error — the others keep their state (isolation).
    const ask = useCallback(async (paneId: string) => {
        const pane = panes.find(p => p.paneId === paneId);
        if (!pane) return;
        const profile = profileFor(connectorStates, paneId, "foundation");
        setPane(paneId, { status: "loading", answer: "", error: "", ms: null });
        const t0 = performance.now();
        try {
            const res = await fetch("/api/assistant/conversations/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assistantProfile: profile, content: pane.question }),
            });
            const ms = Math.round(performance.now() - t0);
            if (!res.ok) {
                const body = await res.text();
                setPane(paneId, { status: "error", error: `HTTP ${res.status}: ${body.slice(0, 300)}`, ms });
                return;
            }
            const json = await res.json();
            const answer = String(json?.content ?? "(no content)");
            const isError = json?.status === "FAILED";
            setPane(paneId, {
                status: isError ? "error" : "done",
                answer: isError ? "" : answer,
                error: isError ? answer : "",
                ms,
            });
        } catch (e) {
            const ms = Math.round(performance.now() - t0);
            setPane(paneId, { status: "error", error: e instanceof Error ? e.message : String(e), ms });
        }
    }, [panes, connectorStates, setPane]);

    const askAll = useCallback(() => {
        // Fire every pane at once — genuinely parallel, each to its own
        // connector. (P2 will formalize this as Promise.allSettled with
        // per-pane status; here we just kick them independently.)
        panes.forEach(p => { void ask(p.paneId); });
    }, [panes, ask]);

    const back = useCallback(() => {
        window.history.pushState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
    }, []);

    if (!flagOn) {
        return (
            <div data-testid="multipane-flag-off" style={shell}>
                <div style={card}>
                    <h1 style={{ margin: 0, fontSize: 20, color: "var(--pp-text)" }}>Multi-connector panes</h1>
                    <p style={{ color: "var(--pp-text-muted)", marginTop: 8, maxWidth: 520 }}>
                        This is the parallel-connectors demo surface. It is gated behind the{" "}
                        <code>multiConnectorPanes</code> feature flag, which is <strong>OFF by default</strong> —
                        the single-pane app is unaffected. Enable the flag to bind each pane to its own live connector.
                    </p>
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <button style={primaryBtn} onClick={() => setFeatureFlag("multiConnectorPanes", true)}>
                            Enable multi-connector panes
                        </button>
                        <button style={ghostBtn} onClick={back}>Back to app</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div data-testid="multipane-on" style={shell}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, color: "var(--pp-text)" }}>Multi-connector panes — live demo</h1>
                    <p style={{ color: "var(--pp-text-muted)", margin: "4px 0 0", fontSize: 13 }}>
                        Each pane binds to its own connector and holds independent live state.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button style={primaryBtn} onClick={askAll} data-testid="ask-all">Ask all panes</button>
                    <button style={ghostBtn} onClick={() => setFeatureFlag("multiConnectorPanes", false)}>Disable flag</button>
                    <button style={ghostBtn} onClick={back}>Back to app</button>
                </div>
            </header>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
                {panes.map(pane => {
                    const profile = profileFor(connectorStates, pane.paneId, "foundation");
                    const choice = CONNECTOR_CHOICES.find(c => c.profile === profile);
                    return (
                        <section key={pane.paneId} data-testid={`pane-${pane.paneId}`} data-pane-profile={profile} style={paneCard}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <strong style={{ color: "var(--pp-text)" }}>{pane.title}</strong>
                                <span data-testid={`pane-status-${pane.paneId}`} style={statusPill(pane.status)}>
                                    {pane.status}{pane.ms != null ? ` · ${pane.ms}ms` : ""}
                                </span>
                            </div>

                            <label style={lbl}>Connector (this pane only)</label>
                            <select
                                data-testid={`pane-connector-${pane.paneId}`}
                                value={profile}
                                onChange={e => bindConnector(pane.paneId, e.target.value)}
                                style={input}
                            >
                                {CONNECTOR_CHOICES.map(c => (
                                    <option key={c.profile} value={c.profile}>{c.label}</option>
                                ))}
                            </select>
                            <p style={{ color: "var(--pp-text-muted)", fontSize: 11, margin: "4px 0 0" }}>{choice?.note}</p>

                            <label style={lbl}>Question</label>
                            <textarea
                                data-testid={`pane-question-${pane.paneId}`}
                                value={pane.question}
                                onChange={e => setPane(pane.paneId, { question: e.target.value })}
                                rows={2}
                                style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
                            />
                            <button
                                data-testid={`pane-ask-${pane.paneId}`}
                                style={{ ...primaryBtn, marginTop: 8, width: "100%" }}
                                disabled={pane.status === "loading"}
                                onClick={() => ask(pane.paneId)}
                            >
                                {pane.status === "loading" ? "Asking…" : `Ask ${choice?.label ?? profile}`}
                            </button>

                            {pane.answer && (
                                <div data-testid={`pane-answer-${pane.paneId}`} style={answerBox}>
                                    {pane.answer}
                                </div>
                            )}
                            {pane.error && (
                                <div data-testid={`pane-error-${pane.paneId}`} style={errorBox}>
                                    {pane.error}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

// ─── inline styles (theme-token aware so it works light + dark) ────────────────
const shell: React.CSSProperties = { padding: 24, minHeight: "100vh", background: "var(--pp-bg, #fafafa)", boxSizing: "border-box" };
const card: React.CSSProperties = { background: "var(--pp-surface-raised, #fff)", border: "1px solid var(--pp-border, rgba(0,0,0,0.08))", borderRadius: 12, padding: 24, maxWidth: 620 };
const paneCard: React.CSSProperties = { background: "var(--pp-surface-raised, #fff)", border: "1px solid var(--pp-border, rgba(0,0,0,0.08))", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", minWidth: 0 };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--pp-text-muted, #64748b)", margin: "12px 0 4px" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--pp-border, rgba(0,0,0,0.12))", background: "var(--pp-surface, #fff)", color: "var(--pp-text, #0f172a)", fontSize: 13 };
const primaryBtn: React.CSSProperties = { padding: "8px 14px", border: 0, borderRadius: 8, background: "var(--pp-accent, #2563eb)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "8px 14px", border: "1px solid var(--pp-border, rgba(0,0,0,0.12))", borderRadius: 8, background: "transparent", color: "var(--pp-text, #0f172a)", fontSize: 13, cursor: "pointer" };
const answerBox: React.CSSProperties = { marginTop: 10, padding: 10, borderRadius: 8, background: "var(--pp-bg, #f4f6f9)", color: "var(--pp-text, #0f172a)", fontSize: 13, whiteSpace: "pre-wrap", maxHeight: 260, overflow: "auto" };
const errorBox: React.CSSProperties = { marginTop: 10, padding: 10, borderRadius: 8, background: "var(--pp-error-soft, rgba(220,38,38,0.08))", color: "var(--pp-error, #dc2626)", fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" };

function statusPill(status: PaneStatus): React.CSSProperties {
    const base: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999 };
    switch (status) {
        case "done": return { ...base, background: "rgba(34,197,94,0.14)", color: "#16a34a" };
        case "error": return { ...base, background: "rgba(220,38,38,0.12)", color: "#dc2626" };
        case "loading": return { ...base, background: "rgba(37,99,235,0.12)", color: "#2563eb" };
        default: return { ...base, background: "var(--pp-bg, #eef2f7)", color: "var(--pp-text-muted, #64748b)" };
    }
}
