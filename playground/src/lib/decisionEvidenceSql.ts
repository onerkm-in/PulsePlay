// playground/src/lib/decisionEvidenceSql.ts
//
// The decision engine's evidence SQL is a PARAMETERIZED template — it carries
// named bind parameters (:mk = the finding's month_key, :pmk = the prior
// month, and sometimes :category / :region / :thr) that the Python detector
// binds server-side before running. The canvas refreshes SQL through
// /sql/preview, which does NOT bind parameters, so pinning the raw template
// fails with UNBOUND_SQL_PARAMETER.
//
// This binds the parameters we can DERIVE from the prompt's own fields, using
// the SAME arithmetic the engine uses (detect.py), then FAIL-CLOSES: if any
// `:param` survives, we refuse the pin rather than send a broken query. Only
// integer month-keys and quoted string literals are substituted — no arbitrary
// expression injection.

interface EvidenceBindFields {
    evidence_sql?: string | null;
    // The prompt store returns month_key as a STRING ("202512") over JSON even
    // though it's a YYYYMM integer — accept either.
    month_key?: number | string;
    category?: string | null;
    region?: string | null;
}

/** Previous month_key in YYYYMM form — mirrors detect.py:
 *  `mk - 1 if mk % 100 > 1 else (mk // 100 - 1) * 100 + 12`. */
export function priorMonthKey(mk: number): number {
    return mk % 100 > 1 ? mk - 1 : Math.floor(mk / 100 - 1) * 100 + 12;
}

/** Single-quote-escape a string for a SQL literal. */
function sqlString(v: string): string {
    return `'${v.replace(/'/g, "''")}'`;
}

/** Replace a `:name` bind parameter (not preceded by `:` — avoids `::cast`).
 *  Word-boundary end so `:mk` never matches inside `:mkey`. */
function bindParam(sql: string, name: string, literal: string): string {
    const re = new RegExp(`(?<!:):${name}\\b`, "g");
    return sql.replace(re, literal);
}

export interface BoundEvidence {
    ok: boolean;
    sql?: string;
    /** Params still unbound after substitution (present only when ok is false). */
    unbound?: string[];
    error?: string;
}

/**
 * Bind a decision prompt's evidence SQL into a runnable, parameter-free query.
 * Returns ok:false (with the offending param names) when a parameter can't be
 * derived from the prompt — the caller must not run a partially-bound query.
 */
export function bindDecisionEvidenceSql(prompt: EvidenceBindFields): BoundEvidence {
    const raw = (prompt.evidence_sql || "").trim();
    if (!raw) return { ok: false, error: "This decision has no evidence SQL to pin." };

    let sql = raw;
    const mk = Number(prompt.month_key);
    if (Number.isFinite(mk) && mk > 0) {
        sql = bindParam(sql, "mk", String(mk));
        sql = bindParam(sql, "pmk", String(priorMonthKey(mk)));
    }
    if (prompt.category) sql = bindParam(sql, "category", sqlString(prompt.category));
    if (prompt.region) sql = bindParam(sql, "region", sqlString(prompt.region));

    // Fail-closed: any surviving `:name` (e.g. a :thr threshold we don't carry)
    // means we'd send a broken query. Refuse, and name what's missing.
    const remaining = Array.from(new Set(
        (sql.match(/(?<!:):[a-zA-Z_][a-zA-Z0-9_]*\b/g) || []).map(m => m.slice(1)),
    ));
    if (remaining.length) {
        return {
            ok: false,
            unbound: remaining,
            error: `Can't pin — this evidence query needs parameters PulsePlay can't derive (${remaining.join(", ")}).`,
        };
    }
    return { ok: true, sql };
}
