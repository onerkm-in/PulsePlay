/**
 * GenieBackend — adapter shim around the existing GenieClient.
 *
 * Session 53 spike for IDEA-023. GenieClient already implements both
 * SingleSpaceBackend and SupervisorBackend shapes via its `connectionMode`
 * discriminator. This file re-exports it under the BackendAdapter contract
 * so future code can import from `./backend/` instead of `./genie`.
 *
 * No runtime change — pure re-export with type assertions to surface
 * conformance. A future commit will refactor GenieClient to be split into
 * `GenieSingleSpaceBackend` and `GenieSupervisorBackend` so the discriminator
 * lives at construction time, not inside every method.
 */

import { GenieClient } from "../genie";
import { SingleSpaceBackend, SupervisorBackend, AnyBackend } from "./BackendAdapter";

/**
 * Helper that asserts a GenieClient instance satisfies the SingleSpaceBackend
 * interface. Use this when you want type-checking against the abstraction
 * rather than the concrete class. Runtime no-op — TypeScript-only.
 */
export function asSingleSpaceBackend(client: GenieClient): SingleSpaceBackend {
    return client as unknown as SingleSpaceBackend;
}

/**
 * Helper that asserts a GenieClient instance satisfies the SupervisorBackend
 * interface. Use only when `connectionMode === "supervisor"`.
 */
export function asSupervisorBackend(client: GenieClient): SupervisorBackend {
    return client as unknown as SupervisorBackend;
}

/**
 * Generic — returns the client typed as AnyBackend (single-space + supervisor
 * + extras). Most callers should use this since the visual already branches
 * on `connectionMode` internally and the GenieClient swallows the distinction.
 */
export function asBackend(client: GenieClient): AnyBackend {
    return client as unknown as AnyBackend;
}
