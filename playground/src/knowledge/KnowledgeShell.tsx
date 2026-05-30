// playground/src/knowledge/KnowledgeShell.tsx
//
// Phase 8 (KB UI) — the Knowledge Base page. Read-only browser for
// pack content. Lives at /knowledge and is mounted by App.tsx when the
// route matches. The Settings page deep-links here via AI › Browse
// library ↗.
//
// Layout:
//   - Header with brand + back-to-app
//   - Left rail: list of installed (allowlisted) packs
//   - Content pane: section tabs (Overview / Glossary / Ontology /
//     References / Sub-verticals / Runtime / Demos)
//   - Sub-vertical detail panel inside Sub-verticals section
//
// No retrieval preview yet — that lands when the Phase 3 retrieval
// provider interface ships. The Runtime tab shows what WOULD be injected
// from PulsePack content today (pack glossary + sub-vertical prompt
// context), since that's all the runtime currently consumes.

import { useEffect, useMemo, useState } from "react";
import {
    KNOWLEDGE_SECTIONS,
    navigateToKnowledge,
    useKnowledgeRoute,
    type KnowledgeSection,
} from "./knowledgeRoute";
import { useSettings } from "../settings/settingsStore";
import { navigateToSettings } from "../settings/settingsRoute";

interface PackSummary {
    name: string;
    displayName?: string;
    description?: string;
    subVerticals?: Array<{ name: string; displayName?: string; description?: string }>;
}

interface PackDetail extends PackSummary {
    version?: string;
    industries?: string[];
    aiCompatibility?: string[];
    biCompatibility?: string[];
    crossCutting?: string[];
    readme?: string | null;
    migrationNotes?: string | null;
    knowledgeBase?: {
        glossary?: string | null;
        ontology?: string | null;
        references?: string | null;
    };
    installedSubVerticals?: string[];
    demoConfigs?: string[];
    fetchedAt?: string;
}

interface SubVerticalDetail {
    pack: string;
    subVertical: string;
    readme?: string | null;
    kpis?: string | null;
    sampleQuestions?: string | null;
    promptContext?: string | null;
    biAiFit?: string | null;
    fetchedAt?: string;
}

const SECTION_LABELS: Record<KnowledgeSection, string> = {
    overview: "Overview",
    glossary: "Glossary",
    ontology: "Ontology",
    references: "References",
    "sub-verticals": "Sub-verticals",
    runtime: "Runtime use",
    demos: "Demos",
};

const SECTION_HINTS: Record<KnowledgeSection, string> = {
    overview: "Pack manifest, README, AI/BI compatibility",
    glossary: "Domain terms and definitions used by the AI for grounding",
    ontology: "Entities and relationships across this domain",
    references: "External sources, standards, and citations",
    "sub-verticals": "KPIs, sample questions, BI/AI fit per sub-vertical",
    runtime: "What pack content actually flows into the AI prompt today",
    demos: "Loadable demo scenarios bundled with the pack",
};

