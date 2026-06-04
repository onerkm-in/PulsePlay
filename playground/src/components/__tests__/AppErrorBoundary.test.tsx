import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AppErrorBoundary } from "../AppErrorBoundary";

function Boom({ explode }: { explode: boolean }) {
    if (explode) throw new Error("kaboom-detail-123");
    return <div>safe child</div>;
}

describe("AppErrorBoundary", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("renders children when nothing throws", () => {
        render(
            <AppErrorBoundary>
                <div>healthy content</div>
            </AppErrorBoundary>,
        );
        expect(screen.getByText("healthy content")).toBeTruthy();
    });

    it("renders an actionable recovery screen (with the real error message) when a child throws", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        render(
            <AppErrorBoundary>
                <Boom explode={true} />
            </AppErrorBoundary>,
        );
        // role=alert recovery surface, friendly heading, AND the real cause
        // (surfaced, not swallowed — same philosophy as the insights fix).
        expect(screen.getByRole("alert")).toBeTruthy();
        expect(screen.getByText("Something went wrong")).toBeTruthy();
        expect(screen.getByText(/kaboom-detail-123/)).toBeTruthy();
        expect(screen.getByRole("button", { name: /reload app/i })).toBeTruthy();
        expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    });

    it("logs the uncaught error to console.error (visible, not silent)", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        render(
            <AppErrorBoundary>
                <Boom explode={true} />
            </AppErrorBoundary>,
        );
        const sawIt = spy.mock.calls.some(call =>
            call.some(arg =>
                String(arg).includes("Uncaught render error") ||
                (arg instanceof Error && arg.message === "kaboom-detail-123"),
            ),
        );
        expect(sawIt).toBe(true);
    });

    it("'Try again' clears the error and re-renders the children", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        // A child that throws on first render but not after a flag flips.
        let shouldThrow = true;
        function Flaky() {
            if (shouldThrow) throw new Error("transient");
            return <div>recovered content</div>;
        }
        render(
            <AppErrorBoundary>
                <Flaky />
            </AppErrorBoundary>,
        );
        expect(screen.getByText("Something went wrong")).toBeTruthy();
        shouldThrow = false;
        fireEvent.click(screen.getByRole("button", { name: /try again/i }));
        expect(screen.getByText("recovered content")).toBeTruthy();
    });
});
