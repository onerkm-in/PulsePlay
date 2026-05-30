/**
 * setupWizard.tsx
 *
 * Wave 32 Phase 1 + Phase 2 — first-time setup wizard.
 *
 * Replaces the empty Setup tab seen by an author who drops the visual on a
 * blank canvas. Renders a 4-step linear flow (Backend → Connect → Validate →
 * Done).
 *
 * Phase 1 (cycle 7, eb88638) shipped the structural skeleton + reducer state
 * machine + gating predicate + a stub validate that always resolved green.
 *
 * Phase 2 (this commit) adds:
 *   - Real `onValidate` hookup driven from visual.tsx (runConnectivityCheck +
 *     runTestQuestion against the in-progress draft).
 *   - Per-backend field rendering driven from `connectorRegistry.ts`. The
 *     Connect step now reads `getDescriptor(mode).fields` and renders only
 *     the inputs the chosen backend actually needs. The Next button enables
 *     once every required field has a non-empty value.
 *   - Validation-failure UI with a "Back to Connect" button that retains the
 *     full draft, plus a one-line hint inferred from the failure detail
 *     (timeout / 401 / CORS).
 *   - Prefill from existing partial settings — when the wizard mounts, any
 *     non-empty settings field (host / token / spaceId / apiBaseUrl /
 *     assistantProfile / warehouseId / proxyKey / connectionMode) seeds the
 *     wizard's draft so the author can adjust rather than retype.
 *
 * Exports:
 *   - WizardStep, WizardDraft, WizardAction (types)
 *   - INITIAL_WIZARD_STATE, wizardReducer (pure reducer for unit tests)
 *   - shouldShowWizard(settings, activeGenieConfig) (gating predicate)
 *   - draftFromSettings(settings) (Phase 2 — prefill helper, exported for tests)
 *   - inferFailureHint(detail) (Phase 2 — error-code → hint mapper, exported for tests)
 *   - WIZARD_FIELD_KEYS (Phase 2 — keys the wizard accepts in its draft)
 *   - <SetupWizard /> (React component)
 *
 * Gating contract (visual.tsx must obey):
 *   The wizard is shown only when:
 *     - the visual is not already configured (host/token/spaceId not all set)
 *     - settings.wizardDismissed is false
 *     - activeGenieConfig.spaceId is empty
 *     - the user is on the Setup surface (Setup panel inside the Developer
 *       Tools modal). Chat / AI Insights tabs are never replaced by the
 *       wizard.
 *
 * Addition-only: existing configured visuals never see this component, and
 * the Phase 1 9-test vitest suite continues to pass unchanged.
 */

import * as React from "react";
import { GenieVisualSettings, ConnectionMode } from "./settings";
import { CONNECTOR_REGISTRY, getDescriptor, ConnectorFieldSpec } from "./backend/connectorRegistry";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Linear progression. Validate transitions back to "connect" on failure
 *  (Phase 2 — see RUN_VALIDATION reducer below). */
export type WizardStep = "backend" | "connect" | "validate" | "done";

/** The 5 selectable backends shown as cards on Step 1. Each maps to a
 *  ConnectionMode value in genie.ts / settings.ts. The wizard intentionally
 *  uses a hand-curated subset — `auto` is hidden because it isn't a thing
 *  an author should pick first; pick a concrete backend, then graduate to
 *  Auto if needed. */
export interface BackendCard {
    id: ConnectionMode;
    label: string;
    hint: string;
}

export const WIZARD_BACKENDS: BackendCard[] = [
    { id: "proxy",            label: "Databricks Genie (proxy)",    hint: "Recommended. Token stays server-side." },
    { id: "direct",           label: "Databricks Genie (direct)",   hint: "Browser → Databricks. PAT in-visual. Dev/lab only." },
    { id: "supervisor",       label: "Supervisor agent",            hint: "Multi-source orchestrator (via proxy)." },
    { id: "foundation-model", label: "Databricks Foundation Model", hint: "Mosaic AI model-serving endpoint via proxy. Workaround for Genie Agent Mode UI-only limitation." },
    { id: "azure-openai",     label: "Azure OpenAI",                hint: "Azure OpenAI deployment via proxy." },
    { id: "bedrock",          label: "AWS Bedrock",                 hint: "Bedrock knowledge base via proxy." }
];

