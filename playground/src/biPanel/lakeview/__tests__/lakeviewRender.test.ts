import { describe, expect, it } from "vitest";
import fixture from "./lakeviewSpec.fixture.json";
import {
    normalizeDashboard,
    describeCoverage,
    stripRemoteImages,
    type LakeviewDashboardSpec,
} from "../dashboardSpec";
import { widgetToEChartsOption, tableColumns, type WidgetData } from "../lakeviewToECharts";

/**
 * The fixture is a TRIMMED BUT REAL Lakeview spec, pulled from the live
 * workspace dashboard "[dbdemos] AIBI - AI-Assisted Customer Support Team
 * Review" via /api/2.0/lakeview/dashboards/{id}. One widget of each type the
 * real dashboard uses is kept, with the dataset SQL truncated.
 *
 * Real fixture on purpose: a hand-written one would have encoded my
 * assumptions about the format rather than the format, and this spec is not a
 * documented public contract.
 */
const dashboard = normalizeDashboard(fixture as LakeviewDashboardSpec);
const byKind = (kind: string) => dashboard.pages[0].widgets.find(w => w.kind === kind)!;

describe("normalizeDashboard reads a real Lakeview spec", () => {
    it("binds every data widget to its dataset SQL", () => {
        const bar = byKind("bar");
        expect(bar.datasetName).toBeTruthy();
        expect(bar.sql).toBeTruthy();
        expect(bar.sql).toMatch(/select/i);
    });

    it("classifies the widget types the way the renderer will treat them", () => {
        expect(byKind("counter").render).toBe("counter");
        expect(byKind("bar").render).toBe("chart");
        expect(byKind("line").render).toBe("chart");
        expect(byKind("pie").render).toBe("chart");
        expect(byKind("table").render).toBe("table");
        expect(byKind("filter-single-select").render).toBe("filter");
    });

    it("routes widgets it cannot draw faithfully to the fallback, with a reason", () => {
        for (const kind of ["forecast-line", "pivot"]) {
            const w = byKind(kind);
            expect(w.render).toBe("unsupported");
            expect(w.reason).toMatch(/no native renderer/);
        }
    });

    it("survives an empty or malformed spec instead of throwing", () => {
        expect(normalizeDashboard(null).pages).toEqual([]);
        expect(normalizeDashboard({}).pages).toEqual([]);
        expect(normalizeDashboard({ pages: [{ layout: [{}] }] }).pages[0].widgets[0].render).toBe("unsupported");
    });
});

describe("text widgets", () => {
    it("reads markdown from multilineTextboxSpec, the shape real specs use", () => {
        const text = dashboard.pages[0].widgets.find(w => w.render === "text");
        expect(text).toBeTruthy();
        expect(typeof text!.text).toBe("string");
        expect(text!.text!.length).toBeGreaterThan(0);
    });

    it("can strip the analytics beacon real dashboards ship", () => {
        // the dbdemos sample embeds a tracking pixel that reports DASHBOARD_VIEW
        // to a third-party endpoint on every render; an iframe would load it
        const { text, removed } = stripRemoteImages(
            "![Tracking Image](https://example.execute-api.us-west-2.amazonaws.com/v1/analytics?event=DASHBOARD_VIEW)\n## Real heading",
        );
        expect(removed).toHaveLength(1);
        expect(text).toBe("## Real heading");
    });

    it("leaves ordinary markdown untouched", () => {
        const { text, removed } = stripRemoteImages("## Heading\n\nSome **bold** copy.");
        expect(removed).toHaveLength(0);
        expect(text).toBe("## Heading\n\nSome **bold** copy.");
    });
});

describe("describeCoverage answers 'how much of this renders natively'", () => {
    it("reports the split and names what falls back", () => {
        const c = describeCoverage(dashboard);
        expect(c.total).toBeGreaterThan(0);
        expect(c.native + c.fallback).toBe(c.total);
        expect(c.unsupportedKinds).toContain("forecast-line");
        expect(c.unsupportedKinds).toContain("pivot");
        // the five common types plus text and filters must all be native
        expect(c.unsupportedKinds).not.toContain("bar");
        expect(c.unsupportedKinds).not.toContain("counter");
        expect(c.nativeShare).toBeGreaterThan(0.6);
    });
});

describe("widgetToEChartsOption", () => {
    const barData: WidgetData = {
        columns: ["source", "count(*)", "agent_group"],
        rows: [["Chat", 120, "Tier 1"], ["Email", 80, "Tier 1"], ["Chat", 45, "Tier 2"]],
    };

    it("builds a grouped bar from the author's encodings", () => {
        const opt = widgetToEChartsOption(byKind("bar"), barData) as Record<string, unknown>;
        expect(opt).toBeTruthy();
        const series = opt.series as Array<Record<string, unknown>>;
        expect(series.length).toBe(2); // one per agent_group
        expect(series[0].type).toBe("bar");
        expect((opt.xAxis as Record<string, unknown>).type).toBe("category");
    });

    it("honours an author's explicit colour mapping", () => {
        const pie = byKind("pie");
        const mapped = Object.values(pie.encodings.color?.scale?.mappings || [])[0] as { value?: string; color?: string };
        const data: WidgetData = {
            columns: ["count(ticket_id)", "status"],
            rows: [[10, mapped?.value ?? "In progress"], [5, "Closed"]],
        };
        const opt = widgetToEChartsOption(pie, data) as Record<string, unknown>;
        const items = (opt.series as Array<Record<string, unknown>>)[0].data as Array<Record<string, unknown>>;
        const hit = items.find(i => i.name === (mapped?.value ?? "In progress"));
        if (mapped?.color) expect(hit?.itemStyle).toEqual({ color: mapped.color });
    });

    it("reads a counter's single measure", () => {
        const counter = byKind("counter");
        const field = counter.encodings.value?.fieldName as string;
        const opt = widgetToEChartsOption(counter, { columns: [field], rows: [[237]] }) as Record<string, unknown>;
        expect((opt.__pulseplayCounter as Record<string, unknown>).value).toBe(237);
    });

    it("resolves aggregate field names against real result columns", () => {
        // encoding says "count(*)" while the warehouse returned "count(*)" -
        // and a relabelled inner identifier must still bind
        const opt = widgetToEChartsOption(byKind("bar"), {
            columns: ["source", "COUNT(*)", "agent_group"],
            rows: [["Chat", 1, "T1"]],
        });
        expect(opt).toBeTruthy();
    });

    it("returns null rather than guessing when the data does not match the encodings", () => {
        expect(widgetToEChartsOption(byKind("bar"), { columns: ["nope"], rows: [["x"]] })).toBeNull();
        expect(widgetToEChartsOption(byKind("bar"), null)).toBeNull();
        expect(widgetToEChartsOption(byKind("counter"), { columns: ["other"], rows: [[1]] })).toBeNull();
        // an unsupported widget never yields an option
        expect(widgetToEChartsOption(byKind("pivot"), barData)).toBeNull();
    });
});

describe("tableColumns", () => {
    it("uses the author's column order and drops columns absent from the result", () => {
        const t = byKind("table");
        const declared = (t.encodings.columns as unknown as Array<{ fieldName?: string }>)[0]?.fieldName as string;
        const cols = tableColumns(t, { columns: [declared, "extra"], rows: [] });
        expect(cols[0]).toBe(declared);
        expect(cols).not.toContain("extra");
    });

    it("falls back to the result's own columns when the spec declares none", () => {
        const cols = tableColumns({ ...byKind("table"), encodings: {} }, { columns: ["a", "b"], rows: [] });
        expect(cols).toEqual(["a", "b"]);
    });
});
