import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { collectGenieSqlFromAttachments } from "../genie";
import { __insightsRenderForTest } from "../visual";

const SqlTabsForTest = __insightsRenderForTest.SqlTabs;

describe("Phase 11b SQL section consumer", () => {
    it("lifts proxy-provided sqlSections alongside raw SQL query fallback", () => {
        const extracted = collectGenieSqlFromAttachments([
            {
                query: {
                    query: "/* Section: HEADLINE */\nSELECT SUM(amount) FROM sales;",
                    sqlSections: [
                        {
                            sectionId: "HEADLINE",
                            cteName: "headline_sales",
                            sqlFragment: "/* Section: HEADLINE */\nSELECT SUM(amount) FROM sales;",
                            startOffset: 0,
                        },
                    ],
                },
            },
            {
                query: {
                    query: "-- Section: RISKS\nSELECT return_rate FROM sales;",
                    sqlSections: [
                        {
                            sectionId: "RISKS",
                            sqlFragment: "-- Section: RISKS\nSELECT return_rate FROM sales;",
                            startOffset: 48,
                        },
                        {
                            sectionId: "",
                            sqlFragment: "SELECT should_not_render;",
                        },
                    ],
                },
            },
        ]);

        expect(extracted.queries).toEqual([
            "/* Section: HEADLINE */\nSELECT SUM(amount) FROM sales;",
            "-- Section: RISKS\nSELECT return_rate FROM sales;",
        ]);
        expect(extracted.sections).toEqual([
            {
                sectionId: "HEADLINE",
                cteName: "headline_sales",
                sqlFragment: "/* Section: HEADLINE */\nSELECT SUM(amount) FROM sales;",
                startOffset: 0,
            },
            {
                sectionId: "RISKS",
                sqlFragment: "-- Section: RISKS\nSELECT return_rate FROM sales;",
                startOffset: 48,
            },
        ]);
    });

    it("renders section labels instead of generic Query tabs", () => {
        const html = renderToStaticMarkup(
            <SqlTabsForTest
                queries={[
                    "/* Section: HEADLINE */\nSELECT 1;",
                    "-- Section: RECOMMENDED_ACTIONS\nSELECT 2;",
                ]}
                labels={["Headline · headline_sales", "Recommended Actions"]}
                ariaLabel="SQL sections"
            />,
        );

        expect(html).toContain('aria-label="SQL sections"');
        expect(html).toContain("Headline · headline_sales");
        expect(html).toContain("Recommended Actions");
        expect(html).not.toContain("Query 1");
    });

    it("shows a visible section label for a single section fragment", () => {
        const label = __insightsRenderForTest.formatSqlSectionLabel({
            sectionId: "RECOMMENDED_ACTIONS",
            sqlFragment: "SELECT 1;",
        });
        const html = renderToStaticMarkup(
            <SqlTabsForTest
                queries={["-- Section: RECOMMENDED_ACTIONS\nSELECT 1;"]}
                labels={[label]}
            />,
        );

        expect(label).toBe("Recommended Actions");
        expect(html).toContain("gn-sql-section-label");
        expect(html).toContain("Recommended Actions");
    });
});
