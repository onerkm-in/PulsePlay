// playground/src/settings/__tests__/leafLabels.drift.test.tsx
//
// Drift-prevention test for Settings IA fix #5. Asserts that every
// `<Leaf label="…">` rendered in each group file ALSO appears in
// `GROUP_LEAF_LABELS[group]` (the dictionary that powers the search bar).
//
// Why this exists: in the first Settings IA review (2026-05-14), the
// dictionary had drifted from the rendered leaves:
//   - "Local storage" in dict vs "Local storage inspector" rendered
//   - "Export bundle" in dict vs "Export support bundle" rendered
//   - "License posture" leaf rendered but missing from dict entirely
//   - Trailing "↗" on AI deep-link rows mismatched
// → search for "license" or "support" returned no result.
//
// The fix: when you add/rename a Leaf, you MUST update GROUP_LEAF_LABELS
// in SettingsShell.tsx. This test catches that drift in CI.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GROUP_LEAF_LABELS } from "../SettingsShell";
import { SetupGroup } from "../groups/SetupGroup";
import { BiGroup } from "../groups/BiGroup";
import { AiGroup } from "../groups/AiGroup";
import { PreferencesGroup } from "../groups/PreferencesGroup";
import { SystemGroup } from "../groups/SystemGroup";
import { AdvancedGroup } from "../groups/AdvancedGroup";
import { SettingsProvider } from "../settingsStore";

// Network-heavy children get the same mocks the existing tests use.
vi.mock("../../lib/discoveryClient", () => ({
    getDiscoverySnapshot: vi.fn().mockResolvedValue(null),
    subscribeDiscoveryCache: vi.fn().mockReturnValue(() => {}),
}));

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(<SettingsProvider>{ui}</SettingsProvider>);
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => state.root.unmount());
    state.container.remove();
}

/** Extract rendered leaf labels by scanning the DOM for the label div the
 *  shared `Leaf` renderer (in BiGroup.tsx exports) marks with the
 *  `data-leaf-label="true"` attribute. We use the attribute (not first-
 *  element-child) because Settings IA fix #8 wrapped the label + Copy-link
 *  button in a flex container, so the article's firstElementChild is now
 *  that container, not the label itself. */
function extractRenderedLeafLabels(container: HTMLElement): string[] {
    const out: string[] = [];
    container.querySelectorAll("article").forEach(article => {
        const labelEl = article.querySelector("[data-leaf-label='true']") as HTMLElement | null;
        if (!labelEl) return;
        const text = labelEl.textContent?.trim();
        if (text) out.push(text);
    });
    return out;
}

beforeEach(() => {
    document.body.innerHTML = "";
    // Empty allowlist + no fetch traffic — the test doesn't care about
    // allowlist contents; it just needs the groups to render their leaves.
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("GROUP_LEAF_LABELS dictionary drift prevention", () => {
    it("Setup: uses inline FieldCards, not Leaves — dictionary stays empty", () => {
        const state = mount(<SetupGroup />);
        const rendered = extractRenderedLeafLabels(state.container);
        // Setup group is the Quick Setup canvas — it renders FieldCard
        // <section>s, not Leaf <article>s. The dictionary entry is [] by
        // design; the group is still discoverable by its label + description.
        expect(rendered.length).toBe(0);
        expect(GROUP_LEAF_LABELS.setup).toEqual([]);
        unmount(state);
    });

    it("BI: every rendered Leaf appears in GROUP_LEAF_LABELS.bi", () => {
        const state = mount(<BiGroup />);
        const rendered = extractRenderedLeafLabels(state.container);
        expect(rendered.length).toBeGreaterThan(0);
        for (const label of rendered) {
            expect(GROUP_LEAF_LABELS.bi).toContain(label);
        }
        unmount(state);
    });

    it("AI: every rendered Leaf appears in GROUP_LEAF_LABELS.ai", () => {
        const state = mount(<AiGroup />);
        const rendered = extractRenderedLeafLabels(state.container);
        expect(rendered.length).toBeGreaterThan(0);
        for (const label of rendered) {
            expect(GROUP_LEAF_LABELS.ai).toContain(label);
        }
        unmount(state);
    });

    it("Preferences: every rendered Leaf appears in GROUP_LEAF_LABELS.preferences", () => {
        const state = mount(<PreferencesGroup />);
        const rendered = extractRenderedLeafLabels(state.container);
        expect(rendered.length).toBeGreaterThan(0);
        for (const label of rendered) {
            expect(GROUP_LEAF_LABELS.preferences).toContain(label);
        }
        unmount(state);
    });

    it("System: every rendered Leaf appears in GROUP_LEAF_LABELS.system", () => {
        const state = mount(<SystemGroup />);
        const rendered = extractRenderedLeafLabels(state.container);
        expect(rendered.length).toBeGreaterThan(0);
        for (const label of rendered) {
            expect(GROUP_LEAF_LABELS.system).toContain(label);
        }
        unmount(state);
    });

    it("Advanced: every rendered Leaf appears in GROUP_LEAF_LABELS.advanced", () => {
        const state = mount(<AdvancedGroup />);
        const rendered = extractRenderedLeafLabels(state.container);
        expect(rendered.length).toBeGreaterThan(0);
        for (const label of rendered) {
            expect(GROUP_LEAF_LABELS.advanced).toContain(label);
        }
        unmount(state);
    });

    it("Dictionary cardinality matches rendered cardinality (no orphan dictionary entries)", () => {
        // For each group, render it once and assert that the dictionary
        // doesn't have MORE labels than rendered (i.e. no zombie entries
        // for leaves that were removed but never cleaned up from the
        // search dictionary).
        //
        // Sub-route exceptions: some dictionary entries correspond to
        // dedicated sub-pages dispatched by SettingsShell.ActiveGroup
        // (e.g., AI → "Knowledge Base" mounts <AiKnowledgeBase/>, not a
        // Leaf inside <AiGroup/>). Those entries don't render as Leaves
        // when the parent group page mounts; the rail still surfaces them
        // and the search still finds them.
        const SUB_ROUTE_LABELS: Record<keyof typeof GROUP_LEAF_LABELS, ReadonlySet<string>> = {
            setup: new Set(),
            bi: new Set(),
            ai: new Set(["Knowledge Base", "Supervisor Fusion"]),
            preferences: new Set(),
            system: new Set(),
            advanced: new Set(),
        };
        const cases: Array<[keyof typeof GROUP_LEAF_LABELS, React.ReactNode]> = [
            ["setup", <SetupGroup key="setup" />],
            ["bi", <BiGroup key="bi" />],
            ["ai", <AiGroup key="ai" />],
            ["preferences", <PreferencesGroup key="pref" />],
            ["system", <SystemGroup key="sys" />],
            ["advanced", <AdvancedGroup key="adv" />],
        ];
        for (const [group, ui] of cases) {
            const state = mount(ui);
            const rendered = extractRenderedLeafLabels(state.container);
            const renderedSet = new Set(rendered);
            const subRoutes = SUB_ROUTE_LABELS[group];
            for (const dictLabel of GROUP_LEAF_LABELS[group]) {
                if (subRoutes.has(dictLabel)) continue;
                expect(
                    renderedSet.has(dictLabel),
                    `Dictionary entry "${dictLabel}" in GROUP_LEAF_LABELS.${group} has no matching <Leaf label="${dictLabel}"> in the rendered DOM. Either restore the leaf, or remove the dictionary entry, or add it to SUB_ROUTE_LABELS if it dispatches to a dedicated sub-page.`,
                ).toBe(true);
            }
            unmount(state);
        }
    });
});
