// playground/src/settings/groups/PreferencesGroup.tsx
//
// Phase 2: live controls for UI mode / Visible panels / AI position. BI tile
// count is now read-only here because the canvas obeys the proxy-published
// display policy for controlled enterprise deployments.

import { useState } from "react";
import { useSettings, enabledTabCount, type TabVisibility, type DefaultLandingSurface } from "../settingsStore";
import { CurrentValue, Leaf, SubSection } from "./BiGroup";
import { usePulseAiVisualSettings } from "../pulseVisualSettingsStore";
import {
    useExperienceMode,
    setPreviewMode,
    publishExperienceMode,
    type PulsePlayExperienceMode,
} from "../../experience/experienceMode";
import {
    WORKBENCH_TEMPLATES,
    applyWorkbenchTemplate,
    detectActiveWorkbenchTemplate,
    type WorkbenchTemplate,
} from "../workbenchTemplates";

export function PreferencesGroup(): React.ReactElement {
    const {
        allowlist,
        defaultLandingSurface,
        tabVisibility,
        setDefaultLandingSurface,
        setTabVisibility,
    } = useSettings();
    const pulseAi = usePulseAiVisualSettings();
    const backendBiTileMode = normalizeBackendBiTileMode(allowlist?.display?.biTileMode);
    const enabledCount = enabledTabCount(tabVisibility);

    const activeTemplate = detectActiveWorkbenchTemplate({
        tabVisibility,
        defaultLanding: defaultLandingSurface,
        enabledFeatures: pulseAi.value.enabledFeatures,
    });
    const applyTemplate = (t: WorkbenchTemplate): void => {
        applyWorkbenchTemplate(t, { setTabVisibility, setDefaultLandingSurface });
    };

    const toggleTab = (tab: keyof TabVisibility): void => {
        const next: TabVisibility = { ...tabVisibility, [tab]: !tabVisibility[tab] };
        if (enabledTabCount(next) === 0) return; // store refuses; bail before persist
        setTabVisibility(next);
    };

    // Default landing tab options are filtered to the currently-enabled tabs.
    const landingOptions = [
        // Decisions has no per-tab visibility flag (it is governed by whether
        // the AI pane is on at all), so it is always offered here. It is also
        // the shipped default — see DEFAULT_LANDING_SURFACE.
        { value: "action-insights" as const, label: "Decisions", enabled: true },
        { value: "ai-insights" as const, label: "AI Insights", enabled: tabVisibility.aiInsights },
        { value: "ask-pulse" as const,   label: "Ask Pulse",   enabled: tabVisibility.askPulse },
        { value: "bi-viz" as const,      label: "Dashboard",   enabled: tabVisibility.dashboard },
    ].filter(o => o.enabled);

    return (
        <section aria-labelledby="settings-preferences-title">
            <header style={{ marginBottom: 20 }}>
                {/* UX-ARCH-0B.2 follow-up 2026-05-23 — h2 + intro visually
                    hidden. Rail + page chrome already identify the group. */}
                <h2 id="settings-preferences-title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Display</h2>
                <p style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    PulsePlay shell — tab visibility, default landing, display policy.
                </p>
            </header>

            {/* ─── Interface type (author-only master control) ───────── */}
            <SubSection
                label="Interface type"
                helper="Which shell PulsePlay serves. Segregated screens is the existing multi-surface navigation (the default and fail-safe). Combined Decision Canvas is the single-workspace experience. Author-only: end users get whatever you publish and cannot override it. Preview a mode privately before you publish it to everyone."
            >
            <Leaf
                group="preferences"
                label="Interface type"
                helper="Segregated keeps the existing screens; Combined serves My Decision Canvas. Publishing changes only the presentation — no user or application data is deleted, and switching back is an immediate rollback."
            >
                <InterfaceModeControl />
            </Leaf>
            </SubSection>

            {/* ─── Workbench template (author-only master control) ───── */}
            <SubSection
                label="Workbench template"
                helper="Named, author-only configurations of the Workbench. Picking one sets the visible tabs, the default landing tab, the AI feature scope, and (for some) a starting AI Insights section preset in a single click. End users never see this picker — they just get whatever you choose. The individual controls below stay editable, so you can pick a template then fine-tune."
            >
            <Leaf
                group="preferences"
                label="Workbench template"
                helper="Apply a template to set tabs + landing + scope + section preset at once. After applying you can still adjust any of the controls below; doing so moves the indicator to “Custom”."
            >
                <div role="radiogroup" aria-label="Workbench templates" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {WORKBENCH_TEMPLATES.map(t => {
                        const active = activeTemplate === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => applyTemplate(t)}
                                style={{
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: active
                                        ? "1px solid var(--pp-accent, #0078d4)"
                                        : "1px solid var(--pp-border-subtle, #e4e9ef)",
                                    background: active ? "rgba(0,120,212,0.06)" : "transparent",
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 3,
                                }}
                            >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                                            border: active ? "4px solid var(--pp-accent, #0078d4)" : "2px solid var(--pp-border, #b8c2cc)",
                                            boxSizing: "border-box",
                                        }}
                                    />
                                    {t.label}
                                    {active && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--pp-accent, #0078d4)" }}>· current</span>}
                                </span>
                                <span style={{ fontSize: 11.5, color: "var(--pp-text-muted, #64748b)", lineHeight: 1.45, marginLeft: 20 }}>
                                    {t.description}
                                </span>
                            </button>
                        );
                    })}
                    {activeTemplate === "custom" && (
                        <div style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--pp-text-muted, #64748b)", padding: "2px 4px" }}>
                            Custom — the current tabs / landing / scope don’t match any template. Pick one above to reset, or leave as-is.
                        </div>
                    )}
                </div>
            </Leaf>
            </SubSection>

            {/* ─── Tab visibility (the one canonical layout control) ─── */}
            <SubSection
                label="Tabs"
                helper="The PulsePlay shell has 3 tabs (AI Insights / Ask Pulse / Dashboard). Show only the ones your deployment needs — disabled tabs are hidden from the strip. When only one tab is enabled, the strip collapses and that tab becomes the main page."
            >

            <Leaf
                group="preferences"
                label="Visible tabs"
                helper="Per-tab on/off. At least one tab must stay enabled. Detach + dock works on every enabled tab — that's how you compare any tab with any other (or with itself)."
            >
                <div role="group" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <TabVisibilityCheckbox label="AI Insights" checked={tabVisibility.aiInsights} disabled={enabledCount === 1 && tabVisibility.aiInsights} onChange={() => toggleTab("aiInsights")} />
                    <TabVisibilityCheckbox label="Ask Pulse"   checked={tabVisibility.askPulse}   disabled={enabledCount === 1 && tabVisibility.askPulse}   onChange={() => toggleTab("askPulse")} />
                    <TabVisibilityCheckbox label="Dashboard"   checked={tabVisibility.dashboard}  disabled={enabledCount === 1 && tabVisibility.dashboard}  onChange={() => toggleTab("dashboard")} />
                    {enabledCount === 1 && (
                        <div style={{ fontSize: 11, opacity: 0.65, fontStyle: "italic" }}>
                            Only one tab enabled — the tab strip is hidden and this tab is the main page. Enable another tab to bring the strip back.
                        </div>
                    )}
                </div>
            </Leaf>

            {/* 2026-05-22 — author-configurable default landing tab.
             *  Options are filtered to currently-enabled tabs only — picking
             *  a disabled tab as the landing surface would be confusing.
             *  Priority in App.tsx readInitialActiveSurface:
             *    URL ?surface= > this setting > localStorage > "ai-insights". */}
            <Leaf
                group="preferences"
                label="Default landing tab"
                helper="Which enabled tab a fresh visitor sees on first load. URL ?surface= still overrides; localStorage stickiness is bypassed in favor of this author choice. Options reflect only currently-enabled tabs above."
            >
                <ButtonGroup<DefaultLandingSurface>
                    value={defaultLandingSurface && landingOptions.some(o => o.value === defaultLandingSurface)
                        ? defaultLandingSurface
                        : (landingOptions[0]?.value ?? "ai-insights")}
                    onChange={setDefaultLandingSurface}
                    options={landingOptions.map(o => ({ value: o.value, label: o.label }))}
                />
            </Leaf>
            </SubSection>

            {/* ─── Ask Pulse (author-only) ────────────────────────────── */}
            <SubSection
                label="Ask Pulse"
                helper="Author controls for the Ask Pulse tab."
            >
            <Leaf
                group="preferences"
                label="Ask Pulse history button"
                helper="Show the 'Show history' button on the Ask Pulse surface. Default OFF (hidden) to keep the surface clean."
            >
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={pulseAi.value.showHistoryButton}
                        onChange={e => pulseAi.update({ showHistoryButton: e.target.checked })}
                        style={{ margin: 0 }}
                    />
                    <span style={{ fontSize: 13 }}>Show the &ldquo;Show history&rdquo; button in chat</span>
                </label>
                <p style={{ fontSize: 11, opacity: 0.65, margin: "6px 0 0" }}>
                    Default OFF (hidden). When ON, end users can open their saved conversation history from the chat surface.
                </p>
            </Leaf>
            </SubSection>

            {/* ─── Tier 3: Display policy ─────────────────────────────── */}
            <SubSection
                label="Display policy"
                helper="Read-only canvas policy — set by your admin in the proxy allowlist."
            >
            <Leaf group="preferences" label="Canvas tiles" helper="How many BI frames render in the BI pane. Managed by backend display policy, not a viewer toolbar.">
                <CurrentValue label="Backend tile mode">{backendBiTileMode}</CurrentValue>
                <p style={{ fontSize: 11, opacity: 0.65, margin: 0 }}>
                    Set by <code>proxy/config.json</code> <code>allowlist.display.biTileMode</code>. Use 1 for the normal viewer experience; 2 or 4 only for governed comparison deployments.
                </p>
            </Leaf>
            </SubSection>
        </section>
    );
}

