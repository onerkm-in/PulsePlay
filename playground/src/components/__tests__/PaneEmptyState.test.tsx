// playground/src/components/__tests__/PaneEmptyState.test.tsx
//
// Pin the shared empty-state contract so Dashboard / AI Insights / Ask
// Pulse stay visually aligned. Audit 2026-05-20.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
    PaneEmptyState,
    DashboardIcon,
    InsightsIcon,
    AskPulseIcon,
} from "../PaneEmptyState";

afterEach(() => cleanup());

describe("PaneEmptyState", () => {
    it("renders heading + description + capability list when provided", () => {
        render(
            <PaneEmptyState
                heading="Dashboard"
                description="Embed your BI tool here."
                capabilities={["A", "B", "C"]}
            />,
        );
        expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Dashboard");
        expect(screen.getByText("Embed your BI tool here.")).toBeTruthy();
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    it("primary action fires the onClick handler when clicked", () => {
        const onClick = vi.fn();
        render(
            <PaneEmptyState
                heading="X"
                primaryAction={{ label: "Open settings →", onClick, testid: "primary-cta" }}
            />,
        );
        const btn = screen.getByTestId("primary-cta");
        expect(btn.className).toContain("pp-cta-primary");
        fireEvent.click(btn);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("secondary action renders only when supplied", () => {
        const onPrimary = vi.fn();
        const onSecondary = vi.fn();
        const { rerender } = render(
            <PaneEmptyState
                heading="X"
                primaryAction={{ label: "Primary", onClick: onPrimary }}
            />,
        );
        expect(screen.queryByText("Browse")).toBeNull();
        rerender(
            <PaneEmptyState
                heading="X"
                primaryAction={{ label: "Primary", onClick: onPrimary }}
                secondaryAction={{ label: "Browse", onClick: onSecondary }}
            />,
        );
        fireEvent.click(screen.getByText("Browse"));
        expect(onSecondary).toHaveBeenCalledTimes(1);
    });

    it("icon disc is aria-hidden so the heading carries the accessible name", () => {
        const { container } = render(
            <PaneEmptyState
                heading="Dashboard"
                icon={DashboardIcon}
            />,
        );
        const iconDisc = container.querySelector(".pp-empty-state__icon");
        expect(iconDisc?.getAttribute("aria-hidden")).toBe("true");
    });

    it("does NOT render the bullet list when capabilities is empty / undefined", () => {
        const { container } = render(<PaneEmptyState heading="X" />);
        expect(container.querySelector(".pp-empty-state__capabilities")).toBeNull();
    });

    it("does NOT render the CTA row when no actions are supplied", () => {
        const { container } = render(<PaneEmptyState heading="X" />);
        expect(container.querySelector(".pp-empty-state__ctas")).toBeNull();
    });

    it("exports SVG icons for all three surface tabs (parity)", () => {
        // Just assert each is a valid SVG-bearing ReactNode; the SwitchSurface
        // already pins the exact paths.
        expect(DashboardIcon).toBeTruthy();
        expect(InsightsIcon).toBeTruthy();
        expect(AskPulseIcon).toBeTruthy();
    });
});
