import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import {
    ActionInsightsPanel,
    decisionMatchesView,
    type DecisionViewFilter,
} from "../ActionInsightsPanel";
import type { DecisionPrompt } from "../DecisionPromptCard";

/**
 * The cockpit's interactive summary (KPI tiles, severity bars, donut legend)
 * applies a DISPLAY filter over the decision list. Contract under test:
 * filtering changes what is SHOWN, never what was fetched — and a filtered
 * view that matches nothing says so rather than rendering an empty gap.
 */

function prompt(over: Partial<DecisionPrompt>): DecisionPrompt {
    return {
        prompt_id: "p", rule_id: "r", kpi: "K", severity: "high", confidence: "high",
        headline: "H", issue: "i", root_cause: "rc", root_cause_category: "c",
        recommended_action: "act", action_code: "a", action_level: 2,
        approval_required: false, business_impact_value: 1, business_impact_unit: "USD",
        business_impact_label: "l", persona: "P", owner: "O", status: "new",
        narrative: "", evidence_signature: "s", allowed_actions: [],
        ...over,
    } as DecisionPrompt;
}

describe("decisionMatchesView", () => {
    it("no view matches everything", () => {
        expect(decisionMatchesView(prompt({}), null)).toBe(true);
        expect(decisionMatchesView(prompt({}), undefined)).toBe(true);
    });

    it("severity filters exactly", () => {
        const v: DecisionViewFilter = { severity: "critical" };
        expect(decisionMatchesView(prompt({ severity: "critical" }), v)).toBe(true);
        expect(decisionMatchesView(prompt({ severity: "high" }), v)).toBe(false);
    });

    it("awaiting-approval means approval_required AND still open", () => {
        const v: DecisionViewFilter = { status: "awaiting-approval" };
        expect(decisionMatchesView(prompt({ approval_required: true, status: "pending-approval" }), v)).toBe(true);
        expect(decisionMatchesView(prompt({ approval_required: true, status: "actioned" }), v)).toBe(false);
        expect(decisionMatchesView(prompt({ approval_required: false, status: "new" }), v)).toBe(false);
    });

    it("resolved means a terminal status", () => {
        const v: DecisionViewFilter = { status: "resolved" };
        expect(decisionMatchesView(prompt({ status: "actioned" }), v)).toBe(true);
        expect(decisionMatchesView(prompt({ status: "snoozed" }), v)).toBe(true);
        expect(decisionMatchesView(prompt({ status: "new" }), v)).toBe(false);
    });
});

describe("ActionInsightsPanel view prop", () => {
    const BODY = {
        ok: true, persona: "Supply Chain Planner", personaSource: "demo", capabilities: [],
        prompts: [
            prompt({ prompt_id: "c1", severity: "critical", headline: "Critical one" }),
            prompt({ prompt_id: "h1", severity: "high", headline: "High one" }),
        ],
    };

    beforeEach(() => {
        window.sessionStorage.clear();
        window.localStorage.clear();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => BODY,
        } as unknown as Response));
    });
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it("shows only prompts matching the view, without refetching", async () => {
        const { rerender } = render(
            <ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" />);
        await waitFor(() => expect(screen.getByText("Critical one")).toBeTruthy());
        expect(screen.getByText("High one")).toBeTruthy();
        const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

        rerender(<ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" view={{ severity: "critical" }} />);
        expect(screen.getByText("Critical one")).toBeTruthy();
        expect(screen.queryByText("High one")).toBeNull();
        // display-only: the filter must not touch the network
        expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCalls);
    });

    it("says so when the view matches nothing", async () => {
        render(<ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" view={{ severity: "low" }} />);
        await waitFor(() => expect(screen.getByText("Nothing matches this view.")).toBeTruthy());
    });
});
