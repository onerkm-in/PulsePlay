// playground/src/components/FirstRunWizard.tsx
//
// 4-step first-run onboarding wizard — full-bleed modal.
//
//   Step 1 — Welcome + Persona
//     Pick your role (Analyst / Executive / Developer / Designer).
//     Each persona seeds UI mode, layout, and connector hints for later steps.
//     "Just give me defaults" fast-lane skips straight to Done.
//
//   Step 2 — Choose your tools
//     BI vendor (Y-axis: what you're looking at) + AI connector (X-axis:
//     what does the reasoning). Persona-recommended picks are softly outlined.
//
//   Step 3 — Connect
//     Embed config specific to the chosen vendor (EmbedConfigForm) + an
//     optional "Test connection" probe. "Continue without testing" is always
//     available — no hard blocking.
//
//   Step 4 — Explore
//     Optional knowledge pack + pre-typed suggested first question.
//     "Done & ask" auto-submits the question so the user sees a live
//     AI response the moment the wizard closes.
//
// Persistence:
//   Draft state (step, persona, vendor, connector) saved to
//   `pulseplay:wizard-draft` on every step advance. Re-opening the wizard
//   resumes from the furthest reached step. Cleared on Done or Skip.
//
// Transitions: CSS-only slide+fade (280ms cubic-bezier). No animation library.
// Keyboard: focus-trap inside modal; Esc dismisses; Tab / Shift-Tab cycles.
// Accessibility: aria-live step announcements; radio-group semantics on cards.

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import type { BIEmbedConfig } from "../biPanel/BIAdapter";
import type { PulsePlayAllowlist } from "../types/allowlist";
import type { PackInfo, PackSelection } from "./PackPicker";
import { EmbedConfigForm } from "./EmbedConfigForm";
import { PackPicker } from "./PackPicker";

/* ─── Public constants ───────────────────────────────────────────────── */

export const WIZARD_DISMISSED_KEY = "pulseplay:wizard-dismissed";
export const WIZARD_DRAFT_KEY     = "pulseplay:wizard-draft";
/** Set by `forceWizard()` — makes `shouldShowWizard` return true even when
 *  the user already has an embed config / connector configured (i.e. "Re-run
 *  setup wizard" from Settings). Cleared on wizard Done or Skip. */
export const WIZARD_FORCE_KEY     = "pulseplay:wizard-force";

/* ─── Persona types ──────────────────────────────────────────────────── */

export type PersonaKey = "analyst" | "executive" | "developer" | "designer";

export interface PersonaPreset {
    key:                    PersonaKey;
    label:                  string;
    tagline:                string;
    icon:                   string;
    color:                  string;
    gradient:               string;
    uiMode:                 "pulse" | "v0";
    layoutMode:             "ai-left" | "ai-right" | "ai-top";
    preferredConnectorType?: string;
}

export const PERSONA_PRESETS: readonly PersonaPreset[] = [
    {
        key:                    "analyst",
        label:                  "Analyst",
        tagline:                "Drill into metrics, spot anomalies, build narratives.",
        icon:                   "📊",
        color:                  "#2563eb",
        gradient:               "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
        uiMode:                 "pulse",
        layoutMode:             "ai-left",
        preferredConnectorType: "genie",
    },
    {
        key:                    "executive",
        label:                  "Executive",
        tagline:                "High-level view. Quick answers. No friction.",
        icon:                   "🎯",
        color:                  "#7c3aed",
        gradient:               "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
        uiMode:                 "pulse",
        layoutMode:             "ai-top",
        preferredConnectorType: "foundation-model",
    },
    {
        key:                    "developer",
        label:                  "Developer",
        tagline:                "Wire up integrations, inspect payloads, debug flows.",
        icon:                   "🛠️",
        color:                  "#0891b2",
        gradient:               "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
        uiMode:                 "v0",
        layoutMode:             "ai-right",
        preferredConnectorType: undefined,
    },
    {
        key:                    "designer",
        label:                  "Designer",
        tagline:                "Curate layouts, polish UX, demo to stakeholders.",
        icon:                   "✨",
        color:                  "#db2777",
        gradient:               "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
        uiMode:                 "pulse",
        layoutMode:             "ai-left",
        preferredConnectorType: undefined,
    },
] as const;

/**
 * Return the UI + layout preset for a persona. Used by App.tsx after the
 * wizard completes and by tests.
 */
export function applyPersonaDefaults(
    persona: PersonaKey,
): Pick<PersonaPreset, "uiMode" | "layoutMode" | "preferredConnectorType"> {
    const preset = PERSONA_PRESETS.find(p => p.key === persona) ?? PERSONA_PRESETS[0];
    return {
        uiMode:                 preset.uiMode,
        layoutMode:             preset.layoutMode,
        preferredConnectorType: preset.preferredConnectorType,
    };
}

/* ─── Public types ───────────────────────────────────────────────────── */

export interface VendorOption {
    vendor:       string;
    displayName:  string;
    description?: string;
    accent?:      string;
}

export interface ConnectorOption {
    name:         string;
    displayName?: string;
    dataDomain?:  string;
    description?: string;
    type?:        string;
}

export interface FirstRunWizardProps {
    /** Governance-filtered vendor list (visibleVendors from App). */
    vendors:           VendorOption[];
    /** Allowlist forwarded to EmbedConfigForm for origin/tenant validation. */
    allowlist?:        PulsePlayAllowlist | null;
    /** Knowledge packs for Step 4. */
    availablePacks?:   PackInfo[];
    /** Injected connector loader — defaults to /api/assistant/profiles. */
    fetchConnectors?:  () => Promise<ConnectorOption[]>;
    /** Persona to pre-select on Step 1 when no draft exists. Used by the
     *  Settings → "Re-run setup wizard" path so the user's previously
     *  chosen role survives across runs. Falls back to "analyst" when
     *  unset. Draft state (mid-flow refresh) always wins over this. */
    initialPersona?:   PersonaKey;
    /** Called when the wizard completes with all picks. */
    onComplete: (picks: {
        vendor:             string;
        connector:          string;
        embedConfig:        BIEmbedConfig;
        packSelection:      PackSelection | null;
        persona:            PersonaKey;
        uiMode:             "pulse" | "v0";
        layoutMode:         "ai-left" | "ai-right" | "ai-top";
        suggestedQuestion?: string;
        autoAsk?:           boolean;
    }) => void;
    /** Called when the user skips — no picks applied. */
    onDismiss?: () => void;
}

