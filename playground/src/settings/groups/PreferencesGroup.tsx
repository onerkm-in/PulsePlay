// playground/src/settings/groups/PreferencesGroup.tsx
//
// Phase 2: live controls for UI mode / Visible panels / AI position. BI tile
// count is now read-only here because the canvas obeys the proxy-published
// display policy for controlled enterprise deployments.

import { useSettings, enabledTabCount, type TabVisibility, type DefaultLandingSurface } from "../settingsStore";
import { CurrentValue, Leaf, SubSection } from "./BiGroup";

export function PreferencesGroup(): React.ReactElement {
    const {
        allowlist,
        defaultLandingSurface,
        tabVisibility,
        setDefaultLandingSurface,
        setTabVisibility,
    } = useSettings();
    const backendBiTileMode = normalizeBackendBiTileMode(allowlist?.display?.biTileMode);
    const enabledCount = enabledTabCount(tabVisibility);

    const toggleTab = (tab: keyof TabVisibility): void => {
        const next: TabVisibility = { ...tabVisibility, [tab]: !tabVisibility[tab] };
        if (enabledTabCount(next) === 0) return; // store refuses; bail before persist
        setTabVisibility(next);
    };

    // Default landing tab options are filtered to the currently-enabled tabs.
    const landingOptions = [
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
                    How the playground looks — theme, density, layout, AI position, canvas tiles.
                </p>
            </header>

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