/** In-progress wizard draft. Phase 2 widens this to the full set of fields
 *  any registered connector descriptor might ask for. The reducer treats
 *  every field uniformly (string-typed) and the renderer only shows the
 *  ones the chosen backend declares in its `fields` array. */
export interface WizardDraft {
    connectionMode: ConnectionMode | null;
    host: string;
    token: string;
    spaceId: string;
    apiBaseUrl: string;
    assistantProfile: string;
    warehouseId: string;
    proxyKey: string;
}

/** All keys the wizard's UPDATE_FIELD action accepts. Exported so tests can
 *  iterate without duplicating the literal list. */
export const WIZARD_FIELD_KEYS: ReadonlyArray<keyof Omit<WizardDraft, "connectionMode">> = [
    "host",
    "token",
    "spaceId",
    "apiBaseUrl",
    "assistantProfile",
    "warehouseId",
    "proxyKey",
];

/** Validation probe outcome surfaced to the user. */
export interface WizardValidationResult {
    connectivity: "pass" | "fail" | "pending";
    question: "pass" | "fail" | "pending";
    detail?: string;
}

export interface WizardState {
    step: WizardStep;
    draft: WizardDraft;
    validation: WizardValidationResult;
}

export const INITIAL_WIZARD_STATE: WizardState = {
    step: "backend",
    draft: {
        connectionMode: null,
        host: "",
        token: "",
        spaceId: "",
        apiBaseUrl: "",
        assistantProfile: "",
        warehouseId: "",
        proxyKey: "",
    },
    validation: { connectivity: "pending", question: "pending" }
};

export type WizardAction =
    | { type: "SELECT_BACKEND"; mode: ConnectionMode }
    | { type: "UPDATE_FIELD"; field: keyof Omit<WizardDraft, "connectionMode">; value: string }
    | { type: "NEXT" }
    | { type: "BACK" }
    | { type: "RUN_VALIDATION"; result: WizardValidationResult }
    | { type: "RESET_VALIDATION" }
    | { type: "GOTO_CONNECT" }
    | { type: "COMMIT" }
    | { type: "SKIP" };

// ─── Reducer ──────────────────────────────────────────────────────────────────

const STEP_ORDER: WizardStep[] = ["backend", "connect", "validate", "done"];

function nextStep(s: WizardStep): WizardStep {
    const idx = STEP_ORDER.indexOf(s);
    return idx >= 0 && idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : s;
}

function prevStep(s: WizardStep): WizardStep {
    const idx = STEP_ORDER.indexOf(s);
    return idx > 0 ? STEP_ORDER[idx - 1] : s;
}

/** Pure reducer. Exported for unit tests. Phase 2 added RESET_VALIDATION
 *  (called when the user returns to Connect to retry) and GOTO_CONNECT
 *  (jumps the user to the Connect step from the validation-failure UI
 *  while preserving the entire draft). */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
    switch (action.type) {
        case "SELECT_BACKEND":
            return {
                ...state,
                draft: { ...state.draft, connectionMode: action.mode },
                step: "connect"
            };
        case "UPDATE_FIELD":
            return {
                ...state,
                draft: { ...state.draft, [action.field]: action.value }
            };
        case "NEXT":
            return { ...state, step: nextStep(state.step) };
        case "BACK":
            return { ...state, step: prevStep(state.step) };
        case "RUN_VALIDATION":
            // Auto-advance to "done" iff both probes pass. Failure keeps the
            // user on "validate" so they see the failed probes inline; the
            // failure UI then exposes a "Back to Connect" button that
            // dispatches GOTO_CONNECT (preserves the draft) + RESET_VALIDATION.
            return {
                ...state,
                validation: action.result,
                step: action.result.connectivity === "pass" && action.result.question === "pass"
                    ? "done"
                    : state.step
            };
        case "RESET_VALIDATION":
            return {
                ...state,
                validation: { connectivity: "pending", question: "pending" }
            };
        case "GOTO_CONNECT":
            return { ...state, step: "connect" };
        case "COMMIT":
            return state;
        case "SKIP":
            return state;
        default:
            return state;
    }
}

