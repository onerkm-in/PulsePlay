// bi-adapters/native/__tests__/index.test.ts
//
// G1 native adapter skeleton: contract conformance, renderer-only
// capabilities, command rejection, and import-boundary guardrails.

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
    NativeBIAdapter,
    NATIVE_FORBIDDEN_COMMAND_KINDS,
    NATIVE_RENDERER_CAPABILITIES,
    type NativeBICommand,
    type NativeEvent,
} from "../index";
import type { BICommand, BIEmbedConfig } from "../../../playground/src/biPanel/BIAdapter";
import { BI_ERR } from "../../../playground/src/biPanel/BIAdapter";
import { runAdapterConformance } from "../../../playground/src/biPanel/__conformance__/adapterConformance";

const VALID_CONFIG: BIEmbedConfig = {};
const VALID_GOVERNED_RESULT = Object.freeze({
    rows: [],
    governance: {
        enforced: true,
        authority: "unity-catalog",
        subjectRef: "user:abc123def456",
        requestId: "req-native-1",
    },
});

runAdapterConformance("NativeBIAdapter", {
    factory: () => new NativeBIAdapter(),
    validConfig: VALID_CONFIG,
});

describe("NativeBIAdapter — renderer-only identity", () => {
    test("advertises native vendor identity", () => {
        const adapter = new NativeBIAdapter();
        expect(adapter.vendor).toBe("native");
        expect(adapter.displayName).toBe("Native result canvas");
    });

    test("BI capabilities expose no BI-tool behavior", () => {
        const caps = new NativeBIAdapter().capabilities();
        expect(caps).toEqual({
            canNavigatePages: false,
            canApplyFilters: false,
            canExport: false,
            canRefresh: false,
            canFullscreen: false,
            requiresContainerEl: true,
        });
    });

    test("native capabilities lock hard non-goals to false", () => {
        expect(NATIVE_RENDERER_CAPABILITIES).toEqual({
            authoring: false,
            dragLayout: false,
            crossFilter: false,
            drill: false,
            semanticModeling: false,
            liveRefresh: false,
            permissions: false,
            queryExecution: false,
            persistence: false,
        });
    });
});

describe("NativeBIAdapter — mount and lifecycle", () => {
    let containerEl: HTMLElement;

    beforeEach(() => {
        containerEl = document.createElement("div");
        document.body.appendChild(containerEl);
    });

    afterEach(() => {
        if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl);
    });

    test("mount renders the native empty state without an embed URL", async () => {
        const adapter = new NativeBIAdapter();
        await mountAdapter(adapter, containerEl, {});
        const root = containerEl.querySelector<HTMLElement>("[data-native-bi-adapter='true']");
        expect(root).not.toBeNull();
        // 2026-05-27 — empty-state copy updated again as part of the
        // uniformity pass: the canvas now reads "Pulse Canvas" instead
        // of "AI chart canvas" so the three surfaces use one vocabulary.
        // Vendor displayName above still reads "Native result canvas" —
        // that's the vendor identity in settings, separate from the
        // canvas's user-facing empty state.
        expect(root?.textContent).toContain("Pulse Canvas");
        expect(root?.textContent).toContain("Ask Pulse");
        // 2026-05-27 — copy updated from "tab and ask a question" to the
        // uniformity-pass phrasing that explains the two Dashboard modes.
        expect(root?.textContent).toContain("Dashboard tab when connected");
    });

    test("emits loaded and ready events on mount", async () => {
        const adapter = new NativeBIAdapter();
        const events: NativeEvent[] = [];
        adapter.on("loaded", e => events.push(e));
        adapter.on("ready", e => events.push(e));
        await mountAdapter(adapter, containerEl, {});
        expect(events.map(e => e.type)).toEqual(["loaded", "ready"]);
    });

    test("destroy removes the native root and clears metadata", async () => {
        const adapter = new NativeBIAdapter();
        await mountAdapter(adapter, containerEl, {});
        expect(await adapter.getMetadata()).not.toBeNull();
        destroyAdapter(adapter);
        expect(containerEl.querySelector("[data-native-bi-adapter='true']")).toBeNull();
        expect(await adapter.getMetadata()).toBeNull();
    });
});

