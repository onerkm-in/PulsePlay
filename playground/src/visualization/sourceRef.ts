// playground/src/visualization/sourceRef.ts
//
// G2.5 — Databricks source-ref contract. Typed identification of the
// governed data assets PulsePlay (and Pulse PBI) can request through
// the proxy/data layer.
//
// Why this module exists
// ──────────────────────
// PulsePlay's strategic direction (locked 2026-05-21) is Azure
// Databricks as the first-class source plane: tables, UC views,
// metric views, UC functions, and Genie Spaces. ADR-0010 frames the
// answer ladder (Metric View > UC View > UC Function > Genie Space >
// LLM > Python) and requires source identity to be TYPED and
// PORTABLE rather than inline SQL strings.
//
// This module owns that typing. It carries:
//
//   • the discriminated union `DatabricksSourceRef`
//   • a frozen kind-list `DATABRICKS_SOURCE_REF_KINDS` for exhaustive
//     iteration in tests and future routing code
//   • per-kind type guards so consumers can narrow safely
//   • `isDatabricksSourceRef` for general validation at trust
//     boundaries (URL parsing, pack JSON ingest, proxy payloads)
//   • `sourceRefDisplayLabel` so UIs render a clean "Name (Kind)"
//     string instead of `catalog.schema.long_name`
//
// What this module does NOT own
// ─────────────────────────────
//   • SQL execution — that stays behind the proxy
//   • Data fetching — that stays behind the proxy
//   • Governance attestation runtime — that's G3 work; this module
//     only declares which refs REQUIRE attestation. The proxy is the
//     authority that produces the attestation, never the browser.
//   • Auto-pick logic between source kinds — that's pack/proxy logic
//   • Caching policy — orthogonal concern
//
// Pulse PBI copy-port safety
// ──────────────────────────
// Pure TypeScript. No DOM, no React, no `fetch`, no localStorage, no
// browser globals, no CSS imports, no vendor SDKs. Pulse PBI sibling
// can copy-port this module verbatim (per `docs/PULSE_SYNC.md` Tier 2).
//
// Adding a new kind
// ─────────────────
// 1. Add it to `DATABRICKS_SOURCE_REF_KINDS`.
// 2. Add the variant interface and a per-kind type guard.
// 3. Add a switch case to `isDatabricksSourceRef`.
// 4. Add a `KIND_LABELS` entry so `sourceRefDisplayLabel` formats it.
// 5. Add tests for the new variant.
//
// TypeScript exhaustiveness checks the union, but JS-only consumers
// won't notice missing cases until runtime — `isDatabricksSourceRef`
// returns `false` for unknown kinds (safe default) but the new variant
// won't be usable until step 3.

// ─── Kinds ─────────────────────────────────────────────────────────────────

/** Every supported Databricks source kind. Frozen so consumers can
 *  iterate exhaustively in tests and future routing code without
 *  worrying about silent mutation. */
export const DATABRICKS_SOURCE_REF_KINDS = Object.freeze([
    "genie-space",
    "metric-view",
    "uc-function",
    "view",
    "table",
] as const);

export type DatabricksSourceRefKind = typeof DATABRICKS_SOURCE_REF_KINDS[number];

// ─── Variants ──────────────────────────────────────────────────────────────

/** Common governance signal shared by curated kinds. The proxy honors
 *  `requiresAttestation: true` by always emitting `governance.enforced`
 *  on responses sourced from this ref (wired up in G3, not here). */
interface BaseGovernance {
    /** Always `true` for every kind today. The literal type makes
     *  "intentionally relaxed" require an explicit code change later. */
    readonly requiresAttestation: true;
}

/** Governance signal for raw tables — adds an explicit warning string
 *  consumers can render in UI to remind authors that tables bypass
 *  Metric View and UC View curation. The warning text is fixed at
 *  the type level so it can't drift across deployments. */
interface TableGovernance extends BaseGovernance {
    readonly warning: "raw-table-bypasses-curated-views";
}

