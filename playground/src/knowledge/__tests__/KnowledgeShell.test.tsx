// playground/src/knowledge/__tests__/KnowledgeShell.test.tsx
//
// Phase 8 (KB UI) — integration coverage for the Knowledge Base page.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SettingsProvider } from "../../settings/settingsStore";
import { KnowledgeShell } from "../KnowledgeShell";
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
    enforcement: "strict",
};

const PACK_LIST_RESPONSE = {
    packs: [
        {
            name: "cpg-fmcg",
            displayName: "CPG / FMCG",
            description: "Consumer Packaged Goods reference pack",
            subVerticals: [
                { name: "supply-chain", displayName: "Supply Chain" },
                { name: "procurement", displayName: "Procurement" },
            ],
        },
    ],
};

const PACK_DETAIL_RESPONSE = {
    name: "cpg-fmcg",
    displayName: "CPG / FMCG",
    description: "Consumer Packaged Goods reference pack",
    industries: ["CPG", "Retail"],
    aiCompatibility: ["genie", "supervisor"],
    biCompatibility: ["powerbi"],
    knowledgeBase: {
        glossary: "# Glossary\n\nOTIF — On Time In Full delivery rate.",
        ontology: "# Ontology\n\nProduct -> SKU -> Lot",
        references: "# References\n\nISO 22000",
    },
    subVerticals: [
        { name: "supply-chain", displayName: "Supply Chain" },
        { name: "procurement", displayName: "Procurement" },
    ],
    installedSubVerticals: ["supply-chain", "procurement"],
    demoConfigs: ["service-margin-recovery.json"],
};

const SUB_VERTICAL_DETAIL_RESPONSE = {
    pack: "cpg-fmcg",
    subVertical: "supply-chain",
    kpis: "# KPIs\n\nOTIF\nForecast accuracy\nInventory turnover",
    sampleQuestions: "# Sample questions\n\nWhich SKUs missed OTIF last week?",
    promptContext: "Supply chain context goes here.",
    biAiFit: "Power BI dashboards + Genie for supply-chain.",
};

function mount(initialPath: string): MountState {
    window.history.pushState({}, "", initialPath);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <SettingsProvider fetchAllowlist={async () => MVP_ALLOWLIST}>
                <KnowledgeShell />
            </SettingsProvider>,
        );
    });
    return { container, root };
}

function unmount(state: MountState): void {
    act(() => { state.root.unmount(); });
    state.container.remove();
    window.history.pushState({}, "", "/");
}

async function flushAll(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/assistant/knowledge/packs")) {
            return new Response(JSON.stringify(PACK_LIST_RESPONSE), { status: 200 });
        }
        if (/\/api\/assistant\/knowledge\/packs\/cpg-fmcg$/.test(url)) {
            return new Response(JSON.stringify(PACK_DETAIL_RESPONSE), { status: 200 });
        }
        if (/\/api\/assistant\/knowledge\/packs\/cpg-fmcg\/sub-verticals\/supply-chain$/.test(url)) {
            return new Response(JSON.stringify(SUB_VERTICAL_DETAIL_RESPONSE), { status: 200 });
        }
        return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("KnowledgeShell — render", () => {
    it("renders the pack list in the left rail at /knowledge", async () => {
        const state = mount("/knowledge");
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("CPG / FMCG");
        expect(text).toContain("2 sub-verticals");
        unmount(state);
    });

    it("loads the pack detail at /knowledge/cpg-fmcg", async () => {
        const state = mount("/knowledge/cpg-fmcg");
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("CPG / FMCG");
        expect(text).toContain("Industries");
        unmount(state);
    });

    it("renders the glossary at /knowledge/cpg-fmcg/glossary", async () => {
        const state = mount("/knowledge/cpg-fmcg/glossary");
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("OTIF");
        expect(text).toContain("On Time In Full");
        unmount(state);
    });

    it("renders the sub-vertical detail at /knowledge/cpg-fmcg/sub-verticals/supply-chain", async () => {
        const state = mount("/knowledge/cpg-fmcg/sub-verticals/supply-chain");
        await flushAll();
        const text = state.container.textContent || "";
        expect(text).toContain("Supply Chain");
        expect(text).toContain("Forecast accuracy");
        expect(text).toContain("Supply chain context goes here.");
        unmount(state);
    });

    it("shows section tabs (Overview / Glossary / Ontology / References / Sub-verticals / Runtime / Demos)", async () => {
        const state = mount("/knowledge/cpg-fmcg");
        await flushAll();
        const tabs = Array.from(state.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const labels = tabs.map(t => (t.textContent || "").trim());
        expect(labels).toEqual(expect.arrayContaining(["Overview", "Glossary", "Ontology", "References", "Sub-verticals", "Runtime use", "Demos"]));
        unmount(state);
    });
});
