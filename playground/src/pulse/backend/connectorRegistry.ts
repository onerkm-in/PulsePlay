/**
 * connectorRegistry — single source of truth for connector types.
 *
 * Replaces scattered `if mode === "X"` branches across the codebase with one
 * declarative table. Each ConnectorDescriptor declares everything any
 * downstream consumer needs to know about a connector type:
 *
 *   - id          : the ConnectionMode discriminator
 *   - label       : dropdown / picker text
 *   - noun        : "Genie space" vs "Bedrock KB" vs "OpenAI deployment" — used
 *                   instead of hardcoded strings in setup form labels and
 *                   help text. Solves G1 (terminology coupling).
 *   - kind        : "single-space" | "supervisor" — drives UI affordances
 *   - fields      : declarative form schema (which inputs to render, what's
 *                   required, what's secret). Setup form iterates this list
 *                   instead of having one hardcoded JSX block per mode.
 *                   Solves G2 (scope/noOp metadata never enforced).
 *   - streaming   : true if this connector supports per-helper progress events.
 *                   Setup form hides the streaming UI and the visual skips
 *                   start-stream calls when false. Solves G6 (real-supervisor
 *                   streaming gap).
 *   - health      : implementation backing the "Test connection" button.
 *                   One uniform contract per connector. Solves G3.
 *   - factory     : returns an AnyBackend for the given config. The
 *                   BackendFactory just delegates here. Solves G4 (stub
 *                   constructors throwing) by letting each descriptor decide
 *                   whether to instantiate a real backend or surface a clean
 *                   "not yet wired" message in the UI.
 *
 * Adding a new connector becomes a 1-file change: add a new descriptor here.
 * The setup form, factory, settings dropdown, and Test Connection button all
 * pick it up automatically.
 */

import {
    AnyBackend,
    ConnectorKind,
} from "./BackendAdapter";
import { GenieClient, GenieConfig } from "../genie";
import { OpenAIBackend } from "./OpenAIBackend";
import { BedrockBackend } from "./BedrockBackend";

/** Health probe result — returned by ConnectorDescriptor.health(). */
export interface HealthResult {
    /** True iff the connection is reachable AND configured well enough to
     *  answer a question. False on auth failure, missing required fields,
     *  unreachable host, or any setup gap. */
    ok: boolean;
    /** Human-readable status sentence shown next to the Test Connection
     *  button. Keep under ~120 chars. */
    detail: string;
    /** Optional per-field error map (field id → error message) so the form
     *  can highlight specific inputs that need fixing. */
    fieldErrors?: Record<string, string>;
}

/** Field spec used by setupStep5's registry-driven renderer. Only the
 *  fields a connector actually needs are listed here — the form renders
 *  exactly these inputs and skips everything else. */
export interface ConnectorFieldSpec {
    /** Matches a key on GenieVisualSettings (e.g. "host", "spaceId"). */
    id: string;
    /** Form label. */
    label: string;
    /** Optional one-line hint shown under the input. */
    hint?: string;
    /** Input type — drives keyboard/autocomplete and password masking. */
    kind: "text" | "url" | "secret" | "select" | "textarea";
    /** True if the user must populate this for the connector to function.
     *  health() should fail-closed when a required field is missing. */
    required: boolean;
    /** For kind=select. */
    options?: { value: string; label: string }[];
    /** Optional placeholder text. */
    placeholder?: string;
}

export interface ConnectorDescriptor {
    /** ConnectionMode discriminator used everywhere else in the codebase. */
    id: GenieConfig["connectionMode"];
    /** User-facing label (dropdown, picker, badge). */
    label: string;
    /** Domain noun for setup form labels and help text. */
    noun: { single: string; plural: string };
    /** Whether this connector behaves as a single-space connector or a
     *  supervisor (multi-space + synthesis). */
    kind: ConnectorKind;
    /** True if the connector supports incremental progress events
     *  (start-stream). False for single-shot endpoints. */
    streaming: boolean;
    /** Whether this descriptor represents a fully-wired implementation or
     *  is a stub awaiting work. UI surfaces this as a "Coming soon" badge
     *  and skips Test Connection. */
    status: "ready" | "preview" | "stub";
    /** Setup-form field schema. */
    fields: ConnectorFieldSpec[];
    /** Health probe — backs the Test Connection button. */
    health(config: GenieConfig): Promise<HealthResult>;
    /** Factory — returns the backend adapter the visual will call.
     *  Stub descriptors return an adapter whose methods reject with a
     *  clear "not yet wired" message rather than crashing the visual. */
    factory(config: GenieConfig): AnyBackend;
}

