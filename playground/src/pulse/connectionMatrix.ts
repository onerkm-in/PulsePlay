// Connection matrix — splits the on-disk ConnectionMode enum into two
// orthogonal user-facing dimensions so the Setup form can render as a
// process-driven parent → child flow:
//
//   Step 1 · Transport  (how the visual reaches the backend)
//   Step 2 · Backend    (what sits on the other end)
//   Step 3 · Details    (only fields required by the chosen pair)
//
// Persistence still rides on the existing `connectionMode` enum — encode()
// and decode() keep the on-disk shape stable so existing .pbip files load
// unchanged and downstream code in genie.ts / visual.tsx / proxy keeps
// branching on connectionMode as before.

import { ConnectionMode } from "./settings";

export type Transport = "auto" | "direct" | "proxy" | "gateway";

export type Backend = "genie-single" | "genie-supervisor" | "azure-openai" | "bedrock" | "foundation-model";

export interface PairView {
    transport: Transport;
    backend: Backend;
}

export interface PairSupport {
    ok: boolean;
    /** Short reason shown inline next to a disabled Backend option. */
    reason?: string;
}

export interface FieldRequirement {
    /** Property name on GenieVisualSettings. */
    name: "apiBaseUrl" | "host" | "assistantProfile" | "spaceId" | "token" | "warehouseId" | "proxyKey";
    /** Required for the chosen pair vs. optional. */
    required: boolean;
}

export const TRANSPORT_LABELS: Record<Transport, { label: string; hint: string }> = {
    auto:    { label: "Auto",    hint: "Use Proxy when configured, otherwise fall back to Direct." },
    proxy:   { label: "Proxy",   hint: "Route through the PulsePlay Proxy. Recommended for production — credentials stay server-side." },
    direct:  { label: "Direct",  hint: "Browser calls Databricks Genie REST directly with a PAT. Dev / demo only — token lives in the .pbix file." },
    gateway: { label: "Gateway", hint: "Route through Databricks AI Gateway / MCP. Experimental — single Genie space only." }
};

export const BACKEND_LABELS: Record<Backend, { label: string; hint: string }> = {
    "genie-single":     { label: "Databricks Genie — single space",       hint: "One Genie space answers every question. Most common starting point." },
    "genie-supervisor": { label: "Genie Supervisor — multi-space fusion", hint: "Server-side orchestrator fans out to multiple Genie spaces and fuses one unified answer." },
    "azure-openai":     { label: "Azure OpenAI",                          hint: "Route questions through the proxy to an Azure OpenAI Chat Completions deployment." },
    "bedrock":          { label: "AWS Bedrock Knowledge Base",            hint: "Route questions through the proxy to an AWS Bedrock Retrieve-and-Generate endpoint." },
    "foundation-model": { label: "Databricks Foundation Model",           hint: "Route questions through the proxy to a Databricks Mosaic AI model-serving endpoint. Workaround for Genie Agent Mode UI-only limitation." }
};

/** Read-only enumeration in declared display order. */
export const TRANSPORTS: readonly Transport[] = ["proxy", "auto", "direct", "gateway"];
export const BACKENDS:   readonly Backend[]   = ["genie-single", "genie-supervisor", "azure-openai", "bedrock", "foundation-model"];

/**
 * Decode the on-disk `connectionMode` enum into the two-dimensional view the
 * Setup form renders. Stable for every value of ConnectionMode — exhaustive
 * to keep the TS compiler honest if a new connectionMode is ever added.
 */
export function decode(mode: ConnectionMode): PairView {
    switch (mode) {
        case "auto":         return { transport: "auto",    backend: "genie-single" };
        case "proxy":        return { transport: "proxy",   backend: "genie-single" };
        case "direct":       return { transport: "direct",  backend: "genie-single" };
        case "gateway":      return { transport: "gateway", backend: "genie-single" };
        case "supervisor":   return { transport: "proxy",   backend: "genie-supervisor" };
        case "azure-openai":     return { transport: "proxy", backend: "azure-openai" };
        case "bedrock":          return { transport: "proxy", backend: "bedrock" };
        case "foundation-model": return { transport: "proxy", backend: "foundation-model" };
        default: {
            const _exhaustive: never = mode;
            return _exhaustive;
        }
    }
}

/**
 * Encode a (transport, backend) pair back into the on-disk ConnectionMode.
 * If the pair is unsupported (see SUPPORT_MATRIX), the encoder still picks
 * the most reasonable enum value — the caller is responsible for refusing
 * to Apply when isSupported(...) returns ok:false.
 */