describe("NativeBIAdapter — command surface", () => {
    let containerEl: HTMLElement;

    beforeEach(() => {
        containerEl = document.createElement("div");
        document.body.appendChild(containerEl);
    });

    afterEach(() => {
        if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl);
    });

    test.each(NATIVE_FORBIDDEN_COMMAND_KINDS)("rejects forbidden command %s", async (kind) => {
        const adapter = new NativeBIAdapter();
        await mountAdapter(adapter, containerEl, {});
        await expect(
            sendAdapter(adapter, { kind } as unknown as BICommand),
        ).rejects.toThrow(new RegExp(BI_ERR.UNSUPPORTED_COMMAND));
    });

    test("emits an error event when rejecting forbidden commands", async () => {
        const adapter = new NativeBIAdapter();
        const events: NativeEvent[] = [];
        adapter.on("error", e => events.push(e));
        await mountAdapter(adapter, containerEl, {});
        await expect(
            sendAdapter(adapter, { kind: "executeQuery" } as unknown as BICommand),
        ).rejects.toThrow(/BI_UNSUPPORTED_COMMAND/);
        expect(events).toHaveLength(1);
        expect(events[0].payload).toMatchObject({
            code: BI_ERR.UNSUPPORTED_COMMAND,
            command: "executeQuery",
        });
    });

    test("emit() is reentrancy-safe: a handler that unsubscribes during emit does not crash, and a handler that subscribes during emit is not visited in the same emit", async () => {
        // Defensive guard: ECMAScript Set.forEach is well-defined for
        // deletion during iteration (deleted items are not revisited)
        // but UNDEFINED for additions. The adapter snapshots listeners
        // to an Array before emitting so both behaviors are stable.
        const adapter = new NativeBIAdapter();
        const seen: string[] = [];
        const newlySubscribedSeen: string[] = [];

        await mountAdapter(adapter, containerEl, {});

        let unsubMid: (() => void) | null = null;
        const unsubFirst = adapter.on("rendered", () => {
            seen.push("first");
            unsubMid?.();
            // Subscribe a NEW handler during emit. It must NOT fire in
            // this emit cycle, only on subsequent emits.
            adapter.on("rendered", () => { newlySubscribedSeen.push("late"); });
        });
        unsubMid = adapter.on("rendered", () => { seen.push("mid-but-unsubscribed-during-emit"); });
        adapter.on("rendered", () => { seen.push("last"); });

        await sendAdapter(adapter, { kind: "renderResult", result: { rows: [] } });
        // First handler fired. Mid-handler was unsubscribed before its
        // turn so it did NOT fire. Last handler fired. Newly subscribed
        // handler did NOT fire in this emit cycle.
        expect(seen).toEqual(["first", "last"]);
        expect(newlySubscribedSeen).toEqual([]);

        // Second emit: newly subscribed handler fires now.
        await sendAdapter(adapter, { kind: "renderResult", result: { rows: [] } });
        expect(newlySubscribedSeen).toEqual(["late"]);

        unsubFirst();
    });

    test("accepts renderer commands without executing queries or fetching data", async () => {
        const adapter = new NativeBIAdapter();
        const events: NativeEvent[] = [];
        adapter.on("rendered", e => events.push(e));
        await mountAdapter(adapter, containerEl, {});

        await expect(sendAdapter(adapter, { kind: "renderResult", result: { rows: [] } })).resolves.toBeUndefined();
        expect(containerEl.textContent).toContain("Pulse artifact received");
        await expect(sendAdapter(adapter, { kind: "renderSpec", spec: { mark: "bar" } })).resolves.toBeUndefined();
        expect(containerEl.textContent).toContain("Chart spec could not be rendered");
        expect(containerEl.textContent).toContain("Spec must define data.values");
        await expect(sendAdapter(adapter, { kind: "setTheme", theme: "slate-dark" } as NativeBICommand)).resolves.toBeUndefined();
        await expect(sendAdapter(adapter, { kind: "resize", width: 800, height: 420 } as NativeBICommand)).resolves.toBeUndefined();
        await expect(sendAdapter(adapter, { kind: "clear" })).resolves.toBeUndefined();
        expect(containerEl.textContent).toContain("Ask Pulse");
        expect(events.map(e => e.type)).toEqual(["rendered", "rendered"]);
    });
});