// ── Field-spec building blocks ──────────────────────────────────────────
// Pulled out so descriptors compose them rather than repeat the strings.
// When the noun changes per connector (Genie space vs Bedrock KB), the
// labels are templated below.

const F_HOST: ConnectorFieldSpec = {
    id: "host",
    label: "Workspace host",
    hint: "Databricks workspace URL (https://...). Required for direct & gateway modes.",
    kind: "url",
    required: true,
    placeholder: "e.g. https://dbc-xxxx.cloud.databricks.com",
};

const F_API_BASE: ConnectorFieldSpec = {
    id: "apiBaseUrl",
    label: "Proxy API base URL",
    hint: "Where the visual calls the UniBridge proxy. Use 127.0.0.1, never localhost.",
    kind: "url",
    required: true,
    placeholder: "e.g. " + "http" + "://127.0.0.1:8787",
};

const F_TOKEN: ConnectorFieldSpec = {
    id: "token",
    label: "Personal access token",
    hint: "Databricks PAT for direct mode (browser → Databricks). Dev only.",
    kind: "secret",
    required: true,
};

const F_PROXY_KEY: ConnectorFieldSpec = {
    id: "proxyKey",
    label: "Proxy shared key",
    hint: "Optional — required only if the proxy enforces an X-Genie-Key header.",
    kind: "secret",
    required: false,
};

const F_PROFILE: ConnectorFieldSpec = {
    id: "assistantProfile",
    label: "Profile name",
    hint: "Profile key in proxy/config.json. The proxy maps this to the right backend.",
    kind: "text",
    required: false,
    placeholder: "sales",
};

function fieldSpaceId(noun: string): ConnectorFieldSpec {
    return {
        id: "spaceId",
        label: `${noun} ID`,
        hint: `ID of the ${noun} this profile points at. Direct mode only — proxy mode reads from proxy config.`,
        kind: "text",
        required: false,
    };
}

function fieldWarehouseId(noun: string): ConnectorFieldSpec {
    return {
        id: "warehouseId",
        label: "SQL Warehouse ID",
        hint: `Warehouse the ${noun} runs SQL against. Auto-resolved by proxy when omitted.`,
        kind: "text",
        required: false,
    };
}

// ── Health helpers ──────────────────────────────────────────────────────
// Each descriptor's health() funnels through these so the contract stays
// consistent. Returns ok=false on any thrown exception with the message.

async function probeXhr(url: string, headers: Record<string, string> = {}, timeoutMs = 8000): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.timeout = timeoutMs;
        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText.slice(0, 500) });
        xhr.onerror = () => reject(new Error(`Network error reaching ${url}`));
        xhr.ontimeout = () => reject(new Error(`Timeout (${timeoutMs}ms) reaching ${url}`));
        xhr.send();
    });
}

async function healthProxyBased(config: GenieConfig, profileKey: string): Promise<HealthResult> {
    const fieldErrors: Record<string, string> = {};
    if (!config.apiBaseUrl?.trim()) fieldErrors.apiBaseUrl = "Required for proxy mode.";
    if (Object.keys(fieldErrors).length) {
        return { ok: false, detail: "Missing required fields.", fieldErrors };
    }
    // After the fieldErrors guard above, apiBaseUrl is guaranteed present.
    const base = (config.apiBaseUrl ?? "").replace(/\/$/, "");
    try {
        const resp = await probeXhr(`${base}/health`);
        if (resp.status >= 200 && resp.status < 300) {
            // Verify the named profile is registered
            const profilesResp = await probeXhr(`${base}/assistant/profiles`);
            const has = /"name"\s*:\s*"([^"]+)"/g;
            const found: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = has.exec(profilesResp.text)) !== null) found.push(m[1]);
            if (profileKey && !found.includes(profileKey)) {
                return {
                    ok: false,
                    detail: `Proxy reachable but profile "${profileKey}" not registered. Available: ${found.join(", ") || "(none)"}.`,
                    fieldErrors: { assistantProfile: `Not in proxy/config.json` },
                };
            }
            return { ok: true, detail: `Proxy reachable; profile "${profileKey}" registered.` };
        }
        return { ok: false, detail: `Proxy returned HTTP ${resp.status}.` };
    } catch (err: any) {
        return { ok: false, detail: err?.message || "Network error" };
    }
}