/* ─── Entry-point guard (App uses this, NOT the component) ───────────── */

/**
 * Returns true when the wizard should be shown. Pure — safe to call
 * before mounting. Reads localStorage directly.
 *
 * Force flag: if `pulseplay:wizard-force` is set (written by `forceWizard()`),
 * the wizard shows regardless of hasEmbedConfig / hasConnector state, but only
 * when there is at least one visible BI vendor. This is the "Re-run setup
 * wizard" path — the user already has config but wants to re-run the flow. The
 * force flag is a single-use signal: it is consumed here and must be cleared
 * by the wizard's Done / Skip paths via clearDraft().
 */
export function shouldShowWizard(args: {
    hasEmbedConfig:   boolean;
    hasConnector:     boolean;
    vendorsAvailable: boolean;
}): boolean {
    if (typeof window === "undefined") return false;
    if (!args.vendorsAvailable) return false;
    try {
        // Force flag overrides configured-state gates — "Re-run setup
        // wizard" path. Vendor availability remains a hard prerequisite so
        // the wizard cannot open into a dead-end Step 2.
        if (window.localStorage.getItem(WIZARD_FORCE_KEY) === "true") return true;
    } catch { /* swallow */ }
    try {
        if (window.localStorage.getItem(WIZARD_DISMISSED_KEY) === "true") return false;
    } catch { /* swallow */ }
    return !args.hasEmbedConfig && !args.hasConnector;
}

/** Clear the dismissal flag. Settings → System exposes a button for this.
 *  Prefer `forceWizard()` for the "Re-run" use case — it also sets the
 *  force flag so the wizard shows even when embed config already exists. */
export function resetWizardDismissal(): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(WIZARD_DISMISSED_KEY); } catch { /* swallow */ }
}

/**
 * Arm the wizard for a forced re-run from Settings → System.
 *
 * Sets `WIZARD_FORCE_KEY` so `shouldShowWizard` returns true even when the
 * user already has an embed config + connector configured.  Clears the
 * dismissal flag and any saved draft so the user starts from Step 1.
 *
 * The force flag is cleared when the wizard completes or is skipped
 * (both paths call `clearDraft()` which now removes it).
 */
export function forceWizard(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(WIZARD_FORCE_KEY, "true");
        window.localStorage.removeItem(WIZARD_DISMISSED_KEY);
        window.localStorage.removeItem(WIZARD_DRAFT_KEY);
    } catch { /* swallow */ }
}

/* ─── Draft persistence ──────────────────────────────────────────────── */

interface WizardDraft {
    step:       number;
    persona?:   PersonaKey;
    vendor?:    string;
    connector?: string;
}

const VALID_PERSONA_KEYS = new Set<string>(["analyst", "executive", "developer", "designer"]);

/**
 * Load and validate the wizard draft. Returns null if the draft is missing,
 * unparseable, or contains values that do not match the expected schema —
 * prevents an attacker who can write to localStorage (XSS, extension) from
 * injecting arbitrary vendor / connector / persona strings into wizard state.
 */
function loadDraft(): WizardDraft | null {
    try {
        const raw = window.localStorage.getItem(WIZARD_DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") return null;
        const d = parsed as Record<string, unknown>;
        const step = typeof d.step === "number" && d.step >= 0 && d.step <= 3
            ? (d.step as 0 | 1 | 2 | 3) : 0;
        const persona = typeof d.persona === "string" && VALID_PERSONA_KEYS.has(d.persona)
            ? (d.persona as PersonaKey) : undefined;
        // vendor + connector are opaque strings — allow any non-empty string;
        // the actual allowlist check happens when Step 2 renders the card grid.
        const vendor    = typeof d.vendor    === "string" && d.vendor.trim()    ? d.vendor.trim()    : undefined;
        const connector = typeof d.connector === "string" && d.connector.trim() ? d.connector.trim() : undefined;
        return { step, persona, vendor, connector };
    } catch { return null; }
}

function saveDraft(draft: WizardDraft): void {
    try { window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft)); } catch { /* swallow */ }
}

function clearDraft(): void {
    try {
        window.localStorage.removeItem(WIZARD_DRAFT_KEY);
        // Also consume the force flag if it was set by forceWizard().
        window.localStorage.removeItem(WIZARD_FORCE_KEY);
    } catch { /* swallow */ }
}

/* ─── Probe helper ───────────────────────────────────────────────────── */

interface WizardProbeResult {
    ok:          boolean;
    latencyMs:   number;
    message?:    string;
}

/**
 * Probe a connector via the PulsePlay proxy.
 *
 * Always POSTs to `/api/assistant/probe` — the Vite dev server proxies
 * `/api/*` → `127.0.0.1:8787`, so this works in dev, staging, and
 * production without change. The former `/foundation/health` direct fetch
 * was NOT proxied by Vite (only `/api/*` is), so it silently hit the
 * SPA origin instead of the proxy in dev environments (RISK-P1 4.4 fix).
 *
 * The proxy's `/api/assistant/probe` route already handles all 8 backend
 * paths (Genie, Foundation Model, Azure OpenAI, Bedrock, Supervisor, …)
 * based on the profile type — no client-side type-sniffing needed.
 *
 * Note: `connectorType` is retained in the signature for call-site
 * compatibility but is no longer used in the request.
 */
