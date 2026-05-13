// playground/src/settings/groups/BiGroup.tsx
//
// BI group placeholder for Phase 2. Phase 3 fills in the live controls
// (Provider picker filtered by allowlist, EmbedConfigForm, Authentication
// with tenant lock, Canvas, Status with license posture).

import { useSettings } from "../settingsStore";

export function BiGroup(): React.ReactElement {
    const { allowlist, biVendor, orphans } = useSettings();
    const biOrphan = orphans.find(o => o.key === "pulseplay:bi-vendor");
    const allowedProviders = allowlist?.biProviders || [];
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

            <Leaf group="bi" label="Embed" helper="How PulsePlay obtains the embed. Power BI: secure-embed link, AAD SSO, service principal, or manual token.">
                <PhaseStub phase={3} />
            </Leaf>

            <Leaf group="bi" label="Authentication" helper="Sign-in mode + tenant. Tenant is locked to your organization's allowlist.">
                <CurrentValue label="Allowed AAD tenants">
                    {allowlist?.aadTenants?.length ? allowlist.aadTenants.join(", ") : "(allowlist unavailable)"}
                </CurrentValue>
                <PhaseStub phase={3} />
            </Leaf>

            <Leaf group="bi" label="Canvas" helper="How many Power BI frames render side-by-side.">
                <PhaseStub phase={3} />
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
