// playground/src/settings/__tests__/PromptDraftPanel.test.tsx
//
// FEATURE-P1 auto-prompt-from-context — Settings wiring tests. Verifies
// the "Generate prompts from data context" panel renders in the shared
// Response-behavior editor, gates on a resolved profile, drafts from the
// mocked /api/assistant/discover snapshot, and applies drafts to the
// persisted insightsPrompt / insightsDomainGuidance settings.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider } from "../settingsStore";
import { AiGroup } from "../groups/AiGroup";
import type { PulsePlayAllowlist } from "../../types/allowlist";

interface MountState {
    container: HTMLElement;
    root: Root;
}

const MVP_ALLOWLIST: PulsePlayAllowlist = {
    configured: true,
    biProviders: ["powerbi"],
    embedOrigins: { powerbi: ["app.powerbi.com"] },
    aadTenants: ["org-tenant"],
    aiProfiles: ["default"],
    packs: ["cpg-fmcg"],
    genieSpaces: ["space-sales"],
    enforcement: "strict",
};

const PROFILES_RESPONSE = [
    { name: "default", displayName: "Default helper", dataDomain: "sales data", spaceId: "abc123" },
];

const PACKS_RESPONSE = { packs: [{ name: "cpg-fmcg", displayName: "CPG / FMCG", subVerticals: [] }] };

const CONNECTOR_TYPES_RESPONSE = {
    manifests: [
        {
            id: "genie",
            version: "1.0.0",
            displayName: "Databricks Genie",
            tagline: "NL Q&A over Genie spaces",
            description: "Genie",
            icon: "genie",
            category: "databricks",
            maturity: "stable",
            profileType: "genie",
            profileTypes: ["genie"],
            capabilities: { llm: true },
            profileSchema: { spaceId: { kind: "guid", required: true, label: "Space ID" } },
            setupSteps: ["create"],
            docsUrl: "https://docs.databricks.com",
            routes: [{ method: "POST", path: "/x", purpose: "conversation-start" }],
        },
    ],
    runtime: {
        genie: {
            loadStatus: "loaded",
            configuredProfiles: [{
                name: "default", valid: true, warnings: [],
                source: "config.json", secretStatus: "present", legacyCombined: false,
            }],
        },
    },
};

const CAPABILITIES_RESPONSE = {
    ok: true,
    assistantProfile: "default",
    capabilities: { genie: true },
    details: {},
    counts: {},
};

function discoverySnapshotBody(): Record<string, unknown> {
    const now = Date.now();
    return {
        snapshotVersion: 1,
        fetchedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
        cacheKey: "test",
        sources: {
            probe: {
                displayName: "SalesPerformance model",
                connectorType: "powerbi-semantic-model",
                inference: { suggestedPack: "cpg-fmcg", confidence: 1, because: [] },
            },
            biMetadata: {
                visibleMeasures: [{ name: "Total Sales" }, { name: "Total Profit" }],
                visibleDimensions: [{ name: "Segment" }],
            },
            packKpis: [],
        },
        fused: {
            availableKpis: [{
                name: "Total Sales", source: "pack", definition: "Sum of invoiced revenue",
                units: "USD", direction: "higher", grounded: [], aligned: true,
            }],
            reachableFrames: [],
            unreachableFrames: [],
        },
        warnings: [],
    };
}

let discoverStatus: number;

beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    discoverStatus = 200;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/assistant/profiles")) {
            return new Response(JSON.stringify(PROFILES_RESPONSE), { status: 200 });
        }
        if (url.endsWith("/api/assistant/knowledge/packs")) {
            return new Response(JSON.stringify(PACKS_RESPONSE), { status: 200 });
        }
        if (url.includes("/api/assistant/capabilities")) {
            return new Response(JSON.stringify(CAPABILITIES_RESPONSE), { status: 200 });
        }
        if (url.endsWith("/api/assistant/connector-types")) {
            return new Response(JSON.stringify(CONNECTOR_TYPES_RESPONSE), { status: 200 });
        }
        if (url.endsWith("/api/assistant/discover")) {
            if (discoverStatus !== 200) {
                return new Response(JSON.stringify({ error: "discover down" }), { status: discoverStatus });
            }
            return new Response(JSON.stringify(discoverySnapshotBody()), { status: 200 });
        }
        return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
});

