// ConnectorBrandCard / Grid acceptance tests — Cycle 20 / S1 (2026-05-20).
//
// Uses the codebase's house style (createRoot + manual unmount + plain DOM
// queries) rather than @testing-library/react matchers, which would
// require @testing-library/jest-dom (not installed). Mirrors the pattern
// in src/settings/__tests__/AiGroup.test.tsx.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { ConnectorBrandCard } from "../ConnectorBrandCard";
import { ConnectorBrandGrid } from "../ConnectorBrandGrid";
import {
    buildProfileJsonSnippet,
    buildProfileEnvSnippet,
    groupManifestsByCategory,
    type ConnectorManifest,
} from "../../lib/connectorManifests";

const baseManifest: ConnectorManifest = {
    id: "genie",
    version: "1.0.0",
    displayName: "Databricks Genie",
    tagline: "Natural-language Q&A over Genie spaces",
    description: "Databricks-native NL → SQL with provenance.",
    icon: "databricks-genie",
    category: "databricks",
    maturity: "stable",
    profileType: "genie",
    profileTypes: ["genie"],
    capabilities: { llm: true, deterministic: false, qnaEmbedSurface: false, streamingAnswer: true, ragGrounded: true },
    profileSchema: {
        host:    { kind: "url",    required: true,  label: "Workspace URL" },
        spaceId: { kind: "guid",   required: true,  label: "Genie space ID" },
        token:   { kind: "secret", required: true,  label: "PAT", secret: true },
    },
    setupSteps: ["create space", "get PAT", "paste to config", "restart"],
    docsUrl: "https://docs.databricks.com/en/genie/",
    envPrefix: "GENIE",
    routes: [{ method: "POST", path: "/assistant/conversations/start", purpose: "conversation-start" }],
};

const demoManifest: ConnectorManifest = {
    id: "demo-mock",
    version: "0.1.0",
    displayName: "Demo — Synthetic Mock",
    tagline: "Try PulsePlay without any cloud credentials",
    description: "In-memory mock connector.",
    icon: "demo-mock",
    category: "demo",
    maturity: "preview",
    profileType: "demo-mock",
    profileTypes: ["demo-mock"],
    capabilities: { llm: false, deterministic: true, qnaEmbedSurface: false, streamingAnswer: false, ragGrounded: false },
    profileSchema: { displayName: { kind: "string", required: false, label: "Display name" } },
    setupSteps: ["paste", "restart"],
    docsUrl: "https://github.com/onerkm-in/PulsePlay",
    envPrefix: "DEMO",
    routes: [{ method: "POST", path: "/demo/start", purpose: "conversation-start" }],
};

interface RenderState {
    container: HTMLElement;
    root: Root;
}

function mount(node: React.ReactNode): RenderState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(node); });
    return { container, root };
}

function unmount({ container, root }: RenderState): void {
    act(() => { root.unmount(); });
    container.remove();
}

describe("ConnectorBrandCard — status derivation", () => {
    it("renders 'Available · not wired' when no profiles are configured", () => {
        const state = mount(
            <ConnectorBrandCard manifest={baseManifest} runtime={{ loadStatus: "loaded", configuredProfiles: [] }} activeProfileName={null} />,
        );
        const card = state.container.querySelector('[data-connector-id="genie"]') as HTMLElement;
        expect(card).not.toBeNull();
        expect(card.getAttribute("data-status")).toBe("available");
        expect(state.container.textContent).toContain("Available · not wired");
        unmount(state);
    });

    it("renders 'Active' when the active profile matches a valid configured profile", () => {
        const state = mount(
            <ConnectorBrandCard
                manifest={baseManifest}
                runtime={{
                    loadStatus: "loaded",
                    configuredProfiles: [{ name: "default", valid: true, warnings: [], source: "config.json", secretStatus: "present", legacyCombined: false }],
                }}
                activeProfileName="default"
            />,
        );
        const card = state.container.querySelector('[data-connector-id="genie"]') as HTMLElement;
        expect(card.getAttribute("data-status")).toBe("active");
        expect(state.container.textContent).toContain("Active");
        unmount(state);
    });

    it("renders 'Configured · warnings' when a configured profile has warnings", () => {
        const state = mount(
            <ConnectorBrandCard
                manifest={baseManifest}
                runtime={{
                    loadStatus: "loaded",
                    configuredProfiles: [{ name: "broken", valid: false, warnings: ["Missing required field: token"], source: "config.json", secretStatus: "missing", legacyCombined: false }],
                }}
                activeProfileName="broken"
            />,
        );
        const card = state.container.querySelector('[data-connector-id="genie"]') as HTMLElement;
        expect(card.getAttribute("data-status")).toBe("configured-degraded");
        expect(state.container.textContent).toContain("Configured · warnings");
        expect(state.container.textContent).toContain("Missing required field: token");
        unmount(state);
    });

    it("calls onPickProfile when a valid configured profile button is clicked", () => {
        const onPickProfile = vi.fn();
        const state = mount(
            <ConnectorBrandCard
                manifest={baseManifest}
                runtime={{
                    loadStatus: "loaded",
                    configuredProfiles: [{ name: "default", valid: true, warnings: [], source: "config.json", secretStatus: "present", legacyCombined: false }],
                }}
                activeProfileName={null}
                onPickProfile={onPickProfile}
            />,
        );
        const btn = state.container.querySelector('[data-action="pick-profile"][data-profile-name="default"]') as HTMLButtonElement;
        expect(btn).not.toBeNull();
        act(() => { btn.click(); });
        expect(onPickProfile).toHaveBeenCalledWith("default");
        unmount(state);
    });

    it("disables the pick button when the profile is invalid", () => {
        const state = mount(
            <ConnectorBrandCard
                manifest={baseManifest}
                runtime={{
                    loadStatus: "loaded",
                    configuredProfiles: [{ name: "broken", valid: false, warnings: ["Missing required field: token"], source: "config.json", secretStatus: "missing", legacyCombined: false }],
                }}
                activeProfileName={null}
                onPickProfile={() => undefined}
            />,
        );
        const btn = state.container.querySelector('[data-action="pick-profile"][data-profile-name="broken"]') as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        unmount(state);
    });

    it("marks legacy combined profiles with explanatory copy", () => {
        const state = mount(
            <ConnectorBrandCard
                manifest={baseManifest}
                runtime={{
                    loadStatus: "loaded",
                    configuredProfiles: [{ name: "pbi", valid: true, warnings: [], source: "config.json", secretStatus: "present", legacyCombined: true }],
                }}
                activeProfileName={null}
            />,
        );
        expect(state.container.textContent).toContain("Legacy combined profile");
        unmount(state);
    });

    it("exposes the maturity badge with the manifest's lifecycle stage", () => {
        const stableState = mount(<ConnectorBrandCard manifest={baseManifest} runtime={undefined} activeProfileName={null} />);
        const stableBadge = stableState.container.querySelector('[data-maturity="stable"]') as HTMLElement;
        expect(stableBadge).not.toBeNull();
        expect(stableBadge.textContent).toBe("STABLE");
        unmount(stableState);

        const previewState = mount(<ConnectorBrandCard manifest={demoManifest} runtime={undefined} activeProfileName={null} />);
        const previewBadge = previewState.container.querySelector('[data-maturity="preview"]') as HTMLElement;
        expect(previewBadge).not.toBeNull();
        expect(previewBadge.textContent).toBe("PREVIEW");
        unmount(previewState);
    });
});

