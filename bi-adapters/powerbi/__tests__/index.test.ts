// bi-adapters/powerbi/__tests__/index.test.ts
//
// Cycle A — covers the BIAdapter contract translation for PowerBIAdapter.
// We mock powerbi-client's `service.Service` (the only thing the adapter
// touches at runtime besides the `models` enums, which are pure values
// and safe to keep). Mocking the service lets us drive embed/on/send/
// destroy without standing up a real Power BI iframe (jsdom can't speak
// the postMessage protocol the SDK expects).

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { PowerBIAdapter, __setPowerBIServiceForTests } from "../index";
import type { PowerBIEmbedConfig } from "../index";
import type { BIEmbedConfig, BIEvent } from "../../../playground/src/biPanel/BIAdapter";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";

// ── Fakes ──────────────────────────────────────────────────────────────────

interface FakeReport {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    setPage: ReturnType<typeof vi.fn>;
    setFilters: ReturnType<typeof vi.fn>;
    removeFilters: ReturnType<typeof vi.fn>;
    getFilters: ReturnType<typeof vi.fn>;
    getPages: ReturnType<typeof vi.fn>;
    getActivePage: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    fullscreen: ReturnType<typeof vi.fn>;
    exitFullscreen: ReturnType<typeof vi.fn>;
    /** Test helper — emit a synthetic PBI event by invoking every handler
     *  registered for that event name. */
    _emit: (eventName: string, detail: unknown) => void;
}

function makeFakeReport(): FakeReport {
    const handlers = new Map<string, Array<(e: { detail: unknown }) => void>>();
    const report: FakeReport = {
        on: vi.fn((name: string, handler: (e: { detail: unknown }) => void) => {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name)!.push(handler);
        }),
        off: vi.fn((name: string, handler: (e: { detail: unknown }) => void) => {
            const list = handlers.get(name);
            if (!list) return;
            const idx = list.indexOf(handler);
            if (idx >= 0) list.splice(idx, 1);
        }),
        setPage: vi.fn(async () => {}),
        setFilters: vi.fn(async () => {}),
        removeFilters: vi.fn(async () => {}),
        getFilters: vi.fn(async () => []),
        getPages: vi.fn(async () => [
            { name: "ReportSection", displayName: "Overview", isActive: true },
            { name: "ReportSection2", displayName: "Details", isActive: false },
        ]),
        getActivePage: vi.fn(async () => ({ name: "ReportSection", displayName: "Overview" })),
        refresh: vi.fn(async () => {}),
        fullscreen: vi.fn(),
        exitFullscreen: vi.fn(),
        _emit: (eventName, detail) => {
            const list = handlers.get(eventName) || [];
            for (const h of list) h({ detail });
        },
    };
    return report;
}

interface FakeService {
    embed: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    _lastReport: FakeReport | null;
}

function makeFakeService(): FakeService {
    const svc: FakeService = {
        _lastReport: null,
        embed: vi.fn(),
        reset: vi.fn(),
    };
    svc.embed.mockImplementation(() => {
        const r = makeFakeReport();
        svc._lastReport = r;
        return r;
    });
    return svc;
}

// ── Fixture ────────────────────────────────────────────────────────────────

const VALID_CONFIG: PowerBIEmbedConfig = {
    type: "report",
    id: "report-uuid-1",
    groupId: "wsp-uuid-1",
    embedUrl: "https://app.powerbi.com/reportEmbed?reportId=report-uuid-1",
    accessToken: "embed-tkn-test",
    tokenType: "Embed",
    permissions: "View",
};

const SECURE_CONFIG: PowerBIEmbedConfig = {
    type: "report",
    id: "secure-report-uuid-1",
    embedMode: "secure",
    mode: "secure-embed",
    embedUrl: "https://app.powerbi.com/reportEmbed?reportId=secure-report-uuid-1&autoAuth=true",
    permissions: "View",
};

let svc: FakeService;
let containerEl: HTMLElement;

