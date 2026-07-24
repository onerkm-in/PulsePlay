// Pin-to-canvas coverage for DecisionPromptCard: the button appears only with
// evidence SQL + a bound profile, binds the :mk/:pmk parameters before running,
// and creates a SQL-backed canvas tile via /sql/preview (no LLM route).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DecisionPromptCard, type DecisionPrompt } from "../DecisionPromptCard";
import { listCanvasTiles } from "../../lib/canvasTiles";

function mount(ui: React.ReactElement): { container: HTMLElement; root: Root } {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, root };
}
async function flush(): Promise<void> {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

const BASE: DecisionPrompt = {
    prompt_id: "p1", rule_id: "SCM-FA-001", kpi: "Forecast Accuracy", severity: "critical",
    confidence: "high", headline: "Forecast Accuracy low for APAC / Seasonal", issue: "…",
    root_cause: "bias", root_cause_category: "forecast", recommended_action: "Trigger forecast bias review",
    action_code: "trigger_forecast_review", action_level: 3, approval_required: true,
    business_impact_value: 90166, business_impact_unit: "units", business_impact_label: "FORECAST ERROR",
    persona: "Supply Chain Planner", owner: "Supply Chain Manager", status: "new",
    narrative: "…", evidence_signature: "sig",
    evidence_sql: "SELECT * FROM t WHERE month_key = :mk OR month_key = :pmk",
    category: "Seasonal", region: "APAC", month_key: 202512,
    allowed_actions: ["trigger_forecast_review", "snooze"],
};

function mockPreview(body: unknown, ok = true) {
    return vi.spyOn(globalThis, "fetch" as never).mockResolvedValue({
        ok, status: ok ? 200 : 500, json: async () => body,
    } as never);
}

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("DecisionPromptCard — pin to canvas", () => {
    it("pins the bound evidence SQL as a canvas tile via /sql/preview (no LLM)", async () => {
        const fetchSpy = mockPreview({ ok: true, columns: ["category", "val"], rows: [["Seasonal", 67.8]] });
        const state = mount(
            <DecisionPromptCard prompt={BASE} onAction={() => {}} busy={false} maxImpact={90166} connectorProfileId="genie" />,
        );
        const pin = state.container.querySelector(".dpc__pin") as HTMLButtonElement;
        expect(pin).toBeTruthy();
        act(() => { pin.click(); });
        await flush();

        // Exactly one backend call, to the SQL preview — never an assistant route.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const url = fetchSpy.mock.calls[0][0] as string;
        expect(url).toContain("/sql/preview");
        const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
        // :mk / :pmk bound; no raw parameters survive into the sent query.
        expect(body.sql).toContain("202512");
        expect(body.sql).toContain("202511");
        expect(body.sql).not.toContain(":mk");

        const tiles = listCanvasTiles();
        expect(tiles).toHaveLength(1);
        expect(tiles[0].connectorProfileId).toBe("genie");
        expect(pin.textContent).toContain("Pinned");
    });

    it("hides the pin button when there is no evidence SQL", () => {
        const state = mount(
            <DecisionPromptCard prompt={{ ...BASE, evidence_sql: null }} onAction={() => {}} busy={false} maxImpact={1} connectorProfileId="genie" />,
        );
        expect(state.container.querySelector(".dpc__pin")).toBeNull();
    });

    it("hides the pin button when no connector profile is bound", () => {
        const state = mount(
            <DecisionPromptCard prompt={BASE} onAction={() => {}} busy={false} maxImpact={1} />,
        );
        expect(state.container.querySelector(".dpc__pin")).toBeNull();
    });

    it("shows an error and pins nothing when a parameter can't be derived", async () => {
        mockPreview({ ok: true, columns: ["c"], rows: [[1]] });
        const state = mount(
            <DecisionPromptCard
                prompt={{ ...BASE, evidence_sql: "SELECT * FROM t WHERE month_key = :mk AND on_time < :thr" }}
                onAction={() => {}} busy={false} maxImpact={1} connectorProfileId="genie"
            />,
        );
        const pin = state.container.querySelector(".dpc__pin") as HTMLButtonElement;
        act(() => { pin.click(); });
        await flush();
        expect(state.container.querySelector(".dpc__pin-error")?.textContent).toMatch(/thr/);
        expect(listCanvasTiles()).toHaveLength(0);
    });
});
