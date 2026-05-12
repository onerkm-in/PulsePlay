/**
 * setupStep5Guided.tsx
 *
 * Step 5 Guided wizard — 6 short pages that walk an author through Advanced
 * configuration with smart defaults, live previews, and conditional reveals.
 * Each page maps to a slice of SetupDraft; everything writes through the
 * same setField/setBool/setNum helpers as the Advanced form so behaviour
 * parity is automatic.
 *
 * Pages:
 *   1 · Enabled features      (Section 0)
 *   2 · Domain                (Section A — genieFields, domainGuidance, sendContextToGenie)
 *   3 · AI Insights           (Section A — insightsPrompt, cache TTL, refresh)
 *                            + Section B — KB master + sub-rules
 *   4 · Security posture      (Section C)
 *   5 · Multi-space           (Section D, conditional reveal)
 *   6 · Trusted SQL examples  (placeholder, wired in 48.15 with Genie space sync)
 *   Review                    — diff vs defaults + Edit-in-form jump links
 *
 * Pages 1-3 land in 48.9; Pages 4-5 in 48.10; Review + smart defaults in 48.11.
 */

import * as React from "react";
import { ReactNode } from "react";
import { SetupDraft } from "./setupDraft";
// Circular import — setupStep5.tsx also imports SetupStep5Guided from
// THIS file, so a top-level read of STEP5_FIELDS would race the partial-
// module init and capture undefined. ESM's live binding makes this safe
// AS LONG AS we only read STEP5_FIELDS inside a function body (i.e. at
// render time, after both modules are fully loaded). The ReviewSummary
// component below honours that contract.
import { STEP5_FIELDS, type FieldMeta } from "./setupStep5";

// ────────────────────────────────────────────────────────────────────────
// Page navigation primitives
// ────────────────────────────────────────────────────────────────────────

export type GuidedPageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const GUIDED_PAGE_TITLES: Record<GuidedPageId, string> = {
    1: "Enabled features",
    2: "Domain knowledge",
    3: "AI Insights",
    4: "Security posture",
    5: "Multi-space",
    6: "Trusted SQL examples",
    7: "Review",
};

const GUIDED_PAGE_LS_KEY = "dwd-setup-step5-guided-page";

function readPersistedPage(): GuidedPageId {
    try {
        const v = parseInt(window.localStorage?.getItem(GUIDED_PAGE_LS_KEY) || "1", 10);
        return (v >= 1 && v <= 7 ? v : 1) as GuidedPageId;
    } catch {
        return 1;
    }
}

function writePersistedPage(p: GuidedPageId): void {
    try {
        window.localStorage?.setItem(GUIDED_PAGE_LS_KEY, String(p));
    } catch { /* ignore */ }
}

// ────────────────────────────────────────────────────────────────────────
// Smart-default inference helpers
// ────────────────────────────────────────────────────────────────────────

/** Infer a domainGuidance template from the connection mode + bound state.
 *  Authors rarely start from a blank page well — a templated stub gives
 *  them something to edit instead. */
export function inferDomainGuidanceStub(draft: SetupDraft): string {
    const mode = draft.connectionMode;
    if (mode === "azure-openai") {
        return "## Business rules\n- Replace this with your KPIs and definitions.\n\n## Tone\n- Concise, business-focused, lead with the bottom line.\n";
    }
    if (mode === "bedrock") {
        return "## Knowledge-base focus\n- This deployment retrieves from an indexed knowledge base.\n- Authors should declare the topical scope here so retrieval stays relevant.\n";
    }
    return "## Business rules\n- Revenue = Net Sales after returns\n- Use FISCAL_YEAR not CALENDAR_YEAR\n\n## Formatting Standards\n| Range | Format | Example |\n|---|---|---|\n| < 1 000 | #,###.## | 567.89 |\n| ≥ 1 000 | #,### | 12 345 |\n";
}

/** Suggest enabledFeatures based on current settings.
 *  - kbEnabled=false AND no insightsPrompt AND connectionMode=auto → suggest chatOnly.
 *  - everything else → keep current. */
