// playground/src/lib/__tests__/renderMarkdown.table.test.tsx
//
// Thread D — pipe table parsing + KPI tone coloring contract.
//
// Coverage:
//   • parseBlocks recognises a pipe table when followed by a separator row
//   • parseBlocks REJECTS pipe-looking lines without a separator (paragraph)
//   • table renders <table>/<thead>/<tbody> with correct cell counts
//   • Without metricRules, cells render plain (no data-tone)
//   • With metricRules, header → rule match → cell gets tone tint + aria-label
//   • Inverted-good rules (Churn lower-is-better) tone correctly
//   • Non-numeric and N/A cells skip tone application
//   • Currency-formatted values still parse to the underlying number
//   • Empty rules object behaves like no rules

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { parseBlocks, renderMarkdown } from "../renderMarkdown";

afterEach(() => cleanup());

const REVENUE_HIGHER: string = JSON.stringify([
    { name: "Revenue", higherIsBetter: true, redPct: 10, amberPct: 30 },
]);
const CHURN_LOWER: string = JSON.stringify([
    { name: "Churn %", higherIsBetter: false, redPct: 15, amberPct: 8 },
]);

describe("parseBlocks — pipe tables", () => {
    it("parses a markdown table with header + separator + rows", () => {
        const md = [
            "| Metric | Value |",
            "|--------|-------|",
            "| Revenue | 42% |",
            "| Margin | 18% |",
        ].join("\n");
        const blocks = parseBlocks(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe("table");
        expect(blocks[0].headers).toEqual(["Metric", "Value"]);
        expect(blocks[0].rows).toEqual([
            ["Revenue", "42%"],
            ["Margin", "18%"],
        ]);
    });

    it("treats pipe-looking text WITHOUT separator as a paragraph", () => {
        const md = "Run | grep | wc — a familiar pipeline.";
        const blocks = parseBlocks(md);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].kind).toBe("p");
    });

    it("parses a table even when separator uses alignment colons", () => {
        const md = [
            "| Left | Right |",
            "|:-----|------:|",
            "| a | b |",
        ].join("\n");
        const blocks = parseBlocks(md);
        expect(blocks[0].kind).toBe("table");
        expect(blocks[0].rows).toEqual([["a", "b"]]);
    });

    it("stops the table at the first non-table line", () => {
        const md = [
            "| h1 | h2 |",
            "|----|----|",
            "| a  | b  |",
            "",
            "Trailing prose.",
        ].join("\n");
        const blocks = parseBlocks(md);
        expect(blocks).toHaveLength(2);
        expect(blocks[0].kind).toBe("table");
        expect(blocks[1].kind).toBe("p");
        expect(blocks[1].text).toBe("Trailing prose.");
    });
});

describe("renderMarkdown — table render", () => {
    it("renders a <table> element with thead and tbody", () => {
        const md = "| Metric | Value |\n|---|---|\n| Revenue | 42% |";
        render(<>{renderMarkdown(md)}</>);
        const table = screen.getByRole("table");
        expect(table).toBeTruthy();
        const headers = screen.getAllByRole("columnheader");
        expect(headers.map(h => h.textContent)).toEqual(["Metric", "Value"]);
        const cells = screen.getAllByRole("cell");
        expect(cells).toHaveLength(2);
    });

    it("does NOT apply tone when metricRules is absent", () => {
        const md = "| Revenue | Value |\n|---|---|\n| Q1 | 42% |";
        render(<>{renderMarkdown(md)}</>);
        const cells = screen.getAllByRole("cell");
        expect(cells.every(c => !c.hasAttribute("data-tone"))).toBe(true);
    });

    it("applies 'good' tone to a Revenue cell above the green threshold", () => {
        const md = "| Revenue |\n|---|\n| 42% |";
        render(<>{renderMarkdown(md, { metricRules: { structured: REVENUE_HIGHER } })}</>);
        const cell = screen.getAllByRole("cell")[0];
        expect(cell.getAttribute("data-tone")).toBe("good");
        expect(cell.getAttribute("aria-label")).toContain("good");
    });

    it("applies 'bad' tone to a Revenue cell below the red threshold", () => {
        const md = "| Revenue |\n|---|\n| 5% |";
        render(<>{renderMarkdown(md, { metricRules: { structured: REVENUE_HIGHER } })}</>);
        expect(screen.getAllByRole("cell")[0].getAttribute("data-tone")).toBe("bad");
    });

    it("applies 'warn' tone to a Revenue cell in the amber band", () => {
        const md = "| Revenue |\n|---|\n| 20% |";
        render(<>{renderMarkdown(md, { metricRules: { structured: REVENUE_HIGHER } })}</>);
        expect(screen.getAllByRole("cell")[0].getAttribute("data-tone")).toBe("warn");
    });

    it("inverts tone for lower-is-better metrics (Churn %)", () => {
        const md = "| Churn % |\n|---|\n| 3% |";
        render(<>{renderMarkdown(md, { metricRules: { structured: CHURN_LOWER } })}</>);
        // Churn 3% < amberPct 8% → good (low churn is good)
        expect(screen.getAllByRole("cell")[0].getAttribute("data-tone")).toBe("good");
    });

    it("flags lower-is-better metrics above the red band as 'bad'", () => {
        const md = "| Churn % |\n|---|\n| 18% |";
        render(<>{renderMarkdown(md, { metricRules: { structured: CHURN_LOWER } })}</>);
        expect(screen.getAllByRole("cell")[0].getAttribute("data-tone")).toBe("bad");
    });

    it("skips tone for non-numeric cells (N/A, empty)", () => {
        const md = "| Revenue |\n|---|\n| N/A |";
        render(<>{renderMarkdown(md, { metricRules: { structured: REVENUE_HIGHER } })}</>);
        const cell = screen.getAllByRole("cell")[0];
        expect(cell.hasAttribute("data-tone")).toBe(false);
    });

    it("parses currency-formatted values through the same number extractor", () => {
        const md = "| Revenue |\n|---|\n| $42.5M |";
        render(<>{renderMarkdown(md, { metricRules: { structured: REVENUE_HIGHER } })}</>);
        // 42.5 > amberPct 30 → good
        expect(screen.getAllByRole("cell")[0].getAttribute("data-tone")).toBe("good");
    });

    it("skips tone when header does NOT match any rule", () => {
        const md = "| Region |\n|---|\n| 42% |";
        render(<>{renderMarkdown(md, { metricRules: { structured: REVENUE_HIGHER } })}</>);
        expect(screen.getAllByRole("cell")[0].hasAttribute("data-tone")).toBe(false);
    });

    it("falls back gracefully when rules JSON is empty / malformed", () => {
        const md = "| Revenue |\n|---|\n| 42% |";
        render(<>{renderMarkdown(md, { metricRules: { structured: "not json at all" } })}</>);
        expect(screen.getAllByRole("cell")[0].hasAttribute("data-tone")).toBe(false);
    });
});
