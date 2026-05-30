// playground/src/visualization/governance.ts
//
// G3a — Frontend governance attestation TYPE CONTRACT only.
//
// What this module owns
// ─────────────────────
//   • the `GovernanceAttestation` shape — a serializable envelope field
//     the proxy attaches to every renderable response in G3b/G3c
//   • `isGovernanceAttestation` — pure trust-boundary validator the
//     native adapter, workbench artifact view, and any future consumer
//     uses to verify what arrived
//   • the authority + cost-unit allowlists as frozen constants so
//     consumers can iterate them deterministically
//
// What this module does NOT own
// ─────────────────────────────
//   • building attestations — that lives in `proxy/lib/governance.js`.
//     The browser CANNOT construct a trusted attestation; it can only
//     validate what the proxy emitted.
//   • production fail-closed behavior — the envelope guard stays pure
//     and environment-agnostic. The native adapter / render gate is
//     where production policy lives (queued for G3d).
//   • the optional vs required posture for envelopes — `AIResultEnvelope`
//     keeps `governance?: GovernanceAttestation` as OPTIONAL in the
//     type system. Per-deployment enforcement is the renderer's job.
//
// Pulse PBI copy-port safety
// ──────────────────────────
// Pure TypeScript. No DOM, React, fetch, localStorage, browser globals,
// CSS, or vendor SDKs. Pulse PBI sibling can copy-port verbatim once
// the route wiring lands.

import { isDatabricksSourceRef, type DatabricksSourceRef } from "./sourceRef";

// ─── Authority allowlist ──────────────────────────────────────────────────

/** Every governance authority the proxy is allowed to attest with.
 *  Frozen so consumers can iterate without worrying about mutation.
 *  `"mock"` is dev-only at the proxy boundary; this list does NOT
 *  encode that policy because the frontend guard stays env-agnostic. */
export const GOVERNANCE_AUTHORITIES = Object.freeze([
    "unity-catalog",
    "powerbi-semantic-model",
    "warehouse",
    "mock",
] as const);

export type GovernanceAuthority = typeof GOVERNANCE_AUTHORITIES[number];

// ─── Cost estimate ────────────────────────────────────────────────────────

/** Cost estimate units. `"cached"` reports the AVOIDED cost (so the
 *  sustainability indicator can render "saved N rows"); `"rows-scanned"`
 *  is the raw work the warehouse executed; `"usd"` is a monetary
 *  estimate when the platform exposes one. */
export const GOVERNANCE_COST_UNITS = Object.freeze([
    "rows-scanned",
    "cached",
    "usd",
] as const);

export type GovernanceCostUnit = typeof GOVERNANCE_COST_UNITS[number];

export interface GovernanceCostEstimate {
    readonly unit: GovernanceCostUnit;
    readonly value: number;
}

// ─── Attestation shape ────────────────────────────────────────────────────

/** The single serializable contract every renderable AI result carries.
 *
 *  Required fields:
 *    - `enforced`: literal `true`. Any other value (including `false`,
 *      `1`, `"true"`) means the attestation is invalid.
 *    - `authority`: who enforced governance — see GOVERNANCE_AUTHORITIES.
 *    - `subjectRef`: who the rows were filtered for. Opaque to the
 *      frontend; the proxy emits a hashed/scoped identifier.
 *    - `requestId`: correlates this attestation with proxy audit logs.
 *
 *  Optional fields:
 *    - `sourceRef`: when the response sourced from a typed Databricks
 *      asset (G2.5 contract), this is which one.
 *    - `policyVersion`: detects policy changes between renders.
 *    - `rowLimitApplied`: max-rows hint the proxy enforced.
 *    - `columnPolicyApplied`: did UC column masks fire?
 *    - `cacheHit`: did the proxy return cached rows? Useful for the
 *      sustainability indicator.
 *    - `costEstimate`: what work this answer cost / would have cost. */
export interface GovernanceAttestation {
    readonly enforced: true;
    readonly authority: GovernanceAuthority;
    readonly subjectRef: string;
    readonly requestId: string;
    readonly sourceRef?: DatabricksSourceRef;
    readonly policyVersion?: string;
    readonly rowLimitApplied?: number;
    readonly columnPolicyApplied?: boolean;
    readonly cacheHit?: boolean;
    readonly costEstimate?: GovernanceCostEstimate;
}

// ─── Trust-boundary validator ─────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isAuthority(value: unknown): value is GovernanceAuthority {
    return typeof value === "string"
        && (GOVERNANCE_AUTHORITIES as readonly string[]).includes(value);
}

function isCostUnit(value: unknown): value is GovernanceCostUnit {
    return typeof value === "string"
        && (GOVERNANCE_COST_UNITS as readonly string[]).includes(value);
}

function isCostEstimate(value: unknown): value is GovernanceCostEstimate {
    if (!isPlainObject(value)) return false;
    if (!isCostUnit(value.unit)) return false;
    if (!isFiniteNonNegativeNumber(value.value)) return false;
    return true;
}

/** Validates that `value` is a structurally-correct `GovernanceAttestation`.
 *
 *  Strict checks:
 *    - `enforced === true` (literal `true`, not truthy)
 *    - `authority` is in `GOVERNANCE_AUTHORITIES`
 *    - `subjectRef` is a non-empty string
 *    - `requestId` is a non-empty string
 *    - if present, `sourceRef` validates through `isDatabricksSourceRef`
 *    - if present, `policyVersion` is a non-empty string
 *    - if present, `rowLimitApplied` is a finite non-negative number
 *    - if present, `columnPolicyApplied` / `cacheHit` are booleans
 *    - if present, `costEstimate.unit` is in `GOVERNANCE_COST_UNITS`
 *      and `costEstimate.value` is a finite non-negative number
 *
 *  This guard is INTENTIONALLY env-agnostic. Production fail-closed
 *  policy ("missing attestation in production blocks render") lives in
 *  the native adapter / render gate — NOT here. Per F5.1's lesson, the
 *  envelope guard should only describe shape; the renderer applies
 *  deployment policy. */
export function isGovernanceAttestation(value: unknown): value is GovernanceAttestation {
    if (!isPlainObject(value)) return false;
    if (value.enforced !== true) return false;
    if (!isAuthority(value.authority)) return false;
    if (!isNonEmptyString(value.subjectRef)) return false;
    if (!isNonEmptyString(value.requestId)) return false;
    if (value.sourceRef !== undefined && !isDatabricksSourceRef(value.sourceRef)) return false;
    if (value.policyVersion !== undefined && !isNonEmptyString(value.policyVersion)) return false;
    if (value.rowLimitApplied !== undefined && !isFiniteNonNegativeNumber(value.rowLimitApplied)) return false;
    if (value.columnPolicyApplied !== undefined && typeof value.columnPolicyApplied !== "boolean") return false;
    if (value.cacheHit !== undefined && typeof value.cacheHit !== "boolean") return false;
    if (value.costEstimate !== undefined && !isCostEstimate(value.costEstimate)) return false;
    return true;
}
