// playground/src/settings/groups/sub/AiSupervisorFusion.tsx
//
// AI → Supervisor Fusion sub-route. Resurfaces the supervisor / multi-space
// fusion settings the Pulse PBI visual exposed but the playground UI never
// surfaced. Auto-fusion toggle + synthesis profile + custom synthesis
// prompt template.

import { FieldCard, FieldRow, Toggle } from "../../primitives";
import { asBool, asStr, useGenieSettingsSlice } from "./genieSettingsBridge";
import { SubPageHeader } from "./AiKnowledgeBase";

interface SupervisorState {
    supervisorAutoFusion: boolean;
    supervisorSynthesisProfile: string;
    supervisorSynthesisPrompt: string;
    supervisorAgentName: string;
    supervisorEndpoint: string;
}

function safeParse(s: string): Record<string, unknown> {
    try { const p = JSON.parse(s); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

const readSlice = (): SupervisorState => {
    const raw = (typeof window !== "undefined" ? window.localStorage.getItem("pulseplay:visual-settings:genieSettings") : null);
    const obj = raw ? safeParse(raw) : {};
    return {
        supervisorAutoFusion: asBool(obj.supervisorAutoFusion, true),
        supervisorSynthesisProfile: asStr(obj.supervisorSynthesisProfile, ""),
        supervisorSynthesisPrompt: asStr(obj.supervisorSynthesisPrompt, ""),
        supervisorAgentName: asStr(obj.supervisorAgentName, ""),
        supervisorEndpoint: asStr(obj.supervisorEndpoint, ""),
    };
};

const DEFAULT_PROMPT = `You are synthesising answers from multiple Genie spaces.
- Lead with the unified answer.
- Cite which space each fact came from.
- Flag disagreements explicitly.
- Keep the synthesis under 200 words unless the user asked for detail.`;

export function AiSupervisorFusion(): React.ReactElement {
    const [state, patch] = useGenieSettingsSlice<SupervisorState>(readSlice);

    return (
        <section id="settings-ai-supervisor-fusion" aria-labelledby="settings-ai-sup-title">
            <SubPageHeader
                title="Supervisor Fusion"
                blurb="When you pick a supervisor profile, the proxy fans out the question to multiple Genie spaces and fuses the answers. These settings control how that fusion behaves and which prompt frames the synthesis."
            />

            <FieldCard
                title="Auto-fusion"
                subtitle="Should supervisor calls return a single synthesised answer, or the raw per-space results?"
                status={{ tone: state.supervisorAutoFusion ? "ok" : "warn", label: state.supervisorAutoFusion ? "Synthesised" : "Raw fan-out" }}
                tip={
                    <>
                        <strong>On</strong> (default): the proxy waits for all fan-out responses, then synthesises a single answer. <strong>Off</strong>: the UI receives per-space results separately, useful for debugging which space contributed what.
                    </>
                }
            >
                <FieldRow
                    label="Synthesise into one answer"
                    hint="Turn off when you want to see what each Genie space returned independently — useful for tuning per-space prompts."
                >
                    <Toggle
                        id="sup-auto-fusion"
                        checked={state.supervisorAutoFusion}
                        onChange={v => patch({ supervisorAutoFusion: v })}
                        label={state.supervisorAutoFusion ? "Auto-fusion on" : "Auto-fusion off"}
                    />
                </FieldRow>
            </FieldCard>

            <FieldCard
                title="Synthesis prompt"
                subtitle="The system prompt the proxy gives the synthesiser LLM when fusing answers."
                tip={
                    <>
                        Only used when <strong>auto-fusion</strong> is on. The synthesiser sees this prompt plus the per-space JSON answers and produces the final unified response. Leave blank to use the proxy's built-in default.
                    </>
                }
            >
                <FieldRow
                    label="Synthesis profile name"
                    hint="The proxy profile (in config.json) the synthesiser should use. Often a separate Foundation Model profile tuned for summarisation."
                    tip={<>Example: <code>foundation-synth</code>. If blank, the proxy falls back to its default synthesis profile.</>}
                >
                    <input
                        id="sup-syn-profile"
                        type="text"
                        value={state.supervisorSynthesisProfile}
                        onChange={e => patch({ supervisorSynthesisProfile: e.target.value })}
                        placeholder="(use proxy default)"
                        spellCheck={false}
                    />
                </FieldRow>

                <FieldRow
                    label="Custom synthesis prompt"
                    hint="Frames how the synthesiser combines per-space answers. Supports markdown."
                    tip={<>If blank, the proxy uses its default. Place an explicit citation rule here if your org needs source-tagged answers (e.g. <code>[sales]</code>, <code>[finance]</code>).</>}
                >
                    <textarea
                        id="sup-syn-prompt"
                        rows={6}
                        value={state.supervisorSynthesisPrompt}
                        onChange={e => patch({ supervisorSynthesisPrompt: e.target.value })}
                        placeholder={DEFAULT_PROMPT}
                        spellCheck={false}
                        style={{ fontFamily: "var(--pp-font-mono)", fontSize: 12 }}
                    />
                </FieldRow>
            </FieldCard>

            <FieldCard
                title="Endpoint overrides"
                subtitle="Advanced — only set when you need to bypass the proxy's default supervisor lookup."
                status={{ tone: state.supervisorEndpoint || state.supervisorAgentName ? "info" : "neutral", label: state.supervisorEndpoint || state.supervisorAgentName ? "Overridden" : "Defaults" }}
                tip={
                    <>
                        <strong>Most orgs leave these blank.</strong> They override the proxy's default supervisor agent lookup; use only if you're testing a new supervisor endpoint or running multiple supervisor agents side-by-side.
                    </>
                }
            >
                <FieldRow
                    label="Supervisor agent name"
                    hint="Overrides config.json's default supervisor agent name."
                    tip={<>Used by the proxy to route fan-out calls. Leave blank in nearly all cases.</>}
                >
                    <input
                        id="sup-agent-name"
                        type="text"
                        value={state.supervisorAgentName}
                        onChange={e => patch({ supervisorAgentName: e.target.value })}
                        placeholder="(use proxy default)"
                        spellCheck={false}
                    />
                </FieldRow>

                <FieldRow
                    label="Supervisor endpoint"
                    hint="HTTPS URL of a custom supervisor agent service."
                    tip={<>Only set this when running an experimental supervisor outside your normal Databricks workspace. Misconfiguration here will silently break fusion calls.</>}
                >
                    <input
                        id="sup-endpoint"
                        type="text"
                        value={state.supervisorEndpoint}
                        onChange={e => patch({ supervisorEndpoint: e.target.value })}
                        placeholder="https://your-supervisor-host"
                        spellCheck={false}
                    />
                </FieldRow>
            </FieldCard>
        </section>
    );
}