async function runProbe(connectorName: string, _connectorType?: string): Promise<WizardProbeResult> {
    const t0 = Date.now();
    try {
        const res = await fetch("/api/assistant/probe", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ assistantProfile: connectorName }),
            signal:  AbortSignal.timeout(12_000),
        });
        const latencyMs = Date.now() - t0;
        if (res.ok) return { ok: true, latencyMs };
        let message = `HTTP ${res.status}`;
        try {
            const j = await res.json() as { error?: string; message?: string };
            message = (typeof j.error === "string" ? j.error : null)
                   ?? (typeof j.message === "string" ? j.message : null)
                   ?? message;
        } catch { /* swallow — non-JSON body */ }
        return { ok: false, latencyMs, message };
    } catch (err) {
        return { ok: false, latencyMs: Date.now() - t0, message: err instanceof Error ? err.message : "Network error" };
    }
}

/* ─── Suggested question by pack ────────────────────────────────────── */

const PACK_SUGGESTIONS: Record<string, string> = {
    retail:  "What are the top-selling products this quarter, and where are we seeing margin pressure?",
    finance: "How is cash flow trending vs. budget, and which business units are overrunning?",
    hr:      "What does attrition look like this quarter, and which teams are most at risk?",
    sales:   "Which deals are at risk of slipping, and what's driving the pipeline gap?",
    ops:     "Where are the biggest bottlenecks in our operations, and what's the leading indicator?",
};
const FALLBACK_SUGGESTION = "What stands out in this data, and what should I focus on first?";

function suggestQuestion(packName: string): string {
    const key = packName.toLowerCase();
    for (const [k, q] of Object.entries(PACK_SUGGESTIONS)) {
        if (key.includes(k)) return q;
    }
    return FALLBACK_SUGGESTION;
}

/* ─── Step metadata ──────────────────────────────────────────────────── */

type WizardStep = 0 | 1 | 2 | 3;

const STEP_META = [
    {
        key:         "welcome",
        label:       "Welcome",
        title:       "Who are you today?",
        subtitle:    "Pick the role that fits best. PulsePlay will arrange itself around you — you can always change it later.",
    },
    {
        key:         "tools",
        label:       "Choose tools",
        title:       "What are you working with?",
        subtitle:    "Pick the BI tool you're embedding (Y-axis) and the AI brain that answers your questions (X-axis). They're independent — any combination works.",
    },
    {
        key:         "connect",
        label:       "Connect",
        title:       "Connect the BI source",
        subtitle:    "Fill in the embed settings for your chosen BI tool. Test the connection to confirm everything's wired up, or skip testing and come back later.",
    },
    {
        key:         "explore",
        label:       "Explore",
        title:       "Ready to explore?",
        subtitle:    "Optionally pick a knowledge pack so the AI understands your data domain. Then type (or accept) a first question to hit the ground running.",
    },
] as const;

/* ─── Main component ─────────────────────────────────────────────────── */

