// playground/src/settings/groups/BiGroup.tsx
//
// Phase 3 (BI Live Controls, fix #6 from the Settings IA review).
// Settings is the canonical AUTHORING surface for the Power BI embed
// config. As of Phase B (2026-05-14) the Pulse sidebar's inline form
// retired and App.tsx adopted `useEmbedConfig` from
// `playground/src/settings/embedConfigStore.ts` — edits here live-update
// the playground via the `pulseplay:embed-config-change` event without
// a page refresh. Cross-tab edits also propagate via the `storage`
// event.

import { useSettings } from "../settingsStore";
import { useEmbedConfig } from "../embedConfigStore";
import { EmbedConfigForm } from "../../components/EmbedConfigForm";

export function BiGroup(): React.ReactElement {
    const { allowlist, biVendor, orphans, activeAiProfile } = useSettings();
    const biOrphan = orphans.find(o => o.key === "pulseplay:bi-vendor");
    const allowedProviders = allowlist?.biProviders || [];
    const { embedConfig, setEmbedConfig, clearEmbedConfig } = useEmbedConfig();
    const hasEmbedConfig = !!embedConfig && Object.keys(embedConfig).length > 0;
    return (
        <section aria-labelledby="settings-bi-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-bi-title" style={{ margin: 0, fontSize: 20 }}>BI</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    What you're looking at — provider, embed configuration, authentication, canvas, status.
                </p>
            </header>

            <Leaf group="bi" label="Provider" helper="The BI tool PulsePlay embeds. Restricted to the providers your organization allows.">
                <CurrentValue label="Active">{biVendor}</CurrentValue>
                <CurrentValue label="Allowed">
                    {allowedProviders.length > 0 ? allowedProviders.join(" · ") : "(allowlist unavailable)"}
                </CurrentValue>
                {biOrphan && <OrphanBanner reason={biOrphan.reason} />}
            </Leaf>

            <Leaf
                group="bi"
                label="Embed"
                helper="Power BI report / dashboard wiring. Three modes: Secure embed (paste an app.powerbi.com URL), AAD SSO (user identity), or Service principal (proxy mints the token). Live-updates the playground in this tab and any other tab open on this origin."
            >
                <div
                    role="note"
                    style={{
                        fontSize: 11,
                        opacity: 0.7,
                        background: "rgba(0,0,0,0.03)",
                        padding: "6px 10px",
                        borderRadius: 4,
                        marginBottom: 8,
                    }}
                >
                    Changes save to <code>pulseplay:bi-embed-config</code> and broadcast a <code>pulseplay:embed-config-change</code> event. App.tsx subscribes via <code>useEmbedConfig</code> so the BI canvas picks up edits live — no refresh required.
                </div>
                <EmbedConfigForm
                    vendor={biVendor || "powerbi"}
                    value={embedConfig}
                    onChange={setEmbedConfig}
                    assistantProfile={activeAiProfile}
                    allowlist={allowlist}
                />
                {hasEmbedConfig && (
                    <div style={{ marginTop: 10 }}>
                        <button
                            type="button"
                            onClick={clearEmbedConfig}
                            style={{
                                fontSize: 12,
                                padding: "4px 10px",
                                border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                                background: "transparent",
                                borderRadius: 4,
                                cursor: "pointer",
                                color: "#a01828",
                            }}
                        >
                            Clear embed config
                        </button>
                    </div>
                )}
            </Leaf>

            <Leaf
                group="bi"
                label="Authentication"
                helper="Sign-in mode + tenant. Tenant is locked to your organization's allowlist. Choose your AAD sign-in flow in the Embed leaf above; this view is read-only governance state."
            >
                <CurrentValue label="Allowed AAD tenants">
                    {allowlist?.aadTenants?.length ? allowlist.aadTenants.join(", ") : "(allowlist unavailable)"}
                </CurrentValue>
                <CurrentValue label="Token mode">
                    {(() => {
                        const cfg = embedConfig as { mode?: string; embedMode?: string };
                        return cfg?.mode || cfg?.embedMode || "(none — pick Embed mode above)";
                    })()}
                </CurrentValue>
                <CurrentValue label="Workspace (groupId)">
                    {(embedConfig as { groupId?: string })?.groupId || "(unset)"}
                </CurrentValue>
                <CurrentValue label="Report ID">
                    {(embedConfig as { id?: string; reportId?: string })?.id
                        || (embedConfig as { reportId?: string })?.reportId
                        || "(unset)"}
                </CurrentValue>
            </Leaf>

            <Leaf
                group="bi"
                label="Canvas"
                helper="How many Power BI frames render side-by-side. Controlled by the BI tile mode in the canvas toolbar; this view is read-only."
            >
                <CurrentValue label="Tile mode">
                    {(() => {
                        try {
                            const stored = typeof window !== "undefined" ? window.localStorage.getItem("pulseplay:bi-tile-mode") : null;
                            return stored || "1";
                        } catch { return "1"; }
                    })()}
                </CurrentValue>
                <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
                    Click the 1 / 2 / 4 toggle above the BI canvas to change.
                </p>
            </Leaf>

            <Leaf group="bi" label="Status" helper="Live state of the embed: mount mode, last load, recent events, license posture (Premium tier, embed-token availability, Fabric capability).">
                {allowlist?.license?.powerbi ? (
                    <>
                        <CurrentValue label="Premium tier required">{allowlist.license.powerbi.minTier || "(unset)"}</CurrentValue>
                        <CurrentValue label="Allowed tiers">{allowlist.license.powerbi.allowedTiers?.join(" · ") || "(any)"}</CurrentValue>
                        <CurrentValue label="Embed SKU">{allowlist.license.powerbi.embedSku?.join(" · ") || "(unset)"}</CurrentValue>
                        <CurrentValue label="Fabric">
                            {allowlist.license.powerbi.fabricEnabled
                                ? "enabled"
                                : <span style={{ color: "#7a5b00", fontWeight: 600 }}>NOT available</span>}
                        </CurrentValue>
                        {allowlist.license.powerbi.fabricEnabled === false && (
                            <div
                                role="note"
                                style={{
                                    fontSize: 11,
                                    padding: "6px 10px",
                                    background: "rgba(250, 204, 21, 0.12)",
                                    border: "1px solid rgba(250, 204, 21, 0.4)",
                                    color: "#7a5b00",
                                    borderRadius: 4,
                                    marginTop: 4,
                                }}
                            >
                                Fabric features (Direct Lake datasets, Dataflow Gen2, semantic-link APIs) are not licensed in this deployment. Fabric-only reports will fail to mount. Use a non-Fabric Power BI report or contact your admin.
                            </div>
                        )}
                    </>
                ) : (
                    <PhaseStub phase={3} />
                )}
            </Leaf>
        </section>
    );
}

