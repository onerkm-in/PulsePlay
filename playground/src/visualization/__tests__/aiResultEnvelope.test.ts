import { describe, expect, it } from "vitest";
import {
    aiResultRowsToObjects,
    createAIResultEnvelope,
    isAIResultEnvelope,
    type AIResultEnvelope,
} from "../aiResultEnvelope";

const sampleEnvelope: AIResultEnvelope = {
    id: "result-1",
    question: "Sales by category",
    answer: "Technology leads.",
    schema: [
        { name: "category", type: "STRING", role: "dimension" },
        { name: "sales", type: "DECIMAL", role: "measure" },
    ],
    rows: [
        ["Technology", 836154.03],
        ["Furniture", 741999.8],
    ],
    sql: "SELECT category, SUM(sales) AS sales FROM t GROUP BY category",
    sourceRef: {
        kind: "metric-view",
        fullName: "main.sales.category_metrics",
        warehouseId: "wh-1",
        displayName: "Category sales",
        governance: { requiresAttestation: true },
    },
    governance: { queuedForG3: true },
    metadata: { connector: "genie" },
};

describe("AIResultEnvelope", () => {
    it("accepts and clones a valid sample envelope", () => {
        expect(isAIResultEnvelope(sampleEnvelope)).toBe(true);
        const cloned = createAIResultEnvelope(sampleEnvelope);
        expect(cloned).toEqual(sampleEnvelope);
        expect(cloned.rows).not.toBe(sampleEnvelope.rows);
        expect(cloned.schema).not.toBe(sampleEnvelope.schema);
    });

    it("rejects malformed envelopes at the trust boundary", () => {
        expect(isAIResultEnvelope({ ...sampleEnvelope, id: "" })).toBe(false);
        expect(isAIResultEnvelope({ ...sampleEnvelope, rows: [["ok", Symbol("bad")]] })).toBe(false);
        expect(isAIResultEnvelope({ ...sampleEnvelope, schema: [{ name: "" }] })).toBe(false);
        expect(isAIResultEnvelope({ ...sampleEnvelope, sourceRef: { kind: "raw-sql" } })).toBe(false);
    });

    it("round-trips rows to named objects deterministically", () => {
        expect(aiResultRowsToObjects(sampleEnvelope)).toEqual([
            { category: "Technology", sales: 836154.03 },
            { category: "Furniture", sales: 741999.8 },
        ]);
    });

    it("fills missing cells as null when rows are shorter than schema", () => {
        expect(aiResultRowsToObjects({
            id: "short-row",
            schema: [{ name: "a" }, { name: "b" }],
            rows: [[1]],
        })).toEqual([{ a: 1, b: null }]);
    });
});
