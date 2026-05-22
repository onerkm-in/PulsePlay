// playground/src/visualization/__tests__/governance.test.ts
//
// G3a — Contract tests for the frontend governance attestation guard.
//
// These tests pin the trust-boundary behavior the native adapter and
// any future render gate will rely on. The guard is env-agnostic —
// these tests must NOT depend on NODE_ENV. Production fail-closed
// policy is tested at the renderer layer (G3d), not here.

import { describe, expect, it } from "vitest";
import {
    GOVERNANCE_AUTHORITIES,
    GOVERNANCE_COST_UNITS,
    isGovernanceAttestation,
    type GovernanceAttestation,
} from "../governance";
import type { DatabricksSourceRef } from "../sourceRef";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const validMinimal: GovernanceAttestation = {
    enforced: true,
    authority: "unity-catalog",
    subjectRef: "user-hash-abc-123",
    requestId: "req-2026-05-21-001",
};

const validMetricViewSourceRef: DatabricksSourceRef = {
    kind: "metric-view",
    fullName: "main.finance.revenue_metrics",
    warehouseId: "wh-prod-1",
    displayName: "Revenue metrics",
    governance: { requiresAttestation: true },
};

const validFull: GovernanceAttestation = {
    enforced: true,
    authority: "unity-catalog",
    subjectRef: "user-hash-abc-123",
    requestId: "req-2026-05-21-001",
    sourceRef: validMetricViewSourceRef,
    policyVersion: "v2.3",
    rowLimitApplied: 10000,
    columnPolicyApplied: true,
    cacheHit: false,
    costEstimate: { unit: "rows-scanned", value: 1234 },
};

// ─── Allowlists ────────────────────────────────────────────────────────────

describe("GOVERNANCE_AUTHORITIES", () => {
    it("contains exactly the four documented authorities", () => {
        expect(GOVERNANCE_AUTHORITIES).toEqual([
            "unity-catalog",
            "powerbi-semantic-model",
            "warehouse",
            "mock",
        ]);
    });

    it("is frozen", () => {
        expect(Object.isFrozen(GOVERNANCE_AUTHORITIES)).toBe(true);
    });
});

describe("GOVERNANCE_COST_UNITS", () => {
    it("contains exactly the three documented units", () => {
        expect(GOVERNANCE_COST_UNITS).toEqual(["rows-scanned", "cached", "usd"]);
    });

    it("is frozen", () => {
        expect(Object.isFrozen(GOVERNANCE_COST_UNITS)).toBe(true);
    });
});

// ─── Happy paths ───────────────────────────────────────────────────────────

describe("isGovernanceAttestation — accepts valid shapes", () => {
    it("accepts the minimal required-only attestation", () => {
        expect(isGovernanceAttestation(validMinimal)).toBe(true);
    });

    it("accepts the fully-populated attestation", () => {
        expect(isGovernanceAttestation(validFull)).toBe(true);
    });

    it.each(GOVERNANCE_AUTHORITIES)("accepts authority=%s", (authority) => {
        expect(isGovernanceAttestation({ ...validMinimal, authority })).toBe(true);
    });

    it.each(GOVERNANCE_COST_UNITS)("accepts costEstimate.unit=%s", (unit) => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: { unit, value: 100 },
        })).toBe(true);
    });

    it("accepts costEstimate.value of zero", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: { unit: "cached", value: 0 },
        })).toBe(true);
    });

    it("accepts rowLimitApplied of zero", () => {
        expect(isGovernanceAttestation({ ...validMinimal, rowLimitApplied: 0 })).toBe(true);
    });
});

// ─── enforced === true is load-bearing ────────────────────────────────────

describe("isGovernanceAttestation — enforced literal", () => {
    it("rejects enforced: false", () => {
        expect(isGovernanceAttestation({ ...validMinimal, enforced: false })).toBe(false);
    });

    it("rejects enforced: 1 (truthy but not literal true)", () => {
        expect(isGovernanceAttestation({ ...validMinimal, enforced: 1 })).toBe(false);
    });

    it('rejects enforced: "true" (string)', () => {
        expect(isGovernanceAttestation({ ...validMinimal, enforced: "true" })).toBe(false);
    });

    it("rejects missing enforced", () => {
        const { enforced: _e, ...rest } = validMinimal as Record<string, unknown>;
        expect(isGovernanceAttestation(rest)).toBe(false);
    });
});

// ─── authority allowlist ──────────────────────────────────────────────────

describe("isGovernanceAttestation — authority allowlist", () => {
    it("rejects unknown authority", () => {
        expect(isGovernanceAttestation({ ...validMinimal, authority: "rogue" })).toBe(false);
    });

    it("rejects non-string authority", () => {
        expect(isGovernanceAttestation({ ...validMinimal, authority: 42 })).toBe(false);
    });

    it("rejects missing authority", () => {
        const { authority: _a, ...rest } = validMinimal as Record<string, unknown>;
        expect(isGovernanceAttestation(rest)).toBe(false);
    });
});

// ─── subjectRef / requestId required ─────────────────────────────────────