beforeEach(() => {
    svc = makeFakeService();
    // Cast: we shape FakeService to match the surface the adapter touches.
    __setPowerBIServiceForTests(svc as unknown as Parameters<typeof __setPowerBIServiceForTests>[0]);
    containerEl = document.createElement("div");
    document.body.appendChild(containerEl);
});

afterEach(() => {
    __setPowerBIServiceForTests(null);
    if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl);
});

// ── Universal BIAdapter contract conformance ───────────────────────────────
// Each test in the harness installs its own fake service through the
// beforeMount hook so the conformance suite doesn't interfere with the
// vendor-specific suite below (which uses the module-scoped `svc`).
runAdapterConformance("PowerBIAdapter", {
    factory: () => new PowerBIAdapter(),
    validConfig: VALID_CONFIG as unknown as BIEmbedConfig,
    beforeMount: () => {
        __setPowerBIServiceForTests(makeFakeService() as unknown as Parameters<typeof __setPowerBIServiceForTests>[0]);
    },
    afterDestroy: () => {
        __setPowerBIServiceForTests(null);
    },
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PowerBIAdapter — capabilities", () => {
    test("advertises the full Power BI capability set", () => {
        const a = new PowerBIAdapter();
        const caps = a.capabilities();
        expect(caps.canNavigatePages).toBe(true);
        expect(caps.canApplyFilters).toBe(true);
        expect(caps.canRefresh).toBe(true);
        expect(caps.canFullscreen).toBe(true);
        expect(caps.requiresContainerEl).toBe(true);
        // export-to-file isn't wired in v0.
        expect(caps.canExport).toBe(false);
    });
});

describe("PowerBIAdapter — mount", () => {
    test("calls service.embed with a correctly-shaped config", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);

        expect(svc.embed).toHaveBeenCalledTimes(1);
        const [calledContainer, calledConfig] = svc.embed.mock.calls[0];
        expect(calledContainer).toBe(containerEl);
        expect(calledConfig.type).toBe("report");
        expect(calledConfig.id).toBe("report-uuid-1");
        expect(calledConfig.embedUrl).toBe(VALID_CONFIG.embedUrl);
        expect(calledConfig.accessToken).toBe(VALID_CONFIG.accessToken);
        expect(typeof calledConfig.tokenType).toBe("number");      // models.TokenType is a numeric enum
        expect(typeof calledConfig.permissions).toBe("number");    // models.Permissions is a numeric enum
        expect(calledConfig.settings?.panes?.filters?.visible).toBe(true);
    });

    test("throws when containerEl is null", async () => {
        const a = new PowerBIAdapter();
        await expect(a.mount(null, VALID_CONFIG)).rejects.toThrow(/requires a container element/);
    });

    test("throws when required fields are missing", async () => {
        const a = new PowerBIAdapter();
        const bad = { id: "x" } as unknown as PowerBIEmbedConfig;
        await expect(a.mount(containerEl, bad)).rejects.toThrow(/embedUrl, accessToken/);
    });

    test("mounts a Power BI secure embed URL as a preview iframe", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, SECURE_CONFIG);

        expect(svc.embed).not.toHaveBeenCalled();
        const iframe = containerEl.querySelector("iframe");
        expect(iframe).not.toBeNull();
        expect(iframe?.src).toContain("/reportEmbed");
        expect(iframe?.src).toContain("secure-report-uuid-1");

        const caps = a.capabilities();
        expect(caps.canNavigatePages).toBe(false);
        expect(caps.canApplyFilters).toBe(false);
        expect(caps.canRefresh).toBe(true);
        expect(caps.canFullscreen).toBe(true);
    });

    test("rejects non-Power-BI URLs in secure embed mode", async () => {
        const a = new PowerBIAdapter();
        await expect(a.mount(containerEl, {
            ...SECURE_CONFIG,
            embedUrl: "https://example.com/reportEmbed?reportId=x",
        })).rejects.toThrow(/app\.powerbi\.com\/reportEmbed/);
    });
});