const MODE_LABEL: Record<PulsePlayExperienceMode, string> = {
    segregated: "Segregated screens",
    cockpit: "Cockpit (single canvas)",
    combined: "Combined (cockpit + screens)",
};

const MODE_DESC: Record<PulsePlayExperienceMode, string> = {
    segregated: "Top-tab navigation across the separate screens (Decisions, AI Insights, Ask Pulse, Dashboard). Default + fallback.",
    cockpit: "The My Decision Canvas single interface — everything on one plate, no cross-screen navigation.",
    combined: "The cockpit plus the top-tab nav — lands on the cockpit, can jump to any individual screen.",
};

/** Author-only control for the published interface mode. Preview is local to
 *  this browser session; Publish is server-governed + audited + versioned. */
function InterfaceModeControl(): React.ReactElement {
    const { servedMode, publishedMode, previewMode, version, killSwitch, loading, refresh } = useExperienceMode();
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const onPreview = (mode: PulsePlayExperienceMode | null) => {
        setPreviewMode(mode);
        setMsg(mode ? `Previewing ${MODE_LABEL[mode]} (only you see this).` : "Preview cleared.");
    };
    const onPublish = async (mode: PulsePlayExperienceMode) => {
        setBusy(true); setMsg(null);
        try {
            await publishExperienceMode(mode, version);
            setPreviewMode(null);
            refresh();
            setMsg(`Published ${MODE_LABEL[mode]} to all users.`);
        } catch (e) {
            setMsg((e as Error).message || "Publish failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
                Published: <strong>{loading ? "…" : MODE_LABEL[publishedMode]}</strong>
                {" · "}served: <strong>{MODE_LABEL[servedMode]}</strong>
                {" · v"}{version}
                {killSwitch && <span style={{ color: "var(--pp-warning, #d97706)" }}> · kill switch forcing segregated</span>}
                {previewMode && <span style={{ color: "var(--pp-accent, #5980a6)" }}> · previewing {MODE_LABEL[previewMode]}</span>}
            </div>

            {(["segregated", "cockpit", "combined"] as PulsePlayExperienceMode[]).map((mode) => (
                <div key={mode} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    border: "1px solid var(--pp-border, rgba(128,128,128,0.28))",
                    borderRadius: "var(--pp-radius, 4px)", padding: "9px 11px",
                    background: publishedMode === mode ? "var(--pp-accent-soft, rgba(89,128,166,0.10))" : "transparent",
                }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{MODE_LABEL[mode]}</div>
                        <div style={{ fontSize: 11, opacity: 0.65 }}>
                            {MODE_DESC[mode]}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                        <button
                            onClick={() => onPreview(previewMode === mode ? null : mode)}
                            disabled={busy}
                            style={ghostBtn}
                        >{previewMode === mode ? "Exit preview" : "Preview"}</button>
                        <button
                            onClick={() => onPublish(mode)}
                            disabled={busy || publishedMode === mode}
                            style={{ ...primaryBtn, opacity: (busy || publishedMode === mode) ? 0.5 : 1 }}
                        >{publishedMode === mode ? "Published" : "Publish"}</button>
                    </div>
                </div>
            ))}

            {msg && <p style={{ fontSize: 11.5, margin: "2px 0 0", opacity: 0.8 }}>{msg}</p>}
            <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
                Combined mode is a first vertical slice: the Action Inbox is live and governed; My Canvas,
                Saved Items, and Suggestions arrive in later phases. Segregated screens remain fully intact.
            </p>
        </div>
    );
}

const ghostBtn: React.CSSProperties = {
    padding: "6px 11px", borderRadius: "var(--pp-radius, 4px)", cursor: "pointer", fontSize: 12,
    border: "1px solid var(--pp-border-strong, rgba(128,128,128,0.35))", background: "transparent", color: "inherit",
};
const primaryBtn: React.CSSProperties = {
    padding: "6px 11px", borderRadius: "var(--pp-radius, 4px)", cursor: "pointer", fontSize: 12, fontWeight: 600,
    border: "none", background: "var(--pp-accent, #5980a6)", color: "var(--pp-bg, #fff)",
};

function normalizeBackendBiTileMode(value: unknown): "1" | "2" | "4" {
    const asString = String(value ?? "").trim();
    return asString === "2" || asString === "4" ? asString : "1";
}

/* MixCompositionPanel REMOVED 2026-05-25 in favor of per-tab-visibility model.
 * The old controls inside (AI surfaces / Research Agent traces / Managed
 * agent / BI composition) are tracked for relocation to Settings → AI →
 * AI Insights in a follow-up commit. The underlying Pulse `enabledFeatures`
 * field stays in pulseVisualSettingsStore — only the user-facing toggle is
 * gone; defaults persist. */

interface TabVisibilityCheckboxProps {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
}

function TabVisibilityCheckbox(props: TabVisibilityCheckboxProps): React.ReactElement {
    return (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: props.disabled ? "not-allowed" : "pointer", opacity: props.disabled ? 0.6 : 1 }}>
            <input
                type="checkbox"
                checked={props.checked}
                disabled={props.disabled}
                onChange={props.onChange}
                style={{ margin: 0 }}
            />
            <span style={{ fontSize: 13 }}>{props.label}</span>
            {props.disabled && <span style={{ fontSize: 11, opacity: 0.7, fontStyle: "italic" }}>(last enabled — can't disable)</span>}
        </label>
    );
}

interface ButtonGroupProps<T extends string> {
    value: T;
    onChange: (next: T) => void;
    options: Array<{ value: T; label: string }>;
}

function ButtonGroup<T extends string>(props: ButtonGroupProps<T>): React.ReactElement {
    return (
        <div role="group" style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {props.options.map(opt => {
                const active = opt.value === props.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => props.onChange(opt.value)}
                        aria-pressed={active}
                        style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                            background: active ? "var(--pp-accent, #0078d4)" : "transparent",
                            color: active ? "white" : "inherit",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontWeight: active ? 600 : 400,
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
