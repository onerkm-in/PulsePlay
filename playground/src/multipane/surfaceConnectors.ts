// playground/src/multipane/surfaceConnectors.ts
//
// Per-surface connector resolution. PulsePlay ships SINGLE-active-per-axis: every
// surface (AI Insights / Ask Pulse / Dashboard) talks to the ONE shared
// connector. The per-surface-override feature was removed with the multi-pane
// demo (2026-07-24), so getSurfaceProfile always returns null — "inherit the
// shared connector". This module stays as the single seam visual.tsx calls, so
// re-introducing per-surface connectors later is a localized change.

/** The surfaces that resolve an AI connector. */
export type ConnectorSurfaceId = "ai-insights" | "ask-pulse" | "bi-viz";

/** Event name kept for API stability (no per-surface writes fire it today). */
export const SURFACE_CONNECTORS_EVENT = "pulseplay:surface-connectors-change";

/** The effective profile override for ONE surface, or null to inherit the single
 *  shared connector. Always null — see the module header. This is the single
 *  function visual.tsx calls at its two profile-resolution points. */
export function getSurfaceProfile(_surface: ConnectorSurfaceId): string | null {
    return null;
}
