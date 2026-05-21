// playground/src/visualization/__tests__/NativeCanvas.test.tsx
//
// G4 — Focused tests for the React canvas + mount helper.
//
// Strategy
// ────────
// ECharts uses HTMLCanvasElement which jsdom does not implement. Mock
// the modular `echarts/core` entry so chart-state tests can assert what
// the canvas TRIED to render (init + setOption + dispose calls) without
// requiring a real canvas. The DOM assertions don't need ECharts to
// actually paint.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

// Vitest hoists `vi.mock` to the top of the file, so the factory must
// not reference top-level `const`s declared later. Use `vi.hoisted` to
// lift the mock object so both the factory and the tests can see it.
const { echartsMock } = vi.hoisted(() => {
    return {
        echartsMock: {
            init: vi.fn(() => ({
                setOption: vi.fn(),
                resize: vi.fn(),
                dispose: vi.fn(),
            })),
            use: vi.fn(),
        },
    };
});

vi.mock("echarts/core", () => echartsMock);
vi.mock("echarts/charts", () => ({
    BarChart: {}, HeatmapChart: {}, LineChart: {}, PieChart: {}, ScatterChart: {},
}));
vi.mock("echarts/components", () => ({
    GridComponent: {},
    LegendComponent: {},
    TitleComponent: {},
    TooltipComponent: {},
}));
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }));
// The runtime echarts package only re-exports types we use; vitest
// resolves the bare `import type { EChartsOption } from "echarts"`
// without needing the real module at test time.
vi.mock("echarts", () => ({}));

import { mountNativeCanvas, type NativeCanvasProps } from "../NativeCanvas";

const validAttestation = {
    enforced: true as const,
    authority: "unity-catalog" as const,
    subjectRef: "user-abc",
    requestId: "req-1",
};

function makeContainer(): HTMLElement {
    const container = document.createElement("div");
    document.body.appendChild(container);
    return container;
}

function mountCanvas(container: HTMLElement, props: NativeCanvasProps): ReturnType<typeof mountNativeCanvas> {
    let handle!: ReturnType<typeof mountNativeCanvas>;
    act(() => {
        handle = mountNativeCanvas(container, props);
    });
    return handle;
}

function updateCanvas(handle: ReturnType<typeof mountNativeCanvas>, props: NativeCanvasProps): void {
    act(() => {
        handle.update(props);
    });
}

function unmountAndDetach(handle: ReturnType<typeof mountNativeCanvas>, container: HTMLElement): void {
    act(() => {
        handle.unmount();
    });
    if (container.parentElement) container.parentElement.removeChild(container);
}

beforeEach(() => {
    echartsMock.init.mockClear();
    echartsMock.use.mockClear();
});

afterEach(() => {
    // Belt-and-braces — make sure no canvas leaks across tests.
    document.body.innerHTML = "";
});

// ─── Empty / spec / blocked / no-attestation fallback ─────────────────────

describe("NativeCanvas — non-envelope modes", () => {
    it("mode=empty renders the empty placeholder", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "empty",
            envelope: null,
            governanceState: { state: "not-applicable" },
        });
        const root = container.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root).not.toBeNull();
        expect(root?.getAttribute("data-native-bi-status")).toBe("empty");
        expect(root?.textContent).toContain("Native result canvas");
        expect(root?.textContent).toContain("Ask Pulse a question");
        expect(root?.hasAttribute("data-native-governance")).toBe(false);
        unmountAndDetach(handle, container);
    });

    it("mode=spec-accepted renders the spec acknowledgement", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "spec-accepted",
            envelope: null,
            spec: validChartSpec(),
            governanceState: { state: "not-applicable" },
        });
        const root = container.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root?.getAttribute("data-native-bi-status")).toBe("spec-accepted");
        expect(root?.textContent).toContain("Chart render spec accepted");
        expect(container.querySelector("[data-testid='pp-native-bi-spec-chart']")).not.toBeNull();
        unmountAndDetach(handle, container);
    });

    it("mode=spec-accepted surfaces invalid specs without rendering a chart", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "spec-accepted",
            envelope: null,
            spec: { mark: "bar" },
            governanceState: { state: "not-applicable" },
        });
        const root = container.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root?.textContent).toContain("Chart spec could not be rendered");
        expect(container.querySelector("[data-testid='pp-native-bi-spec-chart']")).toBeNull();
        unmountAndDetach(handle, container);
    });

    it("mode=result-blocked renders the blocked alert and ignores envelope", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "result-blocked",
            envelope: { rows: [], schema: [] },
            governanceState: { state: "blocked", reason: "no-governance-attestation" },
        });
        const root = container.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root?.getAttribute("data-native-bi-status")).toBe("result-blocked");
        expect(root?.getAttribute("data-native-governance")).toBe("blocked");
        expect(root?.textContent).toContain("Render blocked");
        expect(root?.textContent).toContain("Governance attestation missing");
        // Importantly: even though we passed a malformed envelope, no
        // data was rendered.
        expect(root?.textContent).not.toContain("AI result accepted");
        unmountAndDetach(handle, container);
    });

    it("mode=result-accepted with a non-envelope value falls back to acknowledgement", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "result-accepted",
            envelope: { rows: [] },  // not a valid AIResultEnvelope (no id)
            governanceState: { state: "enforced", authority: "unity-catalog", requestId: "req-1" },
        });
        const root = container.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root?.getAttribute("data-native-governance")).toBe("enforced");
        expect(root?.textContent).toContain("AI result accepted");
        expect(root?.textContent).toContain("(no renderable rows)");
        unmountAndDetach(handle, container);
    });
});

