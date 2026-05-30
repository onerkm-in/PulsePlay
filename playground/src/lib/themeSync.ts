// playground/src/lib/themeSync.ts
//
// Syncs the PulsePlay-native theme attribute on <html> from the genieSettings
// `darkMode` flag (the toggle in Settings → Display → Appearance, written via
// genieSettingsBridge). When dark, `<html data-pp-theme="dark">` flips every
// `--pp-*` color token (styles.css) so the native surfaces — Settings, app
// shell, the v0 Chat surface — go dark coherently with the Workbench's
// `gn-shell--dark` (which is driven from the same darkMode flag, but via the
// gn-* vocabulary). One flag, both vocabularies.
//
// Initialised once at app entry (main.tsx) so it applies on every route +
// surface, independent of the React render tree. Listens for the in-tab
// settings-change event + cross-tab storage so toggling re-themes live.

import { applyThemeTokens, resolveThemeTokens, isDarkTheme, type AppearanceSettingsLike } from "../pulse/themeConfig";

const GENIE_SETTINGS_KEY = "pulseplay:visual-settings:genieSettings";
const VISUAL_SETTINGS_EVENT = "pulseplay:visual-settings-change";

function readAppearance(): AppearanceSettingsLike {
    try {
        const raw = window.localStorage.getItem(GENIE_SETTINGS_KEY);
        if (!raw) return {};
        const p = JSON.parse(raw);
        return (p && typeof p === "object") ? p : {};
    } catch {
        return {};
    }
}

/** Reflect the active theme on the document root: the dark light/dark attribute
 *  (drives the component-level dark CSS) PLUS the resolved theme tokens written
 *  to both `--gn-*` and `--pp-*` so a preset/custom theme re-skins the WHOLE app
 *  (workbench + native surfaces), not just the workbench. */
export function applyPpTheme(): void {
    if (typeof document === "undefined") return;
    const s = readAppearance();
    const tokens = resolveThemeTokens(s);
    // A dark-luminance PRESET (e.g. slate-dark) implies dark mode even with the
    // toggle off — otherwise its dark surfaces would render with light-mode
    // text tokens. Treat it as dark for the native surfaces + token set.
    const dark = !!s.darkMode || isDarkTheme(tokens);
    document.documentElement.dataset.ppTheme = dark ? "dark" : "light";
    try {
        applyThemeTokens(tokens, { dark });
    } catch {
        /* never let theming break boot */
    }
}

/** Install the theme sync. Idempotent-ish — safe to call once at entry. */
export function initThemeSync(): void {
    if (typeof window === "undefined") return;
    applyPpTheme();
    window.addEventListener(VISUAL_SETTINGS_EVENT, applyPpTheme);
    window.addEventListener("storage", (e: StorageEvent) => {
        if (!e.key || e.key === GENIE_SETTINGS_KEY) applyPpTheme();
    });
}
