import { formattingSettings, FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { listModes } from "./backend/connectorRegistry";

import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;

/**
 * Dropdown items derived from the connector registry. The format-pane
 * dropdown and Settings page pick from the same source — to add a new
 * connector mode, declare it in connectorRegistry.ts and it appears in
 * both UIs automatically.
 */
const CONNECTOR_DROPDOWN_ITEMS = listModes().map(m => ({
    value: m.value,
    displayName: m.status === "preview" ? `${m.label} (preview)` :
                 m.status === "stub"    ? `${m.label} (coming soon)` :
                                          m.label,
}));
const CONNECTOR_DROPDOWN_DEFAULT = CONNECTOR_DROPDOWN_ITEMS[0];

/**
 * How the visual reaches its AI backend.
 *  - "auto":         Proxy when API Base URL is set, otherwise Direct.
 *  - "proxy":        Route through a running proxy server (recommended for production).
 *  - "direct":       Browser calls Databricks Genie REST directly (dev / demo use).
 *  - "gateway":      Databricks AI Gateway / MCP endpoint.
 *  - "azure-openai": Route through proxy to Azure OpenAI Chat Completions.
 *  - "bedrock":      Route through proxy to AWS Bedrock RetrieveAndGenerate.
 *  - "supervisor":   Route through a Databricks Mosaic AI supervisor agent that
 *                    orchestrates multiple Genie spaces internally. One question in,
 *                    one unified answer out — the supervisor decides which spaces to
 *                    query and synthesises the result server-side.
 */
export type ConnectionMode = "auto" | "proxy" | "direct" | "gateway" | "azure-openai" | "bedrock" | "supervisor" | "foundation-model";

/**
 * Authentication model for Databricks requests.
 *  - "sharedPat": One Databricks PAT shared by all report viewers.
 *    PBI RLS / OLS do NOT flow to the Databricks Genie backend; govern access in Unity Catalog.
 *  - "oauthObo": OAuth on-behalf-of — each call carries the viewer's PBI identity.
 *    Requires a proxy that implements the token-exchange flow.
 */
export type AuthMode = "sharedPat" | "oauthObo";

/**
 * UI scale band applied as a CSS variable on the root container.
 * Drives clamp()-based font sizing in visual.less.
 */
export type UiScale = "small" | "normal" | "large";

/**
 * Compact header mode.
 *  - "auto": switch to compact layout below a container-width breakpoint.
 *  - "on":   always render the compact layout.
 *  - "off":  never compact, even on narrow panes.
 */
export type CompactMode = "auto" | "on" | "off";

/**
 * Which user-facing tabs the visual exposes. Single-string enum (not two
 * booleans) so an invalid "neither" state is impossible at the type level.
 *  - "both":         AI Insights + Chat (default)
 *  - "insightsOnly": auto-generated descriptive analytics on load — no chat
 *  - "chatOnly":     conversational Q&A only — no auto-insights, no insights tab
 * When a single feature is enabled the header tab strip is hidden entirely
 * and the auto-fire insights effect is skipped in chatOnly mode.
 */
export type EnabledFeatures = "both" | "insightsOnly" | "chatOnly";

export interface GenieVisualSettings {
    connectionMode: ConnectionMode;
    host: string;
    apiBaseUrl: string;
    assistantProfile: string;
    token: string;
    spaceId: string;
    warehouseId: string;
    proxyKey: string;
    genieFields: string;
    domainGuidance: string;
    sendContextToGenie: boolean;
    darkMode: boolean;
    showSql: boolean;
    showTrace: boolean;
    insightsValidationRetryCount: number;
    showConnectorCompatibilityWarnings: boolean;
    showGuidedFilters: boolean;
    allowReportActions: boolean;
    devMode: boolean;
    insightsPrompt: string;
    /** 49.17 — IDEA-037 hybrid prompt. Short label naming the analytics domain
     *  (e.g. "Sales Performance", "Supply Chain Operations", "Hospital Operations").
     *  Used to color the universal pipeline sections with the right vocabulary
     *  without coupling the prompt to specific column names. */
    insightsDomain: string;
    /** 49.17 — IDEA-037 hybrid prompt. JSON-stringified array of
     *  { name, instruction } entries. Each becomes a domain-specific stage in
     *  the AI Insights pipeline, sandwiched between universal HEADLINE+KPI/
     *  TRENDS and RISKS/RECOMMENDED ACTIONS. Empty array → universal pipeline only. */
    insightsCustomSections: string;
    /** 49.19 — IDEA-037 phase 3 — authoring mode. Drives which authoring path
     *  the AI Insights run takes:
     *   - "manual"      → use insightsPrompt verbatim (single call, full takeover)
     *   - "preset"      → use Domain + Custom Sections (fast hybrid briefing)
     *   - "ai-assisted" → AI introspects bound data and fills Domain + Custom Sections,
     *                     author tunes, then runs hybrid pipeline
     *  All three settings (insightsPrompt, insightsDomain, insightsCustomSections)
     *  persist independently — switching modes never loses prior work. */
    insightsAuthoringMode: "manual" | "preset" | "ai-assisted";
    /** IDEA-039 anomaly #3 — Insights-only domain guidance. When non-empty,
     *  this is used instead of `domainGuidance` for the Insights pipeline.
     *  Empty falls back to `domainGuidance` (full backwards-compat). Lets a
     *  supervisor page set Chat-flow guidance ("fan out across helpers") in
     *  `domainGuidance` while pinning Insights-flow guidance ("single-space
     *  cross-domain summary, no helper citations") here — fixing the
     *  hallucinated "Sales helper / Customer helper" citations in TRENDS.
     *  IDEA-038 phase-1 wedge: same shape will be applied to other shared
     *  settings (genieFields / kbFlags / sendContextToGenie) over time. */
    insightsDomainGuidance: string;
    /** IDEA-039 anomalies #6 + #9 — author-configurable metric direction
     *  rules. Free-text so authors can describe "inverted-good" metrics and
     *  threshold colors per their dataset (varies wildly by domain). The
     *  visual injects this verbatim into every Insights stage prompt so the
     *  model emits 🟢/🟡/🔴 status icons in pipe-table cells correctly.
     *  Empty = no metric-direction guidance, defaults to ▲ = good. */
    metricDirectionRules: string;
    /** Structured metric-direction map used by the renderer. JSON array of
     *  {name, higherIsBetter, aliases?, redPct?, amberPct?}. This is additive
     *  to legacy free-text rules so existing PBIPs continue to work. */
    insightsMetricDirections: string;
    /** Show muted provenance footers on generated Insights sections. */
    insightsShowProvenanceFooter: boolean;
    // IDEA-043 (Session 56) — universal-stage visibility + per-stage prompt
    // override. Lets authors hide a docked stage entirely, or replace its
    // built-in prompt with a custom one. Defaults preserve current behaviour.
    insightsShowHeadline: boolean;
    insightsShowTrends: boolean;
    insightsShowRisks: boolean;
    insightsShowActions: boolean;
    insightsHeadlineOverride: string;
    insightsTrendsOverride: string;
    insightsRisksOverride: string;
    insightsActionsOverride: string;
    /** When true and a Genie message carries `attachments[].reasoning_traces`
     *  (Databricks added this field 2026-04-16 — first programmatic surface
     *  for Agent Mode / Research Agent output), Pulse renders a collapsible
     *  "Research Agent reasoning" section above the regular content. Default
     *  true so the trace appears automatically when available; opt out in
     *  Settings → Preferences → Mix composition → Research Agent traces. */
    insightsShowResearchTraces: boolean;
    /** Phase E.1 — client-side progressive reveal of single-shot Genie
     *  answers. When true (default), the briefing reveals on a wall-clock
     *  schedule (HEADLINE@0, KPI+TRENDS@10s, RISKS+ACTIONS@20s) so the
     *  perceived cadence matches a multi-call orchestrator. Pure cosmetic
     *  — no extra LLM calls, no extra cost, same message id. Honours
     *  `prefers-reduced-motion: reduce` (instant-reveal). */
    insightsStagedRevealEnabled: boolean;
    refreshInsights: boolean;
    /** IDEA-009: AI Insights cache TTL in minutes. 0 = disabled. */
    insightsCacheTtlMinutes: number;
    /** IDEA-022: which user-facing tabs are exposed. Defaults to "both". */
    enabledFeatures: EnabledFeatures;
    ucRowFiltersEnforced: boolean;
    ucColumnMasksEnforced: boolean;
    authMode: AuthMode;
    // Wave 19 — runtime scope injection (prompt-layer enforcement)
    runtimeForbiddenColumns: string;
    runtimeMandatoryRowFilter: string;
    runtimeReadOnlyEnforced: boolean;
    // Legacy setup access allowlist (UX gate; comma-separated emails / UPNs
    // / role labels). Empty string ⇒ legacy `showSetupAccess`.
    // toggle behaviour preserved.
    setupAccessAllowedUsers: string;
    // Wave 21 — SQL configuration (CTE preamble + forbidden tables + RLS template)
    sqlCtePreamble: string;
    sqlForbiddenTables: string;
    sqlRlsHintEnabled: boolean;
    // Theme
    useReportTheme: boolean;
    themeName: string;
    brandAccentColor: string;
    brandTextColor: string;
    brandBgColor: string;
    brandFontFamily: string;
    // Wave 44 — Per-element FontControl overrides. Theme inheritance itself
    // is gated by the existing `useReportTheme` field (above) whose scope was
    // expanded in the cycle-13 patch to cover BOTH colours AND fonts. Empty
    // fontFamily ⇒ inherit theme/default; non-empty ⇒ explicit override.
    /** Header typography — empty fontFamily ⇒ inherit theme/default. */
    headerFontFamily: string;
    headerFontSize: number;
    headerBold: boolean;
    headerItalic: boolean;
    /** Body typography — used for chat bubbles, insights paragraphs, etc. */
    bodyFontFamily: string;
    bodyFontSize: number;
    bodyBold: boolean;
    bodyItalic: boolean;
    /** Accent typography — large headline / KPI / hero numbers. */
    accentFontFamily: string;
    accentFontSize: number;
    accentBold: boolean;
    accentItalic: boolean;
    // Knowledge Base
    kbEnabled: boolean;
    kbChartRules: boolean;
    kbStatRules: boolean;
    kbReportingRules: boolean;
    // Supervisor agent
    supervisorEndpoint: string;
    supervisorAgentName: string;
    supervisorSynthesisPrompt: string;
    supervisorSynthesisProfile: string;
    supervisorAutoFusion: boolean;
    // Multi-space
    multiSpaceEnabled: boolean;
    /** Number of additional helper slots to expose (IDEA-011). 1-9. */
    multiSpaceCount: number;
    space2Label: string;
    space2AssistantProfile: string;
    space2SpaceId: string;
    space2Host: string;
    space2Token: string;
    space3Label: string;
    space3AssistantProfile: string;
    space3SpaceId: string;
    space3Host: string;
    space3Token: string;
    space4Label: string;
    space4AssistantProfile: string;
    space4SpaceId: string;
    space4Host: string;
    space4Token: string;
    space5Label: string;
    space5AssistantProfile: string;
    space5SpaceId: string;
    space5Host: string;
    space5Token: string;
    space6Label: string;
    space6AssistantProfile: string;
    space6SpaceId: string;
    space6Host: string;
    space6Token: string;
    space7Label: string;
    space7AssistantProfile: string;
    space7SpaceId: string;
    space7Host: string;
    space7Token: string;
    space8Label: string;
    space8AssistantProfile: string;
    space8SpaceId: string;
    space8Host: string;
    space8Token: string;
    space9Label: string;
    space9AssistantProfile: string;
    space9SpaceId: string;
    space9Host: string;
    space9Token: string;
    space10Label: string;
    space10AssistantProfile: string;
    space10SpaceId: string;
    space10Host: string;
    space10Token: string;
    // Header & layout (Phase A wiring; rendering hooks land in Phase B/C)
    headerTitle: string;
    headerSubtitle: string;
    uiScale: UiScale;
    compactMode: CompactMode;
    showSetupAccess: boolean;
    /** Wave 30 — when ON (default), the visual's title row (icon + headerTitle
     *  + headerSubtitle) renders. When OFF, the title block is hidden and the
     *  toolbar becomes the first visible row. The Console button stays visible
     *  in both states so viewers can always reach Developer Tools. */
    showHeader: boolean;
    /** Wave 30 cycle 3 — header icon picker. Authors pick one of 6 inline
     *  SVG presets (no remote loads, no file upload — keeps the PBI sandbox
     *  happy). "default" = the original chat-bubble + sparkle. "none" hides
     *  just the icon while keeping the title text. */
    headerIconStyle: "default" | "chat" | "sparkle" | "brain" | "bolt" | "none";
    // Section G — Genie space sync (IDEA-022 follow-up).
    // Stored as JSON strings because the format pane only accepts primitives.
    /** JSON-stringified TextInstruction[] — domain guidance pushed upstream. */
    genieTextInstructionsJson: string;
    /** JSON-stringified SampleQuestion[] — curated suggestions. */
    genieSampleQuestionsJson: string;
    /** JSON-stringified ExampleQuestionSQL[] — trusted SQL examples (48.14). */
    genieExampleSqlsJson: string;
    /** Epoch ms of the last Push-to-AI write. 0 = never written through. */
    lastSpaceSyncAt: number;
    // Wave 32 — first-time setup wizard
    /** Set true once the author dismisses the first-time-setup wizard via
     *  the Skip button. Defaults to false; once true the wizard is never
     *  shown again on this visual instance. Additive — existing visuals
     *  with no persisted value default to false but never see the wizard
     *  because they already have spaceId populated (gating defends both
     *  ways). */
    wizardDismissed: boolean;
}

// ─── Group 1 · Connection ──────────────────────────────────────────────────────
// Start here. Pick your Connection Mode first — the required fields change with
// each mode. Proxy is recommended for production: the token never leaves the
// server. Direct is fine for dev/demo. Databricks AI Gateway, Azure OpenAI,
// and AWS Bedrock each require their own backend configuration.
class ConnectionGroup extends FormattingSettingsGroup {
    name = "connection";
    displayName = "🔌 1 · Connection";
    description = "Choose how this visual reaches its AI backend. Start with Connection Mode — the fields that matter will depend on your choice. Proxy is recommended for production deployments.";
    visible = false; // Operational settings live in PulsePlay Settings — kept in the model so values still persist + load.

    // Dropdown items are derived from the connector registry so the format
    // pane and the Settings page share a single source of truth. To add a new
    // connector, declare it in connectorRegistry.ts — it shows up here
    // automatically. (No connector-specific strings hardcoded in this file.)
    connectionMode = new formattingSettings.ItemDropdown({
        name: "connectionMode",
        displayName: "Connection Mode",
        description: "Connector type. Auto picks Proxy when an API Base URL is configured, otherwise Direct. Use PulsePlay Settings for per-connector configuration and Test Connection.",
        items: CONNECTOR_DROPDOWN_ITEMS,
        value: CONNECTOR_DROPDOWN_DEFAULT,
    });

    host = new formattingSettings.TextInput({
        name: "host",
        displayName: "Databricks Workspace URL",
        description: "Required for the Databricks AI backend via Proxy, Direct, and Databricks AI Gateway modes. Full HTTPS URL of your Databricks workspace, e.g. https://dbc-abc123.cloud.databricks.com  (no trailing slash). Not needed for Azure OpenAI or AWS Bedrock.",
        placeholder: "https://dbc-<id>.cloud.databricks.com",
        value: ""
    });

    apiBaseUrl = new formattingSettings.TextInput({
        name: "apiBaseUrl",
        displayName: "Proxy URL",
        description: "Required for Proxy, AI Supervisor Agent, Azure OpenAI, and AWS Bedrock modes. Local PulsePlay Proxy: 127.0.0.1:8787 (use http in browser, https for hosted). Leave blank for Direct mode. Databricks AI Gateway uses the Workspace URL instead.",
        placeholder: "https://your-proxy-host",
        value: ""
    });

    assistantProfile = new formattingSettings.TextInput({
        name: "assistantProfile",
        displayName: "Proxy Profile Name",
        description: "Proxy mode only · Optional. Name of a specific profile in the proxy's config.json — used when one proxy serves multiple workspaces or AI workspaces. Leave blank to use the default profile.",
        placeholder: "default",
        value: ""
    });

    spaceId = new formattingSettings.TextInput({
        name: "spaceId",
        displayName: "AI Workspace ID",
        description: "Required for Databricks Direct and Databricks AI Gateway modes. The AI workspace identifier from your Databricks workspace — looks like 01f1xxxxxxxxxxxxxxxxxxxxxxxx. In Proxy mode the profile provides this automatically.",
        placeholder: "01f1••••••••••••••••••••••••••••",
        value: ""
    });

    token = new formattingSettings.TextInput({
        name: "token",
        displayName: "Databricks Access Token",
        description: "Required for Direct mode. A Databricks Personal Access Token (PAT) that the browser sends directly. ⚠ This token is stored in the .pbix file — use Proxy mode for production to keep credentials server-side. Ignored in Proxy mode.",
        placeholder: "dapi••••••••••••••••••••••••••••",
        value: ""
    });

    warehouseId = new formattingSettings.TextInput({
        name: "warehouseId",
        displayName: "SQL Warehouse ID  (optional)",
        description: "Direct mode only · Optional. When set the visual pre-warms your SQL Warehouse before sending questions, avoiding cold-start delays. Leave blank to let Databricks auto-start. Not used in Proxy or Databricks AI Gateway modes.",
        placeholder: "ENTER_WAREHOUSE_ID",
        value: ""
    });

    proxyKey = new formattingSettings.TextInput({
        name: "proxyKey",
        displayName: "Proxy Shared Secret  (optional)",
        description: "Proxy mode only · Optional. Shared secret sent as the proxy API-key header when your proxy requires authentication. Leave blank for local or open proxies.",
        placeholder: "(leave blank for local proxy)",
        value: ""
    });


    slices = [
        this.connectionMode,
        this.host,
        this.apiBaseUrl,
        this.assistantProfile,
        this.spaceId,
        this.token,
        this.warehouseId,
        this.proxyKey
    ];
}

// ─── Group 1c · Supervisor & Fusion ─────────────────────────────────────────
// Configure the "Brain" of the visual. In Multi-Space mode, the Supervisor
// synthesises multiple space answers into one unified narrative. In Supervisor
// Connection Mode, this points to a server-side AI supervisor orchestrator.
class SupervisorGroup extends FormattingSettingsGroup {
    name = "supervisor";
    displayName = "🧠 1c · AI Supervisor Agent";
    description = "Configure the supervisor logic. The supervisor synthesises answers from multiple AI workspaces into a single unified response (Fusion). You can customize the synthesis prompt and pick which space/profile performs the synthesis.";
    visible = false;

    supervisorEndpoint = new formattingSettings.TextInput({
        name: "supervisorEndpoint",
        displayName: "AI Supervisor Agent Endpoint",
        description: "Supervisor mode only. URL of the Databricks Mosaic AI serving endpoint that acts as the supervisor orchestrator. The proxy forwards questions here; the supervisor queries the appropriate AI workspaces and returns a unified answer.",
        placeholder: "https://dbc-xxx.cloud.databricks.com/serving-endpoints/pulseplay-supervisor/invocations",
        value: ""
    });

    supervisorAgentName = new formattingSettings.TextInput({
        name: "supervisorAgentName",
        displayName: "Supervisor Display Name",
        description: "The name shown in the visual header for the supervisor agent. Defaults to 'Supervisor'.",
        placeholder: "Supervisor",
        value: ""
    });

    supervisorSynthesisProfile = new formattingSettings.TextInput({
        name: "supervisorSynthesisProfile",
        displayName: "Synthesis Profile / Space ID",
        description: "The proxy profile or AI workspace ID used to perform the synthesis call. Defaults to the primary space ('space1'). Using a more capable model for synthesis can improve fusion quality.",
        placeholder: "space1",
        value: ""
    });

    supervisorAutoFusion = new formattingSettings.ToggleSwitch({
        name: "supervisorAutoFusion",
        displayName: "Auto-Fuse Synchronized Answers",
        description: "When ON, the visual automatically triggers the 'Fuse answers' step after all spaces in a sync-broadcast have responded. When OFF, the user must click '⚡ Fuse answers' manually.",
        value: false
    });

    supervisorSynthesisPrompt = new formattingSettings.TextArea({
        name: "supervisorSynthesisPrompt",
        displayName: "Synthesis / Fusion System Prompt",
        description: "The instructions used to guide the supervisor when synthesising multiple space answers. Use this to control the tone, structure, and detail of the final fused response.",
        placeholder: "Synthesise these answers into a single, complete response. Lead with a unified conclusion, highlight agreements, and preserve all numbers.",
        value: ""
    });

    slices = [
        this.supervisorEndpoint,
        this.supervisorAgentName,
        this.supervisorSynthesisProfile,
        this.supervisorAutoFusion,
        this.supervisorSynthesisPrompt
    ];
}

// ─── Group 2 · Security & Authentication ─────────────────────────────────────
// Declare the governance posture that applies to this report's data path.
// These toggles do NOT enforce anything — they tell the visual what to
// advertise in the header badge and to hint to Genie in the prompt context.
// Set Auth Mode to match how your proxy authenticates to Databricks.
class SecurityGroup extends FormattingSettingsGroup {
    name = "securityPosture";
    displayName = "🔒 2 · Security & Auth";
    description = "Declare the authentication model and Unity Catalog governance in place downstream of the AI. These controls update the header security badge and add governance hints to every AI prompt — they do not enforce access control on their own.";
    visible = false;

    authMode = new formattingSettings.ItemDropdown({
        name: "authMode",
        displayName: "Authentication Model",
        description: "Shared PAT: one Databricks identity serves all report viewers. Fastest to set up, suitable when all viewers should see the same data. — OAuth on-behalf-of: each request carries the viewer's BI platform identity; Unity Catalog row filters and column masks apply per user. Requires a proxy configured for token exchange (see Report Author Guide).",
        items: [
            { value: "sharedPat", displayName: "Shared PAT  —  single service identity  (default)" },
            { value: "oauthObo",  displayName: "OAuth on-behalf-of  —  per-viewer identity  (proxy v2)" }
        ],
        value: { value: "sharedPat", displayName: "Shared PAT  —  single service identity  (default)" }
    });

    ucRowFiltersEnforced = new formattingSettings.ToggleSwitch({
        name: "ucRowFiltersEnforced",
        displayName: "Unity Catalog Row Filters Active",
        description: "Turn ON when the Unity Catalog tables the AI reads have ROW FILTER functions applied (e.g. keyed on current_user()). This updates the header badge from 'Scope-only' to 'Row-filtered' and adds a per-user data access hint to every AI prompt.",
        value: false
    });

    ucColumnMasksEnforced = new formattingSettings.ToggleSwitch({
        name: "ucColumnMasksEnforced",
        displayName: "Unity Catalog Column Masks Active",
        description: "Turn ON when Unity Catalog column masks hide or redact restricted columns for non-privileged users. Updates the header badge and adds a column-governance hint to AI prompts.",
        value: false
    });

    // Wave 19 — runtime scope injection. These are ENFORCED at the prompt
    // layer: the visual prepends mandatory instructions to every Genie
    // request. Genie's own security still applies on top.
    runtimeForbiddenColumns = new formattingSettings.TextInput({
        name: "runtimeForbiddenColumns",
        displayName: "Forbidden Columns (runtime)",
        description: "Comma-separated column names the AI must never query or expose. Injected as a mandatory instruction into every Genie prompt. Example: email, phone_number, ssn.",
        value: "",
        placeholder: "e.g. email, phone_number, ssn"
    });

    runtimeMandatoryRowFilter = new formattingSettings.TextInput({
        name: "runtimeMandatoryRowFilter",
        displayName: "Mandatory Row Filter (runtime)",
        description: "SQL WHERE clause fragment the AI must always apply. Injected as a mandatory instruction. Example: region = 'APAC' or status != 'draft'.",
        value: "",
        placeholder: "e.g. region = 'APAC'"
    });

    runtimeReadOnlyEnforced = new formattingSettings.ToggleSwitch({
        name: "runtimeReadOnlyEnforced",
        displayName: "Enforce Read-Only SQL (runtime)",
        description: "When ON, the AI is instructed to use SELECT only. Any response containing INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/TRUNCATE is flagged with a warning banner. Does not prevent Databricks from executing DML — it instructs the model not to generate it.",
        value: false
    });

    // Legacy setup access allowlist (UX gate, NOT an
    // authorization gate). Comma-separated emails / UPNs / role labels;
    // when non-empty the retired Setup tab was visible ONLY to viewers whose bound
    // User Role / User Identity measure matches one of these entries.
    // Leave blank to fall through to the legacy `showSetupAccess` toggle
    // (Header & Layout group). PBI Desktop edit mode always bypasses this
    // gate so authors can't lock themselves out.
    setupAccessAllowedUsers = new formattingSettings.TextArea({
        name: "setupAccessAllowedUsers",
        displayName: "Setup Access Allowlist (optional)",
        description: "Legacy comma-separated emails / UPNs / role labels for the retired in-Console Setup tab. PulsePlay Settings is the active configuration surface.",
        placeholder: "alice@org.com, bob@org.com, GenieAuthors",
        value: ""
    });

    slices = [this.authMode, this.ucRowFiltersEnforced, this.ucColumnMasksEnforced,
              this.runtimeForbiddenColumns, this.runtimeMandatoryRowFilter, this.runtimeReadOnlyEnforced,
              this.setupAccessAllowedUsers];
}

// ─── Group 3 · Genie Instructions & Context ──────────────────────────────────
// Shape what Genie receives with every request. The field list validates your
// Power BI bindings against the Genie Space schema. Domain guidance carries
// business rules and KPIs. Turning off Report Context is the fastest privacy
// control — only the typed question and your instructions are sent.
class InstructionsGroup extends FormattingSettingsGroup {
    name = "instructions";
    displayName = "📋 3 · AI Instructions";
    description = "Control what the AI sees alongside each question: field schema hints, business rules, and whether active filter context from your BI platform (dimensions, measures, active filters) is included in the prompt.";
    visible = false;

    sendContextToGenie = new formattingSettings.ToggleSwitch({
        name: "sendContextToGenie",
        displayName: "Send BI Context to AI",
        description: "ON (default): bound dimensions, measures, and active filter values from your BI platform (Power BI, Tableau, Qlik, Looker, generic iframe) are included in every AI prompt — enables scope-aware answers. OFF: only the typed question and the Domain Instructions below are sent. Turn OFF for stricter data privacy or when context is not relevant.",
        value: true
    });

    genieFields = new formattingSettings.TextArea({
        name: "genieFields",
        displayName: "AI4PBI Fields  (optional override)",
        description: "Optional. Comma- or line-separated field names from your AI metric view. When filled, the visual checks whether the fields bound in Power BI match this list and shows an amber warning badge if they diverge. Aggregation prefixes like 'Sum of' are ignored, so 'Sum of Sales' matches 'sales'. Leave blank to skip validation.",
        placeholder: "Country, Region, Sales, Profit, Quantity",
        value: ""
    });

    domainGuidance = new formattingSettings.TextArea({
        name: "domainGuidance",
        displayName: "Domain-Specific Instructions  (optional)",
        description: "Business rules, KPI definitions, and query hints sent to the AI on the first turn of each session. Supports a '## Formatting Standards' markdown table to control how numbers appear in charts and tables. Cap ~8 000 characters (~3 pages). For longer, persistent guidance use the upstream AI workspace's own General Instructions in Databricks — it persists across reports and does not cost tokens per turn.",
        placeholder: "## Business Rules\n- Revenue = Net Sales after returns\n- Use FISCAL_YEAR not CALENDAR_YEAR\n\n## Formatting Standards\n| Range      | Format   | Example  |\n|------------|----------|----------|\n| < 1 000    | #,###.## | 567.89   |\n| ≥ 1 000    | #,###    | 12 345   |\n| ≥ 1 000 000 | #.#M    | 3.2M     |",
        value: ""
    });

    slices = [this.sendContextToGenie, this.genieFields, this.domainGuidance];
}

// ─── Group 4 · AI Insights ────────────────────────────────────────────────────
// Controls the AI Insights tab. Insights auto-fire when the visual loads;
// flip Apply / Refresh after editing any setting to re-run immediately.
class InsightsGroup extends FormattingSettingsGroup {
    name = "aiInsights";
    displayName = "✨ 4 · AI Insights";
    description = "Configure the AI Insights tab. Insights run automatically when the visual loads. Use the prompt field to focus on a specific business question, or leave blank for an auto-generated analytics summary.";
    visible = false;

    insightsPrompt = new formattingSettings.TextArea({
        name: "insightsPrompt",
        displayName: "Custom Insights Prompt  (advanced override)",
        description: "Power-user escape hatch. When set, this prompt is sent verbatim to the AI as a single call. For most use cases, leave blank and use Domain + Custom Sections (below) instead — those produce a portable, dataset-aware fast briefing.",
        placeholder: "(leave blank — prefer Domain + Custom Sections below for a portable, dataset-aware run)",
        value: ""
    });

    // 49.17 / IDEA-037 — Hybrid prompt: the visual auto-builds a portable,
    // dataset-aware briefing using Domain + Custom Sections. The
    // universal sections (HEADLINE, KPI SNAPSHOT, TRENDS, RISKS, RECOMMENDED
    // ACTIONS) are always emitted with the right domain vocabulary; Custom
    // Sections inject author-defined domain expertise in the middle.
    insightsDomain = new formattingSettings.TextInput({
        name: "insightsDomain",
        displayName: "Analytics Domain (optional · shapes tone)",
        description: "Short label naming the domain so the AI uses the right vocabulary in HEADLINE / TRENDS / RISKS / RECOMMENDED ACTIONS. Examples: 'Sales Performance', 'Supply Chain Operations', 'Hospital Operations', 'Customer Success', 'HR Analytics'. Leave blank for a generic 'analytics' framing.",
        placeholder: "e.g. Sales Performance · Supply Chain Operations · Hospital Operations",
        value: ""
    });

    insightsCustomSections = new formattingSettings.TextArea({
        name: "insightsCustomSections",
        displayName: "Custom Insights Sections  (JSON, optional)",
        description: "JSON array of { name, instruction } entries. Each becomes a domain-specific section in the AI Insights output, between TRENDS and RISKS. Example: [{\"name\":\"GAP ANALYSIS\",\"instruction\":\"Identify the largest gap between target and actual OTIF; bold the affected SKU family\"}]. Leave [] for universal sections only.",
        placeholder: "[]",
        value: "[]"
    });

    // IDEA-039 anomaly #3 — Insights-only domainGuidance override. When
    // non-empty this is used in place of the shared `domainGuidance` for
    // Insights stage prompts. Lets supervisor-mode pages keep Chat-flow
    // guidance ("fan out across helpers") in `domainGuidance` while pinning
    // Insights guidance ("single-space cross-domain summary, no helper
    // citations") here. Empty falls back to `domainGuidance` (full
    // backwards-compat for existing PBIPs).
    insightsDomainGuidance = new formattingSettings.TextArea({
        name: "insightsDomainGuidance",
        displayName: "AI Insights domain guidance  (optional override)",
        description: "Insights-only guidance that overrides the shared 'Business guidance' for AI Insights stage prompts. Useful when Chat-flow and Insights-flow need different framings — e.g. a supervisor space whose Chat fans out across helpers but whose Insights should stay single-space. Leave blank to inherit from the shared 'Business guidance'.",
        placeholder: "Leave blank to inherit from Business guidance",
        value: ""
    });

    // IDEA-039 anomalies #6 + #9 — metric direction rules. Author-defined
    // because each client/dataset has different inverted-good metrics and
    // threshold conventions. Free-text intentionally — examples in the
    // description. Injected verbatim into every Insights stage so the model
    // emits 🟢/🟡/🔴 emoji in pipe-table cells correctly.
    metricDirectionRules = new formattingSettings.TextArea({
        name: "metricDirectionRules",
        displayName: "Metric direction rules  (optional)",
        description: "Free-text rules describing inverted-good metrics and color thresholds. Used by AI Insights to color pipe-table cells with 🟢 / 🟡 / 🔴 status emoji per your domain. Examples: 'Return Rate: lower is better — 🟢 ≤2% 🟡 2-5% 🔴 >5%. Avg Days To Ship: lower is better. Margin %: 🟢 ≥15% 🟡 8-15% 🔴 <8%. NPS: 🟢 ≥50.' Default behaviour: higher is better.",
        placeholder: "e.g. Return Rate: lower is better. Margin %: 🟢 ≥15% 🟡 8-15% 🔴 <8%.",
        value: ""
    });

    insightsMetricDirections = new formattingSettings.TextArea({
        name: "insightsMetricDirections",
        displayName: "Metric direction map  (JSON)",
        description: "Structured renderer map for metric color semantics. JSON array of {name, higherIsBetter, aliases?, redPct?, amberPct?}. This lets the visual color KPI tiles and table cells deterministically even when the AI omits status emoji.",
        placeholder: "[{\"name\":\"Return Rate\",\"higherIsBetter\":false,\"aliases\":[\"Returns %\"],\"amberPct\":4,\"redPct\":8}]",
        value: ""
    });

    insightsShowProvenanceFooter = new formattingSettings.ToggleSwitch({
        name: "insightsShowProvenanceFooter",
        displayName: "Show AI provenance footer",
        description: "Adds a compact provenance footer to each Insights card (Generated by PulsePlay · source profile · last update). Useful for review and local production QA.",
        value: true
    });

    // IDEA-043 (Session 56) — universal-stage visibility + per-stage prompt
    // override. Authors edit these from PulsePlay Settings via the
    // "## HEADLINE / ## TRENDS / ## RISKS / ## RECOMMENDED ACTIONS" cards
    // (same Edit/Hide UI as custom sections). Persisted here so format-pane
    // round-trip preserves the values. Defaults preserve current behaviour:
    // all 4 stages visible, no prompt overrides.
    insightsShowHeadline = new formattingSettings.ToggleSwitch({
        name: "insightsShowHeadline",
        displayName: "Include HEADLINE + KPI SNAPSHOT stage",
        description: "When OFF, the AI Insights pipeline skips the HEADLINE + KPI SNAPSHOT stage. Edit from PulsePlay Settings.",
        value: true
    });
    insightsShowTrends = new formattingSettings.ToggleSwitch({
        name: "insightsShowTrends",
        displayName: "Include TRENDS stage",
        description: "When OFF, the AI Insights pipeline skips the TRENDS stage. Edit from PulsePlay Settings.",
        value: true
    });
    insightsShowRisks = new formattingSettings.ToggleSwitch({
        name: "insightsShowRisks",
        displayName: "Include RISKS stage",
        description: "When OFF, the AI Insights pipeline skips the RISKS stage. Edit from PulsePlay Settings.",
        value: true
    });
    insightsShowActions = new formattingSettings.ToggleSwitch({
        name: "insightsShowActions",
        displayName: "Include RECOMMENDED ACTIONS stage",
        description: "When OFF, the AI Insights pipeline skips the RECOMMENDED ACTIONS stage. Edit from PulsePlay Settings.",
        value: true
    });
    insightsHeadlineOverride = new formattingSettings.TextArea({
        name: "insightsHeadlineOverride",
        displayName: "HEADLINE custom instruction (override)",
        description: "Optional. When non-empty, replaces the built-in HEADLINE+KPI instruction with your own. Built-in default applies when blank.",
        placeholder: "",
        value: ""
    });
    insightsTrendsOverride = new formattingSettings.TextArea({
        name: "insightsTrendsOverride",
        displayName: "TRENDS custom instruction (override)",
        description: "Optional. When non-empty, replaces the built-in TRENDS instruction with your own.",
        placeholder: "",
        value: ""
    });
    insightsRisksOverride = new formattingSettings.TextArea({
        name: "insightsRisksOverride",
        displayName: "RISKS custom instruction (override)",
        description: "Optional. When non-empty, replaces the built-in RISKS instruction with your own.",
        placeholder: "",
        value: ""
    });
    insightsActionsOverride = new formattingSettings.TextArea({
        name: "insightsActionsOverride",
        displayName: "RECOMMENDED ACTIONS custom instruction (override)",
        description: "Optional. When non-empty, replaces the built-in RECOMMENDED ACTIONS instruction with your own.",
        placeholder: "",
        value: ""
    });

    /** 2026 — Show Genie Research Agent / Agent Mode reasoning traces when the
     *  response carries them. Databricks added `attachments[].reasoning_traces`
     *  on 2026-04-16; the visual surfaces it as a collapsible section above
     *  the regular content. Author can opt out via Settings → Preferences →
     *  Mix composition → Research Agent traces. Default true. */
    insightsShowResearchTraces = new formattingSettings.ToggleSwitch({
        name: "insightsShowResearchTraces",
        displayName: "Show Research Agent reasoning when present",
        description: "When a Genie message carries Research Agent / Agent Mode reasoning traces (Databricks 2026 API addition), render a collapsible section above the content. Off hides the section even when traces are present.",
        value: true
    });

    /** Phase E.1 — client-side progressive reveal of single-shot Genie
     *  answers. Default ON. Pure cosmetic — no extra LLM calls. */
    insightsStagedRevealEnabled = new formattingSettings.ToggleSwitch({
        name: "insightsStagedRevealEnabled",
        displayName: "Reveal briefing in stages",
        description: "Reveal the AI Insights briefing progressively (HEADLINE at 0s, KPI+TRENDS at 10s, RISKS+ACTIONS at 20s) instead of rendering everything at once. The full answer is already generated — this is pure cosmetic pacing. Honours the OS reduced-motion preference (instant-reveal).",
        value: true
    });

    // 49.19 / IDEA-037 phase 3 — Authoring mode radio. Drives which authoring
    // path the AI Insights pipeline takes: manual / preset / ai-assisted.
    insightsAuthoringMode = new formattingSettings.ItemDropdown({
        name: "insightsAuthoringMode",
        displayName: "AI Insights authoring mode",
        description: "Manual: write the prompt yourself (advanced). Preset: pick a Domain + Custom Sections from your authored config (default — works for most cases). AI-assisted: AI introspects bound data and pre-fills Domain + Custom Sections; you tune before running.",
        items: [
            { value: "preset",      displayName: "Preset — pick domain + sections (default)" },
            { value: "ai-assisted", displayName: "AI-assisted — auto-detect from data" },
            { value: "manual",      displayName: "Manual — write the prompt yourself" }
        ],
        value: { value: "preset", displayName: "Preset — pick domain + sections (default)" }
    });

    refreshInsights = new formattingSettings.ToggleSwitch({
        name: "refreshInsights",
        displayName: "↺  Apply / Refresh Insights",
        description: "Flip this toggle (ON → OFF or OFF → ON) after changing any setting to re-run AI Insights immediately. Acts as a manual refresh trigger — any state change re-fires the analysis with the current configuration.",
        value: false
    });

    // IDEA-009: configurable cache TTL. The default 30-min cache survives
    // PBI page-switches and theme-applies so users don't pay 5 stages of
    // Genie latency for an unchanged scope. Authors with fast-moving data
    // can shorten or disable it; authors with stable data can extend.
    // Stored in minutes; 0 = disabled.
    insightsCacheTtlMinutes = new formattingSettings.ItemDropdown({
        name: "insightsCacheTtlMinutes",
        displayName: "AI Insights cache TTL",
        description: "How long a generated AI Insights run is cached in memory + browser localStorage so PBI page-switches don't re-trigger the AI briefing. Default 30 minutes — set to 0 to disable caching for fast-moving data, or extend for stable scopes.",
        items: [
            { value: "0",   displayName: "Disabled (always re-run)" },
            { value: "5",   displayName: "5 minutes" },
            { value: "15",  displayName: "15 minutes" },
            { value: "30",  displayName: "30 minutes (default)" },
            { value: "60",  displayName: "1 hour" },
            { value: "120", displayName: "2 hours" }
        ],
        value: { value: "30", displayName: "30 minutes (default)" }
    });

    // IDEA-022: top-level feature gate. When only one feature is enabled
    // the header tab strip is hidden entirely; in chatOnly the auto-fire
    // insights effect is skipped so we don't spend Genie calls on a tab
    // that won't render. Edited from Settings › AI › AI Insights; kept
    // here so the format-pane round-trip preserves the value.
    enabledFeatures = new formattingSettings.ItemDropdown({
        name: "enabledFeatures",
        displayName: "Enabled features",
        description: "Which user-facing tabs the visual exposes. Both: AI Insights + Ask Pulse (default). AI Insights only: auto-generated analytics on load, no Ask Pulse tab. Ask Pulse only: conversational Q&A, no auto-insights. Edited from Settings › AI › AI Insights; the format-pane field is the persisted store.",
        items: [
            { value: "both",         displayName: "Both — AI Insights + Ask Pulse (default)" },
            { value: "insightsOnly", displayName: "AI Insights only — no Ask Pulse tab" },
            { value: "chatOnly",     displayName: "Ask Pulse only — no auto Insights" }
        ],
        value: { value: "both", displayName: "Both — AI Insights + Ask Pulse (default)" }
    });

    slices = [this.insightsAuthoringMode, this.insightsDomain, this.insightsCustomSections, this.insightsPrompt, this.insightsDomainGuidance, this.metricDirectionRules, this.insightsMetricDirections, this.insightsShowProvenanceFooter, this.insightsShowHeadline, this.insightsShowTrends, this.insightsShowRisks, this.insightsShowActions, this.insightsHeadlineOverride, this.insightsTrendsOverride, this.insightsRisksOverride, this.insightsActionsOverride, this.insightsShowResearchTraces, this.insightsStagedRevealEnabled, this.refreshInsights, this.insightsCacheTtlMinutes, this.enabledFeatures];
}

// ─── Group 5 · Appearance & Theme ────────────────────────────────────────────
// Pick a built-in theme to match your organisation's brand, then optionally
// override the accent colour, text colour, background, and font.
// Custom overrides are merged on top of the selected theme — only fill in the
// values you want to change.
class AppearanceGroup extends FormattingSettingsGroup {
    name = "appearance";
    displayName = "🎨 5 · Appearance & Theme";
    description = "Choose a visual theme that matches your organisation's brand. Use Custom Brand Overrides to apply specific colours or fonts without changing everything else.";

    useReportTheme = new formattingSettings.ToggleSwitch({
        name: "useReportTheme",
        displayName: "Use Report Theme (colours + fonts)",
        description: "When ON, the visual inherits the Power BI report theme colours (background, text, accent) AND fonts (header / body / accent typography) via host.colorPalette. Per-element FontControl overrides below are still respected. When OFF (default), the PulsePlay built-in theme below is used.",
        value: false
    });

    themeName = new formattingSettings.ItemDropdown({
        name: "themeName",
        displayName: "PulsePlay Theme",
        description: "Built-in themes tuned for different use cases. Default: clean light. Corporate Blue: Microsoft/enterprise palette. Forest: sustainability/ESG green. Slate Dark: dark mode for ops centres. High Contrast: WCAG AAA accessible. Custom: start from Default and apply your brand overrides below.",
        items: [
            { value: "default",        displayName: "Default  —  clean light" },
            { value: "corporate-blue", displayName: "Corporate Blue  —  enterprise" },
            { value: "forest",         displayName: "Forest  —  sustainability / ESG" },
            { value: "slate-dark",     displayName: "Slate Dark  —  ops / NOC" },
            { value: "high-contrast",  displayName: "High Contrast  —  WCAG AAA" },
            { value: "custom",         displayName: "Custom  —  use brand overrides below" }
        ],
        value: { value: "default", displayName: "Default  —  clean light" }
    });

    darkMode = new formattingSettings.ToggleSwitch({
        name: "darkMode",
        displayName: "Dark Mode Override",
        description: "Force dark mode regardless of the selected theme. When ON, overrides light themes (Default, Corporate Blue, Forest) with a dark background. The Slate Dark theme is always dark — this toggle adds no effect there.",
        value: false
    });

    brandAccentColor = new formattingSettings.TextInput({
        name: "brandAccentColor",
        displayName: "Brand Accent Colour  (optional)",
        description: "Override the primary accent colour used for buttons, active tabs, send button, chart fills, and links. Enter a hex value e.g. #E63329 for red, #F7941D for orange. Leave blank to use the selected theme's accent.",
        placeholder: "#1a6fd4",
        value: ""
    });

    brandTextColor = new formattingSettings.TextInput({
        name: "brandTextColor",
        displayName: "Brand Text Colour  (optional)",
        description: "Override the primary text colour. Leave blank to use the theme default. Ensure at least 4.5:1 contrast ratio against your background colour (WCAG AA).",
        placeholder: "#1a1f24",
        value: ""
    });

    brandBgColor = new formattingSettings.TextInput({
        name: "brandBgColor",
        displayName: "Brand Background Colour  (optional)",
        description: "Override the canvas background colour. Leave blank to use the theme default. Works best with light colours — for dark backgrounds use Slate Dark theme instead.",
        placeholder: "#f3f5f8",
        value: ""
    });

    brandFontFamily = new formattingSettings.TextInput({
        name: "brandFontFamily",
        displayName: "Brand Font Family  (optional)",
        description: "Override the font stack. Must be a font already available in Power BI Desktop or your browser. Examples: 'Arial, sans-serif' or 'Georgia, serif'. Leave blank to use Segoe UI (default).",
        placeholder: '"Segoe UI", sans-serif',
        value: ""
    });

    // ─── Wave 44 — Power BI theme inheritance + per-element typography ─────
    // CONSOLIDATED in cycle-13 patch: the existing `useReportTheme` toggle
    // (above, line 770) is the SINGLE source of truth — its description was
    // updated to cover BOTH colours AND fonts. The 3 FontControl slices
    // below are independent overrides that work in either theme mode.
    headerTypography = new formattingSettings.FontControl({
        name: "headerTypography",
        displayName: "Header typography",
        description: "Font used for the visual's internal header title. Leave font family blank to inherit from the theme / Segoe UI default.",
        fontFamily: new formattingSettings.FontPicker({
            name: "headerFontFamily",
            displayName: "Header font",
            value: ""
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "headerFontSize",
            displayName: "Header size (pt)",
            value: 18
        }),
        bold: new formattingSettings.ToggleSwitch({
            name: "headerBold",
            displayName: "Header bold",
            value: true
        }),
        italic: new formattingSettings.ToggleSwitch({
            name: "headerItalic",
            displayName: "Header italic",
            value: false
        })
    });

    bodyTypography = new formattingSettings.FontControl({
        name: "bodyTypography",
        displayName: "Body typography",
        description: "Font used for chat bubbles, AI Insights paragraphs, and most reading copy. Default 14pt regular weight.",
        fontFamily: new formattingSettings.FontPicker({
            name: "bodyFontFamily",
            displayName: "Body font",
            value: ""
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "bodyFontSize",
            displayName: "Body size (pt)",
            value: 14
        }),
        bold: new formattingSettings.ToggleSwitch({
            name: "bodyBold",
            displayName: "Body bold",
            value: false
        }),
        italic: new formattingSettings.ToggleSwitch({
            name: "bodyItalic",
            displayName: "Body italic",
            value: false
        })
    });

    accentTypography = new formattingSettings.FontControl({
        name: "accentTypography",
        displayName: "Accent typography",
        description: "Font used for hero numbers, KPI tiles, and headline figures. Default 28pt bold.",
        fontFamily: new formattingSettings.FontPicker({
            name: "accentFontFamily",
            displayName: "Accent font",
            value: ""
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "accentFontSize",
            displayName: "Accent size (pt)",
            value: 28
        }),
        bold: new formattingSettings.ToggleSwitch({
            name: "accentBold",
            displayName: "Accent bold",
            value: true
        }),
        italic: new formattingSettings.ToggleSwitch({
            name: "accentItalic",
            displayName: "Accent italic",
            value: false
        })
    });

    slices = [
        this.useReportTheme,
        this.themeName,
        this.darkMode,
        this.brandAccentColor,
        this.brandTextColor,
        this.brandBgColor,
        this.brandFontFamily,
        // Wave 44 additions — per-element FontControls (theme inheritance
        // is gated by useReportTheme above; consolidated cycle-13 patch).
        this.headerTypography,
        this.bodyTypography,
        this.accentTypography
    ];
}

// ─── Group 5a · Header & Layout ──────────────────────────────────────────────
// Brand the visual's internal header and control how it adapts to narrow panes.
// Title / Subtitle override the default "AI Assistant" label. UI Scale and
// Compact Mode let report authors trade density for readability without
// editing CSS.
class HeaderGroup extends FormattingSettingsGroup {
    name = "header";
    displayName = "🧭 5a · Header & Layout";
    description = "Brand the visual's internal header and control how it adapts to narrow panes. Title and Subtitle override the default label. UI Scale and Compact Mode trade density for readability.";

    headerTitle = new formattingSettings.TextInput({
        name: "headerTitle",
        displayName: "Internal Header Title  (optional)",
        description: "Optional override for the visual's internal header. Leave blank when Power BI's standard Visual Title above the visual is enabled — duplicating it inside the frame is noisy. Set this when you have hidden the standard title and still want a label in the internal header (e.g. 'Sales Copilot', 'HSE Insights'). Power BI's standard Title is host-rendered and cannot be read from a custom visual.",
        placeholder: "(blank — host title is used)",
        value: ""
    });

    headerSubtitle = new formattingSettings.TextInput({
        name: "headerSubtitle",
        displayName: "Internal Header Subtitle  (optional)",
        description: "Optional secondary line shown beneath the Internal Header Title. Use for a tagline, scope reminder, or environment label (e.g. 'Q3 review', 'Production'). Leave blank to hide. Like the title above, this is an internal override — the standard Power BI Subtitle is host-rendered.",
        placeholder: "(hidden when blank)",
        value: ""
    });

    uiScale = new formattingSettings.ItemDropdown({
        name: "uiScale",
        displayName: "UI Scale",
        description: "Adjust font sizes and spacing density. Small condenses the layout for narrow visual panes. Large is friendlier for accessibility or presentation displays. Implemented in Phase C.",
        items: [
            { value: "small",  displayName: "Small  —  compact density" },
            { value: "normal", displayName: "Normal  —  default" },
            { value: "large",  displayName: "Large  —  presentation / accessibility" }
        ],
        value: { value: "normal", displayName: "Normal  —  default" }
    });

    compactMode = new formattingSettings.ItemDropdown({
        name: "compactMode",
        displayName: "Compact Mode",
        description: "Auto: collapse the header automatically when the visual is narrow (default). On: always render the compact layout (icon-only chips, dropdown space selector). Off: never compact, even on narrow panes. Implemented in Phase B.",
        items: [
            { value: "auto", displayName: "Auto  —  responsive  (default)" },
            { value: "on",   displayName: "On  —  always compact" },
            { value: "off",  displayName: "Off  —  never compact" }
        ],
        value: { value: "auto", displayName: "Auto  —  responsive  (default)" }
    });

    showSetupAccess = new formattingSettings.ToggleSwitch({
        name: "showSetupAccess",
        displayName: "Legacy setup gate",
        description: "Legacy flag for the retired in-Console Setup tab. PulsePlay Settings is now the canonical configuration surface.",
        value: false
    });

    // Wave 30 — show/hide the visual's internal title row (icon + Header Title
    // + Header Subtitle). Default ON for backward-compat. When OFF, the title
    // block is suppressed; the Console button, Adjust dropdown,
    // toolbar (CSV / refresh / step indicator), and tab strip all remain
    // visible. Useful when the report already has a card title above the
    // visual and the duplicate header looks cluttered.
    showHeader = new formattingSettings.ToggleSwitch({
        name: "showHeader",
        displayName: "Show Visual Header",
        description: "When ON (default), the visual shows its own title row (icon + Header Title + Header Subtitle) at the top. When OFF, that block is hidden — useful when the surrounding report already provides a title. The Console button, toolbar, and tab strip stay visible in both states.",
        value: true
    });

    // Wave 30 cycle 3 — header icon style picker. Six inline SVG presets;
    // "none" hides just the icon while keeping the title text. All inline
    // SVGs (no remote URLs, no file upload) keep the PBI sandbox happy.
    headerIconStyle = new formattingSettings.ItemDropdown({
        name: "headerIconStyle",
        displayName: "Header Icon",
        description: "The icon shown to the left of the Header Title. 'Default' is the original chat-bubble + sparkle. Pick a different shape for brand variety, or 'None' to hide the icon entirely while keeping the title text.",
        items: [
            { value: "default", displayName: "Chat bubble + sparkle  (default)" },
            { value: "chat",    displayName: "Chat bubble (plain)" },
            { value: "sparkle", displayName: "Sparkle / star" },
            { value: "brain",   displayName: "Brain / mind" },
            { value: "bolt",    displayName: "Bolt / lightning" },
            { value: "none",    displayName: "None  —  hide the icon" }
        ],
        value: { value: "default", displayName: "Chat bubble + sparkle  (default)" }
    });

    slices = [this.headerTitle, this.headerSubtitle, this.uiScale, this.compactMode, this.showSetupAccess, this.showHeader, this.headerIconStyle];
}

// ─── Group 6 · Analytics Knowledge Base ──────────────────────────────────────
// The visual ships with an embedded analytics intelligence layer (chart
// selection rules, statistical standards, reporting best practices) that is
// injected into every Genie prompt. Toggle sections off to reduce token usage
// or when your domain guidance already covers these rules.
class KnowledgeBaseGroup extends FormattingSettingsGroup {
    name = "knowledgeBase";
    displayName = "🧠 6 · Analytics Knowledge Base";
    description = "Built-in analytics intelligence injected into every AI prompt. Helps the AI choose the right chart type, apply statistical best practices, and structure responses following reporting standards. Toggle off sections to reduce prompt size if needed.";
    visible = false;

    kbEnabled = new formattingSettings.ToggleSwitch({
        name: "kbEnabled",
        displayName: "Enable Analytics Intelligence",
        description: "When ON, the visual injects analytics best-practice rules into AI prompts — improving chart recommendations, statistical accuracy, and response structure. Turn OFF to send only your domain guidance and report context.",
        value: true
    });

    kbChartRules = new formattingSettings.ToggleSwitch({
        name: "kbChartRules",
        displayName: "Chart Selection Rules",
        description: "Inject chart-type decision rules: which chart to use for comparison, composition, distribution, correlation, flow. Helps the AI recommend the right visualisation when asked.",
        value: true
    });

    kbStatRules = new formattingSettings.ToggleSwitch({
        name: "kbStatRules",
        displayName: "Statistical Standards",
        description: "Inject statistical best practices: mean vs median, outlier detection, YoY calculation, percentage-point vs % distinction, moving averages. Reduces common data communication errors.",
        value: true
    });

    kbReportingRules = new formattingSettings.ToggleSwitch({
        name: "kbReportingRules",
        displayName: "Reporting & Storytelling Standards",
        description: "Inject reporting principles: BLUF (bottom line up front), KPI context requirements, precision rules, annotation standards. Improves the structure and actionability of AI Insights.",
        value: true
    });

    slices = [this.kbEnabled, this.kbChartRules, this.kbStatRules, this.kbReportingRules];
}

// ─── Group 7 · Developer & Diagnostics ───────────────────────────────────────
// Power-user panel. Keep all toggles OFF for end-user reports. Turn on
// Developer Mode to open the on-canvas diagnostics panel for troubleshooting
// connection issues, inspecting the context payload, or reviewing SQL.
class DeveloperGroup extends FormattingSettingsGroup {
    name = "developer";
    displayName = "🛠 7 · Developer & Diagnostics";
    description = "Power-user tools for building, testing, and troubleshooting. Keep all OFF for published end-user reports. Developer Mode reveals the on-canvas diagnostics panel with connection status, context preview, and routing detail.";
    visible = false;

    devMode = new formattingSettings.ToggleSwitch({
        name: "devMode",
        displayName: "Developer Mode",
        description: "Shows the on-canvas diagnostics panel with setup guidance, context payload preview, routing info, and orchestration trace. Essential for debugging — turn OFF before publishing to end users.",
        value: false
    });

    showSql = new formattingSettings.ToggleSwitch({
        name: "showSql",
        displayName: "Show Generated SQL",
        description: "Renders the </> View SQL icon on each AI Insights section card. Opens a collapsible panel beneath the section with the SQL Genie generated. PulsePlay defaults this ON because the playground audience is authors debugging connectors and demoing the assistant; hide it via this toggle if you're embedding for end-users who shouldn't see raw SQL. Has no effect when Connection Mode is Azure OpenAI or AWS Bedrock.",
        value: true
    });

    showTrace = new formattingSettings.ToggleSwitch({
        name: "showTrace",
        displayName: "Show Routing Trace",
        description: "Surfaces proxy routing and orchestration trace details alongside each response. Only meaningful in Proxy mode — ignored in Direct mode.",
        value: false
    });

    // Cycle 44 (B) — configurable per-stage validation retry count.
    // The cycle 23 validator detects when an AI Insights stage doesn't
    // follow its format contract (RECOMMENDED ACTIONS as prose, RISKS
    // as a single bullet, etc.) and triggers automatic retries with a
    // stronger directive. Default 1 = single retry (cycle 23 default).
    // Raise to 2 or 3 for higher reliability at the cost of additional
    // latency on failed stages (~10-25s per retry). 0 disables auto-retry
    // entirely (the inline banner + manual ↻ retry button still work).
    insightsValidationRetryCount = new formattingSettings.ItemDropdown({
        name: "insightsValidationRetryCount",
        displayName: "AI Insights validation retries",
        description: "Number of times to auto-retry an AI Insights stage when its output doesn't match the format contract (e.g., RECOMMENDED ACTIONS came back as prose instead of numbered actions). Default 1 = single retry (existing behaviour). Raise for more reliability; each retry adds ~10-25s on failed stages. 0 disables auto-retry — the inline warning banner + manual ↻ retry button still appear.",
        items: [
            { value: "0", displayName: "0 — disable auto-retry (manual only)" },
            { value: "1", displayName: "1 — single retry (default)" },
            { value: "2", displayName: "2 — two retries" },
            { value: "3", displayName: "3 — three retries (max)" }
        ],
        value: { value: "1", displayName: "1 — single retry (default)" }
    });

    // Cycle 44 (C, opt-in) — connector-compatibility warnings. When ON,
    // the visual surfaces inline warnings when settings are configured
    // for one connector but the active mode doesn't support them
    // (e.g., Custom SQL sections require Databricks Genie via proxy or
    // direct; they no-op on Azure OpenAI / Bedrock paths). Default OFF
    // so existing setups aren't bothered.
    showConnectorCompatibilityWarnings = new formattingSettings.ToggleSwitch({
        name: "showConnectorCompatibilityWarnings",
        displayName: "Show connector compatibility warnings",
        description: "When ON, the visual surfaces warnings when settings are configured for one connector but the active backend doesn't support them. Example: Custom SQL sections require Databricks Genie; they no-op on Azure OpenAI / Bedrock paths. Default OFF.",
        value: false
    });

    showGuidedFilters = new formattingSettings.ToggleSwitch({
        name: "showGuidedFilters",
        displayName: "Show Guided Filter Bar",
        description: "Displays a filter selector bar below the chat area, letting report authors scope questions by dimension (region, time, segment, etc.). Intended for authoring and testing — consider hiding for end users.",
        value: false
    });

    allowReportActions = new formattingSettings.ToggleSwitch({
        name: "allowReportActions",
        displayName: "Allow Visual to Apply Report Filters",
        description: "When ON, guided filter selections inside the visual can push filters to the surrounding BI report or dashboard (Power BI, Tableau, Qlik, Looker). When OFF, filters affect only the AI context — the BI surface stays unchanged.",
        value: true
    });

    slices = [
        this.devMode,
        this.showSql,
        this.showTrace,
        this.insightsValidationRetryCount,
        this.showConnectorCompatibilityWarnings,
        this.showGuidedFilters,
        this.allowReportActions
    ];
}

// ─── Group 7b · Advanced (hidden, internal flags) ────────────────────────────
// Internal toggles that aren't surfaced in the format pane. Each slice is a
// primitive backing store for an in-visual UX decision (e.g. "did the author
// dismiss the first-time wizard?"). visible:false at the group level so the
// format pane never lists these — they are read/written by visual.tsx via
// host.persistProperties only.
class AdvancedGroup extends FormattingSettingsGroup {
    name = "advanced";
    displayName = "Advanced (internal)";
    description = "Internal flags managed by the in-visual UI.";
    visible = false;

    // Wave 32 — first-time setup wizard dismissal flag.
    // True once the author skipped the wizard. Drives gating in App so the
    // wizard never re-appears on subsequent renders. Defaults to false; the
    // wizard self-gates via spaceId/host being unset, so existing visuals
    // never see it even with this flag at its default.
    wizardDismissed = new formattingSettings.ToggleSwitch({
        name: "wizardDismissed",
        displayName: "First-time wizard dismissed",
        description: "True once the author skipped the first-time setup wizard.",
        value: false
    });

    slices = [this.wizardDismissed];
}

// ─── Group 8 · Genie Space Sync (Section G) ──────────────────────────────────
// Local edits to upstream Genie space text_instructions / sample_questions /
// example_question_sqls — round-tripped through persistProperties as JSON
// strings because the format pane only accepts primitives. Edited from the
// Former Setup Section G; never shown in the format pane (visible: false).
class GenieSpaceSyncGroup extends FormattingSettingsGroup {
    name = "genieSpaceSync";
    displayName = "🔁 8 · AI Workspace Sync";
    description = "Local edits to the upstream AI workspace (text instructions, sample questions, trusted SQL examples). Stored as JSON strings.";
    visible = false;

    genieTextInstructionsJson = new formattingSettings.TextInput({
        name: "genieTextInstructionsJson",
        displayName: "AI text instructions (JSON)",
        description: "JSON-stringified array of {id, content[]} entries.",
        placeholder: "[]",
        value: ""
    });

    genieSampleQuestionsJson = new formattingSettings.TextInput({
        name: "genieSampleQuestionsJson",
        displayName: "AI sample questions (JSON)",
        description: "JSON-stringified array of {id, question[]} entries.",
        placeholder: "[]",
        value: ""
    });

    genieExampleSqlsJson = new formattingSettings.TextInput({
        name: "genieExampleSqlsJson",
        displayName: "AI example SQLs (JSON)",
        description: "JSON-stringified array of trusted SQL example entries.",
        placeholder: "[]",
        value: ""
    });

    lastSpaceSyncAt = new formattingSettings.NumUpDown({
        name: "lastSpaceSyncAt",
        displayName: "Last space sync (epoch ms)",
        description: "Timestamp of the last write-through to the upstream AI workspace. 0 = never written.",
        value: 0
    });

    slices = [
        this.genieTextInstructionsJson,
        this.genieSampleQuestionsJson,
        this.genieExampleSqlsJson,
        this.lastSpaceSyncAt
    ];
}

// ─── Group 1b · Additional Spaces ────────────────────────────────────────────
// Each additional space is activated by filling in its Label field. Spaces
// share the primary Connection Mode, Proxy URL, and proxy key; only the
// profile name, Space ID, host, and token can vary per space.
class MultiSpaceGroup extends FormattingSettingsGroup {
    name = "multiSpace";
    displayName = "🔗 1b · Additional Spaces";
    description = "Connect to up to 9 additional AI workspaces (10 total counting the primary). Set a Label to activate each space — it appears as a tab in the visual header. All spaces share the same Connection Mode and Proxy URL. Leave Host and Token blank to inherit from the primary connection.";
    visible = false;

    multiSpaceEnabled = new formattingSettings.ToggleSwitch({
        name: "multiSpaceEnabled",
        displayName: "Enable Multiple Spaces",
        description: "When ON, a space selector appears in the visual header. Each space maintains completely independent conversation history. Turn OFF to restore single-space mode without losing settings.",
        value: false
    });

    // IDEA-011: count picker for additional helper slots. The primary
    // space is always present; this drives how many extras are active
    // in Settings-backed multi-space configuration. Values above the configured count are
    // ignored at runtime even if their fields are populated, so toggling
    // the count down doesn't lose configured slot data.
    multiSpaceCount = new formattingSettings.ItemDropdown({
        name: "multiSpaceCount",
        displayName: "Additional Spaces (count)",
        description: "How many additional AI workspaces to expose (1-9, primary excluded). Settings reveals only the matching number of slots so authors aren't overwhelmed with empty fields. Defaults to 3 for compatibility with existing reports.",
        items: [
            { value: "1", displayName: "1 additional" },
            { value: "2", displayName: "2 additional" },
            { value: "3", displayName: "3 additional" },
            { value: "4", displayName: "4 additional" },
            { value: "5", displayName: "5 additional" },
            { value: "6", displayName: "6 additional" },
            { value: "7", displayName: "7 additional" },
            { value: "8", displayName: "8 additional" },
            { value: "9", displayName: "9 additional" }
        ],
        value: { value: "3", displayName: "3 additional" }
    });

    // ── Space 2 ──
    space2Label = new formattingSettings.TextInput({
        name: "space2Label",
        displayName: "Space 2 · Label",
        description: "Short display name shown in the space selector tab (e.g. 'Customer', 'HSE', 'Finance'). Leave blank to disable Space 2.",
        placeholder: "e.g. Customer",
        value: ""
    });
    space2AssistantProfile = new formattingSettings.TextInput({
        name: "space2AssistantProfile",
        displayName: "Space 2 · Proxy Profile",
        description: "Proxy profile name for Space 2 (matches a key in proxy config.json). Leave blank to use the default profile.",
        placeholder: "default",
        value: ""
    });
    space2SpaceId = new formattingSettings.TextInput({
        name: "space2SpaceId",
        displayName: "Space 2 · AI Workspace ID",
        description: "AI workspace identifier for Direct or Gateway mode. In Proxy mode the profile carries this — leave blank.",
        placeholder: "01f1••••••••••••••••••••••••••••",
        value: ""
    });
    space2Host = new formattingSettings.TextInput({
        name: "space2Host",
        displayName: "Space 2 · Workspace URL  (optional)",
        description: "Leave blank to use the primary Databricks Workspace URL.",
        placeholder: "(inherits primary)",
        value: ""
    });
    space2Token = new formattingSettings.TextInput({
        name: "space2Token",
        displayName: "Space 2 · Access Token  (optional)",
        description: "Leave blank to use the primary Access Token. Direct mode only.",
        placeholder: "(inherits primary)",
        value: ""
    });

    // ── Space 3 ──
    space3Label = new formattingSettings.TextInput({
        name: "space3Label",
        displayName: "Space 3 · Label",
        description: "Short display name shown in the space selector tab. Leave blank to disable Space 3.",
        placeholder: "e.g. Finance",
        value: ""
    });
    space3AssistantProfile = new formattingSettings.TextInput({
        name: "space3AssistantProfile",
        displayName: "Space 3 · Proxy Profile",
        description: "Proxy profile name for Space 3. Leave blank to use the default profile.",
        placeholder: "default",
        value: ""
    });
    space3SpaceId = new formattingSettings.TextInput({
        name: "space3SpaceId",
        displayName: "Space 3 · AI Workspace ID",
        description: "AI workspace identifier for Direct or Gateway mode. Leave blank in Proxy mode.",
        placeholder: "01f1••••••••••••••••••••••••••••",
        value: ""
    });
    space3Host = new formattingSettings.TextInput({
        name: "space3Host",
        displayName: "Space 3 · Workspace URL  (optional)",
        description: "Leave blank to inherit from the primary connection.",
        placeholder: "(inherits primary)",
        value: ""
    });
    space3Token = new formattingSettings.TextInput({
        name: "space3Token",
        displayName: "Space 3 · Access Token  (optional)",
        description: "Leave blank to inherit the primary Access Token. Direct mode only.",
        placeholder: "(inherits primary)",
        value: ""
    });

    // ── Space 4 ──
    space4Label = new formattingSettings.TextInput({
        name: "space4Label",
        displayName: "Space 4 · Label",
        description: "Short display name shown in the space selector tab. Leave blank to disable Space 4.",
        placeholder: "e.g. Operations",
        value: ""
    });
    space4AssistantProfile = new formattingSettings.TextInput({
        name: "space4AssistantProfile",
        displayName: "Space 4 · Proxy Profile",
        description: "Proxy profile name for Space 4. Leave blank to use the default profile.",
        placeholder: "default",
        value: ""
    });
    space4SpaceId = new formattingSettings.TextInput({
        name: "space4SpaceId",
        displayName: "Space 4 · AI Workspace ID",
        description: "AI workspace identifier for Direct or Gateway mode. Leave blank in Proxy mode.",
        placeholder: "01f1••••••••••••••••••••••••••••",
        value: ""
    });
    space4Host = new formattingSettings.TextInput({
        name: "space4Host",
        displayName: "Space 4 · Workspace URL  (optional)",
        description: "Leave blank to inherit from the primary connection.",
        placeholder: "(inherits primary)",
        value: ""
    });
    space4Token = new formattingSettings.TextInput({
        name: "space4Token",
        displayName: "Space 4 · Access Token  (optional)",
        description: "Leave blank to inherit the primary Access Token. Direct mode only.",
        placeholder: "(inherits primary)",
        value: ""
    });

    // ── Spaces 5-9 (IDEA-011 picker slots) ──
    // The slots beyond Space 4 follow the same shape. Names are stable so
    // the format-pane storage round-trips even if a future change reduces
    // the on-screen count. visible: false on the group keeps these out of
    // the format pane (operational settings live in Setup).
    space5Label = new formattingSettings.TextInput({ name: "space5Label", displayName: "Space 5 · Label", description: "Short display name. Leave blank to disable Space 5.", placeholder: "e.g. Compliance", value: "" });
    space5AssistantProfile = new formattingSettings.TextInput({ name: "space5AssistantProfile", displayName: "Space 5 · Proxy Profile", description: "Proxy profile name. Leave blank for the default.", placeholder: "default", value: "" });
    space5SpaceId = new formattingSettings.TextInput({ name: "space5SpaceId", displayName: "Space 5 · AI Workspace ID", description: "Direct/Gateway only.", placeholder: "01f1••••••••••••••••••••••••••••", value: "" });
    space5Host = new formattingSettings.TextInput({ name: "space5Host", displayName: "Space 5 · Workspace URL  (optional)", description: "Inherits primary if blank.", placeholder: "(inherits primary)", value: "" });
    space5Token = new formattingSettings.TextInput({ name: "space5Token", displayName: "Space 5 · Access Token  (optional)", description: "Inherits primary if blank. Direct mode only.", placeholder: "(inherits primary)", value: "" });

    space6Label = new formattingSettings.TextInput({ name: "space6Label", displayName: "Space 6 · Label", description: "Short display name. Leave blank to disable Space 6.", placeholder: "e.g. Marketing", value: "" });
    space6AssistantProfile = new formattingSettings.TextInput({ name: "space6AssistantProfile", displayName: "Space 6 · Proxy Profile", description: "Proxy profile name. Leave blank for the default.", placeholder: "default", value: "" });
    space6SpaceId = new formattingSettings.TextInput({ name: "space6SpaceId", displayName: "Space 6 · AI Workspace ID", description: "Direct/Gateway only.", placeholder: "01f1••••••••••••••••••••••••••••", value: "" });
    space6Host = new formattingSettings.TextInput({ name: "space6Host", displayName: "Space 6 · Workspace URL  (optional)", description: "Inherits primary if blank.", placeholder: "(inherits primary)", value: "" });
    space6Token = new formattingSettings.TextInput({ name: "space6Token", displayName: "Space 6 · Access Token  (optional)", description: "Inherits primary if blank. Direct mode only.", placeholder: "(inherits primary)", value: "" });

    space7Label = new formattingSettings.TextInput({ name: "space7Label", displayName: "Space 7 · Label", description: "Short display name. Leave blank to disable Space 7.", placeholder: "e.g. Logistics", value: "" });
    space7AssistantProfile = new formattingSettings.TextInput({ name: "space7AssistantProfile", displayName: "Space 7 · Proxy Profile", description: "Proxy profile name. Leave blank for the default.", placeholder: "default", value: "" });
    space7SpaceId = new formattingSettings.TextInput({ name: "space7SpaceId", displayName: "Space 7 · AI Workspace ID", description: "Direct/Gateway only.", placeholder: "01f1••••••••••••••••••••••••••••", value: "" });
    space7Host = new formattingSettings.TextInput({ name: "space7Host", displayName: "Space 7 · Workspace URL  (optional)", description: "Inherits primary if blank.", placeholder: "(inherits primary)", value: "" });
    space7Token = new formattingSettings.TextInput({ name: "space7Token", displayName: "Space 7 · Access Token  (optional)", description: "Inherits primary if blank. Direct mode only.", placeholder: "(inherits primary)", value: "" });

    space8Label = new formattingSettings.TextInput({ name: "space8Label", displayName: "Space 8 · Label", description: "Short display name. Leave blank to disable Space 8.", placeholder: "e.g. Quality", value: "" });
    space8AssistantProfile = new formattingSettings.TextInput({ name: "space8AssistantProfile", displayName: "Space 8 · Proxy Profile", description: "Proxy profile name. Leave blank for the default.", placeholder: "default", value: "" });
    space8SpaceId = new formattingSettings.TextInput({ name: "space8SpaceId", displayName: "Space 8 · AI Workspace ID", description: "Direct/Gateway only.", placeholder: "01f1••••••••••••••••••••••••••••", value: "" });
    space8Host = new formattingSettings.TextInput({ name: "space8Host", displayName: "Space 8 · Workspace URL  (optional)", description: "Inherits primary if blank.", placeholder: "(inherits primary)", value: "" });
    space8Token = new formattingSettings.TextInput({ name: "space8Token", displayName: "Space 8 · Access Token  (optional)", description: "Inherits primary if blank. Direct mode only.", placeholder: "(inherits primary)", value: "" });

    space9Label = new formattingSettings.TextInput({ name: "space9Label", displayName: "Space 9 · Label", description: "Short display name. Leave blank to disable Space 9.", placeholder: "e.g. R&D", value: "" });
    space9AssistantProfile = new formattingSettings.TextInput({ name: "space9AssistantProfile", displayName: "Space 9 · Proxy Profile", description: "Proxy profile name. Leave blank for the default.", placeholder: "default", value: "" });
    space9SpaceId = new formattingSettings.TextInput({ name: "space9SpaceId", displayName: "Space 9 · AI Workspace ID", description: "Direct/Gateway only.", placeholder: "01f1••••••••••••••••••••••••••••", value: "" });
    space9Host = new formattingSettings.TextInput({ name: "space9Host", displayName: "Space 9 · Workspace URL  (optional)", description: "Inherits primary if blank.", placeholder: "(inherits primary)", value: "" });
    space9Token = new formattingSettings.TextInput({ name: "space9Token", displayName: "Space 9 · Access Token  (optional)", description: "Inherits primary if blank. Direct mode only.", placeholder: "(inherits primary)", value: "" });

    space10Label = new formattingSettings.TextInput({ name: "space10Label", displayName: "Space 10 · Label", description: "Short display name. Leave blank to disable Space 10.", placeholder: "e.g. Strategy", value: "" });
    space10AssistantProfile = new formattingSettings.TextInput({ name: "space10AssistantProfile", displayName: "Space 10 · Proxy Profile", description: "Proxy profile name. Leave blank for the default.", placeholder: "default", value: "" });
    space10SpaceId = new formattingSettings.TextInput({ name: "space10SpaceId", displayName: "Space 10 · AI Workspace ID", description: "Direct/Gateway only.", placeholder: "01f1••••••••••••••••••••••••••••", value: "" });
    space10Host = new formattingSettings.TextInput({ name: "space10Host", displayName: "Space 10 · Workspace URL  (optional)", description: "Inherits primary if blank.", placeholder: "(inherits primary)", value: "" });
    space10Token = new formattingSettings.TextInput({ name: "space10Token", displayName: "Space 10 · Access Token  (optional)", description: "Inherits primary if blank. Direct mode only.", placeholder: "(inherits primary)", value: "" });

    slices = [
        this.multiSpaceEnabled,
        this.multiSpaceCount,
        this.space2Label, this.space2AssistantProfile, this.space2SpaceId, this.space2Host, this.space2Token,
        this.space3Label, this.space3AssistantProfile, this.space3SpaceId, this.space3Host, this.space3Token,
        this.space4Label, this.space4AssistantProfile, this.space4SpaceId, this.space4Host, this.space4Token,
        this.space5Label, this.space5AssistantProfile, this.space5SpaceId, this.space5Host, this.space5Token,
        this.space6Label, this.space6AssistantProfile, this.space6SpaceId, this.space6Host, this.space6Token,
        this.space7Label, this.space7AssistantProfile, this.space7SpaceId, this.space7Host, this.space7Token,
        this.space8Label, this.space8AssistantProfile, this.space8SpaceId, this.space8Host, this.space8Token,
        this.space9Label, this.space9AssistantProfile, this.space9SpaceId, this.space9Host, this.space9Token,
        this.space10Label, this.space10AssistantProfile, this.space10SpaceId, this.space10Host, this.space10Token
    ];
}

// ─── Group H · SQL Configuration ─────────────────────────────────────────────
// Prompt-layer SQL scoping: CTE preamble, forbidden tables, RLS hints.
// All fields support {{role}}, {{currentDate}}, {{year}} template variables
// which are substituted at runtime from the active viewer role / date.
class SqlConfigGroup extends FormattingSettingsGroup {
    name = "sqlConfig";
    displayName = "🗄 H · SQL Configuration";
    description = "Inject parameterized SQL into every Genie request. Use to scope data to a region, role, or time window without modifying the Databricks space itself.";
    visible = false;

    sqlCtePreamble = new formattingSettings.TextArea({
        name: "sqlCtePreamble",
        displayName: "Base CTE / WITH clause",
        description: "A full SQL WITH clause the AI must prepend to every query. Genie will build all analysis on top of this pre-filtered dataset. Supports template variables: {{role}}, {{currentDate}}, {{year}}.",
        value: "",
        placeholder: "e.g. WITH scoped AS (SELECT * FROM sales WHERE region = '{{role}}')"
    });

    sqlForbiddenTables = new formattingSettings.TextInput({
        name: "sqlForbiddenTables",
        displayName: "Forbidden Tables",
        description: "Comma-separated table or view names the AI must never reference in SQL. Complements Forbidden Columns in Section C.",
        value: "",
        placeholder: "e.g. raw_pii, staging_customers"
    });

    sqlRlsHintEnabled = new formattingSettings.ToggleSwitch({
        name: "sqlRlsHintEnabled",
        displayName: "Inject Viewer Role into Prompt",
        description: "When ON, the visual sends 'Current viewer role: <role>' to the AI as a context hint. Pair with {{role}} in your CTE or WHERE filter to scope per-viewer. The role is read from your bound User Role measure (recommended pattern: a DAX measure like View User = USERPRINCIPALNAME()). If no measure is bound, falls back to the manual role selector in Setup Section A.",
        value: false
    });

    slices = [this.sqlCtePreamble, this.sqlForbiddenTables, this.sqlRlsHintEnabled];
}

// ─── Composite card ───────────────────────────────────────────────────────────
// The card name "genieSettings" must stay stable — changing it would break
// existing .pbix / .pbip files whose format-pane values are keyed to it.
// Individual property names on each Group slice are similarly locked.
class GenieSettingsCard extends FormattingSettingsCompositeCard {
    name = "genieSettings";
    displayName = "AI for BI Settings";
    description = "All configuration for the PulsePlay visual. Work through the groups top-to-bottom: set up Connection first, declare Security next, then tune Instructions and AI Insights.";
    visible = true;

    connection      = new ConnectionGroup({} as any);
    multiSpace      = new MultiSpaceGroup({} as any);
    supervisor      = new SupervisorGroup({} as any);
    securityPosture = new SecurityGroup({} as any);
    sqlConfig       = new SqlConfigGroup({} as any);
    instructions    = new InstructionsGroup({} as any);
    aiInsights      = new InsightsGroup({} as any);
    appearance      = new AppearanceGroup({} as any);
    header          = new HeaderGroup({} as any);
    knowledgeBase   = new KnowledgeBaseGroup({} as any);
    developer       = new DeveloperGroup({} as any);
    advanced        = new AdvancedGroup({} as any);
    genieSpaceSync  = new GenieSpaceSyncGroup({} as any);

    // All groups must stay in this array so the Power BI formatting service walks
    // them when populating values from the dataView. Operational groups are
    // marked `visible = false` on the class so they're hidden from the format
    // pane (Settings edits them via the Pulse visual-settings bridge).
    groups = [
        this.connection,
        this.multiSpace,
        this.supervisor,
        this.securityPosture,
        this.sqlConfig,
        this.instructions,
        this.aiInsights,
        this.appearance,
        this.header,
        this.knowledgeBase,
        this.developer,
        this.advanced,
        this.genieSpaceSync
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    genieSettings = new GenieSettingsCard();
    cards = [this.genieSettings];
}

export function toGenieVisualSettings(model: VisualFormattingSettingsModel): GenieVisualSettings {
    const g = model.genieSettings;
    const modeValue = (g.connection.connectionMode.value?.value ?? "auto") as ConnectionMode;
    const authValue = (g.securityPosture.authMode.value?.value ?? "sharedPat") as AuthMode;
    return {
        connectionMode:        modeValue,
        host:                  g.connection.host.value,
        apiBaseUrl:            g.connection.apiBaseUrl.value,
        assistantProfile:      g.connection.assistantProfile.value,
        token:                 g.connection.token.value,
        spaceId:               g.connection.spaceId.value,
        warehouseId:           g.connection.warehouseId.value,
        proxyKey:              g.connection.proxyKey.value,
        genieFields:           g.instructions.genieFields.value,
        domainGuidance:        g.instructions.domainGuidance.value,
        sendContextToGenie:    g.instructions.sendContextToGenie.value,
        darkMode:              g.appearance.darkMode.value,
        showSql:               g.developer.showSql.value,
        showTrace:             g.developer.showTrace.value,
        insightsValidationRetryCount: Math.max(0, Math.min(3, parseInt(String(g.developer.insightsValidationRetryCount.value?.value ?? "1"), 10) || 1)),
        showConnectorCompatibilityWarnings: g.developer.showConnectorCompatibilityWarnings.value,
        showGuidedFilters:     g.developer.showGuidedFilters.value,
        allowReportActions:    g.developer.allowReportActions.value,
        devMode:               g.developer.devMode.value,
        insightsPrompt:        g.aiInsights.insightsPrompt.value,
        insightsDomain:        g.aiInsights.insightsDomain.value,
        insightsCustomSections: g.aiInsights.insightsCustomSections.value,
        insightsAuthoringMode: (g.aiInsights.insightsAuthoringMode.value?.value ?? "preset") as "manual" | "preset" | "ai-assisted",
        insightsDomainGuidance: g.aiInsights.insightsDomainGuidance.value,
        metricDirectionRules:  g.aiInsights.metricDirectionRules.value,
        insightsMetricDirections: g.aiInsights.insightsMetricDirections.value,
        insightsShowProvenanceFooter: g.aiInsights.insightsShowProvenanceFooter.value,
        // IDEA-043 universal-stage controls. Persisted in the format-pane
        // backing slices but typically edited from Settings › AI › AI Insights.
        insightsShowHeadline:  g.aiInsights.insightsShowHeadline.value,
        insightsShowTrends:    g.aiInsights.insightsShowTrends.value,
        insightsShowRisks:     g.aiInsights.insightsShowRisks.value,
        insightsShowActions:   g.aiInsights.insightsShowActions.value,
        insightsHeadlineOverride: g.aiInsights.insightsHeadlineOverride.value,
        insightsTrendsOverride:   g.aiInsights.insightsTrendsOverride.value,
        insightsRisksOverride:    g.aiInsights.insightsRisksOverride.value,
        insightsActionsOverride:  g.aiInsights.insightsActionsOverride.value,
        insightsShowResearchTraces: g.aiInsights.insightsShowResearchTraces.value,
        insightsStagedRevealEnabled: g.aiInsights.insightsStagedRevealEnabled.value,
        refreshInsights:       g.aiInsights.refreshInsights.value,
        insightsCacheTtlMinutes: Math.max(0, parseInt(String(g.aiInsights.insightsCacheTtlMinutes.value?.value ?? "30"), 10) || 30),
        enabledFeatures:       (g.aiInsights.enabledFeatures.value?.value ?? "both") as EnabledFeatures,
        ucRowFiltersEnforced:  g.securityPosture.ucRowFiltersEnforced.value,
        ucColumnMasksEnforced: g.securityPosture.ucColumnMasksEnforced.value,
        authMode:              authValue,
        runtimeForbiddenColumns:  g.securityPosture.runtimeForbiddenColumns.value,
        runtimeMandatoryRowFilter: g.securityPosture.runtimeMandatoryRowFilter.value,
        runtimeReadOnlyEnforced:  g.securityPosture.runtimeReadOnlyEnforced.value,
        // Wave 38 Phase 1 — additive; empty string preserves legacy gate behaviour
        setupAccessAllowedUsers:  g.securityPosture.setupAccessAllowedUsers.value,
        // Wave 21 — SQL configuration
        sqlCtePreamble:    g.sqlConfig.sqlCtePreamble.value,
        sqlForbiddenTables: g.sqlConfig.sqlForbiddenTables.value,
        sqlRlsHintEnabled: g.sqlConfig.sqlRlsHintEnabled.value,
        // Theme
        useReportTheme:        g.appearance.useReportTheme.value,
        themeName:             String(g.appearance.themeName.value?.value ?? "default"),
        brandAccentColor:      g.appearance.brandAccentColor.value,
        brandTextColor:        g.appearance.brandTextColor.value,
        brandBgColor:          g.appearance.brandBgColor.value,
        brandFontFamily:       g.appearance.brandFontFamily.value,
        // Wave 44 — Power BI theme inheritance + per-element typography.
        // FontControl is a CompositeSlice that holds nested SimpleSlices
        // (fontFamily, fontSize, bold, italic). Project each leaf onto the
        // flat settings shape so the rest of the visual can read them
        // without knowing about CompositeSlice ergonomics. Number coercion
        // guards against undefined/NaN at runtime if a future format-pane
        // bug ever sends a non-numeric value through.
        headerFontFamily:      String(g.appearance.headerTypography.fontFamily.value ?? ""),
        headerFontSize:        Number(g.appearance.headerTypography.fontSize.value) || 18,
        headerBold:            g.appearance.headerTypography.bold?.value ?? true,
        headerItalic:          g.appearance.headerTypography.italic?.value ?? false,
        bodyFontFamily:        String(g.appearance.bodyTypography.fontFamily.value ?? ""),
        bodyFontSize:          Number(g.appearance.bodyTypography.fontSize.value) || 14,
        bodyBold:              g.appearance.bodyTypography.bold?.value ?? false,
        bodyItalic:            g.appearance.bodyTypography.italic?.value ?? false,
        accentFontFamily:      String(g.appearance.accentTypography.fontFamily.value ?? ""),
        accentFontSize:        Number(g.appearance.accentTypography.fontSize.value) || 28,
        accentBold:            g.appearance.accentTypography.bold?.value ?? true,
        accentItalic:          g.appearance.accentTypography.italic?.value ?? false,
        // Knowledge Base
        kbEnabled:             g.knowledgeBase.kbEnabled.value,
        kbChartRules:          g.knowledgeBase.kbChartRules.value,
        kbStatRules:           g.knowledgeBase.kbStatRules.value,
        kbReportingRules:      g.knowledgeBase.kbReportingRules.value,
        // Supervisor agent
        supervisorEndpoint:    g.supervisor.supervisorEndpoint.value,
        supervisorAgentName:   g.supervisor.supervisorAgentName.value,
        supervisorSynthesisPrompt: g.supervisor.supervisorSynthesisPrompt.value,
        supervisorSynthesisProfile: g.supervisor.supervisorSynthesisProfile.value,
        supervisorAutoFusion:  g.supervisor.supervisorAutoFusion.value,
        // Multi-space
        multiSpaceEnabled:     g.multiSpace.multiSpaceEnabled.value,
        multiSpaceCount:       Math.min(9, Math.max(1, parseInt(String(g.multiSpace.multiSpaceCount.value?.value ?? "3"), 10) || 3)),
        space2Label:           g.multiSpace.space2Label.value,
        space2AssistantProfile:g.multiSpace.space2AssistantProfile.value,
        space2SpaceId:         g.multiSpace.space2SpaceId.value,
        space2Host:            g.multiSpace.space2Host.value,
        space2Token:           g.multiSpace.space2Token.value,
        space3Label:           g.multiSpace.space3Label.value,
        space3AssistantProfile:g.multiSpace.space3AssistantProfile.value,
        space3SpaceId:         g.multiSpace.space3SpaceId.value,
        space3Host:            g.multiSpace.space3Host.value,
        space3Token:           g.multiSpace.space3Token.value,
        space4Label:           g.multiSpace.space4Label.value,
        space4AssistantProfile:g.multiSpace.space4AssistantProfile.value,
        space4SpaceId:         g.multiSpace.space4SpaceId.value,
        space4Host:            g.multiSpace.space4Host.value,
        space4Token:           g.multiSpace.space4Token.value,
        space5Label:           g.multiSpace.space5Label.value,
        space5AssistantProfile:g.multiSpace.space5AssistantProfile.value,
        space5SpaceId:         g.multiSpace.space5SpaceId.value,
        space5Host:            g.multiSpace.space5Host.value,
        space5Token:           g.multiSpace.space5Token.value,
        space6Label:           g.multiSpace.space6Label.value,
        space6AssistantProfile:g.multiSpace.space6AssistantProfile.value,
        space6SpaceId:         g.multiSpace.space6SpaceId.value,
        space6Host:            g.multiSpace.space6Host.value,
        space6Token:           g.multiSpace.space6Token.value,
        space7Label:           g.multiSpace.space7Label.value,
        space7AssistantProfile:g.multiSpace.space7AssistantProfile.value,
        space7SpaceId:         g.multiSpace.space7SpaceId.value,
        space7Host:            g.multiSpace.space7Host.value,
        space7Token:           g.multiSpace.space7Token.value,
        space8Label:           g.multiSpace.space8Label.value,
        space8AssistantProfile:g.multiSpace.space8AssistantProfile.value,
        space8SpaceId:         g.multiSpace.space8SpaceId.value,
        space8Host:            g.multiSpace.space8Host.value,
        space8Token:           g.multiSpace.space8Token.value,
        space9Label:           g.multiSpace.space9Label.value,
        space9AssistantProfile:g.multiSpace.space9AssistantProfile.value,
        space9SpaceId:         g.multiSpace.space9SpaceId.value,
        space9Host:            g.multiSpace.space9Host.value,
        space9Token:           g.multiSpace.space9Token.value,
        space10Label:           g.multiSpace.space10Label.value,
        space10AssistantProfile:g.multiSpace.space10AssistantProfile.value,
        space10SpaceId:         g.multiSpace.space10SpaceId.value,
        space10Host:            g.multiSpace.space10Host.value,
        space10Token:           g.multiSpace.space10Token.value,
        // Header & layout
        headerTitle:           g.header.headerTitle.value,
        headerSubtitle:        g.header.headerSubtitle.value,
        uiScale:               (g.header.uiScale.value?.value ?? "normal") as UiScale,
        compactMode:           (g.header.compactMode.value?.value ?? "auto") as CompactMode,
        showSetupAccess:       g.header.showSetupAccess.value,
        showHeader:            g.header.showHeader.value,
        headerIconStyle:       (g.header.headerIconStyle.value?.value ?? "default") as "default" | "chat" | "sparkle" | "brain" | "bolt" | "none",
        // Section G — Genie space sync (JSON-stringified storage)
        genieTextInstructionsJson: g.genieSpaceSync.genieTextInstructionsJson.value,
        genieSampleQuestionsJson:  g.genieSpaceSync.genieSampleQuestionsJson.value,
        genieExampleSqlsJson:      g.genieSpaceSync.genieExampleSqlsJson.value,
        lastSpaceSyncAt:           Math.max(0, parseInt(String(g.genieSpaceSync.lastSpaceSyncAt.value ?? 0), 10) || 0),
        // Wave 32 — first-time setup wizard dismissal
        wizardDismissed:           g.advanced.wizardDismissed.value
    };
}

export type OperationalSettingsModel = GenieVisualSettings;

export interface VisualSettings extends GenieVisualSettings {}

export class VisualSettings {
    public formatPane: OperationalSettingsModel;
    public operational: OperationalSettingsModel;

    constructor(dataView?: any) {
        const formattingService = new FormattingSettingsService();
        const model = dataView ? formattingService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView) : new VisualFormattingSettingsModel();
        this.operational = toGenieVisualSettings(model);
        this.formatPane = this.operational;
        Object.assign(this, this.operational);
    }
}
