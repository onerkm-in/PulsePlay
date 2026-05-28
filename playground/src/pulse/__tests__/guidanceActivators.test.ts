import { describe, it, expect } from "vitest";
import {
    parseGuidanceActivators,
    getActivatorBlock,
    hasActivator,
    ACTIVATOR_DESCRIPTORS,
    buildGuidancePlaceholder,
} from "../guidanceActivators";
import {
    parseFormatRules,
    describeFormatRules,
    sanitizeGuidanceForPrompt,
} from "../visualHelpers";

const FORMAT_GUIDANCE = [
    "## Business rules",
    "- Revenue = Net Sales after returns",
    "",
    "## Numeric Formatting",
    "| Range | Format | Example |",
    "| --- | --- | --- |",
    "| < 1000 | #,###.## | 567.89 |",
    "| >= 1000 | #,### | 12,345 |",
    "",
    "## Masking",
    "| Field | Rule |",
    "| --- | --- |",
    "| Customer Name | redact |",
].join("\n");

describe("parseGuidanceActivators", () => {
    it("splits recognized activator blocks from free prose", () => {
        const parsed = parseGuidanceActivators(FORMAT_GUIDANCE);
        const ids = parsed.blocks.map(b => b.id).sort();
        expect(ids).toEqual(["masking", "numeric-formatting"]);
        // The unrecognized `## Business rules` stays in prose.
        expect(parsed.prose).toContain("## Business rules");
        expect(parsed.prose).toContain("Revenue = Net Sales");
        // Recognized blocks are removed from prose.
        expect(parsed.prose).not.toContain("## Numeric Formatting");
        expect(parsed.prose).not.toContain("## Masking");
    });

    it("captures the block body for each activator", () => {
        const parsed = parseGuidanceActivators(FORMAT_GUIDANCE);
        const fmt = getActivatorBlock(parsed, "numeric-formatting");
        expect(fmt?.body).toContain("| < 1000 | #,###.## | 567.89 |");
        const mask = getActivatorBlock(parsed, "masking");
        expect(mask?.body).toContain("Customer Name");
    });

    it("recognizes aliases (Formatting Standards / Number Formatting / Data Masking)", () => {
        expect(hasActivator("## Formatting Standards\n| a | b |", "numeric-formatting")).toBe(true);
        expect(hasActivator("## Number Formatting\nfoo", "numeric-formatting")).toBe(true);
        expect(hasActivator("## Data Masking\nfoo", "masking")).toBe(true);
    });

    it("supports inline instructions on the header line", () => {
        const parsed = parseGuidanceActivators("## Masking redact every email field");
        const mask = getActivatorBlock(parsed, "masking");
        expect(mask?.body).toBe("redact every email field");
    });

    it("returns guidance unchanged when no activators are present", () => {
        const g = "## Business rules\n- Use fiscal year";
        const parsed = parseGuidanceActivators(g);
        expect(parsed.blocks).toHaveLength(0);
        expect(parsed.prose).toContain("Use fiscal year");
    });

    it("treats empty guidance safely", () => {
        const parsed = parseGuidanceActivators("");
        expect(parsed.blocks).toHaveLength(0);
        expect(parsed.prose).toBe("");
    });
});

describe("describeFormatRules", () => {
    it("renders a plain-English directive with NO # mask characters", () => {
        const rules = parseFormatRules(FORMAT_GUIDANCE);
        expect(rules.length).toBeGreaterThan(0);
        const desc = describeFormatRules(rules);
        expect(desc).not.toContain("#");
        expect(desc.toLowerCase()).toContain("decimal");
    });

    it("returns empty string for no rules", () => {
        expect(describeFormatRules([])).toBe("");
    });
});

describe("sanitizeGuidanceForPrompt", () => {
    it("strips raw # masks and replaces them with a mask-free directive", () => {
        const out = sanitizeGuidanceForPrompt(FORMAT_GUIDANCE);
        // No raw mask characters survive into the prompt-facing text.
        expect(out).not.toContain("#,###");
        expect(out).not.toContain("###.##");
        // Free prose is preserved.
        expect(out).toContain("Revenue = Net Sales");
        // A formatting directive is present (translated).
        expect(out.toLowerCase()).toContain("decimal");
        // Masking is acknowledged but raw rules are not echoed verbatim.
        expect(out.toLowerCase()).toContain("masking");
    });

    it("leaves guidance with no activators unchanged", () => {
        const g = "## Business rules\n- Use fiscal year, not calendar year";
        expect(sanitizeGuidanceForPrompt(g)).toBe(g);
    });

    it("strips stray # even when the format block is not a parseable table", () => {
        const g = "## Numeric Formatting\nuse #,###.## everywhere please";
        const out = sanitizeGuidanceForPrompt(g);
        expect(out).not.toContain("#");
    });
});

describe("activator descriptors + placeholder", () => {
    it("descriptors cover both shipped capabilities", () => {
        const ids = ACTIVATOR_DESCRIPTORS.map(d => d.id).sort();
        expect(ids).toEqual(["masking", "numeric-formatting"]);
    });

    it("masking is marked reserved with a UC caveat (honest scoping)", () => {
        const mask = ACTIVATOR_DESCRIPTORS.find(d => d.id === "masking")!;
        expect(mask.status).toBe("reserved");
        expect(mask.caveat?.toLowerCase()).toContain("unity catalog");
    });

    it("placeholder is generated from the descriptors", () => {
        const ph = buildGuidancePlaceholder();
        expect(ph).toContain("## Numeric Formatting");
        expect(ph).toContain("## Masking");
    });
});
