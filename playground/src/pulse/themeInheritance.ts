/**
 * themeInheritance.ts
 *
 * Wave 44 — Power BI theme inheritance + per-element typography helpers.
 *
 * The visual ships with its own brand colours + Segoe UI typography by
 * default ("defined BY US"). When the author flips the new
 * `inheritPowerBITheme` toggle ON, this module:
 *
 *   1. Reads `host.colorPalette` and maps it to a small set of CSS custom
 *      properties (--gn-bg / --gn-text / --gn-text-muted / --gn-primary /
 *      --gn-accent / --gn-positive / --gn-negative / --gn-border).
 *   2. Returns a writes-to-make plan that the caller flushes onto a
 *      DOM element via `setProperty()`.
 *   3. Returns a removes-to-make list when the toggle goes back OFF, so
 *      previously-injected vars don't linger and silently override the
 *      brand defaults from visual.less.
 *
 * Per-element FontControl values are honoured INDEPENDENTLY of the toggle:
 * an empty fontFamily means "use the theme/default"; an explicit value
 * always wins. Sizes are always written when present (>0).
 *
 * This module is pure — no DOM access, no `host` import, no React. The
 * caller (Visual.update) wires the result into setProperty/removeProperty
 * calls. Pure shape makes vitest cases trivial and side-effect-free.
 *
 * NOTE on PBI palette API quirks:
 *   - `palette.background` / `palette.foreground` are ALWAYS present in
 *     IColorPalette (visuals-api.d.ts:IColorPalette).
 *   - `palette.foregroundLight` / `palette.foregroundNeutralSecondary`
 *     are sometimes absent in older SDK builds. We guard with optional
 *     access and synthesise a muted variant via opacity blend.
 *   - `palette.getColor(themeName)` is the supported API for theme slot
 *     lookup. Returns `IColorInfo` with `value` (hex) + `opacity` (0-100).
 *     Some hosts return undefined for unknown slots; we guard.
 *   - `palette.positive` / `palette.negative` are advisory tokens; if the
 *     host doesn't ship them we fall back to a tasteful pair.
 */

/** All CSS custom property names the Wave 44 layer can write. */
export const THEME_CSS_VAR_NAMES = [
    "--gn-bg",
    "--gn-text",
    "--gn-text-muted",
    "--gn-primary",
    "--gn-accent",
    "--gn-positive",
    "--gn-negative",
    "--gn-border"
] as const;

/** All per-element typography CSS custom properties. */
export const TYPOGRAPHY_CSS_VAR_NAMES = [
    "--gn-font-header",
    "--gn-font-body",
    "--gn-font-accent",
    "--gn-font-size-header",
    "--gn-font-size-body",
    "--gn-font-size-accent"
] as const;

/** Minimum subset of `host.colorPalette` we read. Loose typing so we can
 *  accept partial mocks in tests without re-declaring the whole IColorPalette. */
export interface PaletteLike {
    background?: { value: string };
    foreground?: { value: string };
    foregroundLight?: { value: string };
    foregroundNeutralSecondary?: { value: string };
    positive?: { value: string };
    negative?: { value: string };
    /** PBI hosts expose `getColor(themeName: string): IColorInfo`. We treat
     *  it as optional so older SDK builds that lack it degrade gracefully. */
    getColor?: (themeColorName: string) => { value: string } | undefined;
}

/** The Wave 44 typography subset of GenieVisualSettings. */
export interface TypographyOverrides {
    headerFontFamily: string;   // "" ⇒ inherit
    headerFontSize: number;     // pt; 0/NaN ⇒ skip
    bodyFontFamily: string;
    bodyFontSize: number;
    accentFontFamily: string;
    accentFontSize: number;
}

/**
 * Compute the colour CSS-variable map from a Power BI palette.
 *
 * Returns an empty object when `palette` is null — the caller then knows
 * to remove any previously-set vars instead of overwriting them with junk.
 */
export function buildPaletteCssVars(palette: PaletteLike | null): Record<string, string> {
    if (!palette) return {};
    const out: Record<string, string> = {};

    const bg   = palette.background?.value;
    const text = palette.foreground?.value;
    if (bg)   out["--gn-bg"]   = bg;
    if (text) out["--gn-text"] = text;

    // Muted text — prefer the host's foregroundLight if present, otherwise
    // derive a 65%-opacity blend on the foreground colour. Falls back to a
    // safe gray if foreground is also missing (very rare).
    if (palette.foregroundLight?.value) {
        out["--gn-text-muted"] = palette.foregroundLight.value;
    } else if (text) {
        out["--gn-text-muted"] = adjustOpacity(text, 0.65);
    }

    // Primary + accent — `getColor("primary-1")` is the documented theme
    // slot accessor. Some hosts also expose `accent-1` distinctly; if not
    // we map accent ← primary so both vars resolve to something usable.
    const primary = safeGetColor(palette, "primary-1");
    const accent  = safeGetColor(palette, "accent-1") ?? primary;
    if (primary) out["--gn-primary"] = primary;
    if (accent)  out["--gn-accent"]  = accent;

    // Semantic positive/negative — host token if available, tasteful
    // hex fallback otherwise. These are LAST-RESORT defaults — they
    // match the brand-default semantic colours in visual.less.
    out["--gn-positive"] = palette.positive?.value ?? "#10b981";
    out["--gn-negative"] = palette.negative?.value ?? "#ef4444";

    // Border — derive from foreground at 15% opacity. The PBI palette
    // doesn't expose a border slot directly; foreground at low alpha is
    // the convention shipped Microsoft sample visuals use.
    if (palette.foregroundNeutralSecondary?.value) {
        out["--gn-border"] = palette.foregroundNeutralSecondary.value;
    } else if (text) {
        out["--gn-border"] = adjustOpacity(text, 0.15);
    }

    return out;
}

