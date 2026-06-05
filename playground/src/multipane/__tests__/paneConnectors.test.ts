// playground/src/multipane/__tests__/paneConnectors.test.ts
//
// Part C P1 — the projection that keeps the single-active-per-axis globals
// backward-compatible. The load-bearing assertions:
//   - flag OFF  → projection EQUALS today's globals (byte-for-byte behavior)
//   - flag ON   → the active pane (pane[0]) binding wins, legacy is the fallback
//   - multiple panes each hold INDEPENDENT connector state (the whole point)

import { describe, it, expect } from "vitest";
import type { PaneInstance } from "../../settings/settingsStore";
import type { BIEmbedConfig } from "../../biPanel/BIAdapter";
import {
    projectActivePaneConnector,
    resolvePaneConnector,
    setPaneConnector,
    clearPaneConnector,
    type PaneConnectorState,
    type ActiveConnectorProjection,
} from "../paneConnectors";

const LEGACY: ActiveConnectorProjection = {
    activeVendor: "powerbi",
    activeConnector: "powerbi-dwd",
    embedConfig: { url: "https://app.powerbi.com/legacy" } as BIEmbedConfig,
};

function pane(paneId: string, extra: Partial<PaneInstance> = {}): PaneInstance {
    return { paneId, pageId: "p", placement: "inline", createdAt: 0, ...extra };
}

describe("projectActivePaneConnector — flag OFF is byte-for-byte legacy", () => {
    it("returns the legacy globals VERBATIM (same reference) when the flag is off", () => {
        const out = projectActivePaneConnector({
            panes: [pane("pane-0", { vendor: "native", aiProfile: "foundation" })],
            connectorStates: new Map(),
            flags: { multiConnectorPanes: false },
            legacy: LEGACY,
        });
        // Identity: nothing is recomputed — the existing app sees the exact globals.
        expect(out).toBe(LEGACY);
    });

    it("ignores per-pane bindings entirely when off", () => {
        const states = new Map<string, PaneConnectorState>([
            ["pane-0", { vendor: "tableau", aiProfile: "bedrock" }],
        ]);
        const out = projectActivePaneConnector({
            panes: [pane("pane-0")],
            connectorStates: states,
            flags: { multiConnectorPanes: false },
            legacy: LEGACY,
        });
        expect(out).toEqual(LEGACY);
    });
});

describe("projectActivePaneConnector — flag ON projects pane[0]", () => {
    it("falls back to legacy per field when pane[0] is unbound", () => {
        const out = projectActivePaneConnector({
            panes: [pane("pane-0")],
            connectorStates: new Map(),
            flags: { multiConnectorPanes: true },
            legacy: LEGACY,
        });
        expect(out).toEqual(LEGACY);
    });

    it("uses the Map override for pane[0] (override beats legacy)", () => {
        const states = new Map<string, PaneConnectorState>([
            ["pane-0", { vendor: "native", aiProfile: "foundation" }],
        ]);
        const out = projectActivePaneConnector({
            panes: [pane("pane-0"), pane("pane-1")],
            connectorStates: states,
            flags: { multiConnectorPanes: true },
            legacy: LEGACY,
        });
        expect(out.activeVendor).toBe("native");
        expect(out.activeConnector).toBe("foundation");
        // embedConfig unset on the override → legacy fallback.
        expect(out.embedConfig).toBe(LEGACY.embedConfig);
    });

    it("uses PaneInstance fields when there is no Map override", () => {
        const out = projectActivePaneConnector({
            panes: [pane("pane-0", { vendor: "qlik", aiProfile: "supervisor" })],
            connectorStates: new Map(),
            flags: { multiConnectorPanes: true },
            legacy: LEGACY,
        });
        expect(out.activeVendor).toBe("qlik");
        expect(out.activeConnector).toBe("supervisor");
    });

    it("returns legacy when there are no panes at all", () => {
        const out = projectActivePaneConnector({
            panes: [],
            connectorStates: new Map(),
            flags: { multiConnectorPanes: true },
            legacy: LEGACY,
        });
        expect(out).toBe(LEGACY);
    });
});

describe("resolvePaneConnector — panes hold INDEPENDENT state (the point)", () => {
    it("two panes bound to two different connectors resolve independently", () => {
        const states = new Map<string, PaneConnectorState>([
            ["pane-fm", { vendor: "native", aiProfile: "foundation" }],
            ["pane-pbi", { vendor: "powerbi", aiProfile: "powerbi-dwd", embedConfig: { url: "https://app.powerbi.com/report" } as BIEmbedConfig }],
        ]);
        const fm = resolvePaneConnector(pane("pane-fm"), states, LEGACY);
        const pbi = resolvePaneConnector(pane("pane-pbi"), states, LEGACY);

        expect(fm.activeConnector).toBe("foundation");
        expect(fm.activeVendor).toBe("native");
        expect(pbi.activeConnector).toBe("powerbi-dwd");
        expect(pbi.activeVendor).toBe("powerbi");
        // They do NOT share state — resolving one does not change the other.
        expect(fm.activeConnector).not.toBe(pbi.activeConnector);
        expect(pbi.embedConfig).not.toBe(fm.embedConfig);
    });
});

describe("setPaneConnector / clearPaneConnector — immutable Map ops", () => {
    it("setPaneConnector returns a NEW map and merges the patch", () => {
        const a = new Map<string, PaneConnectorState>();
        const b = setPaneConnector(a, "pane-0", { vendor: "native" });
        const c = setPaneConnector(b, "pane-0", { aiProfile: "foundation" });
        expect(b).not.toBe(a);              // immutability
        expect(a.size).toBe(0);             // original untouched
        expect(c.get("pane-0")).toEqual({ vendor: "native", aiProfile: "foundation" }); // merged
    });

    it("clearPaneConnector removes one pane without mutating the source", () => {
        const a = setPaneConnector(new Map(), "pane-0", { vendor: "native" });
        const b = clearPaneConnector(a, "pane-0");
        expect(b).not.toBe(a);
        expect(a.has("pane-0")).toBe(true);
        expect(b.has("pane-0")).toBe(false);
    });
});
