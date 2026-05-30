// playground/src/featureRegistry/types.ts
//
// ARCH-P1 slice 3 — feature-feasibility registry types.
//
// Pattern: VS Code-style contribution-point manifest + TS discriminated
// union with `as const` literals. Adding a feature is one descriptor
// edit; the compiler enforces every consumer handles every entry.
//
// Full design rationale + resolved sign-off questions in:
// docs/research/ARCH_P1_SLICE_3_FEATURE_FEASIBILITY_REGISTRY_HANDOFF_2026-05-27.md
//
// Do NOT add a `runtime` field to SurfaceDescriptor or FeatureDescriptor
// without re-opening the §8 design decisions. The shape here is the
// signed-off contract.

/** The user-visible PulsePlay surfaces. Adding a new surface (e.g. a
 *  future "Mobile" surface) requires a literal here PLUS updating every
 *  consumer the compiler now flags — that's the point. */
export type Surface = "pulse" | "v0" | "dashboard";

/** Surface descriptor — declares identity + which features are
 *  surface-integrant (cannot be ported elsewhere). The resolver never
 *  migrates a coreIdentity feature to another surface; slice 4 won't
 *  render "switch surface" affordances for them either. */
export interface SurfaceDescriptor {
    id: Surface;
    /** Human-readable name for affordances + telemetry. */
    label: string;
    /** Features that ARE this surface's identity. Lane 3 of the research
     *  pass identified these — see §4.3 of the handoff doc. */
    coreIdentity: readonly string[];
}

/** Static enum of every registered feature. Adding a feature requires
 *  a literal here PLUS a matching descriptor in manifest.ts — the
 *  compiler enforces both. */
export type FeatureId =
    | "chat-composer"
    | "chat-history"
    | "frame-picker"
    | "trust-badge"
    | "surface-context-strip"
    | "executive-briefing"
    | "custom-sql-sections"
    | "briefing-exports"
    | "sustainability-orb"
    | "bi-iframe-canvas"
    | "sectioned-chat";

/** One descriptor per feature. */
export interface FeatureDescriptor {
    id: FeatureId;
    label: string;
    /** Surfaces that render this feature today. Empty array means the
     *  feature is registered but not yet shipped anywhere — slice 4
     *  affordances will render "coming soon" instead of "switch surface". */
    surfaces: readonly Surface[];
    /** The surface the resolver should prefer when this feature is
     *  required AND multiple surfaces support it. Must be in `surfaces`
     *  (asserted by the manifest test). */
    preferredSurface: Surface;
    /** Optional: this feature is gated by a runtime flag the resolver
     *  may consult. Declared in slice 3 per Q4 sign-off; consumed in
     *  slice 4 (graceful affordances). Slice 3's resolver does NOT
     *  yet read this field. */
    runtimeGate?: () => boolean;
}

/** Slice 4 will render `<SwitchSurfaceAffordance featureId={...}/>`. The
 *  surface descriptors expose this hint so slice 4 can find the right
 *  target surface for the "switch to access" link. Not consumed in
 *  slice 3 but defined here so the type contract is stable. */
export type FallbackHint =
    | { kind: "switch-surface"; target: Surface }
    | { kind: "coming-soon" }
    | { kind: "core-identity" };

export const SURFACES: readonly SurfaceDescriptor[] = [
    {
        id: "pulse",
        label: "PulseShell",
        coreIdentity: ["tab-strip-3", "executive-briefing-grid"],
    },
    {
        id: "v0",
        label: "Ask Pulse (UnifiedAssistantSurface)",
        coreIdentity: ["single-pane-chat"],
    },
    {
        id: "dashboard",
        label: "Dashboard",
        coreIdentity: ["bi-vendor-embed"],
    },
] as const;
