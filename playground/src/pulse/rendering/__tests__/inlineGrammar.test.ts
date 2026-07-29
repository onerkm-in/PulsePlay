import { describe, expect, it } from "vitest";
import {
    isMeasurementNumber,
    isThresholdContext,
    stripNarrativeThresholdFragments,
    LIST_ITEM_MARKER_RE,
    MEAS_NUM,
    POS_RE,
    stripRedundantSignForPill,
    INLINE_REGEX,
} from "../inlineGrammar";

/**
 * Characterisation tests for the inline measurement grammar, extracted from
 * visual.tsx under DEBT_REGISTER D5 Phase 1.
 *
 * These pin the behaviour the grammar ALREADY had, so the extraction is
 * provably behaviour-preserving rather than merely type-checking. They also
 * give the module its own proof, which the code did not have while it was
 * buried in a 13.5k-line file - the point of the extraction, not a side effect.
 *
 * Cases below encode findings that were paid for in production: BUG-016 (bare
 * years read as measurements), IDEA-039 (currency prefix without a sign), and
 * the 2026-07-28 orphaned-bold-marker defect (space-separated units).
 */

describe("isMeasurementNumber", () => {
    it.each(["+5", "-0.22%", "12.5%", "3pp", "5K", "$11,644.10", "€100.00", "£5K"])(
        "accepts %s", token => expect(isMeasurementNumber(token)).toBe(true),
    );

    it("rejects a bare 4-digit year — BUG-016, they are temporal anchors", () => {
        expect(isMeasurementNumber("2024")).toBe(false);
        expect(isMeasurementNumber("1999")).toBe(false);
    });

    it("rejects a bare integer — a list ordinal, not a delta", () => {
        expect(isMeasurementNumber("7")).toBe(false);
        expect(isMeasurementNumber("")).toBe(false);
        expect(isMeasurementNumber("   ")).toBe(false);
    });
});

describe("isThresholdContext", () => {
    it("needs BOTH a threshold word and a comparator", () => {
        const withBoth = "Return rate is above the caution threshold (>3%)";
        expect(isThresholdContext(withBoth, withBoth.indexOf("(>3%)"))).toBe(true);

        const wordOnly = "Return rate is above the caution line of three percent";
        expect(isThresholdContext(wordOnly, 10)).toBe(false);

        const comparatorOnly = "value >3 recorded";
        expect(isThresholdContext(comparatorOnly, 6)).toBe(false);
    });
});

describe("stripNarrativeThresholdFragments", () => {
    it("removes a parenthetical containing a comparator and tidies the punctuation", () => {
        expect(stripNarrativeThresholdFragments("Return rate rose (>3% caution), so act."))
            .toBe("Return rate rose, so act.");
    });

    it("leaves an ordinary parenthetical alone", () => {
        const keep = "Net sales rose (driven by volume).";
        expect(stripNarrativeThresholdFragments(keep)).toBe(keep);
    });
});

describe("stripRedundantSignForPill", () => {
    it("drops a sign the direction glyph already conveys, and nothing else", () => {
        expect(stripRedundantSignForPill("+33.42%")).toBe("33.42%");
        expect(stripRedundantSignForPill("-0.22%")).toBe("0.22%");
        expect(stripRedundantSignForPill("$1,234")).toBe("$1,234");
        expect(stripRedundantSignForPill("20.4%")).toBe("20.4%");
    });
});

describe("LIST_ITEM_MARKER_RE", () => {
    it.each(["- item", "* item", "• item", "1. item", "2) item", "(3) item", "[4] item"])(
        "matches %s", line => expect(LIST_ITEM_MARKER_RE.test(line)).toBe(true),
    );
    it("does not match ordinary prose", () => {
        expect(LIST_ITEM_MARKER_RE.test("Net sales rose 4.89 %")).toBe(false);
    });
});

describe("MEAS_NUM accepts both unit forms", () => {
    const re = new RegExp(`^(?:${MEAS_NUM})$`);
    it.each(["$2.30M", "$989.34 MN", "55.60 %", "+$42.07 MN", "1.14 MN", "-65.42 MN"])(
        "accepts %s", token => expect(re.test(token)).toBe(true),
    );
    it("does not read a following word's first letter as a magnitude", () => {
        // "5 Markets" must match only "5" - the negative lookahead exists
        // because the alternative orphaned bold markers in production
        expect(new RegExp(MEAS_NUM).exec("5 Markets")?.[0]).toBe("5");
    });
});

describe("POS_RE", () => {
    it("classifies trend direction words", () => {
        expect(POS_RE.test("increased")).toBe(true);
        expect(POS_RE.test("rose")).toBe(true);
        expect(POS_RE.test("declined")).toBe(false);
    });
});

describe("INLINE_REGEX", () => {
    it("is stateful by design — callers must reset lastIndex", () => {
        expect(INLINE_REGEX.flags).toContain("g");
        INLINE_REGEX.lastIndex = 0;
        const first = INLINE_REGEX.exec("sales increased by 12.5%");
        expect(first).toBeTruthy();
        expect(INLINE_REGEX.lastIndex).toBeGreaterThan(0);
        INLINE_REGEX.lastIndex = 0;
    });

    it("matches a trend word followed by a space-separated unit", () => {
        INLINE_REGEX.lastIndex = 0;
        const m = INLINE_REGEX.exec("an increase of +$42.07 MN");
        expect(m?.[0]).toContain("$42.07 MN");
        INLINE_REGEX.lastIndex = 0;
    });
});