describe("NativeBIAdapter — G3 governance render gate", () => {
    let containerEl: HTMLElement;

    beforeEach(() => {
        containerEl = document.createElement("div");
        document.body.appendChild(containerEl);
    });

    afterEach(() => {
        if (containerEl.parentElement) containerEl.parentElement.removeChild(containerEl);
    });

    test("production mode blocks renderResult when governance is missing", async () => {
        const adapter = new NativeBIAdapter({ requireGovernanceAttestation: true });
        const events: NativeEvent[] = [];
        adapter.on("error", e => events.push(e));
        adapter.on("view-context", e => events.push(e));
        await mountAdapter(adapter, containerEl, {});

        await expect(sendAdapter(adapter, { kind: "renderResult", result: { rows: [] } }))
            .rejects.toThrow(/NATIVE_GOVERNANCE_REQUIRED/);

        expect(containerEl.textContent).toContain("Native render blocked");
        expect(containerEl.querySelector("[data-native-bi-adapter='true']")?.getAttribute("data-native-governance"))
            .toBe("blocked");
        expect(events.find(e => e.type === "error")?.payload).toMatchObject({
            code: "NATIVE_GOVERNANCE_REQUIRED",
            reason: "no-governance-attestation",
        });
        expect(events.find(e => e.type === "view-context")?.payload).toMatchObject({
            status: "result-blocked",
            governance: { state: "blocked", reason: "no-governance-attestation" },
        });
    });

    test("production mode blocks renderResult when governance is invalid", async () => {
        const adapter = new NativeBIAdapter({ requireGovernanceAttestation: true });
        await mountAdapter(adapter, containerEl, {});

        await expect(sendAdapter(adapter, {
            kind: "renderResult",
            result: { rows: [], governance: { enforced: false } },
        })).rejects.toThrow(/NATIVE_GOVERNANCE_REQUIRED/);
        expect(containerEl.textContent).toContain("Native render blocked");
    });

    test("production mode accepts renderResult when governance is attested", async () => {
        const adapter = new NativeBIAdapter({ requireGovernanceAttestation: true });
        const events: NativeEvent[] = [];
        adapter.on("rendered", e => events.push(e));
        await mountAdapter(adapter, containerEl, {});

        await expect(sendAdapter(adapter, { kind: "renderResult", result: VALID_GOVERNED_RESULT }))
            .resolves.toBeUndefined();

        expect(containerEl.textContent).toContain("Pulse artifact received");
        expect(containerEl.querySelector("[data-native-bi-adapter='true']")?.getAttribute("data-native-governance"))
            .toBe("enforced");
        expect(events[0].payload).toMatchObject({
            status: "result-accepted",
            governance: {
                state: "enforced",
                authority: "unity-catalog",
                requestId: "req-native-1",
            },
        });
    });

    test("dev mode allows missing governance only as an explicit preview state", async () => {
        const adapter = new NativeBIAdapter({ requireGovernanceAttestation: false });
        const events: NativeEvent[] = [];
        adapter.on("rendered", e => events.push(e));
        await mountAdapter(adapter, containerEl, {});

        await expect(sendAdapter(adapter, { kind: "renderResult", result: { rows: [] } }))
            .resolves.toBeUndefined();

        expect(containerEl.textContent).toContain("Ungoverned result preview");
        expect(containerEl.querySelector("[data-native-bi-adapter='true']")?.getAttribute("data-native-governance"))
            .toBe("preview");
        expect(events[0].payload).toMatchObject({
            status: "ungoverned-result-preview",
            governance: { state: "preview", reason: "no-governance-attestation" },
        });
    });
});