// ─── Gating predicate ─────────────────────────────────────────────────────────

/** Settings-shaped subset (intentionally narrow so callers don't need to
 *  pass the full GenieVisualSettings — keeps the predicate testable). */
export interface WizardGatingSettings {
    wizardDismissed?: boolean;
    host?: string;
    token?: string;
    spaceId?: string;
    apiBaseUrl?: string;
    assistantProfile?: string;
    warehouseId?: string;
    proxyKey?: string;
    connectionMode?: ConnectionMode;
}

export interface WizardGatingActiveConfig {
    host?: string;
    token?: string;
    spaceId?: string;
    apiBaseUrl?: string;
}

/** Returns true iff the wizard should appear in place of the Setup panel.
 *  Defends against three edge cases:
 *   - Existing configured visuals (host + spaceId both set) never see it.
 *   - An author who clicked Skip in a prior session never sees it again.
 *   - Multi-space configs are treated as configured: the primary slot's
 *     spaceId being set is sufficient to consider the visual "set up". */
export function shouldShowWizard(
    settings: WizardGatingSettings | null | undefined,
    activeGenieConfig: WizardGatingActiveConfig | null | undefined
): boolean {
    if (!settings) return false;
    if (settings.wizardDismissed === true) return false;
    // If the active config has a non-empty spaceId, the visual is configured
    // (or at least mid-setup with the format pane). Honour the spec's
    // `activeGenieConfig?.spaceId == null` literally: empty string also
    // counts as "no space yet".
    const spaceId = (activeGenieConfig?.spaceId ?? settings.spaceId ?? "").trim();
    if (spaceId.length > 0) return false;
    // Belt-and-braces: if host AND token are both filled but spaceId isn't,
    // the author already started in the format pane — drop them into the
    // legacy Setup panel rather than reset their progress. Phase 2 may
    // change this to "show wizard with prefilled fields".
    const host = (activeGenieConfig?.host ?? settings.host ?? "").trim();
    const token = (activeGenieConfig?.token ?? settings.token ?? "").trim();
    if (host.length > 0 && token.length > 0) return false;
    return true;
}

// ─── Phase 2 helpers ──────────────────────────────────────────────────────────

/** Build a partial WizardDraft from existing settings. Used by the wizard
 *  on first mount so authors who started in the format pane don't have to
 *  retype anything. Returns only the keys with non-empty values so the
 *  caller can spread them over INITIAL_WIZARD_STATE.draft without nulling
 *  the defaults. Empty/undefined inputs return an empty object. */
export function draftFromSettings(
    settings: WizardGatingSettings | null | undefined
): Partial<WizardDraft> {
    const out: Partial<WizardDraft> = {};
    if (!settings) return out;
    if (settings.connectionMode) out.connectionMode = settings.connectionMode;
    const copyIfFilled = (key: keyof Omit<WizardDraft, "connectionMode">) => {
        const v = (settings[key] as string | undefined);
        if (v && v.trim().length > 0) {
            (out as Record<string, string>)[key] = v;
        }
    };
    WIZARD_FIELD_KEYS.forEach(copyIfFilled);
    return out;
}

/** Map a free-text validation failure detail to a one-line user hint. The
 *  wizard's StepValidate failure UI shows this under the error so authors
 *  have a starting point before opening the proxy logs. Pure heuristic —
 *  case-insensitive substring match against the most common failure modes
 *  the PBI sandbox throws at us. Returns "" when nothing matches so the
 *  renderer can omit the hint row. */
export function inferFailureHint(detail: string | undefined | null): string {
    const text = (detail || "").toLowerCase();
    if (!text) return "";
    if (/timeout|timed out|etimedout/.test(text)) {
        return "Proxy may be cold-starting. Wait 10 s and retry.";
    }
    if (/\b401\b|unauthor|forbidden|\b403\b|pat |token rejected/.test(text)) {
        return "PAT may be invalid or expired. Re-issue from Databricks → User Settings.";
    }
    if (/cors|cross[- ]origin|access[- ]control/.test(text)) {
        return "Host not in capabilities.json WebAccess allowlist for this visual.";
    }
    if (/network error|failed to fetch|ecconnreset|enetunreach|net::err/.test(text)) {
        return "Proxy unreachable. Check it's running on 127.0.0.1:8787 (not localhost).";
    }
    if (/\b404\b|not found/.test(text)) {
        return "Endpoint or profile not found. Verify the assistant profile name + proxy/config.json.";
    }
    if (/\b5\d\d\b|server error/.test(text)) {
        return "Backend returned a server error. Check the proxy logs (proxy.err.log).";
    }
    return "";
}

