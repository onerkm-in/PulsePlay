// GenieSpacesManager — in-UI add/manage of multiple Databricks Genie spaces as
// selectable connectors, WITHOUT editing proxy/config.json.
//
// How it works: a custom space is stored client-side (localStorage
// `pulseplay:custom-genie-spaces`). Selecting one writes its host/spaceId/token
// into genieSettings via writeGenieSettingsPatch — the existing inline-credential
// path (GenieClient.attachInlineCredentialsHeaders → proxy applyInlineMode) then
// sends X-Databricks-Host / X-Databricks-Token / X-Genie-Space-Id per request,
// so the proxy talks to that space with no server-side profile. This is the
// dev/plug-and-play complement to the config.json multi-Genie pattern (see
// docs/CONNECTOR_REQUIREMENTS.md §1).

import { useEffect, useState } from "react";
import { writeGenieSettingsPatch, readGenieSettings } from "../groups/sub/genieSettingsBridge";

const STORAGE_KEY = "pulseplay:custom-genie-spaces";

export interface CustomGenieSpace {
    id: string;
    label: string;
    host: string;
    spaceId: string;
    token: string;
    dataDomain?: string;
}

function readSpaces(): CustomGenieSpace[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(s => s && s.id && s.spaceId) : [];
    } catch {
        return [];
    }
}

function writeSpaces(spaces: CustomGenieSpace[]): void {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces)); } catch { /* quota — non-fatal */ }
}

const normalizeHost = (h: string): string => {
    const t = (h || "").trim().replace(/\/+$/, "");
    if (!t) return "";
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 6,
    border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
    background: "var(--pp-surface, #fff)", color: "var(--pp-text, #1a1a1a)",
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, marginBottom: 4, display: "block", color: "var(--pp-text-muted, #555)" };

export function GenieSpacesManager(): React.ReactElement {
    const [spaces, setSpaces] = useState<CustomGenieSpace[]>(readSpaces);
    const [activeSpaceId, setActiveSpaceId] = useState<string>(() => String(readGenieSettings().spaceId || ""));
    const [form, setForm] = useState({ label: "", host: "", spaceId: "", token: "", dataDomain: "" });
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");

    useEffect(() => {
        const sync = () => setActiveSpaceId(String(readGenieSettings().spaceId || ""));
        window.addEventListener("pulseplay:visual-settings-change", sync as EventListener);
        return () => window.removeEventListener("pulseplay:visual-settings-change", sync as EventListener);
    }, []);

    const persist = (next: CustomGenieSpace[]) => { setSpaces(next); writeSpaces(next); };

    const add = () => {
        const label = form.label.trim();
        const host = normalizeHost(form.host);
        const spaceId = form.spaceId.trim();
        const token = form.token.trim();
        if (!label || !host || !spaceId || !token) {
            setError("Label, host, space ID and token are all required.");
            return;
        }
        if (spaces.some(s => s.spaceId === spaceId)) {
            setError("A space with that space ID already exists.");
            return;
        }
        const space: CustomGenieSpace = {
            id: `cgs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label, host, spaceId, token, dataDomain: form.dataDomain.trim() || undefined,
        };
        persist([...spaces, space]);
        setForm({ label: "", host: "", spaceId: "", token: "", dataDomain: "" });
        setError("");
        setStatus(`Added "${label}". Click Use to switch to it.`);
    };

    const use = (space: CustomGenieSpace) => {
        writeGenieSettingsPatch({
            host: space.host,
            spaceId: space.spaceId,
            token: space.token,
            assistantProfile: space.label,
            connectionMode: "proxy",
        });
        setActiveSpaceId(space.spaceId);
        setStatus(`Now using "${space.label}". Ask Pulse / AI Insights will query that Genie space.`);
    };

    const remove = (id: string) => {
        persist(spaces.filter(s => s.id !== id));
        setStatus("Space removed.");
    };

    const mask = (s: string) => (s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--pp-text-muted, #555)", margin: 0 }}>
                Add multiple Databricks Genie spaces as selectable connectors without editing
                <code style={{ margin: "0 4px" }}>config.json</code>. Each space is stored in this browser and used via
                inline credentials (host + space ID + token sent per request). For shared/server deployments, prefer the
                <code style={{ margin: "0 4px" }}>config.json</code> profile pattern.
            </p>

            {/* saved spaces */}
            {spaces.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {spaces.map(space => {
                        const isActive = space.spaceId === activeSpaceId;
                        return (
                            <li key={space.id} style={{
                                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
                                border: `1px solid ${isActive ? "var(--pp-accent, #2563eb)" : "var(--pp-border, rgba(0,0,0,0.12))"}`,
                                background: isActive ? "var(--pp-accent-subtle, rgba(37,99,235,0.06))" : "var(--pp-surface-raised, #fafafa)",
                            }}>
                                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--pp-text, #1a1a1a)" }}>
                                        {space.label}{isActive && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--pp-accent, #2563eb)", fontWeight: 700 }}>● ACTIVE</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--pp-text-muted, #777)" }}>
                                        space {mask(space.spaceId)} · {space.host.replace(/^https?:\/\//, "")}{space.dataDomain ? ` · ${space.dataDomain}` : ""}
                                    </div>
                                </div>
                                <button type="button" onClick={() => use(space)} disabled={isActive}
                                    style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: isActive ? "default" : "pointer",
                                        border: "1px solid var(--pp-accent, #2563eb)", background: isActive ? "transparent" : "var(--pp-accent, #2563eb)",
                                        color: isActive ? "var(--pp-text-muted, #999)" : "#fff" }}>
                                    {isActive ? "In use" : "Use"}
                                </button>
                                <button type="button" onClick={() => remove(space.id)} aria-label={`Remove ${space.label}`}
                                    style={{ padding: "5px 9px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "1px solid var(--pp-border, rgba(0,0,0,0.18))", background: "transparent", color: "var(--pp-text-muted, #777)" }}>
                                    Remove
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* add form */}
            <div style={{ borderTop: "1px solid var(--pp-border, rgba(0,0,0,0.1))", paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Display name</label>
                    <input style={fieldStyle} value={form.label} placeholder="e.g. Genie: Marketing" onChange={e => setForm({ ...form, label: e.target.value })} />
                </div>
                <div>
                    <label style={labelStyle}>Workspace host</label>
                    <input style={fieldStyle} value={form.host} placeholder="https://adb-….azuredatabricks.net" onChange={e => setForm({ ...form, host: e.target.value })} />
                </div>
                <div>
                    <label style={labelStyle}>Genie space ID</label>
                    <input style={fieldStyle} value={form.spaceId} placeholder="01f1…" onChange={e => setForm({ ...form, spaceId: e.target.value })} />
                </div>
                <div>
                    <label style={labelStyle}>Token (PAT)</label>
                    <input style={fieldStyle} type="password" value={form.token} placeholder="dapi…" onChange={e => setForm({ ...form, token: e.target.value })} />
                </div>
                <div>
                    <label style={labelStyle}>Data domain <span style={{ fontWeight: 400 }}>(optional)</span></label>
                    <input style={fieldStyle} value={form.dataDomain} placeholder="e.g. marketing data" onChange={e => setForm({ ...form, dataDomain: e.target.value })} />
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
                    <button type="button" onClick={add}
                        style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: "pointer", border: "none", background: "var(--pp-accent, #2563eb)", color: "#fff" }}>
                        Add Genie space
                    </button>
                    {error && <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>}
                    {!error && status && <span style={{ fontSize: 12, color: "var(--pp-text-muted, #16a34a)" }}>{status}</span>}
                </div>
            </div>
        </div>
    );
}
