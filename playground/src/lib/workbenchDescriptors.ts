// playground/src/lib/workbenchDescriptors.ts
//
// Builders that turn proxy profile metadata + embed configuration into
// AssistantConnectorDescriptor instances the workbench consumes.
//
// Step 2 of the Unified Ask Pulse Workbench build sequence.
// See: docs/UNIFIED_ASK_PULSE_WORKBENCH.md, docs/adr/0008-...
//
// The Genie builder intentionally reuses `buildGenieEmbedUrl()` from the
// BI-axis adapter so an admin-provided iframe field works for both the BI
// surface (BIPanel) and the assistant surface (GenieNativeEmbed). Single
// source of URL truth.

// Import the pure URL builder from the light ./embedUrl module, NOT the adapter
// entry point, so this (main-bundle) module doesn't statically pull in
// DatabricksGenieAdapter — that lets registry.loadAdapter code-split the adapter
// as a lazy chunk. (build-warning cleanup 2026-06-04)
import { buildGenieEmbedUrl } from '../../../bi-adapters/databricks-genie/embedUrl';
import { capabilitiesForConnector } from './connectorCapabilities';
import type { AssistantConnectorDescriptor, ConnectorType } from '../types/assistant';

// ─────────────────────────────────────────────────────────────────────────
// Genie descriptor builder
// ─────────────────────────────────────────────────────────────────────────

export interface GenieEmbedConfig {
    /** Full iframe code copied from Databricks Share > Embed space. */
    readonly iframe?: string;
    /** Full iframe src URL. Preferred when available. */
    readonly url?: string;
    /** Loose fallback when admins standardize an embed path. */
    readonly workspaceUrl?: string;
    readonly spaceId?: string;
    readonly embedPath?: string;
}

export interface BuildGenieDescriptorInput {
    readonly profile: string;
    readonly displayName?: string;
    /** Embed configuration; when absent or unresolvable, `nativeEmbedUrl` is omitted. */
    readonly embed?: GenieEmbedConfig;
}

/**
 * Build a Genie connector descriptor. `nativeEmbedUrl` is populated only when
 * the embed config resolves cleanly. Resolution failures are NOT thrown —
 * the workbench mode resolver downgrades to verified mode automatically when
 * the URL is missing.
 */
export function buildGenieDescriptor(input: BuildGenieDescriptorInput): AssistantConnectorDescriptor {
    const capabilities = capabilitiesForConnector('genie');

    let nativeEmbedUrl: string | undefined;
    if (input.embed) {
        try {
            // `buildGenieEmbedUrl` accepts a Record-typed config (BIEmbedConfig
            // extends Record<string, unknown>); our typed shape is a strict
            // subset, so the cast widens for the adapter call.
            const resolved = buildGenieEmbedUrl(input.embed as unknown as Parameters<typeof buildGenieEmbedUrl>[0]);
            if (resolved && resolved.trim()) {
                nativeEmbedUrl = resolved;
            }
        } catch {
            // Unresolvable embed config. The workbench will surface the
            // empty-state copy via GenieNativeEmbed, and the mode resolver
            // will pick `verified` when `nativeEmbedUrl` is absent.
            nativeEmbedUrl = undefined;
        }
    }

    return {
        profile: input.profile,
        connectorType: 'genie',
        capabilities,
        displayName: input.displayName,
        nativeEmbedUrl,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Generic descriptor builder
// ─────────────────────────────────────────────────────────────────────────

export interface BuildConnectorDescriptorInput {
    readonly profile: string;
    readonly connectorType: ConnectorType;
    readonly displayName?: string;
    /**
     * Optional pre-resolved native embed URL. Only populated for connectors
     * that advertise `supportsNativeChatEmbed`; otherwise ignored.
     */
    readonly nativeEmbedUrl?: string;
}

/**
 * Build a descriptor for any connector type. Capabilities come from the
 * matrix; `nativeEmbedUrl` is only attached when the connector supports it.
 *
 * Throws when the connector type is not in the registry — protects against
 * proxy responses with unexpected `type` strings being silently treated as
 * generic.
 */
export function buildConnectorDescriptor(input: BuildConnectorDescriptorInput): AssistantConnectorDescriptor {
    const capabilities = capabilitiesForConnector(input.connectorType);
    if (!capabilities) {
        throw new Error(
            `buildConnectorDescriptor: unknown connector type ${JSON.stringify(input.connectorType)}. ` +
            `Update CONNECTOR_TYPES in playground/src/types/assistant.ts and CONNECTOR_CAPABILITIES ` +
            `in playground/src/lib/connectorCapabilities.ts.`,
        );
    }
    const nativeEmbedUrl = capabilities.supportsNativeChatEmbed ? input.nativeEmbedUrl : undefined;

    return {
        profile: input.profile,
        connectorType: input.connectorType,
        capabilities,
        displayName: input.displayName,
        nativeEmbedUrl,
    };
}
