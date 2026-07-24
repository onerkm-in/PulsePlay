import { describe, it, expect } from "vitest";
import { bindDecisionEvidenceSql, priorMonthKey } from "../decisionEvidenceSql";

describe("priorMonthKey — mirrors detect.py YYYYMM arithmetic", () => {
    it("steps back within a year", () => {
        expect(priorMonthKey(202512)).toBe(202511);
        expect(priorMonthKey(202506)).toBe(202505);
    });
    it("wraps January to the prior December", () => {
        expect(priorMonthKey(202601)).toBe(202512);
        expect(priorMonthKey(202401)).toBe(202312);
    });
});

describe("bindDecisionEvidenceSql", () => {
    it("binds :mk and :pmk from a string month_key (the API returns it as a string)", () => {
        const r = bindDecisionEvidenceSql({
            evidence_sql: "SELECT * FROM t WHERE month_key = :mk OR month_key = :pmk",
            month_key: "202512",
        });
        expect(r.ok).toBe(true);
        expect(r.sql).toBe("SELECT * FROM t WHERE month_key = 202512 OR month_key = 202511");
    });

    it("binds quoted category/region string params with escaping", () => {
        const r = bindDecisionEvidenceSql({
            evidence_sql: "SELECT * FROM t WHERE category = :category AND region = :region",
            category: "O'Brien",
            region: "APAC",
        });
        expect(r.ok).toBe(true);
        expect(r.sql).toBe("SELECT * FROM t WHERE category = 'O''Brien' AND region = 'APAC'");
    });

    it("does not bind inside ::casts and respects word boundaries", () => {
        const r = bindDecisionEvidenceSql({
            evidence_sql: "SELECT x::string, :mk FROM t WHERE mkey = 1",
            month_key: 202512,
        });
        expect(r.ok).toBe(true);
        // ::string cast untouched; bare column mkey untouched; :mk bound.
        expect(r.sql).toContain("x::string");
        expect(r.sql).toContain("mkey = 1");
        expect(r.sql).toContain("202512");
    });

    it("FAIL-CLOSES when a parameter can't be derived (never sends a broken query)", () => {
        const r = bindDecisionEvidenceSql({
            evidence_sql: "SELECT * FROM t WHERE month_key = :mk AND on_time < :thr",
            month_key: 202512,
        });
        expect(r.ok).toBe(false);
        expect(r.unbound).toEqual(["thr"]);
        expect(r.error).toMatch(/thr/);
    });

    it("refuses empty evidence SQL", () => {
        expect(bindDecisionEvidenceSql({ evidence_sql: "" }).ok).toBe(false);
        expect(bindDecisionEvidenceSql({ evidence_sql: null }).ok).toBe(false);
    });

    it("a param-free evidence query binds to itself unchanged", () => {
        const sql = "SELECT COUNT(DISTINCT agent_name) FROM main.x.agents_clean";
        const r = bindDecisionEvidenceSql({ evidence_sql: sql });
        expect(r.ok).toBe(true);
        expect(r.sql).toBe(sql);
    });
});
