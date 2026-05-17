// playground/src/settings/groups/PreferencesGroup.tsx
//
// Phase 2: live controls for UI mode / Visible panels / AI position. BI tile
// count is now read-only here because the canvas obeys the proxy-published
// display policy for controlled enterprise deployments.

import { useSettings } from "../settingsStore";
import type { EnabledComponents, LayoutMode, UiMode } from "../settingsStore";
import { usePulseAiVisualSettings } from "../pulseVisualSettingsStore";
import type { PulseEnabledFeatures } from "../pulseVisualSettingsStore";
import { CurrentValue, Leaf, SubSection } from "./BiGroup";
import {
    LAYOUT_PRESETS,
    LAYOUT_PRESET_ORDER,
    detectActivePreset,
    type LayoutPreset,
} from "../layoutPresets";

export function PreferencesGroup(): React.ReactElement {
    const {
        uiMode,
        enabledComponents,
        layoutMode,
        allowlist,
        setUiMode,
        setEnabledComponents,
        setLayoutMode,
    } = useSettings();
    const { value: pulseSettings, update: updatePulse } = usePulseAiVisualSettings();
    const activePreset = detectActivePreset({
        enabledComponents,
        enabledFeatures: pulseSettings.enabledFeatures,
    });
    const applyPreset = (next: LayoutPreset): void => {
        const cfg = LAYOUT_PRESETS[next];
        setEnabledComponents(cfg.state.enabledComponents);
        setLayoutMode(cfg.state.layoutMode);
        updatePulse({ enabledFeatures: cfg.state.enabledFeatures });
    };
    const backendBiTileMode = normalizeBackendBiTileMode(allowlist?.display?.biTileMode);

    return (
        <section aria-labelledby="settings-preferences-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-preferences-title" style={{ margin: 0, fontSize: 20 }}>Preferences</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    How the playground is laid out — UI mode, visible panels, AI position, canvas tiles.
                </p>
            </header>

            {/* ─── Tier 1: Mode ───────────────────────────────────────── */}
            <SubSection
                label="Mode"
                helper="Choose which AI experience surface runs. Pulse is the rich ported experience; v0 is the lightweight sidebar."
            >
            <Leaf group="preferences" label="UI mode" helper="Pulse is the ported PBI-heritage UI. v0 is the lightweight cycle-C sidebar.">
                <ButtonGroup<UiMode>
                    value={uiMode}
                    onChange={setUiMode}
                    options={[
                        { value: "pulse", label: "Pulse" },
                        { value: "v0", label: "v0" },
                    ]}
                />
            </Leaf>
            </SubSection>

            {/* ─── Tier 2: Layout ─────────────────────────────────────── */}
            <SubSection
                label="Layout"
                helper="Where the AI and BI panes live + which ones are visible. Live-updates immediately."
            >

            {/* 2026-05-17 — Layout preset picker. Maps Rajesh's T1-T5
             *  templates from docs/Proposed_Preset_Templates.pdf to bundles
             *  of (enabledComponents + layoutMode + Pulse enabledFeatures).
             *  Facade over existing state — picking a preset writes through
             *  to the underlying knobs below. Selecting "Custom" is not an
             *  option; "Custom" only shows when the underlying knobs don't
             *  match any preset (user hand-tuned a combination). */}
            <Leaf
                group="preferences"
                label="Layout preset"
                helper={`Pick a starting shape, then fine-tune below if needed. ${LAYOUT_PRESETS[activePreset === "custom" ? "balanced" : activePreset]?.description || ""}`}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div role="group" style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                        {LAYOUT_PRESET_ORDER.map(key => {
                            const cfg = LAYOUT_PRESETS[key];
                            const active = activePreset === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => applyPreset(key)}
                                    aria-pressed={active}
                                    title={cfg.description}
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
                                    {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                    {activePreset === "custom" && (
                        <div style={{ fontSize: 11, opacity: 0.65, fontStyle: "italic" }}>
                            Current settings don't match a preset — you've hand-tuned a combination. Pick a preset above to snap back, or leave as-is.
                        </div>
                    )}
                </div>
            </Leaf>

            <Leaf group="preferences" label="Visible panels" helper="Author choice: which surfaces this PulsePlay instance shows to end users. AI/BI verticals are independent — pick what you've wired up. End users only see what's selected here.">
                <ButtonGroup<EnabledComponents>
                    value={enabledComponents}
                    onChange={setEnabledComponents}
                    options={[
                        { value: "aiOnly", label: "AI only" },
                        { value: "biOnly", label: "BI only" },
                        { value: "both", label: "Both" },
                        { value: "mix", label: "Mix" },
                    ]}
                />
            </Leaf>

            <Leaf group="preferences" label="AI position" helper="Where the AI panel sits relative to the BI canvas. Only applies when both panels are enabled.">
                <ButtonGroup<LayoutMode>
                    value={layoutMode}
                    onChange={setLayoutMode}
                    options={[
                        { value: "ai-left", label: "Left" },
                        { value: "ai-right", label: "Right" },
                        { value: "ai-top", label: "Top" },
                        { value: "ai-bottom", label: "Bottom" },
                    ]}
                />
            </Leaf>
            </SubSection>

            {/* ─── Mix composition (only when Mix is selected) ───────── */}
            {enabledComponents === "mix" && <MixCompositionPanel />}

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

/* ─── Mix composition ──────────────────────────────────────────────────────
 *
 * Visible only when enabledComponents === "mix". Lets the author cherry-pick
 * which AI surfaces render (Insights / Chat / Research Agent traces /
 * managed-agent surface) and which BI composition mode (full canvas /
 * per-tile cherry-pick) to compose a blended deployment.
 *
 * The AI surface picker writes through to the existing Pulse `enabledFeatures`
 * setting (in `pulseplay:visual-settings:genieSettings`) so the cross-link is
 * lossless — toggling here is identical to toggling in Settings → AI →
 * AI Insights.
 *
 * The Research Agent traces toggle writes to `insightsShowResearchTraces` (new
 * field, default true). When true and the response's
 * `attachments[].reasoning_traces` field is populated (set by Databricks Genie
 * when a user starts Agent Mode in the Genie UI — REST API still can't
 * trigger it as of 2026-05), Pulse renders a "Research Agent reasoning"
 * section. We don't trigger Research Agent ourselves; we surface it when
 * present.
 *
 * Per-tile cherry-pick (BI) is a vendor-deep capability deferred to phase 2
 * (Power BI tile embed, Tableau worksheets, Qlik objects, Looker tile-embed).
 */
function MixCompositionPanel(): React.ReactElement {
    const { value: pulseSettings, update: updatePulse } = usePulseAiVisualSettings();
    return (
        <SubSection
            label="Mix composition"
            helper="Cherry-pick which AI surfaces and BI composition modes render. Author choice — end users only see what's checked."
        >
            <Leaf
                group="preferences"
                label="AI surfaces"
                helper="Which AI views to expose. Cross-linked with Settings → AI → AI Insights (changes here update there)."
            >
                <ButtonGroup<PulseEnabledFeatures>
                    value={pulseSettings.enabledFeatures}
                    onChange={(v) => updatePulse({ enabledFeatures: v })}
                    options={[
                        { value: "both", label: "Insights + Ask Pulse" },
                        { value: "insightsOnly", label: "Insights only" },
                        { value: "chatOnly", label: "Ask Pulse only" },
                    ]}
                />
            </Leaf>

            <Leaf
                group="preferences"
                label="Research Agent traces"
                helper="When Genie's Agent Mode runs on a message (started in the Databricks Genie UI), render its reasoning trace as a separate section. PulsePlay does not start Agent Mode itself — Databricks' REST API doesn't expose that trigger — but we surface the trace when it's present in the message response (new Genie field, 2026-04-16)."
            >
                <ButtonGroup<"on" | "off">
                    value={pulseSettings.insightsShowResearchTraces ? "on" : "off"}
                    onChange={(v) => updatePulse({ insightsShowResearchTraces: v === "on" })}
                    options={[
                        { value: "on",  label: "Show when present" },
                        { value: "off", label: "Hide" },
                    ]}
                />
            </Leaf>

            <Leaf
                group="preferences"
                label="Managed agent surface"
                helper="(Coming next cycle — wires Mosaic AI ResponsesAgent serving endpoints as a dedicated agentic pane. Distinct from the existing Supervisor connector template.)"
            >
                <div style={{ display: "inline-flex", gap: 4 }}>
                    <button type="button" disabled style={{ padding: "6px 12px", fontSize: 12, opacity: 0.5, cursor: "not-allowed" }}>
                        Available when ResponsesAgent connector is configured
                    </button>
                </div>
            </Leaf>

            <Leaf
                group="preferences"
                label="BI composition"
                helper="How BI surfaces render in Mix mode. Per-tile cherry-pick (selecting specific Power BI tiles / Tableau worksheets / Qlik objects / Looker tiles) requires vendor-SDK work and lands in the next cycle."
            >
                <ButtonGroup<"full" | "tiles">
                    value="full"
                    onChange={() => {/* tiles option is disabled */}}
                    options={[
                        { value: "full",  label: "Full canvas" },
                        { value: "tiles", label: "Per-tile cherry-pick (coming next cycle)" },
                    ]}
                />
            </Leaf>
        </SubSection>
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