export function FirstRunWizard(props: FirstRunWizardProps): ReactElement {
    // Restore furthest-reached step from draft on first mount.
    const draft = useMemo(() => loadDraft(), []);

    const [step,      setStep]      = useState<WizardStep>(() => {
        const s = draft?.step ?? 0;
        return (s >= 0 && s <= 3 ? s : 0) as WizardStep;
    });
    const [direction, setDirection] = useState<"forward" | "back">("forward");

    const [persona,   setPersona]   = useState<PersonaKey>(draft?.persona ?? props.initialPersona ?? "analyst");
    const [vendor,    setVendor]    = useState<string>(draft?.vendor    ?? "");
    const [connector, setConnector] = useState<string>(draft?.connector ?? "");

    const [embedConfig,    setEmbedConfig]    = useState<BIEmbedConfig>({});
    const [packSelection,  setPackSelection]  = useState<PackSelection | null>(null);
    const [suggestedQ,     setSuggestedQ]     = useState(FALLBACK_SUGGESTION);

    const [connectors,        setConnectors]        = useState<ConnectorOption[]>([]);
    const [connectorsLoading, setConnectorsLoading] = useState(true);
    const [connectorsError,   setConnectorsError]   = useState("");

    const [probeStatus,  setProbeStatus]  = useState<"idle" | "running" | "ok" | "fail">("idle");
    const [probeResult,  setProbeResult]  = useState<WizardProbeResult | null>(null);

    const [liveMsg, setLiveMsg] = useState("");
    const dialogRef = useRef<HTMLDivElement>(null);

    /* ── Load connectors ── */
    useEffect(() => {
        let cancelled = false;
        const fetcher = props.fetchConnectors ?? defaultFetchConnectors;
        fetcher()
            .then(list => { if (!cancelled) { setConnectors(list); setConnectorsLoading(false); } })
            .catch(err => { if (!cancelled) { setConnectorsError(err instanceof Error ? err.message : String(err)); setConnectorsLoading(false); } });
        return () => { cancelled = true; };
    }, [props.fetchConnectors]);

    /* ── Focus trap ── */
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ));
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); skip(); return; }
            if (e.key !== "Tab") return;
            const els = focusables();
            if (!els.length) return;
            const first = els[0], last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        };
        dialog.addEventListener("keydown", handler as EventListener);
        focusables()[0]?.focus();
        return () => dialog.removeEventListener("keydown", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    /* ── Update suggested question when pack changes ── */
    useEffect(() => {
        if (packSelection?.pack) setSuggestedQ(suggestQuestion(packSelection.pack));
        else setSuggestedQ(FALLBACK_SUGGESTION);
    }, [packSelection]);

    /* ── Navigation ── */
    const goTo = useCallback((to: WizardStep) => {
        setDirection(to > step ? "forward" : "back");
        setStep(to);
        setLiveMsg(`Step ${to + 1} of 4: ${STEP_META[to].label}`);
        saveDraft({ step: to, persona, vendor, connector });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, persona, vendor, connector]);

    const canAdvance = useMemo((): boolean => {
        if (step === 0) return true;
        if (step === 1) return !!(vendor && connector);
        if (step === 2) return true; // probe is encouraged but never blocking
        return false;
    }, [step, vendor, connector]);

    /* ── Probe ── */
    const handleProbe = async () => {
        if (!connector) return;
        setProbeStatus("running");
        const ct = connectors.find(c => c.name === connector)?.type;
        const result = await runProbe(connector, ct);
        setProbeResult(result);
        setProbeStatus(result.ok ? "ok" : "fail");
    };

    /* ── Persona recommended connector (soft hint for Step 2) ── */
    const recommendedConnectorType = PERSONA_PRESETS.find(p => p.key === persona)?.preferredConnectorType;
    const recommendedConnector = useMemo(() => {
        if (!recommendedConnectorType) return connectors[0]?.name ?? "";
        return connectors.find(c => c.type?.toLowerCase().includes(recommendedConnectorType))?.name
            ?? connectors[0]?.name ?? "";
    }, [connectors, recommendedConnectorType]);

    /* ── Finish actions ── */
    const skip = useCallback(() => {
        clearDraft();
        try { window.localStorage.setItem(WIZARD_DISMISSED_KEY, "true"); } catch { /* swallow */ }
        props.onDismiss?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.onDismiss]);

    const justGiveDefaults = useCallback(() => {
        const preset     = PERSONA_PRESETS[0]; // Analyst
        const firstVend  = props.vendors[0]?.vendor ?? "";
        const firstConn  = connectors[0]?.name ?? "";
        clearDraft();
        try { window.localStorage.setItem(WIZARD_DISMISSED_KEY, "true"); } catch { /* swallow */ }
        props.onComplete({
            vendor:        firstVend,
            connector:     firstConn,
            embedConfig:   {},
            packSelection: null,
            persona:       preset.key,
            uiMode:        preset.uiMode,
            layoutMode:    preset.layoutMode,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.vendors, connectors, props.onComplete]);

    const finish = useCallback((autoAsk = false) => {
        clearDraft();
        try { window.localStorage.setItem(WIZARD_DISMISSED_KEY, "true"); } catch { /* swallow */ }
        const { uiMode, layoutMode } = applyPersonaDefaults(persona);
        props.onComplete({
            vendor,
            connector,
            embedConfig,
            packSelection,
            persona,
            uiMode,
            layoutMode,
            suggestedQuestion: suggestedQ || undefined,
            autoAsk,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persona, vendor, connector, embedConfig, packSelection, suggestedQ, props.onComplete]);

    /* ── Render ── */
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pp-wizard-title"
            data-testid="pp-first-run-wizard"
            data-step={step}
            ref={dialogRef}
            style={{
                position:             "fixed",
                inset:                0,
                display:              "flex",
                alignItems:           "center",
                justifyContent:       "center",
                background:           "rgba(15, 23, 42, 0.55)",
                backdropFilter:       "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                zIndex:               900,
                padding:              "20px 16px",
                overflow:             "auto",
            }}
        >
            {/* Live region for screen readers */}
            <div
                aria-live="polite"
                aria-atomic="true"
                style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
            >
                {liveMsg}
            </div>

            <div
                style={{
                    width:               "100%",
                    maxWidth:            860,
                    background:          "#ffffff",
                    borderRadius:        18,
                    boxShadow:           "0 24px 64px rgba(15,23,42,0.22), 0 4px 16px rgba(15,23,42,0.10)",
                    display:             "grid",
                    gridTemplateColumns: "1fr 168px",
                    overflow:            "hidden",
                    position:            "relative",
                }}
            >
                {/* ── Main content area ── */}
                <div style={{ padding: "36px 36px 28px", display: "flex", flexDirection: "column", minHeight: 0 }}>

                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
                        <div style={{ flex: "1 1 auto", minWidth: 0, paddingRight: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#94a3b8", textTransform: "uppercase", marginBottom: 5 }}>
                                Step {step + 1} of 4 — {STEP_META[step].label}
                            </div>
                            <h1
                                id="pp-wizard-title"
                                style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.4, lineHeight: 1.2 }}
                            >
                                {STEP_META[step].title}
                            </h1>
                            <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "#475569", lineHeight: 1.6, maxWidth: 520 }}>
                                {STEP_META[step].subtitle}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={skip}
                            aria-label="Skip setup and close"
                            style={closeButtonStyle}
                            title="Skip setup"
                        >
                            ×
                        </button>
                    </div>

                    {/* Step body */}
                    <div style={{ position: "relative", flex: "1 1 auto", minHeight: 300 }}>
                        <StepPane visible={step === 0} direction={direction}>
                            <Step1Welcome
                                persona={persona}
                                onPersonaChange={setPersona}
                                canJustGiveDefaults={props.vendors.length > 0}
                                onJustGiveDefaults={justGiveDefaults}
                            />
                        </StepPane>
                        <StepPane visible={step === 1} direction={direction}>
                            <Step2Axes
                                vendors={props.vendors}
                                connectors={connectors}
                                connectorsLoading={connectorsLoading}
                                connectorsError={connectorsError}
                                vendor={vendor}
                                connector={connector}
                                recommendedConnector={recommendedConnector}
                                onVendorChange={setVendor}
                                onConnectorChange={setConnector}
                            />
                        </StepPane>
                        <StepPane visible={step === 2} direction={direction}>
                            <Step3Connect
                                vendor={vendor}
                                connector={connector}
                                allowlist={props.allowlist}
                                embedConfig={embedConfig}
                                onEmbedConfigChange={setEmbedConfig}
                                probeStatus={probeStatus}
                                probeResult={probeResult}
                                onRunProbe={() => void handleProbe()}
                                onSkipTest={() => goTo(3)}
                            />
                        </StepPane>
                        <StepPane visible={step === 3} direction={direction}>
                            <Step4Explore
                                availablePacks={props.availablePacks ?? []}
                                packSelection={packSelection}
                                onPackSelectionChange={setPackSelection}
                                suggestedQuestion={suggestedQ}
                                onSuggestedQuestionChange={setSuggestedQ}
                            />
                        </StepPane>
                    </div>

                    {/* Footer */}
                    <div
                        style={{
                            display:       "flex",
                            alignItems:    "center",
                            justifyContent:"space-between",
                            marginTop:     24,
                            paddingTop:    20,
                            borderTop:     "1px solid rgba(0,0,0,0.07)",
                        }}
                    >
                        <button type="button" onClick={skip} style={ghostButtonStyle}>
                            Skip for now
                        </button>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {step > 0 && (
                                <button
                                    type="button"
                                    onClick={() => goTo((step - 1) as WizardStep)}
                                    style={ghostButtonStyle}
                                >
                                    ← Back
                                </button>
                            )}
                            {step < 3 && (
                                <button
                                    type="button"
                                    onClick={() => goTo((step + 1) as WizardStep)}
                                    disabled={!canAdvance}
                                    style={canAdvance ? primaryButtonStyle : disabledButtonStyle}
                                    title={!canAdvance && step === 1 ? "Pick a BI tool and an AI connector to continue" : undefined}
                                >
                                    Continue →
                                </button>
                            )}
                            {step === 3 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => finish(false)}
                                        style={primaryButtonStyle}
                                    >
                                        Done
                                    </button>
                                    {suggestedQ && (
                                        <button
                                            type="button"
                                            onClick={() => finish(true)}
                                            style={accentButtonStyle}
                                            title="Apply picks and submit the first question"
                                        >
                                            Done &amp; ask →
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Step rail ── */}
                <aside
                    aria-label="Wizard progress"
                    style={{
                        borderLeft:      "1px solid rgba(0,0,0,0.07)",
                        background:      "#fafafa",
                        padding:         "36px 18px 28px",
                        display:         "flex",
                        flexDirection:   "column",
                        gap:             0,
                    }}
                >
                    <div
                        style={{
                            fontSize:      10.5,
                            fontWeight:    700,
                            letterSpacing: 0.8,
                            color:         "#94a3b8",
                            textTransform: "uppercase",
                            marginBottom:  20,
                        }}
                    >
                        Progress
                    </div>
                    {STEP_META.map((s, i) => (
                        <StepRailItem
                            key={s.key}
                            index={i}
                            label={s.label}
                            status={i < step ? "done" : i === step ? "active" : "future"}
                            isLast={i === 3}
                        />
                    ))}
                </aside>
            </div>
        </div>
    );
}

/* ─── Step 1 — Welcome + Persona ─────────────────────────────────────── */

function Step1Welcome(props: {
    persona:               PersonaKey;
    onPersonaChange:       (p: PersonaKey) => void;
    canJustGiveDefaults:   boolean;
    onJustGiveDefaults:    () => void;
}): ReactElement {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
                role="radiogroup"
                aria-label="Select your role"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
            >
                {PERSONA_PRESETS.map(p => (
                    <PersonaCard
                        key={p.key}
                        preset={p}
                        active={props.persona === p.key}
                        onClick={() => props.onPersonaChange(p.key)}
                    />
                ))}
            </div>
            {props.canJustGiveDefaults && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                    <div style={{ flex: "1 1 auto", height: 1, background: "rgba(0,0,0,0.07)" }} />
                    <button
                        type="button"
                        onClick={props.onJustGiveDefaults}
                        style={inlineLinkStyle}
                    >
                        Just give me defaults — skip setup →
                    </button>
                    <div style={{ flex: "1 1 auto", height: 1, background: "rgba(0,0,0,0.07)" }} />
                </div>
            )}
        </div>
    );
}

