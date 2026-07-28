// playground/src/components/ActionInsightsPanel.tsx
//
// The Action Insights surface: a ranked "NEEDS YOUR DECISION" prompt stack.
// Data comes from the governed prompt store via the proxy
// (GET /insights/action-insights); actions post back through the HITL-gated
// POST endpoint. Persona + permissions are resolved server-side; the demo
// switcher only sends a hint header (ignored server-side when a real IdP role
// is present).
//
// 2026-07-24 intent gate: the prompt-store query runs on a Databricks SQL
// warehouse — opening the surface must NOT wake the warehouse. On mount the
// panel hydrates from a sessionStorage cache (with its age shown) and fetches
// ONLY on explicit user intent: the Load/Refresh buttons, a persona switch,
// or the refetch after an action POST.
//
// Fail-safe: any fetch error renders a slim, non-blocking notice — it never
// throws into the shell, so existing PulsePlay surfaces are unaffected.

import { useCallback, useEffect, useRef, useState } from "react";
import { DecisionPromptCard, type DecisionPrompt } from "./DecisionPromptCard";

const DEMO_PERSONA_KEY = "pulseplay:ai-demo-persona";
const CACHE_STORAGE_KEY = "pulseplay:action-insights-cache:v1";
const PLANNER = "Supply Chain Planner";
const MANAGER = "Supply Chain Manager";

interface ApiResponse {
    ok: boolean;
    persona: string;
    personaSource: string;
    capabilities: string[];
    prompts: DecisionPrompt[];
    /** Set when Decisions can't run for the active connector (e.g. a Power BI
     *  profile with no Databricks warehouse) — rendered in place of the raw
     *  "No decisions" empty state so the surface degrades gracefully. */
    notice?: string;
    unavailable?: boolean;
}

interface CachedPrompts {
    key: string;
    fetchedAt: number;
    body: ApiResponse;
}

function readDemoPersona(): string {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem(DEMO_PERSONA_KEY) || ""; } catch { return ""; }
}

function readPromptCache(key: string): CachedPrompts | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(CACHE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedPrompts;
        return parsed && parsed.key === key && parsed.body && parsed.body.ok ? parsed : null;
    } catch { return null; }
}

function writePromptCache(entry: CachedPrompts): void {
    try { window.sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entry)); } catch { /* quota/private mode */ }
}