describe("isGovernanceAttestation — required identity fields", () => {
    it("rejects missing subjectRef", () => {
        const { subjectRef: _s, ...rest } = validMinimal as Record<string, unknown>;
        expect(isGovernanceAttestation(rest)).toBe(false);
    });

    it("rejects empty subjectRef", () => {
        expect(isGovernanceAttestation({ ...validMinimal, subjectRef: "" })).toBe(false);
    });

    it("rejects non-string subjectRef", () => {
        expect(isGovernanceAttestation({ ...validMinimal, subjectRef: 123 })).toBe(false);
    });

    it("rejects missing requestId", () => {
        const { requestId: _r, ...rest } = validMinimal as Record<string, unknown>;
        expect(isGovernanceAttestation(rest)).toBe(false);
    });

    it("rejects empty requestId", () => {
        expect(isGovernanceAttestation({ ...validMinimal, requestId: "" })).toBe(false);
    });
});

// ─── Optional fields validate when present ────────────────────────────────

describe("isGovernanceAttestation — optional field validation", () => {
    it("rejects an invalid sourceRef", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            sourceRef: { kind: "raw-sql" } as unknown as DatabricksSourceRef,
        })).toBe(false);
    });

    it("accepts a missing sourceRef", () => {
        expect(isGovernanceAttestation(validMinimal)).toBe(true);
    });

    it("rejects empty policyVersion", () => {
        expect(isGovernanceAttestation({ ...validMinimal, policyVersion: "" })).toBe(false);
    });

    it("rejects non-string policyVersion", () => {
        expect(isGovernanceAttestation({ ...validMinimal, policyVersion: 1.0 })).toBe(false);
    });

    it("rejects negative rowLimitApplied", () => {
        expect(isGovernanceAttestation({ ...validMinimal, rowLimitApplied: -1 })).toBe(false);
    });

    it("rejects non-finite rowLimitApplied", () => {
        expect(isGovernanceAttestation({ ...validMinimal, rowLimitApplied: Number.POSITIVE_INFINITY })).toBe(false);
        expect(isGovernanceAttestation({ ...validMinimal, rowLimitApplied: Number.NaN })).toBe(false);
    });

    it("rejects non-boolean columnPolicyApplied", () => {
        expect(isGovernanceAttestation({ ...validMinimal, columnPolicyApplied: "yes" })).toBe(false);
    });

    it("rejects non-boolean cacheHit", () => {
        expect(isGovernanceAttestation({ ...validMinimal, cacheHit: 1 })).toBe(false);
    });
});

// ─── costEstimate sub-shape ────────────────────────────────────────────────

describe("isGovernanceAttestation — costEstimate validation", () => {
    it("rejects unknown unit", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: { unit: "rogue-unit", value: 100 },
        })).toBe(false);
    });

    it("rejects negative value", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: { unit: "usd", value: -1 },
        })).toBe(false);
    });

    it("rejects non-finite value", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: { unit: "rows-scanned", value: Number.POSITIVE_INFINITY },
        })).toBe(false);
    });

    it("rejects missing unit", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: { value: 100 } as unknown as { unit: "usd"; value: number },
        })).toBe(false);
    });

    it("rejects missing value", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: { unit: "usd" } as unknown as { unit: "usd"; value: number },
        })).toBe(false);
    });

    it("rejects non-object costEstimate", () => {
        expect(isGovernanceAttestation({
            ...validMinimal,
            costEstimate: "free" as unknown as { unit: "usd"; value: number },
        })).toBe(false);
    });
});

// ─── Non-object inputs ─────────────────────────────────────────────────────

describe("isGovernanceAttestation — non-object rejection", () => {
    it.each([
        ["null",      null],
        ["undefined", undefined],
        ["number",    42],
        ["string",    "enforced"],
        ["boolean",   true],
        ["array",     [validMinimal]],
    ])("rejects %s", (_label, value) => {
        expect(isGovernanceAttestation(value)).toBe(false);
    });
});

// ─── Env-agnostic posture ─────────────────────────────────────────────────

describe("isGovernanceAttestation — env-agnostic", () => {
    // This module MUST NOT depend on NODE_ENV. The frontend guard
    // describes shape only; production fail-closed lives at the
    // renderer (G3d). Lock that posture with a behavioral test that
    // flips NODE_ENV and asserts the guard returns the same answer.
    it("returns the same result regardless of NODE_ENV", () => {
        const originalEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = "production";
            const prodResult = isGovernanceAttestation(validMinimal);
            process.env.NODE_ENV = "development";
            const devResult = isGovernanceAttestation(validMinimal);
            process.env.NODE_ENV = "test";
            const testResult = isGovernanceAttestation(validMinimal);
            expect(prodResult).toBe(true);
            expect(devResult).toBe(true);
            expect(testResult).toBe(true);
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });

    it("accepts authority=mock regardless of NODE_ENV (renderer enforces)", () => {
        // Per the G3a contract, the FRONTEND guard does not reject mock
        // attestations even in production — that policy lives in the
        // proxy builder (which throws) and the native render gate
        // (which blocks). The guard only validates structural shape.
        const originalEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = "production";
            expect(isGovernanceAttestation({ ...validMinimal, authority: "mock" })).toBe(true);
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });
});
