// playground/src/settings/__tests__/leafScrollAndChips.test.tsx
//
// Coverage for Settings IA fixes #2 + #3:
//   #2 — Each <Leaf> renders `id="settings-<group>-<slug>"`, where slug
//        is leafSlug(label). SettingsShell's scroll-to-leaf effect uses
//        these ids; testing the id contract is the load-bearing assertion.
//   #3 — leafSlug helper is pure-function tested so the slug → URL
//        contract stays stable.
//
// We do NOT mount the full SettingsShell here — the SettingsProvider's
// allowlist fetch + status-strip rerenders run hot in jsdom and have
// previously OOM'd the test runner (see Codex's HANDOVER note about
// "tooling timeouts on the heavy dev page"). Each group's leaf ids are
// checked by rendering the group component in isolation with a shaped
// allowlist provider.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider } from "../settingsStore";
import { BiGroup, leafSlug } from "../groups/BiGroup";
import { PreferencesGroup } from "../groups/PreferencesGroup";
import { AdvancedGroup } from "../groups/AdvancedGroup";
import { GROUP_LEAF_LABELS } from "../SettingsShell";
import type { PulsePlayAllowlist } from "../../types/allowlist";

vi.mock("../../lib/discoveryClient", () => ({
    getDiscoverySnapshot: vi.fn().mockResolvedValue(null),
    subscribeDiscoveryCache: vi.fn().mockReturnValue(() => {}),
}));

const MVP_ALLOWLIST: PulsePlayAllowlist = {
    configured: true,
    biProviders: ["powerbi"],
    embedOrigins: { powerbi: ["app.powerbi.com"] },
    aadTenants: ["org-tenant"],
    aiProfiles: ["default"],
    packs: ["cpg-fmcg"],
    enforcement: "strict",
};

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <SettingsProvider fetchAllowlist={async () => MVP_ALLOWLIST}>
                {ui}
            </SettingsProvider>,
        );
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => state.root.unmount());
    state.container.remove();
}

beforeEach(() => {
    document.body.innerHTML = "";
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

/* ─── leafSlug (pure function) ────────────────────────────────────── */

describe("leafSlug helper", () => {
    it("slugifies leaf labels deterministically", () => {
        expect(leafSlug("Provider")).toBe("provider");
        expect(leafSlug("AI Insights setup ↗")).toBe("ai-insights-setup");
        expect(leafSlug("Export support bundle")).toBe("export-support-bundle");
        expect(leafSlug("Local storage inspector")).toBe("local-storage-inspector");
        expect(leafSlug("Model / Agent")).toBe("model-agent");
        expect(leafSlug("  spaced  ")).toBe("spaced");
    });

    it("never produces leading or trailing dashes (URL-safe)", () => {
        for (const labels of Object.values(GROUP_LEAF_LABELS)) {
            for (const label of labels) {
                const slug = leafSlug(label);
                expect(slug).not.toMatch(/^-/);
                expect(slug).not.toMatch(/-$/);
                expect(slug).toMatch(/^[a-z0-9-]+$/);
            }
        }
    });
});

/* ─── Leaf id contract (fix #2 enabler) ───────────────────────────── */

describe("Leaf renders id=settings-<group>-<slug> when group prop is set", () => {
    it("BiGroup leaves render the expected ids", () => {
        const state = mount(<BiGroup />);
        // Build expected ids from the dictionary (cross-checked against the
        // rendered DOM here; the drift test in leafLabels.drift.test.tsx
        // already proves the dictionary matches the rendered labels).
        for (const label of GROUP_LEAF_LABELS.bi) {
            const expectedId = `settings-bi-${leafSlug(label)}`;
            const node = state.container.querySelector(`[id="${expectedId}"]`);
            expect(node, `<Leaf label="${label}"> in BI group should have id="${expectedId}"`).toBeTruthy();
        }
        unmount(state);
    });

    it("PreferencesGroup leaves render the expected ids", () => {
        const state = mount(<PreferencesGroup />);
        for (const label of GROUP_LEAF_LABELS.preferences) {
            const expectedId = `settings-preferences-${leafSlug(label)}`;
            const node = state.container.querySelector(`[id="${expectedId}"]`);
            expect(node, `<Leaf label="${label}"> in Preferences should have id="${expectedId}"`).toBeTruthy();
        }
        unmount(state);
    });

    it("AdvancedGroup leaves render the expected ids", () => {
        const state = mount(<AdvancedGroup />);
        for (const label of GROUP_LEAF_LABELS.advanced) {
            const expectedId = `settings-advanced-${leafSlug(label)}`;
            const node = state.container.querySelector(`[id="${expectedId}"]`);
            expect(node, `<Leaf label="${label}"> in Advanced should have id="${expectedId}"`).toBeTruthy();
        }
        unmount(state);
    });

    it("Each leaf <article> carries scrollMarginTop so scrollIntoView lands below the sticky header", () => {
        // Just one group — the style is on the shared Leaf component so
        // it applies everywhere.
        const state = mount(<BiGroup />);
        const articles = state.container.querySelectorAll("article[id^='settings-bi-']");
        expect(articles.length).toBeGreaterThan(0);
        for (const article of Array.from(articles)) {
            const style = (article as HTMLElement).style;
            expect(style.scrollMarginTop).toBeTruthy();
        }
        unmount(state);
    });

    it("data-leaf-slug attribute matches the slug derived from the label", () => {
        const state = mount(<BiGroup />);
        const articles = state.container.querySelectorAll("article[data-leaf-slug]");
        expect(articles.length).toBeGreaterThan(0);
        for (const article of Array.from(articles)) {
            const slug = article.getAttribute("data-leaf-slug")!;
            const id = article.id;
            expect(id).toBe(`settings-bi-${slug}`);
            // Slug should round-trip through leafSlug.
            expect(leafSlug(slug)).toBe(slug);
        }
        unmount(state);
    });
});
