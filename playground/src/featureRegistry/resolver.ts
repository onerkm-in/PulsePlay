// playground/src/featureRegistry/resolver.ts
//
// ARCH-P1 slice 3 — capability resolver.
//
// Pure function — no React, no globals, no side effects. Replaces the
// hardcoded `DEFAULT_UI_MODE` return path in App.tsx readInitialUiMode()
// and settingsStore readUiMode(). DEFAULT_UI_MODE itself stays as the
// final fallback so ARCH-P0's single-source-of-truth contract is intact
// — changing the default is still "edit DEFAULT_UI_MODE in one place,"
// because this resolver returns it when no narrowing input fires.
//
// Decision flow (Q2 sign-off — explicit override always wins):
//   1. Explicit uiMode override ("pulse"|"v0") → return immediately.
//   2. Required features narrow the candidate surfaces (set intersection).
//   3. Tab visibility further narrows — if only one tab visible AND it's
//      still a candidate, that surface wins.
//   4. If any required feature has a preferredSurface still in
//      candidates, prefer it.
//   5. Fall back to DEFAULT_UI_MODE if it's still a candidate, else the
//      first remaining candidate, else DEFAULT_UI_MODE unconditionally.

import { FEATURE_MANIFEST } from "./manifest";
import type { FeatureId, Surface } from "./types";
import { DEFAULT_UI_MODE } from "../settings/settingsStore";

export interface ResolveDefaultSurfaceArgs {
    /** User's explicit override from localStorage, if any. Wins over
     *  every other input — the escape hatch is unconditional per Q2. */
    explicitUiMode?: "pulse" | "v0" | null;
    /** Required features for this user — drives surface intersection.
     *  Today: empty array on cold boot (no feature requires a specific
     *  surface before the user has interacted). Slice 4's affordance
     *  layer can pass user-enabled feature requirements here. */
    requiredFeatures: readonly FeatureId[];
    /** Per-tab visibility from settingsStore. If only one tab is visible
     *  and its corresponding surface is still a candidate, that surface
     *  wins. Maps: aiInsights → pulse, askPulse → v0, dashboard → dashboard. */
    tabVisibility: {
        aiInsights: boolean;
        askPulse:   boolean;
        dashboard:  boolean;
    };
}

export function resolveDefaultSurface(args: ResolveDefaultSurfaceArgs): Surface {
    // Step 1: explicit user override wins. Always.
    if (args.explicitUiMode === "pulse" || args.explicitUiMode === "v0") {
        return args.explicitUiMode;
    }

    // Step 2: required features narrow the candidate surfaces.
    let candidates: Surface[] = ["pulse", "v0", "dashboard"];
    for (const featureId of args.requiredFeatures) {
        const descriptor = FEATURE_MANIFEST.find(f => f.id === featureId);
        if (!descriptor) continue; // unknown feature — skip rather than crash
        candidates = candidates.filter(c => descriptor.surfaces.includes(c));
    }

    // Step 3: tab visibility narrows further. Map tab → surface.
    const visibleSurfaces: Surface[] = [];
    if (args.tabVisibility.aiInsights) visibleSurfaces.push("pulse");
    if (args.tabVisibility.askPulse)   visibleSurfaces.push("v0");
    if (args.tabVisibility.dashboard)  visibleSurfaces.push("dashboard");
    const stillVisible = candidates.filter(c => visibleSurfaces.includes(c));
    if (stillVisible.length === 1) return stillVisible[0];

    // Step 4: required-feature preferredSurface bias.
    if (args.requiredFeatures.length > 0) {
        const first = FEATURE_MANIFEST.find(f => f.id === args.requiredFeatures[0]);
        if (first && stillVisible.includes(first.preferredSurface)) {
            return first.preferredSurface;
        }
    }

    // Step 5: DEFAULT_UI_MODE if it survives narrowing, else the first
    //   remaining candidate, else the constant unconditionally.
    if (stillVisible.includes(DEFAULT_UI_MODE)) return DEFAULT_UI_MODE;
    return stillVisible[0] ?? DEFAULT_UI_MODE;
}

/** Used by slice 4 to drive graceful-degradation affordances. Returns
 *  true when the feature's descriptor lists the surface in its
 *  `surfaces` array. Unknown feature ids return false (conservative —
 *  better to render "feature unavailable" than to render nothing). */
export function featureSupportsSurface(featureId: FeatureId, surface: Surface): boolean {
    const descriptor = FEATURE_MANIFEST.find(f => f.id === featureId);
    return descriptor?.surfaces.includes(surface) ?? false;
}