function mount(): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <SettingsProvider fetchAllowlist={async () => MVP_ALLOWLIST}>
                <AiGroup />
            </SettingsProvider>,
        );
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

async function flushAll(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
    return Array.from(container.querySelectorAll("button"))
        .find(b => (b.textContent || "").trim() === text) ?? null;
}

async function click(el: HTMLElement): Promise<void> {
    await act(async () => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
    });
}

async function selectDefaultProfile(state: MountState): Promise<void> {
    const btn = state.container.querySelector<HTMLButtonElement>(
        '[data-action="pick-profile"][data-profile-name="default"]',
    );
    expect(btn).not.toBeNull();
    await click(btn!);
    await flushAll();
}

describe("PromptDraftPanel — generate prompts from data context", () => {
    it("renders the panel and disables the button until a profile is selected", async () => {
        const state = mount();
        await flushAll();
        expect(state.container.textContent).toContain("Generate prompts from data context");
        const btn = findButtonByText(state.container, "Generate from data context");
        expect(btn).not.toBeNull();
        expect(btn!.disabled).toBe(true);
        expect(btn!.title).toContain("Select an AI provider first");
        unmount(state);
    });

    it("drafts from the discovery snapshot and applies to both prompt fields", async () => {
        const state = mount();
        await flushAll();
        await selectDefaultProfile(state);

        const btn = findButtonByText(state.container, "Generate from data context");
        expect(btn).not.toBeNull();
        expect(btn!.disabled).toBe(false);
        await click(btn!);
        await flushAll();

        const text = state.container.textContent || "";
        expect(text).toContain("Drafted from: 2 measures · 1 dimension · 1 KPI definition · SalesPerformance model");

        // Both target fields are empty → each row shows a plain Apply.
        const applyButtons = Array.from(state.container.querySelectorAll("button"))
            .filter(b => (b.textContent || "").trim() === "Apply");
        expect(applyButtons.length).toBe(2);

        await click(applyButtons[0]); // Custom insights prompt
        await click(applyButtons[1]); // Domain guidance
        await flushAll();

        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        expect(raw).toBeTruthy();
        const persisted = JSON.parse(raw || "{}");
        expect(persisted.insightsPrompt).toContain("## Objective");
        expect(persisted.insightsPrompt).toContain("Total Sales, Total Profit");
        expect(persisted.insightsDomainGuidance).toContain("Total Sales: higher is better");
        expect(state.container.textContent).toContain("Applied — edit it below.");
        unmount(state);
    });

    it("offers Replace/Append instead of silently overwriting existing text", async () => {
        const state = mount();
        await flushAll();
        await selectDefaultProfile(state);

        // Pre-fill the insights prompt through its textarea so the store
        // carries existing author text.
        const textareas = Array.from(state.container.querySelectorAll("textarea"));
        const promptArea = textareas.find(t => (t.placeholder || "").includes("## Objective"));
        expect(promptArea).toBeTruthy();
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
            setter.call(promptArea!, "My hand-written prompt");
            promptArea!.dispatchEvent(new Event("input", { bubbles: true }));
            await Promise.resolve();
        });

        const btn = findButtonByText(state.container, "Generate from data context");
        await click(btn!);
        await flushAll();

        expect(findButtonByText(state.container, "Replace existing")).not.toBeNull();
        const append = findButtonByText(state.container, "Append below existing");
        expect(append).not.toBeNull();
        await click(append!);
        await flushAll();

        const persisted = JSON.parse(window.localStorage.getItem("pulseplay:visual-settings:genieSettings") || "{}");
        expect(persisted.insightsPrompt.startsWith("My hand-written prompt")).toBe(true);
        expect(persisted.insightsPrompt).toContain("## Objective");
        unmount(state);
    });

    it("shows an honest empty state when discovery fails and no domain hint exists", async () => {
        discoverStatus = 503;
        const state = mount();
        await flushAll();
        await selectDefaultProfile(state);

        const btn = findButtonByText(state.container, "Generate from data context");
        await click(btn!);
        await flushAll();

        expect(state.container.textContent).toContain("No data context available yet");
        unmount(state);
    });
});
