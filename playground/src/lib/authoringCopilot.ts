// authoringCopilot.ts
//
// Composes the authoring proposals PulsePlay can already justify from a
// DiscoverySnapshot into ONE reviewable bundle.
//
// Why this exists: the deterministic drafters (promptDraftGenerator,
// metricDirectionInference) are real and good, but each sits behind its own
// button in a different Settings sub-panel. An author has to know all of them
// exist and run them one at a time — which is why most of the ~100-field setup
// still gets typed by hand.
//
// Deliberately RULES-FIRST. Every proposal here is deterministic and carries a
// `because` trace, so the author can see WHY it was proposed. An LLM pass can
// be layered on later for the genuinely subjective prose — it is not needed to
// make this useful, and adding it first would put an unverifiable draft in
// front of the author with no provenance.
//
// Two properties this must never violate:
//   1. Never invent. No snapshot signal => no proposal (honest empty state),
//      inherited from promptDraftGenerator returning null.
//   2. Never silently stomp. A proposal over existing author content is
//      flagged `overwrites` so the UI can warn instead of replacing quietly.

import { buildPromptDrafts } from "./promptDraftGenerator";
import { inferMetricRulesFromBindings } from "./metricDirectionInference";
import { extractMeasuresAndDimensions } from "./insightsSuggestClient";
import type { DiscoverySnapshot } from "./discoveryClient";

/** Settings fields this composer can propose values for. */
// `insightsDomainGuidance` (not the shared `domainGuidance`) is what the
// Insights drafter produces and what the AI settings slice exposes — naming the
// field for the setting it actually writes avoids a silent mis-mapping.
export type AuthoringField = "insightsPrompt" | "insightsDomainGuidance" | "metricDirectionRules";

export type ProposalConfidence = "high" | "medium" | "low";

export interface AuthoringProposal {
    field: AuthoringField;
    /** Human label for the review UI. */
    label: string;
    /** The proposed value, ready to write into settings verbatim. */
    value: string;
    /** How this was produced. Only deterministic sources today — an LLM-backed
     *  proposal must say so, so the author can weigh it differently. */
    source: "deterministic";
    confidence: ProposalConfidence;
    /** Grounded reasons, shown to the author. Never empty. */
    because: string[];
    /** The author already has content in this field — applying replaces it. */
    overwrites: boolean;
}

export interface AuthoringProposalBundle {
    proposals: AuthoringProposal[];
    /** One-line provenance ("5 measures · 3 dimensions · Genie"), "" when empty. */
    summary: string;
    /** No usable signal in the snapshot — the UI should say so rather than
     *  render an empty list that looks like a failure. */
    noSignal: boolean;
}

export interface AuthoringCopilotInput {
    snapshot: DiscoverySnapshot | null;
    /** Current settings values, so we can flag overwrites and skip no-ops. */
    current?: Partial<Record<AuthoringField, string>>;
    /** Author-typed domain, passed through to the drafters. */
    domainHint?: string;
}

const EMPTY: AuthoringProposalBundle = { proposals: [], summary: "", noSignal: true };

/** Describe what the snapshot actually gave us — reused across proposals so
 *  every `because` trace is consistent and checkable. */
function describeSignal(snapshot: DiscoverySnapshot | null): string[] {
    const out: string[] = [];
    const { measures, dimensions } = extractMeasuresAndDimensions(snapshot);
    if (measures.length > 0) out.push(`${measures.length} measure${measures.length === 1 ? "" : "s"} discovered from the live connection`);
    if (dimensions.length > 0) out.push(`${dimensions.length} dimension${dimensions.length === 1 ? "" : "s"} discovered`);
    const kpis = snapshot?.fused?.availableKpis;
    if (Array.isArray(kpis) && kpis.length > 0) {
        const defined = kpis.filter(k => k && (k.definition || k.direction || k.units)).length;
        if (defined > 0) out.push(`${defined} KPI definition${defined === 1 ? "" : "s"} from the knowledge pack`);
    }
    return out;
}

function confidenceFromSignal(measureCount: number, kpiCount: number): ProposalConfidence {
    if (measureCount >= 3 && kpiCount > 0) return "high";
    if (measureCount >= 1) return "medium";
    return "low";
}

/** Build every proposal we can justify from the snapshot. Pure — no I/O, no
 *  network, no spend — so the caller controls when discovery actually runs. */
export function buildAuthoringProposals(input: AuthoringCopilotInput): AuthoringProposalBundle {
    const { snapshot, current = {}, domainHint } = input || ({} as AuthoringCopilotInput);

    const drafts = buildPromptDrafts(snapshot, domainHint);
    const { measures } = extractMeasuresAndDimensions(snapshot);
    const kpis = snapshot?.fused?.availableKpis;
    const kpiCount = Array.isArray(kpis) ? kpis.length : 0;
    const signal = describeSignal(snapshot);

    // No drafts AND no measures => nothing honest to say.
    if (!drafts && measures.length === 0) return EMPTY;

    const proposals: AuthoringProposal[] = [];
    const conf = confidenceFromSignal(measures.length, kpiCount);
    const baseBecause = signal.length > 0 ? signal : ["Derived from the connected data source"];

    const add = (field: AuthoringField, label: string, value: string, because: string[], confidence: ProposalConfidence) => {
        const trimmed = (value || "").trim();
        if (!trimmed) return;
        const existing = (current[field] || "").trim();
        // Proposing what the author already has is noise, not help.
        if (existing === trimmed) return;
        proposals.push({
            field, label, value: trimmed, source: "deterministic",
            confidence, because, overwrites: existing.length > 0,
        });
    };

    if (drafts) {
        add("insightsPrompt", "Insights prompt", drafts.insightsPrompt, baseBecause, conf);
        add("insightsDomainGuidance", "Domain guidance", drafts.guidance, baseBecause, conf);
    }

    // Metric directions: only propose when the heuristic was actually confident
    // about something. It deliberately drops metrics it can't classify rather
    // than guessing a direction, so a low ratio means "mostly unknown".
    if (measures.length > 0) {
        const inferred = inferMetricRulesFromBindings(measures);
        if (inferred.rules.trim() && inferred.confidentCount > 0) {
            const ratio = inferred.confidentCount / Math.max(1, inferred.totalInspected);
            add(
                "metricDirectionRules",
                "Metric direction rules",
                inferred.rules,
                [
                    `${inferred.confidentCount} of ${inferred.totalInspected} measure${inferred.totalInspected === 1 ? "" : "s"} classified by name`,
                    "Measures that could not be classified confidently were left out",
                ],
                ratio >= 0.6 ? "high" : ratio >= 0.3 ? "medium" : "low",
            );
        }
    }

    if (proposals.length === 0) {
        // We had signal but everything matched what the author already wrote —
        // that is a success, not an empty state.
        return { proposals: [], summary: drafts?.summary || "", noSignal: false };
    }

    return { proposals, summary: drafts?.summary || "", noSignal: false };
}

/** Fold accepted proposals into a settings patch. The caller decides which
 *  proposals were accepted — nothing is applied implicitly. */
export function applyProposals(
    accepted: ReadonlyArray<AuthoringProposal>,
): Partial<Record<AuthoringField, string>> {
    const patch: Partial<Record<AuthoringField, string>> = {};
    for (const p of accepted || []) {
        if (!p || !p.field || typeof p.value !== "string") continue;
        patch[p.field] = p.value;
    }
    return patch;
}
