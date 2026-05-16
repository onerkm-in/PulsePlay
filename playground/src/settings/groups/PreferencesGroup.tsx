// playground/src/settings/groups/PreferencesGroup.tsx
//
// Phase 2: live controls for UI mode / Visible panels / AI position. BI tile
// count is now read-only here because the canvas obeys the proxy-published
// display policy for controlled enterprise deployments.

import { useSettings } from "../settingsStore";
import type { EnabledComponents, LayoutMode, UiMode } from "../settingsStore";
import { CurrentValue, Leaf } from "./BiGroup";

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
    const backendBiTileMode = normalizeBackendBiTileMode(allowlist?.display?.biTileMode);

    return (
        <section aria-labelledby="settings-preferences-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-preferences-title" style={{ margin: 0, fontSize: 20 }}>Preferences</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    How the playground is laid out — UI mode, visible panels, AI position, canvas tiles.
                </p>
            </header>

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

            <Leaf group="preferences" label="Visible panels" helper="Which surfaces this PulsePlay instance shows.">
                <ButtonGroup<EnabledComponents>
                    value={enabledComponents}
                    onChange={setEnabledComponents}
                    options={[
                        { value: "aiOnly", label: "AI only" },
                        { value: "biOnly", label: "BI only" },
                        { value: "both", label: "Both" },
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

            <Leaf group="preferences" label="Canvas tiles" helper="How many BI frames render in the BI pane. Managed by backend display policy, not a viewer toolbar.">
                <CurrentValue label="Backend tile mode">{backendBiTileMode}</CurrentValue>
                <p style={{ fontSize: 11, opacity: 0.65, margin: 0 }}>
                    Set by <code>proxy/config.json</code> <code>allowlist.display.biTileMode</code>. Use 1 for the normal viewer experience; 2 or 4 only for governed comparison deployments.
                </p>
            </Leaf>
        </section>
    );
}

function normalizeBackendBiTileMode(value: unknown): "1" | "2" | "4" {
    const asString = String(value ?? "").trim();
    return asString === "2" || asString === "4" ? asString : "1";
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
