// playground/src/settings/__tests__/phaseCScaffolding.test.ts
//
// Phase C scaffolding contract tests. Validates the PaneInstance shape
// + derivation helpers + invariants that follow-up commits will rely on
// when they wire actual multi-mount + detach overlay behavior.

import { describe, it, expect } from "vitest";
import {
    DEFAULT_PAGES,
    DEFAULT_PANE_REGISTRY,
    paneRegistryFromPages,
    inlinePaneCountByPage,
    type PaneInstance,
    type Page,
} from "../settingsStore";

describe("Phase C scaffolding — PaneInstance + registry helpers", () => {
    it("DEFAULT_PANE_REGISTRY matches DEFAULT_PAGES — 1 inline pane per page", () => {
        expect(DEFAULT_PANE_REGISTRY.length).toBe(DEFAULT_PAGES.length);
        for (const page of DEFAULT_PAGES) {
            const pane = DEFAULT_PANE_REGISTRY.find(p => p.pageId === page.id);
            expect(pane).toBeDefined();
            expect(pane?.placement).toBe("inline");
            expect(pane?.paneId).toBe(`pane-${page.id}-0`);
        }
    });

    it("paneRegistryFromPages produces one inline pane per page", () => {
        const pages: Page[] = [
            { id: "p1", type: "ai-insights", title: "A" },
            { id: "p2", type: "ask-pulse",   title: "B" },
        ];
        const registry = paneRegistryFromPages(pages);
        expect(registry.length).toBe(2);
        expect(registry[0]).toMatchObject({ paneId: "pane-p1-0", pageId: "p1", placement: "inline" });
        expect(registry[1]).toMatchObject({ paneId: "pane-p2-0", pageId: "p2", placement: "inline" });
    });

    it("inlinePaneCountByPage handles single-inline-per-page (today)", () => {
        const counts = inlinePaneCountByPage(DEFAULT_PANE_REGISTRY);
        for (const page of DEFAULT_PAGES) {
            expect(counts[page.id]).toBe(1);
        }
    });

    it("inlinePaneCountByPage handles same-tab multi-mount (future P-C runtime)", () => {
        const registry: PaneInstance[] = [
            { paneId: "pane-A-0", pageId: "A", placement: "inline", createdAt: 1 },
            { paneId: "pane-A-1", pageId: "A", placement: "inline", createdAt: 2 }, // dup inline
            { paneId: "pane-A-2", pageId: "A", placement: "floating", createdAt: 3 }, // floating doesn't count
            { paneId: "pane-B-0", pageId: "B", placement: "inline", createdAt: 4 },
        ];
        const counts = inlinePaneCountByPage(registry);
        expect(counts["A"]).toBe(2); // 2 inline panes on page A
        expect(counts["B"]).toBe(1);
        // Floating doesn't contribute to inline counts.
        expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(3);
    });

    it("paneRegistryFromPages produces deterministic paneIds for same input", () => {
        const pages: Page[] = [{ id: "p", type: "dashboard", title: "D" }];
        const r1 = paneRegistryFromPages(pages);
        const r2 = paneRegistryFromPages(pages);
        expect(r1[0].paneId).toBe(r2[0].paneId);
    });
});

describe("Phase C scaffolding — PaneInstance placement enum", () => {
    it("recognizes 'inline' / 'floating' / 'minimized' as the 3 valid placements", () => {
        const samples: PaneInstance[] = [
            { paneId: "x", pageId: "p", placement: "inline",    createdAt: 1 },
            { paneId: "y", pageId: "p", placement: "floating",  createdAt: 2 },
            { paneId: "z", pageId: "p", placement: "minimized", createdAt: 3 },
        ];
        for (const s of samples) {
            expect(["inline", "floating", "minimized"]).toContain(s.placement);
        }
    });
});
