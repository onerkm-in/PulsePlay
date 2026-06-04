import { describe, it, expect } from "vitest";
import { shouldShowGroundingAdvisory } from "../groundingAdvisory";

// These tests pin the FAIL-CLOSED contract for the AI Insights grounding
// advisory and document the original fail-open vector they replace.
//
// The original detector computed `grounded = !!sqlQuery || rows || traces.some(t => !!t.sql || rows)`
// and suppressed the advisory when `grounded` was true. That meant a SQL-looking
// STRING with no real rows — which a Foundation Model (the default live backend)
// can emit in its markdown — was enough to HIDE the advisory, so fabricated KPIs
// rendered as if measured. The cases below labelled "FAIL-OPEN" are exactly the
// payloads that used to trip it.

describe("shouldShowGroundingAdvisory — fail-closed grounding check", () => {
    it("shows the advisory by default for a model-only briefing (no SQL, no rows)", () => {
        expect(
            shouldShowGroundingAdvisory({ status: "COMPLETED", stageTraces: [{ queryResult: null }] }),
        ).toBe(true);
    });

    it("FAIL-OPEN #1: a SQL string with NO rows must STILL show the advisory", () => {
        // The model emitted `SELECT ...` text → trace.sql populated, but no query
        // ever executed (queryResult null). The old logic saw `!!t.sql` and
        // suppressed; fail-closed shows it.
        const adversarial = {
            status: "COMPLETED",
            stageTraces: [
                { sql: "SELECT category, SUM(sales) FROM t GROUP BY 1", queryResult: null },
            ] as unknown as GroundingTraces,
        };
        expect(shouldShowGroundingAdvisory(adversarial)).toBe(true);
    });

    it("FAIL-OPEN #2: a top-level sqlQuery string with NO rows must STILL show the advisory", () => {
        const adversarial = {
            status: "COMPLETED",
            sqlQuery: "SELECT 1",
            queryResult: null,
        } as unknown as GroundingTraces;
        expect(shouldShowGroundingAdvisory(adversarial)).toBe(true);
    });

    it("FAIL-OPEN #3: an empty rows array (rows-like but no data) must STILL show the advisory", () => {
        expect(
            shouldShowGroundingAdvisory({ status: "COMPLETED", queryResult: { rows: [] } }),
        ).toBe(true);
    });

    it("FAIL-OPEN #4: no stage traces at all must STILL show the advisory (absence ≠ grounding)", () => {
        expect(shouldShowGroundingAdvisory({ status: "COMPLETED" })).toBe(true);
        expect(shouldShowGroundingAdvisory({ status: "COMPLETED", stageTraces: [] })).toBe(true);
    });

    it("SUPPRESSES only when real rows confirm a grounded query (top-level)", () => {
        expect(
            shouldShowGroundingAdvisory({
                status: "COMPLETED",
                queryResult: { rows: [["Technology", 836154]] },
            }),
        ).toBe(false);
    });

    it("SUPPRESSES when any stage trace carries real rows (Genie/PBI multi-row briefing)", () => {
        expect(
            shouldShowGroundingAdvisory({
                status: "COMPLETED",
                stageTraces: [
                    { queryResult: null },
                    { queryResult: { rows: [["Q1", 0.1335], ["Q2", 0.1241]] } },
                ],
            }),
        ).toBe(false);
    });

    it("does NOT show on a FAILED run (the failure card covers it)", () => {
        expect(
            shouldShowGroundingAdvisory({ status: "FAILED", stageTraces: [{ queryResult: null }] }),
        ).toBe(false);
    });

    it("does NOT show when there is no result yet", () => {
        expect(shouldShowGroundingAdvisory(null)).toBe(false);
        expect(shouldShowGroundingAdvisory(undefined)).toBe(false);
    });

    it("a SQL string PLUS real rows suppresses (real grounded query) — SQL alone never decides", () => {
        expect(
            shouldShowGroundingAdvisory({
                status: "COMPLETED",
                stageTraces: [{ sql: "SELECT ...", queryResult: { rows: [["x", 1]] } }] as unknown as GroundingTraces,
            }),
        ).toBe(false);
    });
});

// Loose alias so the adversarial fixtures can carry extra fields (sql/sqlQuery)
// that the helper deliberately ignores, without fighting the structural type.
type GroundingTraces = Parameters<typeof shouldShowGroundingAdvisory>[0];
