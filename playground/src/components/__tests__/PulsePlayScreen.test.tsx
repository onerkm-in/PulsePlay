// playground/src/components/__tests__/PulsePlayScreen.test.tsx
//
// Step 2a/2b tests — locks the slot composition contract for the
// unified-screen owner. Future Steps (3, 7, 8) absorb slot content
// into PulsePlayScreen itself; these tests grow with each step.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PulsePlayScreen } from "../PulsePlayScreen";

afterEach(() => cleanup());

describe("PulsePlayScreen (Step 2b — render-prop seam)", () => {
    it("renders with a stable data-testid for harness selection", () => {
        render(<PulsePlayScreen mainLayoutSlot={<div>main</div>} />);
        expect(screen.getByTestId("pp-screen")).not.toBeNull();
    });

    it("renders the main layout slot (required) verbatim", () => {
        render(
            <PulsePlayScreen
                mainLayoutSlot={<span data-testid="main-content">main here</span>}
            />,
        );
        const main = screen.getByTestId("main-content");
        expect(main.textContent).toBe("main here");
        expect(screen.getByTestId("pp-screen-main-slot")).not.toBeNull();
    });

    it("renders the floating pane slot when provided", () => {
        render(
            <PulsePlayScreen
                floatingPaneSlot={<div data-testid="floating-content">floating</div>}
                mainLayoutSlot={<div>main</div>}
            />,
        );
        expect(screen.getByTestId("floating-content").textContent).toBe("floating");
        expect(screen.getByTestId("pp-screen-floating-slot")).not.toBeNull();
    });

    it("omits the floating slot wrapper when floatingPaneSlot is null", () => {
        render(
            <PulsePlayScreen
                floatingPaneSlot={null}
                mainLayoutSlot={<div>main</div>}
            />,
        );
        expect(screen.queryByTestId("pp-screen-floating-slot")).toBeNull();
    });

    it("renders the minimized dock slot when provided", () => {
        render(
            <PulsePlayScreen
                mainLayoutSlot={<div>main</div>}
                minimizedDockSlot={<div data-testid="dock-content">dock</div>}
            />,
        );
        expect(screen.getByTestId("dock-content").textContent).toBe("dock");
        expect(screen.getByTestId("pp-screen-dock-slot")).not.toBeNull();
    });

    it("omits the dock slot wrapper when minimizedDockSlot is null", () => {
        render(
            <PulsePlayScreen
                mainLayoutSlot={<div>main</div>}
                minimizedDockSlot={null}
            />,
        );
        expect(screen.queryByTestId("pp-screen-dock-slot")).toBeNull();
    });

    it("uses display: contents on the outer wrapper (CSS-neutral)", () => {
        render(<PulsePlayScreen mainLayoutSlot={<div />} />);
        const wrapper = screen.getByTestId("pp-screen");
        expect(wrapper.style.display).toBe("contents");
    });

    it("uses display: contents on every slot wrapper (CSS-neutral)", () => {
        render(
            <PulsePlayScreen
                floatingPaneSlot={<div />}
                mainLayoutSlot={<div />}
                minimizedDockSlot={<div />}
            />,
        );
        expect(screen.getByTestId("pp-screen-floating-slot").style.display).toBe("contents");
        expect(screen.getByTestId("pp-screen-main-slot").style.display).toBe("contents");
        expect(screen.getByTestId("pp-screen-dock-slot").style.display).toBe("contents");
    });

    it("renders slots in canonical order: floating → main → dock", () => {
        render(
            <PulsePlayScreen
                floatingPaneSlot={<div data-testid="float-content">F</div>}
                mainLayoutSlot={<div data-testid="main-content">M</div>}
                minimizedDockSlot={<div data-testid="dock-content">D</div>}
            />,
        );
        // Walk the wrapper's children and assert positional ordering.
        const wrapper = screen.getByTestId("pp-screen");
        const slotOrder = Array.from(wrapper.children).map(c => c.getAttribute("data-testid"));
        expect(slotOrder).toEqual([
            "pp-screen-floating-slot",
            "pp-screen-main-slot",
            "pp-screen-dock-slot",
        ]);
    });

    it("accepts an optional className override", () => {
        render(<PulsePlayScreen className="custom-cls" mainLayoutSlot={<div />} />);
        expect(screen.getByTestId("pp-screen").className).toBe("custom-cls");
    });
});
