import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest } from "../visual";
import { dropUnpairedEmphasis } from "../rendering/contentSanitizer";

/**
 * Regression pin for the stray `**` reported on the deployed SCM run
 * (2026-07-28). The rendered Executive Brief showed literal asterisks:
 *
 *   "an increase of $42.07 MN** (4.3%) ... a gain of 0.46 %**"
 *
 * The model's markdown was BALANCED. The imbalance was ours: the trend-pill
 * grammar only understood glued units ("$2.30M"), so on the space-separated
 * form our own domain guidance mandates ("$42.07 MN") the number stopped at
 * the space — the leading \*{0,2} ate the opening marker and the trailing one
 * had nothing left to eat, orphaning the closer into a raw text node.
 */
const UPSTREAM_BRIEF =
    "Net Sales for January-June rose from $989.34 MN in 2025 to $1,031.41 MN in 2026, " +
    "an increase of **+$42.07 MN** (4.3%). Gross Margin improved from 55.14 % to 55.60 %, " +
    "a gain of **+0.46 %**. Both sales and margin are trending upward year-over-year.";

describe("stray emphasis markers never reach the DOM", () => {
    it("renders the reported Executive Brief without literal asterisks", () => {
        const node = __insightsRenderForTest.inlineFormat(UPSTREAM_BRIEF, "HEADLINE");
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).not.toContain("**");
        expect(html).not.toContain("*");
    });

    it("keeps the space-separated unit inside the trend pill, not leaking after it", () => {
        const node = __insightsRenderForTest.inlineFormat(UPSTREAM_BRIEF, "HEADLINE");
        const html = renderToStaticMarkup(<>{node}</>);

        // The pill carries the magnitude with its unit. Before the fix the pill
        // held "$42.07" and " MN" trailed outside it as plain text.
        expect(html).toMatch(/gn-trend-pill[^>]*>.*\$42\.07 MN/s);
        expect(html).toMatch(/gn-trend-pill[^>]*>.*0\.46 %/s);
    });

    it("drops an orphaned marker while leaving real bold and italics alone", () => {
        expect(dropUnpairedEmphasis("MN** (4.3%)")).toBe("MN (4.3%)");
        expect(dropUnpairedEmphasis("**bold** kept")).toBe("**bold** kept");
        expect(dropUnpairedEmphasis("**a** and **b**")).toBe("**a** and **b**");
        // greedy left-to-right pairing matches parseBold, so the leftover is last
        expect(dropUnpairedEmphasis("**a** stray **")).toBe("**a** stray ");
        expect(dropUnpairedEmphasis("*italic* untouched")).toBe("*italic* untouched");
        expect(dropUnpairedEmphasis("__u__ paired")).toBe("__u__ paired");
        expect(dropUnpairedEmphasis("plain text")).toBe("plain text");
    });
});
