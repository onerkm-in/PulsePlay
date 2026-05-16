// playground/src/settings/groups/SetupGroup.tsx
//
// Single setup/readiness tree. This is the page opened by the top-right
// setup pill: it answers "what is missing?" without making users hunt
// across BI, AI, and Preferences.

import { navigateToSettings } from "../settingsRoute";
import { useSettings } from "../settingsStore";
import { useEmbedConfig } from "../embedConfigStore";
import { getSetupReadiness } from "../setupReadiness";
import { CurrentValue, Leaf } from "./BiGroup";

export function SetupGroup(): React.ReactElement {
    const { biVendor, activeAiProfile, packSelection, allowlist, allowlistError, orphans } = useSettings();
    const { embedConfig } = useEmbedConfig();
    const readiness = getSetupReadiness({ biVendor, embedConfig, activeAiProfile });
    const setupTone = readiness.ready ? "#166534" : "#7a5b00";
    const setupBg = readiness.ready ? "rgba(34, 197, 94, 0.08)" : "rgba(250, 204, 21, 0.12)";

    return (
        <section aria-labelledby="settings-setup-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-setup-title" style={{ margin: 0, fontSize: 20 }}>Setup</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
                    Configure one BI surface and one AI profile, then tune the experience around that pair.
                </p>
            </header>

            <Leaf
                group="setup"
                label="Readiness"
                helper="A playground run is ready only when both axes are configured: BI has a provider plus embed config, and AI has a profile."
            >
                <div
                    role="status"
                    aria-label={readiness.ready ? "PulsePlay setup ready" : "PulsePlay setup needs attention"}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        padding: "10px 12px",
                        border: `1px solid ${readiness.ready ? "rgba(34,197,94,0.28)" : "rgba(250,204,21,0.36)"}`,
                        borderRadius: 6,
                        background: setupBg,
                        color: setupTone,
                    }}
                >
                    <strong style={{ fontSize: 13 }}>{readiness.ready ? "Ready" : "Setup needed"}</strong>
                    <ReadinessChip label="BI" ready={readiness.biReady} />
                    <ReadinessChip label="AI" ready={readiness.aiReady} />
                    {!readiness.ready && (
                        <span style={{ fontSize: 12 }}>
                            Missing: {readiness.missing.join(" + ")}
                        </span>
                    )}
                </div>
                {allowlistError && (
                    <div role="alert" style={alertStyle}>
                        Governance allowlist is not reachable: {allowlistError}
                    </div>
                )}
                {orphans.length > 0 && (
                    <div role="alert" style={alertStyle}>
                        {orphans.length} saved setting{orphans.length === 1 ? "" : "s"} no longer match the allowlist. Review the affected BI, AI, or pack leaf before sharing this setup.
                    </div>
                )}
            </Leaf>

            <Leaf
                group="setup"
                label="BI vertical"
                helper="The surface users look at. Start with the provider, then wire the embed config from the BI group."
            >
                <CurrentValue label="Provider">{biVendor || "(none)"}</CurrentValue>
                <CurrentValue label="Embed config">
                    {readiness.hasEmbedConfig ? "configured" : "(missing)"}
                </CurrentValue>
                <CurrentValue label="Allowed">
                    {allowlist?.biProviders?.length ? allowlist.biProviders.join(" · ") : "(allowlist unavailable)"}
                </CurrentValue>
                <div style={actionRowStyle}>
                    <SetupLinkButton label="Choose BI provider" group="bi" leaf="provider" />
                    <SetupLinkButton label={readiness.hasEmbedConfig ? "Edit embed config" : "Add embed config"} group="bi" leaf="embed" primary={!readiness.hasEmbedConfig} />
                </div>
            </Leaf>

            <Leaf
                group="setup"
                label="AI vertical"
                helper="The reasoning side of the playground. Pick one approved profile, then attach the knowledge pack and AI behavior to it."
            >
                <CurrentValue label="Profile">{activeAiProfile || "(none)"}</CurrentValue>
                <CurrentValue label="Knowledge pack">{packSelection?.pack || "(none)"}</CurrentValue>
                <CurrentValue label="Allowed">
                    {allowlist?.aiProfiles?.length ? allowlist.aiProfiles.join(" · ") : "(allowlist unavailable)"}
                </CurrentValue>
                <div style={actionRowStyle}>
                    <SetupLinkButton label={activeAiProfile ? "Change AI profile" : "Choose AI profile"} group="ai" leaf="provider" primary={!activeAiProfile} />
                    <SetupLinkButton label="Knowledge pack" group="ai" leaf="knowledge-pack" />
                    <SetupLinkButton label="AI Insights and Chat" group="ai" leaf="ai-insights" />
                </div>
            </Leaf>

            <Leaf
                group="setup"
                label="Experience controls"
                helper="How the workspace behaves after it is configured: visible panes, AI position, BI tiles, and focused-page use."
            >
                <CurrentValue label="Next action">
                    {readiness.ready
                        ? "Return to app, then use Maximize, Minimize, Pin, and Open in separate page from the pane chrome."
                        : "Finish the missing BI/AI items above first."}
                </CurrentValue>
                <div style={actionRowStyle}>
                    <SetupLinkButton label="Layout preferences" group="preferences" leaf="visible-panels" />
                    <SetupLinkButton label="BI tile mode" group="preferences" leaf="canvas-tiles" />
                    <SetupLinkButton label="System setup wizard" group="system" leaf="setup-wizard" />
                </div>
            </Leaf>
        </section>
    );
}

function ReadinessChip(props: { label: string; ready: boolean }): React.ReactElement {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 12,
                background: props.ready ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.10)",
                color: props.ready ? "#166534" : "#a01828",
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: props.ready ? "#22c55e" : "#ef4444",
                    display: "inline-block",
                }}
            />
            {props.label} {props.ready ? "ready" : "missing"}
        </span>
    );
}

function SetupLinkButton(props: {
    label: string;
    group: Parameters<typeof navigateToSettings>[0];
    leaf: string;
    primary?: boolean;
}): React.ReactElement {
    return (
        <button
            type="button"
            onClick={() => navigateToSettings(props.group, props.leaf)}
            style={{
                fontSize: 12,
                padding: "6px 10px",
                border: props.primary ? "1px solid var(--pp-accent, #0078d4)" : "1px solid var(--pp-border, rgba(0,0,0,0.18))",
                background: props.primary ? "var(--pp-accent, #0078d4)" : "transparent",
                color: props.primary ? "#fff" : "#1d4ed8",
                borderRadius: 4,
                cursor: "pointer",
                alignSelf: "flex-start",
                fontWeight: props.primary ? 600 : 500,
            }}
        >
            {props.label}
        </button>
    );
}

const actionRowStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
};

const alertStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "7px 10px",
    background: "rgba(220, 53, 69, 0.08)",
    border: "1px solid rgba(220, 53, 69, 0.26)",
    color: "#a01828",
    borderRadius: 4,
};
