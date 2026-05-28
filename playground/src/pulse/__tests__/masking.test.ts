import { describe, it, expect } from "vitest";
import type { ContextSummary } from "../contextBuilder";
import {
    parseMaskingRules,
    maskValue,
    applyMaskingToContext,
    maskFilters,
    maskSqlResult,
} from "../masking";
import { buildGenieRequest } from "../visualHelpers";

const MASK_GUIDANCE = [
    "## Business rules",
    "- Revenue = Net Sales",
    "",
    "## Masking",
    "| Field | Rule |",
    "| --- | --- |",
    "| Customer Name | redact |",
    "| Account Number | last4 |",
    "| Salary | hide |",
].join("\n");

describe("parseMaskingRules", () => {
    it("parses the | Field | Rule | table from the ## Masking block", () => {
        expect(parseMaskingRules(MASK_GUIDANCE)).toEqual([
            { field: "Customer Name", rule: "redact" },
            { field: "Account Number", rule: "last4" },
            { field: "Salary", rule: "hide" },
        ]);
    });

    it("ignores unknown rule verbs and rows without two cells", () => {
        const g = "## Masking\n| Field | Rule |\n|---|---|\n| A | scramble |\n| B |\n| C | hide |";
        expect(parseMaskingRules(g)).toEqual([{ field: "C", rule: "hide" }]);
    });

    it("returns [] when there is no ## Masking block", () => {
        expect(parseMaskingRules("## Business rules\n- x")).toEqual([]);
        expect(parseMaskingRules("")).toEqual([]);
    });
});

describe("maskValue", () => {
    it("redact → bullets, last4 → tail, hide → empty", () => {
        expect(maskValue("Alice Johnson", "redact")).toBe("•••");
        expect(maskValue("1234567890", "last4")).toBe("••••7890");
        expect(maskValue("99", "last4")).toBe("••••"); // <= 4 chars
        expect(maskValue("anything", "hide")).toBe("");
    });
});

function ctx(overrides: Partial<ContextSummary> = {}): ContextSummary {
    return {
        hasSelection: true,
        contextText: "Customer Name: Alice Johnson | Account Number: 1234567890 | Region: West",
        safeContextText: "Customer Name: Alice Johnson | Account Number: 1234567890 | Region: West",
        boundFieldNames: ["Customer Name", "Account Number", "Region", "Salary"],
        dimensions: {
            "Customer Name": ["Alice Johnson", "Bob Smith"],
            "Account Number": ["1234567890"],
            "Region": ["West", "East"],
        },
        measures: { Salary: 95000, Sales: 1000 },
        availableFilters: [],
        filterCount: 0,
        mandatoryScopeText: "",
        ...overrides,
    };
}

describe("applyMaskingToContext", () => {
    it("redacts dimension values + scrubs the serialized text", () => {
        const out = applyMaskingToContext(ctx(), parseMaskingRules(MASK_GUIDANCE));
        // Dimension values masked.
        expect(out.dimensions["Customer Name"]).toEqual(["•••", "•••"]);
        expect(out.dimensions["Account Number"]).toEqual(["••••7890"]);
        expect(out.dimensions["Region"]).toEqual(["West", "East"]); // untouched
        // Serialized text scrubbed of raw values.
        expect(out.safeContextText).not.toContain("Alice Johnson");
        expect(out.safeContextText).not.toContain("Bob Smith");
        expect(out.safeContextText).not.toContain("1234567890");
        expect(out.safeContextText).toContain("••••7890");
        expect(out.safeContextText).toContain("West"); // unmasked field intact
    });

    it("hide drops the field from dimensions/measures + boundFieldNames", () => {
        const out = applyMaskingToContext(ctx(), parseMaskingRules(MASK_GUIDANCE));
        expect(out.measures.Salary).toBeUndefined(); // hidden measure dropped
        expect(out.measures.Sales).toBe(1000);       // untouched
        expect(out.boundFieldNames).not.toContain("Salary");
        expect(out.boundFieldNames).toContain("Region");
    });

    it("is a no-op with no rules", () => {
        const c = ctx();
        expect(applyMaskingToContext(c, [])).toBe(c);
    });
});

describe("maskFilters", () => {
    it("masks matching filter values and drops hidden ones", () => {
        const out = maskFilters(
            { "Customer Name": "Alice Johnson", "Account Number": "1234567890", "Salary": "95000", "Region": "West" },
            parseMaskingRules(MASK_GUIDANCE),
        );
        expect(out["Customer Name"]).toBe("•••");
        expect(out["Account Number"]).toBe("••••7890");
        expect(out.Salary).toBeUndefined(); // hide drops
        expect(out.Region).toBe("West");
    });
});

describe("maskSqlResult — display-side masking of SQL section cells (4b)", () => {
    const result = {
        columns: ["Customer Name", "Account Number", "Salary", "Region"],
        rows: [
            ["Alice Johnson", "1234567890", 95000, "West"],
            ["Bob Smith", "9876543210", 88000, "East"],
        ],
        totalRowCount: 2,
    };
    const rules = parseMaskingRules(MASK_GUIDANCE); // redact / last4 / hide(Salary)

    it("redacts/last4 matching columns and drops hidden columns", () => {
        const out = maskSqlResult(result, rules);
        // Salary column (hide) dropped entirely.
        expect(out.columns).toEqual(["Customer Name", "Account Number", "Region"]);
        expect(out.rows[0]).toEqual(["•••", "••••7890", "West"]);
        expect(out.rows[1]).toEqual(["•••", "••••3210", "East"]);
        // Unrelated metadata preserved.
        expect(out.totalRowCount).toBe(2);
    });

    it("is a no-op when no rules or no column matches", () => {
        expect(maskSqlResult(result, [])).toBe(result);
        const noMatch = maskSqlResult(result, [{ field: "Nonexistent", rule: "redact" }]);
        expect(noMatch).toBe(result);
    });

    it("masks a single-column KPI result (the KPI renderer reads rows[0][0])", () => {
        const kpi = { columns: ["Customer Name"], rows: [["Alice Johnson"]] };
        const out = maskSqlResult(kpi, rules);
        expect(out.rows[0][0]).toBe("•••");
    });
});

describe("buildGenieRequest integration — masked values never reach the prompt", () => {
    it("redacts masked dimension values from the chat context", () => {
        const out = buildGenieRequest(
            "who are the top customers?",
            "summary",
            ctx(),
            { "Customer Name": "Alice Johnson" },
            MASK_GUIDANCE,
            true,
        );
        expect(out).not.toContain("Alice Johnson");
        expect(out).not.toContain("Bob Smith");
        expect(out).not.toContain("1234567890");
        expect(out).toContain("•••");
        // And the raw masking table itself is not parroted into the prompt.
        expect(out).not.toContain("| Customer Name | redact |");
    });
});