export function encode(transport: Transport, backend: Backend): ConnectionMode {
    if (backend === "azure-openai")     return "azure-openai";
    if (backend === "bedrock")          return "bedrock";
    if (backend === "foundation-model") return "foundation-model";
    if (backend === "genie-supervisor") return "supervisor";
    // backend is "genie-single" — transport drives the enum.
    switch (transport) {
        case "direct":  return "direct";
        case "gateway": return "gateway";
        case "auto":    return "auto";
        case "proxy":   return "proxy";
        default: {
            const _exhaustive: never = transport;
            return _exhaustive;
        }
    }
}

/**
 * Validity matrix. Returns `{ ok: true }` for supported pairs and
 * `{ ok: false, reason }` for disabled cells — the reason is shown inline
 * next to the Backend option in the form.
 */
export function isSupported(transport: Transport, backend: Backend): PairSupport {
    // Genie single space works on every transport.
    if (backend === "genie-single") return { ok: true };

    // Everything else requires Proxy explicitly. Auto isn't enough because
    // Auto can fall back to Direct, and Supervisor / Azure OpenAI / Bedrock
    // routing all live server-side in the proxy.
    if (transport === "proxy") return { ok: true };

    if (backend === "genie-supervisor") {
        if (transport === "auto")    return { ok: false, reason: "Supervisor needs Proxy explicitly — Auto can fall back to Direct, which has no orchestrator." };
        if (transport === "direct")  return { ok: false, reason: "Supervisor fan-out and fusion happen server-side in the Proxy." };
        if (transport === "gateway") return { ok: false, reason: "Gateway is single-space MCP only — no multi-space orchestration." };
    }

    if (backend === "azure-openai") {
        if (transport === "auto")    return { ok: false, reason: "Azure OpenAI requires Proxy explicitly — Auto might fall back to Direct, which can't reach Azure." };
        if (transport === "direct")  return { ok: false, reason: "Browser cannot call Azure OpenAI directly — CORS is not enabled on the Azure endpoint." };
        if (transport === "gateway") return { ok: false, reason: "Databricks AI Gateway routes Genie traffic only — Azure OpenAI is not a supported backend." };
    }

    if (backend === "bedrock") {
        if (transport === "auto")    return { ok: false, reason: "AWS Bedrock requires Proxy explicitly — Auto might fall back to Direct, which can't sign AWS requests." };
        if (transport === "direct")  return { ok: false, reason: "Browser cannot call AWS Bedrock directly — SigV4 signing isn't possible from the visual." };
        if (transport === "gateway") return { ok: false, reason: "Databricks AI Gateway routes Genie traffic only — AWS Bedrock is not a supported backend." };
    }

    if (backend === "foundation-model") {
        if (transport === "auto")    return { ok: false, reason: "Foundation Model requires Proxy explicitly — Auto might fall back to Direct, and the model-serving invocation runs server-side." };
        if (transport === "direct")  return { ok: false, reason: "Browser cannot call the model-serving endpoint directly — auth + the /invocations route live behind the proxy." };
        if (transport === "gateway") return { ok: false, reason: "Databricks AI Gateway routes Genie traffic only — Foundation Model endpoints are not a supported backend here." };
    }

    return { ok: false, reason: "Unsupported combination." };
}

/**
 * Field requirements for the chosen pair. Drives the Step 3 details form so
 * authors only see the inputs that actually matter. Keep in sync with the
 * connection-resolution logic in genie.ts and proxy/server.js.
 */
export function requiredFields(transport: Transport, backend: Backend): FieldRequirement[] {
    const fields: FieldRequirement[] = [];

    // Transport-level fields.
    if (transport === "proxy" || transport === "auto") {
        fields.push({ name: "apiBaseUrl", required: transport === "proxy" });
        fields.push({ name: "proxyKey",   required: false });
    }
    if (transport === "direct" || transport === "auto" || transport === "gateway") {
        fields.push({ name: "host",  required: transport !== "auto" });
    }
    if (transport === "direct" || transport === "gateway") {
        fields.push({ name: "token",   required: true });
        fields.push({ name: "spaceId", required: true });
    }
    if (transport === "direct") {
        fields.push({ name: "warehouseId", required: false });
    }

    // Backend-level fields.
    if ((transport === "proxy" || transport === "auto") && (
            backend === "genie-single" ||
            backend === "genie-supervisor" ||
            backend === "azure-openai" ||
            backend === "bedrock" ||
            backend === "foundation-model"
        )) {
        fields.push({ name: "assistantProfile", required: backend !== "genie-single" });
    }

    // Deduplicate while preserving the first occurrence order. Required wins
    // over optional if a field appears twice.
    const seen = new Map<string, FieldRequirement>();
    for (const f of fields) {
        const prev = seen.get(f.name);
        if (!prev) seen.set(f.name, f);
        else if (f.required && !prev.required) seen.set(f.name, f);
    }
    return Array.from(seen.values());
}
