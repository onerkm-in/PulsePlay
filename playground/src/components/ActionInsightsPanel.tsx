// playground/src/components/ActionInsightsPanel.tsx
//
// The Action Insights surface: a PROACTIVE decision-prompt stack. It renders
// ranked "NEEDS YOUR DECISION" cards the moment it opens — the user types
// nothing. Data comes from the governed prompt store via the proxy
// (GET /insights/action-insights); actions post back through the HITL-gated
// POST endpoint. Persona + permissions are resolved server-side; the demo
// switcher only sends a hint header (ignored server-side when a real IdP role
// is present).
//
// Fail-safe: any fetch error renders a slim, non-blocking notice — it never
// throws into the shell, so existing PulsePlay surfaces are unaffected.

import { useCallback, useEffect, useState } from "react";
import { DecisionPromptCard, type DecisionPrompt } from "./DecisionPromptCard";

const DEMO_PERSONA_KEY = "pulseplay:ai-demo-persona";
const PLANNER = "Supply Chain Planner";
const MANAGER = "Supply Chain Manager";

interface ApiResponse {
    ok: boolean;
    persona: string;
    personaSource: string;
    capabilities: string[];
    prompts: DecisionPrompt[];
}

function readDemoPersona(): string {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem(DEMO_PERSONA_KEY) || ""; } catch { return ""; }
}

export function ActionInsightsPanel({ proxyBase, assistantProfile, onData, hideHeader }: {
    proxyBase: string;
    assistantProfile?: string;
    /** Reports the loaded prompt set to a parent (e.g. the cockpit shell derives
     *  KPIs + the severity donut from the SAME fetch — no double-fetch, no
     *  fabricated numbers). */
    onData?: (prompts: DecisionPrompt[]) => void;
    /** In the cockpit the persona/heading live in the shell chrome, so the panel
     *  renders just the decision list. */
    hideHeader?: boolean;
}) {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [demoPersona, setDemoPersona] = useState<string>(() => readDemoPersona());

    const base = proxyBase || "";
    // The prompt store lives on a Databricks SQL warehouse, so the proxy must
    // resolve a profile that carries one. Without an explicit profile the
    // server-side resolution can land on a non-warehouse profile (e.g. the
    // Power BI connector) and the whole panel 400s.
    const profileQuery = assistantProfile ? `?assistantProfile=${encodeURIComponent(assistantProfile)}` : "";
    const profileHeaders: Record<string, string> = assistantProfile ? { "X-Assistant-Profile": assistantProfile } : {};

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${base}/insights/action-insights${profileQuery}`, {
                headers: { ...profileHeaders, ...(demoPersona ? { "x-pp-persona": demoPersona } : {}) },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as ApiResponse;
            setData(body);
            onData?.(body.prompts || []);
        } catch (e) {
            setError(String((e as Error).message || e));
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [base, demoPersona, assistantProfile]); // eslint-disable-line react-hooks/exhaustive-deps -- profileQuery/profileHeaders derive from assistantProfile

    useEffect(() => { void load(); }, [load]);

    const onAction = useCallback(async (promptId: string, action: string) => {
        setBusyId(promptId);
        try {
            const res = await fetch(`${base}/insights/action-insights/${promptId}/action${profileQuery}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...profileHeaders,
                    ...(demoPersona ? { "x-pp-persona": demoPersona } : {}),
                },
                body: JSON.stringify({ action }),
            });
            if (res.status === 403) {
                setError("That action isn't permitted for the current persona.");
            } else if (!res.ok) {
                setError(`Action failed (HTTP ${res.status}).`);
            }
            await load(); // refetch so status + allowed actions reflect the server
        } catch (e) {
            setError(String((e as Error).message || e));
        } finally {
            setBusyId(null);
        }
    }, [base, demoPersona, load, assistantProfile]); // eslint-disable-line react-hooks/exhaustive-deps -- profileQuery/profileHeaders derive from assistantProfile

    const setPersona = (p: string) => {
        try { window.localStorage.setItem(DEMO_PERSONA_KEY, p); } catch { /* swallow */ }
        setDemoPersona(p);
    };

    const prompts = data?.prompts || [];
    const maxImpact = prompts.reduce((m, p) => Math.max(m, p.business_impact_value || 0), 0);
    const openCount = prompts.filter((p) =>
        ["new", "refreshed", "pending-approval"].includes(p.status)).length;

    return (
        <div className="industry-surface" style={{ padding: hideHeader ? 0 : "14px 16px", height: "100%", overflowY: "auto" }} data-testid="action-insights-panel">
            {!hideHeader && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                    <div>
                        <div className="kicker">
                            NEEDS YOUR DECISION{openCount ? ` · ${openCount}` : ""}
                        </div>
                        <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            Viewing as <strong>{data?.persona || "…"}</strong>
                            {data?.personaSource === "demo" ? " (demo)" : ""}
                        </div>
                    </div>
                    {/* Demo persona switcher — hint only; server ignores it when an IdP role exists. */}
                    <div className="seg" role="group" aria-label="Demo persona">
                        {[PLANNER, MANAGER].map((p) => (
                            <button
                                key={p}
                                type="button"
                                className="seg-opt"
                                aria-pressed={demoPersona === p ? "true" : "false"}
                                onClick={() => setPersona(p)}
                            >{p.replace("Supply Chain ", "")}</button>
                        ))}
                    </div>
                </div>
            )}

            {error && (
                <div role="status" className="blueprint" style={{
                    padding: "8px 12px", fontSize: 12, marginBottom: 10,
                    background: "var(--color-accent-100)", color: "var(--color-accent-800)",
                }}>{error}</div>
            )}

            {loading && !data && (
                <div className="text-muted" style={{ fontSize: 13, padding: "24px 0" }}>
                    Scanning KPIs for decisions…
                </div>
            )}

            {!loading && prompts.length === 0 && !error && (
                <div className="text-muted" style={{ fontSize: 13.5, padding: "28px 0", textAlign: "center" }}>
                    No decisions need attention right now.
                </div>
            )}

            {prompts.map((p) => (
                <DecisionPromptCard
                    key={p.prompt_id}
                    prompt={p}
                    onAction={onAction}
                    busy={busyId === p.prompt_id}
                    maxImpact={maxImpact}
                />
            ))}
        </div>
    );
}
