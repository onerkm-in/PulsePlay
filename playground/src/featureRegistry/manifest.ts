// playground/src/featureRegistry/manifest.ts
//
// ARCH-P1 slice 3 — the canonical feature-feasibility manifest.
//
// 11 entries cover the high-signal features that materially differ
// across surfaces (per Lane 3 of the research pass). The remaining
// ~35 features in the codebase get tagged incrementally as future
// PRs touch them — per Q3 of the §8 sign-off, this slice does NOT
// try to land all 46.
//
// Adding a feature requires:
//   1. Add its literal to FeatureId in types.ts
//   2. Add its descriptor here (in any position — order is not
//      load-bearing for the resolver)
//   3. The compiler will then flag every switch / Extract that needs
//      to handle the new literal.

import type { FeatureDescriptor } from "./types";

/** Inline the localStorage check rather than importing
 *  isSectionedChatEnabled from UnifiedAssistantSurface — that import
 *  direction would create a future cycle when slice 4's
 *  <SwitchSurfaceAffordance/> renders inside UnifiedAssistantSurface
 *  and reads the manifest. The localStorage key matches
 *  UnifiedAssistantSurface.isSectionedChatEnabled() exactly. */
function isSectionedChatEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem("pulseplay:chat-sectioned-enabled") === "1";
    } catch {
        return false;
    }
}

export const FEATURE_MANIFEST: readonly FeatureDescriptor[] = [
    // ─── Cross-surface chat primitives ──────────────────────────────────
    {
        id: "chat-composer",
        label: "Chat composer",
        surfaces: ["pulse", "v0"],
        preferredSurface: "v0",
    },
    {
        id: "chat-history",
        label: "Chat history",
        surfaces: ["pulse", "v0"],
        preferredSurface: "v0",
    },
    {
        id: "frame-picker",
        label: "FramePicker",
        surfaces: ["pulse", "v0"],
        preferredSurface: "v0",
    },
    {
        id: "trust-badge",
        label: "TrustBadge",
        surfaces: ["pulse", "v0"],
        preferredSurface: "v0",
    },
    {
        id: "surface-context-strip",
        label: "Surface context strip",
        surfaces: ["pulse", "v0"],
        preferredSurface: "v0",
    },

    // ─── PulseShell-exclusive features (the briefing-heritage stack) ───
    {
        id: "executive-briefing",
        label: "Executive briefing",
        surfaces: ["pulse"],
        preferredSurface: "pulse",
    },
    {
        id: "custom-sql-sections",
        label: "Custom SQL sections",
        surfaces: ["pulse"],
        preferredSurface: "pulse",
    },
    {
        id: "briefing-exports",
        label: "Briefing exports (PDF/PNG/XLSX/MD)",
        surfaces: ["pulse"],
        preferredSurface: "pulse",
    },
    {
        id: "sustainability-orb",
        label: "Sustainability indicator orb",
        surfaces: ["pulse"],
        preferredSurface: "pulse",
    },

    // ─── Dashboard-exclusive ────────────────────────────────────────────
    {
        id: "bi-iframe-canvas",
        label: "BI iframe canvas",
        surfaces: ["dashboard"],
        preferredSurface: "dashboard",
    },

    // ─── Runtime-gated (the runtimeGate field's first consumer) ────────
    // Slice 3 does NOT yet read runtimeGate in the resolver — that's
    // slice 4's job (graceful affordances). The field is declared here
    // so slice 4 doesn't need a type migration.
    {
        id: "sectioned-chat",
        label: "Sectioned chat (Genie HEADLINE/TRENDS/RISKS/ACTIONS)",
        surfaces: ["pulse", "v0"],
        preferredSurface: "v0",
        runtimeGate: isSectionedChatEnabled,
    },
];
