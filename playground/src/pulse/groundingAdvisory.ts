// playground/src/pulse/groundingAdvisory.ts
//
// Fail-CLOSED grounding check for the AI Insights "Illustrative — not grounded
// in your data" advisory (#14).
//
// Background: the advisory exists because a model-only connector (e.g. a
// Foundation Model serving endpoint — the default live backend) writes
// plausible-looking KPIs with no data access. If those render with the same
// chrome as a real Genie/Power BI briefing, the user can't tell measured from
// fabricated.
//
// The ORIGINAL detector failed OPEN: it suppressed the advisory whenever the
// response "looked grounded" — specifically when ANY stage carried a SQL string
// (`!!t.sql`) or when there were no stage traces at all. Both are forgeable by a
// language model: an LLM can emit a ```sql block in its markdown, and an absent
// trace proves nothing. So a fabricated answer could trip the heuristic and
// render UNLABELLED.
//
// This helper inverts the rule to fail CLOSED: the advisory shows by DEFAULT and
// is suppressed ONLY when grounding is POSITIVELY confirmed by a trusted signal —
// real structured result ROWS (`queryResult.rows`). Rows are populated by the
// proxy from an actual query execution (Genie attachments / warehouse / DAX
// result), never synthesised from LLM markdown, so they cannot be forged by the
// model the way a SQL STRING can. A SQL string is therefore explicitly NOT a
// grounding signal here.
//
// Trade-off (intentional, fail-closed direction): a grounded briefing that
// somehow returns zero rows on every stage (e.g. an all-scalar Power BI run that
// leaves `queryResult` null) would over-warn. That is the safe direction — the
// product would rather say "illustrative" on a real briefing than present
// fabricated figures as measured. A multi-stage briefing realistically returns
// rows on at least one stage (KPI snapshot / trend), so this is a corner case.

/** Minimal shape this check reads — a subset of the insights result view-model
 *  plus its per-stage traces. Typed structurally so we don't depend on the large
 *  ChatMessageViewModel type. */
export interface GroundingCheckInput {
    /** Run status — a FAILED run renders its own error card, not the advisory. */
    status?: string;
    /** Top-level query result for single-shot answers (persisted in the cache). */
    queryResult?: { rows?: unknown[] } | null;
    /** Per-stage traces for staged briefings (memory-only; absent for cached runs,
     *  which is why the top-level `queryResult` is also checked). */
    stageTraces?: ReadonlyArray<{ queryResult?: { rows?: unknown[] } | null } | null | undefined>;
}

function rowsPresent(qr: { rows?: unknown[] } | null | undefined): boolean {
    return !!qr && Array.isArray(qr.rows) && qr.rows.length > 0;
}

/**
 * Returns true when the "Illustrative — not grounded" advisory should be shown.
 *
 * Fail-closed contract:
 *  - no result yet                        → false (nothing to annotate)
 *  - status === "FAILED"                  → false (the failure card covers it)
 *  - real result rows on any stage/top    → false (grounding POSITIVELY confirmed)
 *  - everything else (incl. SQL-only,     → TRUE  (default to the advisory)
 *    no-rows, or no-trace responses)
 *
 * A SQL string is deliberately ignored: it is forgeable by a language model and
 * was the original fail-open vector.
 */
export function shouldShowGroundingAdvisory(r: GroundingCheckInput | null | undefined): boolean {
    if (!r) return false;
    if (r.status === "FAILED") return false;

    const groundingConfirmed =
        rowsPresent(r.queryResult) ||
        (Array.isArray(r.stageTraces) && r.stageTraces.some((t) => rowsPresent(t?.queryResult)));

    // Fail closed: advise UNLESS a real grounded source was positively confirmed.
    return !groundingConfirmed;
}
