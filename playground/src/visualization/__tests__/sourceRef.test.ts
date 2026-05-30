// playground/src/visualization/__tests__/sourceRef.test.ts
//
// G2.5 — Contract tests for the Databricks source-ref module.
//
// Why these are strict
// ────────────────────
// Once shipped, every consumer (pack JSON loader, proxy router, audit
// logger, host UI picker) trusts `isDatabricksSourceRef` as the
// validation boundary. A guard that lets a malformed ref through
// silently corrupts downstream governance attestation in G3 — these
// tests are the contract.

import { describe, expect, it } from "vitest";
import {
    DATABRICKS_SOURCE_REF_KINDS,
    isDatabricksSourceRef,
    isGenieSpaceSourceRef,
    isMetricViewSourceRef,
    isUcFunctionSourceRef,
    isViewSourceRef,
    isTableSourceRef,
    sourceRefDisplayLabel,
    type DatabricksSourceRef,
    type DatabricksSourceRefKind,
} from "../sourceRef";

// ─── Fixtures: one valid ref per kind ──────────────────────────────────────

const validGenieSpace: DatabricksSourceRef = {
    kind: "genie-space",
    spaceId: "sp-abc-123",
    displayName: "Exec Q&A Space",
    governance: { requiresAttestation: true },
};

const validGenieSpaceWithWarehouse: DatabricksSourceRef = {
    kind: "genie-space",
    spaceId: "sp-abc-123",
    warehouseId: "wh-prod-1",
    displayName: "Exec Q&A Space",
    governance: { requiresAttestation: true },
};

const validMetricView: DatabricksSourceRef = {
    kind: "metric-view",
    fullName: "main.finance.revenue_metrics",
    warehouseId: "wh-prod-1",
    displayName: "Revenue metrics",
    governance: { requiresAttestation: true },
};

const validUcFunction: DatabricksSourceRef = {
    kind: "uc-function",
    fullName: "main.curated.top_customers",
    warehouseId: "wh-prod-1",
    displayName: "Top customers (parameterized)",
    parameters: [
        { name: "limit", type: "INT" },
        { name: "as_of", type: "DATE" },
    ],
    governance: { requiresAttestation: true },
};

const validUcFunctionWithoutParams: DatabricksSourceRef = {
    kind: "uc-function",
    fullName: "main.curated.refresh_summary",
    warehouseId: "wh-prod-1",
    displayName: "Refresh summary",
    governance: { requiresAttestation: true },
};

const validView: DatabricksSourceRef = {
    kind: "view",
    fullName: "main.curated.sales_q3",
    warehouseId: "wh-prod-1",
    displayName: "Sales Q3 curated",
    governance: { requiresAttestation: true },
};

const validTable: DatabricksSourceRef = {
    kind: "table",
    fullName: "main.raw.orders",
    warehouseId: "wh-prod-1",
    displayName: "Raw orders",
    governance: {
        requiresAttestation: true,
        warning: "raw-table-bypasses-curated-views",
    },
};

const ALL_VALID: ReadonlyArray<{ name: string; ref: DatabricksSourceRef }> = [
    { name: "genie-space (no warehouse)",   ref: validGenieSpace },
    { name: "genie-space (with warehouse)", ref: validGenieSpaceWithWarehouse },
    { name: "metric-view",                  ref: validMetricView },
    { name: "uc-function (with parameters)",   ref: validUcFunction },
    { name: "uc-function (no parameters)",     ref: validUcFunctionWithoutParams },
    { name: "view",                         ref: validView },
    { name: "table",                        ref: validTable },
];

// ─── Kind list ─────────────────────────────────────────────────────────────

