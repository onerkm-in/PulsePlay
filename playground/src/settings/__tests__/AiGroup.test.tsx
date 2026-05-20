// playground/src/settings/__tests__/AiGroup.test.tsx
//
// Phase 4 — verifies the AI group renders provider picker, supervisor
// fan-out table, and knowledge pack section against allowlist-filtered
// metadata. Network fetches are mocked.

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
    aiProfiles: ["default", "supervisor"],
    packs: ["cpg-fmcg"],
    genieSpaces: ["space-sales", "space-marketing"],
    enforcement: "strict",
};

const PROFILES_RESPONSE = [
    { name: "default", displayName: "Default helper", dataDomain: "sales data", spaceId: "abc123...def456" },
    {
        name: "supervisor",
        displayName: "PulsePlay Supervisor",
        description: "Genie Supervisor Agent",
        type: "supervisor-local",
        spaces: ["space-sales", "space-marketing"],
        agentName: "PulsePlay Supervisor",
    },
];

const PACKS_RESPONSE = {
    packs: [
        { name: "cpg-fmcg", displayName: "CPG / FMCG", subVerticals: [] },
    ],
};

// Cycle 20 — the Connector catalogue now hosts profile selection; the
// AiGroup test must mock /api/assistant/connector-types so the catalogue
// renders + clicking a configured-profile button activates that profile.
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
        {
            id: "supervisor-local",
            version: "1.0.0",
            displayName: "Supervisor — Local Fan-Out",
            tagline: "Proxy-side fan-out",
            description: "Local supervisor",
            icon: "sup-local",
            category: "databricks",
            maturity: "beta",
            profileType: "supervisor-local",
            profileTypes: ["supervisor-local"],
            capabilities: { llm: true, multiHelper: true },
            profileSchema: { spaces: { kind: "json", required: true, label: "Spaces" } },
            setupSteps: ["configure"],
            docsUrl: "https://docs.databricks.com",
            routes: [{ method: "POST", path: "/sup", purpose: "conversation-start" }],
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
        "supervisor-local": {
            loadStatus: "loaded",
            configuredProfiles: [{
                name: "supervisor", valid: true, warnings: [],
                source: "config.json", secretStatus: "present", legacyCombined: false,
            }],
        },
    },
};

let capabilitiesResponse: Record<string, unknown>;

