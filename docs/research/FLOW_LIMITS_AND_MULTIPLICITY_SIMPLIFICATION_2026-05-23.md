# Flow Limits And Multiplicity Simplification

Date: 2026-05-23

Status: Product-flow synthesis and recommendation brief. No runtime code changed.

Purpose: answer Rajesh's request to explore the current limits, what else can be added, how flows can be simplified, what the end-user journey should become, and how PulsePlay should reduce multiplicity without losing enterprise depth.

Related docs:

- [SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md](SIMPLIFIED_CONTEXT_AND_AUTHORING_MODEL_2026-05-23.md)
- [BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md](BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md)
- [ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md](ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md)
- [MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md](MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md)
- [PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md](PERSONA_AND_FIRST_LAUNCH_ARCHITECTURE_2026-05-23.md)
- [SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md](SETTINGS_PROGRESSIVE_DESIGN_RESEARCH_2026-05-22.md)

## Executive Recommendation

PulsePlay should become simpler by making the product feel like one guided experience instead of many capable controls.

The app should expose only three setup decisions in the normal path:

```text
1. What should the user look at?
   BI Surface

2. Who should answer?
   AI Assistant

3. What business context should the answer use?
   Business Context
```

Everything else should become a child of those decisions:

- org type,
- sector,
- sub-vertical,
- pack,
- preset,
- metric direction,
- guided filters,
- starter questions,
- strategic lens,
- references,
- trusted content,
- knowledge base,
- source freshness,
- citation behavior.

The product should stop asking the user to choose all of those as separate peers. PulsePlay should generate them from Business Context, then let the Author review and override only where needed.

## Hard Limits We Must Respect

These are the real limits that should shape the next design. Ignoring them will make the UI look polished while remaining confusing.

### 1. Human Cognitive Limit

Users cannot understand seven overlapping selection systems at once.

Current competing choices:

| Current choice | What it really means | Target owner |
|---|---|---|
| Persona | Layout / starting preference | Viewer preference, not setup |
| Org type | Business context | Business Context |
| Sector | Focus area | Business Context |
| Pack | Source vocabulary | Business Context |
| Sub-vertical | Focus area | Business Context |
| Custom section preset | Generated insight template | Generated Defaults Review |
| Metric preset | Generated KPI behavior | Generated Defaults Review |
| Guided filter | Suggested exploration shortcut | Runtime suggestion from BI metadata + Business Context |
| Strategic lens | Narrative framing | Generated Defaults Review child |
| Adjust | Temporary answer refinement | Ask surface only |

Recommendation: show only parent choices first. Child controls appear only after the parent choice creates meaning.

### 2. Trust And Source Limit

PulsePlay cannot claim "governed" just because a pack or template exists.

The Business Context claims audit found:

- `sme-reviewed` is currently overclaimed.
- some source IDs are invented or weak,
- GA4 supports ecommerce event taxonomy but not ROAS/CAC/LTV formulas,
- SCI supports software carbon intensity but not PUE,
- packaging circularity needs packaging/circularity sources, not only GHG Scope 3.

Recommendation: add source hardening before visual rollout. User-facing generated defaults must show confidence: draft, inferred, author-confirmed, source-reviewed, or SME-reviewed.

### 3. BI Visibility Limit

PulsePlay may not know everything inside an embedded BI surface.

| BI mode | What PulsePlay can know | UX implication |
|---|---|---|
| Native governed canvas | Full render envelope, governance, rows/spec where provided | Strongest trust language |
| Power BI SDK | More events/filters/metadata when authenticated and wired | Good trust language after token/RLS work |
| Generic iframe | URL and iframe status, limited or no semantic context | Must say "limited view context" |
| Tableau/Qlik/Looker fallback iframe | Renderable but not SDK-grade yet | Must not imply full vendor integration |

Recommendation: the context strip must say the context quality, not just the vendor name.

### 4. Identity And Persistence Limit