describe("DATABRICKS_SOURCE_REF_KINDS", () => {
    it("contains exactly the five supported kinds", () => {
        expect(DATABRICKS_SOURCE_REF_KINDS).toEqual([
            "genie-space",
            "metric-view",
            "uc-function",
            "view",
            "table",
        ]);
    });

    it("has no duplicates", () => {
        const set = new Set<DatabricksSourceRefKind>(DATABRICKS_SOURCE_REF_KINDS);
        expect(set.size).toBe(DATABRICKS_SOURCE_REF_KINDS.length);
    });

    it("is frozen", () => {
        expect(Object.isFrozen(DATABRICKS_SOURCE_REF_KINDS)).toBe(true);
    });
});

// ─── isDatabricksSourceRef: happy paths ────────────────────────────────────

describe("isDatabricksSourceRef — accepts every valid variant", () => {
    for (const { name, ref } of ALL_VALID) {
        it(`accepts ${name}`, () => {
            expect(isDatabricksSourceRef(ref)).toBe(true);
        });
    }
});

// ─── isDatabricksSourceRef: failure modes ──────────────────────────────────

describe("isDatabricksSourceRef — rejects non-objects", () => {
    it.each([
        ["null",       null],
        ["undefined",  undefined],
        ["empty string", ""],
        ["number",     123],
        ["boolean",    true],
        ["array",      [{ kind: "metric-view" }]],
    ])("rejects %s", (_label, value) => {
        expect(isDatabricksSourceRef(value)).toBe(false);
    });
});

describe("isDatabricksSourceRef — rejects unknown / malformed kinds", () => {
    it("rejects an unknown kind", () => {
        expect(isDatabricksSourceRef({
            ...validMetricView,
            kind: "raw-sql",
        })).toBe(false);
    });

    it("rejects a missing kind", () => {
        const { kind: _kind, ...rest } = validMetricView as MetricViewLike;
        expect(isDatabricksSourceRef(rest)).toBe(false);
    });

    it("rejects a non-string kind", () => {
        expect(isDatabricksSourceRef({ ...validMetricView, kind: 42 })).toBe(false);
    });
});

describe("isDatabricksSourceRef — rejects missing required fields", () => {
    it("rejects metric-view without displayName", () => {
        const { displayName: _d, ...rest } = validMetricView as MetricViewLike;
        expect(isDatabricksSourceRef(rest)).toBe(false);
    });

    it("rejects metric-view with empty displayName", () => {
        expect(isDatabricksSourceRef({ ...validMetricView, displayName: "" })).toBe(false);
    });

    it("rejects metric-view without fullName", () => {
        const { fullName: _f, ...rest } = validMetricView as MetricViewLike;
        expect(isDatabricksSourceRef(rest)).toBe(false);
    });

    it("rejects metric-view without warehouseId", () => {
        const { warehouseId: _w, ...rest } = validMetricView as MetricViewLike;
        expect(isDatabricksSourceRef(rest)).toBe(false);
    });

    it("rejects metric-view without governance", () => {
        const { governance: _g, ...rest } = validMetricView as MetricViewLike;
        expect(isDatabricksSourceRef(rest)).toBe(false);
    });

    it("rejects genie-space without spaceId", () => {
        const { spaceId: _s, ...rest } = validGenieSpace as GenieSpaceLike;
        expect(isDatabricksSourceRef(rest)).toBe(false);
    });
});

describe("isDatabricksSourceRef — governance attestation requirement", () => {
    it("rejects governance with requiresAttestation: false", () => {
        expect(isDatabricksSourceRef({
            ...validMetricView,
            governance: { requiresAttestation: false } as unknown as { requiresAttestation: true },
        })).toBe(false);
    });

    it("rejects governance missing requiresAttestation", () => {
        expect(isDatabricksSourceRef({
            ...validMetricView,
            governance: {} as unknown as { requiresAttestation: true },
        })).toBe(false);
    });

    it("rejects governance as primitive", () => {
        expect(isDatabricksSourceRef({
            ...validMetricView,
            governance: true as unknown as { requiresAttestation: true },
        })).toBe(false);
    });
});

