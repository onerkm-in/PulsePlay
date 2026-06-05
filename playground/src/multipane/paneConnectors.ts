// playground/src/multipane/paneConnectors.ts
//
// Part C P1 (2026-06-05) — per-pane connector state model + the projection that
// keeps the single-active-per-axis globals backward-compatible.
//
// Today PulsePlay has THREE app-level globals — activeVendor (Y), activeConnector
// (X), embedConfig — and every pane shares them. The parallel-connectors
// foundation gives each pane its OWN binding via a Map<paneId, PaneConnectorState>
// and a pure projection:
//
//   projectActivePaneConnector(...) collapses the per-pane model back down to the
//   three globals by reading the ACTIVE pane (pane[0]). When the multiConnectorPanes
//   flag is OFF, it returns the legacy globals untouched — so the existing app sees
//   no behavioral change. When ON, the active pane's binding wins, with the legacy
//   globals as the per-field fallback for anything a pane leaves unset.
//
// Everything here is PURE (no React, no localStorage) so it is trivially unit-
// testable and side-effect-free. The live wiring (App globals projection + the
// demo surface) imports these functions; this module imports nothing stateful.

import type { BIEmbedConfig } from "../biPanel/BIAdapter";
import type { PaneInstance } from "../settings/settingsStore";
import type { FeatureFlags } from "../featureFlags";

/** A single pane's connector binding. Every field is optional: an unset field
 *  means "inherit the active global for this axis" (backward-compat). */
export interface PaneConnectorState {
    /** Y-axis — which BI vendor this pane hosts. */
    vendor?: string;
    /** X-axis — which AI profile/connector this pane's assistant talks to. */
    aiProfile?: string;
    /** This pane's BI embed target. */
    embedConfig?: BIEmbedConfig;
}

/** The three single-active-per-axis globals, exactly as App.tsx holds them
 *  today. The projection returns this shape so existing consumers are unchanged. */
export interface ActiveConnectorProjection {
    activeVendor: string;
    activeConnector: string;
    embedConfig: BIEmbedConfig;
}

export interface ProjectInput {
    /** The pane registry. pane[0] is the ACTIVE pane (the one the globals
     *  project from). Empty ⇒ pure legacy. */
    panes: ReadonlyArray<PaneInstance>;
    /** Per-pane connector overrides, keyed by paneId. A pane with no entry
     *  falls back to its PaneInstance fields, then to the legacy globals. */
    connectorStates: ReadonlyMap<string, PaneConnectorState>;
    /** The feature flags. When `multiConnectorPanes` is false, the projection
     *  returns `legacy` verbatim. */
    flags: Pick<FeatureFlags, "multiConnectorPanes">;
    /** Today's app-level globals — the backward-compatible fallback. */
    legacy: ActiveConnectorProjection;
}

/** Resolve one pane's effective connector state: explicit Map entry wins, then
 *  the pane's own PaneInstance fields, then the legacy globals per field. Pure. */
export function resolvePaneConnector(
    pane: PaneInstance | undefined,
    connectorStates: ReadonlyMap<string, PaneConnectorState>,
    legacy: ActiveConnectorProjection,
): ActiveConnectorProjection {
    const override = pane ? connectorStates.get(pane.paneId) : undefined;
    const vendor = override?.vendor ?? pane?.vendor ?? legacy.activeVendor;
    const aiProfile = override?.aiProfile ?? pane?.aiProfile ?? legacy.activeConnector;
    const embedConfig = override?.embedConfig
        ?? (pane?.embedConfig as BIEmbedConfig | undefined)
        ?? legacy.embedConfig;
    return { activeVendor: vendor, activeConnector: aiProfile, embedConfig };
}

/** Project the per-pane model down to the three single-active-per-axis globals.
 *
 *  - flag OFF  → returns `legacy` verbatim (the app is byte-for-byte unchanged).
 *  - flag ON   → returns the ACTIVE pane (pane[0]) resolved binding, with the
 *                legacy globals as the per-field fallback. With no panes it
 *                still returns legacy.
 *
 *  This is the single function that guarantees "the globals are a projection of
 *  pane[0]" without changing single-pane behavior. Pure. */
export function projectActivePaneConnector(input: ProjectInput): ActiveConnectorProjection {
    if (!input.flags.multiConnectorPanes) return input.legacy;
    const active = input.panes[0];
    if (!active) return input.legacy;
    return resolvePaneConnector(active, input.connectorStates, input.legacy);
}

/** Immutably set (merge) one pane's connector override in a Map. Returns a NEW
 *  Map so React state updates stay referentially honest. Pure. */
export function setPaneConnector(
    states: ReadonlyMap<string, PaneConnectorState>,
    paneId: string,
    patch: Partial<PaneConnectorState>,
): Map<string, PaneConnectorState> {
    const next = new Map(states);
    next.set(paneId, { ...(states.get(paneId) ?? {}), ...patch });
    return next;
}

/** Remove one pane's override (e.g. when a pane is closed). Pure. */
export function clearPaneConnector(
    states: ReadonlyMap<string, PaneConnectorState>,
    paneId: string,
): Map<string, PaneConnectorState> {
    const next = new Map(states);
    next.delete(paneId);
    return next;
}