// ─── Preview badge ─────────────────────────────────────────────────────────

describe("NativeCanvas — ungoverned preview badge", () => {
    it("renders the DEV ONLY badge on ungoverned-result-preview mode", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "ungoverned-result-preview",
            envelope: { rows: [] },
            governanceState: { state: "preview", reason: "no-governance-attestation" },
        });
        const root = container.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root?.getAttribute("data-native-governance")).toBe("preview");
        expect(root?.textContent).toContain("Ungoverned result preview");
        expect(root?.textContent).toContain("DEV ONLY");
        unmountAndDetach(handle, container);
    });

    it("does NOT render the preview badge in enforced mode", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "result-accepted",
            envelope: validEnvelope({ rows: [["a", 1]] }),
            governanceState: { state: "enforced", authority: "unity-catalog", requestId: "req-1" },
        });
        const root = container.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root?.textContent).not.toContain("Ungoverned result preview");
        unmountAndDetach(handle, container);
    });
});

// ─── Table / KPI / Text / Chart envelope rendering ─────────────────────────

describe("NativeCanvas — envelope-driven viz states", () => {
    it("renders the table state for non-numeric multi-column data", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "result-accepted",
            envelope: validEnvelope({
                schema: [
                    { name: "category" },
                    { name: "owner" },
                ],
                rows: [
                    ["Sales", "Alice"],
                    ["Marketing", "Bob"],
                ],
            }),
            governanceState: enforcedAttestation(),
        });
        const table = container.querySelector("[data-testid='pp-native-bi-table']");
        expect(table).not.toBeNull();
        expect(table?.textContent).toContain("category");
        expect(table?.textContent).toContain("owner");
        expect(table?.textContent).toContain("Alice");
        expect(table?.textContent).toContain("Marketing");
        unmountAndDetach(handle, container);
    });

    it("renders the KPI state for single-row single-numeric data", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "result-accepted",
            envelope: validEnvelope({
                schema: [{ name: "revenue" }],
                rows: [[123456.78]],
            }),
            governanceState: enforcedAttestation(),
        });
        const kpi = container.querySelector("[data-testid='pp-native-bi-kpi']");
        expect(kpi).not.toBeNull();
        // Number is formatted with locale separators.
        const value = container.querySelector("[data-testid='pp-native-bi-kpi-value']");
        expect(value?.textContent).toMatch(/123,456/);
        // Label is the column name.
        expect(kpi?.textContent).toContain("revenue");
        unmountAndDetach(handle, container);
    });

    it("renders the chart state and initializes echarts for multi-row numeric data", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "result-accepted",
            envelope: validEnvelope({
                schema: [
                    { name: "month" },
                    { name: "sales" },
                ],
                rows: [
                    ["Jan", 100],
                    ["Feb", 140],
                    ["Mar", 160],
                    ["Apr", 180],
                    ["May", 220],
                    ["Jun", 260],
                    ["Jul", 300],
                ],
            }),
            governanceState: enforcedAttestation(),
        });
        const chart = container.querySelector("[data-testid='pp-native-bi-chart']");
        expect(chart).not.toBeNull();
        expect(chart?.getAttribute("data-chart-kind")).toBe("line");
        // The mocked echarts.init was called with the chart container.
        expect(echartsMock.init).toHaveBeenCalledTimes(1);
        unmountAndDetach(handle, container);
    });

    it("handles text-intent envelopes (answer only, no rows)", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "result-accepted",
            envelope: validEnvelope({
                answer: "Q3 revenue is up 12% year-over-year.",
                schema: [],
                rows: [],
            }),
            governanceState: enforcedAttestation(),
        });
        const root = container.querySelector("[data-native-bi-adapter='true']");
        // empty schema/rows → resultToVizIntent treats as text+answer →
        // AcceptedFallback renders (no schema to drive a richer view).
        // Both pathways preserve the "AI result accepted" signal.
        expect(root?.textContent).toContain("AI result accepted");
        unmountAndDetach(handle, container);
    });
});

