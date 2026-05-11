// Wave 35 Phase 1 — Section-kind discriminator for the upcoming Custom SQL
// Authoring Mode. Phase 1 ships TYPES + GUARDS + LEGACY-MIGRATION HELPER ONLY.
// The executor, KPI renderer, editor UI, and EXPLAIN-based validation gates
// land in Phase 2-3 (see docs/WAVE_35_SPEC.md).
//
// Design contract:
//   - Existing `insightsCustomSections` JSON in deployed reports does NOT
//     carry a `kind` field. `normalizeSection()` MUST treat any input
//     missing `kind` as kind:"ai" so legacy reports keep parsing.
//   - Phase 1 validator is intentionally lightweight (non-empty + length
//     cap + DML keyword check + paren balance). The richer EXPLAIN dry-run
//     against the warehouse lands in Phase 2.

/** Section discriminator. */
export type SectionKind = "ai" | "sql";

/** Existing prompt-driven Insights section (legacy + new). */
export interface AiSection {
    kind: "ai";
    title: string;
    promptInstructions: string;
}

/** Phase 2+ Custom SQL section. Phase 1 only persists/parses the shape. */
export interface SqlSection {
    kind: "sql";
    title: string;
    sql: string;
    resultRender: "kpi" | "table" | "chart";
    format?: {
        numberStyle?: "currency" | "percent" | "compact";
        showPriorPeriodDelta?: boolean;
    };
}

export type AnySection = AiSection | SqlSection;

/** Phase 1 SQL length cap — guards against pathological pasted blobs.
 *  Phase 2 may relax once the editor enforces saner per-field limits. */
export const SQL_SECTION_MAX_LENGTH = 8000;

/** DML / DDL keywords that must never appear in a SQL section body. The
 *  Section H runtime layer already blocks DML at the proxy, but we surface
 *  a friendly editor-time error so authors don't paste destructive SQL by
 *  accident. Mirrors the regex in src/settings.ts runtime sanitization. */
const FORBIDDEN_SQL_KEYWORDS = /\b(?:DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER|GRANT|REVOKE|MERGE|CREATE|REPLACE)\b/i;

/** Type guard: AI section. */
export function isAiSection(s: AnySection | null | undefined): s is AiSection {
    return !!s && (s as AnySection).kind === "ai";
}

/** Type guard: SQL section. */
export function isSqlSection(s: AnySection | null | undefined): s is SqlSection {
    return !!s && (s as AnySection).kind === "sql";
}

/**
 * Migrate an unknown input (legacy or new shape) into a typed section.
 *
 * - Legacy input (no `kind` field, or non-string `kind`): coerces to
 *   AiSection. `title` defaults to ""; `promptInstructions` is read from
 *   `promptInstructions` (preferred) or `prompt` (older pre-v34 alias).
 * - kind:"sql": coerces to SqlSection with safe defaults (`resultRender`
 *   defaults to "kpi"; missing `sql` becomes "").
 *
 * NEVER throws — all inputs return a section. Validation is the caller's
 * responsibility via `validateSqlSection`.
 */
export function normalizeSection(input: unknown): AnySection {
    const obj = (input && typeof input === "object") ? (input as Record<string, unknown>) : {};
    const rawKind = typeof obj.kind === "string" ? obj.kind.toLowerCase() : "";
    const title = typeof obj.title === "string" ? obj.title : "";

    if (rawKind === "sql") {
        const sql = typeof obj.sql === "string" ? obj.sql : "";
        const renderRaw = typeof obj.resultRender === "string" ? obj.resultRender : "";
        const resultRender: SqlSection["resultRender"] =
            renderRaw === "table" || renderRaw === "chart" ? renderRaw : "kpi";
        const out: SqlSection = { kind: "sql", title, sql, resultRender };
        if (obj.format && typeof obj.format === "object") {
            const f = obj.format as Record<string, unknown>;
            const ns = typeof f.numberStyle === "string" ? f.numberStyle : "";
            const fmt: SqlSection["format"] = {};
            if (ns === "currency" || ns === "percent" || ns === "compact") fmt.numberStyle = ns;
            if (typeof f.showPriorPeriodDelta === "boolean") fmt.showPriorPeriodDelta = f.showPriorPeriodDelta;
            out.format = fmt;
        }
        return out;
    }

    // Default / legacy → AI section.
    const promptInstructions =
        typeof obj.promptInstructions === "string" ? obj.promptInstructions :
        typeof obj.prompt === "string" ? obj.prompt :
        "";
    return { kind: "ai", title, promptInstructions };
}

/**
 * Phase 1 SQL section validator. Returns an array of human-readable error
 * strings; empty array means the section passes the lightweight gate.
 *
 * Checks:
 *   1. SQL non-empty after trim.
 *   2. SQL length under SQL_SECTION_MAX_LENGTH.
 *   3. No DML/DDL keywords (DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER,
 *      GRANT, REVOKE, MERGE, CREATE, REPLACE).
 *   4. Parenthesis balance.
 *   5. Title non-empty (UI consistency with AI sections).
 *
 * Phase 2 will add EXPLAIN-based dry-run validation against the warehouse.
 */
export function validateSqlSection(s: SqlSection): string[] {
    const errors: string[] = [];
    if (!s || s.kind !== "sql") {
        errors.push("Not a SQL section.");
        return errors;
    }
    const title = (s.title || "").trim();
    if (!title) errors.push("Section title is required.");

    const sql = (s.sql || "").trim();
    if (!sql) {
        errors.push("SQL body is empty.");
        return errors; // remaining checks meaningless
    }
    if (sql.length > SQL_SECTION_MAX_LENGTH) {
        errors.push(`SQL exceeds maximum length of ${SQL_SECTION_MAX_LENGTH} characters.`);
    }
    if (FORBIDDEN_SQL_KEYWORDS.test(sql)) {
        errors.push("SQL contains a forbidden DML/DDL keyword (DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER, GRANT, REVOKE, MERGE, CREATE, REPLACE). Custom SQL sections must be read-only SELECT statements.");
    }
    let depth = 0;
    for (let i = 0; i < sql.length; i++) {
        const ch = sql.charCodeAt(i);
        if (ch === 40 /* '(' */) depth++;
        else if (ch === 41 /* ')' */) {
            depth--;
            if (depth < 0) { errors.push("SQL has unbalanced parentheses (extra closing)."); break; }
        }
    }
    if (depth > 0) errors.push("SQL has unbalanced parentheses (unclosed opening).");
    return errors;
}
