/**
 * themeConfig.ts
 *
 * Adaptive progressive theming for the Pulse assistant visual.
 *
 * Architecture:
 *  - ThemeTokens: the full set of CSS custom properties the LESS file consumes
 *  - BUILT_IN_THEMES: 6 preset themes teams can select from the format pane
 *  - applyTheme(): injects tokens as inline CSS vars on the shell element
 *  - buildThemeStyle(): returns a React CSSProperties object for the shell div
 *
 * How org teams customise:
 *  1. Pick a built-in theme as a base (format-pane dropdown)
 *  2. Override individual brand colours (format-pane colour pickers)
 *  3. The visual merges base + overrides → single CSS vars object
 *
 * LESS side: all colour/radius/shadow values reference var(--gn-*) so the
 * entire visual re-skins from a single object injected on the root element.
 */

export interface ThemeTokens {
    // Surface colours
    bg:             string;
    surface:        string;
    surfaceRaised:  string;
    // Borders
    border:         string;
    borderSubtle:   string;
    // Text
    text:           string;
    textMuted:      string;
    // Accent (primary interactive colour)
    accent:         string;
    accentSubtle:   string;
    accentBorder:   string;
    userBubble:     string;
    // Semantic
    success:        string;
    warning:        string;
    error:          string;
    // Typography
    fontFamily:     string;
    // Geometry
    radius:         string;
    radiusSm:       string;
}

export type ThemeName =
    | "default"
    | "corporate-blue"
    | "forest"
    | "slate-dark"
    | "high-contrast"
    | "custom";

// ─── Built-in themes ──────────────────────────────────────────────────────────