The product is currently open/anonymous-friendly, but local state is not yet properly user-scoped.

Implications:

- a first-run wizard dismissal can affect the next user on the same browser,
- personalization cannot be safely treated as account-level,
- "remembered" preferences are per-browser unless identity sync is implemented.

Recommendation: treat identity as optional. Use honest copy:

```text
Working in this browser
Sign in to save across devices
```

### 5. Save Semantics Limit

Some settings write live while the UI implies a draft/save model.

Recommendation: each field needs a lifecycle label:

| Lifecycle | Meaning |
|---|---|
| Live now | Applies immediately in this browser |
| Draft | Requires Save / Apply |
| Session only | Resets after session or refresh |
| Admin policy | Read-only; controlled by deployment |
| Support diagnostic | Used for debugging, not viewer behavior |
| Handoff item | Needs admin/deployer action |

The Save bar should never promise staging for fields that already wrote live.

### 6. Cost And Deployment Limit

Azure/App Service and Databricks deployment work exists, but this is still a personal/free-credit environment and several production auth paths are unresolved.

Recommendation: design the app so local/demo mode, Databricks App mode, Azure App Service mode, and enterprise SSO mode are visible deployment states, not hidden assumptions.

### 7. AI Quality Limit

Different connectors have different capabilities.

| Connector type | Limit |
|---|---|
| Genie | Strong for governed Databricks spaces, but API behavior and message model have known limits |
| Foundation Model / Azure / Bedrock | Strong language model paths, but source grounding depends on provided context |
| Power BI semantic-model | Deterministic DAX path, but not fully wired into normal Ask flow yet |
| Power BI Q&A | Tactical only; Microsoft retires Q&A on 2026-12-31 |

Recommendation: the UI should show answer mode: deterministic, governed BI, LLM with context, preview, or blocked.

## The Simplified Product Model

Use a three-parent mental model:

```text
PulsePlay Experience

  Surface
    What the viewer sees.

  Assistant
    Who answers and what route it uses.

  Business Context
    What vocabulary, KPIs, source expectations, and suggested questions shape the answer.
```

Everything in the app should answer one of five questions:

1. What am I looking at?
2. Who is answering?
3. What context is being used?
4. Why can I trust this?
5. What can I do next?

If a feature does not answer one of these questions, it belongs in Advanced, Observability, or Labs.

## Target End-User Journey

The end user should not start with setup.

### First 60 Seconds

```text
0s
User lands on PulsePlay.
They see a finished insight or dashboard, not a wizard.

5s
Context strip tells them:
Surface: Power BI Sales Dashboard
Assistant: Databricks Genie
Business Context: CPG / Supply Chain
Context quality: live metadata / limited iframe / sample data

10s
Ask surface shows 3-5 starter questions.
The user can ask in plain English.

20s
Answer streams in with compact trust footer:
source, scope, freshness, request id, governance, confidence.

30s
User can inspect evidence or refine the answer.

60s
User understands how PulsePlay saves time without seeing infrastructure setup.
```

### Daily Viewer Loop

```text
Open experience
  -> See current BI surface and AI briefing
  -> Ask follow-up
  -> Read answer with source/freshness
  -> Inspect evidence only when needed
  -> Refine this answer
  -> Save/share/export or continue
```

### Viewer Controls To Keep

| Control | Why |
|---|---|
| Ask composer | Primary action |
| Starter questions | Reduces blank-page anxiety |
| Refine this answer | Clear scoped adjustment |
| Evidence drawer | Trust without clutter |
| Source/freshness/request-id footer | Enterprise confidence |
| Token/session efficiency chip | Gentle digital wellbeing near the AI action |
| View switcher | AI Insights / Ask / Dashboard only |

### Viewer Controls To Hide

Hide these from the normal end-user path:

- org type,
- pack picker,
- sector picker,
- connector catalogue,
- model endpoint details,
- embed token details,
- vector search index,
- UC metric view configuration,
- custom section presets,
- metric direction presets,
- Strategic Lens selector,
- governance policy editor,
- support diagnostics,
- developer tools.

## Target Author Journey

The Author journey should be progressive and review-based.

```text
Authoring Home
  -> Choose BI Surface
  -> Choose AI Assistant
  -> Choose Business Context
  -> Review Generated Defaults
  -> Review Sources And Governance
  -> Test As Viewer
  -> Publish / Handoff
```

### Authoring Home

The first Authoring screen should be a task list, not a settings inventory.

| Task | Status | Opens |
|---|---|---|
| BI Surface | Missing / Needs test / Ready | Surface mode and connection |
| AI Assistant | Missing / Needs test / Ready | Approved profiles and test |
| Business Context | Inferred / Author confirmed / Needs source review | Business Context chooser |
| Generated Defaults | Needs review / Accepted / Has overrides | templates, KPIs, starter questions |
| Sources And Governance | Draft / Blocked / Ready | source cards, policy, citations |
| Test As Viewer | Locked / Ready / Passed | viewer preview and smoke |
| Handoff | Needs admin / Ready | redacted setup bundle |

### Business Context Chooser

The chooser should use simple words:

```text
Business Context
Retail / Digital Commerce
  Focus area: Growth marketing
  Optional overlay: Sustainability
```

Do not show:

```text
Org type + Sector + Pack + Sub-vertical + Preset + Metric preset
```

### Generated Defaults Review

After context selection, show one review page:

| Generated item | Example | Action |
|---|---|---|
| Insight template | Executive brief, trends, risks, actions | Accept / Edit |
| KPI behavior | ROAS higher-is-better, Inventory target-band | Accept / Override |
| Starter questions | "Which campaign drove growth?" | Accept / Hide / Edit |
| Guided filters | Region, product category, campaign | Accept / Hide |
| Strategic lens | Risk review / Growth diagnosis / Operations health | Accept / Change |
| Sources | GA4 taxonomy, internal finance glossary | Review required |

Each generated item needs:

- why suggested,
- source IDs,
- confidence,
- affected screens,
- override status.

This single page replaces many current scattered selectors.

## Multiplicity Collapse Map

| Today | Collapse into | UI location |
|---|---|---|
| First-run persona | Personalize layout | Viewer preference drawer |
| Org type | Business Context | Authoring -> Business Context |
| Sector | Focus area | Authoring -> Business Context |
| Pack | Business Context source | Authoring -> Business Context |
| Sub-vertical | Focus area | Authoring -> Business Context |
| Pack source register | Sources | Business Context -> Sources And Governance |
| Knowledge base | Grounding source | Business Context -> Sources And Governance |
| Custom section preset | Insight template default | Generated Defaults Review |
| Metric direction preset | KPI behavior default | Generated Defaults Review |
| Guided filters | Suggested filters | Generated Defaults Review and runtime chips |
| Strategic Lens | Narrative lens | Generated Defaults Review child |
| Adjust | Refine this answer | Ask answer toolbar |
| AI response behavior | Answer style | Advanced under Assistant |
| Supervisor fusion | Connector capability | Assistant -> Advanced |
| Power BI Q&A | Lab / tactical bridge | Labs, not core Viewer flow |
| Workbench | Lab | Labs |
| Launchpad | Assets | Authoring / Assets |

## What Else Can Be Added

Add these because they reduce confusion or make trust visible.

### 1. Context Bar

Persistent, compact, visible on Viewer and Author preview:

```text
Surface: Sales Dashboard
Assistant: Genie
Business Context: CPG / Supply Chain
Context quality: Live metadata
Freshness: 2m ago
```

Why: it answers "what is this answer using?" without making users open Settings.

### 2. Context Quality Badge

Values:

- Full context,
- Limited iframe context,
- Pack-only context,
- Sample data,
- Source review required,
- Blocked.