describe("NativeBIAdapter — import boundaries", () => {
    // ─── .ts adapter scan ─────────────────────────────────────────────
    // The bi-adapters/native/*.ts files are the BIAdapter contract
    // implementation. They must remain plain TypeScript: no React, no
    // fetch, no proxy clients, no vendor SDKs. This guarantees the
    // adapter is mountable from any host shell (React, Pulse PBI
    // sandbox, future desktop EXE) without dragging UI framework
    // dependencies into the static import graph.
    test("native adapter .ts files do not import React/data/query/vendor/authoring layers", () => {
        const adapterDir = join(process.cwd(), "../bi-adapters/native");
        const files = collectProductionFiles(adapterDir, ".ts");
        expect(files.length).toBeGreaterThan(0);

        const forbidden: Array<[string, RegExp]> = [
            ["fetch", /\bfetch\s*\(/],
            ["XMLHttpRequest", /\bXMLHttpRequest\b/],
            ["proxy imports", /from\s+["'][^"']*proxy[^"']*["']/],
            ["warehouse imports", /from\s+["'][^"']*warehouse[^"']*["']/],
            ["Power BI SDK", /from\s+["']powerbi-client["']/],
            ["Databricks SDK", /from\s+["']@databricks\/[^"']+["']/],
            ["Tableau SDK", /from\s+["'][^"']*tableau[^"']*["']/i],
            ["Qlik SDK", /from\s+["'][^"']*qlik[^"']*["']/i],
            ["Looker SDK", /from\s+["'][^"']*looker[^"']*["']/i],
            ["drag/drop libraries", /from\s+["'][^"']*(dnd|draggable|resizable)[^"']*["']/i],
            ["React runtime", /from\s+["']react(?:\/[^"']*)?["']/],
            ["react-dom runtime", /from\s+["']react-dom(?:\/[^"']*)?["']/],
            ["echarts runtime", /from\s+["']echarts(?:\/[^"']*)?["']/],
            ["authoring settings imports", /from\s+["'][^"']*settings\/groups[^"']*["']/],
        ];

        for (const file of files) {
            const text = readFileSync(file, "utf8");
            for (const [label, pattern] of forbidden) {
                expect(
                    pattern.test(text),
                    `${relative(adapterDir, file)} violates native adapter boundary (.ts): ${label}`,
                ).toBe(false);
            }
        }
    });

    // ─── .tsx canvas scan ─────────────────────────────────────────────
    // G4 extends the import boundary to cover the NativeCanvas .tsx
    // renderer. The canvas DOES import React/react-dom/echarts (those
    // are its runtime). It must NOT import fetch, the proxy, vendor
    // SDKs, drag/drop libs, or settings authoring modules — those would
    // drift the canvas from "renderer of attested AI results" into
    // "lightweight BI authoring tool", which Option B explicitly
    // forbids (see ADR-0009 + ADR-0010 non-goals).
    test("NativeCanvas.tsx does not import data/query/vendor/authoring layers", () => {
        const canvasPath = join(process.cwd(), "src/visualization/NativeCanvas.tsx");
        const text = readFileSync(canvasPath, "utf8");

        const tsxForbidden: Array<[string, RegExp]> = [
            ["fetch", /\bfetch\s*\(/],
            ["XMLHttpRequest", /\bXMLHttpRequest\b/],
            ["proxy imports", /from\s+["'][^"']*proxy[^"']*["']/],
            ["warehouse imports", /from\s+["'][^"']*warehouse[^"']*["']/],
            ["Power BI SDK", /from\s+["']powerbi-client["']/],
            ["Databricks SDK", /from\s+["']@databricks\/[^"']+["']/],
            ["Tableau SDK", /from\s+["'][^"']*tableau[^"']*["']/i],
            ["Qlik SDK", /from\s+["'][^"']*qlik[^"']*["']/i],
            ["Looker SDK", /from\s+["'][^"']*looker[^"']*["']/i],
            ["drag/drop libraries", /from\s+["'][^"']*(dnd|draggable|resizable)[^"']*["']/i],
            ["authoring settings imports", /from\s+["'][^"']*settings\/groups[^"']*["']/],
            // React, react-dom, and echarts are ALLOWED here — they are
            // the canvas runtime. Do NOT add them to this list.
        ];

        for (const [label, pattern] of tsxForbidden) {
            expect(
                pattern.test(text),
                `NativeCanvas.tsx violates canvas boundary: ${label}`,
            ).toBe(false);
        }
    });
});

/** Collect production .ts OR .tsx files in a directory tree, excluding
 *  __tests__ dirs and *.test.* files. The `ext` parameter selects
 *  which extension to walk for. */
function collectProductionFiles(dir: string, ext: ".ts" | ".tsx"): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === "__tests__") continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            out.push(...collectProductionFiles(full, ext));
        } else if (entry.endsWith(ext) && !entry.endsWith(`.test${ext}`)) {
            out.push(full);
        }
    }
    return out;
}

async function mountAdapter(adapter: NativeBIAdapter, containerEl: HTMLElement, config: BIEmbedConfig): Promise<void> {
    await act(async () => {
        await adapter.mount(containerEl, config);
    });
}

async function sendAdapter(adapter: NativeBIAdapter, command: NativeBICommand): Promise<void> {
    await act(async () => {
        await adapter.send(command);
    });
}

function destroyAdapter(adapter: NativeBIAdapter): void {
    act(() => {
        adapter.destroy();
    });
}
