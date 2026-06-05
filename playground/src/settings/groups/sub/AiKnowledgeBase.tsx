// playground/src/settings/groups/sub/AiKnowledgeBase.tsx
//
// AI → Knowledge Base sub-route. Resurfaces the Pulse analytics KB toggles
// (kbEnabled / kbChartRules / kbStatRules / kbReportingRules) that were
// missing from the playground UI.

import { FieldCard, FieldRow, Toggle } from "../../primitives";
import { asBool, useGenieSettingsSlice } from "./genieSettingsBridge";

interface KbState {
    kbEnabled: boolean;
    kbChartRules: boolean;
    kbStatRules: boolean;
    kbReportingRules: boolean;
}

const readSlice = (): KbState => {
    const raw = (typeof window !== "undefined" ? window.localStorage.getItem("pulseplay:visual-settings:genieSettings") : null);
    const obj = raw ? safeParse(raw) : {};
    return {
        kbEnabled: asBool(obj.kbEnabled, true),
        kbChartRules: asBool(obj.kbChartRules, true),
        kbStatRules: asBool(obj.kbStatRules, true),
        kbReportingRules: asBool(obj.kbReportingRules, true),
    };
};

function safeParse(s: string): Record<string, unknown> {
    try { const p = JSON.parse(s); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

export function AiKnowledgeBase(): React.ReactElement {
    const [state, patch] = useGenieSettingsSlice<KbState>(readSlice);

    return (
        <section id="settings-ai-knowledge-base" aria-labelledby="settings-ai-kb-title">
            <SubPageHeader
                title="Knowledge Base"
                blurb="Tune the analytical guardrails the assistant applies when picking a chart, computing statistics, or framing a leadership report. These toggles affect prompt construction for AI Insights and Ask Pulse."
            />

            <FieldCard
                title="Analytics rules"
                subtitle="Built-in heuristics the assistant consults before answering."
                tip={
                    <>
                        These are <strong>opt-in heuristics</strong>, not hard validators. Disabling one means the assistant won't be reminded of the convention — it can still produce correct output, but the guardrail is removed.
                    </>
                }
                status={{ tone: state.kbEnabled ? "ok" : "warn", label: state.kbEnabled ? "Enabled" : "Disabled" }}
            >
                <FieldRow
                    label="Master switch"
                    hint="When off, all KB rules below are bypassed regardless of their individual toggles."
                    tip="The fastest way to test whether a KB rule is interfering with an answer — turn this off, retry, compare."
                >
                    <Toggle id="kb-enabled" checked={state.kbEnabled} onChange={v => patch({ kbEnabled: v })} label={state.kbEnabled ? "KB enabled" : "KB disabled"} />
                </FieldRow>

                <FieldRow
                    label="Chart selection rules"
                    hint="Adds the chart-type guidance from chartRegistry.ts to the system prompt (auto-pick policy, tier hints)."
                    tip="Recommended for orgs that want consistent chart picks. Disable if you want the LLM to be more creative with vendor-specific chart types."
                >
                    <Toggle id="kb-charts" checked={state.kbChartRules} onChange={v => patch({ kbChartRules: v })} disabled={!state.kbEnabled} label={state.kbChartRules ? "Chart rules on" : "Chart rules off"} />
                </FieldRow>

                <FieldRow
                    label="Statistical rules"
                    hint="Adds reminders about confidence intervals, sample size warnings, and avoiding misleading aggregations."
                    tip="Important for executive-facing summaries where small samples can produce misleading deltas."
                >
                    <Toggle id="kb-stats" checked={state.kbStatRules} onChange={v => patch({ kbStatRules: v })} disabled={!state.kbEnabled} label={state.kbStatRules ? "Stats rules on" : "Stats rules off"} />
                </FieldRow>

                <FieldRow
                    label="Reporting rules"
                    hint="Adds 'lead with the headline / explain the why / suggest next step' framing for leadership summaries."
                    tip="Turn off for technical audiences (engineers, analysts) who want raw findings without narrative scaffolding."
                >
                    <Toggle id="kb-reporting" checked={state.kbReportingRules} onChange={v => patch({ kbReportingRules: v })} disabled={!state.kbEnabled} label={state.kbReportingRules ? "Reporting rules on" : "Reporting rules off"} />
                </FieldRow>
            </FieldCard>
        </section>
    );
}

// ─── Shared sub-page header ───────────────────────────────────────

export function SubPageHeader({ title, blurb }: { title: string; blurb: string }): React.ReactElement {
    return (
        <header style={{ marginBottom: 20 }}>
            <h2
                style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "-0.025em",
                    // Start the gradient at the theme text token (not a hardcoded
                    // light-mode slate) so the title stays legible in dark mode —
                    // #0f172a is ~invisible on the dark canvas. Mirrors the
                    // canonical .pp-app__brand h1 gradient. (dark-mode legibility)
                    background: "linear-gradient(135deg, var(--pp-text) 0%, #4f46e5 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                }}
            >
                {title}
            </h2>
            <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 13, lineHeight: 1.55, maxWidth: 640 }}>
                {blurb}
            </p>
        </header>
    );
}