// ─── Mount helper lifecycle ────────────────────────────────────────────────

describe("mountNativeCanvas — lifecycle", () => {
    it("update() re-renders with new props synchronously", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "empty",
            envelope: null,
            governanceState: { state: "not-applicable" },
        });
        expect(container.querySelector("[data-native-bi-adapter='true']")?.getAttribute("data-native-bi-status"))
            .toBe("empty");

        updateCanvas(handle, {
            mode: "result-blocked",
            envelope: null,
            governanceState: { state: "blocked", reason: "no-governance-attestation" },
        });
        expect(container.querySelector("[data-native-bi-adapter='true']")?.getAttribute("data-native-bi-status"))
            .toBe("result-blocked");

        unmountAndDetach(handle, container);
    });

    it("unmount() empties the container and is idempotent", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "empty",
            envelope: null,
            governanceState: { state: "not-applicable" },
        });
        expect(container.querySelector("[data-native-bi-adapter='true']")).not.toBeNull();
        act(() => {
            handle.unmount();
        });
        expect(container.querySelector("[data-native-bi-adapter='true']")).toBeNull();
        // Second unmount must not throw.
        expect(() => act(() => { handle.unmount(); })).not.toThrow();
        if (container.parentElement) container.parentElement.removeChild(container);
    });

    it("update() after unmount() is a no-op (does not re-render)", () => {
        const container = makeContainer();
        const handle = mountCanvas(container, {
            mode: "empty",
            envelope: null,
            governanceState: { state: "not-applicable" },
        });
        act(() => {
            handle.unmount();
        });
        expect(() => updateCanvas(handle, {
            mode: "result-accepted",
            envelope: null,
            governanceState: { state: "enforced", authority: "unity-catalog", requestId: "r" },
        })).not.toThrow();
        // Container stays empty.
        expect(container.querySelector("[data-native-bi-adapter='true']")).toBeNull();
        if (container.parentElement) container.parentElement.removeChild(container);
    });
});

// ─── Helpers ──────────────────────────────────────────────────────────────

interface MakeEnvelopeInput {
    readonly id?: string;
    readonly question?: string;
    readonly answer?: string;
    readonly schema?: ReadonlyArray<{ readonly name: string; readonly type?: string }>;
    readonly rows?: ReadonlyArray<ReadonlyArray<string | number | boolean | null>>;
}

function validEnvelope(input: MakeEnvelopeInput) {
    return {
        id: input.id ?? "fixture-result-1",
        question: input.question,
        answer: input.answer,
        schema: input.schema ?? [],
        rows: input.rows ?? [],
        governance: {
            enforced: true as const,
            authority: "unity-catalog" as const,
            subjectRef: "user-fixture",
            requestId: "req-fixture",
        },
    };
}

function enforcedAttestation(): NativeCanvasProps["governanceState"] {
    return { state: "enforced", authority: validAttestation.authority, requestId: validAttestation.requestId };
}

function validChartSpec() {
    return {
        version: "chart-render-spec/v0" as const,
        renderer: "echarts" as const,
        chartType: "bar" as const,
        mark: "bar" as const,
        data: {
            values: [
                { month: "Jan", sales: 100 },
                { month: "Feb", sales: 140 },
            ],
        },
        encoding: {
            x: { field: "month", type: "nominal" },
            y: { field: "sales", type: "quantitative" },
        },
    };
}
