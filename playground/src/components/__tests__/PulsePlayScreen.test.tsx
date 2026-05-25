// playground/src/components/__tests__/PulsePlayScreen.test.tsx
//
// Step 2a beachhead test — locks the contract that PulsePlayScreen
// renders as a CSS-neutral wrapper (display: contents). Future Step 2b
// expands these tests to cover the absorbed pane-mount logic; for now
// this file proves the wrapper exists, mounts, and stays invisible
// in the layout.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PulsePlayScreen } from "../PulsePlayScreen";

afterEach(() => cleanup());

describe("PulsePlayScreen (Step 2a beachhead)", () => {
    it("renders with a stable data-testid for harness selection", () => {
        render(<PulsePlayScreen><div>child</div></PulsePlayScreen>);
        expect(screen.getByTestId("pp-screen")).not.toBeNull();
    });

    it("renders its children verbatim", () => {
        render(
            <PulsePlayScreen>
                <span data-testid="pp-test-child">hello</span>
            </PulsePlayScreen>,
        );
        const child = screen.getByTestId("pp-test-child");
        expect(child.textContent).toBe("hello");
    });

    it("uses display: contents so it produces no box (CSS-neutral wrapper)", () => {
        render(<PulsePlayScreen><div /></PulsePlayScreen>);
        const wrapper = screen.getByTestId("pp-screen");
        // The wrapper exists in the DOM tree but should be invisible to
        // CSS layout. display: contents is the contract for Step 2a.
        expect(wrapper.style.display).toBe("contents");
    });

    it("accepts an optional className override", () => {
        render(<PulsePlayScreen className="custom-cls"><div /></PulsePlayScreen>);
        const wrapper = screen.getByTestId("pp-screen");
        expect(wrapper.className).toBe("custom-cls");
    });
});
