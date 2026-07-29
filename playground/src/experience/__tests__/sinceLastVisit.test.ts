import { describe, expect, it, beforeEach } from "vitest";
import { diffSinceLastVisit, writeSnapshot } from "../sinceLastVisit";
import { suggestDecisions } from "../suggestions";
import type { DecisionPrompt } from "../../components/DecisionPromptCard";

/**
 * These two regions replaced "COMING SOON" placeholders. They are computed
 * from prompts the page already fetched — no extra query, no model call — so
 * the contract worth pinning is: never claim a change we cannot evidence, and
 * never suggest something the user cannot act on.
 */
function p(over: Partial<DecisionPrompt>): DecisionPrompt {
    return {
        prompt_id: "x", rule_id: "SCM-1", kpi: "K", severity: "high", confidence: "high",
        headline: "H", issue: "", root_cause: "", root_cause_category: "",
        recommended_action: "a", action_code: "c", action_level: 2, approval_required: false,
        business_impact_value: 100, business_impact_unit: "USD", business_impact_label: "l",
        persona: "P", owner: "Supply Chain Manager", status: "new", narrative: "",
        evidence_signature: "s", allowed_actions: [], ...over,
    } as DecisionPrompt;
}

describe("since last visit", () => {
    beforeEach(() => window.localStorage.clear());

    it("returns null on a first visit — claiming 'N new' with no baseline would be a lie", () => {
        expect(diffSinceLastVisit([p({ prompt_id: "a" })])).toBeNull();
    });

    it("reports new, resolved and updated against the previous snapshot", () => {
        writeSnapshot([
            p({ prompt_id: "a", status: "new" }),
            p({ prompt_id: "b", status: "pending-approval" }),
        ]);
        const d = diffSinceLastVisit([
            p({ prompt_id: "a", status: "new" }),                    // unchanged -> absent
            p({ prompt_id: "b", status: "actioned" }),               // resolved
            p({ prompt_id: "c", status: "new" }),                    // new
        ]);
        const kinds = Object.fromEntries((d?.changes || []).map(c => [c.prompt_id, c.kind]));
        expect(kinds).toEqual({ b: "resolved", c: "new" });
    });

    it("says nothing changed when nothing changed", () => {
        writeSnapshot([p({ prompt_id: "a", status: "new" })]);
        expect(diffSinceLastVisit([p({ prompt_id: "a", status: "new" })])?.changes).toEqual([]);
    });
});

describe("suggestions", () => {
    it("suggests nothing when every decision is closed", () => {
        expect(suggestDecisions([p({ status: "actioned" }), p({ status: "rejected" })])).toEqual([]);
    });

    it("leads with the biggest money at risk and explains why", () => {
        const picks = suggestDecisions([
            p({ prompt_id: "small", business_impact_value: 500 }),
            p({ prompt_id: "big", business_impact_value: 90000 }),
        ]);
        expect(picks[0].prompt_id).toBe("big");
        expect(picks[0].why).toContain("$90.00 M"); // Roman scale: M = thousand
    });

    it("never repeats a prompt and never exceeds three", () => {
        const picks = suggestDecisions([
            p({ prompt_id: "a", severity: "critical", business_impact_value: 9000 }),
            p({ prompt_id: "b", severity: "high", status: "pending-approval" }),
            p({ prompt_id: "c", severity: "medium" }),
            p({ prompt_id: "d", severity: "low" }),
        ]);
        expect(picks.length).toBeLessThanOrEqual(3);
        expect(new Set(picks.map(s => s.prompt_id)).size).toBe(picks.length);
    });
});
