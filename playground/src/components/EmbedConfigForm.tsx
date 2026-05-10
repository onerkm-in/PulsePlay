import { useEffect, useState } from "react";
import type { BIEmbedConfig } from "../biPanel/BIAdapter";

// Vendor-aware embed-config form.
//
// Cycle A (Power BI graduation):
//   • Generic / Tableau / Qlik / Looker — single URL field (the iframe
//     fallback path; v1 wires real SDKs).
//   • Power BI — full credential helper:
//       Workspace ID + Report ID + Dataset ID
//       Permissions (View | Edit)
//       Embed-token mode (Backend-issued | Manual paste)
//       Optional pasted token (dev only)
//     "Backend-issued" mode posts to /api/assistant/embed-token/powerbi
//     and the proxy returns { embedToken, embedUrl, expiry } using its
//     Azure AD service principal. The browser never sees the AAD secret.
//
// The shape this form emits matches PowerBIEmbedConfig in
// bi-adapters/powerbi/index.ts so the adapter can mount() it directly.
//
// All other vendors emit { url } shaped configs that GenericIframeAdapter
// (and its subclasses) understand.

interface EmbedConfigFormProps {
    vendor: string;
    value: BIEmbedConfig;
    onChange: (next: BIEmbedConfig) => void;
    /** Optional override for the AI proxy base URL — same env-driven
     *  pattern AISidebar uses so dev/prod deployments line up. */
    apiBaseUrl?: string;
    /** Currently active connector / assistant profile. The proxy embed-
     *  token route resolves AAD credentials from this profile, so it has
     *  to be passed through. Empty string is allowed (then the proxy
     *  falls back to "default"). */
    assistantProfile?: string;
}

type PowerBITokenMode = "backend" | "manual";

interface PowerBIFormState {
    groupId: string;
    reportId: string;
    datasetId: string;
    permissions: "View" | "Edit";
    tokenMode: PowerBITokenMode;
    manualEmbedUrl: string;
    manualAccessToken: string;
}

const EMPTY_PBI: PowerBIFormState = {
    groupId: "",
    reportId: "",
    datasetId: "",
    permissions: "View",
    tokenMode: "backend",
    manualEmbedUrl: "",
    manualAccessToken: "",
};

export function EmbedConfigForm(props: EmbedConfigFormProps) {
    if (props.vendor === "powerbi") {
        return <PowerBIEmbedForm {...props} />;
    }
    return <GenericUrlForm {...props} />;
}

// ── Power BI ───────────────────────────────────────────────────────────────

