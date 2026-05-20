// playground/src/pulse/__tests__/insightsStagedReveal.test.tsx
//
// Phase E.2 — pin the render-side contract for the staged reveal gate.
// The schedule itself is exhaustively tested in state/__tests__/stagedReveal.test.ts;
// this file pins that renderInsightsSections() correctly:
//   1. honours `revealedSectionTitles` (held-back sections become placeholders),
//   2. renders every section when the option is null/undefined (back-compat).

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest } from "../visual";

const BRIEFING = [
    "# HEADLINE",
    "Revenue is up across all categories.",
    "",
    "# KPI SNAPSHOT",
    "- **Revenue:** $4.2M (▲ +12%)",
    "",
    "# TRENDS",
    "- Furniture sales rising 18% QoQ.",
    "",
    "# RISKS",
    "- Tech category margin compression at -2.1pp.",
    "",
    "# RECOMMENDED ACTIONS",
    "- Renegotiate top 3 supplier contracts.",
].join("\n");

describe("renderInsightsSections — Phase E.2 reveal gate", () => {
    it("renders every section when revealedSectionTitles is undefined (back-compat)", () => {
        const node = __insightsRenderForTest.renderInsightsSections(BRIEFING, {});
        const html = renderToStaticMarkup(<>{node}</>);
        // All five canonical sections are rendered as live `gn-insights-section`
        // (NOT placeholders) when the gate is disabled.
        expect(html).toContain('data-section="HEADLINE"');
        expect(html).toContain('data-section="KPI SNAPSHOT"');
        expect(html).toContain('data-section="TRENDS"');
        expect(html).toContain('data-section="RISKS"');
        expect(html).toContain('data-section="RECOMMENDED ACTIONS"');
        // No placeholders in this path.
        expect(html).not.toMatch(/gn-insights-section--placeholder/);
    });

    it("renders held-back sections as InsightsSectionPlaceholder when revealedSectionTitles is provided", () => {
        // Stage-0 reveal: only HEADLINE is in the set.
        const node = __insightsRenderForTest.renderInsightsSections(BRIEFING, {
            revealedSectionTitles: new Set(["HEADLINE"]),
        });
        const html = renderToStaticMarkup(<>{node}</>);
        // HEADLINE renders as a live section (not a placeholder modifier).
        const headlineFragment = html.match(/data-section="HEADLINE"[\s\S]{0,120}/)?.[0] ?? "";
        expect(headlineFragment).not.toMatch(/--placeholder/);
        // The other four render as placeholder cards — we assert by counting
        // `--placeholder` modifier occurrences (4 held back).
        const placeholderHits = html.match(/gn-insights-section--placeholder/g) ?? [];
        expect(placeholderHits.length).toBe(4);
    });

    it("expanding the reveal set flips placeholders to live sections in lock-step", () => {
        // Stage-1 reveal: HEADLINE + KPI SNAPSHOT + TRENDS are visible.
        const node = __insightsRenderForTest.renderInsightsSections(BRIEFING, {
            revealedSectionTitles: new Set(["HEADLINE", "KPI SNAPSHOT", "TRENDS"]),
        });
        const html = renderToStaticMarkup(<>{node}</>);
        // Two sections held back → two placeholder modifier hits
        // (RISKS + RECOMMENDED ACTIONS).
        const placeholderHits = html.match(/gn-insights-section--placeholder/g) ?? [];
        expect(placeholderHits.length).toBe(2);
        // Three live section data-section attrs present.
        expect(html).toContain('data-section="HEADLINE"');
        expect(html).toContain('data-section="KPI SNAPSHOT"');
        expect(html).toContain('data-section="TRENDS"');
    });

    it("fully-revealed set behaves identically to the back-compat null path", () => {
        const all = new Set(["HEADLINE", "KPI SNAPSHOT", "TRENDS", "RISKS", "RECOMMENDED ACTIONS"]);
        const gated = renderToStaticMarkup(<>{__insightsRenderForTest.renderInsightsSections(BRIEFING, {
            revealedSectionTitles: all,
        })}</>);
        const ungated = renderToStaticMarkup(<>{__insightsRenderForTest.renderInsightsSections(BRIEFING, {})}</>);
        // No placeholders in either rendering.
        expect(gated).not.toMatch(/gn-insights-section--placeholder/);
        expect(ungated).not.toMatch(/gn-insights-section--placeholder/);
    });
});
