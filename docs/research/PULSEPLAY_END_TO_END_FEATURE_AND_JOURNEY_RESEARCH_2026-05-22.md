# PulsePlay End-To-End Feature And Journey Research

Date: 2026-05-22

Status: Research and design-alignment artifact. No runtime code changed.

Purpose: map the PulsePlay product surface as it exists today, explain the information flow, separate the Author and Viewer journeys, identify the UX risks, and prepare the team for a focused brainstorming session before implementation.

## Executive Verdict

PulsePlay has a strong product promise: connect the BI surface the user is looking at, connect the approved AI brain that can reason over it, add domain knowledge, and let the user move between dashboard inspection, AI briefing, and follow-up questions without changing tools.

The ingredients are already powerful. The weak point is not the product idea, and it is not only visual polish. The weak point is choreography. Today, the app can feel like a collection of capable rooms: Settings, Knowledge, Launchpad, Workbench, Power BI Q&A, AI Insights, Ask Pulse, Dashboard. The next experience leap is to turn those rooms into two calm journeys:

- The Author configures, validates, previews, and hands off a governed BI + AI experience.
- The Viewer lands in that experience, understands what they are seeing, asks useful questions, trusts the answer, and returns because the flow saves effort.

The "sweetest" version of PulsePlay is not flashy. It is clear, trustworthy, and quietly delightful. The user should always know:

1. What am I looking at?
2. Which AI brain is answering?
3. What business context is being used?
4. Why should I trust the answer?
5. What can I do next?

## Research Method

Six read-only research agents inspected the product from different angles:

| Agent focus | Output used in this document |
|---|---|
| Feature inventory | Mapped the current shipped and partial feature set across app shell, BI adapters, AI proxy, Settings, Knowledge, Launchpad, Workbench, Power BI, native canvas, governance, and deployment docs. |
| Author journey | Mapped the setup, validation, preview, save, governance, and handoff journey. |
| Viewer journey | Mapped arrival, dashboard viewing, AI Insights, Ask Pulse, evidence, chart rationale, Power BI Q&A, and token/session efficiency. |
| Information flow | Traced state from Settings/local storage through App, BIPanel, AISidebar, proxy, governance, and native canvas. |
| Cross-page story | Reviewed whether root app, Settings, Knowledge, Launchpad, Workbench, and Q&A read like one product. |
| Figma/design handoff | Recommended a FigJam IA flow, journey map, service blueprint, annotated frames, and component primitives in that order. |

Local evidence used:

- [App shell and routing](../../playground/src/App.tsx)
- [Settings shell](../../playground/src/settings/SettingsShell.tsx)
- [Settings screenshot sweep](../evidence/settings-control-panel-sweep-2026-05-22/README.md)
- [Architecture](../ARCHITECTURE.md)
- [Settings progressive design research](SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md)
- [Settings alignment observation](SETTINGS_ALIGNMENT_OBSERVATION_2026-05-22.md)
- [Power BI DAX / Q&A enablement guide](../POWERBI_DAX_QNA_ENABLEMENT.md)
- [Quality and honesty limits](../QUALITY.md)

External design references used:

- Nielsen Norman Group: journey maps, service blueprints, and UX mapping method selection.
- Figma: journey mapping, service blueprinting, information architecture, user flows, Dev Mode annotations, Code Connect.
- Microsoft HAX Toolkit: evidence-based human-AI interaction guidelines.
- Google People + AI Guidebook: onboarding, trust calibration, control, and recovery questions.
- IBM Design for AI: explainability and transparency expectations.
- Atlassian Design System: empty-state and design-token guidance.

All source URLs are appended in [EXTERNAL_REFERENCES.md](EXTERNAL_REFERENCES.md).

## Product Story

PulsePlay should be explained as:

> Bring your existing BI surface. Choose the approved AI brain. Add the right business vocabulary. Ask in plain English. See governed answers, evidence, and visuals in one experience.

The product is not a BI replacement, an LLM platform, or an agent-building platform. It is the experience layer over existing BI, AI, and data-governance systems.

The defining model remains the two-axis abstraction:

| Axis | User-facing meaning | Current implementation |
|---|---|---|
| BI axis | What the user is looking at | `BIAdapter` contract plus Power BI, Databricks AI/BI, Databricks Genie, generic iframe, Tableau/Qlik/Looker fallback, and native governed canvas. |
| AI connector axis | What answers the question | Proxy profiles for Genie, Azure OpenAI, Bedrock, Foundation Model, Supervisor, ResponsesAgent, and Power BI semantic-model DAX. |