export const BUILT_IN_THEMES: Record<ThemeName, ThemeTokens> = {

    /** Default — clean GitHub-inspired light theme */
    "default": {
        bg:            "#f3f5f8",
        surface:       "#ffffff",
        surfaceRaised: "#ffffff",
        border:        "#d0d7de",
        borderSubtle:  "#e4e9ef",
        text:          "#1a1f24",
        textMuted:     "#5d6673",
        accent:        "#1a6fd4",
        accentSubtle:  "rgba(26,111,212,0.09)",
        accentBorder:  "rgba(26,111,212,0.38)",
        userBubble:    "#1a6fd4",
        success:       "#1a7f37",
        warning:       "#8a5c00",
        error:         "#c8202a",
        fontFamily:    '"Segoe UI", -apple-system, system-ui, sans-serif',
        radius:        "12px",
        radiusSm:      "8px"
    },

    /** Corporate Blue — Microsoft/enterprise palette */
    "corporate-blue": {
        bg:            "#f0f4f9",
        surface:       "#ffffff",
        surfaceRaised: "#f7f9fc",
        border:        "#c8d4e3",
        borderSubtle:  "#dde6f0",
        text:          "#1b2a3b",
        textMuted:     "#4f6070",
        accent:        "#0f5ea8",
        accentSubtle:  "rgba(15,94,168,0.09)",
        accentBorder:  "rgba(15,94,168,0.35)",
        userBubble:    "#0f5ea8",
        success:       "#107c10",
        warning:       "#7a5300",
        error:         "#a4262c",
        fontFamily:    '"Segoe UI", "Calibri", -apple-system, sans-serif',
        radius:        "8px",
        radiusSm:      "6px"
    },

    /** Forest — green-accent neutral for sustainability / ESG dashboards */
    "forest": {
        bg:            "#f2f5f2",
        surface:       "#ffffff",
        surfaceRaised: "#f8faf8",
        border:        "#c6d4c6",
        borderSubtle:  "#ddeadd",
        text:          "#1c2b1c",
        textMuted:     "#4e634e",
        accent:        "#1e7e34",
        accentSubtle:  "rgba(30,126,52,0.09)",
        accentBorder:  "rgba(30,126,52,0.35)",
        userBubble:    "#1e7e34",
        success:       "#1a6b2a",
        warning:       "#7a5c00",
        error:         "#b91c1c",
        fontFamily:    '"Segoe UI", -apple-system, system-ui, sans-serif',
        radius:        "14px",
        radiusSm:      "10px"
    },

    /** Slate Dark — true dark theme for NOC / ops centres */
    "slate-dark": {
        bg:            "#0d1117",
        surface:       "#161b22",
        surfaceRaised: "#1c2128",
        border:        "#2d333b",
        borderSubtle:  "#21262d",
        text:          "#e2eaf4",
        textMuted:     "#8b949e",
        accent:        "#4b9cf5",
        accentSubtle:  "rgba(75,156,245,0.13)",
        accentBorder:  "rgba(75,156,245,0.42)",
        userBubble:    "#1b6b4a",
        success:       "#3fb950",
        warning:       "#d29922",
        error:         "#f85149",
        fontFamily:    '"Segoe UI", -apple-system, system-ui, sans-serif',
        radius:        "12px",
        radiusSm:      "8px"
    },

    /** High Contrast — WCAG AAA accessible, black/white with bold accent */
    "high-contrast": {
        bg:            "#ffffff",
        surface:       "#ffffff",
        surfaceRaised: "#f5f5f5",
        border:        "#000000",
        borderSubtle:  "#555555",
        text:          "#000000",
        textMuted:     "#333333",
        accent:        "#0000cc",
        accentSubtle:  "rgba(0,0,204,0.1)",
        accentBorder:  "rgba(0,0,204,0.6)",
        userBubble:    "#0000cc",
        success:       "#006600",
        warning:       "#cc6600",
        error:         "#cc0000",
        fontFamily:    '"Segoe UI", -apple-system, system-ui, sans-serif',
        radius:        "4px",
        radiusSm:      "2px"
    },

    /** Custom — all tokens start as default; overridden by format-pane pickers */
    "custom": {
        bg:            "#f3f5f8",
        surface:       "#ffffff",
        surfaceRaised: "#ffffff",
        border:        "#d0d7de",
        borderSubtle:  "#e4e9ef",
        text:          "#1a1f24",
        textMuted:     "#5d6673",
        accent:        "#1a6fd4",
        accentSubtle:  "rgba(26,111,212,0.09)",
        accentBorder:  "rgba(26,111,212,0.38)",
        userBubble:    "#1a6fd4",
        success:       "#1a7f37",
        warning:       "#8a5c00",
        error:         "#c8202a",
        fontFamily:    '"Segoe UI", -apple-system, system-ui, sans-serif',
        radius:        "12px",
        radiusSm:      "8px"
    }
};

// ─── Theme merging ────────────────────────────────────────────────────────────

/**
 * Merge a base theme with partial custom overrides from the format pane.
 * Only truthy override values are applied.
 */
export function mergeTheme(
    baseName: ThemeName,
    overrides: Partial<ThemeTokens>
): ThemeTokens {
    const base = { ...BUILT_IN_THEMES[baseName] };
    for (const key of Object.keys(overrides) as (keyof ThemeTokens)[]) {
        const val = overrides[key];
        if (val && val.trim()) base[key] = val;
    }
    return base;
}

// ─── CSS variable injection ───────────────────────────────────────────────────

/**
 * Convert a ThemeTokens object into a React CSSProperties map using
 * CSS custom properties. The LESS file references these via var(--gn-*).
 *
 * Applied as style={{ ...buildThemeStyle(tokens) }} on .gn-shell.
 */
