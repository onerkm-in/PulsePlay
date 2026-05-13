// playground/src/settings/groups/PreferencesGroup.tsx
//
// Phase 2: live controls for UI mode / Visible panels / AI position / BI
// tiles already wired (they're the simplest end-to-end check that the
// store + display-change event bus works correctly).

import { useSettings } from "../settingsStore";
import type { BiTileMode, EnabledComponents, LayoutMode, UiMode } from "../settingsStore";
import { Leaf } from "./BiGroup";

export function PreferencesGroup(): React.ReactElement {
    const {
        uiMode,
        enabledComponents,
        layoutMode,
        biTileMode,
        setUiMode,
        setEnabledComponents,
        setLayoutMode,
        setBiTileMode,
    } = useSettings();

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

            <Leaf group="preferences" label="Canvas tiles" helper="How many BI frames render in the BI pane. v1 shares one embed config across all tiles.">
                <ButtonGroup<BiTileMode>
                    value={biTileMode}
                    onChange={setBiTileMode}
                    options={[
                        { value: "1", label: "1" },
                        { value: "2", label: "2" },
                        { value: "4", label: "4" },
                    ]}
                />
            </Leaf>
        </section>
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
