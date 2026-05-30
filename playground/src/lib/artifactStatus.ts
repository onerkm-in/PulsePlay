// playground/src/lib/artifactStatus.ts
//
// Thread B — shared status-label module so both the Workbench
// `<ArtifactCard>` and the new `<TrustBadge>` in UnifiedAssistantSurface render
// the four artifact statuses with identical labels and tooltips.
//
// Per feedback_shared_helper_split: when a shape would have impacted
// both surfaces, the helper lives in one module they both import
// rather than diverging copies.
//
// The labels here MUST match the visual treatment baked into
// `playground/src/workbench/workbench.css` (.workbench-artifact-
// status-badge-*). Adding a new status here without adding the
// matching CSS class will fall back to the generic gray badge.

import type { ArtifactStatus } from '../types/assistant';

/** Human-readable labels per status. */
export const STATUS_LABEL: Readonly<Record<ArtifactStatus, string>> = Object.freeze({
    'verified': 'Verified',
    'grounded-draft': 'Grounded draft',
    'suggestion': 'Suggestion',
    'blocked': 'Blocked',
});

/** Hover tooltip explaining the evidence source per status. Kept short
 *  enough to fit native `title=` attributes; richer explanations live
 *  in the per-status `statusReason` field on each artifact. */
export const STATUS_TOOLTIP: Readonly<Record<ArtifactStatus, string>> = Object.freeze({
    'verified': 'Backed by executed SQL and returned rows.',
    'grounded-draft': 'Partially grounded — some claims cite data, others rely on knowledge.',
    'suggestion': 'Pattern-matched or generated. Not backed by your data.',
    'blocked': 'Refused — the validator could not ground the artifact.',
});
