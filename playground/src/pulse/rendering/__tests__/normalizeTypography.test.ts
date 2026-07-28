import { describe, expect, it } from "vitest";
import { normalizeTypography } from "../contentSanitizer";

describe("normalizeTypography", () => {
    it("replaces em and en dashes with plain hyphens", () => {
        expect(normalizeTypography("Sales rose — strongly")).toBe("Sales rose - strongly");
        expect(normalizeTypography("cost—benefit")).toBe("cost-benefit");
    });

    it("keeps a numeric range as a hyphen, not a comma", () => {
        expect(normalizeTypography("2025–2026 window")).toBe("2025-2026 window");
        expect(normalizeTypography("Q1–Q4")).toBe("Q1-Q4");
        expect(normalizeTypography("range 10–20 units")).toBe("range 10-20 units");
    });

    it("NEVER creates a minus sign in front of a number", () => {
        // the trap: "- 5.2%" would read as negative 5.2%
        expect(normalizeTypography("Net Sales — 5.2%")).toBe("Net Sales, 5.2%");
        expect(normalizeTypography("Margin – 55.60 %")).toBe("Margin, 55.60 %");
        expect(normalizeTypography("Revenue — $1.99 B")).toBe("Revenue, $1.99 B");
        // an explicitly signed value keeps its own sign, still no stray hyphen
        expect(normalizeTypography("Change — -3.10 %")).toBe("Change, -3.10 %");
    });

    it("promotes a line-leading dash to a real markdown bullet", () => {
        expect(normalizeTypography("— first\n— second")).toBe("- first\n- second");
        expect(normalizeTypography("intro\n  — indented")).toBe("intro\n  - indented");
    });

    it("normalises curly quotes and the ellipsis glyph", () => {
        expect(normalizeTypography("‘quoted’")).toBe("'quoted'");
        expect(normalizeTypography("“quoted”")).toBe('"quoted"');
        expect(normalizeTypography("loading…")).toBe("loading...");
    });

    it("leaves functional glyphs alone", () => {
        const glyphs = "▲ up ▼ down ↔ flat → next ← back";
        expect(normalizeTypography(glyphs)).toBe(glyphs);
    });

    it("is idempotent and cheap on clean text", () => {
        const once = normalizeTypography("Net Sales — 5.2% — strong ‘ok’");
        expect(normalizeTypography(once)).toBe(once);
        const clean = "Nothing to do here - 5% plain";
        expect(normalizeTypography(clean)).toBe(clean);
    });

    it("handles empty and undefined-ish input", () => {
        expect(normalizeTypography("")).toBe("");
        expect(normalizeTypography(undefined as unknown as string)).toBe(undefined as unknown as string);
    });

    it("normalises the reported decision-card sentence", () => {
        expect(normalizeTypography("Submitted — awaiting approval from Supply Chain Manager."))
            .toBe("Submitted - awaiting approval from Supply Chain Manager.");
    });
});
