// playground/src/lib/chartPalettes.ts
//
// End-user chart palettes. Exposed ON the chart (toolbar picker) rather than in
// Settings, because end users never see the Settings page. Selecting a palette
// writes `--pp-chart-palette` (comma-separated hex) to :root — which
// buildEChartsOption reads at build time — persists the choice, and broadcasts
// an event so every mounted chart re-skins live. App-wide (one knob re-colors
// all charts), matching the theme model.

export interface ChartPalette {
    id: string;
    label: string;
    colors: string[];
}

// `vibrant` mirrors VIBRANT_DEFAULT in buildEChartsOption so "no palette set"
// and "vibrant selected" look identical.
export const CHART_PALETTES: ChartPalette[] = [
    { id: "vibrant", label: "Vibrant", colors: ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316"] },
    { id: "cool",    label: "Cool",    colors: ["#2563eb", "#0891b2", "#0d9488", "#059669", "#4f46e5", "#7c3aed", "#0ea5e9", "#14b8a6", "#1d4ed8"] },
    { id: "warm",    label: "Warm",    colors: ["#dc2626", "#ea580c", "#f59e0b", "#d97706", "#e11d48", "#db2777", "#f97316", "#facc15", "#b91c1c"] },
    { id: "pastel",  label: "Pastel",  colors: ["#a5b4fc", "#fbcfe8", "#fde68a", "#a7f3d0", "#bae6fd", "#ddd6fe", "#fecaca", "#99f6e4", "#fed7aa"] },
    { id: "earthy",  label: "Earthy",  colors: ["#b45309", "#65a30d", "#0f766e", "#7c2d12", "#a16207", "#4d7c0f", "#155e75", "#92400e", "#3f6212"] },
    { id: "bold",    label: "Bold",    colors: ["#7c3aed", "#db2777", "#e11d48", "#ea580c", "#16a34a", "#0284c7", "#9333ea", "#ca8a04", "#0d9488"] },
];

const STORAGE_KEY = "pulseplay:chart-palette";
export const CHART_PALETTE_EVENT = "pulseplay:chart-palette-change";

export function findPalette(id: string | null | undefined): ChartPalette {
    return CHART_PALETTES.find(p => p.id === id) ?? CHART_PALETTES[0];
}

export function getActivePaletteId(): string {
    try {
        return window.localStorage.getItem(STORAGE_KEY) || "vibrant";
    } catch {
        return "vibrant";
    }
}

/** Write the palette's colors to :root so buildEChartsOption picks them up.
 *  Does NOT persist or broadcast — used at boot and internally. */
function writePaletteVar(palette: ChartPalette): void {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--pp-chart-palette", palette.colors.join(", "));
}

/** Apply a palette by id: write the CSS var, persist the choice, and broadcast
 *  so every mounted chart re-skins. Call from the on-chart picker. */
export function applyChartPalette(id: string): void {
    const palette = findPalette(id);
    writePaletteVar(palette);
    try { window.localStorage.setItem(STORAGE_KEY, palette.id); } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent(CHART_PALETTE_EVENT, { detail: palette.id })); } catch { /* ignore */ }
}

/** Apply the persisted palette at app entry (no broadcast needed — charts read
 *  the var on first build). */
export function initChartPalette(): void {
    if (typeof window === "undefined") return;
    writePaletteVar(findPalette(getActivePaletteId()));
}
