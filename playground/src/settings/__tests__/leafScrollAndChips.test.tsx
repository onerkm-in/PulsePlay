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
import { SetupGroup } from "../groups/SetupGroup";
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
    it("SetupGroup uses inline FieldCards (no per-leaf ids needed)", () => {
        // Setup is the Quick Setup canvas — three inline FieldCards
        // (BI tool / AI brain / Knowledge pack) instead of separately
        // deep-linkable Leaves. The drift test verifies this is consistent
        // with GROUP_LEAF_LABELS.setup === [].
        const state = mount(<SetupGroup />);
        expect(GROUP_LEAF_LABELS.setup).toEqual([]);
        // Title still renders for the readiness pill jump-link contract.
        const title = state.container.querySelector("#settings-setup-title");
        expect(title?.textContent).toBe("Setup");
        unmount(state);
    });

    // Sub-route entries (e.g., "Governance" under BI, "Appearance" under
    // Preferences) dispatch to dedicated pages via SettingsShell, so they
    // do NOT render as Leaf <article>s inside their parent group page.
    // Keep this list in sync with the dispatcher in SettingsShell.tsx.
    const SUB_ROUTE_LEAVES: Record<string, ReadonlySet<string>> = {
        bi: new Set(["Governance"]),
        ai: new Set(["Knowledge Base", "Supervisor Fusion"]),
        preferences: new Set(["Appearance"]),
        system: new Set(["Developer Tools"]),
    };

    it("BiGroup leaves render the expected ids", () => {
        const state = mount(<BiGroup />);
        for (const label of GROUP_LEAF_LABELS.bi) {
            if (SUB_ROUTE_LEAVES.bi?.has(label)) continue;
            const expectedId = `settings-bi-${leafSlug(label)}`;
            const node = state.container.querySelector(`[id="${expectedId}"]`);
            expect(node, `<Leaf label="${label}"> in BI group should have id="${expectedId}"`).toBeTruthy();
        }
        unmount(state);
    });

    it("PreferencesGroup leaves render the expected ids", () => {
        const state = mount(<PreferencesGroup />);
        for (const label of GROUP_LEAF_LABELS.preferences) {
            if (SUB_ROUTE_LEAVES.preferences?.has(label)) continue;
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

/* ─── Settings IA fix #8 — Per-leaf Copy link ────────────────────────── */

describe("Leaf Copy link button (Settings IA fix #8)", () => {
    it("every leaf with a group has a Copy link button with the correct testId", () => {
        const state = mount(<BiGroup />);
        const buttons = state.container.querySelectorAll('button[data-testid^="pp-leaf-copy-link-bi-"]');
        // BiGroup currently renders 5 leaves (Provider, Embed, Authentication, Canvas, Status).
        // Each must have a Copy link button.
        expect(buttons.length).toBeGreaterThanOrEqual(5);
        for (const btn of Array.from(buttons)) {
            const aria = btn.getAttribute("aria-label");
            expect(aria).toMatch(/^Copy link to /);
            expect(btn.textContent).toBe("Copy link");
        }
        unmount(state);
    });

    it("Copy link button writes the deep-link URL to clipboard on click", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        // jsdom doesn't ship a clipboard by default; stub it.
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });

        const state = mount(<BiGroup />);
        const btn = state.container.querySelector(
            'button[data-testid="pp-leaf-copy-link-bi-provider"]',
        ) as HTMLButtonElement;
        expect(btn).toBeTruthy();
        await act(async () => { btn.click(); });

        expect(writeText).toHaveBeenCalledTimes(1);
        const [url] = writeText.mock.calls[0] as [string];
        expect(url).toMatch(/\/settings\/bi\/provider$/);
        unmount(state);
    });

    it("Copy link button does not throw when navigator.clipboard is unavailable", async () => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: undefined,
        });
        const state = mount(<BiGroup />);
        const btn = state.container.querySelector(
            'button[data-testid="pp-leaf-copy-link-bi-provider"]',
        ) as HTMLButtonElement;
        // Should not throw even though clipboard is undefined.
        await act(async () => { btn.click(); });
        unmount(state);
    });
});
