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

/** A display-only view over the loaded prompts — the cockpit's KPI cards,
 *  severity bars and donut set this when clicked. Filters what is SHOWN,
 *  never what is fetched: the data under a filter is always the same data
 *  the summary numbers were derived from. */
export interface DecisionViewFilter {
    severity?: DecisionPrompt["severity"];
    status?: "awaiting-approval" | "resolved";
    /** Include already-resolved prompts in the default view. OFF by default in
     *  the cockpit: a card under "Needs Your Decision" that is already done
     *  invites deciding it twice, and made the header count disagree with the
     *  cards on screen. Resolved items live behind the "Already sorted by you"
     *  tile instead. */
    includeResolved?: boolean;
}

const TERMINAL_STATUSES = ["actioned", "rejected", "false-positive", "snoozed"];

export function decisionMatchesView(p: DecisionPrompt, view?: DecisionViewFilter | null): boolean {
    const terminal = TERMINAL_STATUSES.includes(p.status);
    if (!view) return true;
    if (view.status === "resolved") return terminal;
    if (terminal && !view.includeResolved) return false;
    if (view.severity && p.severity !== view.severity) return false;
    if (view.status === "awaiting-approval" && !p.approval_required) return false;
    return true;
}

export function ActionInsightsPanel({ proxyBase, assistantProfile, onData, onStatus, hideHeader, view, onResolvedPersona }: {
    proxyBase: string;
    assistantProfile?: string;
    /** Reports the loaded prompt set to a parent (e.g. the cockpit shell derives
     *  KPIs + the severity donut from the SAME fetch — no double-fetch, no
     *  fabricated numbers). */
    onData?: (prompts: DecisionPrompt[]) => void;
    /** Reports fetch status to a parent shell. The cockpit needs this to avoid
     *  claiming "you're all caught up" from an empty prompt list that simply
     *  hasn't arrived yet — an empty list and an unfetched list look identical
     *  from `onData` alone. */
    onStatus?: (status: "loading" | "ready" | "error") => void;
    /** In the cockpit the persona/heading live in the shell chrome, so the panel
     *  renders just the decision list. */
    hideHeader?: boolean;
    /** Display filter from the cockpit's interactive summary (see
     *  DecisionViewFilter). Never affects fetching or the onData payload. */
    view?: DecisionViewFilter | null;
    /** Reports the persona the SERVER resolved (with its source). The demo
     *  switch is a hint the server may ignore (SEC-01: IdP roles win, and demo
     *  switching needs an explicit opt-in) — any switcher UI must reflect this
     *  resolution, not the request, or it claims authority the caller lacks. */
    onResolvedPersona?: (info: { persona: string; source: string }) => void;
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
    const onStatusRef = useRef(onStatus);
    onStatusRef.current = onStatus;
    const onResolvedPersonaRef = useRef(onResolvedPersona);
    onResolvedPersonaRef.current = onResolvedPersona;

    const load = useCallback(async (personaOverride?: string) => {
        const persona = personaOverride ?? demoPersona;
        setLoading(true);
        setError(null);
        onStatusRef.current?.("loading");
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
            onResolvedPersonaRef.current?.({ persona: body.persona, source: body.personaSource });
            onStatusRef.current?.("ready");
        } catch (e) {
            setError(String((e as Error).message || e));
            setData(null);
            onStatusRef.current?.("error");
        } finally {
            setLoading(false);
        }
    }, [base, demoPersona, assistantProfile]); // eslint-disable-line react-hooks/exhaustive-deps -- profileQuery/profileHeaders derive from assistantProfile

    // One auto-load per scope per session. A ref (not state) because this must
    // survive re-renders without causing one, and must NOT reset when the
    // effect re-runs for an unrelated dep change.
    const autoLoadedRef = useRef<Set<string>>(new Set());

    // Mount / scope-change hydration — cache first, then AT MOST ONE fetch.
    //
    // 2026-07-29: this surface previously required a "Load decisions" click.
    // That starved the whole cockpit — the KPI strip, the severity donut and
    // the impact totals all derive from THIS fetch, so an unclicked page read
    // "0 open / n/a impact" as though the queue were clear. The gate was
    // protecting the wrong thing.
    //
    // Auto-loading here costs exactly what the button cost: the prompt store is
    // a SELECT over a precomputed Delta table — no model call, no token spend.
    // The no-spend rule still holds where it earns its keep: the LLM briefing
    // and Ask Pulse remain intent-only.
    //
    // Bounded deliberately: once per (base, profile, persona) per session, never
    // on a timer, and skipped entirely when the session cache is warm.
    useEffect(() => {
        const key = `${base}|${assistantProfile || ""}|${demoPersona}`;
        const hit = readPromptCache(key);
        if (hit) {
            setData(hit.body);
            setFetchedAt(hit.fetchedAt);
            onDataRef.current?.(hit.body.prompts || []);
            onResolvedPersonaRef.current?.({ persona: hit.body.persona, source: hit.body.personaSource });
            onStatusRef.current?.("ready");
            return;
        }
        setData(null);
        setFetchedAt(null);
        if (autoLoadedRef.current.has(key)) {
            // Nothing more will arrive for this scope — say so, or the shell
            // waits forever on a "loading" that never resolves.
            onStatusRef.current?.("ready");
            return;
        }
        autoLoadedRef.current.add(key);
        void load();
    }, [base, assistantProfile, demoPersona]); // eslint-disable-line react-hooks/exhaustive-deps -- `load` is recreated per scope; depending on it would re-fire this effect

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
    // maxImpact stays over the FULL set so a filtered view doesn't re-scale
    // every card's relative-impact bar against a smaller denominator.
    const visiblePrompts = prompts.filter((p) => decisionMatchesView(p, view));
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
                                <>Checking your supply chain…</>
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
                // A cold SQL warehouse takes ~10s to wake. Blank space for ten
                // seconds reads as "broken"; skeleton cards in the shape of the
                // real ones read as "working", and set the layout up front so
                // arriving prompts don't shift the page.
                <div data-testid="action-insights-skeleton" aria-busy="true" aria-live="polite">
                    <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                        Scanning KPIs for decisions…
                    </div>
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="dpc-skel" style={{ animationDelay: `${i * 120}ms` }}>
                            <span className="dpc-skel__rail" />
                            <div className="dpc-skel__body">
                                <span className="dpc-skel__line dpc-skel__line--chip" />
                                <span className="dpc-skel__line dpc-skel__line--head" />
                                <span className="dpc-skel__line dpc-skel__line--text" />
                                <span className="dpc-skel__line dpc-skel__line--short" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && !data && !error && (
                // Reachable only when the auto-load was skipped or returned
                // nothing usable — a manual retry, not the primary path.
                <div style={{ padding: "28px 0", textAlign: "center" }}>
                    <div className="text-muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
                        Decision prompts come from the governed store.
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

            {view && prompts.length > 0 && visiblePrompts.length === 0 && (
                <div className="text-muted" style={{ fontSize: 13.5, padding: "20px 0", textAlign: "center" }} role="status">
                    {(view.severity || view.status)
                        ? "Nothing matches this view."
                        : "Nothing needs your decision right now. You're all caught up."}
                </div>
            )}

            {visiblePrompts.map((p) => (
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
