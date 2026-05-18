// playground/src/types/assistant.ts
//
// Unified Ask Pulse Workbench — type contract.
//
// Canonical doc: docs/UNIFIED_ASK_PULSE_WORKBENCH.md
// ADR: docs/adr/0008-unified-assistant-surface.md
//
// This module defines the contract only. It does NOT depend on React,
// rendering libraries, or runtime modules. Pure types so it can be consumed
// by tests, server-side validators, and renderers symmetrically.

import type { ConnectorProbeResult } from './probe';

// ─────────────────────────────────────────────────────────────────────────
// Workbench modes
// ─────────────────────────────────────────────────────────────────────────

/**
 * Runtime mode of the Unified Workbench. A connector advertises which modes
 * it supports via `ConnectorCapabilities`; `resolveAssistantMode()` picks
 * the highest-fidelity supported mode given an optional user preference.
 */
export type AssistantMode = 'native-embed' | 'verified' | 'hybrid';

/**
 * Ordered from least to most fidelity. The resolver prefers higher-fidelity
 * modes when capabilities allow.
 */
export const ASSISTANT_MODE_FIDELITY: Readonly<Record<AssistantMode, number>> = Object.freeze({
    'native-embed': 1,
    'verified': 2,
    'hybrid': 3,
});

// ─────────────────────────────────────────────────────────────────────────
// Connector type registry
// ─────────────────────────────────────────────────────────────────────────

/**
 * Canonical connector type tags. Mirrors `classifyConnectorType` in
 * `proxy/lib/connectorProbe.js` plus `responses-agent` (backend path #9,
 * not yet surfaced by the probe classifier — tracked separately).
 */
export type ConnectorType =
    | 'genie'
    | 'supervisor-local'
    | 'supervisor'
    | 'foundation-model'
    | 'openai-chat'
    | 'openai-analytics'
    | 'bedrock-rag'
    | 'bedrock-direct'
    | 'responses-agent'
    | 'generic';

export const CONNECTOR_TYPES: readonly ConnectorType[] = Object.freeze([
    'genie',
    'supervisor-local',
    'supervisor',
    'foundation-model',
    'openai-chat',
    'openai-analytics',
    'bedrock-rag',
    'bedrock-direct',
    'responses-agent',
    'generic',
]);

// ─────────────────────────────────────────────────────────────────────────
// Capability flags
// ─────────────────────────────────────────────────────────────────────────

/**
 * Capability flags for a single connector. Drives mode selection,
 * artifact validation strictness, and which workbench tabs render.
 *
 * Each flag is intentionally orthogonal — they describe what the
 * connector can do, not what it does on any single response.
 */
export interface ConnectorCapabilities {
    /**
     * Connector has a vendor-supplied chat UI that PulsePlay can iframe.
     * True for Genie (Embed Genie). False for API-only connectors.
     */
    readonly supportsNativeChatEmbed: boolean;

    /**
     * Connector returns provenance (SQL / rows / citation) sufficient for
     * a `Verified` artifact. True for analytics paths; false for chat-only.
     */
    readonly supportsVerifiedArtifacts: boolean;

    /**
     * Connector supports rendering Native Embed inside the artifact canvas
     * while PulsePlay rails surround it. Requires both supportsNativeChatEmbed
     * AND supportsVerifiedArtifacts (the rails need provenance to work).
     */
    readonly supportsHybrid: boolean;

    /**
     * Connector emits incremental reasoning / progress events. Drives the
     * `Reasoning` tab live-update behavior.
     */
    readonly supportsStreamingReasoning: boolean;

