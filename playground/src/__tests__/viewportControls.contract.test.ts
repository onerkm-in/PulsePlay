// playground/src/__tests__/viewportControls.contract.test.ts
//
// Contract plan for the App-shell viewport-control lane. App.tsx is owned by
// another agent in this cycle, so this file deliberately avoids importing it.
// Keep these selectors stable when wiring the chrome; then convert the cases
// below into mounted App integration tests by replacing the plan assertions
// with DOM assertions against a real render.

import { describe, expect, it } from "vitest";

type PanelId = "ai" | "bi";

interface ViewportControlContractCase {
    name: string;
    route: string;
    actions: string[];
    assertions: string[];
}

const shellSelector = '[data-testid="pp-viewport-shell"]';
const pinButtonSelector = 'button[aria-label="Pin layout"]';
const restoreSplitButtonSelector = 'button[aria-label="Restore split layout"]';

function panelChromeSelector(panel: PanelId): string {
    return `[data-testid="pp-panel-chrome-${panel}"]`;
}

function panelRegionSelector(panel: PanelId): string {
    return `[role="region"][aria-label="${panel === "ai" ? "AI" : "BI"} panel"]`;
}

function controlSelector(panel: PanelId, label: "Focus" | "Maximize" | "Minimize" | "Restore"): string {
    return `button[aria-label="${label} ${panel === "ai" ? "AI" : "BI"} panel"]`;
}

const contractCases: ViewportControlContractCase[] = [
    {
        name: "focuses the AI panel from split layout",
        route: "/?focus=ai",
        actions: [controlSelector("ai", "Focus")],
        assertions: [
            `${shellSelector} has data-viewport-focus="ai"`,
            `${panelChromeSelector("ai")} has data-panel-state="focused"`,
            `${panelRegionSelector("ai")} remains visible and receives focus`,
            `${panelChromeSelector("bi")} is visually de-emphasized but not unmounted`,
            `${controlSelector("ai", "Restore")} is visible`,
        ],
    },
    {
        name: "focuses the BI panel from split layout",
        route: "/?focus=bi",
        actions: [controlSelector("bi", "Focus")],
        assertions: [
            `${shellSelector} has data-viewport-focus="bi"`,
            `${panelChromeSelector("bi")} has data-panel-state="focused"`,
            `${panelRegionSelector("bi")} remains visible and receives focus`,
            `${panelChromeSelector("ai")} is visually de-emphasized but not unmounted`,
            `${controlSelector("bi", "Restore")} is visible`,
        ],
    },
    {
        name: "maximizes and restores AI without losing BI state",
        route: "/",
        actions: [controlSelector("ai", "Maximize"), controlSelector("ai", "Restore")],
        assertions: [
            `after maximize, ${shellSelector} has data-viewport-focus="ai"`,
            `after maximize, ${panelChromeSelector("ai")} has data-panel-state="maximized"`,
            `after maximize, ${panelChromeSelector("bi")} has data-panel-state="minimized"`,
            `after restore, ${shellSelector} has data-viewport-focus="split"`,
            `after restore, both panel chrome nodes are present exactly once`,
        ],
    },
    {
        name: "minimizes and restores each panel from chrome",
        route: "/",
        actions: [
            controlSelector("ai", "Minimize"),
            controlSelector("ai", "Restore"),
            controlSelector("bi", "Minimize"),
            controlSelector("bi", "Restore"),
        ],
        assertions: [
            `minimized panel chrome stays mounted with data-panel-state="minimized"`,
            `minimized panel body uses aria-hidden="true" or hidden`,
            `the opposite panel expands into the freed viewport space`,
            `restore returns both panels to data-panel-state="normal"`,
        ],
    },
    {
        name: "pins layout and restores split layout",
        route: "/",
        actions: [pinButtonSelector, restoreSplitButtonSelector],
        assertions: [
            `${shellSelector} has data-layout-pinned="true" after pin`,
            `${pinButtonSelector} has aria-pressed="true" after pin`,
            `restore clears panel focus/minimized/maximized state`,
            `restore keeps the selected AI position mode rather than overwriting user preference`,
        ],
    },
];

describe("App-shell viewport controls contract plan", () => {
    it("defines stable selectors for the App.tsx viewport-control lane", () => {
        expect(shellSelector).toBe('[data-testid="pp-viewport-shell"]');
        expect(panelChromeSelector("ai")).toBe('[data-testid="pp-panel-chrome-ai"]');
        expect(panelChromeSelector("bi")).toBe('[data-testid="pp-panel-chrome-bi"]');
        expect(controlSelector("ai", "Maximize")).toBe('button[aria-label="Maximize AI panel"]');
        expect(controlSelector("bi", "Minimize")).toBe('button[aria-label="Minimize BI panel"]');
    });

    it("covers AI focus, BI focus, maximize, minimize/restore, pin, and query-route behavior", () => {
        expect(contractCases.map(testCase => testCase.name)).toEqual([
            "focuses the AI panel from split layout",
            "focuses the BI panel from split layout",
            "maximizes and restores AI without losing BI state",
            "minimizes and restores each panel from chrome",
            "pins layout and restores split layout",
        ]);
        expect(contractCases.every(testCase => testCase.route.includes("focus=") || testCase.route === "/")).toBe(true);
        expect(contractCases.flatMap(testCase => testCase.assertions).join("\n")).toContain("data-viewport-focus");
        expect(contractCases.flatMap(testCase => testCase.assertions).join("\n")).toContain("data-panel-state");
        expect(contractCases.flatMap(testCase => testCase.assertions).join("\n")).toContain("data-layout-pinned");
    });
});

export {
    contractCases as viewportControlContractCases,
    controlSelector as viewportControlControlSelector,
    panelChromeSelector as viewportControlPanelChromeSelector,
    panelRegionSelector as viewportControlPanelRegionSelector,
    pinButtonSelector as viewportControlPinButtonSelector,
    restoreSplitButtonSelector as viewportControlRestoreSplitButtonSelector,
    shellSelector as viewportControlShellSelector,
};