function ageLabel(fetchedAt: number): string {
    const min = Math.max(0, Math.round((Date.now() - fetchedAt) / 60000));
    if (min < 1) return "just now";
    if (min === 1) return "1 min ago";
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
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
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
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

    // onData via ref — parents pass inline callbacks; a dep on the prop
    // identity would refire the hydration effect every parent render.
    const onDataRef = useRef(onData);
    onDataRef.current = onData;

    const load = useCallback(async (personaOverride?: string) => {
        const persona = personaOverride ?? demoPersona;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${base}/insights/action-insights${profileQuery}`, {
                headers: { ...profileHeaders, ...(persona ? { "x-pp-persona": persona } : {}) },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const body = (await res.json()) as ApiResponse;
            const now = Date.now();
            setData(body);
            setFetchedAt(now);
            writePromptCache({ key: `${base}|${assistantProfile || ""}|${persona}`, fetchedAt: now, body });
            onDataRef.current?.(body.prompts || []);
        } catch (e) {
            setError(String((e as Error).message || e));
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [base, demoPersona, assistantProfile]); // eslint-disable-line react-hooks/exhaustive-deps -- profileQuery/profileHeaders derive from assistantProfile

    // Mount / scope-change hydration — CACHE ONLY, never a fetch. The
    // warehouse is queried exclusively from the Load/Refresh buttons, a
    // persona switch, or the post-action refetch.
    useEffect(() => {
        const hit = readPromptCache(`${base}|${assistantProfile || ""}|${demoPersona}`);
        if (hit) {
            setData(hit.body);
            setFetchedAt(hit.fetchedAt);
            onDataRef.current?.(hit.body.prompts || []);
        } else {
            setData(null);
            setFetchedAt(null);
        }
    }, [base, assistantProfile, demoPersona]);

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
        // A persona switch is explicit user intent — fetch fresh for the new
        // persona (capabilities differ server-side, stale cache would mislead).
        void load(p);
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
                            {data ? (
                                <>
                                    Viewing as <strong>{data.persona}</strong>
                                    {data.personaSource === "demo" ? " (demo)" : ""}
                                    {fetchedAt ? <> · updated {ageLabel(fetchedAt)}</> : null}
                                    {" · "}
                                    <button
                                        type="button"
                                        className="text-muted"
                                        style={{ background: "none", border: "none", padding: 0, font: "inherit", textDecoration: "underline", cursor: "pointer" }}
                                        disabled={loading}
                                        aria-label="Refresh decisions from the warehouse"
                                        onClick={() => void load()}
                                    >{loading ? "refreshing…" : "refresh"}</button>
                                </>
                            ) : (
                                <>Loads on demand. Nothing queries the warehouse until you ask.</>
                            )}
                        </div>
                    </div>
                    {/* Demo persona switcher — hint only; server ignores it when an IdP role exists.
                      * Selection reflects the persona the SERVER actually resolved, not the one
                      * requested: (a) on a fresh session neither button was pressed while the
                      * header said "Viewing as Supply Chain Planner", and (b) when demo-persona
                      * mode is off the server IGNORES the requested persona (SEC-01), so showing
                      * the request would claim authority the caller does not have. */}
                    <div className="seg" role="group" aria-label="Demo persona">
                        {[PLANNER, MANAGER].map((p) => (
                            <button
                                key={p}
                                type="button"
                                className="seg-opt"
                                aria-pressed={(data?.persona || demoPersona || PLANNER) === p ? "true" : "false"}
                                onClick={() => setPersona(p)}
                            >{p.replace("Supply Chain ", "")}</button>
                        ))}
                    </div>
                </div>
            )}

            {error && (
                // Errors must read as errors: the accent-100/800 pair painted a
                // failure in the same blue as informational chrome, and neither
                // token flips for dark mode. Use the bad/error semantic pair,
                // which is theme-aware and AA-checked.
                <div role="status" className="blueprint" style={{
                    padding: "8px 12px", fontSize: 12, marginBottom: 10,
                    background: "var(--pp-bad-soft)", color: "var(--pp-bad)",
                    borderColor: "color-mix(in srgb, var(--pp-bad) 40%, transparent)",
                }}>{error}</div>
            )}

            {loading && !data && (
                <div className="text-muted" style={{ fontSize: 13, padding: "24px 0" }}>
                    Scanning KPIs for decisions…
                </div>
            )}

            {!loading && !data && !error && (
                // Intent gate — first visit with no session cache. The stack
                // loads only when the user asks.
                <div style={{ padding: "28px 0", textAlign: "center" }}>
                    <div className="text-muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
                        Decision prompts are fetched from the governed store on demand.
                    </div>
                    <button
                        type="button"
                        // `btn` carries the box (padding/radius/font/inline-flex);
                        // `btn-primary` only sets colours. Without `btn` this
                        // rendered with browser-default button metrics.
                        className="btn btn-primary"
                        disabled={loading}
                        onClick={() => void load()}
                        data-testid="action-insights-load"
                    >
                        Load decisions
                    </button>
                </div>
            )}

            {!loading && data && prompts.length === 0 && !error && (
                <div className="text-muted" style={{ fontSize: 13.5, padding: "28px 0", textAlign: "center" }}>
                    {data.notice || "No decisions need attention right now."}
                </div>
            )}

            {prompts.map((p) => (
                <DecisionPromptCard
                    key={p.prompt_id}
                    prompt={p}
                    onAction={onAction}
                    busy={busyId === p.prompt_id}
                    maxImpact={maxImpact}
                    connectorProfileId={assistantProfile}
                />
            ))}
        </div>
    );
}