/**
 * Compute the typography CSS-variable map from FontControl overrides.
 * Empty fontFamily values are SKIPPED (so the LESS-side fallback wins);
 * non-positive sizes are SKIPPED. Always pure — no DOM mutation.
 */
export function buildTypographyCssVars(t: TypographyOverrides): Record<string, string> {
    const out: Record<string, string> = {};
    if (t.headerFontFamily) out["--gn-font-header"] = t.headerFontFamily;
    if (t.bodyFontFamily)   out["--gn-font-body"]   = t.bodyFontFamily;
    if (t.accentFontFamily) out["--gn-font-accent"] = t.accentFontFamily;
    if (Number.isFinite(t.headerFontSize) && t.headerFontSize > 0) {
        out["--gn-font-size-header"] = `${t.headerFontSize}pt`;
    }
    if (Number.isFinite(t.bodyFontSize) && t.bodyFontSize > 0) {
        out["--gn-font-size-body"] = `${t.bodyFontSize}pt`;
    }
    if (Number.isFinite(t.accentFontSize) && t.accentFontSize > 0) {
        out["--gn-font-size-accent"] = `${t.accentFontSize}pt`;
    }
    return out;
}

/**
 * Given the new "inherit ON or OFF" decision, return:
 *   - `set`: keys + values to write via element.style.setProperty
 *   - `remove`: keys to clear via element.style.removeProperty
 *
 * Toggle OFF behaviour is critical: the previous render may have written
 * theme vars onto the element. Without an explicit clear, the brand
 * defaults from visual.less can't take effect (CSS `var()` always
 * prefers the inline value). The caller passes the same overrides in
 * both modes — typography is ALWAYS authoritative.
 */
export function planThemeWrites(
    inheritOn: boolean,
    palette: PaletteLike | null,
    typography: TypographyOverrides
): { set: Record<string, string>; remove: string[] } {
    const colourVars = inheritOn ? buildPaletteCssVars(palette) : {};
    const fontVars = buildTypographyCssVars(typography);
    const set = { ...colourVars, ...fontVars };

    // Remove anything we'd write today but didn't fill (keeps OFF mode and
    // partial-palette ON mode from leaving stale residue).
    const remove: string[] = [];
    for (const name of THEME_CSS_VAR_NAMES) {
        if (!(name in set)) remove.push(name);
    }
    for (const name of TYPOGRAPHY_CSS_VAR_NAMES) {
        if (!(name in set)) remove.push(name);
    }
    return { set, remove };
}

/**
 * Apply the plan to a DOM element. Called from Visual.update once per
 * render. SSR/test-safe: callers can skip this and just inspect the plan.
 */
export function applyThemeWrites(
    element: HTMLElement | null,
    plan: { set: Record<string, string>; remove: string[] }
): void {
    if (!element || !element.style) return;
    for (const [k, v] of Object.entries(plan.set)) {
        element.style.setProperty(k, v);
    }
    for (const k of plan.remove) {
        element.style.removeProperty(k);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a #rrggbb hex (or #rgb) to rgba(... , alpha). Returns the input
 *  unchanged for non-hex inputs (rgb/rgba/named colours flow through). */
export function adjustOpacity(hex: string, alpha: number): string {
    if (typeof hex !== "string") return hex;
    const trimmed = hex.trim();
    if (!trimmed.startsWith("#")) return trimmed;
    const body = trimmed.slice(1);
    let r: number, g: number, b: number;
    if (body.length === 3) {
        r = parseInt(body[0] + body[0], 16);
        g = parseInt(body[1] + body[1], 16);
        b = parseInt(body[2] + body[2], 16);
    } else if (body.length === 6) {
        r = parseInt(body.slice(0, 2), 16);
        g = parseInt(body.slice(2, 4), 16);
        b = parseInt(body.slice(4, 6), 16);
    } else {
        return trimmed;
    }
    if ([r, g, b].some(n => Number.isNaN(n))) return trimmed;
    const clamped = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

/** Wrap palette.getColor with try/catch — some hosts throw when asked for
 *  an unknown theme slot rather than returning undefined. */
function safeGetColor(palette: PaletteLike, slot: string): string | undefined {
    if (typeof palette.getColor !== "function") return undefined;
    try {
        const info = palette.getColor(slot);
        return info?.value || undefined;
    } catch {
        return undefined;
    }
}
