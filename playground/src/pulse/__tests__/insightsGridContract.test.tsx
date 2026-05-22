// playground/src/pulse/__tests__/insightsGridContract.test.tsx
//
// Phase D 2026-05-18 — locks the renderer-to-CSS contract for the
// information hierarchy. The CSS layout in visual.less keys off
// `data-section` attributes on each rendered section card. If the
// renderer ever drops or renames those attributes, this test fails
// loud — before the grid silently breaks in production.
//
// Layout:
//   Row 1: HEADLINE (full-width)
//   Row 2: KPI SNAPSHOT | TRENDS
//   Row 3: RISKS | RECOMMENDED ACTIONS  (accent prominence)
//   Tail:  OPPORTUNITIES (full-width), then custom sections

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest } from "../visual";

function htmlFor(content: string): string {
    const node = __insightsRenderForTest.renderInsightsSections(content);
    return renderToStaticMarkup(<>{node}</>);
}

describe("Insights section grid contract — data-section attributes", () => {
    it.each([
        ["HEADLINE", "HEADLINE"],
        ["KPI SNAPSHOT", "KPI SNAPSHOT"],
        ["TRENDS", "TRENDS"],
        ["RISKS", "RISKS"],
        ["RECOMMENDED ACTIONS", "RECOMMENDED ACTIONS"],
        ["OPPORTUNITIES", "OPPORTUNITIES"],
    ])("section %s emits data-section=\"%s\" so the Phase D grid CSS can place it", (markdownTitle, expectedAttr) => {
        const html = htmlFor(`# ${markdownTitle}\nBody prose.`);
        expect(html).toContain(`data-section="${expectedAttr}"`);
    });
});

describe("Insights section grid — full briefing contract", () => {
    it("emits all five hierarchy data-sections in DOM order so stagger reveal still fires by arrival", () => {
        // Stream order matches the Pulse pipeline order. The CSS `order`
        // declarations re-arrange visually for wide viewports without
        // changing DOM order, so the stagger animation delays
        // (gn-section-reveal :nth-child) stay accurate.
        const html = htmlFor([
            "# HEADLINE\nBriefing.",
            "# KPI SNAPSHOT\nKPI tiles.",
            "# TRENDS\nMovement.",
            "# RISKS\nRisk prose.",
            "# RECOMMENDED ACTIONS\nActions.",
            "# OPPORTUNITIES\nOpps.",
        ].join("\n\n"));

        // All six are present in DOM order — proves a) the renderer emits
        // them all, b) data-section attributes are intact so the CSS hooks
        // resolve.
        const headlineIdx = html.indexOf('data-section="HEADLINE"');
        const kpiIdx = html.indexOf('data-section="KPI SNAPSHOT"');
        const trendsIdx = html.indexOf('data-section="TRENDS"');
        const risksIdx = html.indexOf('data-section="RISKS"');
        const actionsIdx = html.indexOf('data-section="RECOMMENDED ACTIONS"');
        const oppsIdx = html.indexOf('data-section="OPPORTUNITIES"');

        for (const [name, idx] of [
            ["HEADLINE", headlineIdx],
            ["KPI SNAPSHOT", kpiIdx],
            ["TRENDS", trendsIdx],
            ["RISKS", risksIdx],
            ["RECOMMENDED ACTIONS", actionsIdx],
            ["OPPORTUNITIES", oppsIdx],
        ] as Array<[string, number]>) {
            expect(idx, `${name} should appear in the rendered HTML`).toBeGreaterThan(-1);
        }

        // DOM order (which drives the stagger reveal) follows source order.
        expect(headlineIdx).toBeLessThan(kpiIdx);
        expect(kpiIdx).toBeLessThan(trendsIdx);
        expect(trendsIdx).toBeLessThan(risksIdx);
        expect(risksIdx).toBeLessThan(actionsIdx);
        expect(actionsIdx).toBeLessThan(oppsIdx);
    });

    it("RECOMMENDED ACTIONS section can be CSS-targeted for the prominence treatment", () => {
        // The Phase D CSS applies accent border + tint + shadow on the
        // [data-section="RECOMMENDED ACTIONS"] selector (plus 3 aliases).
        // Test asserts the attribute is present verbatim. Visual color /
        // shadow assertions can't run in jsdom (computed style only
        // reflects inline styles), so this guards the CSS contract.
        const html = htmlFor("# RECOMMENDED ACTIONS\nAct now.");
        expect(html).toContain('data-section="RECOMMENDED ACTIONS"');
    });

    it("Custom (author-defined) sections also emit data-section so they fall in the tail", () => {
        // Custom sections aren't in the hierarchy hint set; CSS defaults
        // them to `order: 10` so they flow after the named ones.
        const html = htmlFor("# CUSTOM AUTHOR SECTION\nBespoke prose.");
        expect(html).toContain('data-section="CUSTOM AUTHOR SECTION"');
    });
});
