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
import type { BIEvent } from "../../../playground/src/biPanel/BIAdapter";

// ── Fakes ──────────────────────────────────────────────────────────────────

interface FakeReport {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    setPage: ReturnType<typeof vi.fn>;
    setFilters: ReturnType<typeof vi.fn>;
    removeFilters: ReturnType<typeof vi.fn>;
    getFilters: ReturnType<typeof vi.fn>;
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

    test("send before mount throws NOT_MOUNTED", async () => {
        const a = new PowerBIAdapter();
        await expect(a.send({ kind: "refresh" })).rejects.toThrow(/NOT_MOUNTED/);
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
