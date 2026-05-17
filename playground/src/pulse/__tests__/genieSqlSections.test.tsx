import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { collectGenieSqlFromAttachments, liftFmSqlSections } from "../genie";
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

describe("Phase 11b FM symmetry — top-level sqlSections consumer", () => {
    it("lifts top-level sqlSections from a Foundation Model response into the same shape Genie produces", () => {
        // Shape mirrors what proxy /foundation/section now emits when
        // the LLM output contains a ```sql fence with /* Section: X */
        // markers. The playground reads top-level sqlSections rather
        // than walking attachments[].query (FM responses have no
        // attachments).
        const fmResponse = {
            content: "## Headline\nSales of $2.30M on-track.",
            rawContent: "```sql\n/* Section: HEADLINE */\nWITH headline_data AS (SELECT 1) SELECT * FROM headline_data;\n```",
            parsedJson: null,
            endpoint: "databricks-meta-llama-3-1-405b-instruct",
            profile: "foundation",
            structured: false,
            sqlSections: [
                {
                    sectionId: "HEADLINE",
                    cteName: "headline_data",
                    sqlFragment: "/* Section: HEADLINE */\nWITH headline_data AS (SELECT 1) SELECT * FROM headline_data;",
                    startOffset: 8,
                },
                {
                    sectionId: "TRENDS",
                    sqlFragment: "-- Section: TRENDS\nSELECT month FROM gold.sales;",
                },
            ],
        };

        const lifted = liftFmSqlSections(fmResponse);

        expect(lifted).toHaveLength(2);
        expect(lifted[0]).toEqual({
            sectionId: "HEADLINE",
            cteName: "headline_data",
            sqlFragment: "/* Section: HEADLINE */\nWITH headline_data AS (SELECT 1) SELECT * FROM headline_data;",
            startOffset: 8,
        });
        expect(lifted[1]).toEqual({
            sectionId: "TRENDS",
            cteName: undefined,
            sqlFragment: "-- Section: TRENDS\nSELECT month FROM gold.sales;",
            startOffset: undefined,
        });
    });

    it("returns an empty array when the FM response has no sqlSections (clean fallback for plain narrative)", () => {
        const fmResponse = {
            content: "Plain narrative answer, no SQL backing.",
            rawContent: "Plain narrative answer, no SQL backing.",
            parsedJson: null,
            endpoint: "foundation-llama",
            profile: "foundation",
            structured: false,
        };
        expect(liftFmSqlSections(fmResponse)).toEqual([]);
    });

    it("silently drops malformed entries (missing sectionId, empty fragment) without throwing", () => {
        const fmResponse = {
            sqlSections: [
                { sectionId: "", sqlFragment: "SELECT 1" },          // missing id
                { sectionId: "RISKS", sqlFragment: "" },              // empty fragment
                { sectionId: "RISKS", sqlFragment: "SELECT 1" },      // valid
                { sectionId: 42, sqlFragment: "SELECT 2" },           // wrong type
                null,                                                  // null entry
            ],
        };
        const lifted = liftFmSqlSections(fmResponse);
        expect(lifted).toHaveLength(1);
        expect(lifted[0].sectionId).toBe("RISKS");
    });

    it("tolerates null / undefined / non-object inputs (defensive contract)", () => {
        expect(liftFmSqlSections(null)).toEqual([]);
        expect(liftFmSqlSections(undefined)).toEqual([]);
        expect(liftFmSqlSections("not an object")).toEqual([]);
        expect(liftFmSqlSections(42 as unknown)).toEqual([]);
    });

    it("FM-lifted sections render through the same SqlTabs path Genie sections use (visual league symmetry)", () => {
        // Lift FM sections, then feed them into the same SqlTabs UI the
        // Genie pipeline uses. Proves the render path is shared — the
        // user-visible "labelled tabs instead of raw blob" behavior is
        // identical between Genie and FM once the proxy surfaces sections.
        const fmResponse = {
            sqlSections: [
                { sectionId: "HEADLINE", cteName: "headline_data", sqlFragment: "/* Section: HEADLINE */\nSELECT 1;" },
                { sectionId: "RECOMMENDED_ACTIONS", sqlFragment: "-- Section: RECOMMENDED_ACTIONS\nSELECT 2;" },
            ],
        };
        const sections = liftFmSqlSections(fmResponse);
        const labels = sections.map(s => __insightsRenderForTest.formatSqlSectionLabel(s));
        const queries = sections.map(s => s.sqlFragment);

        const html = renderToStaticMarkup(
            <SqlTabsForTest
                queries={queries}
                labels={labels}
                ariaLabel="SQL sections"
            />,
        );

        expect(labels).toEqual(["Headline · headline_data", "Recommended Actions"]);
        expect(html).toContain("Headline · headline_data");
        expect(html).toContain("Recommended Actions");
        // Same a11y label the Genie path uses — symmetry contract.
        expect(html).toContain('aria-label="SQL sections"');
        // No "Query 1/Query 2" generic labels leak through.
        expect(html).not.toContain("Query 1");
    });
});