This is the strongest simple story. Every page should reinforce it.

## Personas

### Viewer

The Viewer is a business user. They should not configure infrastructure. Their success path is:

- Open the PulsePlay experience.
- See the dashboard, AI briefing, or default author-selected surface.
- Ask a follow-up in business language.
- Inspect evidence when needed.
- Act, share, or return later.

Emotional goal: "I understand faster, and I can trust what happened."

### Author

The Author is an analyst, BI owner, product owner, or power user configuring an experience for others. Their success path is:

- Choose the BI surface.
- Choose the AI connector.
- Add the right knowledge pack.
- Validate proxy, profile, allowlist, governance, and preview.
- Hand off a clean setup summary without leaking secrets.

Emotional goal: "I know what is configured, what is blocked, and who owns the next step."

### Admin / Deployer

The Admin or Deployer owns environment, identity, secrets, cost, and hosting. Their success path is:

- Confirm subscription/workspace posture.
- Bind secrets server-side.
- Configure auth and allowed origins.
- Review diagnostics exposure and cost guardrails.
- Deploy with a repeatable runbook.

Emotional goal: "This is safe, auditable, and cost-aware."

### Support / Developer

The Support or Developer user investigates failures. Their success path is:

- Get request ids and support bundles.
- See connector status, proxy status, route health, and redacted logs.
- Reproduce or triage without guessing.

Emotional goal: "I can debug without exposing secrets or asking the user to explain internals."

## Feature Inventory

This table maps the major fused features in PulsePlay today. Status is intentionally conservative.

