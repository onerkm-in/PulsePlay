// playground/src/components/__tests__/SurfaceContextStrip.test.tsx
//
// Locks the strip's chip wiring: surface label, primary mode pill, and
// the 4 secondary chips (Assistant / Source / Scope / Trust) all render
// from the supplied SurfaceContextValue.

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SurfaceContextStrip } from "../SurfaceContextStrip";

afterEach(cleanup);

describe("SurfaceContextStrip", () => {
    const sampleContext = {
        assistant: "genie-default",
        mode: "Conversation",
        source: "3 metrics / 12 dimensions",
        scope: "All visible data",
        trust: "Grounded to BI context",
    };

    it("renders all 4 secondary chips with values from SurfaceContextValue", () => {
        render(<SurfaceContextStrip surface="Ask Pulse" context={sampleContext} />);
        expect(screen.getByTestId("pp-surface-context-assistant").textContent).toBe("genie-default");
        expect(screen.getByTestId("pp-surface-context-source").textContent).toBe("3 metrics / 12 dimensions");
        expect(screen.getByTestId("pp-surface-context-scope").textContent).toBe("All visible data");
        expect(screen.getByTestId("pp-surface-context-trust").textContent).toBe("Grounded to BI context");
    });

    it("renders the surface label + mode in the primary pill", () => {
        render(<SurfaceContextStrip surface="AI Insights" context={{ ...sampleContext, mode: "Executive briefing" }} />);
        const strip = screen.getByTestId("pp-surface-context");
        expect(strip.textContent).toContain("AI Insights");
        expect(strip.textContent).toContain("Executive briefing");
    });

    it("annotates aria-label with the surface name for screen-reader context", () => {
        render(<SurfaceContextStrip surface="Dashboard" context={sampleContext} />);
        const strip = screen.getByTestId("pp-surface-context");
        expect(strip.getAttribute("aria-label")).toBe("Dashboard context");
    });
});