describe("isDatabricksSourceRef — table-specific warning is required", () => {
    it("rejects a table whose governance lacks the warning string", () => {
        expect(isDatabricksSourceRef({
            ...validTable,
            governance: { requiresAttestation: true } as unknown as typeof validTable.governance,
        })).toBe(false);
    });

    it("rejects a table whose warning is the wrong literal", () => {
        expect(isDatabricksSourceRef({
            ...validTable,
            governance: {
                requiresAttestation: true,
                warning: "some-other-warning",
            } as unknown as typeof validTable.governance,
        })).toBe(false);
    });

    it("accepts a table with the canonical warning", () => {
        expect(isDatabricksSourceRef(validTable)).toBe(true);
        // Belt and braces — confirm the exact warning literal is what
        // downstream UI hints will key off.
        expect((validTable as { governance: { warning: string } }).governance.warning)
            .toBe("raw-table-bypasses-curated-views");
    });
});

describe("isDatabricksSourceRef — uc-function parameter validation", () => {
    it("accepts uc-function without parameters", () => {
        expect(isDatabricksSourceRef(validUcFunctionWithoutParams)).toBe(true);
    });

    it("accepts uc-function with an empty parameter array", () => {
        expect(isDatabricksSourceRef({ ...validUcFunction, parameters: [] })).toBe(true);
    });

    it("rejects uc-function with parameters that aren't an array", () => {
        expect(isDatabricksSourceRef({
            ...validUcFunction,
            parameters: "limit:INT" as unknown as typeof validUcFunction.parameters,
        })).toBe(false);
    });

    it("rejects uc-function with a parameter missing name", () => {
        expect(isDatabricksSourceRef({
            ...validUcFunction,
            parameters: [{ type: "INT" } as unknown as { name: string; type: string }],
        })).toBe(false);
    });

    it("rejects uc-function with a parameter missing type", () => {
        expect(isDatabricksSourceRef({
            ...validUcFunction,
            parameters: [{ name: "limit" } as unknown as { name: string; type: string }],
        })).toBe(false);
    });
});

describe("isDatabricksSourceRef — genie-space optional warehouseId", () => {
    it("accepts genie-space without warehouseId", () => {
        expect(isDatabricksSourceRef(validGenieSpace)).toBe(true);
    });

    it("accepts genie-space with warehouseId", () => {
        expect(isDatabricksSourceRef(validGenieSpaceWithWarehouse)).toBe(true);
    });

    it("rejects genie-space with an empty-string warehouseId", () => {
        expect(isDatabricksSourceRef({ ...validGenieSpace, warehouseId: "" })).toBe(false);
    });
});

// ─── Per-kind guards: narrow correctly ─────────────────────────────────────

describe("per-kind guards narrow correctly", () => {
    it("isGenieSpaceSourceRef accepts only genie-space", () => {
        expect(isGenieSpaceSourceRef(validGenieSpace)).toBe(true);
        expect(isGenieSpaceSourceRef(validMetricView)).toBe(false);
        expect(isGenieSpaceSourceRef(validTable)).toBe(false);
    });

    it("isMetricViewSourceRef accepts only metric-view", () => {
        expect(isMetricViewSourceRef(validMetricView)).toBe(true);
        expect(isMetricViewSourceRef(validGenieSpace)).toBe(false);
        expect(isMetricViewSourceRef(validUcFunction)).toBe(false);
    });

    it("isUcFunctionSourceRef accepts only uc-function", () => {
        expect(isUcFunctionSourceRef(validUcFunction)).toBe(true);
        expect(isUcFunctionSourceRef(validUcFunctionWithoutParams)).toBe(true);
        expect(isUcFunctionSourceRef(validView)).toBe(false);
    });

    it("isViewSourceRef accepts only view", () => {
        expect(isViewSourceRef(validView)).toBe(true);
        expect(isViewSourceRef(validMetricView)).toBe(false);
        expect(isViewSourceRef(validTable)).toBe(false);
    });

    it("isTableSourceRef accepts only table (with canonical warning)", () => {
        expect(isTableSourceRef(validTable)).toBe(true);
        expect(isTableSourceRef(validView)).toBe(false);
        expect(isTableSourceRef(validMetricView)).toBe(false);
    });
});

