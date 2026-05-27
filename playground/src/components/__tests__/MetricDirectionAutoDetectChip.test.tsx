// playground/src/components/__tests__/MetricDirectionAutoDetectChip.test.tsx

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MetricDirectionAutoDetectChip } from "../MetricDirectionAutoDetectChip";

afterEach(cleanup);

describe("MetricDirectionAutoDetectChip", () => {
    it("renders nothing when no measures are bound", () => {
        const onApply = vi.fn();
        const { container } = render(
            <MetricDirectionAutoDetectChip measureNames={[]} onApply={onApply} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders nothing when measureNames is null", () => {
        const onApply = vi.fn();
        const { container } = render(
            <MetricDirectionAutoDetectChip measureNames={null} onApply={onApply} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders nothing when no metric can be confidently classified", () => {
        const onApply = vi.fn();
        const { container } = render(
            <MetricDirectionAutoDetectChip
                measureNames={["Headcount", "Department", "Region"]}
                onApply={onApply}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("renders the chip when at least one metric classifies", () => {
        const onApply = vi.fn();
        render(
            <MetricDirectionAutoDetectChip
                measureNames={["Revenue", "Returns"]}
                onApply={onApply}
            />,
        );
        expect(screen.getByTestId("pp-metric-autodetect-chip")).toBeTruthy();
        expect(screen.getByText(/Auto-detected from dataset \(2 metrics\)/)).toBeTruthy();
    });

    it("fires onApply with the generated rules string", () => {
        const onApply = vi.fn();
        render(
            <MetricDirectionAutoDetectChip
                measureNames={["Revenue", "Returns"]}
                onApply={onApply}
            />,
        );
        fireEvent.click(screen.getByTestId("pp-metric-autodetect-chip-apply"));
        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onApply.mock.calls[0][0]).toBe(
            "Revenue: higher is better\nReturns: lower is better",
        );
    });

    it("reports skipped count honestly when some metrics are CONTEXT-classified", () => {
        const onApply = vi.fn();
        render(
            <MetricDirectionAutoDetectChip
                measureNames={["Revenue", "Headcount", "Returns"]}
                onApply={onApply}
            />,
        );
        expect(screen.getByText(/2 of 3 metrics classified — 1 ambiguous/)).toBeTruthy();
    });

    it("does NOT render the dismiss button when onDismiss is omitted", () => {
        const onApply = vi.fn();
        render(
            <MetricDirectionAutoDetectChip measureNames={["Revenue"]} onApply={onApply} />,
        );
        expect(screen.queryByTestId("pp-metric-autodetect-chip-dismiss")).toBeNull();
    });

    it("renders + fires dismiss when onDismiss is provided", () => {
        const onApply = vi.fn();
        const onDismiss = vi.fn();
        render(
            <MetricDirectionAutoDetectChip
                measureNames={["Revenue"]}
                onApply={onApply}
                onDismiss={onDismiss}
            />,
        );
        const dismissBtn = screen.getByTestId("pp-metric-autodetect-chip-dismiss");
        fireEvent.click(dismissBtn);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
