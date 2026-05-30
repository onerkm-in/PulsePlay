import { describe, it, expect } from "vitest";
import { entryToAIResultEnvelope, type CompletedEntrySnapshot } from "../entryToEnvelope";

const VALID_ATTESTATION = Object.freeze({
    enforced: true,
    authority: "mock",
    subjectRef: "user:smokefixture",
    requestId: "req-abc-123",
    policyVersion: "g3-v1",
});

describe("entryToAIResultEnvelope — id selection", () => {
    it("uses messageId when present", () => {
        const env = entryToAIResultEnvelope({
            messageId: "smoke-msg-abc123",
            fallbackId: "fallback-1",
        });
        expect(env.id).toBe("smoke-msg-abc123");
    });

    it("falls back when messageId is missing", () => {
        const env = entryToAIResultEnvelope({ fallbackId: "fallback-1" });
        expect(env.id).toBe("fallback-1");
    });

    it("falls back when messageId is empty/whitespace", () => {
        expect(entryToAIResultEnvelope({ messageId: "", fallbackId: "fallback-1" }).id).toBe("fallback-1");
        expect(entryToAIResultEnvelope({ messageId: "   ", fallbackId: "fallback-1" }).id).toBe("fallback-1");
    });
});

describe("entryToAIResultEnvelope — answer-only payload", () => {
    it("omits schema/rows when no queryResult is present", () => {
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            answer: "Smoke answer.",
        });
        expect(env.answer).toBe("Smoke answer.");
        expect(env.schema).toBeUndefined();
        expect(env.rows).toBeUndefined();
    });

    it("omits schema/rows when columns or rows are empty", () => {
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            queryResult: { columns: [], rows: [] },
        });
        expect(env.schema).toBeUndefined();
        expect(env.rows).toBeUndefined();
    });

    it("drops blank/whitespace-only answer + question + sql", () => {
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            question: "   ",
            answer: "",
            sqlQuery: "  \n  ",
        });
        expect(env.question).toBeUndefined();
        expect(env.answer).toBeUndefined();
        expect(env.sql).toBeUndefined();
    });
});

describe("entryToAIResultEnvelope — rows + schema", () => {
    it("widens string[] columns into AIResultColumn[] with names only", () => {
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            queryResult: {
                columns: ["period", "revenue"],
                rows: [
                    ["Q1", 100],
                    ["Q2", 200],
                ],
            },
        });
        expect(env.schema).toEqual([{ name: "period" }, { name: "revenue" }]);
    });

    it("coerces non-primitive cells via String() and preserves primitives + null", () => {
        const date = new Date("2026-01-15");
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            queryResult: {
                columns: ["a", "b", "c", "d", "e"],
                rows: [["string", 42, true, null, date]],
            },
        });
        expect(env.rows).toEqual([["string", 42, true, null, String(date)]]);
    });

    it("treats undefined cells the same as null", () => {
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            queryResult: {
                columns: ["a"],
                rows: [[undefined as unknown]],
            },
        });
        expect(env.rows?.[0][0]).toBeNull();
    });
});

describe("entryToAIResultEnvelope — governance forwarding", () => {
    it("forwards a valid attestation", () => {
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            governance: VALID_ATTESTATION,
        });
        expect(env.governance).toMatchObject({
            enforced: true,
            authority: "mock",
            subjectRef: "user:smokefixture",
        });
    });

    it("drops invalid governance shapes silently", () => {
        const env = entryToAIResultEnvelope({
            fallbackId: "f-1",
            governance: { enforced: "yes-please" } as unknown,
        });
        expect(env.governance).toBeUndefined();
    });

    it("drops missing governance silently", () => {
        const env = entryToAIResultEnvelope({ fallbackId: "f-1" });
        expect(env.governance).toBeUndefined();
    });
});

describe("entryToAIResultEnvelope — end-to-end smoke fixture shape", () => {
    it("builds the canonical chart envelope the SS2 smoke expects", () => {
        const env = entryToAIResultEnvelope({
            messageId: "smoke-msg-deadbeef0001",
            fallbackId: "1",
            question: "Quarterly trend?",
            answer: "Smoke fixture answer to: \"Quarterly trend?\"",
            sqlQuery: "SELECT period, revenue FROM fixtures.smoke",
            queryResult: {
                columns: ["period", "revenue"],
                rows: [
                    ["Q1", 100],
                    ["Q2", 200],
                    ["Q3", 300],
                    ["Q4", 250],
                ],
            },
            governance: VALID_ATTESTATION,
        });
        expect(env.id).toBe("smoke-msg-deadbeef0001");
        expect(env.question).toBe("Quarterly trend?");
        expect(env.answer).toContain("Smoke fixture answer to:");
        expect(env.sql).toContain("SELECT period");
        expect(env.schema?.length).toBe(2);
        expect(env.rows?.length).toBe(4);
        expect(env.governance?.enforced).toBe(true);
    });
});
