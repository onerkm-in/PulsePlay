# PulsePlay Author Manual

How to configure a PulsePlay deployment for your team: pick the AI connector, wire the BI surface, write domain guidance, and curate decision content.

> **The data in the reference deployment is synthetic.** Every number you see
> while configuring is generated, not real: a LATAM CPG/FMCG supply chain in
> Databricks at `workspace.databrickspractice.tbl_pp_syn_*`, three years as-of
> 30-Jun-2026, produced by `scripts/synthetic_poc/cpg_reskin.py`. The default
> Genie profile in `app.yaml` points at that space ("Genie: Synthetic SCM
> (POC)"). Do not tune guidance or thresholds against those figures expecting
> them to hold for your own data, and do not show them to a stakeholder without
> saying what they are. See `docs/USE_CASE_END_TO_END.md`.

## Contents

1. [Mental model: the two axes](#1-mental-model-the-two-axes)
2. [Settings, group by group](#2-settings-group-by-group)
3. [Connecting an AI connector (X axis)](#3-connecting-an-ai-connector-x-axis)
4. [Connecting a BI surface (Y axis)](#4-connecting-a-bi-surface-y-axis)
5. [Domain guidance: the highest-leverage lever](#5-domain-guidance-the-highest-leverage-lever)
6. [Knowledge packs](#6-knowledge-packs)
7. [Decision content and the approval gates](#7-decision-content-and-the-approval-gates)
8. [Performance and reveal cadence](#8-performance-and-reveal-cadence)
9. [What is not implemented yet](#9-what-is-not-implemented-yet)

---

## 1. Mental model: the two axes

PulsePlay separates what the user is looking at from what is thinking about it.

| Axis | What varies | Where it is configured |
|---|---|---|
| Y: BI vendor | The embedded surface the user is looking at | `Settings > BI Setup`, plus `playground/src/biPanel/registry.ts` |
| X: AI connector | The AI brain answering questions | `Settings > AI Setup`, backed by proxy profiles |

The two are chosen independently. Any (vendor, connector) pair is valid, and switching one does not force a change to the other (`CLAUDE.md:70-75`).

A "Context Bundle" is a named preset over the two axes, not a binding. It introduces no new persisted state: the active bundle is a pure projection derived by matching the current `biVendor` and `aiProfile` against a registry (`playground/src/lib/contextBundles.ts:1-17`). Delete the bundle switcher and both axes still work. The four curated pairs shipped today are Power BI or Pulse Canvas, each crossed with Genie or the Power BI deterministic brain (`playground/src/lib/contextBundles.ts:98-106`).

Everything credentialed happens in the Express proxy, never in the browser. `GET /assistant/profiles` returns only routing metadata, and it truncates the Genie space id and never returns tokens or secrets (`proxy/server.js:3269-3300`).

Local run: proxy must be started with `PORT=7000`; the playground dev server runs on 7001. The proxy's own default port constant is still 8787, so starting it without `PORT=7000` makes every `/api/*` call fail (`CLAUDE.md:114`).

---

## 2. Settings, group by group

Settings is a full-page route at `/settings`, with deep links at `/settings/<group>` and `/settings/<group>/<leaf>` (`playground/src/settings/settingsRoute.ts:6-11`).

There are six routable group ids: `setup`, `bi`, `ai`, `preferences`, `system`, `advanced` (`settingsRoute.ts:17-26`). Only four appear in the left rail, in this order: **AI Setup**, **BI Setup**, **Advanced**, **Display** (`playground/src/settings/SettingsShell.tsx:67-72`).

`setup` ("Quick start") and `system` are legacy routes. They still resolve if you have an old link, but they are hidden from the rail, and search redirects them: `setup` absorbs into AI Setup, `system` absorbs into Advanced (`SettingsShell.tsx:38-42`, `:77-84`).

A fresh visit with no stored preference lands on **AI Setup** (`settingsRoute.ts:44-57`).

### AI Setup (`/settings/ai`)

"Assistant, knowledge pack, AI Insights, Ask Pulse - everything X-axis" (`SettingsShell.tsx:49`). Leaves, in visual order (`SettingsShell.tsx:107-124`):

| Leaf | What it does |
|---|---|
| Connector catalogue | Brand grid of connector types from `GET /api/assistant/connector-types`. Shows configured profiles by default with a "N more available - not yet wired" expander (`playground/src/setup/ConnectorBrandGrid.tsx:116-150`) |
| Genie spaces (multi-space) | Add extra Databricks Genie spaces as switchable connectors without editing `config.json`. Stored in this browser only; the `config.json` profile pattern is the path for shared deployments (`AiGroup.tsx:280-300`) |
| Model / Agent, Connection test | Sub-selection inside the connector plus a probe with an inference trace |
| Power BI Q&A | Microsoft's Q&A embed surface |
| Knowledge pack, Vector Search KB, UC Metric View, Browse library | Shared context the assistant is given |
| Response behavior | Prompt strategy, sections, metric direction rules, **Domain guidance** (see section 5) |
| Custom sections preset library, Setup copilot, Metric direction preset library | Authoring helpers that populate the fields above |
| AI Insights sections, SQL sections, Knowledge Base | Per-surface behavior |

### BI Setup (`/settings/bi`)

"BI vendor, embed, sandbox, governance - everything Y-axis" (`SettingsShell.tsx:48`). Leaves: Provider, Embed, Authentication, Canvas, Status, Governance (`SettingsShell.tsx:104`).

Two separate concepts here, and mixing them up is the most common author mistake:

- **Provider / `biVendor`** is your vendor intent and the target your embed config is written against.
- **BI surface mode** decides what the pane actually mounts at runtime: `auto` (default), `native`, or `vendor` (`playground/src/settings/biSurfaceMode.ts:6-10`). `auto` uses the vendor when a vendor config exists and falls back to native otherwise.

Only two vendors are offered as cards: `powerbi` and `native` (`playground/src/settings/groups/BiGroup.tsx:561`; `playground/src/biPanel/registry.ts:86`).

### Display (`/settings/preferences`)

Labelled "Display" in the rail even though the route id is `preferences` (`SettingsShell.tsx:41`). Leaves (`SettingsShell.tsx:127-136`):

- **Interface type** - author-only master control: `segregated` (top-tab navigation across the separate screens; the default and the fallback), `cockpit`, or `combined` (cockpit plus the top-tab nav) (`PreferencesGroup.tsx:73-80`, `:233-241`). A server kill switch can force `segregated`.
- **Workbench template** - five presets: Balanced, Executive briefing, Analyst workbench, Ask-first, Dashboard kiosk (`playground/src/settings/workbenchTemplates.ts:53-97`). Applying one writes four things, not two: tab visibility, the default landing tab, the Pulse AI feature scope (`enabledFeatures`), and - for Executive briefing and Analyst workbench only - an AI Insights section preset (`applyWorkbenchTemplate`, `:142-169`). **That preset overwrites `insightsCustomSections`, `insightsDomain`, and `metricDirectionRules`.** If you have hand-authored Insights sections, applying either of those two templates replaces them.
- **Visible tabs** - three per-tab toggles: AI Insights (`ai-insights`), Ask Pulse (`ask-pulse`), Dashboard (`bi-viz`) (`PreferencesGroup.tsx:160-162`; `TabVisibility` at `settingsStore.tsx:84-88`). At least one must stay enabled. Decisions (`action-insights`) has no visibility toggle at all - it is governed by whether the AI pane is on, so it never appears in this control, though it is always offered as a landing-tab option (`PreferencesGroup.tsx:53-56`).
- **Default landing tab** - filtered to currently-enabled tabs. Resolution priority at runtime is URL `?surface=` > URL `?focus=bi` > this setting > `DEFAULT_LANDING_SURFACE`, which is `action-insights` (Decisions) (`playground/src/App.tsx:299-318`, `playground/src/surfaceRegistry.ts:114`). The last-used surface is deliberately NOT restored as the landing default - the app opens on the same home base every time unless a deep link or this setting says otherwise (`App.tsx:314-317`). The code comment at `PreferencesGroup.tsx:174-175` still describes the old order; trust `App.tsx`.
- **Ask Pulse history button** - author gate, hidden by default.
- **Canvas tiles**, **Appearance**.

### Advanced (`/settings/advanced`)

"Performance, developer tools, runtime guards, danger zone" (`SettingsShell.tsx:52`). Leaves: Performance levers, Local storage inspector, Reset section, Reset all, Danger zone (`SettingsShell.tsx:138`). The legacy `system` group is NOT merged into Advanced. Its content (proxy status, network and auth, security posture, license posture, profile inventory, diagnostics, setup wizard, export support bundle, developer tools - `SettingsShell.tsx:137`) still renders, but only at the legacy `/settings/system` URL, behind a banner pointing at Advanced (`SettingsShell.tsx:587-593`). The absorption map (`:77-84`) only redirects settings-search hits (`:222`); it moves no content.

### Where state lives

Author choices persist in `localStorage` under `pulseplay:*` keys, one key per concern. The ones you will meet most: `pulseplay:active-ai-profile`, `pulseplay:bi-vendor`, `pulseplay:bi-embed-config`, `pulseplay:bi-surface-mode`, `pulseplay:tab-visibility`, `pulseplay:default-landing-surface`, `pulseplay:pack-selection`, `pulseplay:performance-levers`. This means author settings are **per browser**, not per deployment. Server-side governance is the allowlist in `proxy/config.json` (see below), not localStorage.

---

## 3. Connecting an AI connector (X axis)

A connector is one entry in `proxy/config.json > profiles`, or the equivalent set of `PROXY_PROFILE_*` environment variables. Env vars merge per-field with a `config.json` profile of the same name, env wins, and env-only profiles are appended (`proxy/config.example.json` `_doc_envProfiles`).

The env naming convention is `PROXY_PROFILE_<NAME>_<FIELD>`, for example `PROXY_PROFILE_SALES_HOST`. On Databricks Apps this is how everything is configured, since `config.json` cannot be committed (`app.yaml`).

**Secrets are server-side only.** They live in `config.json` on the server, or in `valueFrom:` references to a Databricks secret scope. The reference deployment uses scope `pulseplay` with keys `databricks_pat` and `powerbi_sp_secret` (`app.yaml` `resources:`). Nothing credentialed reaches the browser bundle: the Power BI client secret is never returned to the browser, never written to the audit log, and never used as part of the embed-token cache key (`config.example.json` `_doc_powerBiEmbedToken`).

### The three proven connectors

Ten backend code paths exist. Three are proven live. Configure one of these unless you have a reason not to.

**Genie** (`type` omitted or `"genie"`) - `docs/CONNECTOR_REQUIREMENTS.md:62-71`

| Field | Required | Notes |
|---|---|---|
| `host` | yes | `https://<workspace>.cloud.databricks.com` |
| `token` | yes | PAT with access to the space, or an OAuth-M2M `clientId`/`clientSecret` pair with `authMode: "oauth-m2m"` |
| `spaceId` | yes | the Genie space id |
| `warehouseId` | optional | enables SQL warmup and `/sql/preview`; omit and warmup is a 200 no-op |

The Genie space must be created in the Databricks workspace UI first.

**Foundation Model** (`type: "foundation-model"`) - `docs/CONNECTOR_REQUIREMENTS.md:85-95`

| Field | Required | Notes |
|---|---|---|
| `host` | yes | workspace host |
| `token` | yes | PAT with serving-endpoint invoke permission |
| `foundationModelEndpoint` | yes | must be a name from `GET /api/2.0/serving-endpoints` on your workspace |

A wrong endpoint name returns 404 `ENDPOINT_NOT_FOUND`. Endpoint names differ per tier; Databricks Free Edition has names like `databricks-meta-llama-3-3-70b-instruct` and does not have any `*-405b` endpoint (`config.example.json` `_doc_endpoint`). This is an ungrounded LLM with no data binding, so it will say it needs the data unless you feed it context.

**Power BI semantic model** (`type: "powerbi-semantic-model"`) - `docs/CONNECTOR_REQUIREMENTS.md:73-83`

| Field | Required | Notes |
|---|---|---|
| `aadTenantId` | yes | Azure AD tenant GUID |
| `aadClientId` | yes | service principal / app registration client id |
| `aadClientSecret` | in SP mode | not required when `authMode` is `user-refresh` or `user-token` (`proxy/lib/connectorManifests.js:79`) |
| `powerbiGroupId` | yes | Power BI workspace GUID |
| `powerbiDatasetId` | yes | published dataset GUID |

Setup steps: create an Azure AD app registration plus client secret, add the service principal to the target Power BI workspace as a Member, and enable "Service principals can use Power BI APIs" in the Power BI admin portal (`config.example.json` `_powerbi_semantic_model_example`). This path uses no LLM and no warehouse: it probes the dataset with `INFO.*` DAX, matches the question to one of four DAX templates, and executes via `executeQueries`. That needs dataset Read plus Build, and works on any Pro or PPU workspace with the tenant setting on. It does **not** need Fabric or Premium capacity. The report *visual* embed on the Dashboard tab does.

### Optional per-profile authoring fields

Worth setting because they change what the user sees, on any profile type:

- `displayName` - friendly label in progress text and source attributions.
- `dataDomain` - short noun phrase, used in step text like "Sales helper is checking sales data".
- `suggestedQuestions` - up to 8 starter chips shown on the welcome strip; replaces the generic suggestions for that profile.
- `schemaContext` - columns, grain, metric naming; lets a supervisor flag cross-source metric mismatches.
- `syntheticIndicators` - column names whose values are derived rather than measured, plus a caveat message surfaced on the confidence chip.

All documented inline in `proxy/config.example.json`.

### Multi-space Genie

To expose several Genie spaces as separate selectable connectors, add one profile per space, each with its own `spaceId`, reusing host and token when they share a workspace. The connector picker lists every profile from `/assistant/profiles` automatically (`config.example.json` `_doc_multi_genie_spaces`).

### What the catalogue advertises

The Settings connector catalogue is curated. `/assistant/connector-types` filters to `['powerbi-dataset-dax', 'powerbi-dataset-qna', 'genie']` (`proxy/lib/connectorManifests.js:573-579`). Every other manifest stays registered so runtime dispatch and existing profiles keep working. To bring one back into the catalogue, add its id to that list.

Each connector also carries an honest live-verification status separate from its maturity label: `verified` for `powerbi-dataset-dax`, `foundation-model`, and `genie`; `unverified` for supervisor, supervisor-local, both Azure OpenAI paths, both Bedrock paths, `responses-agent`, and `powerbi-dataset-qna`; `demo` for `demo-mock` (`playground/src/lib/connectorManifests.ts:136-147`).

---

## 4. Connecting a BI surface (Y axis)

### Power BI

Power BI is the only real vendor-SDK integration: `powerbi-client`, an event bridge, a command bridge, and `getMetadata()`. Configure it in `Settings > BI Setup > Embed`. Four token modes exist (`playground/src/components/EmbedConfigForm.tsx:47`, `:500-503`):

| Mode | What it is | Trade-off |
|---|---|---|
| `secure` - Secure embed link, quick preview | Paste the portal's reportEmbed link or iframe. Default mode. | Viewers authenticate with Power BI, but SDK commands such as AI-applied filters and page navigation do **not** work (`EmbedConfigForm.tsx:517-519`) |
| `sso` - AAD SSO, "Embed for your organization" | AAD app client id plus tenant id, entered once per browser | Seamless for org users; full bridge |
| `backend` - Service principal, "Embed for your customers" | Proxy mints the token via `/assistant/embed-token/powerbi` | Forced to View permissions (`EmbedConfigForm.tsx:263`); survives an always-on deploy because it does not expire like a user refresh token |
| `manual` - Manual paste | Dev only. Hidden unless `VITE_PULSEPLAY_ENABLE_MANUAL_PBI_TOKEN=true` **and** the build is not production (`EmbedConfigForm.tsx:49-53`) | Never use outside local development |

Whichever mode you pick, the workspace and report ids are validated against the org allowlist, including the ids extracted from a pasted secure-embed URL (`EmbedConfigForm.tsx:286-302`).

### Native canvas

`native` is a real ECharts renderer inside PulsePlay. It needs no vendor credentials and no external embed, and it is what `auto` surface mode falls back to when no vendor config exists (`playground/src/biPanel/registry.ts:74-77`).

### Everything else

Tableau, Qlik, Looker, generic-iframe, and the Databricks embed adapters are **iframe stubs**. They render the URL you give them and emit one `loaded` event. There is no vendor SDK, no event bridge, and no command bridge, so the assistant cannot see what is on screen or drive the surface. They stay in the registry so nothing breaks at runtime, but they are not advertised in any picker (`playground/src/biPanel/registry.ts:80-86`). Do not plan a deployment around them.

Adapters that cannot introspect the embedded view must return `null` from `getMetadata()` rather than fabricate a payload, so the host degrades to pack-KPI-only reachability instead of silently corrupting the question picker (`playground/src/biPanel/BIAdapter.ts:164-179`).

---

## 5. Domain guidance: the highest-leverage lever

**Business conventions belong in guidance, never in code.** Number formats, tone, what to call things, which direction is good for a metric: these are subjective and organisation-specific. Encoding them in code makes them un-authorable and wrong for the next deployment. Objective correctness belongs in code; taste belongs in guidance.

Guidance is injected **after** PulsePlay's default format contracts, with an explicit precedence note, because LLMs weight later and closer-to-task instructions more heavily. The prompt literally says the author's rules win on conflict, covering number format, abbreviation convention, currency symbol, and decimal precision (`playground/src/pulse/visualHelpers.ts:1693`).

One thing outranks you: Genie space instructions are injected by Genie server-side above the entire prompt, so they trump everything by default (`visualHelpers.ts:1691-1692`).

### Where to edit it

`Settings > AI Setup > Response behavior > Domain guidance` (`playground/src/settings/groups/AiGroup.tsx:845-867`). It is a plain multi-line textarea.

Precedence at runtime is `insightsDomainGuidance` (the Settings field) first, falling back to the seeded `domainGuidance` key when the Settings field is empty (`playground/src/pulse/visual.tsx:4020`).

### The shipped default, verbatim

PulsePlay seeds a number-format standard as domain guidance so the same convention applies across AI Insights and Ask Pulse. This is `DEFAULT_NUMBER_FORMAT_GUIDANCE` at `playground/src/pulse/_adapter/PulseHostStub.ts:190-200`:

```text
Number format standard - apply to EVERY value in every section, consistently:
- Thousands -> `x.xx M`. Millions -> `x.xx MN`. Billions -> `x.xx B`.
- CRITICAL: on this scale `M` means THOUSAND, NOT million. A MILLION is always `MN` (two letters). Examples: 50,000 -> `50.00 M`; 1,138,707 -> `1.14 MN` (NEVER `1.14 M`); 989,340,000 -> `989.34 MN`; 1,031,000,000 -> `1.03 B`.
- Percentages and ANY change to a percentage metric: `x.xx %` with the % symbol - never a `pp` suffix.
- Always show exactly 2 decimals. Prefix a change / delta with an explicit sign, e.g. `+0.81 %`, `-65.42 MN`.
- Currency keeps its symbol before the number: `$1.03 B`, `$989.34 MN`.
- PROMOTE THE UNIT rather than comma-grouping: the number before the unit must have 1-3 digits and NEVER a thousands separator. If you are about to write `$1,031.41 MN`, the unit is wrong - promote it to `$1.03 B`. A comma before a unit suffix always means you failed to promote.
- Use the SAME unit for the same quantity everywhere in one answer. Do not write `$1,031.41 MN` in one section and `$1.03 B` in another for the identical figure.
- Plain ASCII punctuation only: use a hyphen `-`, never an em dash or en dash; straight quotes, not curly; `...` rather than a single ellipsis character.
```

Read it as a model, not as gospel. It is a good template because it does the four things effective guidance does: states the rule, gives worked numeric examples, names the failure mode explicitly ("a comma before a unit suffix always means you failed to promote"), and demands internal consistency across one answer. If your organisation uses tech K/M/B rather than Roman M/MN/B, this is the field where you change it.

### The caveat that will bite you

`seedPulsePlayDefaults()` only writes keys that are **absent**. It iterates the defaults and sets a key only `if (!(k in existing))`, so it never stomps a value a session already has (`PulseHostStub.ts:239-248`).

Consequence: if the shipped default changes in a later release, **any browser that has already run PulsePlay keeps its stored copy of the old guidance forever.** A code update will not propagate. The only way to pick up a new default in an existing session is to edit the field in Settings, or to clear the stored value through `Settings > Advanced > Local storage inspector` and reload. When you roll out a guidance change to a team, tell people to do this; do not assume a deploy is enough.

The same protection applies in your favour: your own edits are never overwritten by a deploy.

### Structured activators

Inside the guidance box, a `## ` header activates a structured directive. Anything outside a `## ` block is treated as normal business guidance (`playground/src/pulse/guidanceActivators.ts:168-176`). Two keywords are recognised today (`guidanceActivators.ts:133-164`):

- `## Numeric Formatting` (aliases: `Formatting Standards`, `Number Formatting`) - **active**. How numeric values are displayed. Honest caveat from the source: it applies reliably to table and KPI values, which PulsePlay formats after the AI returns; in prose it is best-effort, and a Genie space instruction can still override it.
- `## Masking` (alias: `Data Masking`) - **reserved**. The keyword is recognised but enforcement ships later. Even when it lands, it is presentation and prompt-redaction only, not a security guarantee. The real control is Unity Catalog column masks at the data layer.

---

## 6. Knowledge packs

A pack is a self-contained directory that gives PulsePlay business vocabulary for one industry or function: glossary, ontology, KPI definitions, sample questions, a prompt-context snippet injected at runtime, BI/AI fit notes, and loadable demo configs (`docs/PACKS.md:5-27`).

Packs live in `pulsepacks/`. Three exist today: `cpg-fmcg`, `retail-digital`, `saas-product`. Only `cpg-fmcg` is fleshed out, with knowledge-base files and eleven sub-verticals including `supply-chain`, `procurement`, `manufacturing`, `finance-fpa`, and `sustainability`. The other two ship a `pack.json`, a README, and migration notes only.

The runtime pieces: `proxy/lib/packMatcher.js` scores probe metadata against glossary, KPI, and sample-question terms; `packPromptLoader.js` loads `prompt-context.md` for the selected pack and sub-vertical with a glossary fallback; `packPromptInjector.js` injects it into the outgoing prompt; `GET /assistant/knowledge/packs` returns installed packs filtered by the org allowlist (`docs/PACKS.md:36-42`). Authors pick the active pack in `Settings > AI Setup > Knowledge pack`; the choice persists under `pulseplay:pack-selection`.

**Honest caveat: there are three parallel pack corpora, and they drift.** Debt item D1 records them as (1) the filesystem `pulsepacks/` that the proxy reads, (2) a hard-coded `PACK_REGISTRY` in `playground/src/authoring/businessContextProfile.ts:163`, and (3) preset libraries in `playground/src/pulse/insightsPresetLibrary.ts` plus `_packs/cpgFmcgPresets.ts`. The observed harm is real, not hypothetical: `finance-fpa` exists in corpus 3 but not corpus 2, so the pack-driven headline feature is silently inert for that pack (`docs/DEBT_REGISTER.md:11-19`).

**`pulsepacks/` is the canonical source.** That was decided on 2026-07-28. The client corpora are meant to become fetch-and-cache consumers of `GET /assistant/domain-context` and then be deleted, but that work has not been executed yet. Until it is, author your pack content in `pulsepacks/` and expect some client-side presets to lag.

---

## 7. Decision content and the approval gates

The Decisions surface (`action-insights`) shows governed Decision Prompts. PulsePlay does not generate them. A Python detection engine writes them to a Delta table, and the proxy reads them.

Table coordinates come from configuration, never hardcoded in a caller (`proxy/lib/decisionPromptStore.js:16-18`):

- `AI_PROMPT_STORE`, default `main.action_insights.decision_prompts`
- `AI_AUDIT_TABLE`, default `main.action_insights.decision_audit`

Each prompt row carries the fields the UI renders: `rule_id`, `kpi`, `severity`, `confidence_score`, `headline`, `issue`, `root_cause`, `recommended_action`, `action_code`, `action_level`, `approval_required`, business-impact value/unit/label, `persona`, `owner`, `status`, `evidence_signature`, `evidence_sql`, and narrative (`decisionPromptStore.js:44-49`).

**Do not bulk-DELETE `decision_prompts`.** The detection engine owns those rows and MERGEs on `prompt_id` on each scheduled run; a session that deleted them believing the table empty destroyed the live set until the next run healed it. Human status transitions belong in `decision_audit`, not in deletes (`docs/AGENDA.md:40`).

Routes are served under `/decision-assist/*`, with the legacy `/insights/action-insights` routes sharing the same handlers so authority can never diverge between the two paths (`proxy/connectors/decision-assist.js:6-18`).

### Personas and the HITL gate

Authority is derived server-side from verified identity claims, never from client-supplied values. A browser "Viewing as" selector is presentation only (`proxy/lib/personaGate.js:1-11`).

Three personas, with capabilities as the server-side source of truth (`personaGate.js:26-38`):

| Persona | Capabilities |
|---|---|
| Supply Chain Planner | view prompts, view evidence, trigger request, snooze, mark false positive |
| Supply Chain Manager | all of the above **plus** approve HITL and reject |
| Automated Agent | view prompts, view evidence only |

Resolution order (`personaGate.js:64-80`): a declared agent client is resolved first, so an automated caller running under a service token that happens to carry manager-ish roles can never inherit Manager capability. Then verified IdP roles are matched, with `manager|approver|s&op|director|lead` mapping to Manager and `planner|analyst|supply` mapping to Planner. Only if no role is present, and only when `AI_ALLOW_DEMO_PERSONA=true`, is a claimed `x-pp-persona` header honoured. The default is Planner, which is least privilege.

Actions map to a required capability, a resulting status, and a level (`personaGate.js:40-52`). Level 1 actions are `view_evidence`, `snooze`, `mark_false_positive`, and `reject`. Level 3 actions are `approve` (needs `can_approve_hitl`, sets status `actioned`) and the five `trigger_*` actions (need `can_trigger_request`, set status `pending-approval`). A Planner can raise a request; only a Manager can approve it. The MVP ceiling is action level 3.

Every state change stays a human act behind the HITL gate. An agent may read prompts and evidence to enrich them, and nothing more (`personaGate.js:20-23`).

---

## 8. Performance and reveal cadence

All latency knobs live in one bag under `pulseplay:performance-levers`, edited at `Settings > Advanced > Performance levers`. One JSON blob means one place to inspect, one place to reset, one event broadcast on save, and it reflects the design view that these levers always move together (`playground/src/settings/performanceLevers.ts:10-15`).

### Reveal cadence

One preset drives **both** the frontend reveal animation and the backend batching strategy. There are no standalone backend knobs (`performanceLevers.ts:33-36`, `:54-65`):

| Cadence | Frontend | Backend | Trade-off |
|---|---|---|---|
| `instant` | No staged reveal; all sections paint together | Single-shot bundle, one call | Longest wait before anything appears, fewest calls |
| `fast` | First section at t=0, rest in batches of 3 | `batchSize: 3`, 3 s between batches | Quick first paint, heavier concurrent load |
| `balanced` (default) | First section at t=0, rest in batches of 2 | `batchSize: 2`, 6 s between batches | The shipped default |
| `full` | Every section is its own batch | `batchSize: 1`, 8 s between batches | Slowest overall, gentlest on rate limits |

The inter-batch delay exists so the lead batch can return its `conversation_id` before subsequent messages are issued (`performanceLevers.ts:45-48`). If you are hitting Genie rate limits, move toward `full`. If your users complain about a blank screen, move toward `fast`.

### The other three levers

| Lever | Default | Range | What it trades |
|---|---|---|---|
| `discoveryPrewarmEnabled` | `true` | boolean | Off skips the screen-load discovery prewarm. Saves a call on every page load; later queries lose the cached snapshot unless the assistant surface populates it directly (`performanceLevers.ts:71-74`) |
| `insightsCacheTtlMinutes` | 30 | 1 to 180 | How long an Insights answer is considered fresh before re-running. Higher means fewer backend calls and staler numbers (`performanceLevers.ts:76-79`) |
| `maxValidationRetries` | 1 | 0 to 3 | Per-section validation retry budget on the proxy. 0 ships whatever the LLM produced on the first pass, which is fastest but lets shakier sections through. 3 retries whenever the validator flags a section, which is slowest and highest quality. The proxy caps its loop at `min(server-default, client-supplied)` (`performanceLevers.ts:80-86`) |

Every reader tolerates malformed or missing values by falling back to the defaults, and out-of-range numbers are clamped rather than rejected (`performanceLevers.ts:96-128`).

Related cost rule, worth knowing before you tune anything: there is no Databricks or AI spend on page load or on timers. Cache serves; compute happens only on explicit user triggers. Do not add a lever or a refresh that breaks that.

---

## 9. What is not implemented yet

Stated plainly so you do not plan around something that does not exist.

- **Tableau, Qlik, Looker, generic-iframe, Databricks embed adapters** are iframe stubs. No vendor SDK, no event bridge, no command bridge. The assistant cannot see or drive them.
- **Seven of the ten connector code paths are unproven live.** Azure OpenAI chat, Azure OpenAI analytics, Bedrock RAG, Bedrock direct, and ResponsesAgent are code-present and unverified. Supervisor and supervisor-local are additionally environment-gated: they need at least two Genie spaces, and the reference workspace profile was removed in the 2026-07-23 config cleanup. Separately, the **Power BI Q&A embed surface** (`/powerbi/qna`) is not one of the ten paths - it is Microsoft's NLP running in the Microsoft tenant, with PulsePlay minting the embed token only - and it is also unverified. Its report-visual render needs Power BI capacity.
- **Genie Agent Mode (Deep Research) is UI-only.** The public REST API silently swallows the flag. The Foundation Model path is the workaround.
- **`## Masking` guidance is recognised but not enforced.** Use Unity Catalog column masks for anything that actually matters.
- **Pack corpus unification (D1) is decided but not executed.** Client-side pack presets can still drift from `pulsepacks/`.
- **Prompt IR is dormant.** `promptDispatcher.buildBackendPayload` has zero callers in `server.js`; live routes inject the Genie-shaped `prompt-context.md` verbatim into every backend (`docs/DEBT_REGISTER.md` D4). Guidance you write is delivered as text, not as a structured contract.
- **Tests assert output shape, not answer correctness.** There is no eval or hallucination harness. A fully green test run does not mean the answers are right.
