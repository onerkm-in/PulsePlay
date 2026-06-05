// playground/src/multipane/surfaceConnectors.ts
//
// Part C P2 (2026-06-05) — per-SURFACE connector bindings. This is the real
// "AI Insights on Power BI AND Ask Pulse on Genie at the same time" feature:
// a map from SurfaceId → AI profile, persisted under one localStorage key, read
// directly by the Pulse Visual (visual.tsx) so each surface sends to its OWN
// connector. GATED on the multiConnectorPanes feature flag — when the flag is
// OFF, getSurfaceProfile() returns null for every surface and the surfaces fall
// back to the single shared connector (the app is byte-for-byte unchanged).
//
// Why localStorage (not a React prop)? The three surfaces are rendered by a
// CLASS-based Pulse Visual (PulseShell → new Visual() → visual.update()), not by
// React props — so the clean, low-risk injection channel is a localStorage
// override the Visual reads directly, exactly like themeSync reads the dark-mode
// flag. Additive + flag-gated ⇒ zero blast radius when off.

import { useEffect, useState } from "react";
import { isFeatureEnabled } from "../featureFlags";

export const SURFACE_CONNECTORS_KEY = "pulseplay:surface-connectors";
export const SURFACE_CONNECTORS_EVENT = "pulseplay:surface-connectors-change";

/** The surfaces that can carry their own AI connector. "bi-viz" (Dashboard) now
 *  participates too: its binding drives the Dashboard surface's assistant
 *  identity (the BI embed itself is vendor-driven, but its AI assistant follows
 *  the per-surface connector when the flag is on). */
export type ConnectorSurfaceId = "ai-insights" | "ask-pulse" | "bi-viz";

/** SurfaceId → AI profile name (a proxy profile key). A missing / empty entry
 *  means "inherit the single shared connector" for that surface. */
export type SurfaceConnectorMap = Partial<Record<ConnectorSurfaceId, string>>;

function readRaw(): SurfaceConnectorMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(SURFACE_CONNECTORS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const out: SurfaceConnectorMap = {};
        for (const k of ["ai-insights", "ask-pulse", "bi-viz"] as ConnectorSurfaceId[]) {
            const v = (parsed as Record<string, unknown>)[k];
            if (typeof v === "string" && v.trim()) out[k] = v.trim();
        }
        return out;
    } catch {
        return {};
    }
}

/** The full per-surface map. Returns {} when the flag is OFF so callers that
 *  spread it get no overrides (single-pane behavior preserved). */
export function loadSurfaceConnectors(): SurfaceConnectorMap {
    if (!isFeatureEnabled("multiConnectorPanes")) return {};
    return readRaw();
}

/** The effective profile override for ONE surface, or null to inherit the
 *  shared connector. Null whenever the flag is off. This is the single function
 *  visual.tsx calls at its two profile-resolution points. */
export function getSurfaceProfile(surface: ConnectorSurfaceId): string | null {
    if (!isFeatureEnabled("multiConnectorPanes")) return null;
    const v = readRaw()[surface];
    return v && v.trim() ? v.trim() : null;
}

/** Bind a surface to a profile (or clear it with an empty string). Persists +
 *  broadcasts so the live Visual re-resolves immediately. */
export function setSurfaceProfile(surface: ConnectorSurfaceId, profile: string): SurfaceConnectorMap {
    const next: SurfaceConnectorMap = { ...readRaw() };
    if (profile && profile.trim()) next[surface] = profile.trim();
    else delete next[surface];
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(SURFACE_CONNECTORS_KEY, JSON.stringify(next));
            window.dispatchEvent(new CustomEvent(SURFACE_CONNECTORS_EVENT, { detail: next }));
        } catch { /* storage blocked — ignore */ }
    }
    return next;
}

/** Clear every per-surface binding (owns its full key — Settings reset + tests). */
export function resetSurfaceConnectors(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(SURFACE_CONNECTORS_KEY);
        window.dispatchEvent(new CustomEvent(SURFACE_CONNECTORS_EVENT, { detail: {} }));
    } catch { /* ignore */ }
}

/** React hook — reactive per-surface map. Re-renders on in-tab change event or
 *  cross-tab storage. Honors the flag (returns {} when off). */
export function useSurfaceConnectors(): SurfaceConnectorMap {
    const [map, setMap] = useState<SurfaceConnectorMap>(() => loadSurfaceConnectors());
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sync = () => setMap(loadSurfaceConnectors());
        window.addEventListener(SURFACE_CONNECTORS_EVENT, sync as EventListener);
        window.addEventListener("pulseplay:feature-flags-change", sync as EventListener);
        const onStorage = (e: StorageEvent) => {
            if (!e.key || e.key === SURFACE_CONNECTORS_KEY) sync();
        };
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(SURFACE_CONNECTORS_EVENT, sync as EventListener);
            window.removeEventListener("pulseplay:feature-flags-change", sync as EventListener);
            window.removeEventListener("storage", onStorage);
        };
    }, []);
    return map;
}