describe("PowerBIAdapter — on() event translation", () => {
    test("'page-changed' subscriber receives the canonical event when PBI fires pageChanged", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        const events: BIEvent[] = [];
        a.on("page-changed", e => events.push(e));

        report._emit("pageChanged", { newPage: { name: "p1", displayName: "Sales" } });

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("page-changed");
        const payload = events[0].payload as { pageId?: string; pageName?: string };
        expect(payload.pageId).toBe("p1");
        expect(payload.pageName).toBe("Sales");
    });

    test("'filter-applied' subscriber receives the canonical event when PBI fires filtersApplied", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        const events: BIEvent[] = [];
        a.on("filter-applied", e => events.push(e));

        const fakeFilters = [{ target: { table: "t1", column: "region" }, values: ["East"] }];
        report._emit("filtersApplied", { filters: fakeFilters });

        expect(events).toHaveLength(1);
        const payload = events[0].payload as { filters?: unknown[] };
        expect(payload.filters).toBe(fakeFilters);
    });

    test("'selection-made' subscriber receives the canonical event when PBI fires dataSelected", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        const events: BIEvent[] = [];
        a.on("selection-made", e => events.push(e));

        report._emit("dataSelected", { dataPoints: [{ values: [42] }] });

        expect(events).toHaveLength(1);
        const payload = events[0].payload as { dataPoints?: unknown[] };
        expect(payload.dataPoints).toEqual([{ values: [42] }]);
    });

    test("unsubscribe stops further deliveries", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        const events: BIEvent[] = [];
        const off = a.on("page-changed", e => events.push(e));
        report._emit("pageChanged", { newPage: { name: "p1" } });
        off();
        report._emit("pageChanged", { newPage: { name: "p2" } });
        expect(events).toHaveLength(1);
    });
});

describe("PowerBIAdapter — send()", () => {
    test("apply-filter calls report.setFilters with a basic filter for the field", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        await a.send({ kind: "apply-filter", field: "region", values: ["East", "West"] });

        expect(report.setFilters).toHaveBeenCalledTimes(1);
        const args = report.setFilters.mock.calls[0][0];
        expect(Array.isArray(args)).toBe(true);
        const filter = args[0];
        expect(filter.target.column).toBe("region");
        expect(filter.operator).toBe("In");
        expect(filter.values).toEqual(["East", "West"]);
        // Schema marker so PBI recognises the filter.
        expect(filter.$schema).toContain("schema#basic");
    });

    test("clear-filter without a field calls removeFilters()", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        await a.send({ kind: "clear-filter" });
        expect(report.removeFilters).toHaveBeenCalledTimes(1);
    });

    test("clear-filter with a field reads + filters + sets remainder", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        report.getFilters.mockResolvedValueOnce([
            { target: { column: "region" }, values: ["East"] },
            { target: { column: "category" }, values: ["Tech"] },
        ]);

        await a.send({ kind: "clear-filter", field: "region" });
        expect(report.setFilters).toHaveBeenCalledTimes(1);
        const remaining = report.setFilters.mock.calls[0][0];
        expect(remaining).toHaveLength(1);
        expect((remaining[0] as { target: { column: string } }).target.column).toBe("category");
    });

    test("navigate-to-page calls report.setPage", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        await a.send({ kind: "navigate-to-page", pageId: "page-2" });
        expect(report.setPage).toHaveBeenCalledWith("page-2");
    });

    test("refresh calls report.refresh", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        await a.send({ kind: "refresh" });
        expect(report.refresh).toHaveBeenCalled();
    });

    test("fullscreen on/off toggles the SDK methods", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        await a.send({ kind: "fullscreen", on: true });
        expect(report.fullscreen).toHaveBeenCalled();
        await a.send({ kind: "fullscreen", on: false });
        expect(report.exitFullscreen).toHaveBeenCalled();
    });

    test("export rejects with UNSUPPORTED_COMMAND in v0", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        await expect(a.send({ kind: "export", format: "pdf" })).rejects.toThrow(/UNSUPPORTED_COMMAND/);
    });

    test("secure embed allows refresh but rejects SDK-only commands", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, SECURE_CONFIG);

        await expect(a.send({ kind: "refresh" })).resolves.toBeUndefined();
        await expect(a.send({ kind: "apply-filter", field: "region", values: ["East"] }))
            .rejects.toThrow(/UNSUPPORTED_COMMAND/);
    });

    test("send before mount throws NOT_MOUNTED", async () => {
        const a = new PowerBIAdapter();
        await expect(a.send({ kind: "refresh" })).rejects.toThrow(/NOT_MOUNTED/);
    });
});