// ─── sourceRefDisplayLabel ─────────────────────────────────────────────────

describe("sourceRefDisplayLabel", () => {
    it.each([
        [validGenieSpace,                "Exec Q&A Space (Genie Space)"],
        [validMetricView,                "Revenue metrics (Metric View)"],
        [validUcFunction,                "Top customers (parameterized) (UC Function)"],
        [validUcFunctionWithoutParams,   "Refresh summary (UC Function)"],
        [validView,                      "Sales Q3 curated (UC View)"],
        [validTable,                     "Raw orders (Table)"],
    ])("formats %#", (ref, expected) => {
        expect(sourceRefDisplayLabel(ref)).toBe(expected);
    });

    it("disambiguates same displayName across kinds", () => {
        // Three sources called "Sales" should produce three distinct labels.
        const same = "Sales";
        const a = sourceRefDisplayLabel({ ...validMetricView, displayName: same });
        const b = sourceRefDisplayLabel({ ...validView,        displayName: same });
        const c = sourceRefDisplayLabel({ ...validTable,       displayName: same });
        expect(a).toBe("Sales (Metric View)");
        expect(b).toBe("Sales (UC View)");
        expect(c).toBe("Sales (Table)");
        expect(new Set([a, b, c]).size).toBe(3);
    });
});

// ─── Public shape stability ────────────────────────────────────────────────

describe("public shape stability", () => {
    // Snapshot guard: if any consumer (proxy, pack loader, UI picker)
    // ever depends on a specific JSON layout, accidental drift here
    // breaks them silently. The explicit-object check below is
    // intentionally verbose so a diff is obvious in code review.
    it("metric-view ref serializes to the documented JSON shape", () => {
        expect(JSON.parse(JSON.stringify(validMetricView))).toEqual({
            kind: "metric-view",
            fullName: "main.finance.revenue_metrics",
            warehouseId: "wh-prod-1",
            displayName: "Revenue metrics",
            governance: { requiresAttestation: true },
        });
    });

    it("table ref always carries the canonical warning literal", () => {
        const json = JSON.parse(JSON.stringify(validTable));
        expect(json.governance).toEqual({
            requiresAttestation: true,
            warning: "raw-table-bypasses-curated-views",
        });
    });

    it("uc-function with parameters serializes parameters as an array", () => {
        const json = JSON.parse(JSON.stringify(validUcFunction));
        expect(Array.isArray(json.parameters)).toBe(true);
        expect(json.parameters).toEqual([
            { name: "limit", type: "INT" },
            { name: "as_of", type: "DATE" },
        ]);
    });

    it("every kind in DATABRICKS_SOURCE_REF_KINDS has a fixture covering it", () => {
        // Exhaustiveness guard for the test suite itself — adding a new
        // kind without a fixture would silently leave that variant
        // uncovered. Reads fixtures + checks every kind is represented.
        const covered = new Set<DatabricksSourceRefKind>(
            ALL_VALID.map(({ ref }) => ref.kind),
        );
        for (const kind of DATABRICKS_SOURCE_REF_KINDS) {
            expect(covered.has(kind)).toBe(true);
        }
    });
});

// ─── Helper types for delete-then-spread patterns in failure tests ─────────
// (TypeScript narrowing through `delete` is awkward — these aliases let
//  the destructuring `const { displayName: _, ...rest } = ref` patterns
//  type-check without `any`.)
type MetricViewLike = typeof validMetricView & Record<string, unknown>;
type GenieSpaceLike = typeof validGenieSpace & Record<string, unknown>;
