// playground/src/pulse/__tests__/maskSqlResult.render.test.tsx
//
// Slice 4b — DOM-level proof that masked SQL results actually paint masked
// cells. maskSqlResult transforms the data; SqlSectionRenderer is pure
// presentation, so rendering the masked result must show the masked values
// and never the raw ones. (Can't drive a live warehouse in CI, so this
// renders the real component with masked data — the deterministic surface.)

import { describe, it, expect, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SqlSectionRenderer } from "../sqlSectionRenderer";
import type { SqlSection } from "../sqlSection";
import { maskSqlResult, parseMaskingRules } from "../masking";

const GUIDANCE = [
    "## Masking",
    "| Field | Rule |",
    "| --- | --- |",
    "| Customer Name | redact |",
    "| Account Number | last4 |",
    "| Salary | hide |",
].join("\n");

const RAW = {
    columns: ["Customer Name", "Account Number", "Salary", "Region"],
    rows: [
        ["Alice Johnson", "1234567890", 95000, "West"],
        ["Bob Smith", "9876543210", 88000, "East"],
    ],
};

let mounted: { root: Root; container: HTMLElement } | null = null;
function render(node: React.ReactElement): string {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(node); });
    mounted = { root, container };
    return container.textContent || "";
}
afterEach(() => {
    if (mounted) { act(() => mounted!.root.unmount()); mounted.container.remove(); mounted = null; }
});

describe("maskSqlResult → SqlSectionRenderer (display path)", () => {
    const section: SqlSection = { kind: "sql", title: "Customers", sql: "select 1", resultRender: "table" };

    it("table cells render masked, never the raw values; hidden column gone", () => {
        const masked = maskSqlResult(RAW, parseMaskingRules(GUIDANCE));
        const text = render(<SqlSectionRenderer section={section} result={masked} loading={false} />);
        // Raw sensitive values must not appear anywhere in the DOM.
        expect(text).not.toContain("Alice Johnson");
        expect(text).not.toContain("Bob Smith");
        expect(text).not.toContain("1234567890");
        expect(text).not.toContain("9876543210");
        // Masked forms present.
        expect(text).toContain("•••");
        expect(text).toContain("••••7890");
        expect(text).toContain("••••3210");
        // Hidden "Salary" column dropped (header + values).
        expect(text).not.toContain("Salary");
        expect(text).not.toContain("95000");
        // Unmasked column intact.
        expect(text).toContain("West");
    });

    it("KPI variant masks the headline value", () => {
        const kpiSection: SqlSection = { kind: "sql", title: "Top customer", sql: "select 1", resultRender: "kpi" };
        const masked = maskSqlResult(
            { columns: ["Customer Name"], rows: [["Alice Johnson"]] },
            parseMaskingRules(GUIDANCE),
        );
        const text = render(<SqlSectionRenderer section={kpiSection} result={masked} loading={false} />);
        expect(text).not.toContain("Alice Johnson");
        expect(text).toContain("•••");
    });

    it("without masking rules the raw values render (control)", () => {
        const text = render(<SqlSectionRenderer section={section} result={RAW} loading={false} />);
        expect(text).toContain("Alice Johnson");
        expect(text).toContain("West");
    });
});
