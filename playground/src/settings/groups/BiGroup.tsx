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

import { useState } from "react";
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
                    What you're looking at — the BI surface, its embed config, and the governance + license posture around it.
                </p>
            </header>

            {/* ─── Tier 1: Current state ──────────────────────────────── */}
            <SubSection
                label="Current state"
                helper="Active provider and allowlist. The sections below either configure them or surface the policy that governs them."
            >

            <Leaf group="bi" label="Provider" helper="The BI tool PulsePlay embeds. Restricted to the providers your organization allows.">
                <CurrentValue label="Active">{biVendor}</CurrentValue>
                <CurrentValue label="Allowed">
                    {allowedProviders.length > 0 ? allowedProviders.join(" · ") : "(allowlist unavailable)"}
                </CurrentValue>
                {biOrphan && <OrphanBanner reason={biOrphan.reason} />}
            </Leaf>

            </SubSection>

            {/* ─── Tier 2: Connect and embed ──────────────────────────── */}
            <SubSection
                label="Connect and embed"
                helper="Wire the vendor connection, token mode, and workspace/report IDs. Edits live-update without a refresh."
            >

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

            </SubSection>

            {/* ─── Tier 3: Governance and policy ──────────────────────── */}
            <SubSection
                label="Governance and policy"
                helper="Read-only governance and license posture surrounding the active provider. Admin-configured, surfaced here so you know what to ask for."
            >

            <Leaf
                group="bi"
                label="Canvas"
                helper="How many Power BI frames render side-by-side. Controlled by backend display policy; this view is read-only."
            >
                <CurrentValue label="Tile mode">{normalizeBiTileMode(allowlist?.display?.biTileMode)}</CurrentValue>
                <p style={{ fontSize: 11, opacity: 0.6, margin: 0 }}>
                    Admin-controlled by <code>allowlist.display.biTileMode</code>. Use 1 for the normal viewer surface; 2 or 4 only for governed comparison deployments.
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

            </SubSection>
        </section>
    );
}

// ─── Shared leaf renderer + small helpers (used by every group) ──────────

function normalizeBiTileMode(value: unknown): "1" | "2" | "4" {
    const asString = String(value ?? "").trim();
    return asString === "2" || asString === "4" ? asString : "1";
}

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

/**
 * Visual sub-section divider for progressive grouping inside a Settings
 * group. NOT a Leaf — does NOT participate in the GROUP_LEAF_LABELS drift
 * dictionary. Used when a single Settings group has too many leaves for a
 * flat sibling list and needs the lifecycle pattern (At a glance / Configure /
 * Verify / Manage).
 *
 * Visual contract:
 *   - Stronger top divider than Leaf's borderTop (signals a new section)
 *   - Uppercase small-caps label (less prominent than the group <h2>,
 *     more prominent than the Leaf <h*> bold label)
 *   - Optional helper paragraph below the label
 *   - Children render below; they're typically a sequence of <Leaf>s
 *
 * The drift-prevention test extracts labels from `data-leaf-label="true"`;
 * SubSection uses `data-subsection-label="true"` so it's identifiable but
 * not treated as a leaf for the dictionary check.
 */
export function SubSection(props: {
    label:    string;
    helper?:  string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div
            data-subsection={props.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}
            style={{
                marginTop:  10,
                paddingTop: 14,
                borderTop:  "2px solid var(--pp-border-strong, rgba(0,0,0,0.10))",
            }}
        >
            <header style={{ padding: "0 16px 8px" }}>
                <h3
                    data-subsection-label="true"
                    style={{
                        // Codex 2026-05-19 naming audit fix:
                        // "Convert all-caps Settings headings to product
                        // Title Case." SubSection headings were
                        // text-transform:uppercase with letter-spacing,
                        // producing CURRENT STATE / CONNECT AND EMBED /
                        // GENERATION BEHAVIOR. Switched to proper
                        // typographic case: callers already pass labels in
                        // Title or sentence case (e.g. "Current state",
                        // "Connect and embed"), so we just stop forcing
                        // uppercase and bump the size for legibility.
                        margin:        0,
                        fontSize:      12.5,
                        fontWeight:    700,
                        color:         "#334155",
                        letterSpacing: 0.1,
                    }}
                >
                    {props.label}
                </h3>
                {props.helper && (
                    <p style={{ margin: "3px 0 0", fontSize: 11.5, opacity: 0.7, lineHeight: 1.45 }}>
                        {props.helper}
                    </p>
                )}
            </header>
            {props.children}
        </div>
    );
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
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div data-leaf-label="true" style={{ fontWeight: 600, fontSize: 14, flex: "1 1 auto" }}>{props.label}</div>
                {props.group && <LeafDeepLinkButton group={props.group} slug={slug} label={props.label} />}
            </div>
            <p style={{ margin: "2px 0 8px", fontSize: 12, opacity: 0.72, lineHeight: 1.4 }}>{props.helper}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{props.children}</div>
        </article>
    );
}

/**
 * Tiny "Copy link" button next to each leaf header. Settings IA fix #8.
 *
 * Generates a path-based deep link (`/settings/<group>/<slug>`) and copies
 * it to the clipboard. The slug-based scroll-on-mount in `SettingsShell`
 * will land the recipient on this exact leaf when they paste the link.
 *
 * Falls back silently when `navigator.clipboard` is unavailable (older
 * browsers / insecure context); the "Copied" confirmation is suppressed.
 */
function LeafDeepLinkButton(props: { group: string; slug: string; label: string }): React.ReactElement {
    const [copied, setCopied] = useState(false);
    const handleClick = async () => {
        try {
            const url = `${window.location.origin}/settings/${props.group}/${props.slug}`;
            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            }
        } catch { /* swallow — clipboard blocked or unavailable */ }
    };
    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={`Copy link to ${props.label}`}
            data-testid={`pp-leaf-copy-link-${props.group}-${props.slug}`}
            title={copied ? "Copied" : "Copy link to this section"}
            style={{
                flexShrink:    0,
                fontSize:      11,
                padding:       "3px 8px",
                border:        "1px solid rgba(0,0,0,0.10)",
                background:    copied ? "rgba(34,197,94,0.10)" : "transparent",
                color:         copied ? "#166534" : "#64748b",
                borderRadius:  5,
                cursor:        "pointer",
                fontFamily:    "inherit",
                transition:    "background-color 140ms ease, color 140ms ease",
            }}
        >
            {copied ? "Copied" : "Copy link"}
        </button>
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