export function KnowledgeShell(): React.ReactElement {
    const route = useKnowledgeRoute();
    const settings = useSettings();
    const [packList, setPackList] = useState<PackSummary[]>([]);
    const [packListLoading, setPackListLoading] = useState(true);
    const [packListError, setPackListError] = useState<string>("");
    const [activeDetail, setActiveDetail] = useState<PackDetail | null>(null);
    const [activeDetailLoading, setActiveDetailLoading] = useState(false);
    const [activeDetailError, setActiveDetailError] = useState<string>("");
    const [subDetail, setSubDetail] = useState<SubVerticalDetail | null>(null);
    const [subDetailLoading, setSubDetailLoading] = useState(false);
    const [subDetailError, setSubDetailError] = useState<string>("");

    // Fetch pack list once.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/assistant/knowledge/packs");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as { packs?: PackSummary[] };
                if (!cancelled) {
                    setPackList(Array.isArray(data.packs) ? data.packs : []);
                    setPackListError("");
                    setPackListLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setPackListError(err instanceof Error ? err.message : String(err));
                    setPackListLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Fetch active pack detail when route changes.
    useEffect(() => {
        let cancelled = false;
        if (!route.pack) {
            setActiveDetail(null);
            setActiveDetailError("");
            return;
        }
        setActiveDetailLoading(true);
        setActiveDetailError("");
        (async () => {
            try {
                const res = await fetch(`/api/assistant/knowledge/packs/${encodeURIComponent(route.pack!)}`);
                if (!res.ok) {
                    const body = await res.json().catch(() => ({})) as { error?: string };
                    throw new Error(body.error || `HTTP ${res.status}`);
                }
                const data = (await res.json()) as PackDetail;
                if (!cancelled) {
                    setActiveDetail(data);
                    setActiveDetailLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setActiveDetailError(err instanceof Error ? err.message : String(err));
                    setActiveDetailLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [route.pack]);

    // Fetch sub-vertical detail when route + subVertical present.
    useEffect(() => {
        let cancelled = false;
        if (!route.pack || !route.subVertical) {
            setSubDetail(null);
            setSubDetailError("");
            return;
        }
        setSubDetailLoading(true);
        setSubDetailError("");
        (async () => {
            try {
                const url = `/api/assistant/knowledge/packs/${encodeURIComponent(route.pack!)}/sub-verticals/${encodeURIComponent(route.subVertical!)}`;
                const res = await fetch(url);
                if (!res.ok) {
                    const body = await res.json().catch(() => ({})) as { error?: string };
                    throw new Error(body.error || `HTTP ${res.status}`);
                }
                const data = (await res.json()) as SubVerticalDetail;
                if (!cancelled) {
                    setSubDetail(data);
                    setSubDetailLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setSubDetailError(err instanceof Error ? err.message : String(err));
                    setSubDetailLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [route.pack, route.subVertical]);

    // Esc returns to /settings (back-to-app from the Knowledge page).
    // Audit 2026-05-19 P2-15: was an imperative `history.pushState` +
    // custom-event dispatch reimplementing what `navigateToSettings()` does
    // for free. Using the helper means if the routing module changes its
    // event name or URL shape, Esc here stays in sync automatically.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                navigateToSettings();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    return (
        <div
            className="pp-knowledge"
            style={{
                position: "fixed",
                inset: 0,
                background: "var(--pp-bg, #fff)",
                color: "var(--pp-fg, #111)",
                display: "flex",
                flexDirection: "column",
                zIndex: 1000,
            }}
        >
            <KnowledgeHeader activePack={route.pack} />
            <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
                <KnowledgeLeftRail
                    packs={packList}
                    loading={packListLoading}
                    error={packListError}
                    activePack={route.pack}
                />
                <main
                    style={{
                        flex: "1 1 auto",
                        overflowY: "auto",
                        padding: "20px 28px 40px",
                        background: "var(--pp-bg, #fafafa)",
                    }}
                >
                    {!route.pack && <KnowledgeIndex packs={packList} />}
                    {route.pack && activeDetailLoading && <div>Loading pack…</div>}
                    {route.pack && activeDetailError && (
                        <div role="alert" style={{ color: "#a01828" }}>
                            {activeDetailError}
                        </div>
                    )}
                    {route.pack && activeDetail && (
                        <PackPage
                            detail={activeDetail}
                            section={route.section}
                            subVertical={route.subVertical}
                            subDetail={subDetail}
                            subDetailLoading={subDetailLoading}
                            subDetailError={subDetailError}
                            activeAiProfile={settings.activeAiProfile}
                            activePackSelection={settings.packSelection}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}

// ─── Header ─────────────────────────────────────────────────────────────

function KnowledgeHeader(props: { activePack?: string | null }): React.ReactElement {
    return (
        <header
            style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 20px",
                borderBottom: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
            }}
        >
            <div>
                <h1 style={{ margin: 0, fontSize: 18, lineHeight: 1.1 }}>Knowledge Base</h1>
                <p style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.6 }}>
                    Browse installed packs — glossary, ontology, KPIs, sample questions, prompt context.
                </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button
                    type="button"
                    onClick={() => {
                        if (typeof window === "undefined") return;
                        // Settings IA fix #4 — when the user is browsing a
                        // specific pack, deep-link to the AI Knowledge-pack
                        // leaf so they land where the pack picker lives.
                        // Otherwise fall back to bare /settings (last group).
                        const target = props.activePack
                            ? "/settings/ai/knowledge-pack"
                            : "/settings";
                        window.history.pushState({}, "", target);
                        window.dispatchEvent(new CustomEvent("pulseplay:settings-navigate"));
                    }}
                    style={btnStyle}
                    title={
                        props.activePack
                            ? `Open Settings → AI → Knowledge pack (currently: ${props.activePack})`
                            : "Open Settings (also: Cmd/Ctrl+, anywhere in the app)"
                    }
                    aria-label={
                        props.activePack
                            ? `Open Settings for pack ${props.activePack}`
                            : "Open Settings"
                    }
                >
                    {/* 2026-05-19 post-UAT-1840: replaced U+2699 emoji
                      *  with the same SVG cog used in SettingsShell so
                      *  the rendered glyph is consistent across pages
                      *  and free of OS-level emoji variance. */}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {props.activePack && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                        )}
                        <span>{props.activePack ? `${props.activePack} settings` : "Settings"}</span>
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (typeof window === "undefined") return;
                        window.history.pushState({}, "", "/");
                        window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                    style={{ ...btnStyle, display: "inline-flex", alignItems: "center", gap: 6 }}
                    title="Back to playground (Esc)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to app
                </button>
            </div>
        </header>
    );
}

const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    fontSize: 13,
    border: "1px solid var(--pp-border, rgba(0,0,0,0.18))",
    background: "transparent",
    borderRadius: 4,
    cursor: "pointer",
};

// ─── Left rail (pack picker) ────────────────────────────────────────────

function KnowledgeLeftRail(props: {
    packs: PackSummary[];
    loading: boolean;
    error: string;
    activePack: string | null;
}): React.ReactElement {
    return (
        <nav
            aria-label="Knowledge packs"
            style={{
                flex: "0 0 240px",
                padding: "12px 8px",
                borderRight: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
                background: "var(--pp-bg, #fff)",
                overflowY: "auto",
            }}
        >
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.5, padding: "6px 12px" }}>
                Installed packs
            </div>
            {props.loading && <div style={{ fontSize: 11, opacity: 0.5, padding: "8px 12px" }}>Loading…</div>}
            {props.error && (
                <div style={{ fontSize: 11, color: "#a01828", padding: "8px 12px" }}>
                    {props.error}
                </div>
            )}
            {!props.loading && props.packs.length === 0 && !props.error && (
                <div style={{ fontSize: 11, opacity: 0.5, padding: "8px 12px" }}>
                    No packs installed for this deployment. Contact your administrator.
                </div>
            )}
            {props.packs.map(p => {
                const active = p.name === props.activePack;
                return (
                    <button
                        key={p.name}
                        type="button"
                        onClick={() => navigateToKnowledge(p.name)}
                        aria-current={active ? "page" : undefined}
                        style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            margin: "2px 0",
                            border: 0,
                            borderRadius: 6,
                            background: active ? "var(--pp-accent, #0078d4)" : "transparent",
                            color: active ? "white" : "inherit",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: active ? 600 : 500,
                        }}
                    >
                        <div>{p.displayName || p.name}</div>
                        <div style={{ fontSize: 10, opacity: active ? 0.9 : 0.55, marginTop: 2, fontWeight: 400 }}>
                            {p.subVerticals?.length ? `${p.subVerticals.length} sub-vertical${p.subVerticals.length === 1 ? "" : "s"}` : "no sub-verticals"}
                        </div>
                    </button>
                );
            })}
        </nav>
    );
}

// ─── Empty index ────────────────────────────────────────────────────────

function KnowledgeIndex(props: { packs: PackSummary[] }): React.ReactElement {
    if (props.packs.length === 0) {
        return (
            <div style={{ fontSize: 13, opacity: 0.6 }}>
                Pick a pack from the left rail to browse its glossary, KPIs, and sample questions.
            </div>
        );
    }
    return (
        <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Pick a pack to browse</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.7 }}>
                The Knowledge Base shows the curated content each installed pack contributes — the AI uses
                this content for grounding when the pack is selected in Settings.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {props.packs.map(p => (
                    <li key={p.name}>
                        <button
                            type="button"
                            onClick={() => navigateToKnowledge(p.name)}
                            style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "12px 14px",
                                border: "1px solid var(--pp-border, rgba(0,0,0,0.12))",
                                background: "white",
                                borderRadius: 6,
                                cursor: "pointer",
                            }}
                        >
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{p.displayName || p.name}</div>
                            {p.description && (
                                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{p.description}</div>
                            )}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ─── Pack page (with section tabs) ──────────────────────────────────────

function PackPage(props: {
    detail: PackDetail;
    section: KnowledgeSection;
    subVertical: string | null;
    subDetail: SubVerticalDetail | null;
    subDetailLoading: boolean;
    subDetailError: string;
    activeAiProfile: string;
    activePackSelection: { pack: string; subVertical?: string } | null;
}): React.ReactElement {
    const { detail, section, subVertical, subDetail, subDetailLoading, subDetailError } = props;
    return (
        <div>
            <header style={{ marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>{detail.displayName || detail.name}</h2>
                {detail.description && (
                    <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.75 }}>{detail.description}</p>
                )}
            </header>

            <SectionTabs
                pack={detail.name}
                activeSection={section}
                installedSubVerticals={detail.installedSubVerticals || []}
            />

            <div style={{ marginTop: 18 }}>
                {section === "overview" && <OverviewSection detail={detail} />}
                {section === "glossary" && (
                    <MarkdownPane title="Glossary" body={detail.knowledgeBase?.glossary} />
                )}
                {section === "ontology" && (
                    <MarkdownPane title="Ontology" body={detail.knowledgeBase?.ontology} />
                )}
                {section === "references" && (
                    <MarkdownPane title="References" body={detail.knowledgeBase?.references} />
                )}
                {section === "sub-verticals" && (
                    <SubVerticalsSection
                        pack={detail.name}
                        subVerticals={detail.subVerticals || []}
                        installed={detail.installedSubVerticals || []}
                        activeSubVertical={subVertical}
                        detail={subDetail}
                        loading={subDetailLoading}
                        error={subDetailError}
                    />
                )}
                {section === "runtime" && (
                    <RuntimeSection
                        detail={detail}
                        activeAiProfile={props.activeAiProfile}
                        activePackSelection={props.activePackSelection}
                    />
                )}
                {section === "demos" && (
                    <DemosSection pack={detail.name} demos={detail.demoConfigs || []} />
                )}
            </div>
        </div>
    );
}

function SectionTabs(props: {
    pack: string;
    activeSection: KnowledgeSection;
    installedSubVerticals: string[];
}): React.ReactElement {
    return (
        <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--pp-border, rgba(0,0,0,0.08))", paddingBottom: 0 }}>
            {KNOWLEDGE_SECTIONS.map(s => {
                const active = s === props.activeSection;
                const disabled = s === "sub-verticals" && props.installedSubVerticals.length === 0;
                return (
                    <button
                        key={s}
                        role="tab"
                        type="button"
                        aria-selected={active}
                        disabled={disabled}
                        onClick={() => navigateToKnowledge(props.pack, s)}
                        title={SECTION_HINTS[s]}
                        style={{
                            padding: "8px 14px",
                            border: 0,
                            background: "transparent",
                            color: active ? "var(--pp-accent, #0078d4)" : disabled ? "rgba(0,0,0,0.3)" : "inherit",
                            borderBottom: active ? "2px solid var(--pp-accent, #0078d4)" : "2px solid transparent",
                            cursor: disabled ? "not-allowed" : "pointer",
                            fontSize: 13,
                            fontWeight: active ? 600 : 500,
                        }}
                    >
                        {SECTION_LABELS[s]}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Section components ─────────────────────────────────────────────────

function OverviewSection(props: { detail: PackDetail }): React.ReactElement {
    const d = props.detail;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FieldRow label="Pack name" value={d.name} />
            <FieldRow label="Version" value={d.version || "(unset)"} />
            <FieldRow label="Industries" value={(d.industries || []).join(", ") || "(none)"} />
            <FieldRow label="AI compatibility" value={(d.aiCompatibility || []).join(", ") || "(any)"} />
            <FieldRow label="BI compatibility" value={(d.biCompatibility || []).join(", ") || "(any)"} />
            <FieldRow label="Cross-cutting overlays" value={(d.crossCutting || []).join(", ") || "(none)"} />
            {d.readme && <MarkdownPane title="Pack README" body={d.readme} />}
            {d.migrationNotes && <MarkdownPane title="Migration notes" body={d.migrationNotes} />}
        </div>
    );
}

function SubVerticalsSection(props: {
    pack: string;
    subVerticals: Array<{ name: string; displayName?: string; description?: string }>;
    installed: string[];
    activeSubVertical: string | null;
    detail: SubVerticalDetail | null;
    loading: boolean;
    error: string;
}): React.ReactElement {
    return (
        <div style={{ display: "flex", gap: 18 }}>
            <aside style={{ flex: "0 0 200px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", opacity: 0.5, padding: "6px 0" }}>
                    Sub-verticals
                </div>
                {props.subVerticals.map(sv => {
                    const active = sv.name === props.activeSubVertical;
                    const installed = props.installed.includes(sv.name);
                    return (
                        <button
                            key={sv.name}
                            type="button"
                            disabled={!installed}
                            onClick={() => navigateToKnowledge(props.pack, "sub-verticals", sv.name)}
                            style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                padding: "6px 10px",
                                margin: "2px 0",
                                fontSize: 12,
                                border: 0,
                                borderRadius: 4,
                                background: active ? "var(--pp-accent, #0078d4)" : "transparent",
                                color: active ? "white" : installed ? "inherit" : "rgba(0,0,0,0.4)",
                                cursor: installed ? "pointer" : "not-allowed",
                                fontWeight: active ? 600 : 500,
                            }}
                            title={installed ? sv.description || "" : "Not installed in this pack"}
                        >
                            {sv.displayName || sv.name}
                            {!installed && <span style={{ marginLeft: 6, fontSize: 9 }}>(missing)</span>}
                        </button>
                    );
                })}
            </aside>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                {!props.activeSubVertical && (
                    <div style={{ fontSize: 13, opacity: 0.6 }}>
                        Pick a sub-vertical from the left list to view its KPIs, sample questions,
                        prompt context, and BI/AI fit.
                    </div>
                )}
                {props.activeSubVertical && props.loading && <div>Loading sub-vertical…</div>}
                {props.activeSubVertical && props.error && (
                    <div role="alert" style={{ color: "#a01828" }}>{props.error}</div>
                )}
                {props.activeSubVertical && props.detail && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {props.detail.readme && <MarkdownPane title="Sub-vertical README" body={props.detail.readme} />}
                        {props.detail.kpis && <MarkdownPane title="KPIs" body={props.detail.kpis} />}
                        {props.detail.sampleQuestions && <MarkdownPane title="Sample questions" body={props.detail.sampleQuestions} />}
                        {props.detail.promptContext && <MarkdownPane title="Prompt context (injected at runtime)" body={props.detail.promptContext} />}
                        {props.detail.biAiFit && <MarkdownPane title="BI / AI fit" body={props.detail.biAiFit} />}
                    </div>
                )}
            </div>
        </div>
    );
}

function RuntimeSection(props: {
    detail: PackDetail;
    activeAiProfile: string;
    activePackSelection: { pack: string; subVertical?: string } | null;
}): React.ReactElement {
    const isActivePack = props.activePackSelection?.pack === props.detail.name;
    const activeSv = isActivePack ? props.activePackSelection?.subVertical : undefined;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75, lineHeight: 1.5 }}>
                This tab shows what THIS pack's content contributes to AI prompts in the current PulsePlay
                runtime. The actual injection happens server-side in <code>packPromptInjector.js</code> when
                the AI sidebar issues a query against the active connector profile.
            </p>
            <FieldRow label="Active AI provider" value={props.activeAiProfile || "(not selected)"} />
            <FieldRow label="Active pack selection" value={isActivePack ? `${props.detail.name}${activeSv ? " / " + activeSv : ""}` : "(this pack is NOT the active selection)"} />
            <h3 style={{ margin: "10px 0 4px", fontSize: 14 }}>Currently injected via this pack</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
                <li><strong>Prompt context (per sub-vertical):</strong> the <code>prompt-context.md</code> for the active sub-vertical is prepended verbatim to the LLM call.</li>
                <li><strong>Glossary fallback:</strong> if no <code>prompt-context.md</code> exists for the active sub-vertical, the pack-level <code>glossary.md</code> is used (truncated to 2 000 chars).</li>
            </ul>
            <h3 style={{ margin: "10px 0 4px", fontSize: 14 }}>NOT injected today (future Phase 3)</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
                <li>Ontology — referenced for SME context but not retrieved by the runtime.</li>
                <li>References — not surfaced to the AI; available here for human review.</li>
                <li>KPIs — surfaced for author validation only. Phase 3 will make them tool-callable.</li>
                <li>Sample questions — available in the UI as starter chips; not retrieved as grounding.</li>
                <li>Retrieval preview (governed RAG) — lands when <code>IndexProviderAdapter</code> ships.</li>
            </ul>
        </div>
    );
}

function DemosSection(props: { pack: string; demos: string[] }): React.ReactElement {
    if (props.demos.length === 0) {
        return (
            <div style={{ fontSize: 13, opacity: 0.6 }}>
                No demo configs bundled with this pack.
            </div>
        );
    }
    return (
        <div>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>
                Demo scenarios bundled with this pack. Loadable via a future "Try demo" action; today they
                live as files under <code>pulsepacks/{props.pack}/demo-configs/</code>.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, fontFamily: "var(--pp-mono, monospace)" }}>
                {props.demos.map(name => <li key={name}>{name}</li>)}
            </ul>
        </div>
    );
}