/* ─── Step 2 — Choose tools ──────────────────────────────────────────── */

function Step2Axes(props: {
    vendors:              VendorOption[];
    connectors:           ConnectorOption[];
    connectorsLoading:    boolean;
    connectorsError:      string;
    vendor:               string;
    connector:            string;
    recommendedConnector: string;
    onVendorChange:       (v: string) => void;
    onConnectorChange:    (c: string) => void;
}): ReactElement {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Y axis — BI vendor */}
            <AxisGroup
                title="BI tool"
                helper="What you're looking at (the Y-axis). Each vendor gets its own embed config in the next step."
            >
                {props.vendors.length === 0 ? (
                    <AxisEmptyState>No BI vendors allowlisted for this deployment.</AxisEmptyState>
                ) : (
                    <div role="radiogroup" aria-label="Pick a BI vendor" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {props.vendors.map(v => (
                            <OptionCard
                                key={v.vendor}
                                active={props.vendor === v.vendor}
                                onClick={() => props.onVendorChange(v.vendor)}
                                title={v.displayName}
                                subtitle={v.description}
                                testId={`pp-first-run-vendor-${v.vendor}`}
                            />
                        ))}
                    </div>
                )}
            </AxisGroup>

            {/* X axis — AI connector */}
            <AxisGroup
                title="AI connector"
                helper="What does the reasoning (the X-axis). Completely independent of the BI tool."
            >
                {props.connectorsLoading ? (
                    <AxisEmptyState>Loading connectors…</AxisEmptyState>
                ) : props.connectorsError ? (
                    <AxisEmptyState>
                        Proxy unreachable — check <code>node server.js</code> is running.
                        <br />
                        <span style={{ opacity: 0.7 }}>{props.connectorsError}</span>
                    </AxisEmptyState>
                ) : props.connectors.length === 0 ? (
                    <AxisEmptyState>
                        No AI connectors found. Add a profile to <code>proxy/config.json</code>.
                    </AxisEmptyState>
                ) : (
                    <div role="radiogroup" aria-label="Pick an AI connector" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {props.connectors.map(c => (
                            <OptionCard
                                key={c.name}
                                active={props.connector === c.name}
                                onClick={() => props.onConnectorChange(c.name)}
                                title={c.displayName || c.name}
                                subtitle={c.dataDomain || c.type}
                                badge={c.name === props.recommendedConnector && !props.connector ? "Suggested" : undefined}
                                testId={`pp-first-run-connector-${c.name}`}
                            />
                        ))}
                    </div>
                )}
            </AxisGroup>
        </div>
    );
}

/* ─── Step 3 — Connect ───────────────────────────────────────────────── */

