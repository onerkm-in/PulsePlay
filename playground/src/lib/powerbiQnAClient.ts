// playground/src/lib/powerbiQnAClient.ts
//
// Cycle 15.5 — fetches a short-lived embed token from the proxy's
// POST /api/powerbi/qna/embed-token route. The SP credentials never
// reach the browser; only the embed token + dataset coordinates do.
//
// Pair with `<PowerBiQnA />` which uses the powerbi-client SDK to mount
// the Q&A surface in a div.

const PROXY_UNREACHABLE_MESSAGE =
    "Proxy unreachable — is `node server.js` running on 127.0.0.1:8787?";

const PROFILE_NAME_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

export interface PowerBiQnAEmbedConfig {
    accessToken: string;
    embedUrl: string;
    datasetId: string;
    groupId: string;
    expiresAt: number;
    tokenType: "Embed";
}

export class PowerBiQnAInvalidProfileError extends Error {
    constructor(profile: string) {
        super(
            `Profile name "${profile.slice(0, 64)}" contains characters not allowed. ` +
            `Names must be 1-128 chars of [a-zA-Z0-9._-].`,
        );
        this.name = "PowerBiQnAInvalidProfileError";
    }
}

/**
 * Fetch a Q&A embed token for the given profile name (or auto-resolved
 * default when omitted). Throws with a user-friendly message on:
 *   - invalid profile name (client-side sanitisation)
 *   - network / proxy-unreachable failures
 *   - 4xx/5xx from the proxy
 *
 * @param profile  Profile name. When omitted, the proxy auto-resolves the
 *                 first powerbi-semantic-model profile in the allowlist.
 */
export async function fetchQnAEmbedConfig(profile?: string): Promise<PowerBiQnAEmbedConfig> {
    const cleaned = (profile ?? "").trim();
    if (cleaned && !PROFILE_NAME_REGEX.test(cleaned)) {
        throw new PowerBiQnAInvalidProfileError(cleaned);
    }

    let response: Response;
    try {
        response = await fetch("/api/powerbi/qna/embed-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cleaned ? { profile: cleaned } : {}),
        });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`${PROXY_UNREACHABLE_MESSAGE} (${detail})`);
    }

    let payload: unknown = null;
    const ct = response.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        try { payload = await response.json(); } catch { payload = null; }
    } else {
        try { payload = await response.text(); } catch { payload = null; }
    }

    if (!response.ok) {
        throw new Error(extractErrorMessage(payload, response.status));
    }

    if (!isEmbedConfigShape(payload)) {
        throw new Error("Power BI Q&A embed-token response was missing required fields (accessToken, embedUrl, datasetId, groupId).");
    }
    return payload;
}

function extractErrorMessage(payload: unknown, status: number): string {
    if (payload && typeof payload === "object") {
        const obj = payload as Record<string, unknown>;
        // Problem+JSON shape (proxy slice 1b+).
        if (typeof obj.detail === "string" && obj.detail.trim()) return String(obj.detail);
        if (typeof obj.title === "string" && obj.title.trim()) return String(obj.title);
        if (typeof obj.error === "string" && obj.error.trim()) return String(obj.error);
    }
    if (typeof payload === "string" && payload.trim()) {
        return `HTTP ${status}: ${payload.slice(0, 200)}`;
    }
    return `HTTP ${status}`;
}

function isEmbedConfigShape(value: unknown): value is PowerBiQnAEmbedConfig {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    if (typeof v.accessToken !== "string" || !v.accessToken) return false;
    if (typeof v.embedUrl !== "string" || !v.embedUrl) return false;
    if (typeof v.datasetId !== "string" || !v.datasetId) return false;
    if (typeof v.groupId !== "string" || !v.groupId) return false;
    if (typeof v.expiresAt !== "number") return false;
    return true;
}