/** Common fields every source ref carries regardless of kind. */
interface SourceRefBase {
    /** Human-readable label rendered in pickers and audit logs.
     *  Required — pickers must not display `catalog.schema.long_name`
     *  as the primary affordance because users can't distinguish
     *  similar names at a glance. */
    readonly displayName: string;
}

/** Databricks Genie Space — natural-language Q&A surface that already
 *  carries semantic context. Use for exploratory questions when the
 *  semantic model already exists. `warehouseId` is OPTIONAL because
 *  Genie binds to a warehouse internally; callers can override only
 *  when a specific warehouse is required for cost or policy reasons. */
export interface GenieSpaceSourceRef extends SourceRefBase {
    readonly kind: "genie-space";
    readonly spaceId: string;
    readonly warehouseId?: string;
    readonly governance: BaseGovernance;
}

/** Unity Catalog Metric View — the preferred kind for governed,
 *  reusable business metrics. Cheapest in the answer ladder because
 *  results are typically cached and the semantic shape is fixed. */
export interface MetricViewSourceRef extends SourceRefBase {
    readonly kind: "metric-view";
    readonly fullName: string;
    readonly warehouseId: string;
    readonly governance: BaseGovernance;
}

/** Unity Catalog Function — parameterized governed query. Useful for
 *  curated "give me X filtered by Y" shapes where Metric Views are
 *  too rigid but raw SQL is too open. Parameters are typed so the
 *  proxy can bind safely server-side; the browser never concatenates
 *  SQL strings. */
export interface UcFunctionSourceRef extends SourceRefBase {
    readonly kind: "uc-function";
    readonly fullName: string;
    readonly warehouseId: string;
    /** Parameter names + Databricks types as strings (e.g., "INT",
     *  "TIMESTAMP"). Optional — some UC functions take no parameters. */
    readonly parameters?: ReadonlyArray<{ readonly name: string; readonly type: string }>;
    readonly governance: BaseGovernance;
}

/** Unity Catalog View — curated SQL shape that doesn't fit the Metric
 *  View model. Cheaper than raw tables (governance applies) but more
 *  flexible than Metric Views. */
export interface ViewSourceRef extends SourceRefBase {
    readonly kind: "view";
    readonly fullName: string;
    readonly warehouseId: string;
    readonly governance: BaseGovernance;
}

/** Unity Catalog Table — raw table reference. Last resort in the
 *  answer ladder. Always carries the "raw-table-bypasses-curated-views"
 *  warning so the host UI can render an explicit "this is ungoverned
 *  shape" hint, even though the data layer's RLS/OLS still applies. */
export interface TableSourceRef extends SourceRefBase {
    readonly kind: "table";
    readonly fullName: string;
    readonly warehouseId: string;
    readonly governance: TableGovernance;
}

/** The discriminated union. Switch on `kind` to narrow. */
export type DatabricksSourceRef =
    | GenieSpaceSourceRef
    | MetricViewSourceRef
    | UcFunctionSourceRef
    | ViewSourceRef
    | TableSourceRef;

// ─── Type guards ───────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function isBaseGovernance(value: unknown): value is BaseGovernance {
    return isPlainObject(value) && value.requiresAttestation === true;
}

function isTableGovernance(value: unknown): value is TableGovernance {
    // Re-check the base predicates here rather than narrowing through
    // `isBaseGovernance(value)` first — `BaseGovernance` has no index
    // signature, so further property reads via cast would require an
    // unsafe `as unknown` bridge. Going straight through `isPlainObject`
    // keeps `value` typed as `Record<string, unknown>` and `value.warning`
    // typed as `unknown` so the literal comparison narrows cleanly.
    return isPlainObject(value)
        && value.requiresAttestation === true
        && value.warning === "raw-table-bypasses-curated-views";
}

function hasRequiredBase(value: Record<string, unknown>): boolean {
    return isNonEmptyString(value.displayName);
}

export function isGenieSpaceSourceRef(value: unknown): value is GenieSpaceSourceRef {
    if (!isPlainObject(value)) return false;
    if (value.kind !== "genie-space") return false;
    if (!hasRequiredBase(value)) return false;
    if (!isNonEmptyString(value.spaceId)) return false;
    // warehouseId is optional; when present, must be a non-empty string.
    if (value.warehouseId !== undefined && !isNonEmptyString(value.warehouseId)) return false;
    if (!isBaseGovernance(value.governance)) return false;
    return true;
}