function Step3Connect(props: {
    vendor:             string;
    connector:          string;
    allowlist?:         PulsePlayAllowlist | null;
    embedConfig:        BIEmbedConfig;
    onEmbedConfigChange:(next: BIEmbedConfig) => void;
    probeStatus:        "idle" | "running" | "ok" | "fail";
    probeResult:        WizardProbeResult | null;
    onRunProbe:         () => void;
    onSkipTest:         () => void;
}): ReactElement {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
                <EmbedConfigForm
                    vendor={props.vendor}
                    value={props.embedConfig}
                    onChange={props.onEmbedConfigChange}
                    assistantProfile={props.connector}
                    allowlist={props.allowlist ?? undefined}
                />
            </div>

            {/* Probe row */}
            <div
                style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           10,
                    padding:       "10px 12px",
                    background:    probeStatusBackground(props.probeStatus),
                    border:        `1px solid ${probeStatusBorder(props.probeStatus)}`,
                    borderRadius:  8,
                    flexWrap:      "wrap",
                }}
            >
                <button
                    type="button"
                    onClick={props.onRunProbe}
                    disabled={props.probeStatus === "running" || !props.connector}
                    style={props.probeStatus === "running" ? disabledButtonStyle : primaryButtonStyle}
                    aria-label="Test connection to the AI connector"
                >
                    {props.probeStatus === "running" ? "Testing…" : "Test connection"}
                </button>

                {props.probeStatus === "ok" && (
                    <span style={{ fontSize: 12.5, color: "#166534", fontWeight: 500 }}>
                        ✓ Connected{props.probeResult?.latencyMs !== undefined ? ` (${props.probeResult.latencyMs}ms)` : ""}
                    </span>
                )}
                {props.probeStatus === "fail" && (
                    <span style={{ fontSize: 12.5, color: "#991b1b", fontWeight: 500 }}>
                        ✗ {props.probeResult?.message ?? "Connection failed"}
                    </span>
                )}
                {props.probeStatus === "idle" && (
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                        Verify the connection before continuing — or skip testing below.
                    </span>
                )}

                <button
                    type="button"
                    onClick={props.onSkipTest}
                    style={{ ...inlineLinkStyle, marginLeft: "auto" }}
                    aria-label="Continue without testing the connection"
                >
                    Continue without testing →
                </button>
            </div>
        </div>
    );
}

function probeStatusBackground(s: string): string {
    if (s === "ok")   return "rgba(34,197,94,0.06)";
    if (s === "fail") return "rgba(239,68,68,0.06)";
    return "rgba(0,0,0,0.02)";
}
function probeStatusBorder(s: string): string {
    if (s === "ok")   return "rgba(34,197,94,0.25)";
    if (s === "fail") return "rgba(239,68,68,0.25)";
    return "rgba(0,0,0,0.09)";
}

/* ─── Step 4 — Explore ───────────────────────────────────────────────── */

function Step4Explore(props: {
    availablePacks:          PackInfo[];
    packSelection:           PackSelection | null;
    onPackSelectionChange:   (next: PackSelection | null) => void;
    suggestedQuestion:       string;
    onSuggestedQuestionChange:(next: string) => void;
}): ReactElement {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {props.availablePacks.length > 0 && (
                <div>
                    <AxisGroup
                        title="Knowledge pack (optional)"
                        helper="Domain vocabulary + KPI definitions the AI uses. Leave blank for the default."
                    >
                        <PackPicker
                            availablePacks={props.availablePacks}
                            value={props.packSelection}
                            onChange={next => props.onPackSelectionChange(next)}
                        />
                    </AxisGroup>
                </div>
            )}
            <div>
                <AxisGroup
                    title="First question"
                    helper="Edit or replace the suggestion — hit 'Done & ask' to submit it instantly."
                >
                    <textarea
                        value={props.suggestedQuestion}
                        onChange={e => props.onSuggestedQuestionChange(e.target.value)}
                        rows={3}
                        placeholder="Type your first question…"
                        style={{
                            width:        "100%",
                            padding:      "10px 12px",
                            fontSize:     13.5,
                            lineHeight:   1.55,
                            color:        "#0f172a",
                            background:   "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                            border:       "1px solid rgba(15,23,42,0.16)",
                            borderRadius: 8,
                            resize:       "vertical",
                            outline:      "none",
                            boxSizing:    "border-box",
                            fontFamily:   "inherit",
                            boxShadow:    "0 1px 2px rgba(15,23,42,0.08), 0 7px 18px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.85)",
                            transition:   "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
                        }}
                        onFocus={e => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.borderColor = "#2563eb";
                            target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.16), 0 2px 5px rgba(15,23,42,0.12), inset 0 1px 0 rgba(255,255,255,0.85)";
                        }}
                        onBlur={e  => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.borderColor = "rgba(15,23,42,0.16)";
                            target.style.boxShadow = "0 1px 2px rgba(15,23,42,0.08), 0 7px 18px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.85)";
                        }}
                    />
                </AxisGroup>
            </div>
        </div>
    );
}

/* ─── Error boundary ────────────────────────────────────────────────── */

interface WizardErrorBoundaryProps {
    children: ReactNode;
    /** Called when the user clicks "Retry" — typically App.tsx bumps a
     *  remount key so the wizard's state is freshly initialised. */
    onRetry?: () => void;
    /** Called when the user clicks "Skip wizard" from the error fallback —
     *  treat the same as a normal Skip (sets dismissal flag, dismisses). */
    onSkip?:  () => void;
}

interface WizardErrorBoundaryState {
    error: Error | null;
}

/**
 * Catches render-time crashes inside the wizard subtree and renders a
 * minimal recovery UI instead of taking the whole app down with a white
 * screen.
 *
 * Why a class component: React still requires class components for
 * `componentDidCatch` + `getDerivedStateFromError`. A 30-line class is
 * cheaper than pulling in `react-error-boundary` as a dependency.
 *
 * The fallback offers two paths so the user is never trapped:
 *   • Retry   — remount the wizard (App.tsx bumps a key)
 *   • Skip    — dismiss the wizard, fall through to the rest of the app
 *
 * Errors are logged to the diagnostics buffer via a `console.error` call
 * (the playground's monkey-patched console.error already routes into
 * `pulseplay:bi-event` for the Support bundle export).
 */
