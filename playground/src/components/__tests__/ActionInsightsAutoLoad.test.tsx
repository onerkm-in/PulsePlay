import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { ActionInsightsPanel } from "../ActionInsightsPanel";

/**
 * The Decisions surface used to require a "Load decisions" click before it
 * fetched anything. That starved the whole cockpit — the KPI strip, the
 * severity donut and the impact totals all derive from THIS fetch, so an
 * unclicked page rendered "0 open / n/a impact" as though the queue were clear.
 *
 * These pin the replacement contract, including the part that keeps it cheap:
 * the auto-load is bounded to ONE fetch per scope per session and is skipped
 * entirely when the session cache is warm.
 */

const CACHE_KEY = "pulseplay:action-insights-cache:v1";

const PROMPT = {
    prompt_id: "p1", rule_id: "SCM-FA-001", kpi: "Forecast Accuracy",
    severity: "critical", confidence: "high", headline: "Forecast accuracy below target",
    issue: "issue", root_cause: "bias", root_cause_category: "demand",
    recommended_action: "Trigger forecast bias review", action_code: "trigger_forecast_review",
    action_level: 3, approval_required: true, business_impact_value: 90166,
    business_impact_unit: "units", business_impact_label: "forecast error",
    persona: "Supply Chain Planner", owner: "Supply Chain Manager", status: "new",
    narrative: "ACTION QUESTION: proceed?", evidence_signature: "sig",
    allowed_actions: ["trigger_forecast_review"],
};

const BODY = {
    ok: true, persona: "Supply Chain Planner", personaSource: "demo",
    capabilities: [], prompts: [PROMPT],
};

function mockFetchOk() {
    const spy = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => BODY,
    } as unknown as Response);
    vi.stubGlobal("fetch", spy);
    return spy;
}

describe("Decisions auto-load", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        window.localStorage.clear();
    });
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it("fetches on mount without any click when the cache is cold", async () => {
        const spy = mockFetchOk();
        render(<ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" />);

        await waitFor(() => expect(spy).toHaveBeenCalled());
        const url = String(spy.mock.calls[0][0]);
        expect(url).toContain("/insights/action-insights");
        // The prompt store needs a warehouse-capable profile, so the active one
        // must ride along — without it the server can resolve a non-warehouse
        // profile and 400 the whole panel.
        expect(url).toContain("genie-scm-poc");

        await waitFor(() =>
            expect(screen.getByText("Forecast accuracy below target")).toBeTruthy());
    });

    it("shows skeleton cards while the cold warehouse wakes, not blank space", async () => {
        // A fetch that never settles — the loading state is what's under test.
        vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => { })));
        render(<ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" />);

        await waitFor(() =>
            expect(screen.getByTestId("action-insights-skeleton")).toBeTruthy());
    });

    it("does NOT fetch when the session cache is warm — a revisit costs nothing", async () => {
        window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            key: "/api|genie-scm-poc|",
            fetchedAt: Date.now(),
            body: BODY,
        }));
        const spy = mockFetchOk();
        render(<ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" />);

        await waitFor(() =>
            expect(screen.getByText("Forecast accuracy below target")).toBeTruthy());
        expect(spy).not.toHaveBeenCalled();
    });

    it("auto-loads AT MOST once per scope, even across re-renders", async () => {
        const spy = mockFetchOk();
        const { rerender } = render(
            <ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" />);
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

        // A new inline onData identity per render is the common parent pattern;
        // it must not retrigger the warehouse.
        for (let i = 0; i < 3; i++) {
            rerender(<ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" onData={() => { }} />);
        }
        await new Promise(r => setTimeout(r, 20));
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe("initial-load timer", () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        window.localStorage.clear();
    });
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

    it("counts elapsed time while the warehouse wakes, so the wait visibly progresses", async () => {
        vi.useFakeTimers();
        // a fetch that never settles - the loading state is what's under test
        vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => { })));
        render(<ActionInsightsPanel proxyBase="/api" assistantProfile="genie-scm-poc" />);

        expect(screen.getByTestId("action-insights-timer").textContent).toBe("0:00");
        await act(async () => { vi.advanceTimersByTime(7000); });
        expect(screen.getByTestId("action-insights-timer").textContent).toBe("0:07");
        // the message escalates honestly instead of pretending it is instant
        expect(screen.getByTestId("action-insights-skeleton").textContent).toContain("Waking the data warehouse");
        await act(async () => { vi.advanceTimersByTime(60000); });
        expect(screen.getByTestId("action-insights-timer").textContent).toBe("1:07");
        expect(screen.getByTestId("action-insights-skeleton").textContent).toContain("taking longer than usual");
    });
});