| Area | Feature | User value | Status | Key files / docs | UX risk |
|---|---|---|---|---|---|
| App shell | Three primary surfaces: AI Insights, Ask Pulse, Dashboard | Gives Viewer a simple task model | Working | [App.tsx](../../playground/src/App.tsx), `surfaceRegistry.ts` | Too many modes can blur the mental model if not explained as one journey. |
| App shell | Layout presets and active-surface persistence | Lets Author choose the experience shape | Working | [layoutPresets.ts](../../playground/src/settings/layoutPresets.ts) | Layout terms can feel internal unless tied to Viewer tasks. |
| First run | FirstRunWizard | Teaches persona, BI tool, AI connector, source, pack, starter question | Working | `FirstRunWizard.tsx` | If dismissed, the Author can land in dense Settings with no persistent task path. |
| Settings | Full control panel | Central place for setup, BI, AI, preferences, system, advanced | Partial | [SettingsShell.tsx](../../playground/src/settings/SettingsShell.tsx) | Current screen density makes important choices feel equally urgent. |
| Settings | Setup group | Starts with BI surface, AI assistant, domain knowledge | Partial | `settings/groups/SetupGroup.tsx` | Still behaves like stacked forms instead of a progressive task list. |
| Settings | BI group | Provider, embed, auth, canvas, status, governance | Partial | `settings/groups/BiGroup.tsx` | Useful controls are exposed before the Author has chosen the parent path. |
| Settings | AI group | Connector catalogue, model/agent, tests, knowledge, vector search, metric views | Partial | `settings/groups/AiGroup.tsx` | Dense first viewport; full catalogue overwhelms setup users. |
| Settings | Preferences/System/Advanced | Personalization, diagnostics, support, reset, performance | Partial | `SettingsShell.tsx` groups | Support and advanced operations can look like ordinary setup. |
| BI axis | `BIAdapter` contract and `BIPanel` | One host can mount any BI vendor | Working | [BIAdapter.ts](../../playground/src/biPanel/BIAdapter.ts), [BIPanel.tsx](../../playground/src/biPanel/BIPanel.tsx) | Fail-closed allowlist behavior is correct but may look like product failure. |
| BI axis | Power BI SDK adapter | Real Power BI embedding, events, filters, refresh, dev snapshots | Partial | [bi-adapters/powerbi](../../bi-adapters/powerbi/index.ts) | Live org credentials, RLS, and token behavior remain the real production gate. |
| BI axis | Secure embed quick-preview | Lets Author paste and preview before full SDK/control setup | Working | [EmbedConfigForm.tsx](../../playground/src/components/EmbedConfigForm.tsx) | Preview failures need owner-aware recovery copy. |
| BI axis | Databricks AI/BI adapter | Embeds Databricks dashboards where possible | Partial | [bi-adapters/databricks-aibi](../../bi-adapters/databricks-aibi/index.ts) | SDK/embed enablement and token plumbing are environment-sensitive. |
| BI axis | Databricks Genie iframe | Can show Genie space as embedded surface | Partial | [bi-adapters/databricks-genie](../../bi-adapters/databricks-genie/index.ts) | Iframe-only, no rich event/command bridge. |
| BI axis | Generic iframe fallback | Lets teams use existing BI URLs quickly | Working | [bi-adapters/generic-iframe](../../bi-adapters/generic-iframe/index.ts) | No metadata means Ask Pulse cannot fully know what the user sees. |
| BI axis | Tableau, Qlik, Looker fallback adapters | Future-vendor shape is present | Partial | `bi-adapters/tableau`, `qlik`, `looker` | Named vendors can be mistaken for SDK-grade integrations. |
| Native canvas | Governed result renderer | Turns attested AI result envelopes into KPI/table/chart/commentary | Working | [NativeCanvas.tsx](../../playground/src/visualization/NativeCanvas.tsx), [NativeBIAdapter.ts](../../bi-adapters/native/NativeBIAdapter.ts) | Production gate blocks un-attested renders by design; message must explain why. |
| Chart UX | Chart rationale and click-to-switch | Explains why a chart was chosen and offers alternatives | Working | `ChartRationalePill.tsx`, `chartRationale.ts` | Rationale is chart-shape logic, not full data lineage. |
| AI axis | Connector-agnostic proxy | One backend routes to Genie, OpenAI, Bedrock, Foundation, Supervisor, ResponsesAgent, Power BI DAX | Working | [proxy/server.js](../../proxy/server.js), [PROXY_REFERENCE.md](../PROXY_REFERENCE.md) | Backend breadth is ahead of answer-quality evaluation coverage. |
| AI axis | AISidebar | Native Ask surface with BI context, discovery, pack, frame picker, usage indicator | Working | [AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | Overlaps with ported Ask Pulse surface; needs one user-facing story. |
| AI Insights | Ported Pulse briefing experience | Mature generated sections, refresh, provenance, SQL, actions | Working | [PulseShell.tsx](../../playground/src/components/PulseShell.tsx), `playground/src/pulse/*` | It can feel like a different product layer from native Ask and Settings. |
| Ask Pulse | Conversational follow-up | Lets Viewer ask in business language | Working | `playground/src/pulse/*`, [AISidebar.tsx](../../playground/src/components/AISidebar.tsx) | Latency and evidence depth remain product-level risks. |
| Discovery | `/assistant/probe` and `/assistant/discover` | Suggests reachable analysis frames and pack context | Partial | `proxy/lib/connectorProbe.js`, `proxy/lib/discoveryEngine.js` | Cache/freshness and BI metadata limitations are not visible enough. |
| Knowledge | Pack and sub-vertical selection | Adds business vocabulary and KPI context | Partial | [PACKS.md](../PACKS.md), `proxy/lib/packRegistry.js` | Pack context can overpromise if users expect full governed RAG/citations. |
| Knowledge | KnowledgeShell | Read-only browser for packs, glossary, ontology, references, runtime context | Partial | [KnowledgeShell.tsx](../../playground/src/knowledge/KnowledgeShell.tsx) | Reads more like an admin document browser than a guided grounding preview. |
| Governance | Server attestation and fail-closed native rendering | Keeps trusted result rendering server-backed | Working | [governance.js](../../proxy/lib/governance.js), `visualization/governance.ts` | Viewer needs simple trust language, not internal enforcement terms only. |
| Governance | Allowlist and iframe sandbox | Limits what can be embedded and how | Working | [BIPanel.tsx](../../playground/src/biPanel/BIPanel.tsx), [SECURITY.md](../SECURITY.md) | Safe blocking can look like arbitrary failure unless owner and next step are shown. |
| Launchpad | Databricks asset discovery | Discovers dashboards, Genie spaces, endpoints, apps, warehouses | Partial | [LaunchpadShell.tsx](../../playground/src/launchpad/LaunchpadShell.tsx) | Currently feels like inventory; should become "choose assets for this experience." |
| Workbench | Unified artifact workflow preview | Previews verified/native/hybrid Genie artifact path | Partial | [WorkbenchShell.tsx](../../playground/src/workbench/WorkbenchShell.tsx) | Preview copy is developer-progress oriented; not primary Viewer journey. |
| Power BI | Power BI Q&A route | Tactical bridge to Microsoft-hosted Q&A | Partial | [PowerBiQnARoute.tsx](../../playground/src/powerbi/PowerBiQnARoute.tsx), [POWERBI_DAX_QNA_ENABLEMENT.md](../POWERBI_DAX_QNA_ENABLEMENT.md) | Microsoft retires Q&A on December 31, 2026. |
| Power BI | Deterministic semantic-model DAX | No-LLM questions over Power BI semantic model templates | Partial | `proxy/lib/powerbiDaxTemplates.js`, [POWERBI_DAX_QNA_ENABLEMENT.md](../POWERBI_DAX_QNA_ENABLEMENT.md) | Normal Ask routing, env field mapping, and RLS/OBO are not fully wired. |
| Efficiency | Token/session efficiency indicator | Coaches focused questions and fresh sessions | Working | `SustainabilityIndicator.tsx`, `usageTracker.ts` | "Sustainability" wording can imply climate/account-spend claims not measured by code. |
| Diagnostics | Proxy health, diagnostics, support bundle, dev tools | Helps Support and Developer users debug | Partial | Settings System/Advanced, [PROXY_REFERENCE.md](../PROXY_REFERENCE.md) | Too visible to ordinary Authors unless separated by role/scope. |
| Deployment | Databricks Apps guide | Enterprise install runbook after the first hard deployment | Docs-only | [DEPLOY_DATABRICKS_APP.md](../DEPLOY_DATABRICKS_APP.md) | Docs are ahead of a fully smoothed deploy experience. |
| Deployment | Azure App Service guide | Azure hosting path and challenge matrix | Docs-only | [DEPLOY_AZURE_APP_SERVICE.md](../DEPLOY_AZURE_APP_SERVICE.md) | Auth/cost/resource approval remain live blockers. |
| Artifact | Desktop EXE enabler | Local packaged runtime for recon/demo | Partial | `enablers/desktop`, [adr/0010-artifact-strategy.md](../adr/0010-artifact-strategy.md) | Unsigned and not production distribution yet. |
| Downstream | Pulse PBI enabler | Power BI custom visual lane sharing proxy concepts | Working/partial | `enablers/pulse-pbi`, [PULSE_SYNC.md](../PULSE_SYNC.md) | Easy to confuse Power BI sandbox constraints with PulsePlay-native freedom. |

## Information Flow

### Authoring State Flow

1. Settings and setup choices are stored in local state and localStorage through `settingsStore`, `embedConfigStore`, and related stores.
2. `App.tsx` resolves the active profile, selected pack, BI vendor intent, layout mode, active surface, and runtime BI surface.
3. `BIPanel` mounts the selected BI adapter and enforces the embed allowlist and sandbox policy.
4. `AISidebar` receives active BI vendor, recent BI events, optional adapter metadata, selected pack, selected frame, and connector profile.
5. The proxy receives prompt and context, resolves the active backend profile, injects discovery and pack context, stamps governance, and returns the result.
6. The UI renders the result into Ask Pulse, AI Insights, Evidence Drawer, and optionally the native governed canvas.

### Viewer Ask Flow

1. Viewer lands on the author-selected default surface.
2. Context strip should tell them the BI source, AI connector, pack, and freshness.
3. Viewer asks a question in Ask Pulse or inspects AI Insights.
4. The app sends recent BI events, selected frame, discovery summary, and pack context.
5. Proxy routes to the correct connector.
6. Result returns with answer, SQL/query data where present, validation diagnostics, usage, governance, and source details.
7. Viewer sees the answer, optional chart, rationale, evidence, and next action.

### Trust Flow

Trust should move through the app in plain language:

- What source was used?
- Was the source live BI metadata, pack-only context, or a fallback?
- When was discovery fetched?
- What governance authority stamped the result?
- What request id should Support use?
- Was the output blocked, preview-only, or production-trusted?

Today, some of this exists technically, but it is unevenly exposed across AI Insights, AISidebar, Evidence Drawer, and NativeCanvas.

## Information Flow Risks

These are the most important context-loss or clarity risks found by the information-flow agent.

| Risk | Why it matters | Recommended fix |
|---|---|---|
| BI events are trimmed aggressively | Only a small subset of recent events reaches prompt context, and payloads are shortened. | Preserve timestamp, event type, adapter mode, page/filter scope, and freshness in a compact structured payload. |
| Discovery cache can become stale | Discovery can reuse old frames when BI metadata changes. | Include metadata fingerprint and BI URL/source in cache key; display fetched/expires time in UI. |
| Floating AI sidebar has weaker metadata | Split sidebar passes adapter metadata; floating mode can degrade discovery. | Pass the same `biAdapter` metadata source to all Ask surfaces. |
| `sourceRef` can be buried inside governance | Native fusion card may miss top-level source text. | Promote source/freshness into the rendered result envelope footer. |
| Pack selection persistence is not fully obvious | Settings-selected pack may not feel confirmed or visible in the live Ask context. | Show inferred vs author-confirmed pack, confidence, and source in the context strip. |
| Selected analysis frame lacks bound params | Selecting a frame does not yet bind measure/dimension/time scope. | Treat frame selection as a scoped task: measure, dimension, period, filters, confidence. |
| Unselected frame intent is ambiguous | It could mean free text, no suitable frame, or ignored suggestion. | Add explicit options: "Use free question", "No matching frame", "Choose suggested frame." |

## Author Journey Map

| Stage | Author question | Current touchpoints | What works | Friction | Target feeling | Design direction |
|---|---|---|---|---|---|---|
| Arrival | What is PulsePlay asking me to configure? | Root app, top readiness pill, FirstRunWizard, Settings Setup | Two-axis concept is strong | If wizard is dismissed, no persistent journey remains | "I know the path." | Make Setup Home the durable hub: Preflight, BI, AI, Knowledge, Governance, Smoke, Preview, Handoff. |
| Choose BI surface | What will my Viewers look at? | Setup BI card, BI group, Launchpad, embed form | Preview-first approach is practical | Auto/native/vendor is too much too early | "I can start simple." | Begin with "Paste or choose BI source", then offer "upgrade to SDK control." |
| Choose AI connector | Who answers questions? | Setup AI card, AI connector catalogue, profile probes | Profiles and probes exist | Catalogue overwhelms and mixes ready/unavailable options | "These are approved choices." | Show recommended/available profiles first; move full catalogue behind explore. |
| Add knowledge | What business language should the AI use? | Pack picker, KnowledgeShell, pack runtime tab | Pack system gives domain vocabulary | Knowledge Base reads like documentation, not setup help | "This improves answers." | Add grounding preview: key terms, KPIs, sample questions, source freshness. |
| Review governance | Is this safe and allowed? | BI governance, System/Security, allowlist, proxy docs | Strong guardrails | Policy facts can look editable or personally caused | "I know who owns each blocker." | Show current policy, source, freshness, impact, and owner. |
| Test | Does it actually work? | Test proxy/profile, probes, smoke docs | Test hooks exist | Results are scattered | "I can trust the setup." | One final smoke step: proxy, BI mount, AI answer, pack, governance, diagnostics export. |
| Save / publish | What changed and what is now live? | SettingsSaveBar, localStorage writes | Draft facade exists | Save semantics are not fully truthful because many settings write live | "I understand live vs draft." | Label fields as live now, draft, admin policy, or session-only; use "Review changes" where needed. |
| Handoff | What do I send to Admin or Support? | Deployment docs, diagnostics, support bundle | Docs are strong | UI does not create a redacted handoff | "Blocked is actionable." | Generate a redacted setup bundle: selected BI, profile, pack, failed checks, owners, no secrets. |

## Viewer Journey Map

| Stage | Viewer question | Current touchpoints | Delight | Friction | Target feeling | Design direction |
|---|---|---|---|---|---|---|
| Arrival | What am I seeing? | Default surface, surface switcher, dashboard/AI panels | Three-surface model is clear when surfaced | Context is not always explicit | "This is my business view." | Compact context strip: BI source, AI brain, pack, freshness. |
| Briefing | What changed or matters? | AI Insights | Mature sections, provenance, progress, refresh | Latency can be long | "I got the summary faster." | Progressive reveal, stale-while-refresh, and calmer status copy. |
| Dashboard inspection | Can I inspect the source view? | Dashboard/BIPanel/native canvas | Dashboard is a peer surface | Iframe fallback gives limited metadata | "The AI is reacting to what I see." | Make live-metadata vs fallback status visible. |
| Ask follow-up | Can I ask in my words? | Ask Pulse / AISidebar | Frame picker, poll status, SQL/evidence | Free text and suggested frames are not clearly separated | "I know how to ask well." | Offer suggested frames as optional helpers, with explicit free-question mode. |
| Trust answer | Why should I believe it? | Evidence drawer, SQL, validation, provenance, governance | Honest non-claims already exist | Full source, freshness, request id, and scope are not consistent | "I can inspect if I need to." | Footer on every answer: source, scope, freshness, request id, authority. |
| Visual result | Why this chart? | Native canvas, chart rationale | Chart rationale is a real delight moment | Rationale is not data lineage | "The app explains its choice." | Keep rationale but label it as visualization guidance; link evidence separately. |
| Recovery | What if it fails? | Error states, blocked states, docs | Fail-closed behavior is safe | Errors can read as product failure | "I know the next step." | Owner-aware messages: BI admin, platform team, security, Support. |
| Habit | Why come back? | AI Insights refresh, Ask follow-ups, session efficiency | Efficiency gesture can educate | "Sustainability" wording can distract | "PulsePlay helps me work cleaner." | Rename to token/session efficiency and keep it near Ask as a gentle coach. |

## Storytelling Model

PulsePlay should create an experience loop:

1. Start with what the user is already looking at.
2. Ask the next natural question.
3. Show the answer with source and scope.
4. Turn the answer into a usable visual or action.
5. Preserve enough context that the next question feels easier.

Three emotional layers should be present on every important page:

| Layer | What it means | Examples |
|---|---|---|
| Orientation | The user knows where they are and what state the system is in. | Active BI source, AI profile, selected pack, readiness state, default surface. |
| Confidence | The user knows what is trusted, blocked, stale, or preview-only. | Governance chip, source freshness, request id, policy owner, blocked reason. |
| Reward | The user gets a useful next action without extra work. | Suggested frames, chart rationale, copy/share, "switch to this view", setup task completion. |

Copy should stay calm. Avoid marketing-heavy claims. Good copy for PulsePlay sounds like:

- "This setup is ready to preview."
- "This answer used pack context only; live BI metadata was not available."
- "Power BI is mounted in secure preview. Interactive SDK actions need backend token mode."
- "Start a fresh conversation when the question changes topic."

## Cross-Page IA Findings

### What is coherent now

- The three surfaces - AI Insights, Ask Pulse, Dashboard - are the right Viewer model.
- Setup's three parent concepts - BI surface, AI assistant, domain knowledge - are the right Author model.
- The product is honest about preview, tactical, and retiring features in several places.
- Governance and fail-closed behavior are structurally strong.

### What is fragmented now

- Full-screen routes replace each other without a shared journey frame: Settings, Knowledge, Launchpad, Workbench, and Power BI Q&A each feel separate.
- Launchpad is currently an inventory browser, not clearly part of author setup.
- Knowledge Base is useful, but it reads like an internal content browser, not "why this pack improves answers."
- Workbench copy is engineering-progress oriented and should stay under preview/labs until the Viewer story is ready.
- Power BI Q&A is transparent but strategically awkward because it is tactical and retiring, while the durable DAX path is not yet wired into normal Ask.

## UX Principles For The Next Design Pass

1. Keep the two-axis story visible: BI surface and AI connector.
2. Separate Viewer, Author, Admin, and Support surfaces.
3. Make Setup Home a task list, not a card wall.
4. Reveal child fields only after the parent choice is made.
5. Show current state before controls.
6. Every status needs source, freshness, and owner where applicable.
7. Every error or block should name the next owner/action.
8. Keep advanced and support controls available but out of the ordinary path.
9. Put token/session efficiency near Ask, not as a live Settings gauge.
10. Do not claim live metadata, full RAG, Q&A durability, or production RLS until each path is actually proven.

## Recommended Figma Evolution

The Figma/design handoff should happen in this sequence.

| Step | Artifact | Why first / later |
|---|---|---|
| 1 | FigJam IA flow | The current problem is product choreography, not visual decoration. |
| 2 | Current-state journey map | Map one actor at a time, starting with the Author. |
| 3 | Service blueprint | Add the operational layers: browser UI, BI adapter, proxy, token issuance, connector profile, Databricks/Power BI constraints, logs, governance. |
| 4 | Annotated Figma frames | Create 3-5 frames only after the IA is agreed: Setup Home, BI config, AI connector, Knowledge/Governance, Preview/Handoff. |
| 5 | Component primitives | Shell layout, nav item, mode card, connector card, status chip, input group, test-result panel, save bar, preview panel. |
| 6 | Dev Mode / Code Connect | Use after primitives are stable and published, not before IA is decided. |

### Figma Connector Status

I attempted to generate the initial FigJam IA flow through the Figma connector with the title "PulsePlay Author And Viewer IA Flow." The connector returned a plan-selection blocker:

> Plan key is missing. The user must select a team or organization in the widget before the diagram can be generated.

So the Figma artifact is not created yet. The next Figma action is to select the correct team/organization in the connector widget, then generate the IA flow.

### Proposed Initial FigJam Flow

The first flow should show:

Author starts -> Setup Home -> BI surface -> AI connector -> Knowledge -> Governance -> Smoke Test -> Preview -> Handoff

Viewer opens experience -> Context strip -> AI Insights / Ask Pulse / Dashboard -> Evidence -> Native chart or answer -> Return habit

This should stay simple enough for brainstorming. The journey map and service blueprint come after agreement on this spine.

## Priority Findings

### P0 - Experience Strategy

| Finding | Recommendation |
|---|---|
| PulsePlay needs two explicit journeys, not one giant control panel. | Define Author Journey and Viewer Journey as first-class product modes. |
| Settings is overexposed. | Make Setup Home the entry point, with progressive child pages. |
| Viewer should not see author/deployment complexity. | Hide Settings, Launchpad, Workbench, Advanced, and most governance detail unless role/scope allows it. |

### P1 - Author Setup

| Finding | Recommendation |
|---|---|
| Setup lacks a durable progress path after wizard dismissal. | Add Preflight -> BI -> AI -> Knowledge -> Governance -> Smoke -> Preview -> Handoff. |
| Save semantics are not fully truthful. | Distinguish live, draft, policy, and session-only changes. |
| Tests are scattered. | Add one final readiness screen with `Ready`, `Ready with warnings`, or `Blocked`. |
| Governance looks like configuration even when it is policy. | Convert governance into review: source, freshness, impact, owner. |

### P1 - Viewer Trust

| Finding | Recommendation |
|---|---|
| Evidence is uneven across answer surfaces. | Standardize answer footer: source, scope, freshness, request id, authority. |
| Live BI metadata is not always available. | Show whether the answer used live metadata, pack-only context, or fallback context. |
| AI failures need recovery, not blame. | Use owner-aware recovery messages. |

### P1 - Information Flow

| Finding | Recommendation |
|---|---|
| Discovery can be stale. | Include metadata fingerprint in cache key and display fetched/expires time. |
| Pack selection needs clearer state. | Show inferred vs confirmed pack and confidence. |
| Source reference can be lost before native canvas. | Promote source/freshness into the result envelope display layer. |

### P2 - Engagement And Delight

| Finding | Recommendation |
|---|---|
| Token/session efficiency is a good educational gesture. | Rename from sustainability, calm the copy, and keep it near Ask. |
| Chart rationale is a strong delight feature. | Keep it, but pair it with evidence/source so users do not confuse chart logic with data lineage. |
| Launchpad has high value but weak story. | Reframe it as "choose live workspace assets for this experience." |

## Brainstorming Questions

Use these for the next session. Do not implement before these decisions are made.

1. Should the first north-star journey be Author setup or Viewer Ask?
2. Should Setup Home become the default entry point for Authors after first run?
3. Should Launchpad be merged into Setup as "Choose from Databricks workspace assets"?
4. Which Viewer context strip fields are mandatory: BI source, AI connector, pack, freshness, governance, request id?
5. Should Power BI Q&A remain a separate route, move under Labs, or appear only for semantic-model profiles?
6. What is the first Figma artifact after team/organization plan selection: IA flow, Author journey map, or annotated Setup Home frame?
7. Which controls should be role-gated for Viewer, Author, Admin, and Support?
8. What is the minimum "Ready to preview" smoke result?
9. What language should we use for token/session efficiency so it educates without moralizing?
10. What must be true before we call any vendor adapter production-grade?

## Recommended Next Action

For the brainstorming session, start with the Author journey. It is the control point for the entire product: if setup is confusing, every later Viewer experience can be misconfigured. The first implementation after brainstorming should be a progressive Setup Home and readiness model, not a cosmetic repaint.

The Viewer journey should be designed in parallel at the flow level, but implemented after Author setup can reliably produce a clean, validated experience.

