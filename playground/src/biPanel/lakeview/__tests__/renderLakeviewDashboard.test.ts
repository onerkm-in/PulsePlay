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

        await handle.whenFilled;

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

    it("asks per chart widget (so the proxy can push the GROUP BY down) and once per shared dataset", async () => {
        const { lib } = fakeCharts();
        const { impl, datasetCalls } = mockFetch();
        const h = await renderLakeviewDashboard(container, {
            dashboardId: "dash-1", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => lib,
        });
        await h.whenFilled;

        const chartCalls = datasetCalls.filter(c => c.widgetName);
        const sharedCalls = datasetCalls.filter(c => !c.widgetName);

        // one request per widget that aggregates, each naming its widget so the
        // server derives that widget's aggregation from the spec. Counters
        // aggregate too - a countdistinct() encoding names a value the raw
        // dataset does not carry.
        expect(chartCalls.length).toBe(4); // bar + pie + line + counter
        expect(new Set(chartCalls.map(c => c.widgetName)).size).toBe(chartCalls.length);

        // counters and tables read rows as they are, so they share one fetch per
        // dataset - no duplicates among those
        const sharedNames = sharedCalls.map(c => c.datasetName);
        expect(new Set(sharedNames).size).toBe(sharedNames.length);
    });

    it("NEVER sends SQL, on any request shape", async () => {
        const { lib } = fakeCharts();
        const { impl, datasetCalls } = mockFetch();
        const h2 = await renderLakeviewDashboard(container, {
            dashboardId: "dash-1", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => lib,
        });
        await h2.whenFilled;
        expect(datasetCalls.length).toBeGreaterThan(0);
        for (const call of datasetCalls) {
            expect(call.datasetName).toBeTruthy();
            expect(call.sql).toBeUndefined();
            expect(call.statement).toBeUndefined();
            expect(call.query).toBeUndefined();
            expect(call.queryText).toBeUndefined();
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
        const h3 = await renderLakeviewDashboard(container, {
            dashboardId: "dash-1", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => fakeCharts().lib,
            onEvent: e => { if (e.type === "error") errors.push(e.payload); },
        });
        await h3.whenFilled;
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

        const h4 = await renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p", fetchImpl: impl,
            loadCharts: async () => fakeCharts().lib,
        });
        await h4.whenFilled;
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

describe("sequential fill", () => {
    let container: HTMLElement;
    beforeEach(() => {
        document.body.innerHTML = "";
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    /** A fetch whose dataset responses only resolve when released. */
    function gatedFetch() {
        const gates: Array<() => void> = [];
        let inFlight = 0;
        let maxConcurrent = 0;
        const impl = vi.fn(async (url: RequestInfo | URL) => {
            if (!String(url).includes("/dataset")) {
                return { ok: true, status: 200, json: async () => ({ ok: true, spec: fixture }) } as Response;
            }
            inFlight += 1;
            maxConcurrent = Math.max(maxConcurrent, inFlight);
            await new Promise<void>(release => gates.push(release));
            inFlight -= 1;
            return {
                ok: true, status: 200,
                json: async () => ({ ok: true, columns: ["source", "count(*)"], rows: [["Chat", 1]] }),
            } as Response;
        });
        return { impl: impl as unknown as typeof fetch, gates, peak: () => maxConcurrent };
    }


    /** Release gates as they appear. Each fetch is only created after the
     *  previous one resolves, so a single forEach would release just the
     *  first - which is itself the sequential guarantee under test. */
    async function drain(gates: Array<() => void>, handle: { whenFilled: Promise<void> }) {
        let done = false;
        void handle.whenFilled.then(() => { done = true; });
        for (let i = 0; i < 200 && !done; i++) {
            while (gates.length) gates.shift()!();
            await Promise.resolve();
            await new Promise(r => setTimeout(r, 0));
        }
        await handle.whenFilled;
    }

    it("paints the whole shell BEFORE any widget data arrives", async () => {
        const { impl, gates } = gatedFetch();
        const handle = await renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => fakeCharts().lib,
        });

        // render() has returned but nothing has been released yet
        expect(container.querySelectorAll(".lv-card").length).toBeGreaterThan(0);
        expect(container.querySelectorAll(".lv-card-pending").length).toBeGreaterThan(0);

        await drain(gates, handle);
        expect(container.querySelector(".lv-card-pending")).toBeNull();
    });

    it("issues ONE statement at a time, never a burst", async () => {
        const { impl, gates, peak } = gatedFetch();
        const handle = await renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => fakeCharts().lib,
        });

        await drain(gates, handle);
        expect(peak()).toBe(1);
    });

    it("destroy() stops the fill loop instead of writing into a torn-down DOM", async () => {
        const { impl, gates } = gatedFetch();
        const handle = await renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p",
            fetchImpl: impl, loadCharts: async () => fakeCharts().lib,
        });
        handle.destroy();
        await drain(gates, handle);
        expect(container.textContent).toBe("");
    });
});

describe("never charts a truncated sample", () => {
    let container: HTMLElement;
    beforeEach(() => {
        document.body.innerHTML = "";
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    /** The server declined this widget's aggregation AND capped the rows. */
    function declinedAndTruncated() {
        return vi.fn(async (url: RequestInfo | URL) => {
            if (!String(url).includes("/dataset")) {
                return { ok: true, status: 200, json: async () => ({ ok: true, spec: fixture }) } as Response;
            }
            return {
                ok: true, status: 200,
                json: async () => ({
                    ok: true,
                    aggregated: false,
                    truncated: true,
                    totalRows: 5000,
                    columns: ["source", "count(*)", "agent_group"],
                    rows: Array.from({ length: 1000 }, () => ["Chat", 1, "T1"]),
                }),
            } as Response;
        }) as unknown as typeof fetch;
    }

    it("refuses a chart built from part of the data, and says how much", async () => {
        const { lib, instances } = fakeCharts();
        const handle = await renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p",
            fetchImpl: declinedAndTruncated(), loadCharts: async () => lib,
        });
        await handle.whenFilled;

        // no chart drawn from the sample
        expect(instances.length).toBe(0);
        const reasons = [...container.querySelectorAll(".lv-fallback-reason")].map(n => n.textContent || "");
        expect(reasons.some(r => /1000 of 5000 rows/.test(r))).toBe(true);
    });

    it("still draws when the rows are complete, even if not aggregated", async () => {
        const { lib, instances } = fakeCharts();
        const impl = vi.fn(async (url: RequestInfo | URL) => {
            if (!String(url).includes("/dataset")) {
                return { ok: true, status: 200, json: async () => ({ ok: true, spec: fixture }) } as Response;
            }
            return {
                ok: true, status: 200,
                json: async () => ({
                    ok: true, aggregated: false, truncated: false, totalRows: 2,
                    columns: ["source", "count(*)", "agent_group", "count(ticket_id)", "status", "monthly(created_time)", "priority"],
                    rows: [["Chat", 12, "T1", 7, "In progress", "2026-01-01", "High"],
                           ["Email", 9, "T2", 4, "Closed", "2026-02-01", "Low"]],
                }),
            } as Response;
        }) as unknown as typeof fetch;

        const handle = await renderLakeviewDashboard(container, {
            dashboardId: "d", assistantProfile: "p", fetchImpl: impl, loadCharts: async () => lib,
        });
        await handle.whenFilled;
        expect(instances.length).toBeGreaterThan(0);
    });
});
