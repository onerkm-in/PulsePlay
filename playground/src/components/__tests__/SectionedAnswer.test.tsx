// playground/src/components/__tests__/SectionedAnswer.test.tsx
//
// Phase D.3 — UI lifecycle pins for the staged-rendering primitive.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SectionedAnswer, type SectionState } from "../SectionedAnswer";

afterEach(() => cleanup());

const SECTIONS = [
    { id: "HEADLINE" },
    { id: "KPI" },
    { id: "TRENDS" },
    { id: "RECOMMENDED_ACTIONS", title: "Recommended Actions" },
];

describe("SectionedAnswer", () => {
    it("renders one item per section in the supplied order", () => {
        render(<SectionedAnswer sections={SECTIONS} sectionStates={{}} />);
        const items = screen.getAllByTestId(/^pp-sectioned-item-/);
        expect(items.map((n) => n.getAttribute("data-testid"))).toEqual([
            "pp-sectioned-item-HEADLINE",
            "pp-sectioned-item-KPI",
            "pp-sectioned-item-TRENDS",
            "pp-sectioned-item-RECOMMENDED_ACTIONS",
        ]);
    });

    it("missing state defaults to 'pending' with skeleton + aria-busy=true", () => {
        render(<SectionedAnswer sections={[{ id: "HEADLINE" }]} sectionStates={{}} />);
        const item = screen.getByTestId("pp-sectioned-item-HEADLINE");
        expect(item.getAttribute("data-status")).toBe("pending");
        expect(item.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByText("Waiting…")).toBeTruthy();
    });

    it("'streaming' shows 'Generating…' and remains aria-busy", () => {
        const states: Record<string, SectionState> = {
            HEADLINE: { status: "streaming" },
        };
        render(<SectionedAnswer sections={[{ id: "HEADLINE" }]} sectionStates={states} />);
        const item = screen.getByTestId("pp-sectioned-item-HEADLINE");
        expect(item.getAttribute("data-status")).toBe("streaming");
        expect(item.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByText("Generating…")).toBeTruthy();
    });

    it("'completed' renders string body, drops aria-busy, surfaces meta when provided", () => {
        const states: Record<string, SectionState> = {
            HEADLINE: { status: "completed", body: "OTIF fell 3.1pp WoW", durationMs: 842, usage: { output_tokens: 47 } },
        };
        render(<SectionedAnswer sections={[{ id: "HEADLINE" }]} sectionStates={states} />);
        const item = screen.getByTestId("pp-sectioned-item-HEADLINE");
        expect(item.getAttribute("data-status")).toBe("completed");
        expect(item.getAttribute("aria-busy")).toBe("false");
        expect(screen.getByText("OTIF fell 3.1pp WoW")).toBeTruthy();
        expect(screen.getByText("842 ms")).toBeTruthy();
        expect(screen.getByText("· 47 tokens out")).toBeTruthy();
    });

    it("'completed' object body falls back to JSON pre-block by default", () => {
        const states: Record<string, SectionState> = {
            KPI: { status: "completed", body: { value: 0.91, unit: "%" } },
        };
        render(<SectionedAnswer sections={[{ id: "KPI" }]} sectionStates={states} />);
        const body = screen.getByTestId("pp-sectioned-body-KPI");
        expect(body.textContent).toContain("\"value\": 0.91");
        expect(body.textContent).toContain("\"unit\": \"%\"");
    });

    it("renderBody override is respected per section", () => {
        const states: Record<string, SectionState> = {
            KPI: { status: "completed", body: { value: 42 } },
        };
        render(
            <SectionedAnswer
                sections={[{ id: "KPI" }]}
                sectionStates={states}
                renderBody={(id, body) => <span data-testid={`custom-${id}`}>v={(body as { value: number }).value}</span>}
            />,
        );
        expect(screen.getByTestId("custom-KPI").textContent).toBe("v=42");
    });

    it("'failed' renders error message + retry button when onRegenerate supplied", () => {
        const onRegen = vi.fn();
        const states: Record<string, SectionState> = {
            TRENDS: { status: "failed", error: { message: "rate limited" } },
        };
        render(
            <SectionedAnswer
                sections={[{ id: "TRENDS" }]}
                sectionStates={states}
                onRegenerate={onRegen}
            />,
        );
        expect(screen.getByRole("alert").textContent).toContain("rate limited");
        const retry = screen.getByTestId("pp-sectioned-regen-TRENDS");
        fireEvent.click(retry);
        expect(onRegen).toHaveBeenCalledWith("TRENDS");
    });

    it("Regenerate button appears on completed sections only when onRegenerate provided", () => {
        const states: Record<string, SectionState> = {
            HEADLINE: { status: "completed", body: "ok" },
        };
        const { rerender } = render(<SectionedAnswer sections={[{ id: "HEADLINE" }]} sectionStates={states} />);
        expect(screen.queryByTestId("pp-sectioned-regen-HEADLINE")).toBeNull();
        rerender(
            <SectionedAnswer
                sections={[{ id: "HEADLINE" }]}
                sectionStates={states}
                onRegenerate={() => {}}
            />,
        );
        expect(screen.getByTestId("pp-sectioned-regen-HEADLINE")).toBeTruthy();
    });

    it("Regenerate button is disabled while isStreaming=true (prevents overlap)", () => {
        const onRegen = vi.fn();
        const states: Record<string, SectionState> = {
            HEADLINE: { status: "completed", body: "ok" },
        };
        render(
            <SectionedAnswer
                sections={[{ id: "HEADLINE" }]}
                sectionStates={states}
                onRegenerate={onRegen}
                isStreaming
            />,
        );
        const btn = screen.getByTestId("pp-sectioned-regen-HEADLINE") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        fireEvent.click(btn);
        expect(onRegen).not.toHaveBeenCalled();
    });

    it("clicking regenerate on a completed section passes the sectionId", () => {
        const onRegen = vi.fn();
        const states: Record<string, SectionState> = {
            HEADLINE: { status: "completed", body: "ok" },
            KPI: { status: "completed", body: "kpi-ok" },
        };
        render(
            <SectionedAnswer
                sections={[{ id: "HEADLINE" }, { id: "KPI" }]}
                sectionStates={states}
                onRegenerate={onRegen}
            />,
        );
        fireEvent.click(screen.getByTestId("pp-sectioned-regen-KPI"));
        expect(onRegen).toHaveBeenCalledWith("KPI");
        expect(onRegen).toHaveBeenCalledTimes(1);
    });

    it("Section title falls back to humanised id when no explicit title", () => {
        render(<SectionedAnswer sections={[{ id: "RECOMMENDED_ACTIONS" }]} sectionStates={{}} />);
        expect(screen.getByText("Recommended Actions")).toBeTruthy();
    });

    it("Explicit section title overrides the humanised id", () => {
        render(<SectionedAnswer sections={[{ id: "RA", title: "Top Picks" }]} sectionStates={{}} />);
        expect(screen.getByText("Top Picks")).toBeTruthy();
    });
});
