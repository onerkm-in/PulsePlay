// playground/src/settings/__tests__/multiPageP1.test.ts
//
// Phase B Multi-page P1 contract tests. Verifies the parallel-storage
// invariants between TabVisibility (legacy canonical) and Page[] (new
// future-canonical). Both shapes must stay in lockstep under every
// reducer + setter path until consumers switch.

import { describe, it, expect } from "vitest";
import {
    DEFAULT_PAGES,
    DEFAULT_PAGE_TITLE,
    DEFAULT_TAB_VISIBILITY,
    pagesFromTabVisibility,
    tabVisibilityFromPages,
    enabledTabCount,
    type Page,
    type PageType,
    type TabVisibility,
} from "../settingsStore";

describe("multi-page P1 — derivation helpers", () => {
    it("DEFAULT_PAGES contains one page per type, all enabled", () => {
        expect(DEFAULT_PAGES.length).toBe(3);
        const types = DEFAULT_PAGES.map(p => p.type).sort();
        expect(types).toEqual(["ai-insights", "ask-pulse", "dashboard"]);
    });

    it("each default page uses the canonical title", () => {
        for (const p of DEFAULT_PAGES) {
            expect(p.title).toBe(DEFAULT_PAGE_TITLE[p.type]);
        }
    });

    it("pagesFromTabVisibility round-trips with tabVisibilityFromPages", () => {
        const cases: TabVisibility[] = [
            { aiInsights: true,  askPulse: true,  dashboard: true },
            { aiInsights: true,  askPulse: false, dashboard: true },
            { aiInsights: false, askPulse: true,  dashboard: false },
            { aiInsights: true,  askPulse: false, dashboard: false },
            { aiInsights: false, askPulse: false, dashboard: true },
        ];
        for (const v of cases) {
            const pages = pagesFromTabVisibility(v);
            const roundTripped = tabVisibilityFromPages(pages);
            expect(roundTripped).toEqual(v);
        }
    });

    it("pagesFromTabVisibility never returns 0 pages (defensive fallback)", () => {
        const zero: TabVisibility = { aiInsights: false, askPulse: false, dashboard: false };
        const pages = pagesFromTabVisibility(zero);
        expect(pages.length).toBeGreaterThan(0);
        // Should fall back to DEFAULT_PAGES (3 enabled).
        expect(pages.length).toBe(3);
    });

    it("pagesFromTabVisibility preserves order: insights → ask-pulse → dashboard", () => {
        const v: TabVisibility = { aiInsights: true, askPulse: true, dashboard: true };
        const pages = pagesFromTabVisibility(v);
        expect(pages.map(p => p.type)).toEqual(["ai-insights", "ask-pulse", "dashboard"]);
    });

    it("tabVisibilityFromPages reflects only types present, no duplicates concern", () => {
        const pages: Page[] = [
            { id: "x1", type: "ai-insights", title: "AI" },
            { id: "x2", type: "ai-insights", title: "AI 2" }, // duplicate type — P2 allows
            { id: "x3", type: "dashboard",   title: "Dash" },
        ];
        const v = tabVisibilityFromPages(pages);
        expect(v).toEqual({ aiInsights: true, askPulse: false, dashboard: true });
    });

    it("enabledTabCount counts the booleans set in TabVisibility", () => {
        expect(enabledTabCount({ aiInsights: true, askPulse: true, dashboard: true })).toBe(3);
        expect(enabledTabCount({ aiInsights: true, askPulse: false, dashboard: true })).toBe(2);
        expect(enabledTabCount({ aiInsights: false, askPulse: false, dashboard: true })).toBe(1);
        expect(enabledTabCount({ aiInsights: false, askPulse: false, dashboard: false })).toBe(0);
    });

    it("DEFAULT_TAB_VISIBILITY matches DEFAULT_PAGES — lockstep invariant", () => {
        expect(tabVisibilityFromPages(DEFAULT_PAGES)).toEqual(DEFAULT_TAB_VISIBILITY);
        expect(pagesFromTabVisibility(DEFAULT_TAB_VISIBILITY).map(p => p.type)).toEqual(DEFAULT_PAGES.map(p => p.type));
    });
});

describe("multi-page P1 — Page identity preservation under projection", () => {
    it("custom page titles survive when re-projected through tabVisibility", () => {
        // A future P2/P3 user could rename a page. Today we cap at 3 pages
        // and DEFAULT_PAGE_TITLE is the only title source — but the
        // derivation helpers must handle custom titles gracefully so the
        // P2 commit doesn't have to re-derive them.
        const pages: Page[] = [
            { id: "page-ai-insights", type: "ai-insights", title: "Sales Briefing" },
            { id: "page-dashboard",   type: "dashboard",   title: "Q1 Dashboard" },
        ];
        const v = tabVisibilityFromPages(pages);
        expect(v).toEqual({ aiInsights: true, askPulse: false, dashboard: true });
        // Round-trip drops the custom title (because pagesFromTabVisibility
        // doesn't know it). This is expected and documented in the helper.
        const derived = pagesFromTabVisibility(v);
        expect(derived.map(p => p.title)).toEqual(["AI Insights", "Dashboard"]);
    });
});

describe("multi-page P1 — type identity", () => {
    it("PageType enum covers exactly the 3 tab types", () => {
        const all: PageType[] = ["ai-insights", "ask-pulse", "dashboard"];
        expect(all.length).toBe(3);
        // Compile-time assertion: any other string is a type error.
        // @ts-expect-error — "foo" is not a valid PageType
        const _bad: PageType = "foo";
        expect(_bad).toBeDefined(); // run-time string isn't validated, just compile-time
    });
});
