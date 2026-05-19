// playground/src/settings/groups/sub/PreferencesAppearance.tsx
//
// Preferences → Appearance sub-route. Resurfaces the theme / dark-mode /
// brand-color settings that the Pulse PBI visual exposed but the playground
// UI had no surface for.

import { FieldCard, FieldRow, Toggle } from "../../primitives";
import { asBool, asStr, useGenieSettingsSlice } from "./genieSettingsBridge";
import { SubPageHeader } from "./AiKnowledgeBase";

const THEMES = [
    { id: "default",          label: "Default light",     swatch: "#ffffff", accent: "#2563eb" },
    { id: "corporate-blue",   label: "Corporate Blue",    swatch: "#f0f5ff", accent: "#1e40af" },
    { id: "forest",           label: "Forest (ESG)",      swatch: "#f0fdf4", accent: "#059669" },
    { id: "slate-dark",       label: "Slate Dark",        swatch: "#1e293b", accent: "#60a5fa" },
    { id: "high-contrast",    label: "High Contrast",     swatch: "#000000", accent: "#fbbf24" },
    { id: "custom",           label: "Custom (use brand colors below)", swatch: "#a78bfa", accent: "#7c3aed" },
] as const;

type ThemeId = typeof THEMES[number]["id"];

interface AppearanceState {
    themeName: ThemeId;
    darkMode: boolean;
    useReportTheme: boolean;
    brandAccentColor: string;
    brandTextColor: string;
    brandBgColor: string;
}