Why: prevents over-trust when iframe metadata is limited.

### 3. Generated Defaults Review

One page that displays all generated setup decisions and their reasons.

Why: this is the central mechanism for killing multiplicity.

### 4. Source Proof Drawer

A drawer that shows:

- source title,
- publisher,
- URL or internal path,
- tier,
- last verified date,
- supported claim,
- source confidence,
- review owner.

Why: enterprise users trust traceability, not generic badges.

### 5. "Why Suggested" Panel

Every generated default should answer:

```text
Suggested because:
- selected Business Context is Retail / Growth Marketing
- BI metadata contains Campaign, Spend, Revenue, Orders
- source register includes GA4 ecommerce taxonomy
```

Why: it educates the Author and prevents magic.

### 6. Redacted Handoff Bundle

Author can generate a setup summary:

- selected surface,
- selected assistant,
- Business Context,
- source review status,
- failed checks,
- admin actions needed,
- request ids,
- no secrets.

Why: turns blocked setup into an actionable enterprise workflow.

### 7. Ask Coach

Small, optional helper near Ask:

- "Ask about a metric + time range."
- "Try: compare this month with last month."
- "Focused questions use fewer tokens."

Why: improves digital wellbeing without making climate claims.

### 8. "What We Learned" Personalization Panel

Only after behavior tracking is implemented:

- usual landing surface,
- preferred density,
- most used question types,
- reset / stop adapting.

Why: personalization must be visible and reversible.

### 9. Labs Isolation

Move experimental surfaces under Labs:

- Workbench,
- Power BI Q&A bridge,
- experimental artifact renderers,
- connector experiments.

Why: prevents tactical/preview features from diluting the core journey.

### 10. Recovery Owner Chips

Every blocked/error state should say owner:

- Author,
- BI admin,
- platform admin,
- security owner,
- support.

Why: "blocked" becomes manageable instead of frightening.

## What Not To Add Yet

Do not add these until the parent model is clean:

| Do not add | Why |
|---|---|
| Another top-level Strategic Lens selector | Recreates multiplicity |
| More persona cards | The user said persona is confusing and should not be asked first |
| Separate sector/org/pack dropdowns | Same decision repeated |
| Live sustainability gauge in Settings | Measurement belongs near Ask; current data is token/session efficiency only |
| More Settings cards | The issue is too many open cards already |
| Vendor-specific full pages for Tableau/Qlik/Looker before SDK maturity | Named pages can imply production integrations |
| Power BI Q&A as primary path | Microsoft retires Q&A on 2026-12-31 |
| AI "magic recommendations" without source proof | Undermines trust |

## Navigation Simplification

Target top-level navigation:

| New area | Replaces / absorbs |
|---|---|
| Experience | AI Insights, Ask Pulse, Dashboard |
| Authoring | Settings Setup, BI, AI, Business Context, Governance, Preview, Handoff |
| Knowledge | Pack browser, glossary, KPIs, references, source proof |
| Assets | Launchpad, BI assets, Genie spaces, metric views |
| Observability | Diagnostics, request ids, support bundle, health |
| System | Auth, hosting, security posture, policies |
| Labs | Workbench, Power BI Q&A, experiments |

Keep existing routes internally. The visible story should change first; route refactor can happen gradually.

## Screen-Level North Star

### Viewer Experience

```text
+--------------------------------------------------------------------------------+
| PulsePlay       Ask or search...            Surface | Assistant | Context | Fresh |
+----------+---------------------------------------------------------------------+
| Nav      | AI briefing / answer card                                              |
|          | Trust footer: source | scope | freshness | request id | confidence    |
|          +---------------------------------------------------------------------+
|          | Ask composer + starter questions + token/session efficiency             |
|          +---------------------------------------------------------------------+
|          | Dashboard / native canvas / embedded BI                                 |
+----------+---------------------------------------------------------------------+
```

### Authoring Home