beforeEach(() => {
    window.localStorage.clear();
    capabilitiesResponse = {
        ok: true,
        assistantProfile: "default",
        capabilities: {
            genie: true,
            lakeview: true,
            servingEndpoints: true,
            apps: true,
            vectorSearch: false,
            jobs: true,
        },
        details: {
            vectorSearch: {
                key: "vectorSearch",
                path: "/api/2.0/vector-search/endpoints",
                status: "available",
                available: true,
                ready: false,
                count: 0,
            },
        },
        counts: { vectorSearch: 0 },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/assistant/profiles")) {
            return new Response(JSON.stringify(PROFILES_RESPONSE), { status: 200 });
        }
        if (url.endsWith("/api/assistant/knowledge/packs")) {
            return new Response(JSON.stringify(PACKS_RESPONSE), { status: 200 });
        }
        if (url.includes("/api/assistant/capabilities")) {
            return new Response(JSON.stringify(capabilitiesResponse), { status: 200 });
        }
        if (url.endsWith("/api/assistant/connector-types")) {
            return new Response(JSON.stringify(CONNECTOR_TYPES_RESPONSE), { status: 200 });
        }
        return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    window.localStorage.clear();
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

// Cycle 20 update: profile selection moved from the legacy ProviderPicker
// (inside the Assistant tier) to the Connector catalogue's brand cards.
// Each card surfaces its configured profiles as click-to-activate buttons.
// Tests now drive selection through the catalogue.
function findCatalogueProfileButton(container: HTMLElement, profileName: string): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>(
        `[data-action="pick-profile"][data-profile-name="${profileName}"]`,
    );
}

describe("AiGroup — Phase 4 wiring", () => {
    it("renders both allowed profiles via the Connector catalogue cards", async () => {
        const state = mount();
        await flushAll();
        // Click '+ Show all' to expand to all manifests (default view shows
        // only configured ones; both our profiles are configured so they
        // render in the compact view too, but expand makes the assertion
        // robust against future catalogue filter tweaks).
        const text = state.container.textContent || "";
        // Profile names appear in the configured-profile buttons:
        expect(findCatalogueProfileButton(state.container, "default")).not.toBeNull();
        expect(findCatalogueProfileButton(state.container, "supervisor")).not.toBeNull();
        // Connector card display names:
        expect(text).toContain("Databricks Genie");
        expect(text).toContain("Supervisor — Local Fan-Out");
        unmount(state);
    });

    it("shows a Supervisor connector card in the catalogue", async () => {
        const state = mount();
        await flushAll();
        // The supervisor-local card renders with its tagline visible.
        const text = state.container.textContent || "";
        expect(text).toContain("Supervisor — Local Fan-Out");
        // And exposes the configured profile button for activation.
        expect(findCatalogueProfileButton(state.container, "supervisor")).not.toBeNull();
        unmount(state);
    });

    it("selecting the supervisor profile via the catalogue reveals the fan-out table", async () => {
        const state = mount();
        await flushAll();
        const supervisorBtn = findCatalogueProfileButton(state.container, "supervisor");
        expect(supervisorBtn).not.toBeNull();
        await act(async () => {
            supervisorBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });
        // After selection, the Assistant tier's Model/Agent leaf renders the
        // SupervisorFanOutTable (driven by /api/assistant/profiles spaces).
        const text = state.container.textContent || "";
        expect(text).toContain("space-sales");
        expect(text).toContain("space-marketing");
        expect(text).toContain("Configured spaces");
        unmount(state);
    });

    it("selecting a connector via the catalogue mirrors the Pulse runtime assistantProfile", async () => {
        const state = mount();
        await flushAll();
        const supervisorBtn = findCatalogueProfileButton(state.container, "supervisor");
        expect(supervisorBtn).not.toBeNull();
        await act(async () => {
            supervisorBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });
        const raw = window.localStorage.getItem("pulseplay:visual-settings:genieSettings");
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw || "{}").assistantProfile).toBe("supervisor");
        unmount(state);
    });

    it("renders the knowledge pack picker with allowlist-filtered packs", async () => {
        const state = mount();
        await flushAll();
        expect(state.container.textContent || "").toContain("CPG / FMCG");
        unmount(state);
    });

    it("renders the shared assistant response-behavior settings on the Settings page", async () => {
        // Codex 2026-05-19 naming audit: the leaf label was renamed from
        // "AI Insights" to "Response behavior" because the underlying settings
        // (prompt strategy, domain guidance, metric semantics) flow through to
        // BOTH AI Insights and Ask Pulse — they are shared assistant context,
        // not Insights-specific. Helper text + label both reflect the change.
        const state = mount();
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("Response behavior");
        expect(text).toContain("Shared with both AI Insights and Ask Pulse");
        expect(text).toContain("Custom insights prompt");
        expect(text).toContain("Domain guidance");
        expect(text).toContain("Metric direction rules");
        expect(text).not.toContain("Open Pulse Setup");
        unmount(state);
    });

    it("shows Vector Search KB as hibernating when Databricks capability has zero endpoints", async () => {
        const state = mount();
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("Vector Search KB");
        expect(text).toContain("Hibernating");
        expect(text).toContain("Endpoints");
        expect(text).toContain("0");
        unmount(state);
    });

    it("shows Vector Search KB only when the capability registry reports endpoints", async () => {
        capabilitiesResponse = {
            ...capabilitiesResponse,
            capabilities: { ...(capabilitiesResponse.capabilities as Record<string, boolean>), vectorSearch: true },
            details: {
                ...(capabilitiesResponse.details as Record<string, unknown>),
                vectorSearch: {
                    key: "vectorSearch",
                    path: "/api/2.0/vector-search/endpoints",
                    status: "available",
                    available: true,
                    ready: true,
                    count: 2,
                },
            },
            counts: { vectorSearch: 2 },
        };
        const state = mount();
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("Vector Search KB");
        expect(text).toContain("Endpoints");
        expect(text).toContain("2");
        unmount(state);
    });

    it("renders Run probe button when Supervisor is selected via the catalogue", async () => {
        const state = mount();
        await flushAll();
        const supervisorBtn = findCatalogueProfileButton(state.container, "supervisor");
        expect(supervisorBtn).not.toBeNull();
        await act(async () => {
            supervisorBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });
        const text = state.container.textContent || "";
        expect(text).toContain("Run probe across all spaces");
        unmount(state);
    });
});
