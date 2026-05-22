// playground/src/components/__tests__/FramePicker.test.tsx
//
// Phase A — FramePicker rendering tests. Follows the project convention of
// driving React with react-dom/client + act() rather than @testing-library
// (not a project dep — see playground/src/components/__tests__/AISidebar.test.tsx).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type React from "react";
import { FramePicker } from "../FramePicker";
import type { DiscoverySnapshot } from "../../lib/discoveryClient";

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, root };
}

function rerender(state: MountState, ui: React.ReactNode) {
    act(() => { state.root.render(ui); });
}

function unmount(state: MountState) {
    act(() => { state.root.unmount(); });
    state.container.remove();
}

function snapshot(overrides: Partial<DiscoverySnapshot> = {}): DiscoverySnapshot {
    return {
        snapshotVersion: 1,
        fetchedAt: "2026-05-13T10:00:00Z",
        expiresAt: "2026-05-13T10:15:00Z",
        cacheKey: "k",
        sources: { probe: null, biMetadata: null, packKpis: [] },
        fused: {
            availableKpis: [],
            reachableFrames: [
                { frameId: "swot-analysis", label: "SWOT", description: "Quantified SWOT.", domain: "Strategic Analysis", rationale: "qualitative", params: {} },
                { frameId: "bcg-matrix", label: "BCG growth-share", description: "Stars/Cows/Marks/Dogs.", domain: "Strategic Analysis", rationale: "currency + time + dim", params: {} },
                { frameId: "cpg-fmcg-supply-chain", label: "CPG · Supply chain", description: "OTIF/fill rate.", domain: "CPG / Supply Chain", rationale: "percent KPI", params: {} },
            ],
            unreachableFrames: [
                { frameId: "rfm-segmentation", label: "RFM segmentation", description: "Recency/Freq/Monetary.", domain: "Customer Success", blockedBy: "Needs at least 1 customer dimension; found 0." },
            ],
        },
        warnings: [],
        ...overrides,
    };
}

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { document.body.innerHTML = ""; });

describe("FramePicker", () => {
    it("renders loading placeholder when loading=true", () => {
        const state = mount(<FramePicker snapshot={null} loading />);
        const select = state.container.querySelector("select") as HTMLSelectElement;
        expect(select).toBeTruthy();
        expect(select.disabled).toBe(true);
        expect(select.textContent || "").toMatch(/Loading/i);
        unmount(state);
    });

    it("renders free-text fallback when snapshot is null", () => {
        const state = mount(<FramePicker snapshot={null} />);
        const select = state.container.querySelector("select") as HTMLSelectElement;
        expect(select).toBeTruthy();
        expect(select.disabled).toBe(false);
        expect(select.querySelectorAll("option").length).toBe(1);
        expect(state.container.textContent || "").toMatch(/Free text/i);
        unmount(state);
    });

    it("renders reachable + unreachable optgroups with the right counts", () => {
        const state = mount(<FramePicker snapshot={snapshot()} />);
        const select = state.container.querySelector("select") as HTMLSelectElement;
        const options = select.querySelectorAll("option");
        // Free text + 3 reachable + 1 unreachable = 5 options.
        expect(options.length).toBe(5);

        const optgroups = select.querySelectorAll("optgroup");
        const labels = [...optgroups].map(g => (g as HTMLOptGroupElement).label);
        expect(labels.some(l => /^✓ Strategic Analysis$/.test(l))).toBe(true);
        expect(labels.some(l => /^✓ CPG \/ Supply Chain$/.test(l))).toBe(true);
        expect(labels.some(l => /^✗ Customer Success \(unreachable\)$/.test(l))).toBe(true);
        unmount(state);
    });

    it("disables unreachable options with data-blocked-by attribute", () => {
        const state = mount(<FramePicker snapshot={snapshot()} />);
        const rfm = [...state.container.querySelectorAll("option")].find(
            o => (o as HTMLOptionElement).value === "rfm-segmentation",
        ) as HTMLOptionElement | undefined;
        expect(rfm).toBeTruthy();
        expect(rfm!.disabled).toBe(true);
        expect(rfm!.getAttribute("data-blocked-by")).toMatch(/customer dimension/);
        unmount(state);
    });

    it("calls onChange with frameId when a reachable frame is selected", () => {
        const onChange = vi.fn();
        const state = mount(<FramePicker snapshot={snapshot()} onChange={onChange} />);
        const select = state.container.querySelector("select") as HTMLSelectElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, "value",
        )?.set;
        act(() => {
            nativeSetter?.call(select, "bcg-matrix");
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(onChange).toHaveBeenCalledWith("bcg-matrix");
        unmount(state);
    });

    it("calls onChange with null when Free text is selected", () => {
        const onChange = vi.fn();
        const state = mount(<FramePicker snapshot={snapshot()} value="bcg-matrix" onChange={onChange} />);
        const select = state.container.querySelector("select") as HTMLSelectElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, "value",
        )?.set;
        act(() => {
            nativeSetter?.call(select, "__free-text");
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(onChange).toHaveBeenCalledWith(null);
        unmount(state);
    });

    it("controlled value reflects current selection across re-renders", () => {
        const state = mount(<FramePicker snapshot={snapshot()} value="bcg-matrix" />);
        const select = state.container.querySelector("select") as HTMLSelectElement;
        expect(select.value).toBe("bcg-matrix");
        rerender(state, <FramePicker snapshot={snapshot()} value="swot-analysis" />);
        expect(select.value).toBe("swot-analysis");
        unmount(state);
    });

    it("shows empty-state hint when no reachable frames", () => {
        const empty = snapshot({
            fused: {
                availableKpis: [],
                reachableFrames: [],
                unreachableFrames: [
                    { frameId: "bcg-matrix", label: "BCG", description: "", domain: "Strategic", blockedBy: "Needs currency measure." },
                ],
            },
        });
        const state = mount(<FramePicker snapshot={empty} />);
        const hint = state.container.querySelector("[data-testid='pp-frame-picker-empty-reason']");
        expect(hint).toBeTruthy();
        expect(hint!.textContent || "").toMatch(/No analysis frames are reachable/i);
        unmount(state);
    });

    it("does NOT show empty-state hint when reachableFrames is non-empty", () => {
        const state = mount(<FramePicker snapshot={snapshot()} />);
        expect(state.container.querySelector("[data-testid='pp-frame-picker-empty-reason']")).toBeNull();
        unmount(state);
    });

    it("option titles include description + rationale for reachable frames (default mode)", () => {
        const state = mount(<FramePicker snapshot={snapshot()} />);
        const bcg = [...state.container.querySelectorAll("option")].find(
            o => (o as HTMLOptionElement).value === "bcg-matrix",
        ) as HTMLOptionElement;
        expect(bcg.getAttribute("title")).toMatch(/Stars\/Cows\/Marks\/Dogs/);
        expect(bcg.getAttribute("title")).toMatch(/Reachable: currency \+ time \+ dim/);
        unmount(state);
    });

    it("compact mode renders title with just the label", () => {
        const state = mount(<FramePicker snapshot={snapshot()} compact />);
        const bcg = [...state.container.querySelectorAll("option")].find(
            o => (o as HTMLOptionElement).value === "bcg-matrix",
        ) as HTMLOptionElement;
        expect(bcg.getAttribute("title")).toBe("BCG growth-share");
        unmount(state);
    });
});