describe("PowerBIAdapter — developer snapshot", () => {
    test("returns live SDK pages, active page, filters, and capabilities", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;
        report.getFilters.mockResolvedValueOnce([{ target: { column: "region" }, values: ["East"] }]);

        const snapshot = await a.getDeveloperSnapshot();

        expect(snapshot.mountMode).toBe("sdk");
        expect(snapshot.capabilities.canApplyFilters).toBe(true);
        expect(snapshot.pages).toHaveLength(2);
        expect(snapshot.activePage?.displayName).toBe("Overview");
        expect(snapshot.filters).toEqual([{ target: { column: "region" }, values: ["East"] }]);
        expect(snapshot.errors).toEqual([]);
    });

    test("developer snapshot explains secure iframe preview mode", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, SECURE_CONFIG);

        const snapshot = await a.getDeveloperSnapshot();

        expect(snapshot.mountMode).toBe("secure-iframe");
        expect(snapshot.capabilities.canApplyFilters).toBe(false);
        expect(snapshot.iframe?.src).toContain("reportEmbed");
        expect(snapshot.notes.join(" ")).toContain("iframe-only");
    });
});

describe("PowerBIAdapter — destroy()", () => {
    test("calls service.reset(containerEl) and clears state", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);

        a.destroy();
        expect(svc.reset).toHaveBeenCalledWith(containerEl);

        // After destroy, send must throw NOT_MOUNTED.
        await expect(a.send({ kind: "refresh" })).rejects.toThrow(/NOT_MOUNTED/);
    });

    test("destroy is idempotent — no throw on second call", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        a.destroy();
        expect(() => a.destroy()).not.toThrow();
    });

    test("destroy removes secure iframe without calling the SDK reset path", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, SECURE_CONFIG);
        expect(containerEl.querySelector("iframe")).not.toBeNull();

        a.destroy();

        expect(containerEl.querySelector("iframe")).toBeNull();
        expect(svc.reset).not.toHaveBeenCalled();
        await expect(a.send({ kind: "refresh" })).rejects.toThrow(/NOT_MOUNTED/);
    });

    test("destroy detaches the SDK-side listeners", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const report = svc._lastReport!;

        a.on("page-changed", () => {});
        // sanity — registered exactly one handler for pageChanged
        expect(report.on).toHaveBeenCalledWith("pageChanged", expect.any(Function));

        a.destroy();
        expect(report.off).toHaveBeenCalledWith("pageChanged", expect.any(Function));
    });
});

// ── getMetadata() — Discovery Loop honest reachability ───────────────────