export function isMetricViewSourceRef(value: unknown): value is MetricViewSourceRef {
    if (!isPlainObject(value)) return false;
    if (value.kind !== "metric-view") return false;
    if (!hasRequiredBase(value)) return false;
    if (!isNonEmptyString(value.fullName)) return false;
    if (!isNonEmptyString(value.warehouseId)) return false;
    if (!isBaseGovernance(value.governance)) return false;
    return true;
}

export function isUcFunctionSourceRef(value: unknown): value is UcFunctionSourceRef {
    if (!isPlainObject(value)) return false;
    if (value.kind !== "uc-function") return false;
    if (!hasRequiredBase(value)) return false;
    if (!isNonEmptyString(value.fullName)) return false;
    if (!isNonEmptyString(value.warehouseId)) return false;
    if (!isBaseGovernance(value.governance)) return false;
    // parameters is optional; when present, must be an array of valid
    // {name, type} pairs. Empty array is allowed (zero-param function).
    if (value.parameters !== undefined) {
        if (!Array.isArray(value.parameters)) return false;
        for (const param of value.parameters) {
            if (!isPlainObject(param)) return false;
            if (!isNonEmptyString(param.name)) return false;
            if (!isNonEmptyString(param.type)) return false;
        }
    }
    return true;
}

export function isViewSourceRef(value: unknown): value is ViewSourceRef {
    if (!isPlainObject(value)) return false;
    if (value.kind !== "view") return false;
    if (!hasRequiredBase(value)) return false;
    if (!isNonEmptyString(value.fullName)) return false;
    if (!isNonEmptyString(value.warehouseId)) return false;
    if (!isBaseGovernance(value.governance)) return false;
    return true;
}

export function isTableSourceRef(value: unknown): value is TableSourceRef {
    if (!isPlainObject(value)) return false;
    if (value.kind !== "table") return false;
    if (!hasRequiredBase(value)) return false;
    if (!isNonEmptyString(value.fullName)) return false;
    if (!isNonEmptyString(value.warehouseId)) return false;
    // Tables MUST carry the raw-table warning. This is the type-level
    // discriminator that lets host UIs render "this is ungoverned shape"
    // hints without re-checking per call site.
    if (!isTableGovernance(value.governance)) return false;
    return true;
}

/** General trust-boundary validator. Returns true only when `value`
 *  is a fully-valid source ref of one of the known kinds. Use this
 *  when ingesting from JSON, URL params, proxy responses, or any
 *  source outside the type system. */
export function isDatabricksSourceRef(value: unknown): value is DatabricksSourceRef {
    if (!isPlainObject(value)) return false;
    const kind = value.kind;
    if (typeof kind !== "string") return false;
    switch (kind) {
        case "genie-space": return isGenieSpaceSourceRef(value);
        case "metric-view": return isMetricViewSourceRef(value);
        case "uc-function": return isUcFunctionSourceRef(value);
        case "view":        return isViewSourceRef(value);
        case "table":       return isTableSourceRef(value);
        default:            return false;
    }
}

// ─── Display ───────────────────────────────────────────────────────────────

/** User-facing labels per kind. Kept in this module (not a CSS file or
 *  i18n bundle) so Pulse PBI's copy-port stays self-contained. */
const KIND_LABELS: Readonly<Record<DatabricksSourceRefKind, string>> = Object.freeze({
    "genie-space": "Genie Space",
    "metric-view": "Metric View",
    "uc-function": "UC Function",
    "view":        "UC View",
    "table":       "Table",
});

/** "{displayName} ({Kind})" formatter for pickers and audit lines.
 *  Helps users distinguish three sources named "Sales" — one Metric
 *  View, one UC View, one Table — without showing the technical
 *  `catalog.schema.fullName` primary. */
export function sourceRefDisplayLabel(ref: DatabricksSourceRef): string {
    return `${ref.displayName} (${KIND_LABELS[ref.kind]})`;
}