async function healthDirect(config: GenieConfig): Promise<HealthResult> {
    const fieldErrors: Record<string, string> = {};
    if (!config.host?.trim()) fieldErrors.host = "Required.";
    if (!config.token?.trim()) fieldErrors.token = "Required.";
    if (!config.spaceId?.trim()) fieldErrors.spaceId = "Required for direct mode.";
    if (Object.keys(fieldErrors).length) {
        return { ok: false, detail: "Missing required fields.", fieldErrors };
    }
    const host = config.host.replace(/\/$/, "");
    try {
        const resp = await probeXhr(`${host}/api/2.0/preview/scim/v2/Me`, { Authorization: `Bearer ${config.token}` });
        if (resp.status === 200) return { ok: true, detail: "Authenticated to Databricks workspace." };
        if (resp.status === 401 || resp.status === 403) return { ok: false, detail: "PAT rejected by Databricks (401/403)." };
        return { ok: false, detail: `Databricks returned HTTP ${resp.status}.` };
    } catch (err: any) {
        return { ok: false, detail: err?.message || "Network error" };
    }
}

async function healthSupervisor(config: GenieConfig): Promise<HealthResult> {
    if (!config.apiBaseUrl?.trim()) {
        return { ok: false, detail: "Proxy API base URL required.", fieldErrors: { apiBaseUrl: "Required" } };
    }
    const base = config.apiBaseUrl.replace(/\/$/, "");
    try {
        const resp = await probeXhr(`${base}/supervisor/health`);
        if (resp.status >= 200 && resp.status < 300) {
            // Parse mode — supervisor-local vs supervisor (real Mosaic agent)
            const modeMatch = resp.text.match(/"mode"\s*:\s*"([^"]+)"/);
            const mode = modeMatch ? modeMatch[1] : "unknown";
            return { ok: true, detail: `Supervisor up (mode=${mode}).` };
        }
        return { ok: false, detail: `Supervisor returned HTTP ${resp.status}.` };
    } catch (err: any) {
        return { ok: false, detail: err?.message || "Network error" };
    }
}

// ── Concrete descriptors ────────────────────────────────────────────────

const GENIE_NOUN = { single: "Genie space", plural: "Genie spaces" };

const PROXY_DESCRIPTOR: ConnectorDescriptor = {
    id: "proxy",
    label: "Databricks Genie (via proxy)",
    noun: GENIE_NOUN,
    kind: "single-space",
    streaming: true,
    status: "ready",
    fields: [F_API_BASE, F_PROFILE, F_PROXY_KEY, fieldSpaceId(GENIE_NOUN.single), fieldWarehouseId(GENIE_NOUN.single)],
    health: (config) => healthProxyBased(config, config.assistantProfile || "default"),
    factory: (config) => new GenieClient(config) as unknown as AnyBackend,
};

const AUTO_DESCRIPTOR: ConnectorDescriptor = {
    id: "auto",
    label: "Auto (proxy if available, else direct)",
    noun: GENIE_NOUN,
    kind: "single-space",
    streaming: true,
    status: "ready",
    fields: [F_API_BASE, F_HOST, F_TOKEN, F_PROFILE, fieldSpaceId(GENIE_NOUN.single)],
    health: async (config) => {
        // Probe proxy first; fall back to direct check if no proxy URL set.
        if (config.apiBaseUrl?.trim()) {
            const r = await healthProxyBased(config, config.assistantProfile || "default");
            if (r.ok) return { ok: true, detail: `Auto → proxy. ${r.detail}` };
        }
        const r = await healthDirect(config);
        return { ok: r.ok, detail: `Auto → direct. ${r.detail}`, fieldErrors: r.fieldErrors };
    },
    factory: (config) => new GenieClient(config) as unknown as AnyBackend,
};

const DIRECT_DESCRIPTOR: ConnectorDescriptor = {
    id: "direct",
    label: "Databricks Genie (direct, browser → Databricks)",
    noun: GENIE_NOUN,
    kind: "single-space",
    streaming: false,
    status: "ready",
    fields: [F_HOST, F_TOKEN, fieldSpaceId(GENIE_NOUN.single), fieldWarehouseId(GENIE_NOUN.single)],
    health: healthDirect,
    factory: (config) => new GenieClient(config) as unknown as AnyBackend,
};

const GATEWAY_DESCRIPTOR: ConnectorDescriptor = {
    id: "gateway",
    // Wave 30 cycle 6 — explicit "(preview)" suffix in the user-facing label
    // so authors don't accidentally pick this in a live demo. The factory
    // returns a regular GenieClient today (descriptor present, end-to-end
    // wiring in flight). See PEPPULSE_NARRATIVE_AUDIT.md demo risk #1.
    label: "Databricks AI Gateway / MCP (preview)",
    noun: GENIE_NOUN,
    kind: "single-space",
    streaming: false,
    status: "preview",
    fields: [F_HOST, F_TOKEN, fieldSpaceId(GENIE_NOUN.single)],
    health: healthDirect,
    factory: (config) => new GenieClient(config) as unknown as AnyBackend,
};