export function suggestEnabledFeatures(draft: SetupDraft): SetupDraft["enabledFeatures"] {
    if (!draft.kbEnabled && !(draft.insightsPrompt || "").trim() && draft.connectionMode === "auto") {
        return "chatOnly";
    }
    return draft.enabledFeatures;
}

// ────────────────────────────────────────────────────────────────────────
// Page shell
// ────────────────────────────────────────────────────────────────────────

export interface GuidedPageProps {
    id: GuidedPageId;
    total: number;
    title: string;
    /** IDEA-039 TXT-A5 — short ≤7-word summary shown inline next to the
     *  page badge (compact density). When omitted, falls back to no summary. */
    summary?: string;
    /** IDEA-039 TXT-A5 — longer 2-3 sentence tooltip shown on hover via the
     *  browser `title=""` attribute on the page header. Pairs with `summary`. */
    tooltip?: string;
    question: ReactNode;
    children: ReactNode;
    onBack?: () => void;
    onSkip?: () => void;
    onNext?: () => void;
    onSwitchToAdvanced: () => void;
    nextLabel?: string;
    canNext?: boolean;
}

function GuidedPage(props: GuidedPageProps) {
    return (
        <div
            className="gn-setup-guided-page"
            role="region"
            aria-labelledby={`gn-setup-guided-page-${props.id}-title`}
        >
            <div className="gn-setup-guided-progress" role="progressbar" aria-valuemin={1} aria-valuemax={props.total} aria-valuenow={props.id} aria-label={`Page ${props.id} of ${props.total}`}>
                {Array.from({ length: props.total }, (_, i) => (
                    <span
                        key={i}
                        className={`gn-setup-guided-dot${i + 1 === props.id ? " gn-setup-guided-dot--active" : ""}${i + 1 < props.id ? " gn-setup-guided-dot--done" : ""}`}
                        aria-hidden="true"
                    />
                ))}
                <span className="gn-setup-guided-progress-label">Page {props.id} of {props.total}</span>
            </div>

            <header className="gn-setup-guided-header" title={props.tooltip}>
                <h5 id={`gn-setup-guided-page-${props.id}-title`}>
                    <span className="gn-setup-guided-page-num">{props.id}</span>
                    {props.title}
                    {props.summary && (
                        <span className="gn-setup-guided-page-summary">{props.summary}</span>
                    )}
                    {/* IDEA-039 UX clarity pass — escape hatch demoted from a
                     * prominent footer button to a small text link in the
                     * header. Available for power users who want to jump
                     * straight to the field-by-field editor, but no longer
                     * competes visually with Back / Skip / Next on every page. */}
                    <button
                        type="button"
                        className="gn-setup-guided-switch-link"
                        onClick={props.onSwitchToAdvanced}
                        title="Switch to the Advanced Editor for field-by-field editing — your in-progress edits transfer over"
                    >
                        Switch to Advanced Editor →
                    </button>
                </h5>
                <p className="gn-setup-guided-question">{props.question}</p>
            </header>

            <div className="gn-setup-guided-body">
                {props.children}
            </div>

            <footer className="gn-setup-guided-footer">
                {/* Footer is now navigation-only — Back / Skip / Next.
                 * Apply Changes lives in the persistent action row BELOW
                 * the wizard (rendered by SetupEditFlow), so the wizard
                 * doesn't need its own Apply button. Single source of
                 * truth = the bottom action row. */}
                <div className="gn-setup-guided-footer-spacer" />
                {props.onBack && (
                    <button type="button" className="gn-btn" onClick={props.onBack}>← Back</button>
                )}
                {props.onSkip && (
                    <button type="button" className="gn-btn" onClick={props.onSkip}>Skip</button>
                )}
                {props.onNext && (
                    <button
                        type="button"
                        className="gn-btn gn-btn--primary"
                        onClick={props.onNext}
                        disabled={props.canNext === false}
                    >
                        {props.nextLabel ?? "Next →"}
                    </button>
                )}
            </footer>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────
// Main wizard component
// ────────────────────────────────────────────────────────────────────────

export interface SetupStep5GuidedProps {
    draft: SetupDraft;
    setField: (name: keyof SetupDraft, value: string) => void;
    setBool: (name: keyof SetupDraft, value: boolean) => void;
    setNum: (name: keyof SetupDraft, value: number) => void;
    /** Called when the user clicks "Open Advanced form" or finishes the
     *  Review page — switches the parent's mode toggle. */
    onSwitchToAdvanced: () => void;
    /** Called from Review's per-section "✎ Edit" links — switches mode AND
     *  sets the open section on the Advanced form (parent state). */
    onJumpToSection?: (section: "0" | "A" | "B" | "C" | "D" | "E" | "F") => void;
}

export function SetupStep5Guided(props: SetupStep5GuidedProps) {
    const { draft, setField, setBool, setNum, onSwitchToAdvanced, onJumpToSection } = props;
    const [page, setPage] = React.useState<GuidedPageId>(() => readPersistedPage());

    // Skip Page 5 (multi-space) and Page 6 (trusted SQL) automatically when
    // not relevant — Multi-space when the user picked "single", Trusted SQL
    // when connection mode is not backed by the Databricks Genie space flow.
    const skipPage5 = !draft.multiSpaceEnabled;
    const skipPage6 = draft.connectionMode === "azure-openai" || draft.connectionMode === "bedrock" || draft.connectionMode === "foundation-model";

    const total: number = 7;

    const goPage = (next: GuidedPageId) => {
        setPage(next);
        writePersistedPage(next);
    };
    const goNext = () => {
        let next: GuidedPageId = (page + 1) as GuidedPageId;
        if (next === 5 && skipPage5) next = 6;
        if (next === 6 && skipPage6) next = 7;
        if (next > 7) next = 7 as GuidedPageId;
        goPage(next);
    };
    const goBack = () => {
        let prev: GuidedPageId = (page - 1) as GuidedPageId;
        if (prev === 6 && skipPage6) prev = 5;
        if (prev === 5 && skipPage5) prev = 4;
        if (prev < 1) prev = 1 as GuidedPageId;
        goPage(prev);
    };

    // ── Page 1: Enabled features ────────────────────────────────────────
    if (page === 1) {
        return (
            <GuidedPage
                id={1}
                total={total}
                title="Enabled features"
                summary="Choose active assistant surfaces"
                tooltip="Selects which surfaces appear in the report: insights, chat, or both. Fill when the report needs a narrower experience; keep both when unsure."
                question={<>What experience do you want this report to offer? You can change this later.</>}
                onBack={undefined}
                onSkip={() => goNext()}
                onNext={goNext}
                onSwitchToAdvanced={onSwitchToAdvanced}
            >
                <div className="gn-setup-guided-radio-grid">
                    {([
                        { value: "both", title: "Both — AI Insights + Chat", desc: "Default. Tab strip visible; viewers switch between auto analytics and conversational Q&A." },
                        { value: "insightsOnly", title: "AI Insights only", desc: "Auto-generated descriptive analytics on load. No chat tab. Best for executive dashboards." },
                        { value: "chatOnly", title: "Chat only", desc: "Conversational Q&A only. No auto-insights — no Genie calls are made on visual load." },
                    ] as const).map(opt => (
                        <label
                            key={opt.value}
                            className={`gn-setup-guided-radio${draft.enabledFeatures === opt.value ? " gn-setup-guided-radio--active" : ""}`}
                        >
                            <input
                                type="radio"
                                name="guided-enabledFeatures"
                                value={opt.value}
                                checked={draft.enabledFeatures === opt.value}
                                onChange={() => setField("enabledFeatures", opt.value)}
                            />
                            <span className="gn-setup-guided-radio-title">{opt.title}</span>
                            <span className="gn-setup-guided-radio-desc">{opt.desc}</span>
                        </label>
                    ))}
                </div>
                <aside className="gn-setup-guided-preview-card">
                    <strong>Preview:</strong>
                    <div>
                        Visual will show <strong>{
                            draft.enabledFeatures === "both" ? "AI Insights + Chat (tab strip visible)"
                            : draft.enabledFeatures === "insightsOnly" ? "AI Insights only"
                            : "Chat only"
                        }</strong>.
                    </div>
                    {draft.enabledFeatures === "chatOnly" && (
                        <div className="gn-setup-guided-preview-note">
                            ℹ Chat-only mode skips the AI Insights pipeline entirely — no Genie calls are made on visual load.
                        </div>
                    )}
                </aside>
            </GuidedPage>
        );
    }

    // ── Page 2: Domain knowledge ────────────────────────────────────────
    if (page === 2) {
        const fillStub = () => {
            if (!(draft.domainGuidance || "").trim()) {
                setField("domainGuidance", inferDomainGuidanceStub(draft));
            }
        };
        return (
            <GuidedPage
                id={2}
                total={total}
                title="Domain knowledge"
                summary="Shape domain and prompt guidance"
                tooltip="Sets the domain label and free-text business guidance that the AI applies to every Genie answer. Highest-leverage setting in Step 5 — fill thoughtfully."
                question={<>What does this report cover, and what should the AI keep in mind? This is the highest-leverage setting in Step 5.</>}
                onBack={goBack}
                onSkip={goNext}
                onNext={goNext}
                onSwitchToAdvanced={onSwitchToAdvanced}
            >
                <div className="gn-setup-guided-field">
                    <label>Domain-specific instructions <span className="gn-setup-field-optional">(optional but recommended)</span></label>
                    <textarea
                        rows={8}
                        value={draft.domainGuidance}
                        onChange={e => setField("domainGuidance", e.target.value)}
                        placeholder={inferDomainGuidanceStub(draft)}
                    />
                    <span className="gn-setup-field-hint">
                        Business rules, KPI definitions, and query hints sent to Genie on the first turn of each session.
                        Cap ~8 000 characters.
                    </span>
                    {!(draft.domainGuidance || "").trim() && (
                        <button type="button" className="gn-btn gn-btn--compact" onClick={fillStub} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                            ✎ Pre-fill with a starter template
                        </button>
                    )}
                </div>
                <div className="gn-setup-guided-field">
                    <label>Field-name validation <span className="gn-setup-field-optional">(optional)</span></label>
                    <textarea
                        rows={3}
                        value={draft.genieFields}
                        onChange={e => setField("genieFields", e.target.value)}
                        placeholder="Country, Region, Sales, Profit, Quantity"
                    />
                    <span className="gn-setup-field-hint">
                        Comma- or line-separated field names. The visual checks Power BI bindings against this list and shows
                        an amber badge if they diverge. Leave blank to skip validation.
                    </span>
                </div>
                <div className="gn-setup-guided-field gn-setup-field--toggle">
                    <label>
                        <input
                            type="checkbox"
                            checked={draft.sendContextToGenie}
                            onChange={e => setBool("sendContextToGenie", e.target.checked)}
                        />
                        <span>Send Power BI report context to Genie</span>
                    </label>
                    <span className="gn-setup-field-hint">
                        ON: dimensions, measures, and active filter values are sent with every question. Turn OFF for stricter privacy.
                    </span>
                </div>
            </GuidedPage>
        );
    }

    // ── Page 3: AI Insights + KB ────────────────────────────────────────
    if (page === 3) {
        const insightsActive = draft.enabledFeatures !== "chatOnly";
        return (
            <GuidedPage
                id={3}
                total={total}
                title="AI Insights & analytics intelligence"
                summary="Tune insights and KB rules"
                tooltip="Controls the AI Insights authoring mode plus optional analytics-intelligence rules (charts, statistics, reporting). Fill when the auto-insights output needs a stronger or domain-specific shape."
                question={
                    insightsActive
                        ? <>How should AI Insights behave when a viewer opens the report? You can also tune the embedded analytics knowledge base.</>
                        : <>Chat-only mode is selected — AI Insights settings have no effect, but you can still tune the analytics knowledge base used in Chat answers.</>
                }
                onBack={goBack}
                onSkip={goNext}
                onNext={goNext}
                onSwitchToAdvanced={onSwitchToAdvanced}
            >
                {insightsActive && (
                    <>
                        <div className="gn-setup-guided-field">
                            <label>AI Insights prompt <span className="gn-setup-field-optional">(optional)</span></label>
                            <textarea
                                rows={4}
                                value={draft.insightsPrompt}
                                onChange={e => setField("insightsPrompt", e.target.value)}
                                placeholder="e.g. Summarise key KPIs, highlight trends, and flag any risks or anomalies."
                            />
                            <span className="gn-setup-field-hint">
                                Override the default descriptive briefing prompt. Leave blank to use the bundled default.
                            </span>
                        </div>
                        <div className="gn-setup-guided-field">
                            <label>Cache duration</label>
                            <div className="gn-setup-guided-chip-row">
                                {[5, 30, 120].map(m => (
                                    <button
                                        key={m}
                                        type="button"
                                        className={`gn-setup-guided-chip${draft.insightsCacheTtlMinutes === m ? " gn-setup-guided-chip--active" : ""}`}
                                        onClick={() => setNum("insightsCacheTtlMinutes", m)}
                                    >
                                        {m === 5 ? "5 min" : m === 30 ? "30 min (default)" : "2 hours"}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className={`gn-setup-guided-chip${draft.insightsCacheTtlMinutes === 0 ? " gn-setup-guided-chip--active" : ""}`}
                                    onClick={() => setNum("insightsCacheTtlMinutes", 0)}
                                >
                                    Off — always re-run
                                </button>
                            </div>
                            <span className="gn-setup-field-hint">
                                How long a generated AI Insights run is cached so PBI page-switches don't re-trigger the AI briefing.
                            </span>
                        </div>
                    </>
                )}

                <div className="gn-setup-guided-field gn-setup-field--toggle">
                    <label>
                        <input
                            type="checkbox"
                            checked={draft.kbEnabled}
                            onChange={e => setBool("kbEnabled", e.target.checked)}
                        />
                        <span>Inject analytics knowledge base into Genie prompts</span>
                    </label>
                    <span className="gn-setup-field-hint">
                        When ON, the visual injects chart-selection, statistical, and reporting standards into every Genie
                        prompt. Turn OFF if your domain instructions already cover these rules or if you want to minimise token cost.
                    </span>
                </div>

                <aside className="gn-setup-guided-preview-card">
                    <strong>Preview:</strong>
                    <div>
                        {insightsActive ? (
                            draft.insightsCacheTtlMinutes === 0
                                ? "AI Insights will re-run on every visual mount."
                                : `AI Insights will be cached for ${draft.insightsCacheTtlMinutes} minute${draft.insightsCacheTtlMinutes === 1 ? "" : "s"}.`
                        ) : "AI Insights are disabled (Chat-only mode)."}
                        {" "}
                        {draft.kbEnabled
                            ? "Analytics KB will be injected into Genie prompts."
                            : "No analytics KB injection — Genie sees only your domain instructions and report context."}
                    </div>
                </aside>
            </GuidedPage>
        );
    }

    // ── Page 4: Security posture ────────────────────────────────────────
    if (page === 4) {
        return (
            <GuidedPage
                id={4}
                total={total}
                title="Security posture"
                summary="Declare access assumptions"
                tooltip="Records auth mode and access declarations for prompt context. Informational only — Unity Catalog enforces actual row-filter and column-mask policies upstream."
                question={<>What access controls does your data have in Unity Catalog? <strong>Reminder: these are declarations, not enforcement</strong> — UC still does the actual gating.</>}
                onBack={goBack}
                onSkip={goNext}
                onNext={goNext}
                onSwitchToAdvanced={onSwitchToAdvanced}
            >
                <div className="gn-setup-guided-radio-grid">
                    {([
                        { value: "sharedPat", title: "Shared PAT", desc: "One Databricks identity serves all viewers. Fastest to set up. Suitable when all viewers should see the same data." },
                        { value: "oauthObo", title: "OAuth on-behalf-of", desc: "Per-viewer identity via token exchange. UC row filters and column masks apply per user. Requires proxy v2." },
                    ] as const).map(opt => (
                        <label
                            key={opt.value}
                            className={`gn-setup-guided-radio${draft.authMode === opt.value ? " gn-setup-guided-radio--active" : ""}`}
                        >
                            <input
                                type="radio"
                                name="guided-authMode"
                                value={opt.value}
                                checked={draft.authMode === opt.value}
                                onChange={() => setField("authMode", opt.value)}
                            />
                            <span className="gn-setup-guided-radio-title">{opt.title}</span>
                            <span className="gn-setup-guided-radio-desc">{opt.desc}</span>
                        </label>
                    ))}
                </div>

                <div className="gn-setup-guided-field gn-setup-field--toggle">
                    <label>
                        <input
                            type="checkbox"
                            checked={draft.ucRowFiltersEnforced}
                            onChange={e => setBool("ucRowFiltersEnforced", e.target.checked)}
                        />
                        <span>Unity Catalog row filters are active upstream</span>
                    </label>
                    <span className="gn-setup-field-hint">Declare that ROW FILTER functions are applied to the tables Genie reads.</span>
                </div>
                <div className="gn-setup-guided-field gn-setup-field--toggle">
                    <label>
                        <input
                            type="checkbox"
                            checked={draft.ucColumnMasksEnforced}
                            onChange={e => setBool("ucColumnMasksEnforced", e.target.checked)}
                        />
                        <span>Unity Catalog column masks are active upstream</span>
                    </label>
                    <span className="gn-setup-field-hint">Declare that column masks redact restricted columns for non-privileged users.</span>
                </div>

                <aside className="gn-setup-guided-preview-card">
                    <strong>Posture preview:</strong>
                    <div>{
                        (() => {
                            const obo = draft.authMode === "oauthObo";
                            const ucAny = draft.ucRowFiltersEnforced || draft.ucColumnMasksEnforced;
                            if (obo && ucAny) return "🔐 UC-enforced (per-user) — viewers will see the per-user UC posture badge.";
                            if (!obo && ucAny) return "🔒 UC-enforced (service) — service-account-wide UC enforcement.";
                            return "🛡 Scope-only — declared no UC governance is active.";
                        })()
                    }</div>
                </aside>
            </GuidedPage>
        );
    }

    // ── Page 5: Multi-space ─────────────────────────────────────────────
    if (page === 5) {
        const onPickSingle = () => {
            setBool("multiSpaceEnabled", false);
            goNext();
        };
        const onPickMulti = () => {
            setBool("multiSpaceEnabled", true);
            // Page 5 stays on screen; user fills slot count + cards below.
        };
        return (
            <GuidedPage
                id={5}
                total={total}
                title="Multi-space"
                summary="Add optional helper spaces"
                tooltip="Adds helper spaces with separate labels, profiles, and credentials. Fill when multiple specialist spaces should contribute; skip if single-space."
                question={<>Does this report draw on one Genie space or several?</>}
                onBack={goBack}
                onSkip={goNext}
                onNext={goNext}
                onSwitchToAdvanced={onSwitchToAdvanced}
            >
                <div className="gn-setup-guided-radio-grid">
                    <label
                        className={`gn-setup-guided-radio${!draft.multiSpaceEnabled ? " gn-setup-guided-radio--active" : ""}`}
                        onClick={onPickSingle}
                    >
                        <input
                            type="radio"
                            name="guided-multiSpaceEnabled"
                            checked={!draft.multiSpaceEnabled}
                            onChange={() => {}}
                        />
                        <span className="gn-setup-guided-radio-title">Single space</span>
                        <span className="gn-setup-guided-radio-desc">Use only the primary connection from Steps 1-3. Skip multi-space configuration.</span>
                    </label>
                    <label
                        className={`gn-setup-guided-radio${draft.multiSpaceEnabled ? " gn-setup-guided-radio--active" : ""}`}
                        onClick={onPickMulti}
                    >
                        <input
                            type="radio"
                            name="guided-multiSpaceEnabled"
                            checked={draft.multiSpaceEnabled}
                            onChange={() => {}}
                        />
                        <span className="gn-setup-guided-radio-title">Multiple spaces</span>
                        <span className="gn-setup-guided-radio-desc">Connect to up to 9 additional Genie spaces. A space-selector tab strip appears in the visual header.</span>
                    </label>
                </div>

                {draft.multiSpaceEnabled && (
                    <>
                        <div className="gn-setup-guided-field">
                            <label>Number of additional spaces</label>
                            <select
                                value={String(draft.multiSpaceCount)}
                                onChange={e => setNum("multiSpaceCount", parseInt(e.target.value, 10))}
                            >
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <option key={n} value={n}>{n} additional ({n + 1} total)</option>
                                ))}
                            </select>
                            <span className="gn-setup-field-hint">
                                For each slot below, set a label and either a proxy profile or a Genie Space ID. Use the
                                Advanced form to fill in host / token / inheritance overrides.
                            </span>
                        </div>
                        <div className="gn-setup-guided-slots">
                            {Array.from({ length: Math.min(Math.max(draft.multiSpaceCount, 1), 9) }, (_, i) => i + 2).map(n => (
                                <fieldset key={n} className="gn-setup-guided-slot">
                                    <legend>Space {n}</legend>
                                    <div className="gn-setup-guided-field">
                                        <label>Label</label>
                                        <input
                                            type="text"
                                            value={String(draft[`space${n}Label` as keyof SetupDraft] ?? "")}
                                            onChange={e => setField(`space${n}Label` as keyof SetupDraft, e.target.value)}
                                            placeholder={n === 2 ? "e.g. Customer" : n === 3 ? "e.g. HSE" : `e.g. Space ${n}`}
                                        />
                                    </div>
                                    <div className="gn-setup-guided-field">
                                        <label>Proxy profile or Genie Space ID</label>
                                        <input
                                            type="text"
                                            value={String(draft[`space${n}AssistantProfile` as keyof SetupDraft] ?? "") || String(draft[`space${n}SpaceId` as keyof SetupDraft] ?? "")}
                                            onChange={e => {
                                                const v = e.target.value;
                                                if (v.startsWith("01f")) {
                                                    setField(`space${n}SpaceId` as keyof SetupDraft, v);
                                                } else {
                                                    setField(`space${n}AssistantProfile` as keyof SetupDraft, v);
                                                }
                                            }}
                                            placeholder="profile name (Proxy mode) or 01f1… (Direct mode)"
                                        />
                                    </div>
                                </fieldset>
                            ))}
                        </div>
                    </>
                )}
            </GuidedPage>
        );
    }

    // ── Page 6: Trusted SQL examples (placeholder, wired in 48.15) ──────
    if (page === 6) {
        return (
            <GuidedPage
                id={6}
                total={total}
                title="Trusted SQL examples (optional)"
                summary="Add few-shot SQL exemplars"
                tooltip="Pushes vetted SQL examples into the upstream Genie space as few-shot exemplars. Strongest hallucination-reducer available; skip when the space already has trusted SQL configured."
                question={<>Do you have known-good SQL queries for common questions? Sharing them with Genie reduces hallucination significantly.</>}
                onBack={goBack}
                onSkip={goNext}
                onNext={goNext}
                onSwitchToAdvanced={onSwitchToAdvanced}
            >
                <div className="gn-setup-guided-placeholder-card">
                    <p>
                        This page lands in commit <strong>48.15</strong> — it'll let you pull existing trusted-query
                        examples from the upstream Genie space, edit them locally, and (optionally) push changes back.
                        For now you can skip this page or use the Advanced form's <strong>Section G</strong> when it
                        ships in 48.13-48.14.
                    </p>
                    <p className="gn-setup-field-hint">
                        Trusted SQL examples are stored in <code>serialized_space.instructions.example_question_sqls[]</code>
                        on the Databricks side. When matched, Genie uses them as exact-match templates or few-shot
                        exemplars — the strongest hallucination-reduction lever available in Genie.
                    </p>
                </div>
            </GuidedPage>
        );
    }

    // ── Page 7: Review ──────────────────────────────────────────────────
    // IDEA-039 UX clarity pass — Quick Setup is now self-contained. Apply
    // Changes lives in the persistent action row BELOW the wizard (in
    // SetupEditFlow), so Page 7's Next button is removed entirely. User
    // flow: Page 7 → review → click `Apply Changes` in the bottom action
    // row → done. No mode switch required.
    return (
        <GuidedPage
            id={7}
            total={total}
            title="Review"
            summary="Confirm changes, then click Apply"
            tooltip="Recaps the fields you customised. Click Apply Changes in the action row below to commit. Save Report afterwards to persist the changes for other viewers."
            question={<>You're all set. Here's a recap of what you customised. Click <strong>Apply Changes</strong> at the bottom of this dialog to commit, or click <strong>Back</strong> to revisit any step.</>}
            onBack={goBack}
            onSwitchToAdvanced={onSwitchToAdvanced}
        >
            <ReviewSummary draft={draft} onJumpToSection={onJumpToSection} onSwitchToAdvanced={onSwitchToAdvanced} />
            <p className="gn-setup-field-hint" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--gn-border-subtle, rgba(0,0,0,0.06))" }}>
                ✅ Ready to save. Use <strong>Apply Changes</strong> in the action row below to write these settings to the visual.
            </p>
        </GuidedPage>
    );
}

// ────────────────────────────────────────────────────────────────────────
// Review summary — uses STEP5_FIELDS metadata for the diff display
// ────────────────────────────────────────────────────────────────────────

function ReviewSummary(props: {
    draft: SetupDraft;
    onJumpToSection?: (s: "0" | "A" | "B" | "C" | "D" | "E" | "F") => void;
    onSwitchToAdvanced: () => void;
}) {
    // STEP5_FIELDS is imported at module top (see header). The read is
    // SAFE here because we're inside a component body — by the time this
    // runs, both modules are fully evaluated and the live binding points
    // at the real array. A top-level read in this file would still race
    // the partial module init.
    const fields = STEP5_FIELDS as FieldMeta[];
    const customised = fields.filter(f => (props.draft as unknown as Record<string, unknown>)[f.name as string] !== f.defaultValue);
    const bySection = customised.reduce((acc: Record<string, typeof customised>, f) => {
        (acc[f.section] = acc[f.section] || []).push(f);
        return acc;
    }, {});

    if (customised.length === 0) {
        return (
            <div className="gn-setup-guided-review-empty">
                <p>You haven't customised anything — the visual will use the bundled defaults across every section.</p>
                <p className="gn-setup-field-hint">That's perfectly fine for first-pass deployment. You can still click <strong>Apply Changes</strong> below to commit the defaults, or use the <em>Switch to Advanced Editor</em> link at the top to fine-tune any field individually.</p>
            </div>
        );
    }

    return (
        <div className="gn-setup-guided-review">
            <p className="gn-setup-field-hint">
                <strong>{customised.length}</strong> field{customised.length === 1 ? "" : "s"} customised across{" "}
                <strong>{Object.keys(bySection).length}</strong> section{Object.keys(bySection).length === 1 ? "" : "s"}.
            </p>
            {Object.entries(bySection).map(([section, fields]) => (
                <div key={section} className="gn-setup-guided-review-section">
                    <h6>
                        Section {section}
                        {props.onJumpToSection && (
                            <button
                                type="button"
                                className="gn-btn gn-btn--compact"
                                title="Open this section in the Advanced Editor for field-by-field tuning. In-progress edits transfer over."
                                onClick={() => { props.onJumpToSection!(section as "0" | "A" | "B" | "C" | "D" | "E" | "F"); props.onSwitchToAdvanced(); }}
                            >
                                ✎ Open in Advanced Editor
                            </button>
                        )}
                    </h6>
                    <ul>
                        {fields.map(f => (
                            <li key={String(f.name)}>
                                <code>{String(f.name)}</code>{": "}
                                <span className="gn-setup-guided-review-value">
                                    {(() => {
                                        const v = props.draft[f.name];
                                        if (typeof v === "boolean") return v ? "ON" : "OFF";
                                        if (typeof v === "string") return v.length > 60 ? v.slice(0, 60) + "…" : (v || "(blank)");
                                        return String(v);
                                    })()}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
