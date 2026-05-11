/**
 * BackendFactory — IDEA-023 phase 3 dispatch layer.
 *
 * Now delegates to the connectorRegistry: every connector type declares its
 * own factory in one place (connectorRegistry.ts). Adding a new backend is a
 * single-file change there — no edits required to this file or to callers.
 *
 * The factory contract returns AnyBackend, which has every method the visual
 * already calls on GenieClient (plus the Extras for proxy-only operations).
 */

import { GenieConfig } from "../genie";
import { AnyBackend, ConnectorKind } from "./BackendAdapter";
import { CONNECTOR_REGISTRY, getDescriptor } from "./connectorRegistry";

/**
 * Decide whether a config wants a single-space or supervisor connector.
 * Reads the descriptor's declared kind so the answer stays in sync with
 * however connectorRegistry classifies each mode.
 */
export function connectorKindFor(config: GenieConfig): ConnectorKind {
    return getDescriptor(config.connectionMode).kind;
}

/**
 * Create a backend adapter for the given config. Iterates the connector
 * registry to find the descriptor matching `connectionMode`, then calls
 * its declared factory. Stub descriptors return an adapter whose methods
 * surface a clear "not yet wired" error rather than crashing the visual.
 */
export function createBackend(config: GenieConfig): AnyBackend {
    return getDescriptor(config.connectionMode).factory(config);
}

/** Re-export for callers that want to walk all known connectors (e.g.
 *  populating a dropdown of available modes). */
export { CONNECTOR_REGISTRY, getDescriptor };
