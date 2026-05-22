// playground/src/pulse/__tests__/sectionDisplayLabels.test.tsx
//
// Phase B — section label renames. Internal IDs (HEADLINE / TRENDS /
// RISKS / RECOMMENDED ACTIONS) drive prompts, validators, exports, and
// the data-section attribute used for stage SQL lookup. Display labels
// are user-facing only.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest, displaySectionTitle } from "../visual";

describe("displaySectionTitle", () => {
    it("maps HEADLINE → Executive Brief", () => {
        expect(displaySectionTitle("HEADLINE")).toBe("Executive Brief");
    });
    it("maps TRENDS → What Changed", () => {
        expect(displaySectionTitle("TRENDS")).toBe("What Changed");
    });
    it("maps RISKS → What Needs Attention", () => {
        expect(displaySectionTitle("RISKS")).toBe("What Needs Attention");
    });
    it("maps RECOMMENDED ACTIONS → Next Best Actions", () => {
        expect(displaySectionTitle("RECOMMENDED ACTIONS")).toBe("Next Best Actions");
    });
    it("is case-insensitive on input (uppercased internally)", () => {
        expect(displaySectionTitle("headline")).toBe("Executive Brief");
        expect(displaySectionTitle("Trends")).toBe("What Changed");
        expect(displaySectionTitle("recommended actions")).toBe("Next Best Actions");
    });
    it("trims whitespace before lookup", () => {
        expect(displaySectionTitle("  TRENDS  ")).toBe("What Changed");
    });
    it("returns custom / unknown titles unchanged so author sections stay readable", () => {
        expect(displaySectionTitle("OPPORTUNITIES")).toBe("OPPORTUNITIES");
        expect(displaySectionTitle("KPI SNAPSHOT")).toBe("KPI SNAPSHOT");
        expect(displaySectionTitle("Custom Author Section")).toBe("Custom Author Section");
    });
    it("returns empty string for null/undefined/empty input", () => {
        expect(displaySectionTitle(undefined)).toBe("");
        expect(displaySectionTitle(null)).toBe("");
        expect(displaySectionTitle("")).toBe("");
    });
});

describe("rendered section header uses display labels but keeps internal data-section", () => {
    it("HEADLINE section renders 'Executive Brief' in the title slot AND keeps data-section-title=HEADLINE for tests / exports", () => {
        const node = __insightsRenderForTest.renderInsightsSections(
            "# HEADLINE\nBriefing prose here.",
        );
        const html = renderToStaticMarkup(<>{node}</>);
        expect(html).toContain("Executive Brief");
        expect(html).toContain('data-section-title="HEADLINE"');
        // Original internal name MUST not leak into the visible <h3> body
        // (the visible label is the display name).
        expect(html).not.toContain(">HEADLINE</h3>");
    });

    it("TRENDS section renders 'What Changed' as the visible label", () => {
        const node = __insightsRenderForTest.renderInsightsSections(
            "# TRENDS\nMovement prose.",
        );
        const html = renderToStaticMarkup(<>{node}</>);
        expect(html).toContain("What Changed");
        expect(html).toContain('data-section-title="TRENDS"');
        expect(html).not.toContain(">TRENDS</h3>");
    });

    it("RISKS section renders 'What Needs Attention' as the visible label", () => {
        const node = __insightsRenderForTest.renderInsightsSections(
            "# RISKS\nRisk prose.",
        );
        const html = renderToStaticMarkup(<>{node}</>);
        expect(html).toContain("What Needs Attention");
        expect(html).toContain('data-section-title="RISKS"');
        expect(html).not.toContain(">RISKS</h3>");
    });

    it("RECOMMENDED ACTIONS section renders 'Next Best Actions' as the visible label", () => {
        const node = __insightsRenderForTest.renderInsightsSections(
            "# RECOMMENDED ACTIONS\nAction prose.",
        );
        const html = renderToStaticMarkup(<>{node}</>);
        expect(html).toContain("Next Best Actions");
        expect(html).toContain('data-section-title="RECOMMENDED ACTIONS"');
        expect(html).not.toContain(">RECOMMENDED ACTIONS</h3>");
    });

    it("Unknown / author-custom sections keep their original title as the visible label", () => {
        const node = __insightsRenderForTest.renderInsightsSections(
            "# OPPORTUNITIES\nProse.",
        );
        const html = renderToStaticMarkup(<>{node}</>);
        // No rename for OPPORTUNITIES — visible label stays the upper title.
        expect(html).toContain("OPPORTUNITIES");
    });
});
