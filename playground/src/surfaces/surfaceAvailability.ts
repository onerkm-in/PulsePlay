// playground/src/surfaces/surfaceAvailability.ts
//
// Pure surface-availability resolver. F5.1 in the layout maturity arc.
//
// Why this exists: the F5 layout state contract introduced a persisted
// active `SurfaceId`, but App.tsx only knew about `enabledComponents`
// (the playground-level pane choice). The Pulse pane has its OWN second
// axis — `enabledFeatures` ("both" | "insightsOnly" | "chatOnly") — that
// turns individual AI surfaces on or off. Net result before this module:
// `activeSurface="ai-insights"` could outlive a flip to `chatOnly`, and
// the `data-active-surface` attribute would lie about what was actually
// rendered.
//
// This module makes the lie impossible by separating REQUESTED intent
// (what the user/URL asked for, persisted across config changes) from
// EFFECTIVE state (what the current deployment configuration actually
// permits). Re-enabling a previously-disabled surface restores the
// requested surface automatically.
//
// Contract:
//   - Inputs are values, not state. Pure function in / out.
//   - No React, no localStorage, no DOM, no globals.
//   - Output is fully serializable.
//
// Non-goals:
//   - Does NOT decide what's "best" for first-time users — that's the
//     host's heuristic (App.tsx readInitialActiveSurface).
//   - Does NOT mutate state. Caller decides whether to write the
//     effective surface back to localStorage or keep requested intent.
//   - Does NOT remove features. A surface being unavailable in one
//     deployment config does not mean the surface ceases to exist.

import type { SurfaceId } from "../surfaceRegistry";
import { SURFACES } from "../surfaceRegistry";

/** Mirror of the playground-level pane-composition setting. Kept as a
 *  local string-union to avoid importing settingsStore (which would
 *  pull in React + reducer machinery into this otherwise-pure module).
 *  If the canonical type ever drifts, contract tests catch it. */
export type EnabledComponentsInput = "aiOnly" | "biOnly" | "both" | "mix";

/** Mirror of the Pulse-level feature toggle. Same rationale as above —
 *  do not import the Pulse settings hook from this pure module. */
export type EnabledFeaturesInput = "both" | "insightsOnly" | "chatOnly";

/** Per-surface availability. True means the surface IS renderable under
 *  the current configuration; false means the deployment has it turned
 *  off and the host should not let the user navigate there.
 *
 *  This is NOT "is the surface implemented" — every surface is always
 *  implemented. This is purely about runtime visibility. */
export interface SurfaceAvailability {
    readonly "ai-insights": boolean;
    readonly "ask-pulse": boolean;
    readonly "bi-viz": boolean;
}

/** Why the resolver fell back from the requested surface to a different
 *  effective one. `null` means no fallback happened. Reasons are
 *  user-facing-friendly enough to drive tooltip/help text without further
 *  translation. */
export type FallbackReason =
    | "ai-pane-disabled-by-biOnly"
    | "bi-pane-disabled-by-aiOnly"
    | "insights-disabled-by-chatOnly"
    | "chat-disabled-by-insightsOnly"
    | "no-surface-available"
    | null;

export interface SurfaceResolution {
    /** What the user/URL asked for. Persisted as-is by the host so the
     *  user gets their intended surface back when configuration re-opens
     *  it (e.g., flipping from `chatOnly` back to `both` while a user
     *  had originally requested `ai-insights`). */
    readonly requestedSurfaceId: SurfaceId;
    /** What the shell should actually render. Drives `data-active-surface`
     *  and the SurfaceSwitcher's active prop. */
    readonly effectiveSurfaceId: SurfaceId;
    /** Per-surface availability under the current configuration. Host
     *  uses this to disable switcher buttons or hide deep-link options.
     *  Note: surfaces stay defined in `surfaceRegistry.ts` regardless. */
    readonly availability: SurfaceAvailability;
    /** Non-null when `requestedSurfaceId !== effectiveSurfaceId`. */
    readonly fallbackReason: FallbackReason;
}

/** Compute which surfaces are currently renderable.
 *
 *  Rules (each surface checks both axes independently):
 *    - `bi-viz` requires the BI pane to be enabled. `aiOnly` disables it.
 *    - `ai-insights` requires the AI pane AND insights to be on.
 *      `biOnly` disables it via pane. `chatOnly` disables it via feature.
 *    - `ask-pulse` requires the AI pane AND chat to be on.
 *      `biOnly` disables it via pane. `insightsOnly` disables it via feature.
 *
 *  These rules mirror what App.tsx actually mounts; deviation would make
 *  `data-active-surface` lie again. */
export function computeSurfaceAvailability(
    enabledComponents: EnabledComponentsInput,
    enabledFeatures: EnabledFeaturesInput,
): SurfaceAvailability {
    const aiPaneOn = enabledComponents !== "biOnly";
    const biPaneOn = enabledComponents !== "aiOnly";
    return {
        "ai-insights": aiPaneOn && enabledFeatures !== "chatOnly",
        "ask-pulse":   aiPaneOn && enabledFeatures !== "insightsOnly",
        "bi-viz":      biPaneOn,
    };
}