export class WizardErrorBoundary extends Component<WizardErrorBoundaryProps, WizardErrorBoundaryState> {
    state: WizardErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): WizardErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Surfaced into the Support bundle via the playground's console.error patch.
        // eslint-disable-next-line no-console
        console.error("[FirstRunWizard] crashed:", error.message, info.componentStack);
    }

    private handleRetry = (): void => {
        this.setState({ error: null });
        this.props.onRetry?.();
    };

    private handleSkip = (): void => {
        this.setState({ error: null });
        this.props.onSkip?.();
    };

    render(): ReactNode {
        if (!this.state.error) return this.props.children;
        const msg = this.state.error.message || "Setup wizard hit an unexpected error.";
        return (
            <div
                role="alert"
                data-testid="pp-wizard-error-boundary"
                style={{
                    position:       "fixed",
                    inset:          0,
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    background:     "rgba(15, 23, 42, 0.55)",
                    backdropFilter: "blur(8px)",
                    zIndex:         900,
                    padding:        20,
                }}
            >
                <div
                    style={{
                        width:        "100%",
                        maxWidth:     480,
                        background:   "#fff",
                        borderRadius: 14,
                        padding:      "26px 28px",
                        boxShadow:    "0 20px 60px rgba(15,23,42,0.20)",
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                        Setup wizard hit a snag
                    </h2>
                    <p style={{ margin: "10px 0 16px", fontSize: 13, color: "#475569", lineHeight: 1.55 }}>
                        Something went wrong while loading the wizard. You can retry — that
                        usually clears it — or skip setup and configure things manually from
                        the Settings page.
                    </p>
                    <details style={{ marginBottom: 16 }}>
                        <summary style={{ fontSize: 11.5, color: "#64748b", cursor: "pointer" }}>
                            Show technical details
                        </summary>
                        <pre style={{
                            marginTop:   8,
                            fontSize:    11,
                            color:       "#7f1d1d",
                            padding:     "8px 10px",
                            background:  "rgba(127,29,29,0.05)",
                            border:      "1px solid rgba(127,29,29,0.15)",
                            borderRadius: 6,
                            whiteSpace:  "pre-wrap",
                            wordBreak:   "break-word",
                        }}>{msg}</pre>
                    </details>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                            type="button"
                            onClick={this.handleSkip}
                            style={{
                                fontSize:     12.5,
                                padding:      "7px 16px",
                                border:       "1px solid rgba(0,0,0,0.12)",
                                background:   "transparent",
                                color:        "#374151",
                                borderRadius: 7,
                                cursor:       "pointer",
                                fontFamily:   "inherit",
                            }}
                        >
                            Skip wizard
                        </button>
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            style={{
                                fontSize:     12.5,
                                padding:      "7px 18px",
                                border:       "1px solid #2563eb",
                                background:   "#2563eb",
                                color:        "#fff",
                                borderRadius: 7,
                                cursor:       "pointer",
                                fontWeight:   600,
                                fontFamily:   "inherit",
                            }}
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

/* ─── UI primitives ──────────────────────────────────────────────────── */

/** Animated step transition wrapper. */
function StepPane(props: {
    visible:   boolean;
    direction: "forward" | "back";
    children:  ReactNode;
}): ReactElement {
    const offset = props.direction === "forward" ? 28 : -28;
    // `inert` removes hidden panes from the tab/focus order entirely.
    // Without it, Tab can reach buttons inside inactive StepPanes because
    // `aria-hidden` on the wrapper div does not propagate to descendant
    // elements matched by querySelectorAll (RISK-P1 4.3 fix).
    // We spread as a plain object so TypeScript doesn't reject the
    // attribute — `inert` is valid HTML5 but not yet in React's JSX types.
    const inertAttr = props.visible ? {} : { inert: "" } as Record<string, string>;
    return (
        <div
            aria-hidden={!props.visible}
            {...inertAttr}
            style={{
                position:     props.visible ? "relative" : "absolute",
                inset:        props.visible ? "auto" : 0,
                opacity:      props.visible ? 1 : 0,
                transform:    props.visible ? "translateX(0)" : `translateX(${offset}px)`,
                transition:   "transform 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
                pointerEvents:props.visible ? "auto" : "none",
                width:        "100%",
            }}
        >
            {props.children}
        </div>
    );
}

/** Step rail progress indicator. */
function StepRailItem(props: {
    index:  number;
    label:  string;
    status: "done" | "active" | "future";
    isLast: boolean;
}): ReactElement {
    const colors = {
        done:   { dot: "#22c55e", line: "#22c55e", label: "#64748b" },
        active: { dot: "#2563eb", line: "rgba(0,0,0,0.10)", label: "#0f172a" },
        future: { dot: "rgba(0,0,0,0.15)", line: "rgba(0,0,0,0.08)", label: "#94a3b8" },
    };
    const c = colors[props.status];

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                    style={{
                        width:           22,
                        height:          22,
                        borderRadius:    "50%",
                        background:      props.status === "future" ? "transparent" : c.dot,
                        border:          props.status === "future" ? `2px solid ${c.dot}` : "none",
                        display:         "flex",
                        alignItems:      "center",
                        justifyContent:  "center",
                        flexShrink:      0,
                        fontSize:        11,
                        fontWeight:      700,
                        color:           props.status === "future" ? c.dot : "#fff",
                        transition:      "background-color 200ms ease, border-color 200ms ease",
                    }}
                >
                    {props.status === "done" ? "✓" : String(props.index + 1)}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: props.status === "active" ? 600 : 400, color: c.label, transition: "color 200ms ease" }}>
                    {props.label}
                </span>
            </div>
            {!props.isLast && (
                <div
                    style={{
                        marginLeft: 11,
                        width:      1,
                        height:     20,
                        background: c.line,
                        transition: "background-color 200ms ease",
                    }}
                />
            )}
        </div>
    );
}

/** Colorful persona card for Step 1. */
function PersonaCard(props: {
    preset:  PersonaPreset;
    active:  boolean;
    onClick: () => void;
}): ReactElement {
    const { preset, active } = props;
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            onClick={props.onClick}
            data-testid={`pp-first-run-persona-${preset.key}`}
            style={{
                textAlign:         "left",
                padding:           "14px 14px 12px",
                background:        active ? preset.gradient : "#fafafa",
                border:            active ? `2px solid ${preset.color}` : "2px solid transparent",
                outline:           "1px solid rgba(0,0,0,0.08)",
                outlineOffset:     active ? -1 : 0,
                borderRadius:      10,
                cursor:            "pointer",
                color:             "#0f172a",
                transition:        "border-color 160ms ease, background-color 160ms ease, transform 120ms ease, box-shadow 120ms ease",
                transform:         active ? "scale(1.01)" : "scale(1)",
                boxShadow:         active ? `0 0 0 3px ${preset.color}22` : "none",
                display:           "flex",
                flexDirection:     "column",
                gap:               4,
            }}
        >
            <span style={{ fontSize: 22 }}>{preset.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{preset.label}</span>
            <span style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.45, fontWeight: 400 }}>{preset.tagline}</span>
        </button>
    );
}