export function buildThemeStyle(tokens: ThemeTokens): React.CSSProperties {
    return {
        "--gn-bg":             tokens.bg,
        "--gn-surface":        tokens.surface,
        "--gn-surface-raised": tokens.surfaceRaised,
        "--gn-border":         tokens.border,
        "--gn-border-subtle":  tokens.borderSubtle,
        "--gn-text":           tokens.text,
        "--gn-text-muted":     tokens.textMuted,
        "--gn-accent":         tokens.accent,
        "--gn-accent-subtle":  tokens.accentSubtle,
        "--gn-accent-border":  tokens.accentBorder,
        "--gn-user-bubble":    tokens.userBubble,
        "--gn-success":        tokens.success,
        "--gn-warning":        tokens.warning,
        "--gn-error":          tokens.error,
        "--gn-font":           tokens.fontFamily,
        "--gn-radius":         tokens.radius,
        "--gn-radius-sm":      tokens.radiusSm,
    } as React.CSSProperties;
}

// ─── Whole-app theme application (Step 1: unify --gn-* and --pp-*) ────────────
//
// The workbench consumes `--gn-*`; the native surfaces (Settings, app shell,
// the v0 Chat surface) consume a separate `--pp-*` set. Before this, a theme
// preset only re-skinned the workbench. `applyThemeTokens` writes ONE resolved
// theme to BOTH vocabularies on :root so a preset/custom theme re-skins the
// entire app. Dark mode stays class/attribute-driven (.gn-shell--dark /
// data-pp-theme) because those control component-level overrides beyond the
// core tokens — so in dark we apply only the accent (safe in both modes) and
// let the tuned dark CSS own surfaces/text/borders.

export interface AppearanceSettingsLike {
    themeName?: string;
    darkMode?: boolean;
    useReportTheme?: boolean;
    brandAccentColor?: string;
    brandTextColor?: string;
    brandBgColor?: string;
    brandFontFamily?: string;
}

/** Resolve the active ThemeTokens from appearance settings. Brand-color
 *  overrides apply ONLY under the "custom" theme (mirrors the Settings UI,
 *  which disables the brand inputs otherwise) so the presets stay distinct
 *  instead of all collapsing onto the stored brand accent. */
export function resolveThemeTokens(s: AppearanceSettingsLike): ThemeTokens {
    const name = (s.themeName || "default") as ThemeName;
    const base: ThemeName = BUILT_IN_THEMES[name] ? name : "default";
    if (base === "custom") {
        return mergeTheme("custom", {
            accent: s.brandAccentColor,
            text: s.brandTextColor,
            bg: s.brandBgColor,
            fontFamily: s.brandFontFamily,
        });
    }
    return { ...BUILT_IN_THEMES[base] };
}

function hexToRgb(hex: string): [number, number, number] | null {
    if (typeof hex !== "string") return null;
    const b = hex.trim().replace("#", "");
    const full = b.length === 3 ? b.split("").map(c => c + c).join("") : b;
    if (full.length !== 6) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const bl = parseInt(full.slice(4, 6), 16);
    return [r, g, bl].some(Number.isNaN) ? null : [r, g, bl];
}
function rgbaOf(hex: string, alpha: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0, Math.min(1, alpha))})`;
}
function darkenHex(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const f = Math.max(0, Math.min(1, 1 - amount));
    const ch = (n: number) => Math.round(n * f).toString(16).padStart(2, "0");
    return `#${ch(rgb[0])}${ch(rgb[1])}${ch(rgb[2])}`;
}

/** Every CSS custom property `applyThemeTokens` may set — used to clear stale
 *  values when switching themes/modes so nothing lingers. */
export const APP_THEME_MANAGED_VARS: readonly string[] = [
    // workbench (--gn-*)
    "--gn-bg", "--gn-surface", "--gn-surface-raised", "--gn-border", "--gn-border-subtle",
    "--gn-text", "--gn-text-muted", "--gn-accent", "--gn-accent-subtle", "--gn-accent-border",
    "--gn-user-bubble", "--gn-success", "--gn-warning", "--gn-error", "--gn-font",
    "--gn-radius", "--gn-radius-sm",
    // native surfaces (--pp-*)
    "--pp-bg", "--pp-surface", "--pp-surface-raised", "--pp-text", "--pp-fg", "--pp-text-muted",
    "--pp-border", "--pp-border-subtle", "--pp-accent", "--pp-accent-hover", "--pp-accent-soft",
    "--pp-accent-border", "--pp-success", "--pp-warning", "--pp-error",
];