/** Main resolver. Maps (requested + config) → (effective + reason).
 *
 *  Decision order:
 *    1. If the requested surface is available, that's the effective
 *       surface. No fallback. fallbackReason: null.
 *    2. Otherwise, pick a fallback that respects the user's intent
 *       as much as possible:
 *       a. AI surface requested but AI pane is off → fall back to bi-viz.
 *       b. AI surface requested, AI pane is on, but the specific
 *          feature is off → fall back to the other AI surface.
 *       c. bi-viz requested but BI pane is off → fall back to whichever
 *          AI surface is available, preferring ai-insights.
 *    3. If nothing is available (shouldn't happen with valid config),
 *       return ai-insights with fallbackReason "no-surface-available"
 *       so the caller can render an error state. */
export function resolveSurfaceAvailability(input: {
    requestedSurfaceId: SurfaceId;
    enabledComponents: EnabledComponentsInput;
    enabledFeatures: EnabledFeaturesInput;
}): SurfaceResolution {
    const availability = computeSurfaceAvailability(
        input.enabledComponents,
        input.enabledFeatures,
    );

    // Happy path: requested surface is available.
    if (availability[input.requestedSurfaceId]) {
        return {
            requestedSurfaceId: input.requestedSurfaceId,
            effectiveSurfaceId: input.requestedSurfaceId,
            availability,
            fallbackReason: null,
        };
    }

    // Fallback path. Pane-level disable wins over feature-level disable
    // when reasoning: if the whole AI pane is off, "ai-disabled-by-biOnly"
    // is more accurate than "insights-disabled-by-chatOnly" even though
    // both are technically true.
    if (input.requestedSurfaceId === "bi-viz") {
        // BI requested but disabled. Prefer ai-insights, fall through to
        // ask-pulse if insights is also off (under chatOnly).
        if (availability["ai-insights"]) {
            return {
                requestedSurfaceId: input.requestedSurfaceId,
                effectiveSurfaceId: "ai-insights",
                availability,
                fallbackReason: "bi-pane-disabled-by-aiOnly",
            };
        }
        if (availability["ask-pulse"]) {
            return {
                requestedSurfaceId: input.requestedSurfaceId,
                effectiveSurfaceId: "ask-pulse",
                availability,
                fallbackReason: "bi-pane-disabled-by-aiOnly",
            };
        }
        return noSurfaceAvailable(input.requestedSurfaceId, availability);
    }

    // AI surface requested. Two sub-cases:
    //   - AI pane off entirely (biOnly) → bi-viz.
    //   - AI pane on but specific feature off → other AI surface.
    if (input.enabledComponents === "biOnly") {
        return {
            requestedSurfaceId: input.requestedSurfaceId,
            effectiveSurfaceId: "bi-viz",
            availability,
            fallbackReason: "ai-pane-disabled-by-biOnly",
        };
    }

    if (input.requestedSurfaceId === "ai-insights" && input.enabledFeatures === "chatOnly") {
        if (availability["ask-pulse"]) {
            return {
                requestedSurfaceId: input.requestedSurfaceId,
                effectiveSurfaceId: "ask-pulse",
                availability,
                fallbackReason: "insights-disabled-by-chatOnly",
            };
        }
    }

    if (input.requestedSurfaceId === "ask-pulse" && input.enabledFeatures === "insightsOnly") {
        if (availability["ai-insights"]) {
            return {
                requestedSurfaceId: input.requestedSurfaceId,
                effectiveSurfaceId: "ai-insights",
                availability,
                fallbackReason: "chat-disabled-by-insightsOnly",
            };
        }
    }

    // Last-resort: every explicit rule above is exhaustive for the
    // current `EnabledComponentsInput` × `EnabledFeaturesInput` cross
    // product. Reaching this branch means a future input value was added
    // without a matching rule. Pick the first available surface in
    // registry order so the shell stays renderable, and emit the generic
    // "no-surface-available" reason so callers know a structured fallback
    // wasn't found — better than crashing.
    const firstAvailable = SURFACES.find((s) => availability[s.id]);
    if (firstAvailable) {
        return {
            requestedSurfaceId: input.requestedSurfaceId,
            effectiveSurfaceId: firstAvailable.id,
            availability,
            fallbackReason: "no-surface-available",
        };
    }

    return noSurfaceAvailable(input.requestedSurfaceId, availability);
}

function noSurfaceAvailable(
    requestedSurfaceId: SurfaceId,
    availability: SurfaceAvailability,
): SurfaceResolution {
    return {
        requestedSurfaceId,
        // Default to ai-insights so the shell renders SOMETHING and the
        // empty/error state can take over. This branch is defensive —
        // valid configurations always leave at least one surface live.
        effectiveSurfaceId: "ai-insights",
        availability,
        fallbackReason: "no-surface-available",
    };
}