// ─── Shared leaf renderer + small helpers (used by every group) ──────────

/** Convert a leaf label into a stable URL slug for deep linking.
 *  e.g. "AI Insights setup ↗" → "ai-insights-setup"
 *  Pure ASCII output; non-ASCII characters are stripped so a copy-paste
 *  from the URL bar always works regardless of locale. */
export function leafSlug(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function Leaf(props: { label: string; helper: string; group?: string; children: React.ReactNode }): React.ReactElement {
    const slug = leafSlug(props.label);
    const id = props.group ? `settings-${props.group}-${slug}` : undefined;
    return (
        <article
            id={id}
            data-leaf-slug={slug}
            style={{
                padding: "14px 16px",
                borderTop: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
                scrollMarginTop: 90, // leave room for the sticky search + status strip when scrolled into view
            }}
        >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{props.label}</div>
            <p style={{ margin: "2px 0 8px", fontSize: 12, opacity: 0.72, lineHeight: 1.4 }}>{props.helper}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{props.children}</div>
        </article>
    );
}

export function CurrentValue(props: { label: string; children: React.ReactNode }): React.ReactElement {
    return (
        <div style={{ fontSize: 12, display: "flex", gap: 8 }}>
            <span style={{ opacity: 0.6, minWidth: 110 }}>{props.label}:</span>
            <span style={{ fontFamily: "var(--pp-mono, monospace)" }}>{props.children}</span>
        </div>
    );
}

export function PhaseStub(props: { phase: number }): React.ReactElement {
    return (
        <div
            style={{
                fontSize: 11,
                opacity: 0.5,
                fontStyle: "italic",
                padding: "4px 8px",
                background: "rgba(0,0,0,0.03)",
                borderRadius: 4,
                display: "inline-block",
                alignSelf: "flex-start",
            }}
        >
            Live control lands in Phase {props.phase}. Current value is read-only above.
        </div>
    );
}

export function OrphanBanner(props: { reason: string }): React.ReactElement {
    return (
        <div
            role="alert"
            style={{
                fontSize: 12,
                padding: "6px 10px",
                background: "rgba(220, 53, 69, 0.08)",
                border: "1px solid rgba(220, 53, 69, 0.3)",
                color: "#a01828",
                borderRadius: 4,
                marginTop: 4,
            }}
        >
            ⚠ {props.reason} Pick a different option once the live control lands.
        </div>
    );
}
