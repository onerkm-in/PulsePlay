// playground/src/types/probe.ts
//
// TypeScript types for the connector-agnostic probe contract.
// Mirrors the canonical shape defined in
// docs/CONNECTOR_PROBE_AND_SMART_CONNECT.md ("Probe response shape").
//
// PulsePlay's Smart Connect feature: when the user clicks Test Connection,
// the proxy issues a connector-neutral probe and returns this shape. The
// matcher proposes a pack/sub-vertical based on the metadata that came back.
// Every field except `profile`, `connectorType`, `metadataAvailability`,
// and `probeDurationMs` is optional — connectors that expose nothing still
// produce a valid result with `metadataAvailability: "none"`.

/** How much structured metadata the connector exposed. */
export type ProbeMetadataAvailability = "rich" | "minimal" | "none";

/** A column inside a probed table. */
export interface ProbeColumn {
    name: string;
    type?: string;
    description?: string;
    /** True when the column appears to be a KPI / measure (vs a dimension). */
    isMeasure?: boolean;
}

/** A table inside the connector's exposed schema. */
export interface ProbeTable {
    name: string;
    description?: string;
    columns: ProbeColumn[];
}

/** Schema hints (filled when the connector exposes table info). */
export interface ProbeSchema {
    tables: ProbeTable[];
}

/** Tool / capability hint, mostly relevant for agent-pattern + MCP connectors. */
export interface ProbeTool {
    name: string;
    description?: string;
    /** Raw JSON-Schema-ish object as supplied by the connector — kept loose on purpose. */
    inputSchema?: Record<string, unknown>;
}

/** KPI hint (filled when KPIs are explicitly declared in the backend). */
export interface ProbeDeclaredKpi {
    name: string;
    description?: string;
    formula?: string;
    higherIsBetter?: boolean;
}

/** Alternative pack suggestion when the matcher had multiple plausible candidates. */
export interface ProbeInferenceAlternative {
    pack: string;
    subVertical?: string;
    confidence: number;
}

/**
 * Pack-inference output from PulsePlay's matcher (NOT from the backend).
 * `confidence` is in the [0, 1] range.
 */
export interface ProbeInferenceResult {
    suggestedPack?: string;
    suggestedSubVertical?: string;
    confidence: number;
    /** Human-readable trace explaining WHY the suggestion was made. */
    because: string[];
    alternatives?: ProbeInferenceAlternative[];
}

/**
 * The canonical, connector-neutral probe response. Every connector adapter
 * (genie / supervisor / openai-* / bedrock-* / foundation-model / mcp / generic)
 * translates its native metadata into this shape.
 */
export interface ConnectorProbeResult {
    // ── Identity ─────────────────────────────────────────────────────────
    /** Connector profile name (matches assistantProfile in requests). */
    profile: string;
    /**
     * Connector type tag. One of:
     * "genie" | "supervisor-local" | "supervisor" | "openai-chat" |
     * "openai-analytics" | "bedrock-rag" | "bedrock-direct" |
     * "foundation-model" | "mcp-server" | "generic"
     */
    connectorType: string;
    /** Free-text label shown to users. May be empty. */
    displayName?: string;

    // ── Metadata availability ───────────────────────────────────────────
    metadataAvailability: ProbeMetadataAvailability;

    // ── Domain hints (filled when metadataAvailability != "none") ───────
    description?: string;
    purpose?: string;
    owner?: string;
    lastUpdated?: string;

    // ── Schema hints ────────────────────────────────────────────────────
    schema?: ProbeSchema;

    // ── Tool / capability hints ─────────────────────────────────────────
    tools?: ProbeTool[];

    // ── KPI hints ───────────────────────────────────────────────────────
    declaredKpis?: ProbeDeclaredKpi[];

    // ── Sample-question hints ───────────────────────────────────────────
    sampleQuestions?: string[];

    // ── Pack inference (filled by PulsePlay's matcher) ──────────────────
    inference?: ProbeInferenceResult;

    // ── Diagnostics ─────────────────────────────────────────────────────
    /** Probe duration in milliseconds; surfaced in the test-connection panel. */
    probeDurationMs: number;
    /** Non-fatal warnings encountered during probe. */
    warnings?: string[];
}