describe("PowerBIAdapter — getMetadata()", () => {
    function reportWithVisuals(visuals: Array<{ type?: string; title?: string; name?: string }>): FakeReport {
        const r = makeFakeReport();
        // Extend the fake getActivePage to attach a getVisuals() method.
        r.getActivePage = vi.fn(async () => ({
            name: "ReportSection",
            displayName: "Overview",
            getVisuals: vi.fn(async () => visuals),
        }));
        return r;
    }

    test("returns null when adapter is not mounted", async () => {
        const a = new PowerBIAdapter();
        expect(await a.getMetadata()).toBeNull();
    });

    test("returns null in secure-iframe mode (no SDK introspection)", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, SECURE_CONFIG);
        expect(await a.getMetadata()).toBeNull();
    });

    test("returns activeViewId from the active page name", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        // Stub the active page so it has getVisuals.
        svc._lastReport!.getActivePage = vi.fn(async () => ({
            name: "Sales_Overview",
            getVisuals: vi.fn(async () => []),
        }));
        const meta = await a.getMetadata();
        expect(meta).not.toBeNull();
        expect(meta!.activeViewId).toBe("Sales_Overview");
    });

    test("classifies card / kpi visuals as measures with currency / percent / count kind hints", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const fakeReport = reportWithVisuals([
            { type: "card", title: "Total Revenue" },
            { type: "kpi", title: "Profit Margin %" },
            { type: "card", title: "Order Count" },
            { type: "multiRowCard", title: "Forecast Accuracy" },
        ]);
        // Inject the fake getActivePage that returns getVisuals.
        (svc._lastReport! as unknown as { getActivePage: typeof fakeReport.getActivePage }).getActivePage = fakeReport.getActivePage;

        const meta = await a.getMetadata();
        expect(meta).not.toBeNull();
        const measures = meta!.visibleMeasures || [];
        expect(measures.find(m => m.name === "Total Revenue")?.kind).toBe("currency");
        expect(measures.find(m => m.name === "Profit Margin %")?.kind).toBe("percent");
        expect(measures.find(m => m.name === "Order Count")?.kind).toBe("count");
        // Forecast Accuracy has no kind cue → present without kind
        const fcst = measures.find(m => m.name === "Forecast Accuracy");
        expect(fcst).toBeDefined();
        expect(fcst!.kind).toBeUndefined();
    });

    test("classifies slicer / tableEx / matrix visuals as dimensions", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        const fakeReport = reportWithVisuals([
            { type: "slicer", title: "Region" },
            { type: "tableEx", title: "Customer" },
            { type: "matrix", title: "Category" },
        ]);
        (svc._lastReport! as unknown as { getActivePage: typeof fakeReport.getActivePage }).getActivePage = fakeReport.getActivePage;

        const meta = await a.getMetadata();
        const dimensions = meta!.visibleDimensions || [];
        expect(dimensions.map(d => d.name)).toEqual(expect.arrayContaining(["Region", "Customer", "Category"]));
        // Measures should not contain any of the slicer titles.
        const measureNames = (meta!.visibleMeasures || []).map(m => m.name);
        expect(measureNames).not.toContain("Region");
    });

    test("includes active filters with field + value from report.getFilters()", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        svc._lastReport!.getFilters = vi.fn(async () => [
            { target: { column: "Region" }, values: ["East"] },
            { target: { column: "Year" }, values: [2024, 2025] },
        ]);
        svc._lastReport!.getActivePage = vi.fn(async () => ({
            name: "Overview",
            getVisuals: vi.fn(async () => []),
        }));

        const meta = await a.getMetadata();
        const filters = meta!.activeFilters || [];
        expect(filters).toHaveLength(2);
        expect(filters.find(f => f.field === "Region")?.value).toBe("East");
        // Multi-value array stays as an array.
        expect(filters.find(f => f.field === "Year")?.value).toEqual([2024, 2025]);
    });

    test("partial inner-call failures degrade gracefully (returns shape with empty lists, not null)", async () => {
        const a = new PowerBIAdapter();
        await a.mount(containerEl, VALID_CONFIG);
        // Inner getActivePage + getFilters reject — the adapter's per-call
        // try/catch swallows each. The result is a well-formed BIMetadata
        // with the unfilled fields left empty, so the proxy's Discovery
        // engine knows what's known vs unknown rather than getting a flat
        // null (which would mean "no signal at all").
        svc._lastReport!.getActivePage = vi.fn(async () => { throw new Error("boom"); });
        svc._lastReport!.getFilters = vi.fn(async () => { throw new Error("boom"); });

        const meta = await a.getMetadata();
        expect(meta).not.toBeNull();
        expect(meta!.activeViewId).toBeNull();
        expect(meta!.visibleMeasures).toEqual([]);
        expect(meta!.visibleDimensions).toEqual([]);
        expect(meta!.activeFilters).toEqual([]);
    });

    test("getMetadata is declared on the PowerBIAdapter prototype (BIAdapter optional contract)", () => {
        const a = new PowerBIAdapter();
        expect(typeof a.getMetadata).toBe("function");
    });
});