    /**
     * Connector returns SQL alongside results. Strict subset of
     * supportsVerifiedArtifacts. False for chat-only or RAG-only paths.
     */
    readonly supportsGroundedSql: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Artifact model
// ─────────────────────────────────────────────────────────────────────────

/**
 * Validation status emitted by the artifact validator. NEVER chosen by the
 * LLM. See `docs/UNIFIED_ASK_PULSE_WORKBENCH.md` "Brutal-honest accuracy
 * posture" for the contract.
 */
export type ArtifactStatus = 'verified' | 'grounded-draft' | 'suggestion' | 'blocked';

/**
 * Workbench tabs an artifact may render. Distinct from artifact `kind` —
 * an artifact has one kind but may surface in multiple tabs.
 */
export type WorkbenchTab = 'answer' | 'chart' | 'table' | 'sql' | 'evidence' | 'reasoning';

export const WORKBENCH_TABS: readonly WorkbenchTab[] = Object.freeze([
    'answer',
    'chart',
    'table',
    'sql',
    'evidence',
    'reasoning',
]);

/**
 * Provenance trace for a single claim. Either points at SQL/DAX/result rows
 * (grounded) or at a citation (RAG / pack knowledge / vendor narrative).
 */
export type ArtifactCitation =
    | { readonly kind: 'sql'; readonly statement: string; readonly statementId?: string }
    | { readonly kind: 'dax'; readonly expression: string }
    | { readonly kind: 'result-rows'; readonly statementId: string; readonly rowCount: number }
    | { readonly kind: 'vendor'; readonly source: string; readonly url?: string }
    | { readonly kind: 'pack'; readonly packId: string; readonly moduleId: string }
    | { readonly kind: 'vector'; readonly indexName: string; readonly chunkId: string };

/**
 * Tabular result row (column-typed). Strings only at the wire boundary;
 * renderers cast to the appropriate numeric/date type using the column type.
 */
export interface ArtifactResultTable {
    readonly columns: ReadonlyArray<{ readonly name: string; readonly type: string }>;
    readonly rows: ReadonlyArray<ReadonlyArray<string | number | null>>;
}

/**
 * Vega-Lite chart spec. Kept as an opaque JSON shape at this layer; the
 * chart registry (Step 5) compiles it to ECharts options. The validator
 * checks that any chart references a `dataCitation` before emit.
 */
export type ChartSpec = Readonly<Record<string, unknown>>;

/**
 * Markdown-only payload for the Answer tab. The validator strips any
 * embedded `<script>` / `<iframe>` / on* handlers before emit.
 */
export interface MarkdownPayload {
    readonly markdown: string;
}

/**
 * Reasoning trace as the connector reported it. Free-form per step.
 * Validator does NOT promote any reasoning step into a `Verified` claim.
 */
export interface ReasoningTrace {
    readonly steps: ReadonlyArray<{
        readonly label: string;
        readonly content: string;
        readonly atMs?: number;
    }>;
}

/**
 * A workbench artifact. Status is set by the validator. `tabs` lists which
 * workbench tabs can render this artifact; missing tabs are hidden, not
 * empty-stated.
 */
export interface WorkbenchArtifact {
    readonly id: string;
    readonly status: ArtifactStatus;
    readonly statusReason?: string;
    readonly tabs: ReadonlyArray<WorkbenchTab>;

    /** Markdown narrative for the Answer tab. */
    readonly answer?: MarkdownPayload;
    /** Vega-Lite chart spec — requires `dataCitation` to render. */
    readonly chart?: ChartSpec;
    /** Tabular result rows. */
    readonly table?: ArtifactResultTable;
    /** SQL or DAX shown in the SQL tab. */
    readonly sql?: string;
    /** Evidence chain shown in the Evidence tab. */
    readonly citations?: ReadonlyArray<ArtifactCitation>;
    /** Reasoning steps shown in the Reasoning tab. */
    readonly reasoning?: ReasoningTrace;

    /** Inspector-drawer telemetry. */
    readonly executionTimeMs?: number;
    readonly rowCount?: number;
    readonly sourceProfile?: string;
    readonly sourceConnectorType?: ConnectorType;
}

// ─────────────────────────────────────────────────────────────────────────
// Connector-axis surface descriptor
// ─────────────────────────────────────────────────────────────────────────

/**
 * Describes one assistant connector as a workbench source. Combines the
 * connector identity (from proxy /assistant/profiles) with capabilities
 * and an optional native-embed source URL.
 */
export interface AssistantConnectorDescriptor {
    /** Profile name from proxy /assistant/profiles. */
    readonly profile: string;
    readonly connectorType: ConnectorType;
    readonly capabilities: ConnectorCapabilities;
    readonly displayName?: string;
    /** Source URL for the native chat embed iframe; required when mode = native-embed or hybrid. */
    readonly nativeEmbedUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Mode resolution input
// ─────────────────────────────────────────────────────────────────────────

/**
 * Optional user preference for which mode the workbench should pick. The
 * resolver clamps to the highest-fidelity mode the connector capabilities
 * permit; `undefined` defers entirely to capabilities.
 */
export type AssistantModePreference = AssistantMode | undefined;

/**
 * Input to `resolveAssistantMode`. Provenance fields are reserved for
 * future use (e.g. forcing Verified when an artifact's grounded SQL is the
 * primary deliverable).
 */
export interface AssistantModeResolutionInput {
    readonly capabilities: ConnectorCapabilities;
    readonly preference?: AssistantModePreference;
    /** If true, force a mode that supports verified artifacts. */
    readonly requireVerified?: boolean;
    /** If true, force a mode that supports the native chat embed. */
    readonly requireNativeEmbed?: boolean;
}

export interface AssistantModeResolution {
    readonly mode: AssistantMode | null;
    readonly reason: 'capability' | 'preference' | 'forced-verified' | 'forced-native-embed' | 'no-mode-available';
}

// ─────────────────────────────────────────────────────────────────────────
// Probe → capability inference (re-exported for downstream wiring)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Re-export so downstream consumers can derive a connector descriptor from
 * a probe result without importing the probe module separately.
 */
export type { ConnectorProbeResult };
