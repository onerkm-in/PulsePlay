/**
 * FoundationModelBackend — SingleSpaceBackend that proxies to a
 * Databricks Mosaic AI Foundation Model serving endpoint via the proxy's
 * `/foundation/*` routes. Wired against the shared ProxyChatBackend so
 * the only Foundation-Model-specific bit is the route prefix + label.
 *
 * Why this exists (PulsePlay):
 *   Pulse's audit flagged this connector type as the "Genie Agent Mode
 *   is UI-only" workaround — the public REST `force_deep_research_planning`
 *   flag was silently swallowed, but a serving endpoint pointing at the
 *   same supervisor agent does honour the flag. The proxy already has
 *   the foundationModelClient.js implementation and a `/foundation/health`
 *   route; the frontend just needed a ConnectorDescriptor to make this
 *   selectable in the Setup form (was the only proxy-backed connector
 *   without one — closes the symmetry gap from the audit).
 *
 * Profile fields the proxy expects (set in proxy/config.json):
 *   type:                  "foundation-model"
 *   host:                  Databricks workspace URL
 *   token:                 PAT (or use OAuth M2M via proxy)
 *   foundationEndpoint:    Model-serving endpoint name (NOT a Genie space ID)
 *
 * For production, swap PAT for a service-principal-issued OAuth M2M
 * token stored in a Databricks secret scope. The proxy reads the
 * endpoint name + workspace from config.json and forwards each
 * /foundation/conversations/start to the endpoint's /invocations route.
 */

import { GenieConfig } from "../genie";
import { ProxyChatBackend } from "./proxyChatBackend";

export class FoundationModelBackend extends ProxyChatBackend {
    constructor(config: GenieConfig) {
        super(config, "foundation", "Foundation Model");
    }
}