// ─── Shared primitives ──────────────────────────────────────────────────

function FieldRow(props: { label: string; value: string }): React.ReactElement {
    return (
        <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span style={{ opacity: 0.6, minWidth: 160 }}>{props.label}</span>
            <span style={{ fontFamily: "var(--pp-mono, monospace)" }}>{props.value}</span>
        </div>
    );
}

function MarkdownPane(props: { title: string; body: string | null | undefined }): React.ReactElement {
    const lines = useMemo(() => (props.body || "").split("\n"), [props.body]);
    return (
        <article
            style={{
                border: "1px solid var(--pp-border, rgba(0,0,0,0.08))",
                borderRadius: 6,
                padding: "14px 16px",
                background: "white",
            }}
        >
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{props.title}</h3>
            {!props.body && (
                <div style={{ fontSize: 12, opacity: 0.5 }}>
                    (no content for this section in this pack)
                </div>
            )}
            {props.body && (
                <pre
                    style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        fontFamily: "var(--pp-mono, monospace)",
                        fontSize: 11,
                        lineHeight: 1.5,
                        maxHeight: 480,
                        overflowY: "auto",
                        background: "rgba(0,0,0,0.02)",
                        padding: 8,
                        borderRadius: 4,
                    }}
                >
                    {lines.join("\n")}
                </pre>
            )}
        </article>
    );
}
