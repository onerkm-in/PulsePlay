// playground/src/pulse/__tests__/insightsBriefingGaps.test.tsx
//
// Phase E 2026-05-18 — regression tests for the three gaps identified
// in the live briefing screenshots:
//
//   Gap 1: Return Rate ▲ (no author rule) → amber pill via builtin default
//   Gap 2: briefingHasStatusColors() → banner hides when emojis present
//   Gap 3: CSS :has() card border (CSS-only, not testable in jsdom — contract
//           test is in insightsGridContract.test.tsx's data-section checks)

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest } from "../visual";

const { briefingHasStatusColors, inlineFormat, renderInsightsSections } = __insightsRenderForTest;

// ─── Gap 2: banner guard ──────────────────────────────────────────────────────

describe("briefingHasStatusColors", () => {
    it("returns true when content has 🟢", () => {
        expect(briefingHasStatusColors("Sales 🟢 up 5%")).toBe(true);
    });
    it("returns true when content has 🟡", () => {
        expect(briefingHasStatusColors("Margin 🟡 watch")).toBe(true);
    });
    it("returns true when content has 🔴", () => {
        expect(briefingHasStatusColors("Return Rate 🔴 critical")).toBe(true);
    });
    it("returns false when no status emojis", () => {
        expect(briefingHasStatusColors("Revenue grew 12% YoY")).toBe(false);
    });
    it("returns false for empty string", () => {
        expect(briefingHasStatusColors("")).toBe(false);
    });
    it("returns true when mixed emojis are present", () => {
        expect(briefingHasStatusColors("Sales 🟢, Margin 🟡, Returns 🔴")).toBe(true);
    });
});

// ─── Gap 1: Return Rate builtin → amber pill (no author rule) ────────────────

describe("Return Rate ▲ without author rule → amber/watch pill via builtin", () => {
    it("renders gn-trend-tone-watch (amber) for Return Rate up with no metric rules", () => {
        // No metricRules passed — builtin default should fire.
        const html = renderToStaticMarkup(
            <>{inlineFormat("Return Rate rose ▲ +0.4pp this quarter.", "TRENDS", undefined)}</>
        );
        // Builtin: Return Rate higherIsBetter=false, unfavorableMovementTone="warn"
        // → direction "up" + unfavorable → "warn" → pill class "gn-trend-tone-watch"
        expect(html).toContain("gn-trend-tone-watch");
        expect(html).not.toContain("gn-trend-tone-good");
        expect(html).not.toContain("gn-trend-tone-bad");
    });

    it("author rule with unfavorableMovementTone=bad overrides builtin → red pill", () => {
        const authorRules = { structured: JSON.stringify([
            { name: "Return Rate", higherIsBetter: false, unfavorableMovementTone: "bad" },
        ]) };
        const html = renderToStaticMarkup(
            <>{inlineFormat("Return Rate rose ▲ +0.4pp this quarter.", "TRENDS", authorRules)}</>
        );
        expect(html).toContain("gn-trend-tone-bad");
        expect(html).not.toContain("gn-trend-tone-watch");
    });

    it("Sales ▲ with no rule stays green (builtin should not interfere)", () => {
        const html = renderToStaticMarkup(
            <>{inlineFormat("Sales grew ▲ +12% YoY.", "HEADLINE", undefined)}</>
        );
        // No builtin for "Sales" — falls through to getSemanticTone
        expect(html).not.toContain("gn-trend-tone-bad");
        expect(html).not.toContain("gn-trend-tone-watch");
    });
});

// ─── Gap 1: end-to-end section render ────────────────────────────────────────

describe("Return Rate section render — builtin direction fires end-to-end", () => {
    it("TRENDS section with Return Rate ▲ emits watch-tone pill in full section render", () => {
        const sectionMarkdown = "# TRENDS\n- Return Rate rose ▲ +0.4pp vs last quarter.";
        const nodes = renderInsightsSections(sectionMarkdown);
        const html = renderToStaticMarkup(<>{nodes}</>);
        expect(html).toContain("gn-trend-tone-watch");
    });
});
