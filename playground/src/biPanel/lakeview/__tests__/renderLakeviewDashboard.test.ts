import { describe, expect, it, vi, beforeEach } from "vitest";
import fixture from "./lakeviewSpec.fixture.json";
import { renderLakeviewDashboard, formatCounterValue, type LakeviewChartsLib } from "../renderLakeviewDashboard";

/**
 * jsdom render test over the REAL trimmed fixture. The charts lib is injected
 * (no canvas in jsdom); fetch is mocked at the two proxy routes the renderer is
 * allowed to call. The assertions that matter:
 *   - datasets are fetched ONCE each, not once per widget
 *   - the browser never sends SQL
 *   - unsupported widgets render an honest fallback card, not a guess
 *   - remote content lands via textContent (no live HTML)
 */

const COUNTER_FIELD = "in_progress_tickets";

function fakeCharts() {
    const instances: Array<{ option: unknown; disposed: boolean }> = [];
    const lib: LakeviewChartsLib = {
        init: () => {
            const inst = { option: null as unknown, disposed: false };
            instances.push(inst);
            return {
                setOption(o: Record<string, unknown>) { inst.option = o; },
                resize() { /* noop */ },
                dispose() { inst.disposed = true; },
            };
        },
    };
    return { lib, instances };
}

function mockFetch() {
    const datasetCalls: Array<Record<string, unknown>> = [];
    const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/dataset")) {
            const body = JSON.parse(String(init?.body || "{}"));
            datasetCalls.push(body);
            return {
                ok: true, status: 200,
                json: async () => ({
                    ok: true,
                    columns: ["source", "count(*)", "agent_group", "count(ticket_id)", "status", COUNTER_FIELD, "monthly(created_time)", "priority"],
                    rows: [
                        ["Chat", 12, "T1", 7, "In progress", 237, "2026-01-01", "High"],
                        ["Email", 9, "T2", 4, "Closed", 0, "2026-02-01", "Low"],
                    ],
                }),
            } as Response;
        }
        return {
            ok: true, status: 200,
            json: async () => ({ ok: true, dashboardId: "dash-1", displayName: "Fixture", spec: fixture }),
        } as Response;
    });
    return { impl: impl as unknown as typeof fetch, datasetCalls };
}

describe("renderLakeviewDashboard", () => {
    let container: HTMLElement;
    beforeEach(() => {
        document.body.innerHTML = "";
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    it("renders the fixture: charts drawn, fallbacks honest, filters hidden", async () => {
        const { lib, instances } = fakeCharts();
        const { impl } = mockFetch();
        const events: Array<Record<string, unknown>> = [];

        const handle = await renderLakeviewDashboard(container, {
            dashboardId: "dash-1", assistantProfile: "genie-scm-poc",
            fetchImpl: impl, loadCharts: async () => lib,
            onEvent: e => events.push(e.payload),
        });

        // bar + pie + line = 3 chart instances from the fixture
        expect(instances.length).toBe(3);
        // counter renders as text, not a chart
        expect(container.querySelector(".lv-counter-value")).toBeTruthy();
        // table renders rows
        expect(container.querySelector(".lv-table")).toBeTruthy();
        // forecast-line + pivot fall back with a stated reason
        const fallbacks = [...container.querySelectorAll(".lv-card--fallback .lv-fallback-reason")];
        expect(fallbacks.length).toBeGreaterThanOrEqual(2);
        expect(fallbacks.every(f => (f.textContent || "").length > 0)).toBe(true);
        // filters are not rendered as dead controls
        expect(container.querySelector(".lv-card--filter")).toBeNull();
        // loaded event carries the coverage split
        const loaded = events.find(e => e.mode === "lakeview-native")!;
        expect(loaded.native).toBe(handle.coverage.native);

        handle.destroy();
        expect(instances.every(i => i.disposed)).toBe(true);
        expect(container.textContent).toBe("");
    });

    it("fetches each dataset once and NEVER sends SQL", async () => {
        const { lib } = fakeCharts();
        const { impl, datasetCalls } = mockFetch();
        await renderLakeviewDashboard(container, {
            dashboardId: "dash-1", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => lib,
        });
        const names = datasetCalls.map(c => c.datasetName);
        expect(new Set(names).size).toBe(names.length); // no duplicates
        for (const call of datasetCalls) {
            expect(call.sql).toBeUndefined();
            expect(call.statement).toBeUndefined();
            expect(call.query).toBeUndefined();
        }
    });

    it("renders a failed dataset as a visible fallback, not a blank or a guess", async () => {
        const { lib } = fakeCharts();
        const impl = vi.fn(async (url: RequestInfo | URL) => {
            const u = String(url);
            if (u.includes("/dataset")) {
                return { ok: false, status: 502, json: async () => ({ error: "warehouse down" }) } as Response;
            }
            return { ok: true, status: 200, json: async () => ({ ok: true, spec: fixture }) } as Response;
        }) as unknown as typeof fetch;

        const errors: Array<Record<string, unknown>> = [];
        await renderLakeviewDashboard(container, {
            dashboardId: "dash-1", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => fakeCharts().lib,
            onEvent: e => { if (e.type === "error") errors.push(e.payload); },
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(container.querySelectorAll(".lv-card--fallback").length).toBeGreaterThan(0);
        void lib;
    });

    it("keeps remote markdown inert - text lands via textContent", async () => {
        const hostile = {
            datasets: [],
            pages: [{ name: "p", layout: [{ widget: { name: "t", multilineTextboxSpec: { lines: ["## Hi <img src=x onerror=alert(1)>", "<script>alert(2)</script>"] } } }] }],
        };
        const impl = vi.fn(async () => ({
            ok: true, status: 200, json: async () => ({ ok: true, spec: hostile }),
        })) as unknown as typeof fetch;

        await renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p", fetchImpl: impl,
            loadCharts: async () => fakeCharts().lib,
        });
        expect(container.querySelector("script")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
        expect(container.textContent).toContain("<script>alert(2)</script>");
    });

    it("surfaces a spec failure as a thrown error the adapter can catch for iframe fallback", async () => {
        const impl = vi.fn(async () => ({
            ok: false, status: 502, json: async () => ({ error: "spec unavailable", detail: "workspace unreachable" }),
        })) as unknown as typeof fetch;
        await expect(renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p", fetchImpl: impl,
        })).rejects.toThrow(/workspace unreachable/);
    });
});

describe("formatCounterValue follows the project number convention", () => {
    it("promotes the unit, never comma-groups", () => {
        expect(formatCounterValue(1_988_032_198)).toBe("1.99 B");
        expect(formatCounterValue(989_340_570)).toBe("989.34 MN");
        expect(formatCounterValue(50_000)).toBe("50.00 M");
        expect(formatCounterValue(237)).toBe("237");
        expect(formatCounterValue(-65_420_000)).toBe("-65.42 MN");
    });
});