/** Compact option card for vendor / connector lists. */
function OptionCard(props: {
    active:   boolean;
    onClick:  () => void;
    title:    string;
    subtitle?: string;
    badge?:   string;
    testId?:  string;
}): ReactElement {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={props.active}
            onClick={props.onClick}
            data-testid={props.testId}
            style={{
                textAlign:    "left",
                padding:      "9px 11px",
                border:       props.active ? "1.5px solid #2563eb" : "1.5px solid rgba(0,0,0,0.09)",
                background:   props.active ? "#eff6ff" : "#fff",
                borderRadius: 7,
                cursor:       "pointer",
                color:        "#0f172a",
                transition:   "border-color 140ms ease, background-color 140ms ease",
                display:      "flex",
                alignItems:   "center",
                gap:          8,
            }}
        >
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: props.active ? 600 : 500, lineHeight: 1.3 }}>{props.title}</div>
                {props.subtitle && (
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{props.subtitle}</div>
                )}
            </div>
            {props.badge && (
                <span
                    style={{
                        fontSize:     10,
                        fontWeight:   600,
                        padding:      "2px 6px",
                        borderRadius: 4,
                        background:   "rgba(37,99,235,0.10)",
                        color:        "#2563eb",
                        flexShrink:   0,
                        letterSpacing:0.3,
                    }}
                >
                    {props.badge}
                </span>
            )}
            {props.active && (
                <span style={{ flexShrink: 0, color: "#2563eb", fontSize: 14, lineHeight: 1 }}>✓</span>
            )}
        </button>
    );
}

/** Section label + helper for a group of controls. */
function AxisGroup(props: { title: string; helper?: string; children: ReactNode }): ReactElement {
    return (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", letterSpacing: 0.1 }}>{props.title}</div>
                {props.helper && (
                    <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, lineHeight: 1.45 }}>{props.helper}</div>
                )}
            </div>
            {props.children}
        </section>
    );
}

function AxisEmptyState(props: { children: ReactNode }): ReactElement {
    return (
        <div
            style={{
                fontSize:     12.5,
                color:        "#64748b",
                padding:      "10px 12px",
                background:   "rgba(0,0,0,0.02)",
                border:       "1px dashed rgba(0,0,0,0.12)",
                borderRadius: 7,
                lineHeight:   1.5,
            }}
        >
            {props.children}
        </div>
    );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

async function defaultFetchConnectors(): Promise<ConnectorOption[]> {
    const res = await fetch("/api/assistant/profiles");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ConnectorOption[];
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const closeButtonStyle: React.CSSProperties = {
    flexShrink:   0,
    width:        30,
    height:       30,
    border:       "1px solid rgba(0,0,0,0.10)",
    background:   "transparent",
    color:        "#64748b",
    borderRadius: 8,
    cursor:       "pointer",
    fontSize:     20,
    lineHeight:   1,
    display:      "flex",
    alignItems:   "center",
    justifyContent:"center",
    padding:      0,
};

const ghostButtonStyle: React.CSSProperties = {
    fontSize:     12.5,
    padding:      "6px 14px",
    border:       "1px solid rgba(0,0,0,0.12)",
    background:   "transparent",
    color:        "#374151",
    borderRadius: 7,
    cursor:       "pointer",
    fontFamily:   "inherit",
};

const primaryButtonStyle: React.CSSProperties = {
    fontSize:     12.5,
    padding:      "7px 18px",
    border:       "1px solid #2563eb",
    background:   "#2563eb",
    color:        "#fff",
    borderRadius: 7,
    cursor:       "pointer",
    fontWeight:   600,
    fontFamily:   "inherit",
};

const disabledButtonStyle: React.CSSProperties = {
    ...primaryButtonStyle,
    background:   "rgba(37,99,235,0.35)",
    borderColor:  "rgba(37,99,235,0.35)",
    cursor:       "not-allowed",
};

const accentButtonStyle: React.CSSProperties = {
    fontSize:     12.5,
    padding:      "7px 18px",
    border:       "1px solid #0891b2",
    background:   "#0891b2",
    color:        "#fff",
    borderRadius: 7,
    cursor:       "pointer",
    fontWeight:   600,
    fontFamily:   "inherit",
};

const inlineLinkStyle: React.CSSProperties = {
    fontSize:     12,
    padding:      0,
    border:       "none",
    background:   "transparent",
    color:        "#2563eb",
    cursor:       "pointer",
    fontFamily:   "inherit",
    textDecoration:"underline",
    textUnderlineOffset: 2,
};