/** Build the CSS-variable map for the whole app from a resolved theme.
 *  In dark mode we emit the accent (from the active theme) PLUS dark-canonical
 *  text/muted/semantic tokens — NOT surfaces/borders, which stay owned by the
 *  tuned dark CSS. The text tokens matter because some chrome (e.g. the context
 *  strip) lives OUTSIDE `.gn-shell--dark`, so without a :root dark muted token
 *  it fell back to the LIGHT muted (#5d6673 → only 3.26:1 on the dark bg). Pure
 *  — returns a plain object so it is trivial to test. */
export function buildAppThemeVars(tokens: ThemeTokens, opts?: { dark?: boolean }): Record<string, string> {
    const accentVars: Record<string, string> = {
        "--gn-accent": tokens.accent,
        "--gn-accent-subtle": tokens.accentSubtle,
        "--gn-accent-border": tokens.accentBorder,
        "--gn-user-bubble": tokens.userBubble,
        "--pp-accent": tokens.accent,
        "--pp-accent-hover": darkenHex(tokens.accent, 0.12),
        "--pp-accent-soft": rgbaOf(tokens.accent, 0.08),
        "--pp-accent-border": rgbaOf(tokens.accent, 0.30),
    };
    if (opts?.dark) {
        // Dark-canonical text + semantic tokens (matches @gn-dark-* / the
        // [data-pp-theme=dark] palette). All meet AA on the dark surfaces.
        return {
            ...accentVars,
            "--gn-text": "#e2eaf4",
            "--gn-text-muted": "#8b949e",
            "--gn-success": "#3fb950",
            "--gn-warning": "#d29922",
            "--gn-error": "#f85149",
            "--pp-text": "#e2eaf4",
            "--pp-fg": "#e2eaf4",
            "--pp-text-muted": "#8b949e",
            "--pp-success": "#3fb950",
            "--pp-warning": "#d29922",
            "--pp-error": "#f85149",
        };
    }
    return {
        ...accentVars,
        // workbench surfaces / text / geometry
        "--gn-bg": tokens.bg,
        "--gn-surface": tokens.surface,
        "--gn-surface-raised": tokens.surfaceRaised,
        "--gn-border": tokens.border,
        "--gn-border-subtle": tokens.borderSubtle,
        "--gn-text": tokens.text,
        "--gn-text-muted": tokens.textMuted,
        "--gn-success": tokens.success,
        "--gn-warning": tokens.warning,
        "--gn-error": tokens.error,
        "--gn-font": tokens.fontFamily,
        "--gn-radius": tokens.radius,
        "--gn-radius-sm": tokens.radiusSm,
        // native surfaces / text
        "--pp-bg": tokens.bg,
        "--pp-surface": tokens.surface,
        "--pp-surface-raised": tokens.surfaceRaised,
        "--pp-text": tokens.text,
        "--pp-fg": tokens.text,
        "--pp-text-muted": tokens.textMuted,
        "--pp-border": tokens.border,
        "--pp-border-subtle": tokens.borderSubtle,
        "--pp-success": tokens.success,
        "--pp-warning": tokens.warning,
        "--pp-error": tokens.error,
    };
}

/** Apply a resolved theme to the document root (both vocabularies). Clears any
 *  previously-managed vars that this pass doesn't set, so switching theme/mode
 *  never leaves residue. No-op outside the browser. */
export function applyThemeTokens(tokens: ThemeTokens, opts?: { dark?: boolean }): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const vars = buildAppThemeVars(tokens, opts);
    for (const name of APP_THEME_MANAGED_VARS) {
        if (name in vars) root.style.setProperty(name, vars[name]);
        else root.style.removeProperty(name);
    }
}

// ─── Report theme bridge ──────────────────────────────────────────────────────