/** Build a sanitized, ordered list of fields the StepConnect form should
 *  render for a given backend. Defers to the connectorRegistry so the
 *  wizard stays in lockstep with the format-pane Setup form. Filters out
 *  any fields whose `id` isn't in our WizardDraft schema (defensive — a
 *  future descriptor that adds a new field key won't crash the wizard,
 *  it just won't be rendered until WizardDraft is widened). */
function fieldsForBackend(mode: ConnectionMode): ConnectorFieldSpec[] {
    const desc = getDescriptor(mode);
    const allowed = new Set<string>(WIZARD_FIELD_KEYS as readonly string[]);
    return desc.fields.filter(f => allowed.has(f.id));
}

// ─── Step components ──────────────────────────────────────────────────────────

interface StepBackendProps {
    selected: ConnectionMode | null;
    onSelect: (mode: ConnectionMode) => void;
}

function StepBackend(props: StepBackendProps): React.ReactElement {
    return (
        <div className="gn-wizard-step gn-wizard-step--backend">
            <h3 className="gn-wizard-title">Pick a backend</h3>
            <p className="gn-wizard-subtitle">You can change this later from the format pane.</p>
            <div className="gn-wizard-cards" role="radiogroup" aria-label="Choose a backend">
                {WIZARD_BACKENDS.map(card => {
                    const isSelected = props.selected === card.id;
                    return (
                        <button
                            key={card.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            className={`gn-wizard-card${isSelected ? " gn-wizard-card--selected" : ""}`}
                            onClick={() => props.onSelect(card.id)}
                            data-backend-id={card.id}
                        >
                            <span className="gn-wizard-card-title">{card.label}</span>
                            <span className="gn-wizard-card-hint">{card.hint}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

interface StepConnectProps {
    draft: WizardDraft;
    onChange: (field: keyof Omit<WizardDraft, "connectionMode">, value: string) => void;
    onNext: () => void;
    onBack: () => void;
}

function StepConnect(props: StepConnectProps): React.ReactElement {
    const { draft } = props;
    // Phase 2 — registry-driven field list. Default to a generic 3-field
    // shape if no backend selected yet (defensive; the reducer normally
    // routes us through SELECT_BACKEND first so connectionMode is set).
    const mode: ConnectionMode = draft.connectionMode ?? "proxy";
    const fields = React.useMemo(() => fieldsForBackend(mode), [mode]);

    // Next-button gate: every REQUIRED field declared by the descriptor must
    // have a non-empty value. Optional fields don't block. (Phase 1 simply
    // required all 3 hardcoded fields; Phase 2 lets descriptors mark e.g.
    // assistantProfile as optional so proxy mode with a default profile is
    // valid without typing it in.)
    const allRequiredFilled = fields.every(f => {
        if (!f.required) return true;
        const v = (draft as unknown as Record<string, string | null>)[f.id];
        return typeof v === "string" && v.trim().length > 0;
    });

    const inputType = (kind: ConnectorFieldSpec["kind"]): string => {
        switch (kind) {
            case "secret": return "password";
            case "url":    return "url";
            default:       return "text";
        }
    };

    return (
        <div className="gn-wizard-step gn-wizard-step--connect">
            <h3 className="gn-wizard-title">Connect</h3>
            <p className="gn-wizard-subtitle">
                Fill the fields below for the <strong>{getDescriptor(mode).label}</strong> backend.
                You can revisit any of these later from the format pane.
            </p>
            <div className="gn-wizard-form" data-backend-mode={mode} data-field-count={fields.length}>
                {fields.map(field => (
                    <label className="gn-wizard-label" key={field.id}>
                        <span>
                            {field.label}
                            {field.required && <span className="gn-wizard-required" aria-hidden="true"> *</span>}
                        </span>
                        <input
                            type={inputType(field.kind)}
                            className="gn-wizard-input"
                            placeholder={field.placeholder ?? ""}
                            value={(draft as unknown as Record<string, string>)[field.id] ?? ""}
                            onChange={e => props.onChange(
                                field.id as keyof Omit<WizardDraft, "connectionMode">,
                                e.target.value
                            )}
                            data-field={field.id}
                            data-required={field.required ? "true" : "false"}
                            aria-required={field.required}
                        />
                        {field.hint && <span className="gn-wizard-hint">{field.hint}</span>}
                    </label>
                ))}
            </div>
            <div className="gn-wizard-actions">
                <button type="button" className="gn-btn gn-wizard-back" onClick={props.onBack}>
                    Back
                </button>
                <button
                    type="button"
                    className="gn-btn gn-btn--primary gn-wizard-next"
                    onClick={props.onNext}
                    disabled={!allRequiredFilled}
                    data-action="next"
                >
                    Validate
                </button>
            </div>
        </div>
    );
}

interface StepValidateProps {
    validation: WizardValidationResult;
    onBack: () => void;
    /** Phase 2 — explicit retry that jumps back to Connect with the draft
     *  intact and clears the prior validation result. Distinct from `onBack`
     *  (a single-step undo) because the user might still have follow-up
     *  edits to make and shouldn't see a stale "fail" badge in the rail. */
    onRetry: () => void;
}

function StepValidate(props: StepValidateProps): React.ReactElement {
    const { validation } = props;
    const failed = validation.connectivity === "fail" || validation.question === "fail";
    const hint = failed ? inferFailureHint(validation.detail) : "";
    return (
        <div className="gn-wizard-step gn-wizard-step--validate">
            <h3 className="gn-wizard-title">Validate</h3>
            <p className="gn-wizard-subtitle">
                Running connectivity + lightweight test question…
            </p>
            <ul className="gn-wizard-checks" aria-live="polite">
                <li className={`gn-wizard-check gn-wizard-check--${validation.connectivity}`} data-check="connectivity">
                    <span className="gn-wizard-check-icon" aria-hidden="true">
                        {validation.connectivity === "pass" ? "✓" : validation.connectivity === "fail" ? "✗" : "…"}
                    </span>
                    <span className="gn-wizard-check-label">Connectivity</span>
                </li>
                <li className={`gn-wizard-check gn-wizard-check--${validation.question}`} data-check="question">
                    <span className="gn-wizard-check-icon" aria-hidden="true">
                        {validation.question === "pass" ? "✓" : validation.question === "fail" ? "✗" : "…"}
                    </span>
                    <span className="gn-wizard-check-label">Test question</span>
                </li>
            </ul>
            {failed && (
                <div className="gn-wizard-failure" role="alert" data-validation-state="fail">
                    <p className="gn-wizard-failure-detail" data-test-id="failure-detail">
                        {validation.detail || "Validation failed."}
                    </p>
                    {hint && (
                        <p className="gn-wizard-failure-hint" data-test-id="failure-hint">{hint}</p>
                    )}
                </div>
            )}
            <div className="gn-wizard-actions">
                <button type="button" className="gn-btn gn-wizard-back" onClick={props.onBack}>
                    Back
                </button>
                {failed && (
                    <button
                        type="button"
                        className="gn-btn gn-btn--primary gn-wizard-retry"
                        onClick={props.onRetry}
                        data-action="retry"
                    >
                        Back to Connect
                    </button>
                )}
            </div>
        </div>
    );
}

interface StepDoneProps {
    onCommit: (destination: "insights" | "chat") => void;
}

function StepDone(props: StepDoneProps): React.ReactElement {
    return (
        <div className="gn-wizard-step gn-wizard-step--done">
            <div className="gn-wizard-done-banner">
                <h3 className="gn-wizard-title">You're set up.</h3>
                <p className="gn-wizard-subtitle">
                    Pick where to land — <strong>AI Insights</strong> auto-runs a
                    5-stage briefing on your bound data, or jump to <strong>Ask Pulse</strong>
                    to ask a question (e.g., <em>"What were total sales last quarter?"</em>).
                </p>
            </div>
            {/* Wave 32 cycle 16 — explicit save reminder on the wizard's
                Done step. The Apply Changes flow in regular Setup has its
                own toast (cycle 9), but the wizard bypasses Setup entirely,
                so the same Ctrl+S guidance must surface here. Inline (not
                toast) because the wizard is full-page and the user is
                already focused on the destination buttons. */}
            <div className="gn-wizard-save-hint" role="status">
                <span aria-hidden="true" className="gn-wizard-save-hint-icon">💾</span>
                <div>
                    <strong>Settings applied to this visual instance.</strong>
                    <span> Press <kbd>Ctrl</kbd> + <kbd>S</kbd> in Power BI Desktop to bake them into the .pbix file. Otherwise they'll be lost when you close the report.</span>
                </div>
            </div>
            <div className="gn-wizard-actions">
                <button
                    type="button"
                    className="gn-btn gn-btn--primary gn-wizard-finish"
                    onClick={() => props.onCommit("insights")}
                    data-action="finish-insights"
                >
                    Open AI Insights
                </button>
                <button
                    type="button"
                    className="gn-btn gn-wizard-finish"
                    onClick={() => props.onCommit("chat")}
                    data-action="finish-chat"
                >
                    Open Ask Pulse
                </button>
            </div>
        </div>
    );
}

// ─── Wizard root ──────────────────────────────────────────────────────────────

export interface SetupWizardProps {
    /** Optional initial step override — used by the host to resume a partial
     *  wizard run. Defaults to "backend". */
    initialStep?: WizardStep;
    /** Optional initial draft override — used by tests + Phase 2 partial-prefill. */
    initialDraft?: Partial<WizardDraft>;
    /** Phase 2 — full settings object passed by visual.tsx so the wizard can
     *  prefill its draft from any previously-entered values. Optional: tests
     *  that don't need prefill behaviour can omit it. Anything in
     *  `initialDraft` wins over values derived from `settings`. */
    settings?: WizardGatingSettings | null;
    /** Called once the user clicks the final commit button on Step 4. The
     *  caller is responsible for translating the draft into a
     *  host.persistProperties payload. */
    onCommit: (draft: WizardDraft, destination?: "insights" | "chat") => void;
    /** Called when the user clicks "Skip wizard". The caller flips the
     *  wizardDismissed flag and unmounts this component. */
    onSkip: () => void;
    /** Phase-2 contract: the host runs real probes against the current draft.
     *  Phase 1 supplied a stub that resolved green after 1.5s. Promise must
     *  resolve to a final WizardValidationResult so the reducer can decide
     *  whether to advance to "done". */
    onValidate?: (draft: WizardDraft) => Promise<WizardValidationResult>;
}

/** Default Phase-1 validate stub — used when the host doesn't supply one.
 *  Resolves to two greens after 1.5s so the wizard always advances. */
async function defaultValidateStub(_draft: WizardDraft): Promise<WizardValidationResult> {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return { connectivity: "pass", question: "pass", detail: "stub" };
}

export function SetupWizard(props: SetupWizardProps): React.ReactElement {
    const initial: WizardState = React.useMemo(() => {
        // Phase 2 — prefill from `settings` first, then let `initialDraft`
        // override any specific keys (tests use this to pin values without
        // having to construct a full settings object). If the prefilled
        // draft already has a connectionMode, jump straight to Connect so
        // the author sees their fields populated rather than being asked
        // to pick the backend they've already picked.
        const prefillFromSettings = draftFromSettings(props.settings);
        const mergedDraft = {
            ...INITIAL_WIZARD_STATE.draft,
            ...prefillFromSettings,
            ...(props.initialDraft ?? {})
        };
        const startStep: WizardStep = props.initialStep
            ?? (mergedDraft.connectionMode ? "connect" : INITIAL_WIZARD_STATE.step);
        return {
            ...INITIAL_WIZARD_STATE,
            step: startStep,
            draft: mergedDraft
        };
    }, []); // freeze on first mount; subsequent prop changes are ignored by design

    const [state, dispatch] = React.useReducer(wizardReducer, initial);

    // Phase-2 validation orchestration. Fired every time we ENTER the
    // "validate" step — including a re-entry after the user clicked
    // "Back to Connect" and re-validated. We track a generation counter
    // so an in-flight stale probe (e.g. user navigated back and re-fired)
    // can't clobber the result of the newer probe.
    const validateGenRef = React.useRef(0);
    const lastValidatedStepRef = React.useRef<WizardStep | null>(null);
    React.useEffect(() => {
        if (state.step !== "validate") {
            // Reset the latch so a future entry into "validate" re-fires the
            // probe (Phase 2 — Phase 1 only fired once total). Don't reset
            // validateGenRef so an outstanding promise from a prior visit
            // still gets its result discarded.
            lastValidatedStepRef.current = null;
            return;
        }
        if (lastValidatedStepRef.current === "validate") return;
        lastValidatedStepRef.current = "validate";
        validateGenRef.current += 1;
        const myGen = validateGenRef.current;
        const probe = props.onValidate ?? defaultValidateStub;
        probe(state.draft).then(result => {
            if (validateGenRef.current !== myGen) return;
            dispatch({ type: "RUN_VALIDATION", result });
        }).catch(err => {
            if (validateGenRef.current !== myGen) return;
            const detail = err && typeof err === "object" && "message" in err
                ? String((err as Error).message)
                : "probe error";
            dispatch({
                type: "RUN_VALIDATION",
                result: { connectivity: "fail", question: "fail", detail }
            });
        });
    }, [state.step]);

    const handleCommit = React.useCallback((destination: "insights" | "chat") => {
        dispatch({ type: "COMMIT" });
        props.onCommit(state.draft, destination);
    }, [state.draft, props.onCommit]);

    const handleSkip = React.useCallback(() => {
        dispatch({ type: "SKIP" });
        props.onSkip();
    }, [props.onSkip]);

    const handleRetry = React.useCallback(() => {
        // Phase 2 — explicit retry: drop back to Connect and wipe the
        // failed validation result so the user doesn't see stale ✗ badges
        // when they re-enter validate. The draft stays intact.
        dispatch({ type: "RESET_VALIDATION" });
        dispatch({ type: "GOTO_CONNECT" });
    }, []);

    return (
        <div className="gn-wizard" role="region" aria-label="First-time setup wizard">
            <header className="gn-wizard-header">
                <ol className="gn-wizard-rail" aria-label="Setup steps">
                    {STEP_ORDER.map((s, idx) => (
                        <li
                            key={s}
                            className={`gn-wizard-rail-item${state.step === s ? " gn-wizard-rail-item--active" : ""}${STEP_ORDER.indexOf(state.step) > idx ? " gn-wizard-rail-item--done" : ""}`}
                            aria-current={state.step === s ? "step" : undefined}
                        >
                            <span className="gn-wizard-rail-num">{idx + 1}</span>
                            <span className="gn-wizard-rail-label">{s}</span>
                        </li>
                    ))}
                </ol>
                <button
                    type="button"
                    className="gn-wizard-skip"
                    onClick={handleSkip}
                    title="Hide the wizard. You can configure the visual from the format pane or the Setup tab."
                    data-action="skip"
                >
                    Skip
                </button>
            </header>
            <div className="gn-wizard-body">
                {state.step === "backend" && (
                    <StepBackend
                        selected={state.draft.connectionMode}
                        onSelect={mode => dispatch({ type: "SELECT_BACKEND", mode })}
                    />
                )}
                {state.step === "connect" && (
                    <StepConnect
                        draft={state.draft}
                        onChange={(field, value) => dispatch({ type: "UPDATE_FIELD", field, value })}
                        onNext={() => dispatch({ type: "NEXT" })}
                        onBack={() => dispatch({ type: "BACK" })}
                    />
                )}
                {state.step === "validate" && (
                    <StepValidate
                        validation={state.validation}
                        onBack={() => dispatch({ type: "BACK" })}
                        onRetry={handleRetry}
                    />
                )}
                {state.step === "done" && <StepDone onCommit={handleCommit} />}
            </div>
        </div>
    );
}

/** Re-export for callers that want to type a wizard payload as a partial of
 *  the visual settings without importing settings.ts directly. */
export type { GenieVisualSettings };

/** Re-export the registry so external test fixtures and downstream callers
 *  can introspect what fields the wizard will render for a given backend. */
export { CONNECTOR_REGISTRY as WIZARD_CONNECTOR_REGISTRY };