function PowerBIEmbedForm(props: EmbedConfigFormProps) {
    const [state, setState] = useState<PowerBIFormState>(() => hydratePbiState(props.value));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>("");
    const [lastIssuedAt, setLastIssuedAt] = useState<number | null>(null);

    // Re-hydrate when the parent reset the embedConfig (e.g. user changed
    // vendor and came back). Avoids stale form values overwriting a fresh
    // empty state.
    useEffect(() => {
        if (Object.keys(props.value).length === 0) {
            setState(EMPTY_PBI);
            setLastIssuedAt(null);
            setError("");
        }
    }, [props.value]);

    const apiBase = props.apiBaseUrl || "/api";

    const set = <K extends keyof PowerBIFormState>(key: K, val: PowerBIFormState[K]) => {
        setState(s => ({ ...s, [key]: val }));
    };

    const apply = async () => {
        setError("");
        if (!state.reportId.trim()) {
            setError("Report ID is required.");
            return;
        }

        if (state.tokenMode === "manual") {
            if (!state.manualEmbedUrl.trim() || !state.manualAccessToken.trim()) {
                setError("Manual mode needs both an embed URL and an access token.");
                return;
            }
            props.onChange({
                type: "report",
                tokenType: "Embed",
                id: state.reportId.trim(),
                groupId: state.groupId.trim() || undefined,
                datasetId: state.datasetId.trim() || undefined,
                embedUrl: state.manualEmbedUrl.trim(),
                accessToken: state.manualAccessToken.trim(),
                permissions: state.permissions,
            });
            setLastIssuedAt(Date.now());
            return;
        }

        // Backend-issued: POST to the proxy. The proxy resolves AAD service
        // principal credentials via the active profile and returns a short-
        // lived embed token. The browser never sees the AAD secret.
        if (!state.groupId.trim()) {
            setError("Workspace (group) ID is required for backend-issued tokens.");
            return;
        }
        setBusy(true);
        try {
            const resp = await fetch(`${apiBase}/assistant/embed-token/powerbi`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    groupId: state.groupId.trim(),
                    reportId: state.reportId.trim(),
                    datasetId: state.datasetId.trim() || undefined,
                    permissions: state.permissions,
                    assistantProfile: props.assistantProfile || undefined,
                }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const detail = typeof data?.error === "string" ? data.error : `HTTP ${resp.status}`;
                setError(detail);
                return;
            }
            if (!data?.embedToken || !data?.embedUrl) {
                setError("Proxy returned an incomplete response (missing embedToken or embedUrl).");
                return;
            }
            props.onChange({
                type: "report",
                tokenType: "Embed",
                id: state.reportId.trim(),
                groupId: state.groupId.trim(),
                datasetId: state.datasetId.trim() || undefined,
                embedUrl: String(data.embedUrl),
                accessToken: String(data.embedToken),
                permissions: state.permissions,
            });
            setLastIssuedAt(Date.now());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="pp-embed-config pp-embed-config--powerbi">
            <h3 className="pp-embed-config__heading">Power BI embed</h3>
            <label className="pp-embed-config__label" htmlFor="pp-pbi-group">Workspace ID</label>
            <input
                id="pp-pbi-group"
                className="pp-embed-config__input"
                type="text"
                value={state.groupId}
                onChange={e => set("groupId", e.target.value)}
                placeholder="01234567-89ab-cdef-0123-456789abcdef"
            />

            <label className="pp-embed-config__label" htmlFor="pp-pbi-report">Report ID</label>
            <input
                id="pp-pbi-report"
                className="pp-embed-config__input"
                type="text"
                value={state.reportId}
                onChange={e => set("reportId", e.target.value)}
                placeholder="01234567-89ab-cdef-0123-456789abcdef"
            />

            <label className="pp-embed-config__label" htmlFor="pp-pbi-dataset">Dataset ID</label>
            <input
                id="pp-pbi-dataset"
                className="pp-embed-config__input"
                type="text"
                value={state.datasetId}
                onChange={e => set("datasetId", e.target.value)}
                placeholder="optional — needed for cross-workspace datasets"
            />

            <label className="pp-embed-config__label" htmlFor="pp-pbi-perms">Permissions</label>
            <select
                id="pp-pbi-perms"
                className="pp-embed-config__input"
                value={state.permissions}
                onChange={e => set("permissions", e.target.value as "View" | "Edit")}
            >
                <option value="View">View</option>
                <option value="Edit">Edit</option>
            </select>

            <label className="pp-embed-config__label" htmlFor="pp-pbi-mode">Embed token mode</label>
            <select
                id="pp-pbi-mode"
                className="pp-embed-config__input"
                value={state.tokenMode}
                onChange={e => set("tokenMode", e.target.value as PowerBITokenMode)}
            >
                <option value="backend">Backend-issued (recommended)</option>
                <option value="manual">Manual paste (dev only)</option>
            </select>

            {state.tokenMode === "manual" && (
                <>
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-url">Embed URL</label>
                    <input
                        id="pp-pbi-url"
                        className="pp-embed-config__input"
                        type="url"
                        value={state.manualEmbedUrl}
                        onChange={e => set("manualEmbedUrl", e.target.value)}
                        placeholder="https://app.powerbi.com/reportEmbed?reportId=…"
                    />
                    <label className="pp-embed-config__label" htmlFor="pp-pbi-token">Embed access token</label>
                    <textarea
                        id="pp-pbi-token"
                        className="pp-embed-config__input pp-embed-config__input--textarea"
                        value={state.manualAccessToken}
                        onChange={e => set("manualAccessToken", e.target.value)}
                        placeholder="eyJ…  (short-lived embed token; never paste a Power BI master/PAT)"
                        rows={3}
                    />
                </>
            )}

            <button
                type="button"
                className="pp-embed-config__apply"
                onClick={apply}
                disabled={busy}
            >
                {busy ? "Issuing token…" : "Load report"}
            </button>

            {error && (
                <p className="pp-embed-config__error" role="alert">{error}</p>
            )}
            {lastIssuedAt && !error && (
                <p className="pp-embed-config__hint">
                    Loaded at {new Date(lastIssuedAt).toLocaleTimeString()}.
                </p>
            )}
            <p className="pp-embed-config__hint">
                Backend-issued mode: the proxy uses an Azure AD service principal
                (powerBiClientId / powerBiClientSecret / powerBiTenantId on the
                active profile). The browser only ever sees the short-lived
                embed token.
            </p>
        </section>
    );
}

function hydratePbiState(value: BIEmbedConfig): PowerBIFormState {
    // Best-effort rehydrate — useful when the parent persists embedConfig
    // across re-renders (e.g. after a vendor switch and back).
    return {
        groupId: (value.groupId as string) || "",
        reportId: (value.id as string) || "",
        datasetId: (value.datasetId as string) || "",
        permissions: (value.permissions as "View" | "Edit") || "View",
        tokenMode: value.accessToken ? "manual" : "backend",
        manualEmbedUrl: (value.embedUrl as string) || "",
        manualAccessToken: (value.accessToken as string) || "",
    };
}

// ── Generic / non-PBI vendors ─────────────────────────────────────────────

function GenericUrlForm(props: EmbedConfigFormProps) {
    const [url, setUrl] = useState<string>((props.value.url as string) || "");

    const apply = () => {
        if (!url.trim()) return;
        props.onChange({ url: url.trim() });
    };

    const placeholder = (() => {
        switch (props.vendor) {
            case "tableau":   return "https://server/views/Workbook/View";
            case "qlik":      return "https://tenant.qlikcloud.com/sense/app/<id>/sheet/<id>";
            case "looker":    return "https://looker.example.com/embed/dashboards/123";
            default:          return "https://any-bi-url.example.com/embed/...";
        }
    })();

    return (
        <section className="pp-embed-config">
            <label htmlFor="pp-embed-url" className="pp-embed-config__label">Embed URL</label>
            <input
                id="pp-embed-url"
                type="url"
                className="pp-embed-config__input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={apply}
                onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                placeholder={placeholder}
            />
            <button type="button" className="pp-embed-config__apply" onClick={apply}>
                Load
            </button>
            <p className="pp-embed-config__hint">
                v0: paste any embed URL. v1 will add per-vendor credential helpers + token issuance via the proxy.
            </p>
        </section>
    );
}