/**
 * Maps Power BI host.colorPalette values to our ThemeTokens.
 * Called only when the author enables "Use Report Theme" in the format pane.
 * Falls back to the "default" Pulse theme for any palette entry that is missing.
 */
export function buildThemeFromHost(palette: {
    background?: { value: string };
    foreground?: { value: string };
    foreground2?: { value: string };
    backgroundLight?: { value: string };
    backgroundLight2?: { value: string };
    foregroundNeutralSecondary?: { value: string };
    selection?: Array<{ value: string }>;
    tableAccent?: { value: string };
    /** Cycle 28 — modern slot accessor. PBI Desktop populates this with the
     *  active report theme's named slots ("primary-1", "accent-1", etc.) even
     *  when the older direct-property fields (tableAccent / selection /
     *  foreground2) are sparse. Optional so existing tests with bare-property
     *  mocks keep working. */
    getColor?: (themeColorName: string) => { value: string } | undefined;
}): ThemeTokens {
    const fallback = BUILT_IN_THEMES["default"];
    // Cycle 28 — robust slot reader. Tries the direct property first, then
    // the modern `getColor()` API, then falls back to the brand default.
    // Without this, PBI Desktop reports using a custom theme (e.g.,
    // "Frontier") returned only `palette.background` + `palette.foreground`
    // and every other slot fell through to the default — making
    // "Use Report Theme" a no-op for accent / surface inheritance.
    const tryGetColor = (slot: string): string | undefined => {
        try {
            return typeof palette.getColor === "function"
                ? palette.getColor(slot)?.value
                : undefined;
        } catch { return undefined; }
    };
    const bg       = palette.background?.value       || fallback.bg;
    const text     = palette.foreground?.value       || fallback.text;
    const textMuted= palette.foreground2?.value
                  || tryGetColor("foreground2")
                  || fallback.textMuted;
    const surface  = palette.backgroundLight?.value
                  || tryGetColor("background-light")
                  || bg;
    const surfaceRaised = palette.backgroundLight2?.value
                  || tryGetColor("background-light2")
                  || surface;
    const border   = palette.foregroundNeutralSecondary?.value
                  || tryGetColor("foreground-neutral-secondary")
                  || fallback.border;
    const accent   = palette.tableAccent?.value
                  || palette.selection?.[0]?.value
                  || tryGetColor("accent-1")
                  || tryGetColor("primary-1")
                  || fallback.accent;

    // Derive subtle/border accent variants from the accent colour
    const accentHex = accent.replace("#", "");
    const accentR   = parseInt(accentHex.slice(0, 2) || "0f", 16);
    const accentG   = parseInt(accentHex.slice(2, 4) || "6c", 16);
    const accentB   = parseInt(accentHex.slice(4, 6) || "bd", 16);

    return {
        bg,
        surface,
        surfaceRaised,
        border,
        borderSubtle: fallback.borderSubtle,
        text,
        textMuted,
        accent,
        accentSubtle:  `rgba(${accentR},${accentG},${accentB},0.10)`,
        accentBorder:  `rgba(${accentR},${accentG},${accentB},0.35)`,
        userBubble:    accent,
        success:       fallback.success,
        warning:       fallback.warning,
        error:         fallback.error,
        fontFamily:    fallback.fontFamily,
        radius:        fallback.radius,
        radiusSm:      fallback.radiusSm,
    };
}

// ─── Dark-mode detection helper ───────────────────────────────────────────────

/**
 * Returns true if the resolved theme tokens represent a dark background.
 * Used to keep derived values (glow colours, shadow opacity) consistent.
 */
export function isDarkTheme(tokens: ThemeTokens): boolean {
    // Parse luminance from the bg hex colour
    const hex = tokens.bg.replace("#", "");
    if (hex.length !== 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.45;
}

// Required for the CSSProperties cast — import React in the caller or use
// a local type alias. Declared here to keep the function signature clean.
declare namespace React {
    interface CSSProperties {
        [key: string]: string | number | undefined;
    }
}
