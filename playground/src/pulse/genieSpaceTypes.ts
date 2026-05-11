/**
 * genieSpaceTypes.ts
 *
 * TypeScript shapes for the Databricks Genie `serialized_space` payload.
 * Verified against a live HSE space via:
 *
 *   databricks genie get-space {space_id} --include-serialized-space -o json
 *
 * The serialized_space is delivered as a JSON-string blob inside the
 * envelope returned by GET /api/2.0/genie/spaces/{id}. Updates use
 * PATCH-style: full-replacement of the serialized_space string.
 *
 * Reference: https://docs.databricks.com/api/workspace/genie
 *            https://docs.databricks.com/aws/en/genie/trusted-assets
 */

/** Envelope shape — what the GET endpoint returns. */
export interface GenieSpaceEnvelope {
    space_id: string;
    title: string;
    description?: string;
    parent_path?: string;
    warehouse_id: string;
    /** JSON-string blob; parse to get the SerializedSpace structure. */
    serialized_space: string;
}

/** Top-level shape of the parsed serialized_space (v2). */
export interface SerializedSpace {
    version: 2;
    config: {
        sample_questions?: SampleQuestion[];
    };
    data_sources: {
        tables: SpaceTable[];
        metric_views?: SpaceMetricView[];
    };
    instructions: {
        text_instructions?: TextInstruction[];
        example_question_sqls?: ExampleQuestionSQL[];
    };
}

export interface SampleQuestion {
    /** 32-char lowercase hex (UUID without dashes). */
    id: string;
    /** Array form is what the API returns; usually a single-element array. */
    question: string[];
}

export interface SpaceTable {
    /** Fully-qualified UC identifier: catalog.schema.table */
    identifier: string;
    /** Free-form description, also array form. */
    description?: string[];
    /** Column-level configs (optional v2 extension). */
    column_configs?: ColumnConfig[];
}

export interface SpaceMetricView {
    identifier: string;
    description?: string[];
}

export interface ColumnConfig {
    name: string;
    description?: string;
}

export interface TextInstruction {
    /** 32-char lowercase hex. */
    id: string;
    /** Array form — segments may render as paragraphs. */
    content: string[];
}

export interface ExampleQuestionSQL {
    /** 32-char lowercase hex. */
    id: string;
    /** Natural-language form of the question this SQL answers. */
    question: string;
    /** Databricks SQL (Spark SQL dialect). Read-only queries only. */
    sql: string;
    /** Optional parameter declarations bound by `:name` in the SQL. */
    parameters?: ExampleParameter[];
    /** Optional guidance shown to Genie about when to apply this template. */
    usage_guidance?: string;
}

export type ExampleParameterType = "STRING" | "DATE" | "DATE_AND_TIME" | "NUMERIC_DECIMAL" | "NUMERIC_INTEGER";

export interface ExampleParameter {
    /** SQL bind name (used as `:keyword` in the SQL). */
    keyword: string;
    /** Human-readable label shown in the Databricks UI. */
    display_name: string;
    type: ExampleParameterType;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

let fallbackHexCounter = 0;

/** Generate a 32-char lowercase hex ID — what the upstream Genie space expects for instruction IDs.
 *  Browser crypto-based; falls back to a time/counter ID for older sandboxes. */
export function generateGenieHexId(): string {
    const provider = globalThis.crypto || (globalThis as { msCrypto?: Crypto }).msCrypto;
    if (provider?.getRandomValues) {
        const arr = new Uint8Array(16);
        provider.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    fallbackHexCounter = (fallbackHexCounter + 1) & 0xffff_ffff;
    const now = Date.now().toString(16).padStart(12, "0").slice(-12);
    const perf = Math.floor((globalThis.performance?.now() ?? 0) * 1000).toString(16).padStart(8, "0").slice(-8);
    const counter = fallbackHexCounter.toString(16).padStart(12, "0").slice(-12);
    return `${now}${perf}${counter}`.slice(0, 32).padEnd(32, "0");
}

/** Confirm a string is a valid 32-char lowercase hex. */
export function isValidGenieHexId(id: string): boolean {
    return /^[0-9a-f]{32}$/.test(id);
}

/** Extract bind parameter names from an example SQL — every `:name` token. */
export function extractParameterKeywords(sql: string): string[] {
    // Match :word boundaries but skip ::cast or :: in window functions.
    const matches = sql.match(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of matches) {
        const name = m.slice(1);
        if (!seen.has(name)) {
            seen.add(name);
            out.push(name);
        }
    }
    return out;
}

/** Cap-aware count of "instruction slots" used. The upstream Genie space limits the sum of
 *  text_instructions + example_question_sqls + (sql_functions, not modeled
 *  here) to 100 per space. Used by Section G's limit guard. */
export function countInstructionSlots(s: SerializedSpace): number {
    const ti = s.instructions.text_instructions?.length ?? 0;
    const ex = s.instructions.example_question_sqls?.length ?? 0;
    return ti + ex;
}

/** Parse a serialized_space string into the typed shape. Returns null
 *  on parse failure. */
export function parseSerializedSpace(raw: string): SerializedSpace | null {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || parsed.version !== 2) return null;
        // Defensive: ensure required nested objects exist even if the API
        // omits empties.
        return {
            version: 2,
            config: parsed.config ?? {},
            data_sources: {
                tables: parsed.data_sources?.tables ?? [],
                metric_views: parsed.data_sources?.metric_views,
            },
            instructions: {
                text_instructions: parsed.instructions?.text_instructions ?? [],
                example_question_sqls: parsed.instructions?.example_question_sqls ?? [],
            },
        };
    } catch {
        return null;
    }
}

/** Stringify a SerializedSpace for the update-space write path. Sorted
 *  for deterministic output (helps with diff display + tests). */
export function stringifySerializedSpace(s: SerializedSpace): string {
    return JSON.stringify(s, null, 2);
}
