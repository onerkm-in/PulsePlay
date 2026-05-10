// playground/src/lib/probeClient.ts
//
// Connector-agnostic client for the Smart Connect probe endpoint. Issues
// a single POST to /api/assistant/probe (the Vite dev server proxies
// /api/* to the proxy at 127.0.0.1:8787 — see playground/vite.config.ts).
//
// The probe contract is defined in docs/CONNECTOR_PROBE_AND_SMART_CONNECT.md.
// This client deliberately knows NOTHING about Genie / OpenAI / Bedrock
// internals — every connector type returns the same canonical shape.

import type { ConnectorProbeResult } from "../types/probe";

/** Friendly error surfaced when the proxy host appears to be down. */
const PROXY_UNREACHABLE_MESSAGE =
    "Proxy unreachable — is `node server.js` running on 127.0.0.1:8787?";

/**
 * Probe a connector profile and return its canonical metadata + inference
 * result. Throws on non-2xx responses with a message taken from
 * `data.error` when the proxy supplied one, or a friendly fallback when the
 * proxy itself appears to be unreachable (network error / DNS / refused).
 */
export async function probeConnector(profile: string): Promise<ConnectorProbeResult> {
    let response: Response;
    try {
        response = await fetch("/api/assistant/probe", {
            method: "POST",
            // Agnostic on purpose — no provider-specific headers (the proxy
            // accepts X-PulsePlay-Key and the legacy X-Genie-Key alias when
            // shared-key auth is configured; the deployer's wrapper or
            // settings UI threads them through, not this client).
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assistantProfile: profile }),
        });
    } catch (err) {
        // fetch() rejects on network-level failures. We treat all of these as
        // "the proxy isn't reachable" — the user's most likely cause.
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`${PROXY_UNREACHABLE_MESSAGE} (${detail})`);
    }

    // Read the body once. Some error paths return non-JSON; tolerate both.
    let payload: unknown = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
    } else {
        try {
            payload = await response.text();
        } catch {
            payload = null;
        }
    }

    if (!response.ok) {
        const errorMessage = extractErrorMessage(payload, response.status);
        throw new Error(errorMessage);
    }

    if (!isProbeResultShape(payload)) {
        throw new Error("Probe returned an unexpected shape — missing required fields.");
    }

    return payload;
}

/** Best-effort extraction of an error string from an arbitrary payload. */
function extractErrorMessage(payload: unknown, status: number): string {
    if (payload && typeof payload === "object" && "error" in payload) {
        const raw = (payload as { error?: unknown }).error;
        if (typeof raw === "string" && raw.trim().length > 0) return raw;
    }
    if (typeof payload === "string" && payload.trim().length > 0) {
        return `HTTP ${status}: ${payload.slice(0, 200)}`;
    }
    return `HTTP ${status}`;
}

/**
 * Light shape validator — confirms the wire payload has the canonical
 * required fields. We deliberately do not validate every optional field;
 * the type system handles the rest at the call site.
 */
function isProbeResultShape(value: unknown): value is ConnectorProbeResult {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    if (typeof v.profile !== "string") return false;
    if (typeof v.connectorType !== "string") return false;
    if (
        v.metadataAvailability !== "rich" &&
        v.metadataAvailability !== "minimal" &&
        v.metadataAvailability !== "none"
    ) {
        return false;
    }
    if (typeof v.probeDurationMs !== "number") return false;
    return true;
}