```text
+--------------------------------------------------------------------------------+
| Authoring    Current experience: Power BI + Genie + CPG Supply Chain             |
+----------+---------------------------------------------------------------------+
| Steps    | Setup readiness task list                                               |
|          | 1 BI Surface             Ready                                          |
|          | 2 AI Assistant           Needs test                                     |
|          | 3 Business Context       Source review required                         |
|          | 4 Generated Defaults     Needs review                                   |
|          | 5 Sources/Governance     Blocked                                        |
|          | 6 Test As Viewer         Locked                                         |
|          | 7 Handoff                Waiting                                        |
|          +---------------------------------------------------------------------+
|          | Right rail: why blocked, owner, next action, docs                        |
+----------+---------------------------------------------------------------------+
```

### Generated Defaults Review

```text
+--------------------------------------------------------------------------------+
| Business Context: Retail / Growth Marketing                                      |
| Confidence: Draft | Sources: 2 verified, 3 need review                           |
+--------------------------------------------------------------------------------+
| Generated defaults                                                               |
| Insight template       Suggested because...                 Accept | Edit        |
| KPI behavior           Suggested because...                 Accept | Override    |
| Starter questions      Suggested because...                 Accept | Hide        |
| Guided filters         Suggested because...                 Accept | Hide        |
| Strategic lens         Suggested because...                 Accept | Change      |
+--------------------------------------------------------------------------------+
```

## Implementation Sequence

### Slice 1 - Stop The Overclaim

Implement before any visual rollout:

1. Business Context source validator.
2. Remove default `sme-reviewed`.
3. Correct source IDs and source tiers.
4. Mark draft thresholds as configurable.
5. Add tests that fail on unsupported source claims.

### Slice 2 - Build The Parent Model

1. `AuthoringStateSnapshot`.
2. `BusinessContextProfile` as canonical context owner.
3. `GeneratedDefaults` with per-item provenance and override status.
4. Search aliases route all duplicate terms to Business Context.

### Slice 3 - Simplify The Visible Flow

1. Authoring Home task list.
2. Context Bar.
3. Business Context chooser.
4. Generated Defaults Review.
5. Sources And Governance review.

### Slice 4 - Viewer First

1. Remove blocking first-run persona wizard from normal landing.
2. Show finished insight / sample state first.
3. Add 3-5 starter questions.
4. Add trust footer to every answer.
5. Move token/session efficiency near Ask.

### Slice 5 - Power User Layer

1. Command palette.
2. Navigate/configure/ask/test actions.
3. Aliases for Power BI, DAX, token, governance, source, pack, preset, filter, handoff.
4. Keyboard-first tests.

### Slice 6 - Enterprise Handoff

1. Redacted support/deployer bundle.
2. Owner chips for blockers.
3. Test-as-viewer preview.
4. Publish/handoff checklist.

## Acceptance Criteria

PulsePlay is simplified when:

- an end user can use the app without seeing setup controls,
- an Author sees one setup task path, not many peer cards,
- Business Context owns pack, sector, preset, template, metric behavior, starter questions, and source expectations,
- Generated Defaults Review is the only normal place where templates/filters/lenses/metric rules are accepted,
- Adjust is renamed/scoped to `Refine this answer`,
- source proof is visible before trust claims,
- mobile still shows parent navigation,
- command palette finds tasks by natural words,
- Labs/preview surfaces are clearly marked,
- no UI claims `sme-reviewed` without a real source/SME marker.

## Bottom Line

The simplification is not "remove features." It is "make one parent decision generate many child defaults."

For the Viewer, PulsePlay should feel like:

> I see my dashboard, I ask a question, I trust the answer.

For the Author, PulsePlay should feel like:

> I choose the surface, assistant, and business context; PulsePlay generates the rest; I review sources, test as viewer, and hand it off.

That is the path to making the application lean, loving, and enterprise-ready without losing the powerful machinery already built.
