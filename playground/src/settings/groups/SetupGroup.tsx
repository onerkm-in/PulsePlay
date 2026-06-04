// playground/src/settings/groups/SetupGroup.tsx
//
// Progressive Split Workspace setup.
// Left side: task gates. Right side: preview and diagnostic context.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSettings } from "../settingsStore";
import { useEmbedConfig } from "../embedConfigStore";
import { getSetupReadiness, isNativeBiVendor } from "../setupReadiness";
import { resolveBiSurfaceVendor } from "../biSurfaceMode";
import { listVendors } from "../../biPanel/registry";
import { HelpTip } from "../primitives/HelpTip";
import "../primitives/primitives.css";

interface LogMessage {
    timestamp: string;
    message: string;
    tone: "info" | "success" | "warn" | "error";
}

interface SetupOption {
    name: string;
    displayName: string;
}

export function SetupGroup(): React.ReactElement {
    const {
        biVendor, activeAiProfile, packSelection,
        biSurfaceMode, enabledComponents,
        allowlist, allowlistLoading, allowlistError,
        setBiVendor, setBiSurfaceMode, setActiveAiProfile, setPackSelection,
    } = useSettings();
    const { embedConfig, setEmbedConfig } = useEmbedConfig();
    const vendors = useMemo(() => listVendors(), []);

    const allowedBiVendors = useMemo(() => {
        if (!allowlist?.biProviders?.length) return vendors;
        const set = new Set(allowlist.biProviders);
        return vendors.filter(v => set.has(v.vendor));
    }, [vendors, allowlist]);

    const hasVendorEmbedConfig = !!embedConfig && Object.keys(embedConfig).length > 0;
    const surfaceResolution = resolveBiSurfaceVendor({
        mode: biSurfaceMode,
        requestedVendor: biVendor,
        hasVendorEmbedConfig,
        visibleVendors: allowedBiVendors,
    });
    const runtimeBiVendor = surfaceResolution.runtimeVendor;
    const readiness = getSetupReadiness({ biVendor: runtimeBiVendor, embedConfig, activeAiProfile });

    // BI section opens by default. Smart "first incomplete" expand was tried
    // but surfaces a pre-existing test pollution bug in embedConfigStore.ts
    // (module-level _memoryCache persists across test mounts). Queued as a
    // follow-up; for this slice we keep the simpler default.
    const [activeStep, setActiveStep] = useState<number>(1);
    // Gate 4 (governance review) is checked only when the allowlist is healthy
    // (not loading, not in error). A green check on a failed allowlist would
    // overclaim trust; the audit specifically flagged the prior hardcoded
    // `4: true` default as misleading.
    const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({
        1: hasVendorEmbedConfig || biSurfaceMode === "native",
        2: !!activeAiProfile,
        3: !!packSelection,
        4: !allowlistLoading && !allowlistError,
        5: false,
    });

    // Sticky top search — type-ahead filter over known PulsePlay setting fields.
    // UX-ARCH-0B.2 Phase B — index expanded from 22 to ~60 items covering BI /
    // AI / Preferences / System / Advanced PLUS hidden routes (/launchpad,
    // /workbench, /knowledge, /powerbi/qna). Each item is either in-Setup
    // (resolved by step bookmark) or cross-Settings (resolved by `href` deep
    // link). Replaces the 8 dead "AI Insights Developer Tools" references that
    // pointed at a page that doesn't exist with proper paths to the real
    // editors at /settings/ai.
    const [searchQuery, setSearchQuery] = useState<string>("");
    const searchIndex = useMemo(() => [
        // ── BI Surface (in-Setup) ──────────────────────────────────────
        { id: "bi", label: "BI provider / vendor", hint: "Power BI, Tableau, Qlik, Looker, generic iframe", section: "BI Surface", step: 1 },
        { id: "bi", label: "Surface mode", hint: "Auto, Vendor, Native canvas", section: "BI Surface", step: 1 },
        { id: "bi", label: "Embed URL or iframe HTML", hint: "Vendor embed configuration", section: "BI Surface", step: 1 },
        { id: "bi", label: "Sandbox attributes", hint: "Corporate iframe sandbox restrictions", section: "BI Surface", step: 1 },
        // ── BI deep-links (cross-Settings) ─────────────────────────────
        { label: "Power BI Secure embed / SSO / Backend / Manual modes", hint: "AAD client ID, tenant, token issuance mode", section: "Settings → BI", href: "/settings/bi" },
        { label: "BI governance review", hint: "Per-vendor production readiness gate", section: "Settings → BI", href: "/settings/bi/governance" },
        // ── AI Assistant (in-Setup) ────────────────────────────────────
        { id: "ai", label: "AI profile / connector", hint: "Genie, Foundation Model, Supervisor, Bedrock, Power BI semantic-model", section: "AI Assistant", step: 2 },
        { id: "ai", label: "Profile handshake test", hint: "Probe the proxy connection for the selected AI profile", section: "AI Assistant", step: 2 },
        // ── AI deep-links (cross-Settings) — replace 8 dead refs ───────
        { label: "Authoring mode", hint: "Preset / AI-assisted / Manual authoring of AI Insights prompts", section: "Settings → AI", href: "/settings/ai" },
        { label: "Section editor", hint: "HEADLINE, TRENDS, RISKS, RECOMMENDED ACTIONS toggles + custom sections", section: "Settings → AI", href: "/settings/ai" },
        { label: "Prompt preview", hint: "Synthesized prompt the AI receives at runtime", section: "Settings → AI", href: "/settings/ai" },
        { label: "Domain guidance override", hint: "AI Insights domain-specific guidance textarea", section: "Settings → AI", href: "/settings/ai" },
        { label: "Suggest from data", hint: "AI-assisted suggestion using bound dimensions and measures", section: "Settings → AI", href: "/settings/ai" },
        { label: "Metric direction rules", hint: "Per-metric Higher/Lower direction + Green/Amber/Red thresholds + aliases", section: "Settings → AI", href: "/settings/ai" },
        { label: "Metric thresholds (green/amber/red)", hint: "Color bands for KPI values", section: "Settings → AI", href: "/settings/ai" },
        { label: "Metric-rules preset", hint: "Apply a domain preset of metric direction rules", section: "Settings → AI", href: "/settings/ai" },
        { label: "Metric aliases", hint: "Alternative names that resolve to the same metric rule", section: "Settings → AI", href: "/settings/ai" },
        { label: "Analytics domain", hint: "Sales / Supply Chain / Hospital Operations / Generic — sets AI tone", section: "Settings → AI", href: "/settings/ai" },
        { label: "Custom sections (JSON)", hint: "Domain-specific sections beyond the universal five", section: "Settings → AI", href: "/settings/ai" },
        { label: "Included Insights stages", hint: "Headline / Trends / Risks / Recommended Actions on/off", section: "Settings → AI", href: "/settings/ai" },
        { label: "Provenance footer", hint: "Generated by PulsePlay … attribution at the bottom of answers", section: "Settings → AI", href: "/settings/ai" },
        { label: "Vector Search KB", hint: "Databricks Vector Search index for grounding", section: "Settings → AI", href: "/settings/ai" },
        { label: "UC Metric View", hint: "Unity Catalog metric view bound to this assistant", section: "Settings → AI", href: "/settings/ai" },
        { label: "Knowledge Base toggles", hint: "Enable chart / stat / reporting analytics KB injections", section: "Settings → AI · Knowledge Base", href: "/settings/ai/knowledge-base" },
        { label: "Supervisor Fusion editor", hint: "Synthesis prompt, profile, endpoint, agent name, auto-fusion", section: "Settings → AI · Supervisor Fusion", href: "/settings/ai/supervisor-fusion" },
        { label: "Power BI Q&A surface", hint: "Microsoft NLP runs in MS tenant; PulsePlay only mints embed token", section: "Power BI Q&A", href: "/powerbi/qna" },
        // ── Knowledge pack (in-Setup) ──────────────────────────────────
        { id: "pack", label: "Knowledge pack", hint: "CPG/FMCG, Retail/Digital, SaaS/Product, or none", section: "Knowledge Pack", step: 3 },
        { label: "Browse knowledge library", hint: "All packs, sub-verticals, evidence, sample questions", section: "Knowledge Library", href: "/knowledge" },
        // ── Governance (in-Setup) ──────────────────────────────────────
        { id: "gov", label: "Governance allowlist", hint: "Allowed BI providers and AI profiles", section: "Governance", step: 4 },
        { id: "gov", label: "Iframe sandbox policy", hint: "Allowlist and sandbox policy enforcement", section: "Governance", step: 4 },
        { id: "gov", label: "Identity and RLS review", hint: "Row-level security and delegated identity", section: "Governance", step: 4 },
        // ── Test & Handoff (in-Setup) ──────────────────────────────────
        { id: "test", label: "Diagnostic preflight", hint: "Proxy health, BI mount, AI handshake, attestation", section: "Test & Handoff", step: 5 },
        { id: "test", label: "Redacted handoff bundle", hint: "Diagnostic JSON for support / deployer handoff", section: "Test & Handoff", step: 5 },
        // ── Preferences (cross-Settings) ───────────────────────────────
        { label: "Theme (light / dark / system)", hint: "Surface color scheme and accent brand tokens", section: "Settings → Preferences · Appearance", href: "/settings/preferences/appearance" },
        { label: "Brand colors", hint: "Header / accent / surface color tokens", section: "Settings → Preferences · Appearance", href: "/settings/preferences/appearance" },
        { label: "Layout (AI position: left / right / top / bottom)", hint: "Where the AI pane sits relative to the BI canvas", section: "Settings → Preferences", href: "/settings/preferences" },
        { label: "Layout preset", hint: "Balanced / Focus / Canvas-first / AI-only / BI-only template", section: "Settings → Preferences", href: "/settings/preferences" },
        { label: "Default landing surface", hint: "Which tab fresh visitors see", section: "Settings → Preferences", href: "/settings/preferences" },
        { label: "Visible panels", hint: "AI-only / BI-only / Mix / Both — what end users get to see", section: "Settings → Preferences", href: "/settings/preferences" },
        { label: "Mix composition", hint: "AI Insights vs Ask Pulse vs Dashboard share on shared surfaces", section: "Settings → Preferences", href: "/settings/preferences" },
        { label: "Research Agent traces", hint: "Show reasoning_traces when Agent Mode runs upstream", section: "Settings → Preferences", href: "/settings/preferences" },
        { label: "Density / UI scale", hint: "Compact, normal, large rendering", section: "Settings → Preferences", href: "/settings/preferences" },
        { label: "Guided filters bar", hint: "Quick filter chips above Ask Pulse", section: "Settings → Preferences", href: "/settings/preferences" },
        // ── System / Developer Tools (cross-Settings) ──────────────────
        { label: "Proxy health status", hint: "Live /healthz poll for the configured proxy", section: "Settings → System", href: "/settings/system" },
        { label: "Developer Tools", hint: "SQL trace, prompt context dump, session log, dev mode, retries", section: "Settings → System · Developer Tools", href: "/settings/system/developer-tools" },
        { label: "Show generated SQL", hint: "Render the SQL Genie emitted on every section", section: "Settings → System · Developer Tools", href: "/settings/system/developer-tools" },
        { label: "Show reasoning trace", hint: "Diagnostic trace for Agent-Mode and Supervisor calls", section: "Settings → System · Developer Tools", href: "/settings/system/developer-tools" },
        { label: "Validation retry count", hint: "How many times the validator retries before giving up", section: "Settings → System · Developer Tools", href: "/settings/system/developer-tools" },
        { label: "Connector compatibility warnings", hint: "Show banner when chosen connector lacks features", section: "Settings → System · Developer Tools", href: "/settings/system/developer-tools" },
        { label: "Allow report actions", hint: "AI can push filters / drill / focus into the host BI surface", section: "Settings → System · Developer Tools", href: "/settings/system/developer-tools" },
        { label: "Re-run setup wizard", hint: "Restart the guided first-run wizard", section: "Settings → System", href: "/settings/system" },
        // ── Advanced (cross-Settings) ──────────────────────────────────
        { label: "Performance levers", hint: "Cache TTL, max retries, reveal cadence, discovery prewarm", section: "Settings → Advanced", href: "/settings/advanced" },
        { label: "AI Insights cache TTL", hint: "How long cached briefings stay fresh before re-running", section: "Settings → Advanced", href: "/settings/advanced" },
        { label: "Reveal cadence", hint: "Instant / Fast / Balanced / Full progressive reveal timing", section: "Settings → Advanced", href: "/settings/advanced" },
        { label: "Discovery prewarm", hint: "Fire schema/KPI/reachability fusion on screen load", section: "Settings → Advanced", href: "/settings/advanced" },
        { label: "Local storage inspector", hint: "View every pulseplay:* key currently persisted", section: "Settings → Advanced", href: "/settings/advanced" },
        { label: "Reset section / Reset all", hint: "Scoped or full restore of defaults", section: "Settings → Advanced", href: "/settings/advanced" },
        { label: "Danger zone — sign out of Power BI", hint: "Clear MSAL tokens and PBI-cached identity", section: "Settings → Advanced", href: "/settings/advanced" },
        // ── Hidden routes (made discoverable here) ─────────────────────
        { label: "Launchpad", hint: "Pack / connector landing page", section: "Launchpad", href: "/launchpad" },
        { label: "Workbench preview", hint: "Unified workbench (preview-flag gated)", section: "Workbench", href: "/workbench" },
        { label: "Knowledge base browser", hint: "Browse all knowledge packs + sub-verticals + evidence", section: "Knowledge", href: "/knowledge" },
    ] as const, []);

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        return searchIndex.filter(item =>
            item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q)
        ).slice(0, 8);
    }, [searchQuery, searchIndex]);

    // Connectivity pill state — honest "Connected" / "X not connected"
    // labeling driven by the author's chosen scope (enabledComponents).
    // If the author opted into "aiOnly" or "biOnly", the pill only judges
    // the relevant half. If "both" / "mix", both halves are required.
    const pillState = useMemo(() => {
        const needsBI = enabledComponents !== "aiOnly";
        const needsAI = enabledComponents !== "biOnly";
        const biConnected = hasVendorEmbedConfig || biSurfaceMode === "native";
        const aiConnected = !!activeAiProfile;
        const missing: string[] = [];
        if (needsBI && !biConnected) missing.push("BI");
        if (needsAI && !aiConnected) missing.push("AI");
        if (missing.length === 0) {
            return { tone: "ok" as const, label: "Connected" };
        }
        const label = missing.length === 1
            ? `${missing[0]} not connected`
            : `${missing.join(" and ")} not connected`;
        return { tone: "warn" as const, label };
    }, [enabledComponents, hasVendorEmbedConfig, biSurfaceMode, activeAiProfile]);

    // Adaptive page subtitle — makes the "everything stays editable" promise
    // visible without a footnote. Computed from current section completion so
    // the copy adapts on return visits (audit-honest: doesn't claim "done" if
    // sections are still pending; doesn't claim "incomplete" if they're all OK).
    const setupSubtitle = useMemo(() => {
        const total = 5;
        const completed = [1, 2, 3, 4, 5].filter(n => checkedSteps[n]).length;
        if (completed === 0) {
            return "Progressively configure your BI + AI experience. Each section stays editable on return visits.";
        }
        if (completed === total) {
            return "All sections configured. Click any section to review or update.";
        }
        return `${completed} of ${total} sections configured. Continue where you left off, or jump to any bookmark.`;
    }, [checkedSteps]);

    const defaultMeta = useMemo(() => ({
        bi: {
            source: hasVendorEmbedConfig ? "Saved embed configuration" : biSurfaceMode === "native" ? "Native canvas mode" : "Not configured",
            fresh: hasVendorEmbedConfig ? "Saved locally" : "Pending setup",
            owner: "BI owner",
            next: hasVendorEmbedConfig || biSurfaceMode === "native" ? "Review or test preview" : "Choose a BI surface",
        },
        ai: {
            source: activeAiProfile ? "Selected proxy profile" : "No profile selected",
            fresh: activeAiProfile ? "Current session" : "Pending setup",
            owner: "AI platform owner",
            next: activeAiProfile ? "Test connector" : "Choose an AI connector",
        },
        pack: {
            source: packSelection?.pack ? "Selected knowledge pack" : "No pack selected",
            fresh: packSelection?.pack ? "Current session" : "Optional",
            owner: "Data product owner",
            next: packSelection?.pack ? "Review grounding preview" : "Choose a pack if needed",
        },
        gov: {
            source: allowlistError ? "Policy check failed" : allowlistLoading ? "Checking policy" : "Current allowlist policy",
            fresh: allowlistError ? "Needs attention" : allowlistLoading ? "Checking now" : "Current session",
            owner: "Security or platform owner",
            next: allowlistError ? "Check proxy and allowlist route" : "Review production requirements",
        },
    }), [activeAiProfile, allowlistError, allowlistLoading, biSurfaceMode, hasVendorEmbedConfig, packSelection]);

    // Internal action log kept for gate validation feedback. The split-workspace
    // right preview pane that previously rendered these is gone; the state stays
    // so gate handlers (BI save, AI probe, preflight, etc.) keep working
    // unchanged. A future slice can surface the last action as a toast / chip.
    const [logs, setLogs] = useState<LogMessage[]>([
        { timestamp: formatTime(), message: "PulsePlay setup workspace initialized.", tone: "info" },
    ]);

    // Local embed URL state
    const [embedUrl, setEmbedUrl] = useState<string>(() => {
        if (!embedConfig || typeof embedConfig !== "object") return "";
        const c = embedConfig as Record<string, unknown>;
        return String(c.url || c.embedUrl || c.iframe || c.iframeHtml || c.secureLink || c.dashboardUrl || "");
    });
    const [embedError, setEmbedError] = useState<string | null>(null);
    const [showAdvancedBi, setShowAdvancedBi] = useState<boolean>(false);

    const [preflightLoading, setPreflightLoading] = useState<boolean>(false);
    const [preflightGrade, setPreflightGrade] = useState<"READY" | "WARNINGS" | "BLOCKED" | null>(null);
    const [preflightResults, setPreflightResults] = useState<{
        proxy: "ok" | "error" | "none";
        bi: "ok" | "warn" | "none";
        ai: "ok" | "error" | "none";
        attest: "ok" | "error" | "none";
    }>({ proxy: "none", bi: "none", ai: "none", attest: "none" });
    const [copySuccess, setCopySuccess] = useState<boolean>(false);

    const [profiles, setProfiles] = useState<SetupOption[]>([]);
    const [packs, setPacks] = useState<SetupOption[]>([]);

    useEffect(() => {
        setCheckedSteps(prev => ({
            ...prev,
            1: hasVendorEmbedConfig || biSurfaceMode === "native",
            2: !!activeAiProfile,
            3: !!packSelection,
        }));
    }, [activeAiProfile, biSurfaceMode, hasVendorEmbedConfig, packSelection]);

    useEffect(() => {
        let active = true;
        async function fetchProfilesAndPacks() {
            try {
                const res = await fetch("/api/assistant/profiles", { headers: { Accept: "application/json" } });
                if (res.ok && active) {
                    const data = await res.json();
                    setProfiles(normalizeProfilesPayload(data));
                }
            } catch {
                if (active) setProfiles([]);
            }
            try {
                const res = await fetch("/api/assistant/knowledge/packs", { headers: { Accept: "application/json" } });
                if (res.ok && active) {
                    const data = await res.json();
                    setPacks(normalizePacksPayload(data));
                }
            } catch {
                if (active) setPacks([]);
            }
        }
        fetchProfilesAndPacks();
        return () => { active = false; };
    }, []);

    const profileOptions = useMemo(() => {
        let list = profiles;
        if (allowlist?.configured && allowlist?.aiProfiles?.length) {
            const allowed = new Set(allowlist.aiProfiles);
            list = list.filter(p => allowed.has(p.name));
        }
        if (list.length > 0) {
            return list;
        }
        return (allowlist?.aiProfiles ?? []).map(name => ({ name, displayName: labelFromId(name) }));
    }, [profiles, allowlist]);

    const packOptions = useMemo(() => {
        let list = packs;
        if (allowlist?.configured && allowlist?.packs?.length) {
            const allowed = new Set(allowlist.packs);
            list = list.filter(p => allowed.has(p.name));
        }
        if (list.length > 0) {
            return list;
        }
        return (allowlist?.packs ?? []).map(name => ({ name, displayName: labelFromId(name) }));
    }, [packs, allowlist]);

    const appendLog = useCallback((message: string, tone: "info" | "success" | "warn" | "error") => {
        setLogs(prev => [...prev, { timestamp: formatTime(), message, tone }]);
    }, []);

    // Trigger preview hydration when BI Gate is completed
    const handleApplyEmbed = useCallback(() => {
        setEmbedError(null);
        const url = embedUrl.trim();
        if (!url) {
            setEmbedError("Enter the embed URL or iframe HTML before applying.");
            appendLog("BI Gate Save Attempt failed: URL is empty.", "error");
            return;
        }
        try {
            // Build minimal embed configuration based on vendor
            let cfg: Record<string, unknown> | null = null;
            if (biVendor === "databricks-genie") {
                cfg = { vendor: biVendor, iframe: url };
            } else if (biVendor === "generic-iframe" || biVendor === "tableau" || biVendor === "qlik" || biVendor === "looker") {
                cfg = { vendor: biVendor, url };
            } else if (biVendor === "databricks-aibi") {
                cfg = { vendor: biVendor, mode: "basic", url };
            } else if (biVendor === "powerbi") {
                cfg = { vendor: biVendor, mode: "secure-embed", embedMode: "secure", embedUrl: url };
            }

            if (!cfg) {
                setEmbedError(`PulsePlay can't auto-build a config for '${biVendor}' from a single URL. Use the BI group page.`);
                appendLog(`BI Config build failed: Unsupported inline layout for ${biVendor}`, "error");
                return;
            }
            setEmbedConfig(cfg);
            setCheckedSteps(prev => ({ ...prev, 1: true }));
            appendLog(`BI surface connected to ${biVendor}. Embed config saved locally.`, "success");
            setActiveStep(2);
        } catch (err) {
            setEmbedError(err instanceof Error ? err.message : String(err));
        }
    }, [biVendor, embedUrl, setEmbedConfig, appendLog]);

    const handleClearEmbed = useCallback(() => {
        setEmbedConfig(null);
        setEmbedUrl("");
        setEmbedError(null);
        setCheckedSteps(prev => ({ ...prev, 1: false }));
        appendLog("BI Embed configuration cleared by Author.", "info");
    }, [setEmbedConfig, appendLog]);

    const handleAiProfileChange = useCallback((profile: string) => {
        setActiveAiProfile(profile);
        setCheckedSteps(prev => ({ ...prev, 2: !!profile }));
        appendLog(`AI connector profile changed to: ${profile || "None"}.`, profile ? "success" : "warn");
        if (profile) {
            appendLog(`Probing Proxy handshake for profile: ${profile}...`, "info");
            setActiveStep(3);
        }
    }, [setActiveAiProfile, appendLog]);

    const testProfileHandshake = useCallback(async () => {
        if (!activeAiProfile) return;
        appendLog(`Probing ${activeAiProfile} connection route /api/assistant/profiles...`, "info");
        try {
            const res = await fetch(`/api/assistant/profiles?assistantProfile=${encodeURIComponent(activeAiProfile)}`, {
                headers: { Accept: "application/json" },
            });
            if (res.ok) {
                appendLog(`Profile handshake successful: ${activeAiProfile} is online and reachable.`, "success");
            } else {
                appendLog(`Profile handshake returned status: ${res.status}. Check your proxy config.json keys.`, "error");
            }
        } catch (err) {
            appendLog(`Handshake fail: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
    }, [activeAiProfile, appendLog]);

    const handlePackSelectionChange = useCallback((pack: string) => {
        setPackSelection(pack ? { pack } : null);
        setCheckedSteps(prev => ({ ...prev, 3: !!pack }));
        appendLog(`Knowledge pack changed to: ${pack || "Generic / no pack"}.`, pack ? "success" : "info");
        if (pack) {
            setActiveStep(4);
        }
    }, [setPackSelection, appendLog]);

    const runDiagnosticPreflight = useCallback(async () => {
        setPreflightLoading(true);
        appendLog("Initiating comprehensive Diagnostic Preflight Test Suite...", "info");

        let proxyOk = false;
        let biOk = false;
        let aiOk = false;
        let attestOk = false;

        try {
            const res = await fetch("/api/health", { headers: { Accept: "application/json" } });
            proxyOk = res.ok;
            appendLog(`Preflight [1/4] Proxy Health check: ${res.ok ? "ONLINE" : "OFFLINE"}`, res.ok ? "success" : "error");
        } catch {
            proxyOk = false;
            appendLog("Preflight [1/4] Proxy Health check: FAILED TO REACH", "error");
        }

        biOk = hasVendorEmbedConfig || biSurfaceMode === "native";
        appendLog(`Preflight [2/4] BI surface layout: ${biOk ? "CONFIGURED" : "MISSING"}`, biOk ? "success" : "warn");

        if (activeAiProfile) {
            try {
                const res = await fetch(`/api/assistant/profiles?assistantProfile=${encodeURIComponent(activeAiProfile)}`);
                aiOk = res.ok;
                appendLog(`Preflight [3/4] AI Connector handshake: ${res.ok ? "SUCCESS" : "FAILED"}`, res.ok ? "success" : "error");
            } catch {
                aiOk = false;
                appendLog("Preflight [3/4] AI Connector handshake: EXCEPTION OCCURRED", "error");
            }
        } else {
            aiOk = false;
            appendLog("Preflight [3/4] AI Connector handshake: NO PROFILE SELECTED", "error");
        }

        attestOk = proxyOk && aiOk;
        appendLog(`Preflight [4/4] Governance route check: ${attestOk ? "READY TO ATTEST" : "NOT READY"}`, attestOk ? "success" : "error");

        setPreflightResults({
            proxy: proxyOk ? "ok" : "error",
            bi: hasVendorEmbedConfig ? "ok" : biSurfaceMode === "native" ? "warn" : "none",
            ai: aiOk ? "ok" : "error",
            attest: attestOk ? "ok" : "error"
        });

        let grade: "READY" | "WARNINGS" | "BLOCKED" = "READY";
        if (!proxyOk || !aiOk || !attestOk) {
            grade = "BLOCKED";
        } else if (biSurfaceMode === "native" || !hasVendorEmbedConfig) {
            grade = "WARNINGS";
        }

        setPreflightGrade(grade);
        setCheckedSteps(prev => ({ ...prev, 5: grade !== "BLOCKED" }));
        setPreflightLoading(false);
        appendLog(`Diagnostic preflight completed. Overall Grade: ${grade}`, grade === "READY" ? "success" : grade === "WARNINGS" ? "warn" : "error");
    }, [activeAiProfile, hasVendorEmbedConfig, biSurfaceMode, appendLog]);

    const redactedBundleJson = useMemo(() => {
        const payload = {
            pulseplay: {
                version: "1.0.0",
                draftConfig: {
                    biVendor: biVendor || "not_selected",
                    biSurfaceMode: biSurfaceMode,
                    hasEmbedConfig: hasVendorEmbedConfig,
                    activeAiProfile: activeAiProfile || "not_selected",
                    groundingPack: packSelection?.pack || "none",
                },
                governanceEnforcement: allowlist?.enforcement || "strict",
                systemDiagnostics: {
                    proxyStatus: preflightResults.proxy === "ok" ? "READY" : "ERROR",
                    biStatus: preflightResults.bi === "ok" ? "READY" : preflightResults.bi === "warn" ? "NATIVE_FALLBACK" : "ERROR",
                    aiStatus: preflightResults.ai === "ok" ? "READY" : "ERROR",
                    attestationStatus: preflightResults.attest === "ok" ? "READY_TO_ATTEST" : "NOT_READY"
                },
                diagnosticsGrade: preflightGrade || "UNTESTED",
                freshnessStamp: new Date().toISOString()
            }
        };
        return JSON.stringify(payload, null, 2);
    }, [biVendor, biSurfaceMode, hasVendorEmbedConfig, activeAiProfile, packSelection, allowlist, preflightResults, preflightGrade]);

    const handleCopyBundle = useCallback(() => {
        navigator.clipboard.writeText(redactedBundleJson);
        setCopySuccess(true);
        appendLog("Redacted diagnostics bundle copied to clipboard.", "success");
        setTimeout(() => setCopySuccess(false), 2000);
    }, [redactedBundleJson, appendLog]);

    // Scroll-to-anchor helper used by the top anchors strip. Activates the
    // step (which opens the accordion) and scrolls the section into view.
    const scrollToSection = useCallback((anchorId: string, step: number) => {
        setActiveStep(step);
        if (typeof document !== "undefined") {
            const el = document.getElementById(`pp-setup-section-${anchorId}`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

    const SECTION_ANCHORS = useMemo(() => [
        { id: "bi", step: 1, label: "BI Surface" },
        { id: "ai", step: 2, label: "AI Assistant" },
        { id: "pack", step: 3, label: "Knowledge" },
        { id: "gov", step: 4, label: "Governance" },
        { id: "test", step: 5, label: "Test & Handoff" },
    ] as const, []);

    return (
        <section aria-labelledby="settings-setup-title" className="pp-setup" style={{ maxWidth: "100%", margin: 0 }}>
            {/* UX-ARCH-0B.2 follow-up 2026-05-23 — title + subtitle visually
                hidden. The page already says "Settings" + gear icon up top and
                the rail makes the active group obvious; a giant duplicate "Setup"
                h2 was wasting vertical space. Title kept as sr-only so a11y
                consumers + existing tests still find the labelledby anchor.
                The previous subtitle copy lives in a hoverable (?) info pill
                next to the readiness pill so authors can still read it when
                they want it. */}
            <header className="pp-setup__head" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--pp-border-subtle, rgba(0,0,0,0.06))" }}>
                <h2 id="settings-setup-title" className="pp-setup__title" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                    Setup
                </h2>
                <p className="pp-setup__subtitle" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{setupSubtitle}</p>
                {/* 2026-05-27 — raw title-based `i` replaced with shared
                    HelpTip (Codex audit P0). */}
                <HelpTip
                    label="About this page"
                    title="Setup"
                    text={setupSubtitle}
                />

                {/* Top-right pill: readiness state + Preview as Viewer action. */}
                <div className="pp-setup__readiness pp-setup__pill" style={{ margin: 0 }}>
                    <span
                        className={`pp-settings-chip pp-settings-chip--${pillState.tone}`}
                        style={{ cursor: "default", transform: "none" }}
                    >
                        <span className="pp-settings-chip__dot" />
                        <span className="pp-settings-chip__label">{pillState.label}</span>
                    </span>
                    <a
                        href="/?surface=ai-insights"
                        className="pp-setup__pill-action"
                        title={pillState.tone === "ok" ? "Open the playground with AI Insights as the active surface" : "Open viewer rendering (partial config — viewer may see limited results)"}
                    >
                        👁 Preview as viewer →
                    </a>
                </div>
            </header>

            {/* Top search — type-ahead filter over known PulsePlay settings */}
            <div className="pp-setup__search" role="search">
                <span className="pp-setup__search-icon" aria-hidden="true">🔍</span>
                <input
                    type="search"
                    className="pp-setup__search-input"
                    placeholder='Search settings (try: "domain guidance", "metric direction", "sandbox")'
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    aria-label="Search setup fields"
                />
                {searchResults.length > 0 && (
                    <ul className="pp-setup__search-results" role="listbox">
                        {searchResults.map((result, idx) => {
                            const hasHref = "href" in result && typeof result.href === "string";
                            const key = hasHref
                                ? `${result.href}-${result.label}-${idx}`
                                : `${(result as { id: string }).id}-${result.label}-${idx}`;
                            return (
                                <li key={key} role="option" aria-selected={false}>
                                    <button
                                        type="button"
                                        className="pp-setup__search-result"
                                        onClick={() => {
                                            if (hasHref) {
                                                // UX-ARCH-0B.2 Phase B — cross-Settings deep link.
                                                // Use SPA navigation so React Router picks up the
                                                // route change without a full reload.
                                                try {
                                                    window.history.pushState({}, "", (result as { href: string }).href);
                                                    window.dispatchEvent(new PopStateEvent("popstate"));
                                                } catch {
                                                    window.location.href = (result as { href: string }).href;
                                                }
                                            } else {
                                                const r = result as { id: string; step: number };
                                                scrollToSection(r.id, r.step);
                                            }
                                            setSearchQuery("");
                                        }}
                                    >
                                        <span className="pp-setup__search-result-label">{result.label}</span>
                                        <span className="pp-setup__search-result-section">{result.section}</span>
                                        <span className="pp-setup__search-result-hint">{result.hint}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {searchQuery.trim() && searchResults.length === 0 && (
                    <p className="pp-setup__search-empty">
                        No matches found. Try a different keyword, or browse <a href="/settings/ai">Settings → AI</a> · <a href="/settings/preferences">Preferences</a> · <a href="/settings/system">System</a> · <a href="/settings/advanced">Advanced</a> directly.
                    </p>
                )}
            </div>

            {/* 2026-05-27 — Setup Home compact task list (Settings Slice 2 per
                SETTINGS_PROGRESSIVE_PARENT_CHILD_CLAUDE_HANDOFF_2026-05-27.md).
                Task/readiness-first view: rows over field walls. Each row
                deep-links to the owning Settings group page. The detailed
                progressive sections below remain reachable via anchor strip
                + scroll, but the first viewport is now task-first. */}
            <section className="pp-setup__home" aria-label="Setup home tasks" style={{
                margin: "16px 0",
                border: "1px solid var(--pp-border-subtle, rgba(0,0,0,0.08))",
                borderRadius: 8,
                background: "var(--pp-surface, #fff)",
                overflow: "hidden",
            }}>
                <header style={{ padding: "10px 14px", borderBottom: "1px solid var(--pp-border-subtle, rgba(0,0,0,0.08))", background: "rgba(0,0,0,0.02)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pp-text)" }}>Setup tasks</div>
                    <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>Pick the next step. Each task opens its owning page.</div>
                </header>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: "rgba(0,0,0,0.015)", textAlign: "left" }}>
                            <th style={{ padding: "6px 14px", fontSize: 10, fontWeight: 600, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Task</th>
                            <th style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em" }}>State</th>
                            <th style={{ padding: "6px 12px", fontSize: 10, fontWeight: 600, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Owner</th>
                            <th style={{ padding: "6px 14px", fontSize: 10, fontWeight: 600, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.04em" }}>Next action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(() => {
                            const tasks: Array<{ task: string; state: string; tone: "ok" | "warn" | "info"; owner: string; action: string; href: string }> = [
                                {
                                    task: "BI Surface",
                                    state: readiness.biReady ? "Ready" : (readiness.hasBiProvider ? "Partial" : "Missing"),
                                    tone: readiness.biReady ? "ok" : (readiness.hasBiProvider ? "warn" : "info"),
                                    owner: "BI owner",
                                    action: readiness.biReady ? "Validate embed" : "Choose or test surface",
                                    href: "/settings/bi",
                                },
                                {
                                    task: "AI Assistant",
                                    state: readiness.aiReady ? "Ready" : "Missing",
                                    tone: readiness.aiReady ? "ok" : "info",
                                    owner: "AI platform",
                                    action: readiness.aiReady ? "Run test again" : "Choose or test assistant",
                                    href: "/settings/ai",
                                },
                                {
                                    task: "Business Context",
                                    state: "Suggested",
                                    tone: "info",
                                    owner: "Data product",
                                    action: "Review defaults",
                                    href: "/settings/ai",
                                },
                                {
                                    task: "Governance",
                                    state: allowlist ? "Dev permissive" : "Warning",
                                    tone: allowlist ? "warn" : "warn",
                                    owner: "Platform / Security",
                                    action: "Review allowlist",
                                    href: "/settings/advanced",
                                },
                                {
                                    task: "Preview & Handoff",
                                    state: readiness.ready ? "Ready" : "Untested",
                                    tone: readiness.ready ? "ok" : "info",
                                    owner: "Author",
                                    action: readiness.ready ? "Preview as viewer" : "Complete setup first",
                                    href: readiness.ready ? "/?surface=ai-insights" : "/settings/bi",
                                },
                            ];
                            return tasks.map(t => (
                                <tr key={t.task} style={{ borderTop: "1px solid var(--pp-border-subtle, rgba(0,0,0,0.06))" }}>
                                    <td style={{ padding: "8px 14px", fontWeight: 500 }}>{t.task}</td>
                                    <td style={{ padding: "8px 12px" }}>
                                        <span
                                            className={`pp-settings-chip pp-settings-chip--${t.tone}`}
                                            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, display: "inline-block" }}
                                        >{t.state}</span>
                                    </td>
                                    <td style={{ padding: "8px 12px", opacity: 0.7 }}>{t.owner}</td>
                                    <td style={{ padding: "8px 14px" }}>
                                        <a href={t.href} style={{ color: "#0366d6", textDecoration: "none", fontWeight: 500 }}>{t.action} →</a>
                                    </td>
                                </tr>
                            ));
                        })()}
                    </tbody>
                </table>
            </section>

            {/* Top anchors strip — sticky bookmarks for progressive sections.
               Using <div role="navigation"> instead of <nav> to avoid colliding
               with the parent Settings shell's <nav> in selector-based tests. */}
            <div className="pp-setup__anchors" role="navigation" aria-label="Setup sections">
                {SECTION_ANCHORS.map(section => {
                    const isChecked = !!checkedSteps[section.step];
                    const isActive = activeStep === section.step;
                    return (
                        <button
                            key={section.id}
                            type="button"
                            className={`pp-setup__anchor${isActive ? " pp-setup__anchor--active" : ""}${isChecked ? " pp-setup__anchor--checked" : ""}`}
                            onClick={() => scrollToSection(section.id, section.step)}
                            aria-current={isActive ? "step" : undefined}
                        >
                            <span className="pp-setup__anchor-dot" aria-hidden="true">{isChecked ? "✓" : section.step}</span>
                            <span className="pp-setup__anchor-label">{section.label}</span>
                        </button>
                    );
                })}
            </div>

            {allowlistError && (
                <div className="pp-setup__alert" role="alert" style={{ padding: "10px 14px", background: "rgba(220, 53, 69, 0.08)", border: "1px solid rgba(220, 53, 69, 0.26)", color: "#a01828", borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
                    Governance allowlist is not reachable: {allowlistError}. Make sure the proxy is running.
                </div>
            )}

            {/* Progressive single-column sections */}
            <div className="pp-setup__sections">

                    {/* Section 1: BI Surface */}
                    <div id="pp-setup-section-bi" className={`pp-setup-gate ${activeStep === 1 ? "pp-setup-gate--active" : ""} ${checkedSteps[1] ? "pp-setup-gate--checked" : ""}`}>
                        <button type="button" className="pp-setup-gate__header" onClick={() => setActiveStep(activeStep === 1 ? 0 : 1)}>
                            <div className="pp-setup-gate__title-row">
                                <span className="pp-setup-gate__number">{checkedSteps[1] ? "OK" : "01"}</span>
                                <div>
                                    <h3 className="pp-setup-gate__title">BI surface selection</h3>
                                    <p className="pp-setup-gate__subtitle">
                                        {embedConfig ? `Mounted via ${biVendor}` : "No BI surface embed configured"}
                                    </p>
                                </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{activeStep === 1 ? "Collapse" : "Expand"}</span>
                        </button>

                        {activeStep === 1 && (
                            <div className="pp-setup-gate__content">
                                {/* Metadata State */}
                                <div className="pp-setup-metadata">
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Source:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.bi.source}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Freshness:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.bi.fresh}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Owner:</span>
                                        <span className="pp-setup-metadata__value" style={{ fontFamily: "inherit", fontWeight: 500 }}>{defaultMeta.bi.owner}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Next action:</span>
                                        <span className="pp-setup-metadata__value" style={{ color: "var(--pp-accent)" }}>{defaultMeta.bi.next}</span>
                                    </div>
                                </div>

                                <div className="pp-setup__field-wrapper" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div>
                                        <label htmlFor="pp-surface-mode" style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Surface mode</label>
                                        <div style={{ display: "flex", gap: 6 }}>
                                            {(["auto", "vendor", "native"] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => setBiSurfaceMode(mode)}
                                                    style={{
                                                        border: `1.5px solid ${biSurfaceMode === mode ? "var(--pp-accent)" : "rgba(0,0,0,0.12)"}`,
                                                        background: biSurfaceMode === mode ? "rgba(37,99,235,0.06)" : "transparent",
                                                        color: biSurfaceMode === mode ? "var(--pp-accent)" : "inherit",
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        padding: "6px 14px",
                                                        borderRadius: 6,
                                                        cursor: "pointer",
                                                        textTransform: "capitalize"
                                                    }}
                                                >
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {biSurfaceMode !== "native" && (
                                        <div>
                                            <label htmlFor="pp-bi-vendor" style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Provider</label>
                                            <select
                                                id="pp-bi-vendor"
                                                value={biVendor}
                                                onChange={e => setBiVendor(e.target.value)}
                                                style={{ width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)" }}
                                            >
                                                <option value="">- Choose a vendor -</option>
                                                {allowedBiVendors.map(v => (
                                                    <option key={v.vendor} value={v.vendor}>{v.displayName}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {biVendor && biSurfaceMode !== "native" && (
                                        <div>
                                            <label htmlFor="pp-embed-url" style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Embed URL or iframe HTML</label>
                                            <textarea
                                                id="pp-embed-url"
                                                value={embedUrl}
                                                onChange={e => { setEmbedUrl(e.target.value); setEmbedError(null); }}
                                                placeholder={biVendor === "databricks-genie" ? '<iframe src="https://..."></iframe>' : "https://app.powerbi.com/reportEmbed?..."}
                                                rows={3}
                                                style={{ width: "100%", padding: "8px 10px", fontSize: 11, fontFamily: "var(--pp-font-mono)", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", resize: "vertical" }}
                                            />
                                            {embedError && <p style={{ fontSize: 11, color: "var(--pp-error, #dc2626)", margin: "4px 0 0" }}>{embedError}</p>}
                                        </div>
                                    )}

                                    {/* Advanced Sandboxing Shield */}
                                    {biVendor && biSurfaceMode !== "native" && (
                                        <div>
                                            <button
                                                type="button"
                                                onClick={() => setShowAdvancedBi(!showAdvancedBi)}
                                                style={{ border: "none", background: "transparent", color: "var(--pp-accent)", font: "inherit", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}
                                            >
                                                {showAdvancedBi ? "Hide advanced sandboxing rules" : "Show advanced sandboxing rules"}
                                            </button>
                                            {showAdvancedBi && (
                                                <div style={{ marginTop: 8, padding: "10px 12px", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 6, background: "rgba(0,0,0,0.02)", fontSize: 11 }}>
                                                    <strong>Corporate iframe sandbox attributes:</strong>
                                                    <code style={{ display: "block", marginTop: 4, background: "var(--pp-surface-raised, #fff)", color: "var(--pp-text, #1f2937)", padding: "4px 6px", borderRadius: 4, border: "1px solid var(--pp-border, rgba(0,0,0,0.05))" }}>
                                                        allow-scripts allow-same-origin allow-forms allow-popups
                                                    </code>
                                                    <p style={{ margin: "6px 0 0", color: "var(--pp-text-muted)", fontSize: 10 }}>InfoSec Note: Sandbox rules are enforced server-side. Custom additions require Admin permissions.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                                        <button type="button" className="pp-setup__primary" onClick={handleApplyEmbed} disabled={biSurfaceMode !== "native" && !embedUrl.trim()}>
                                            Apply & Validate Surface
                                        </button>
                                        {hasVendorEmbedConfig && (
                                            <button type="button" className="pp-setup__ghost" onClick={handleClearEmbed}>
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Gate 2: AI Connector */}
                    <div id="pp-setup-section-ai" className={`pp-setup-gate ${activeStep === 2 ? "pp-setup-gate--active" : ""} ${checkedSteps[2] ? "pp-setup-gate--checked" : ""}`}>
                        <button type="button" className="pp-setup-gate__header" onClick={() => setActiveStep(activeStep === 2 ? 0 : 2)}>
                            <div className="pp-setup-gate__title-row">
                                <span className="pp-setup-gate__number">{checkedSteps[2] ? "OK" : "02"}</span>
                                <div>
                                    <h3 className="pp-setup-gate__title">AI connector selection</h3>
                                    <p className="pp-setup-gate__subtitle">
                                        {activeAiProfile ? `Active connector: ${activeAiProfile}` : "No AI profile selected"}
                                    </p>
                                </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{activeStep === 2 ? "Collapse" : "Expand"}</span>
                        </button>

                        {activeStep === 2 && (
                            <div className="pp-setup-gate__content">
                                {/* Metadata State */}
                                <div className="pp-setup-metadata">
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Source:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.ai.source}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Freshness:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.ai.fresh}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Owner:</span>
                                        <span className="pp-setup-metadata__value" style={{ fontFamily: "inherit", fontWeight: 500 }}>{defaultMeta.ai.owner}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Next action:</span>
                                        <span className="pp-setup-metadata__value" style={{ color: "var(--pp-accent)" }}>{defaultMeta.ai.next}</span>
                                    </div>
                                </div>

                                <div className="pp-setup__field-wrapper" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div>
                                        <label htmlFor="pp-ai-profile" style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Approved AI connector profile</label>
                                        <select
                                            id="pp-ai-profile"
                                            value={activeAiProfile}
                                            onChange={e => handleAiProfileChange(e.target.value)}
                                            style={{ width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)" }}
                                        >
                                            <option value="">- Choose a profile -</option>
                                            {profileOptions.map(p => (
                                                <option key={p.name} value={p.name}>{p.displayName}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                                        <button
                                            type="button"
                                            className="pp-setup__ghost"
                                            onClick={testProfileHandshake}
                                            disabled={!activeAiProfile}
                                        >
                                            Test connector handshake
                                        </button>
                                    </div>

                                    {/* Advanced authoring callout — bridges to the rich Pulse-ported
                                       authoring controls (Authoring mode, Section editor, Prompt
                                       preview, Domain guidance, Suggest from data, 96-field search)
                                       which currently live in the AI Insights Developer Tools panel.
                                       Progressive extraction into inline drawer is queued as a
                                       follow-up slice. */}
                                    <div className="pp-setup__callout">
                                        <div className="pp-setup__callout-body">
                                            <strong className="pp-setup__callout-title">Advanced authoring</strong>
                                            <p className="pp-setup__callout-desc">
                                                Authoring mode, Section editor (HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS), Prompt preview, Domain guidance override, Suggest from data, and Metric direction rules (Higher/Lower + Green/Amber/Red thresholds) live in AI Setup → <em>04 Response behavior</em>.
                                            </p>
                                        </div>
                                        <a href="/settings/ai" className="pp-setup__callout-action">
                                            Open AI Setup · Response behavior →
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Gate 3: Grounding Pack */}
                    <div id="pp-setup-section-pack" className={`pp-setup-gate ${activeStep === 3 ? "pp-setup-gate--active" : ""} ${checkedSteps[3] ? "pp-setup-gate--checked" : ""}`}>
                        <button type="button" className="pp-setup-gate__header" onClick={() => setActiveStep(activeStep === 3 ? 0 : 3)}>
                            <div className="pp-setup-gate__title-row">
                                <span className="pp-setup-gate__number">{checkedSteps[3] ? "OK" : "03"}</span>
                                <div>
                                    <h3 className="pp-setup-gate__title">Domain Knowledge Pack</h3>
                                    <p className="pp-setup-gate__subtitle">
                                        {packSelection?.pack ? `Grounding in: ${packSelection.pack}` : "Using default generic vocabulary"}
                                    </p>
                                </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{activeStep === 3 ? "Collapse" : "Expand"}</span>
                        </button>

                        {activeStep === 3 && (
                            <div className="pp-setup-gate__content">
                                {/* Metadata State */}
                                <div className="pp-setup-metadata">
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Source:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.pack.source}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Freshness:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.pack.fresh}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Owner:</span>
                                        <span className="pp-setup-metadata__value" style={{ fontFamily: "inherit", fontWeight: 500 }}>{defaultMeta.pack.owner}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Next action:</span>
                                        <span className="pp-setup-metadata__value" style={{ color: "var(--pp-accent)" }}>{defaultMeta.pack.next}</span>
                                    </div>
                                </div>

                                <div className="pp-setup__field-wrapper" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div>
                                        <label htmlFor="pp-pack-select" style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Grounding vocabulary pack</label>
                                        <select
                                            id="pp-pack-select"
                                            value={packSelection?.pack ?? ""}
                                            onChange={e => handlePackSelectionChange(e.target.value)}
                                            style={{ width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)" }}
                                        >
                                            <option value="">- No pack (generic reasoning) -</option>
                                            {packOptions.map(p => (
                                                <option key={p.name} value={p.name}>{p.displayName}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {packSelection?.pack && (
                                        <div>
                                            <span style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>Grounding Glossary Preview:</span>
                                            <div className="pp-setup-glossary">
                                                <div className="pp-setup-glossary__item">
                                                    <span className="pp-setup-glossary__term">Business terms:</span> pack-specific definitions that can guide prompts and explanations.
                                                </div>
                                                <div className="pp-setup-glossary__item">
                                                    <span className="pp-setup-glossary__term">Metrics:</span> governed KPI names, aliases, and expected calculation notes when available.
                                                </div>
                                                <div className="pp-setup-glossary__item">
                                                    <span className="pp-setup-glossary__term">Scope:</span> source, freshness, and owner details should be confirmed before publishing.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Gate 4: Governance Review */}
                    <div id="pp-setup-section-gov" className={`pp-setup-gate ${activeStep === 4 ? "pp-setup-gate--active" : ""} ${checkedSteps[4] ? "pp-setup-gate--checked" : ""}`}>
                        <button type="button" className="pp-setup-gate__header" onClick={() => setActiveStep(activeStep === 4 ? 0 : 4)}>
                            <div className="pp-setup-gate__title-row">
                                <span className="pp-setup-gate__number">{checkedSteps[4] ? "OK" : "04"}</span>
                                <div>
                                    <h3 className="pp-setup-gate__title">Governance policy review</h3>
                                    <p className="pp-setup-gate__subtitle">
                                        Enforced by corporate tenant policies. Read-only.
                                    </p>
                                </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{activeStep === 4 ? "Collapse" : "Expand"}</span>
                        </button>

                        {activeStep === 4 && (
                            <div className="pp-setup-gate__content">
                                {/* Metadata State */}
                                <div className="pp-setup-metadata">
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Source:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.gov.source}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Freshness:</span>
                                        <span className="pp-setup-metadata__value">{defaultMeta.gov.fresh}</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Owner:</span>
                                        <span className="pp-setup-metadata__value" style={{ fontFamily: "inherit", fontWeight: 500 }}>{defaultMeta.gov.owner}</span>
                                    </div>
                                </div>

                                <div className="pp-setup-gov-list">
                                    <div className="pp-setup-gov-item">
                                        <div className="pp-setup-gov-item__header">
                                            <span className="pp-setup-gov-item__title">Iframe Sandbox restrictions</span>
                                            <span style={{ fontSize: 9, color: "var(--pp-text-muted)", fontWeight: 700 }}>[POLICY]</span>
                                        </div>
                                        <p className="pp-setup-gov-item__desc">
                                            Allowlist and sandbox policy are enforced when the proxy policy route is reachable. Confirm allowed origins before publishing.
                                        </p>
                                        <div style={{ fontSize: 9, color: "var(--pp-text-muted)", marginTop: 2 }}>Owner: security or platform owner | Fresh: current session</div>
                                    </div>

                                    <div className="pp-setup-gov-item">
                                        <div className="pp-setup-gov-item__header">
                                            <span className="pp-setup-gov-item__title">Identity and row-level security review</span>
                                            <span style={{ fontSize: 9, color: "var(--pp-text-muted)", fontWeight: 700 }}>[CONFIRM]</span>
                                        </div>
                                        <p className="pp-setup-gov-item__desc">
                                            RLS and delegated identity behavior depend on the selected BI vendor, hosting mode, and auth configuration. Confirm with the deployment owner before production.
                                        </p>
                                        <div style={{ fontSize: 9, color: "var(--pp-text-muted)", marginTop: 2 }}>Owner: BI security owner | Fresh: pending live validation</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Gate 5: Smoke Preflight & Handoff */}
                    <div id="pp-setup-section-test" className={`pp-setup-gate ${activeStep === 5 ? "pp-setup-gate--active" : ""} ${checkedSteps[5] ? "pp-setup-gate--checked" : ""}`}>
                        <button type="button" className="pp-setup-gate__header" onClick={() => setActiveStep(activeStep === 5 ? 0 : 5)}>
                            <div className="pp-setup-gate__title-row">
                                <span className="pp-setup-gate__number">{checkedSteps[5] ? "OK" : "05"}</span>
                                <div>
                                    <h3 className="pp-setup-gate__title">Diagnostics smoke test & handoff</h3>
                                    <p className="pp-setup-gate__subtitle">
                                        {preflightGrade ? `Ready status: ${preflightGrade}` : "Diagnostics preflight required"}
                                    </p>
                                </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{activeStep === 5 ? "Collapse" : "Expand"}</span>
                        </button>

                        {activeStep === 5 && (
                            <div className="pp-setup-gate__content">
                                {/* Metadata State */}
                                <div className="pp-setup-metadata">
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Source:</span>
                                        <span className="pp-setup-metadata__value">Local preflight runner</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Freshness:</span>
                                        <span className="pp-setup-metadata__value">Evaluated active</span>
                                    </div>
                                    <div className="pp-setup-metadata__item">
                                        <span className="pp-setup-metadata__label">Owner:</span>
                                        <span className="pp-setup-metadata__value" style={{ fontFamily: "inherit", fontWeight: 500 }}>System diagnostics desk</span>
                                    </div>
                                </div>

                                <div className="pp-setup-tests">
                                    <div className="pp-setup-test-row">
                                        <div className="pp-setup-test-row__left">
                                            <span className={`pp-setup-test-row__dot ${preflightResults.proxy === "ok" ? "pp-setup-test-row__dot--ok" : preflightResults.proxy === "error" ? "pp-setup-test-row__dot--error" : ""}`} />
                                            <span>Proxy status</span>
                                        </div>
                                        <span className="pp-setup-test-row__detail">{preflightResults.proxy === "ok" ? "ONLINE" : preflightResults.proxy === "error" ? "UNREACHABLE" : "Not evaluated"}</span>
                                    </div>

                                    <div className="pp-setup-test-row">
                                        <div className="pp-setup-test-row__left">
                                            <span className={`pp-setup-test-row__dot ${preflightResults.bi === "ok" ? "pp-setup-test-row__dot--ok" : preflightResults.bi === "warn" ? "pp-setup-test-row__dot--warn" : ""}`} />
                                            <span>BI surface mount</span>
                                        </div>
                                        <span className="pp-setup-test-row__detail">{preflightResults.bi === "ok" ? "SANDBOX CONNECTED" : preflightResults.bi === "warn" ? "NATIVE FALLBACK" : "Not evaluated"}</span>
                                    </div>

                                    <div className="pp-setup-test-row">
                                        <div className="pp-setup-test-row__left">
                                            <span className={`pp-setup-test-row__dot ${preflightResults.ai === "ok" ? "pp-setup-test-row__dot--ok" : preflightResults.ai === "error" ? "pp-setup-test-row__dot--error" : ""}`} />
                                            <span>AI Connector handshake</span>
                                        </div>
                                        <span className="pp-setup-test-row__detail">{preflightResults.ai === "ok" ? "SUCCESS" : preflightResults.ai === "error" ? "FAILED" : "Not evaluated"}</span>
                                    </div>

                                    <div className="pp-setup-test-row">
                                        <div className="pp-setup-test-row__left">
                                            <span className={`pp-setup-test-row__dot ${preflightResults.attest === "ok" ? "pp-setup-test-row__dot--ok" : preflightResults.attest === "error" ? "pp-setup-test-row__dot--error" : ""}`} />
                                            <span>Attestation check</span>
                                        </div>
                                        <span className="pp-setup-test-row__detail">{preflightResults.attest === "ok" ? "READY TO ATTEST" : preflightResults.attest === "error" ? "NOT READY" : "Not evaluated"}</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="pp-setup__primary"
                                    onClick={runDiagnosticPreflight}
                                    disabled={preflightLoading}
                                    style={{ width: "100%", marginBottom: 16 }}
                                >
                                    {preflightLoading ? "Evaluating systems..." : "Run diagnostic preflight suite"}
                                </button>

                                {/* Handoff Zone */}
                                {preflightGrade && (
                                    <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 14 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>Redacted Diagnostic Bundle for Support:</span>
                                        <textarea
                                            readOnly
                                            className="pp-setup-bundle"
                                            value={redactedBundleJson}
                                            rows={6}
                                        />
                                        <button
                                            type="button"
                                            className="pp-setup__ghost"
                                            onClick={handleCopyBundle}
                                            style={{ width: "100%" }}
                                        >
                                            {copySuccess ? "Diagnostics bundle copied!" : "Copy Diagnostics bundle"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
            </div>
        </section>
    );
}

// Helpers
const VENDOR_DISPLAY: Record<string, string> = {
    "powerbi": "Power BI",
    "databricks-aibi": "Databricks AI/BI",
    "databricks-genie": "Databricks Genie",
    "tableau": "Tableau",
    "qlik": "Qlik Sense",
    "looker": "Looker",
    "generic-iframe": "Generic iframe",
};

function formatVendorName(vendor: string): string {
    return VENDOR_DISPLAY[vendor] || vendor;
}

function formatTime(date = new Date()): string {
    return date.toTimeString().split(" ")[0] ?? "";
}

function labelFromId(value: string): string {
    return value
        .split(/[-_.\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function normalizeProfilesPayload(data: unknown): SetupOption[] {
    const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { profiles?: unknown } | null)?.profiles)
            ? (data as { profiles: unknown[] }).profiles
            : [];
    return list
        .filter((profile): profile is Record<string, unknown> =>
            !!profile &&
            typeof profile === "object" &&
            typeof profile.name === "string" &&
            profile.name.trim().length > 0,
        )
        .map(profile => ({
            name: String(profile.name),
            displayName: typeof profile.displayName === "string" && profile.displayName.trim()
                ? profile.displayName
                : labelFromId(String(profile.name)),
        }));
}

function normalizePacksPayload(data: unknown): SetupOption[] {
    const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { packs?: unknown } | null)?.packs)
            ? (data as { packs: unknown[] }).packs
            : [];
    return list
        .filter((pack): pack is Record<string, unknown> =>
            !!pack &&
            typeof pack === "object" &&
            typeof pack.name === "string" &&
            pack.name.trim().length > 0,
        )
        .map(pack => ({
            name: String(pack.name),
            displayName: typeof pack.displayName === "string" && pack.displayName.trim()
                ? pack.displayName
                : labelFromId(String(pack.name)),
        }));
}
