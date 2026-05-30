import { describe, it, expect } from "vitest";
import {
    parseMarkdownSections,
    aiSectionsToMarkdown,
    customSectionsJsonToMarkdown,
    countSqlSections,
    mergeMarkdownIntoCustomSectionsJson,
    readCustomSectionsJson,
    readSqlSections,
    mergeSqlSectionsIntoCustomSectionsJson,
} from "../sectionMarkdown";

const MD = [
    "## Executive Brief",
    "Summarize revenue and margin vs prior year.",
    "",
    "## Category Mix",
    "Rank category contribution by sales and margin.",
].join("\n");

describe("parseMarkdownSections", () => {
    it("turns each ## heading into a section with its body as the instruction", () => {
        const sections = parseMarkdownSections(MD);
        expect(sections).toHaveLength(2);
        expect(sections[0]).toEqual({ name: "Executive Brief", instruction: "Summarize revenue and margin vs prior year." });
        expect(sections[1].name).toBe("Category Mix");
    });

    it("keeps ### subheadings inside the body (only ## is a boundary)", () => {
        const sections = parseMarkdownSections("## Risks\nTop risks:\n### Concentration\nOne customer is 40%.");
        expect(sections).toHaveLength(1);
        expect(sections[0].instruction).toContain("### Concentration");
    });

    it("ignores text before the first ## and drops empty-name sections", () => {
        const sections = parseMarkdownSections("intro text\n## \n## Real\nbody");
        expect(sections.map(s => s.name)).toEqual(["Real"]);
    });

    it("handles a heading with no body", () => {
        const sections = parseMarkdownSections("## HEADLINE");
        expect(sections).toEqual([{ name: "HEADLINE", instruction: "" }]);
    });

    it("returns [] for empty input", () => {
        expect(parseMarkdownSections("")).toEqual([]);
    });
});

describe("round-trip markdown <-> JSON", () => {
    it("aiSectionsToMarkdown then parse is stable", () => {
        const md = aiSectionsToMarkdown([
            { name: "A", instruction: "do a" },
            { name: "B", instruction: "do b" },
        ]);
        expect(parseMarkdownSections(md)).toEqual([
            { name: "A", instruction: "do a" },
            { name: "B", instruction: "do b" },
        ]);
    });

    it("customSectionsJsonToMarkdown extracts only AI sections", () => {
        const json = JSON.stringify([
            { name: "Brief", instruction: "summarize", kind: "ai" },
            { name: "KPIs", sql: "select 1", kind: "sql", resultRender: "kpi" },
        ]);
        const md = customSectionsJsonToMarkdown(json);
        expect(md).toContain("## Brief");
        expect(md).not.toContain("KPIs");
        expect(md).not.toContain("select 1");
    });

    it("supports the legacy `title` alias when seeding markdown", () => {
        const json = JSON.stringify([{ title: "Legacy", instruction: "x" }]);
        expect(customSectionsJsonToMarkdown(json)).toContain("## Legacy");
    });
});

describe("mergeMarkdownIntoCustomSectionsJson", () => {
    it("replaces AI sections but preserves SQL sections", () => {
        const existing = JSON.stringify([
            { name: "Old AI", instruction: "old", kind: "ai" },
            { name: "Revenue KPI", sql: "select sum(rev)", kind: "sql", resultRender: "kpi" },
        ]);
        const out = mergeMarkdownIntoCustomSectionsJson("## New AI\nfresh instruction", existing);
        const parsed = readCustomSectionsJson(out);
        // AI section replaced, SQL preserved (after the AI sections).
        expect(parsed.map(s => s.name)).toEqual(["New AI", "Revenue KPI"]);
        const sql = parsed.find(s => s.name === "Revenue KPI");
        expect(sql?.kind).toBe("sql");
        expect(sql?.sql).toBe("select sum(rev)");
    });

    it("emits empty string when there are no sections at all", () => {
        expect(mergeMarkdownIntoCustomSectionsJson("", "")).toBe("");
    });

    it("countSqlSections counts only kind:sql", () => {
        const json = JSON.stringify([
            { name: "a", kind: "ai", instruction: "x" },
            { name: "b", kind: "sql", sql: "select 1" },
            { name: "c", kind: "sql", sql: "select 2" },
        ]);
        expect(countSqlSections(json)).toBe(2);
    });
});

describe("SQL sections — read / merge / per-section profile", () => {
    it("readSqlSections returns name, sql, render, and profile when set", () => {
        const json = JSON.stringify([
            { name: "AI bit", kind: "ai", instruction: "x" },
            { name: "Revenue", kind: "sql", sql: "select 1", resultRender: "kpi", profile: "genie-finance" },
            { name: "Orders", kind: "sql", sql: "select 2", resultRender: "table" },
        ]);
        const rows = readSqlSections(json);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({ name: "Revenue", sql: "select 1", resultRender: "kpi", profile: "genie-finance" });
        // No profile key when unset (inherits active profile).
        expect(rows[1].profile).toBeUndefined();
        expect(rows[1].resultRender).toBe("table");
    });

    it("mergeSqlSectionsIntoCustomSectionsJson preserves AI sections and persists profile only when set", () => {
        const existing = JSON.stringify([
            { name: "Brief", kind: "ai", instruction: "summarize" },
            { name: "Old SQL", kind: "sql", sql: "select 0" },
        ]);
        const out = mergeSqlSectionsIntoCustomSectionsJson(
            [
                { name: "Revenue", sql: "select sum(rev)", resultRender: "kpi", profile: "genie-finance" },
                { name: "Orders", sql: "select count(*)", resultRender: "table" },
                { name: "", sql: "select 9", resultRender: "kpi" }, // dropped (no name)
            ],
            existing,
        );
        const parsed = readCustomSectionsJson(out);
        expect(parsed.map(s => s.name)).toEqual(["Brief", "Revenue", "Orders"]);
        const rev = parsed.find(s => s.name === "Revenue") as Record<string, unknown>;
        expect(rev.kind).toBe("sql");
        expect(rev.profile).toBe("genie-finance");
        const orders = parsed.find(s => s.name === "Orders") as Record<string, unknown>;
        expect(orders.profile).toBeUndefined(); // unset profile not persisted
    });

    it("round-trips SQL sections through read -> merge unchanged", () => {
        const json = JSON.stringify([
            { name: "Revenue", kind: "sql", sql: "select 1", resultRender: "kpi", profile: "p1" },
        ]);
        const rows = readSqlSections(json);
        const out = mergeSqlSectionsIntoCustomSectionsJson(rows, json);
        expect(readSqlSections(out)).toEqual(rows);
    });
});
