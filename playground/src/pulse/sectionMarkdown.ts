// playground/src/pulse/sectionMarkdown.ts
//
// Author-friendly markdown <-> insightsCustomSections bridge (2026-05-28).
//
// Authors define AI Insights sections the way they think about them — a
// markdown heading per section, with the per-section AI prompt as the body:
//
//     ## Executive Brief
//     Summarize revenue + margin vs prior year in two sentences.
//
//     ## Category Mix
//     Rank category contribution by sales and margin.
//
// Each `## <Name>` becomes a card on the AI Insights screen; the body is the
// instruction that drives the AI for that section. This is purely an INPUT
// convenience over the existing `insightsCustomSections` JSON the runtime
// already consumes (see visualHelpers.parseCustomSections) — no runtime
// change. SQL / config-item sections (kind:"sql") are authored structurally
// elsewhere; this bridge PRESERVES them untouched when round-tripping.

export interface MarkdownSection {
    name: string;
    instruction: string;
}

/** Parse `## <Name>` + body blocks into AI sections. Level-1 (`#`) and
 *  level-3+ (`###`) lines stay inside the body of their section (only `##`
 *  is a section boundary). Text before the first `##` is ignored. Sections
 *  with an empty name are dropped. Never throws. */
export function parseMarkdownSections(md: string): MarkdownSection[] {
    if (!md || !md.trim()) return [];
    const lines = md.split("\n");
    const sections: MarkdownSection[] = [];
    let current: { name: string; body: string[] } | null = null;
    for (const line of lines) {
        const h = line.match(/^##\s+(.+?)\s*$/); // exactly level-2
        if (h) {
            if (current) sections.push({ name: current.name, instruction: current.body.join("\n").trim() });
            current = { name: h[1].trim(), body: [] };
        } else if (current) {
            current.body.push(line);
        }
        // lines before the first `##` are ignored
    }
    if (current) sections.push({ name: current.name, instruction: current.body.join("\n").trim() });
    return sections.filter(s => s.name);
}

/** Render AI sections (name + instruction) back to markdown for editing. */
export function aiSectionsToMarkdown(sections: ReadonlyArray<MarkdownSection>): string {
    return sections
        .filter(s => s.name.trim())
        .map(s => `## ${s.name.trim()}${s.instruction.trim() ? `\n${s.instruction.trim()}` : ""}`)
        .join("\n\n");
}

interface RawSection {
    name?: string;
    title?: string;
    instruction?: string;
    kind?: string;
    [k: string]: unknown;
}

/** Read the canonical insightsCustomSections JSON into a typed array.
 *  Returns [] on any parse failure (mirrors visualHelpers.parseCustomSections
 *  tolerance). */
export function readCustomSectionsJson(json: string | undefined | null): RawSection[] {
    if (!json || !json.trim()) return [];
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed.filter((s): s is RawSection => !!s && typeof s === "object") : [];
    } catch {
        return [];
    }
}

/** Extract just the AI sections (kind !== "sql") as markdown — used to seed
 *  the markdown editor from the stored JSON. */
export function customSectionsJsonToMarkdown(json: string | undefined | null): string {
    const ai = readCustomSectionsJson(json)
        .filter(s => String(s.kind ?? "ai").toLowerCase() !== "sql")
        .map(s => ({
            name: String(s.name ?? s.title ?? "").trim(),
            instruction: String(s.instruction ?? "").trim(),
        }));
    return aiSectionsToMarkdown(ai);
}

/** Count SQL/config-item sections in the stored JSON (so the markdown editor
 *  can tell the author "+ N SQL sections preserved"). */
export function countSqlSections(json: string | undefined | null): number {
    return readCustomSectionsJson(json).filter(s => String(s.kind ?? "ai").toLowerCase() === "sql").length;
}

/** Merge markdown-authored AI sections with the SQL sections already stored in
 *  the canonical JSON, returning the new JSON string. AI sections are REPLACED
 *  by the markdown content; SQL sections are PRESERVED in their original order
 *  after the AI sections. */
export function mergeMarkdownIntoCustomSectionsJson(md: string, existingJson: string | undefined | null): string {
    const aiSections = parseMarkdownSections(md).map(s => ({
        name: s.name,
        instruction: s.instruction,
        kind: "ai" as const,
    }));
    const sqlSections = readCustomSectionsJson(existingJson).filter(
        s => String(s.kind ?? "ai").toLowerCase() === "sql",
    );
    const merged = [...aiSections, ...sqlSections];
    return merged.length > 0 ? JSON.stringify(merged, null, 2) : "";
}

/* ── SQL / config-item sections ───────────────────────────────────── */

export type SqlResultRender = "kpi" | "table" | "chart";

export interface SqlSectionInput {
    name: string;
    sql: string;
    resultRender: SqlResultRender;
    /** Optional target connector profile this section's SQL runs against —
     *  a Genie space's warehouse OR a direct/underlying-data warehouse. When
     *  empty, the section uses the active profile. (2026-05-28) */
    profile?: string;
}

/** Extract the SQL/config-item sections from the canonical JSON. */
export function readSqlSections(json: string | undefined | null): SqlSectionInput[] {
    return readCustomSectionsJson(json)
        .filter(s => String(s.kind ?? "ai").toLowerCase() === "sql")
        .map(s => {
            const r = s as Record<string, unknown>;
            const render = String(r.resultRender ?? "kpi").toLowerCase();
            const profile = typeof r.profile === "string" ? r.profile.trim() : "";
            return {
                name: String(s.name ?? s.title ?? "").trim(),
                sql: String(r.sql ?? ""),
                resultRender: (render === "table" || render === "chart" ? render : "kpi") as SqlResultRender,
                ...(profile ? { profile } : {}),
            };
        });
}

/** Merge structured SQL sections back into the canonical JSON, PRESERVING the
 *  AI sections (which keep their leading position). Empty-named SQL rows are
 *  dropped. Inverse of mergeMarkdownIntoCustomSectionsJson. */
export function mergeSqlSectionsIntoCustomSectionsJson(
    sqlSections: ReadonlyArray<SqlSectionInput>,
    existingJson: string | undefined | null,
): string {
    const aiSections = readCustomSectionsJson(existingJson).filter(
        s => String(s.kind ?? "ai").toLowerCase() !== "sql",
    );
    const sql = sqlSections
        .filter(s => s.name.trim())
        .map(s => ({
            name: s.name.trim(),
            sql: s.sql,
            kind: "sql" as const,
            resultRender: s.resultRender,
            // Only persist `profile` when set, to keep the JSON lean and let
            // unset sections inherit the active profile at runtime.
            ...(s.profile && s.profile.trim() ? { profile: s.profile.trim() } : {}),
        }));
    const merged = [...aiSections, ...sql];
    return merged.length > 0 ? JSON.stringify(merged, null, 2) : "";
}