describe("buildProfileJsonSnippet", () => {
    it("includes the type field and required fields with YOUR_* placeholders", () => {
        const snippet = buildProfileJsonSnippet(baseManifest);
        expect(snippet).toContain('"type": "genie"');
        expect(snippet).toContain('"host":');
        expect(snippet).toContain('"spaceId":');
        expect(snippet).toContain('"token":');
        expect(snippet).toContain("YOUR_TOKEN");
    });

    it("excludes optional fields from the placeholder list", () => {
        const augmented: ConnectorManifest = {
            ...baseManifest,
            profileSchema: {
                ...baseManifest.profileSchema,
                warehouseId: { kind: "string", required: false, label: "SQL warehouse ID" },
            },
        };
        const out = buildProfileJsonSnippet(augmented);
        expect(out).not.toContain("warehouseId");
    });

    it("renders secret placeholders for kind:'secret' fields, not the literal value", () => {
        const snippet = buildProfileJsonSnippet(baseManifest);
        expect(snippet).not.toMatch(/"token"\s*:\s*"pat-/);
        expect(snippet).toContain("YOUR_TOKEN");
    });
});

describe("buildProfileEnvSnippet", () => {
    it("emits PROXY_PROFILE_<NAME>_<FIELD> lines for required fields only", () => {
        const env = buildProfileEnvSnippet(baseManifest);
        expect(env).toMatch(/^# Profile:/m);
        expect(env).toContain("PROXY_PROFILE_GENIE_TYPE=genie");
        expect(env).toMatch(/PROXY_PROFILE_GENIE_HOST/);
        expect(env).toMatch(/PROXY_PROFILE_GENIE_TOKEN=YOUR_SECRET_HERE/);
    });
});

describe("groupManifestsByCategory", () => {
    it("returns categories in Microsoft → Azure → AWS → Databricks → Demo order", () => {
        const groups = groupManifestsByCategory([demoManifest, baseManifest]);
        expect(groups.map(g => g.category)).toEqual(["databricks", "demo"]);
    });

    it("omits categories with zero manifests", () => {
        const groups = groupManifestsByCategory([demoManifest]);
        expect(groups).toHaveLength(1);
        expect(groups[0].category).toBe("demo");
    });
});

describe("ConnectorBrandGrid — discovery endpoint integration", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("renders one section per category with manifest cards inside", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                manifests: [baseManifest, demoManifest],
                runtime: {
                    genie: { loadStatus: "loaded", configuredProfiles: [] },
                    "demo-mock": { loadStatus: "loaded", configuredProfiles: [] },
                },
            }),
        });
        const state = mount(<ConnectorBrandGrid activeProfileName={null} />);
        // Wait two microtasks for the fetch + useState to flush.
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(state.container.textContent).toContain("Databricks");
        expect(state.container.textContent).toContain("Demo");
        expect(state.container.querySelector('[data-connector-id="genie"]')).not.toBeNull();
        expect(state.container.querySelector('[data-connector-id="demo-mock"]')).not.toBeNull();
        unmount(state);
    });

    it("renders a fail-closed error card when the discovery endpoint is unreachable", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
        const state = mount(<ConnectorBrandGrid activeProfileName={null} />);
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        const errorCard = state.container.querySelector('[data-state="connector-catalogue-error"]') as HTMLElement;
        expect(errorCard).not.toBeNull();
        expect(errorCard.textContent).toContain("ECONNREFUSED");
        unmount(state);
    });

    it("renders a retry button on error that calls fetch again when clicked", async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"));
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                manifests: [baseManifest],
                runtime: { genie: { loadStatus: "loaded", configuredProfiles: [] } },
            }),
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        const state = mount(<ConnectorBrandGrid activeProfileName={null} />);
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        const retry = state.container.querySelector("button") as HTMLButtonElement;
        expect(retry).not.toBeNull();
        await act(async () => { retry.click(); await Promise.resolve(); await Promise.resolve(); });
        expect(state.container.textContent).toContain("Databricks");
        unmount(state);
    });
});
