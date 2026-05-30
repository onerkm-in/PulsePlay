// playground/src/surfaceRegistry.ts
//
// Surface contract for the unified shell.
//
// Codex's 2026-05-19 visible E2E pass revealed that the existing
// pane-scoped pop-out (`floatedPane: "ai" | "bi"`) didn't match the
// product direction. Users want **component-scoped** companions: if I'm
// in AI Insights and pop out, only AI Insights should detach — Ask
// Pulse and BI Viz should remain as peer surfaces in the main shell.
//
// This file is the single source of truth for surface ids, labels,
// icons (as Surface tokens — components render the visual), and the
// transitions the shell allows. Everything else (UnifiedSurfaceTabs,
// FloatingPanel, route handlers) must consume this registry rather
// than hard-code its own enum.

export type SurfaceId = "ai-insights" | "ask-pulse" | "bi-viz";

export interface SurfaceDescriptor {
    /** Stable id used in URL params, aria attributes, telemetry. */
    readonly id: SurfaceId;
    /** Human-readable label shown in the switcher. */
    readonly label: string;
    /** Short-form symbol for the switcher icon well. NOT a repeat of label. */
    readonly icon: SurfaceIcon;
    /** One-line description for tooltips + screen reader fallback. */
    readonly description: string;
    /** Which pane this surface lives in inside the split layout
     *  (when not floated). Lets the layout system know whether a
     *  surface change happens on the AI side or the BI side. */
    readonly pane: "ai" | "bi";
}

/** A surface icon is a small visual marker — a glyph chosen so it does
 *  NOT repeat the label text. The switcher renders it inside an icon
 *  well; screen readers ignore it (aria-hidden) and rely on the label. */
export type SurfaceIcon = "spark" | "chat" | "bars";

export const SURFACES: ReadonlyArray<SurfaceDescriptor> = Object.freeze([
    {
        id: "ai-insights",
        label: "AI Insights",
        icon: "spark",
        description: "Auto-generated narrative summary of the current data scope.",
        pane: "ai",
    },
    {
        id: "ask-pulse",
        label: "Ask Pulse",
        icon: "chat",
        description: "Ask follow-up questions in natural language; SQL + chart back.",
        pane: "ai",
    },
    {
        // Audit 2026-05-19: label was "BI Viz" — engineer-speak short for
        // "BI Visualization". Renamed to "Dashboard" (the lowest-common
        // user term across Power BI / Tableau / Qlik / Looker) without
        // changing the internal id "bi-viz", so URL params, telemetry,
        // and CSS class names stay stable.
        id: "bi-viz",
        label: "Dashboard",
        icon: "bars",
        description: "The embedded BI surface — same shell, peer to AI Insights.",
        pane: "bi",
    },
]);

const BY_ID: ReadonlyMap<SurfaceId, SurfaceDescriptor> = new Map(SURFACES.map((s) => [s.id, s]));

export function getSurface(id: SurfaceId): SurfaceDescriptor {
    const s = BY_ID.get(id);
    if (!s) throw new Error(`Unknown surface id: ${id}`);
    return s;
}

export function isSurfaceId(value: unknown): value is SurfaceId {
    return typeof value === "string" && BY_ID.has(value as SurfaceId);
}

/** Surfaces that live in the AI pane — useful when deciding whether
 *  a surface change should also flip the visible pane in mix mode. */
export function surfacesForPane(pane: "ai" | "bi"): ReadonlyArray<SurfaceDescriptor> {
    return SURFACES.filter((s) => s.pane === pane);
}