function safeParse(s: string): Record<string, unknown> {
    try { const p = JSON.parse(s); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

function asTheme(value: unknown): ThemeId {
    const v = typeof value === "string" ? value : "default";
    return THEMES.some(t => t.id === v) ? (v as ThemeId) : "default";
}

const readSlice = (): AppearanceState => {
    const raw = (typeof window !== "undefined" ? window.localStorage.getItem("pulseplay:visual-settings:genieSettings") : null);
    const obj = raw ? safeParse(raw) : {};
    return {
        themeName: asTheme(obj.themeName),
        darkMode: asBool(obj.darkMode, false),
        useReportTheme: asBool(obj.useReportTheme, false),
        brandAccentColor: asStr(obj.brandAccentColor, "#2563eb"),
        brandTextColor: asStr(obj.brandTextColor, "#0f172a"),
        brandBgColor: asStr(obj.brandBgColor, "#ffffff"),
    };
};

export function PreferencesAppearance(): React.ReactElement {
    const [state, patch] = useGenieSettingsSlice<AppearanceState>(readSlice);
    const isCustom = state.themeName === "custom";

    return (
        <section id="settings-preferences-appearance" aria-labelledby="settings-pref-appearance-title">
            <SubPageHeader
                title="Appearance"
                blurb="Theme, dark-mode override, and brand colors for the embedded Pulse experience. These flow into the same genieSettings store the Pulse PBI sibling uses, so changes are visible in both surfaces."
            />

            <FieldCard
                title="Theme"
                subtitle="Pre-built palettes tuned for common contexts."
                status={{ tone: "info", label: THEMES.find(t => t.id === state.themeName)?.label ?? state.themeName }}
                tip={
                    <>
                        Most teams pick <strong>Corporate Blue</strong> (matches Microsoft / Azure visual language) or <strong>Slate Dark</strong> for ops-center walls. <strong>Forest</strong> is tuned for ESG / sustainability dashboards; <strong>High Contrast</strong> meets WCAG AAA.
                    </>
                }
            >
                <div className="pp-theme-grid" role="radiogroup" aria-label="Theme preset">
                    {THEMES.map(t => {
                        const active = state.themeName === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                className={`pp-theme-card${active ? " pp-theme-card--active" : ""}`}
                                onClick={() => patch({ themeName: t.id })}
                            >
                                <span
                                    className="pp-theme-swatch"
                                    aria-hidden="true"
                                    style={{
                                        background: `linear-gradient(135deg, ${t.swatch} 0%, ${t.accent} 100%)`,
                                    }}
                                />
                                <span className="pp-theme-label">{t.label}</span>
                            </button>
                        );
                    })}
                </div>
            </FieldCard>

            <FieldCard
                title="Mode"
                subtitle="Light / dark override and report-inherited theme."
                tip={
                    <>
                        When PulsePlay is embedded inside a Power BI report, <strong>Use report theme</strong> inherits Power BI's host colors and fonts. Useful when your team has standardised a report-level theme they want everywhere.
                    </>
                }
            >
                <FieldRow
                    label="Dark mode"
                    hint="Forces the dark palette regardless of the theme picked above."
                    tip={<>Dark slate background, light text, accent retained. Recommended when running on ops-center displays or in low-light environments.</>}
                >
                    <Toggle
                        id="appearance-dark-mode"
                        checked={state.darkMode}
                        onChange={v => patch({ darkMode: v })}
                        label={state.darkMode ? "Dark mode on" : "Light mode"}
                    />
                </FieldRow>

                <FieldRow
                    label="Use report theme (Power BI host only)"
                    hint="Inherit colors and fonts from the Power BI report this visual is embedded inside."
                    tip={<>Only meaningful when running inside a Power BI host. PulsePlay-native usage ignores this flag.</>}
                >
                    <Toggle
                        id="appearance-use-report-theme"
                        checked={state.useReportTheme}
                        onChange={v => patch({ useReportTheme: v })}
                        label={state.useReportTheme ? "Inheriting" : "Standalone palette"}
                    />
                </FieldRow>
            </FieldCard>

            <FieldCard
                title="Brand colors"
                subtitle={isCustom ? "Active — the Custom theme uses these values." : "Inactive — only used when the Custom theme is selected above."}
                status={{ tone: isCustom ? "ok" : "neutral", label: isCustom ? "Active" : "Inactive" }}
                tip={
                    <>
                        Hex values applied when the <strong>Custom</strong> theme is selected. The accent color drives buttons, links, and chart series; text/bg drive the surface palette.
                    </>
                }
            >
                <div className="pp-grid-2">
                    <FieldRow
                        label="Accent"
                        hint="Primary action color — buttons, links, chart series 1."
                    >
                        <ColorInput
                            id="brand-accent"
                            value={state.brandAccentColor}
                            onChange={v => patch({ brandAccentColor: v })}
                            disabled={!isCustom}
                        />
                    </FieldRow>
                    <FieldRow
                        label="Text"
                        hint="Primary text on light surfaces."
                    >
                        <ColorInput
                            id="brand-text"
                            value={state.brandTextColor}
                            onChange={v => patch({ brandTextColor: v })}
                            disabled={!isCustom}
                        />
                    </FieldRow>
                    <FieldRow
                        label="Background"
                        hint="Page canvas — the layer everything else sits on top of."
                    >
                        <ColorInput
                            id="brand-bg"
                            value={state.brandBgColor}
                            onChange={v => patch({ brandBgColor: v })}
                            disabled={!isCustom}
                        />
                    </FieldRow>
                </div>
            </FieldCard>
        </section>
    );
}

function ColorInput(props: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }): React.ReactElement {
    return (
        <span className="pp-color-input" style={{ opacity: props.disabled ? 0.5 : 1 }}>
            <input
                id={`${props.id}-swatch`}
                type="color"
                value={props.value}
                onChange={e => props.onChange(e.target.value)}
                disabled={props.disabled}
                aria-label={`${props.id} color picker`}
                className="pp-color-input__swatch"
            />
            <input
                id={props.id}
                type="text"
                value={props.value}
                onChange={e => props.onChange(e.target.value)}
                disabled={props.disabled}
                aria-label={`${props.id} hex value`}
                className="pp-color-input__hex"
                spellCheck={false}
            />
        </span>
    );
}
