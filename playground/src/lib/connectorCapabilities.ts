// playground/src/lib/connectorCapabilities.ts
//
// Connector capability matrix + mode resolver for the Unified Workbench.
//
// Canonical doc: docs/UNIFIED_ASK_PULSE_WORKBENCH.md
// ADR: docs/adr/0008-unified-assistant-surface.md
//
// This module is pure and side-effect free. It is consumed by the workbench
// shell (Step 3+), by tests, and by future tooling (capability admin UI,
// connector probe-to-descriptor adapters). No UI imports.

import type {
    AssistantMode,
    AssistantModeResolution,
    AssistantModeResolutionInput,
    ConnectorCapabilities,
    ConnectorType,
} from '../types/assistant';
import { ASSISTANT_MODE_FIDELITY, CONNECTOR_TYPES } from '../types/assistant';

// ─────────────────────────────────────────────────────────────────────────
// Capability matrix
// ─────────────────────────────────────────────────────────────────────────
//
// One row per ConnectorType. Updates here MUST also update tests in
// __tests__/connectorCapabilities.test.ts and the matrix table in
// docs/UNIFIED_ASK_PULSE_WORKBENCH.md.

const cap = (
    supportsNativeChatEmbed: boolean,
    supportsVerifiedArtifacts: boolean,
    supportsHybrid: boolean,
    supportsStreamingReasoning: boolean,
    supportsGroundedSql: boolean,
): ConnectorCapabilities => Object.freeze({
    supportsNativeChatEmbed,
    supportsVerifiedArtifacts,
    supportsHybrid,
    supportsStreamingReasoning,
    supportsGroundedSql,
});

export const CONNECTOR_CAPABILITIES: Readonly<Record<ConnectorType, ConnectorCapabilities>> = Object.freeze({
    // Genie: Conversation API returns SQL + rows + narrative; Embed Genie iframe
    // is in public preview; hybrid composes both.
    'genie':            cap(true,  true,  true,  true,  true),

    // Supervisor (local fan-out + synthesis): verified via the synthesis layer,
    // streaming via the staggered fan-out (ADR-0003), no native UI, no hybrid.
    'supervisor-local': cap(false, true,  false, true,  true),

    // Supervisor (Mosaic AI Supervisor Agent endpoint): same workbench-facing
    // shape as supervisor-local; the difference is who orchestrates.
    'supervisor':       cap(false, true,  false, true,  true),

    // Foundation Model (Mosaic AI serving endpoint): OpenAI-compatible chat-
    // completions with optional structured output. No native UI. Grounded
    // SQL is true when paired with a Genie data path (Phase 11b symmetry).
    'foundation-model': cap(false, true,  false, true,  true),

    // Azure OpenAI chat-only: text answers only, no analytics pipeline.
    // Verified status only for grounded narrative; can never emit a
    // Verified chart/table because there's no result source.
    'openai-chat':      cap(false, true,  false, true,  false),

    // Azure OpenAI analytics: orchestrates LLM-for-SQL -> Databricks SQL exec
    // -> LLM-for-narrative. Returns SQL + rows + narrative.
    'openai-analytics': cap(false, true,  false, true,  true),

    // Bedrock RAG: returns citations via Knowledge Base lookups but no SQL.
    'bedrock-rag':      cap(false, true,  false, true,  false),

    // Bedrock direct: chat-only model invocation; no SQL or citations.
    'bedrock-direct':   cap(false, true,  false, true,  false),

    // ResponsesAgent (Mosaic AI ResponsesAgent endpoint): verified via the
    // agent's response contract, streaming via incremental events. No native
    // UI surface to embed. Grounded SQL depends on the agent's tool wiring;
    // default to true since the agent contract requires tool-result provenance
    // for any returned table.
    'responses-agent':  cap(false, true,  false, true,  true),

    // Generic: any-iframe or unidentified profile. Cannot promise verified
    // artifacts. Workbench will degrade to free-text Suggestion-only output.
    'generic':          cap(false, false, false, false, false),
});

// ─────────────────────────────────────────────────────────────────────────
// Capability accessors
// ─────────────────────────────────────────────────────────────────────────

export function capabilitiesForConnector(type: ConnectorType): ConnectorCapabilities {
    return CONNECTOR_CAPABILITIES[type];
}

/**
 * Returns the modes a connector with the given capabilities CAN run in,
 * in fidelity order (highest first). Pure derivation from the flags.
 */
export function supportedModes(capabilities: ConnectorCapabilities): readonly AssistantMode[] {
    const modes: AssistantMode[] = [];
    if (capabilities.supportsHybrid && capabilities.supportsNativeChatEmbed && capabilities.supportsVerifiedArtifacts) {
        modes.push('hybrid');
    }
    if (capabilities.supportsVerifiedArtifacts) {
        modes.push('verified');
    }
    if (capabilities.supportsNativeChatEmbed) {
        modes.push('native-embed');
    }
    return modes.sort((a, b) => ASSISTANT_MODE_FIDELITY[b] - ASSISTANT_MODE_FIDELITY[a]);
}

// ─────────────────────────────────────────────────────────────────────────
// Mode resolution
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pick the workbench mode for a given connector + optional preference.
 *
 * Policy:
 *   1. If `requireVerified`, drop any mode that does not support verified
 *      artifacts; if no mode survives, return null.
 *   2. If `requireNativeEmbed`, drop any mode that does not support the
 *      native embed; if no mode survives, return null.
 *   3. If `preference` is supplied AND the connector supports it, use it.
 *   4. Otherwise, pick the highest-fidelity supported mode.
 *
 * Never returns a mode that the connector does not advertise as supported.
 * The LLM cannot expand the supported set; only the capability matrix can.
 */
export function resolveAssistantMode(input: AssistantModeResolutionInput): AssistantModeResolution {
    let modes = supportedModes(input.capabilities);

    if (input.requireVerified) {
        modes = modes.filter(modeSupportsVerified);
        if (modes.length === 0) {
            return { mode: null, reason: 'forced-verified' };
        }
    }

    if (input.requireNativeEmbed) {
        modes = modes.filter(modeRequiresNativeEmbed);
        if (modes.length === 0) {
            return { mode: null, reason: 'forced-native-embed' };
        }
    }

    if (input.preference && modes.includes(input.preference)) {
        return { mode: input.preference, reason: 'preference' };
    }

    if (modes.length === 0) {
        return { mode: null, reason: 'no-mode-available' };
    }

    return { mode: modes[0], reason: 'capability' };
}

function modeSupportsVerified(mode: AssistantMode): boolean {
    // Verified and Hybrid both require verified artifacts. Native-embed alone
    // does not — the native chat surface is opaque to PulsePlay's validator.
    return mode === 'verified' || mode === 'hybrid';
}

function modeRequiresNativeEmbed(mode: AssistantMode): boolean {
    return mode === 'native-embed' || mode === 'hybrid';
}

// ─────────────────────────────────────────────────────────────────────────
// Matrix introspection (for tests and admin tooling)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns the set of connector types whose capabilities equal the given
 * predicate. Useful for tests that assert "no chat-only connector advertises
 * supportsGroundedSql".
 */
export function connectorsMatching(
    predicate: (caps: ConnectorCapabilities, type: ConnectorType) => boolean,
): readonly ConnectorType[] {
    return CONNECTOR_TYPES.filter((type) => predicate(CONNECTOR_CAPABILITIES[type], type));
}
