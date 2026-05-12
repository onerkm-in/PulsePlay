import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { __insightsRenderForTest } from "../visual";

describe("insights narrative polish", () => {
    it("keeps prose thresholds readable instead of rendering raw rule fragments as pills", () => {
        const node = __insightsRenderForTest.renderNarrative(
            "- Return rate is above the 🟡 caution threshold (>3 ▼ -7%), so margin resilience needs attention.",
            "RISKS",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).not.toContain("gn-trend-pill");
        expect(html).not.toContain("🟡");
        expect(html).not.toContain("▼");
        expect(html).toContain("caution threshold");
        expect(html).not.toContain("&gt;3");
        expect(html).not.toContain("-7%");
    });

    it("renders labeled risk bullets as insight cards instead of a plain list", () => {
        const node = __insightsRenderForTest.renderNarrative(
            [
                "- **Returns pressure:** Return rate reached **6.2%**, above the caution line.",
                "- **Margin compression:** Profit margin fell to **12.7%**, reducing resilience.",
            ].join("\n"),
            "RISKS",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-insight-card-grid");
        expect(html).toContain("gn-insight-card-label");
        expect(html).not.toContain("gn-narrative-list");
    });

    it("renders headline text as a summary card", () => {
        const node = __insightsRenderForTest.renderSectionBody(
            "Return rate is on watch at **6.2%**, while profit margin softened year over year.",
            "HEADLINE",
        );
        const html = renderToStaticMarkup(<>{node}</>);

        expect(html).toContain("gn-headline-card");
        expect(html).toContain("<strong>6.2%</strong>");
    });
});
