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

const GENIE_SETTINGS_KEY = "pulseplay:visual-settings:genieSettings";
const VISUAL_SETTINGS_EVENT = "pulseplay:visual-settings-change";

function readDarkMode(): boolean {
    try {
        const raw = window.localStorage.getItem(GENIE_SETTINGS_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed && typeof parsed === "object" && parsed.darkMode);
    } catch {
        return false;
    }
}

/** Set `data-pp-theme` on the document root from the current darkMode flag. */
export function applyPpTheme(): void {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.ppTheme = readDarkMode() ? "dark" : "light";
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
