// playground/src/lib/computeSurfaceContext.ts
//
// Shared helper that computes the surface-context chip values + the
// evidence-aware trust label for the assistant surfaces (PulseShell and
// UnifiedAssistantSurface). Single source of truth so the trust ladder
// shipped in 63efe1e cannot drift between surfaces.
//
// Honest by construction: takes only the signals it needs, no React, no
// settings store. Callers normalize their inputs and trust this helper to
// return the same shape regardless of which surface they live in.

export interface SurfaceContextInput {
    /** AI assistant is configured (proxy reachable + profile picked, OR
     *  direct mode with host+token+space). UnifiedAssistantSurface uses
     *  `Boolean(activeConnector?.trim())`; PulseShell computes a deeper
     *  isConfigured because it also supports direct mode. */
    isConfigured: boolean;
    /** Display label for the active AI profile. Falls back to "Default
     *  profile" when unset. */
    assistantProfile: string;
    /** What the surface IS doing right now — e.g. "Conversation" for chat,
     *  "Executive briefing" for AI Insights. Chip label "Surface · {mode}". */
    mode: string;
    /** Count of user-applied filters (excluding the all-data sentinel).
     *  Drives "All visible data" vs the scope label below. */
    selectedFilterCount: number;
    /** Human-readable scope label when filters are applied — e.g. "FY26
     *  Q1, North region". Ignored when selectedFilterCount === 0. */
    currentScopeLabel: string;
    /** BI metadata bound to the prompt context. measure + dimension counts
     *  drive the Source chip ("3 metrics / 12 dimensions" vs "No BI fields
     *  bound" vs "BI context off"). */
    measureCount: number;
    dimensionCount: number;
    /** Author setting — when false, surface explicitly does NOT send BI
     *  context (PulseShell calls this `sendContextToGenie`; v0 surfaces
     *  generally pass true because they have no equivalent toggle yet). */
    sendContextToAi: boolean;
}

export interface SurfaceContextValue {
    assistant: string;
    mode: string;
    source: string;
    scope: string;
    /** Evidence-aware ladder — one of:
     *    "Setup needed"
     *    "AI configured · Context off"
     *    "AI configured · No BI fields"
     *    "Grounded to BI context" */
    trust: string;
}

/** Pure function — given normalized signals, return the chip values + the
 *  trust label. The trust ladder is the load-bearing piece: the 4 states
 *  were shipped in 63efe1e (Codex audit P1 #13) and must NOT drift between
 *  surfaces. See [feature_no_ungrounded_artifacts] for the accuracy
 *  contract this label honors. */
export function computeSurfaceContext(input: SurfaceContextInput): SurfaceContextValue {
    const source = !input.sendContextToAi
        ? "BI context off"
        : input.measureCount > 0 || input.dimensionCount > 0
            ? `${input.measureCount} metrics / ${input.dimensionCount} dimensions`
            : "No BI fields bound";

    const scope = input.selectedFilterCount > 0 ? input.currentScopeLabel : "All visible data";

    const trust = !input.isConfigured
        ? "Setup needed"
        : !input.sendContextToAi
            ? "AI configured · Context off"
            : input.measureCount === 0 && input.dimensionCount === 0
                ? "AI configured · No BI fields"
                : "Grounded to BI context";

    return {
        assistant: input.assistantProfile?.trim() || "Default profile",
        mode: input.mode,
        source,
        scope,
        trust,
    };
}
