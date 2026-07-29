// playground/src/experience/suggestions.ts
//
// "Suggested for You" — up to three next-best actions, computed from the
// prompts already on the page.
//
// Deliberately DETERMINISTIC, not model-generated: every suggestion carries
// the reason it was chosen, and that reason is a fact about the data the user
// can check on screen. A generated suggestion here would need the accuracy
// machinery the rest of the product uses, would cost tokens on page load
// (against the no-spend rule), and could not explain itself honestly.
//
// Suggestions never change permissions or severity — they only reorder
// attention among decisions the server already authorised for this persona.

import type { DecisionPrompt } from "../components/DecisionPromptCard";

export interface Suggestion {
    prompt_id: string;
    /** Short imperative, e.g. "Start with the biggest money at risk". */
    title: string;
    /** The measurable reason this was picked — checkable on screen. */
    why: string;
    headline: string;
    severity: DecisionPrompt["severity"];
}

const TERMINAL = new Set(["actioned", "rejected", "false-positive", "snoozed"]);
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function usd(n: number): string {
    const a = Math.abs(n);
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + " B";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + " MM";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(2) + " M";
    return "$" + Math.round(n);
}

/**
 * Pick at most three, each for a DIFFERENT reason so they don't collapse into
 * "the same card three times":
 *   1. biggest money at risk you can still act on
 *   2. most urgent (severity, then confidence)
 *   3. closest to done — already proposed, just needs an approver
 */
export function suggestDecisions(prompts: DecisionPrompt[]): Suggestion[] {
    const open = prompts.filter((p) => !TERMINAL.has(p.status));
    if (!open.length) return [];

    const out: Suggestion[] = [];
    const taken = new Set<string>();
    const add = (p: DecisionPrompt | undefined, title: string, why: string) => {
        if (!p || taken.has(p.prompt_id) || out.length >= 3) return;
        taken.add(p.prompt_id);
        out.push({ prompt_id: p.prompt_id, title, why, headline: p.headline, severity: p.severity });
    };

    const priced = open
        .filter((p) => p.business_impact_unit === "USD" && Number(p.business_impact_value) > 0)
        .sort((a, b) => Number(b.business_impact_value) - Number(a.business_impact_value));
    if (priced[0]) {
        add(priced[0], "Start with the biggest money at risk",
            `${usd(Number(priced[0].business_impact_value))} is exposed on this one — the largest of any open decision.`);
    }

    const urgent = [...open].sort((a, b) =>
        (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
        || Number(b.confidence_score ?? 0) - Number(a.confidence_score ?? 0));
    if (urgent[0]) {
        add(urgent[0], "Most urgent right now",
            `Rated ${urgent[0].severity} — the highest urgency in your list.`);
    }

    const waiting = open.filter((p) => p.status === "pending-approval");
    if (waiting[0]) {
        add(waiting[0], "Closest to done",
            `Already proposed — it just needs ${(waiting[0].owner || "an approver").replace("Supply Chain ", "the ")} to say yes.`);
    }

    // If the three reasons landed on fewer than three distinct prompts, fill
    // with the next most urgent rather than repeating a reason.
    for (const p of urgent) {
        if (out.length >= 3) break;
        add(p, "Also worth a look", `Rated ${p.severity}, still open.`);
    }
    return out;
}
