// playground/src/settings/groups/sub/SystemDeveloper.tsx
//
// System → Developer Tools sub-route. Resurfaces Pulse developer toggles:
// devMode, showSql, showTrace, validation retries, guided filters, etc.
// All of these change runtime behavior of the AI surfaces (Insights / Chat),
// so they belong with the diagnostic + governance posture in System group.

import { FieldCard, FieldRow, Toggle } from "../../primitives";
import { asBool, asNum, useGenieSettingsSlice } from "./genieSettingsBridge";
import { SubPageHeader } from "./AiKnowledgeBase";

interface DevState {
    devMode: boolean;
    showSql: boolean;
    showTrace: boolean;
    showConnectorCompatibilityWarnings: boolean;
    showGuidedFilters: boolean;
    allowReportActions: boolean;
    insightsValidationRetryCount: number;
}

function safeParse(s: string): Record<string, unknown> {
    try { const p = JSON.parse(s); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

const readSlice = (): DevState => {
    const raw = (typeof window !== "undefined" ? window.localStorage.getItem("pulseplay:visual-settings:genieSettings") : null);
    const obj = raw ? safeParse(raw) : {};
    return {
        devMode: asBool(obj.devMode, false),
        showSql: asBool(obj.showSql, false),
        showTrace: asBool(obj.showTrace, false),
        showConnectorCompatibilityWarnings: asBool(obj.showConnectorCompatibilityWarnings, true),
        showGuidedFilters: asBool(obj.showGuidedFilters, true),
        allowReportActions: asBool(obj.allowReportActions, false),
        insightsValidationRetryCount: Math.max(0, Math.min(3, asNum(obj.insightsValidationRetryCount, 1))),
    };
};

export function SystemDeveloper(): React.ReactElement {
    const [state, patch] = useGenieSettingsSlice<DevState>(readSlice);

    return (
        <section id="settings-system-developer" aria-labelledby="settings-system-dev-title">
            <SubPageHeader
                title="Developer Tools"
                blurb="Diagnostic toggles that change what the AI surfaces show under the hood — SQL traces, prompt internals, retry behavior. Use these when investigating an answer that looks wrong."
            />

            <FieldCard
                title="Diagnostic surfaces"
                subtitle="Show internal SQL / reasoning traces in the chat and Insights."
                status={{ tone: state.devMode || state.showSql || state.showTrace ? "info" : "neutral", label: state.devMode ? "Dev mode" : state.showSql || state.showTrace ? "Trace on" : "Production posture" }}
                tip={
                    <>
                        Turn these on while diagnosing a bad answer; turn them off for screenshots, demos, and shipped releases. <strong>Dev mode</strong> implies <strong>SQL</strong> and <strong>Trace</strong> visible by default.
                    </>
                }
            >
                <FieldRow
                    label="Developer mode"
                    hint="Enables verbose logging in the browser console + a 'View SQL' / 'View Trace' tab on every message."
                    tip={<>Internally sets <code>NODE_ENV</code>-like behavior for the visual layer. Safe to leave on in production but adds visual clutter.</>}
                >
                    <Toggle id="dev-mode" checked={state.devMode} onChange={v => patch({ devMode: v })} label={state.devMode ? "Dev mode on" : "Dev mode off"} />
                </FieldRow>

                <FieldRow
                    label="Show SQL tab"
                    hint="Adds a 'SQL' view tab on Genie answers that show the executed query."
                    tip={<>Useful when verifying that Genie picked the right table / joined the right keys. Turn off for end-user demos.</>}
                >
                    <Toggle id="show-sql" checked={state.showSql} onChange={v => patch({ showSql: v })} label={state.showSql ? "SQL tab visible" : "SQL tab hidden"} />
                </FieldRow>

                <FieldRow
                    label="Show Trace tab"
                    hint="Adds a 'Trace' view tab on multi-stage AI Insights answers showing each stage's prompt + output."
                    tip={<>Only meaningful for the multi-stage Insights pipeline. No effect on single-stage Genie chat answers.</>}
                >
                    <Toggle id="show-trace" checked={state.showTrace} onChange={v => patch({ showTrace: v })} label={state.showTrace ? "Trace tab visible" : "Trace tab hidden"} />
                </FieldRow>
            </FieldCard>

            <FieldCard
                title="Pipeline behavior"
                subtitle="Retry policy, compatibility warnings, action permissions."
                tip="These change how aggressive PulsePlay is when an Insights stage fails validation or when a connector / vendor combo is unusual."
            >
                <FieldRow
                    label="Insights validation retries"
                    hint="How many times the proxy retries a failed Insights stage before surfacing an error."
                    tip={<>0 = no retry (fastest, highest error rate). 3 = max patience (slowest, highest success rate on flaky models). Default 1.</>}
                >
                    <select
                        id="dev-retry-count"
                        value={state.insightsValidationRetryCount}
                        onChange={e => patch({ insightsValidationRetryCount: Number(e.target.value) })}
                    >
                        <option value={0}>0 — no retry</option>
                        <option value={1}>1 retry (default)</option>
                        <option value={2}>2 retries</option>
                        <option value={3}>3 retries (max)</option>
                    </select>
                </FieldRow>

                <FieldRow
                    label="Connector compatibility warnings"
                    hint="Show a yellow banner when the picked BI vendor + AI profile pair isn't fully tested together."
                    tip={<>Recommended on. Turn off when you've validated a combo internally and don't want the warning every session.</>}
                >
                    <Toggle id="dev-compat" checked={state.showConnectorCompatibilityWarnings} onChange={v => patch({ showConnectorCompatibilityWarnings: v })} label={state.showConnectorCompatibilityWarnings ? "Show warnings" : "Hide warnings"} />
                </FieldRow>

                <FieldRow
                    label="Guided filters"
                    hint="Surface a 'Filters' bar in Ask Pulse showing which dimensions the assistant can scope by."
                    tip={<>Helpful for executive users who want one-click filtering. Disable for analysts who prefer to write filter SQL directly.</>}
                >
                    <Toggle id="dev-guided-filters" checked={state.showGuidedFilters} onChange={v => patch({ showGuidedFilters: v })} label={state.showGuidedFilters ? "Filters bar on" : "Filters bar off"} />
                </FieldRow>

                <FieldRow
                    label="Allow report actions"
                    hint="Lets the assistant trigger BI report actions (bookmark, navigate, drill) on the embedded canvas."
                    tip={<>Off by default — actions on a live report can change what other viewers see. Only enable when running in a single-user / personal dashboard context.</>}
                >
                    <Toggle id="dev-report-actions" checked={state.allowReportActions} onChange={v => patch({ allowReportActions: v })} label={state.allowReportActions ? "Actions enabled" : "Actions disabled"} />
                </FieldRow>
            </FieldCard>
        </section>
    );
}
