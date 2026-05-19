// playground/src/settings/groups/sub/AiKnowledgeBase.tsx
//
// AI → Knowledge Base sub-route. Resurfaces the Pulse analytics KB toggles
// (kbEnabled / kbChartRules / kbStatRules / kbReportingRules) that were
// missing from the playground UI. Writes through pulseVisualSettingsStore.

import { useCallback, useEffect, useState } from "react";
import { FieldCard, FieldRow } from "../../primitives";

const KB_KEYS = ["kbEnabled", "kbChartRules", "kbStatRules", "kbReportingRules"] as const;
type KbKey = typeof KB_KEYS[number];

const PULSE_KEY = "pulseplay:visual-settings:genieSettings";
const EVENT = "pulseplay:visual-settings-change";

function readKb(): Record<KbKey, boolean> {
    const out: Record<KbKey, boolean> = {
        kbEnabled: true, kbChartRules: true, kbStatRules: true, kbReportingRules: true,
    };
    if (typeof window === "undefined") return out;
    try {
        const raw = window.localStorage.getItem(PULSE_KEY);
        if (!raw) return out;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const k of KB_KEYS) {
            if (typeof parsed[k] === "boolean") out[k] = parsed[k] as boolean;
        }
    } catch { /* swallow */ }
    return out;
}

function writeKb(patch: Partial<Record<KbKey, boolean>>): void {
    if (typeof window === "undefined") return;
    try {
        const raw = window.localStorage.getItem(PULSE_KEY);
        const existing = raw ? JSON.parse(raw) as Record<string, unknown> : {};
        const next = { ...existing, ...patch };
        window.localStorage.setItem(PULSE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { properties: patch } }));
    } catch { /* swallow — error reported via inline status, not toast */ }
}

export function AiKnowledgeBase(): React.ReactElement {
    const [state, setState] = useState<Record<KbKey, boolean>>(() => readKb());

    useEffect(() => {
        const sync = () => setState(readKb());
        window.addEventListener(EVENT, sync as EventListener);
        return () => window.removeEventListener(EVENT, sync as EventListener);
    }, []);

    const toggle = useCallback((key: KbKey) => {
        setState(prev => {
            const next = { ...prev, [key]: !prev[key] };
            writeKb({ [key]: next[key] });
            return next;
        });
    }, []);

    return (
        <section id="settings-ai-knowledge-base" aria-labelledby="settings-ai-kb-title">
            <header style={{ marginBottom: 20 }}>
                <h2 id="settings-ai-kb-title" style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
                    Knowledge Base
                </h2>
                <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13, lineHeight: 1.5 }}>
                    Tune the analytical guardrails the assistant applies when picking a chart, computing statistics, or framing a leadership report. These toggles affect prompt construction for AI Insights and Ask Pulse.
                </p>
            </header>

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
                    <Toggle id="kb-enabled" checked={state.kbEnabled} onChange={() => toggle("kbEnabled")} label={state.kbEnabled ? "KB enabled" : "KB disabled"} />
                </FieldRow>

                <FieldRow
                    label="Chart selection rules"
                    hint="Adds the chart-type guidance from chartRegistry.ts to the system prompt (auto-pick policy, tier hints)."
                    tip="Recommended for orgs that want consistent chart picks. Disable if you want the LLM to be more creative with vendor-specific chart types."
                >
                    <Toggle id="kb-charts" checked={state.kbChartRules} onChange={() => toggle("kbChartRules")} disabled={!state.kbEnabled} label={state.kbChartRules ? "Chart rules on" : "Chart rules off"} />
                </FieldRow>

                <FieldRow
                    label="Statistical rules"
                    hint="Adds reminders about confidence intervals, sample size warnings, and avoiding misleading aggregations."
                    tip="Important for executive-facing summaries where small samples can produce misleading deltas."
                >
                    <Toggle id="kb-stats" checked={state.kbStatRules} onChange={() => toggle("kbStatRules")} disabled={!state.kbEnabled} label={state.kbStatRules ? "Stats rules on" : "Stats rules off"} />
                </FieldRow>

                <FieldRow
                    label="Reporting rules"
                    hint="Adds 'lead with the headline / explain the why / suggest next step' framing for leadership summaries."
                    tip="Turn off for technical audiences (engineers, analysts) who want raw findings without narrative scaffolding."
                >
                    <Toggle id="kb-reporting" checked={state.kbReportingRules} onChange={() => toggle("kbReportingRules")} disabled={!state.kbEnabled} label={state.kbReportingRules ? "Reporting rules on" : "Reporting rules off"} />
                </FieldRow>
            </FieldCard>
        </section>
    );
}

function Toggle(props: { id: string; checked: boolean; onChange: () => void; disabled?: boolean; label: string }): React.ReactElement {
    return (
        <label htmlFor={props.id} className="pp-toggle" style={{ opacity: props.disabled ? 0.5 : 1, cursor: props.disabled ? "not-allowed" : "pointer" }}>
            <input
                id={props.id}
                type="checkbox"
                checked={props.checked}
                onChange={props.onChange}
                disabled={props.disabled}
                className="pp-toggle__input"
            />
            <span className="pp-toggle__track" aria-hidden="true">
                <span className="pp-toggle__thumb" />
            </span>
            <span className="pp-toggle__label">{props.label}</span>
        </label>
    );
}