const SUPERVISOR_DESCRIPTOR: ConnectorDescriptor = {
    id: "supervisor",
    label: "Supervisor agent (multi-source orchestrator)",
    noun: { single: "data source", plural: "data sources" },
    kind: "supervisor",
    // Real Mosaic AI supervisor agents don't expose start-stream; the proxy
    // rejects /supervisor/conversations/start-stream for type=supervisor and
    // accepts it only for type=supervisor-local. The visual skips streaming
    // UI when the descriptor declares streaming=false. (G6.)
    streaming: false,
    status: "ready",
    fields: [F_API_BASE, F_PROFILE, F_PROXY_KEY],
    health: healthSupervisor,
    factory: (config) => new GenieClient(config) as unknown as AnyBackend,
};

const AZURE_OPENAI_NOUN = { single: "Azure OpenAI deployment", plural: "Azure OpenAI deployments" };
const AZURE_OPENAI_DESCRIPTOR: ConnectorDescriptor = {
    id: "azure-openai",
    label: "Azure OpenAI",
    noun: AZURE_OPENAI_NOUN,
    kind: "single-space",
    streaming: false,
    status: "ready",
    fields: [F_API_BASE, F_PROFILE, F_PROXY_KEY],
    health: async (config) => {
        if (!config.apiBaseUrl?.trim()) {
            return { ok: false, detail: "Proxy API base URL required.", fieldErrors: { apiBaseUrl: "Required" } };
        }
        const base = config.apiBaseUrl.replace(/\/$/, "");
        try {
            const resp = await probeXhr(`${base}/openai/health`);
            if (resp.status >= 200 && resp.status < 300) return { ok: true, detail: "Azure OpenAI proxy route reachable." };
            return { ok: false, detail: `OpenAI route returned HTTP ${resp.status}.` };
        } catch (err: any) {
            return { ok: false, detail: err?.message || "Network error" };
        }
    },
    factory: (config) => new OpenAIBackend(config) as unknown as AnyBackend,
};

const BEDROCK_NOUN = { single: "Bedrock knowledge base", plural: "Bedrock knowledge bases" };
const BEDROCK_DESCRIPTOR: ConnectorDescriptor = {
    id: "bedrock",
    label: "AWS Bedrock",
    noun: BEDROCK_NOUN,
    kind: "single-space",
    streaming: false,
    status: "ready",
    fields: [F_API_BASE, F_PROFILE, F_PROXY_KEY],
    health: async (config) => {
        if (!config.apiBaseUrl?.trim()) {
            return { ok: false, detail: "Proxy API base URL required.", fieldErrors: { apiBaseUrl: "Required" } };
        }
        const base = config.apiBaseUrl.replace(/\/$/, "");
        try {
            const resp = await probeXhr(`${base}/bedrock/health`);
            if (resp.status >= 200 && resp.status < 300) return { ok: true, detail: "Bedrock proxy route reachable." };
            return { ok: false, detail: `Bedrock route returned HTTP ${resp.status}.` };
        } catch (err: any) {
            return { ok: false, detail: err?.message || "Network error" };
        }
    },
    factory: (config) => new BedrockBackend(config) as unknown as AnyBackend,
};

// ── The registry ────────────────────────────────────────────────────────

export const CONNECTOR_REGISTRY: ConnectorDescriptor[] = [
    AUTO_DESCRIPTOR,
    PROXY_DESCRIPTOR,
    DIRECT_DESCRIPTOR,
    GATEWAY_DESCRIPTOR,
    SUPERVISOR_DESCRIPTOR,
    AZURE_OPENAI_DESCRIPTOR,
    BEDROCK_DESCRIPTOR,
];

/** Look up a descriptor by mode id. Returns the AUTO descriptor as a safe
 *  fallback when an unknown mode is encountered (e.g. config from a future
 *  visual version). */
export function getDescriptor(mode: GenieConfig["connectionMode"]): ConnectorDescriptor {
    return CONNECTOR_REGISTRY.find((d) => d.id === mode) || AUTO_DESCRIPTOR;
}

/** Used by the format-pane dropdown — returns label + value pairs in the
 *  registry's declared order so the UI lists them consistently with how
 *  they're documented. */
export function listModes(): { value: string; label: string; status: ConnectorDescriptor["status"] }[] {
    return CONNECTOR_REGISTRY
        .filter((d): d is ConnectorDescriptor & { id: string } => typeof d.id === "string" && d.id.length > 0)
        .map((d) => ({ value: d.id, label: d.label, status: d.status }));
}
