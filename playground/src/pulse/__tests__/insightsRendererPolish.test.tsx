import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest } from "../visual";

describe("insights narrative polish", () => {
    it("keeps prose thresholds readable instead of rendering raw rule fragments as pills", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "- Return rate is above the 🟡 caution threshold (>3 ▼ -7%), so margin resilience needs attention.",
            "RISKS",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).not.toContain("gn-trend-pill");
        expect(html).not.toContain("🟡");
        expect(html).not.toContain("▼");
        expect(html).toContain("caution threshold");
        expect(html).not.toContain("&gt;3");
        expect(html).not.toContain("-7%");
    });

    it("renders labeled risk bullets as insight cards instead of a plain list", () => {
        const node = __insightsRenderForTest.renderNarrative(
            [
                "- **Returns pressure:** Return rate reached **6.2%**, above the caution line.",
                "- **Margin compression:** Profit margin fell to **12.7%**, reducing resilience.",
            ].join("\n"),
            "RISKS",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-insight-card-grid");
        expect(html).toContain("gn-insight-card-label");
        expect(html).not.toContain("gn-narrative-list");
    });

    it("renders headline text as a summary card", () => {
        const node = __insightsRenderForTest.renderSectionBody(
            "Return rate is on watch at **6.2%**, while profit margin softened year over year.",
            "HEADLINE",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-headline-card");
        expect(html).toContain("<strong>6.2%</strong>");
    });

    it("uses a physical up cue and amber status tone for lower-is-better KPI increases when status is watch", () => {
        const node = __insightsRenderForTest.renderKpiTiles(
            [
                "| KPI | Current | Prior | Δ pp | Status |",
                "| --- | --- | --- | --- | --- |",
                "| Return Rate | 5.9% | 5.5% | +0.4pp (▲ +6.3%) | 🟡 Watch |",
            ].join("\n"),
            "KPI SNAPSHOT",
            {
                metricDirectionsJson: JSON.stringify([
                    { name: "Return Rate", higherIsBetter: false, amberPct: 4, redPct: 8 },
                ]),
            },
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-kpi-tile--warn");
        expect(html).toContain("gn-kpi-tile-delta--warn");
        expect(html).toContain('data-delta-cue="up"');
        expect(html).toContain("▲");
        expect(html).not.toContain("▼");
        expect(html).toContain("+0.4pp");
        expect(html).toContain("▲ +6.3%");
        expect(html).not.toContain("gn-trend-pill--good");
        expect(html).toContain("KPI increased from the prior period");
    });

    it("uses a physical down cue and amber status tone for higher-is-better KPI decreases when status is watch", () => {
        const node = __insightsRenderForTest.renderKpiTiles(
            [
                "| KPI | Current | Prior | Δ pp | Status |",
                "| --- | --- | --- | --- | --- |",
                "| Profit Margin | 12.7% | 13.4% | -0.7pp | 🟡 Watch |",
            ].join("\n"),
            "KPI SNAPSHOT",
            {
                metricDirectionsJson: JSON.stringify([
                    { name: "Profit Margin", higherIsBetter: true, amberPct: 22, redPct: 12 },
                ]),
            },
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-kpi-tile--warn");
        expect(html).toContain("gn-kpi-tile-delta--warn");
        expect(html).toContain('data-delta-cue="down"');
        expect(html).toContain("▼");
        expect(html).toContain("-0.7pp");
        expect(html).toContain("KPI decreased from the prior period");
    });

    it("falls back to metric-direction tone when a KPI movement has no explicit status", () => {
        const node = __insightsRenderForTest.renderKpiTiles(
            [
                "| KPI | Current | Prior | Δ pp |",
                "| --- | --- | --- | --- |",
                "| Return Rate | 6.2% | 5.9% | +0.3pp |",
            ].join("\n"),
            "KPI SNAPSHOT",
            {
                metricDirectionsJson: JSON.stringify([
                    { name: "Return Rate", higherIsBetter: false, amberPct: 4, redPct: 8 },
                ]),
            },
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-kpi-tile-delta--bad");
        expect(html).toContain('data-delta-cue="up"');
        expect(html).toContain("▲");
        expect(html).toContain("+0.3pp");
        expect(html).toContain("higher is unfavorable");
    });
});
