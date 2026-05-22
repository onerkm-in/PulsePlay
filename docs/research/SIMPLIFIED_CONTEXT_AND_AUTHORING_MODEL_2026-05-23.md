# PulsePlay Simplified Context And Authoring Model

Date: 2026-05-23

Status: Product and UX decision brief. No runtime code changed.

Purpose: resolve the current multiplicity around org type, persona presets, knowledge packs, sectors, custom-section presets, metric presets, guided filters, and Adjust controls. This document turns the confusion into a single implementation-ready model for the next design and engineering cycle.

Related docs:

- [AI_CONTEXT_CONFIGURATION_MODEL.md](../AI_CONTEXT_CONFIGURATION_MODEL.md)
- [KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md](../KNOWLEDGE_BASE_SOURCE_GOVERNANCE.md)
- [STRUCTURED_AUTHORING_STANDARD.md](../STRUCTURED_AUTHORING_STANDARD.md)
- [BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md](BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md)
- [ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md](ENTERPRISE_UX_ARCHITECTURE_BLUEPRINT_2026-05-23.md)
- [MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md](MULTI_AGENT_DEEP_STUDY_ALL_AREAS_2026-05-23.md)

## Executive Decision

PulsePlay should not ask the author to make the same business-context decision in multiple places.

The user should make one clear choice:

```text
Business Context
  = Knowledge pack
  + focus area / sub-vertical
  + optional overlays
```

From that single choice, PulsePlay should derive:

- recommended insight templates,
- KPI vocabulary and metric direction rules,
- starter questions,
- guided filters,
- Ask Pulse suggestions,
- business guidance,
- retrieval and citation expectations,
- trust and source badges,
- generated preview defaults.

This means the app should stop presenting org type, sector, preset, metric preset, and guided-template selectors as unrelated decisions. They are projections of one underlying context.

## Brutal-Honest Diagnosis

The current confusion is not caused by one bad dropdown. It is caused by several independently useful controls competing to describe the same thing:

| Current surface | What it asks today | Why it confuses |
|---|---|---|
| First-run wizard | Persona: Analyst / Executive / Developer / Designer | This is a UI/layout preference, but it looks like a business-role decision. It conflicts with the two actual product audiences: Viewer and Author. |
| Pack picker | Pack and sub-vertical | This is the right source of truth, but the label "Pack" feels technical and is repeated in more than one place. |
| AI Settings | Knowledge pack, Vector Search KB, UC Metric View, response behavior | Mixes business context, grounding source, connector behavior, and output style at the same visual level. |
| AI Insights settings | Authoring mode, domain, custom sections, guidance, metric rules | Recreates the same domain/context decision with separate preset and metric-rule controls. |
| Pulse setup step 5 | Domain, section presets, metric presets, guided filters | Strong functionality, but it reads like many separate setup choices instead of one generated recommendation set. |
| Adjust menu | Runtime summary changes | Useful, but it can feel like another setup/preset system unless clearly scoped to "this answer only." |
| Guided filters | Filter chips under the chat area | Useful for exploration, but should be derived from BI metadata and business context, not authored as a parallel configuration lane. |

Gemini's proposed `SettingsQuerySync` wrapper is technically useful for deduplicating allowlist fetching through TanStack Query. It is not the first UX fix. Cache sync can prevent duplicate network reads; it does not make duplicate product concepts disappear. The right order is:

1. Define one canonical context model.
2. Make Settings and runtime surfaces consume that model.
3. Then clean up fetch/cache synchronization underneath it.

Important gate added after claim audit: implement source hardening before UI hardening. [BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md](BUSINESS_CONTEXT_CLAIMS_AUDIT_2026-05-23.md) found that the draft direction currently overclaims `sme-reviewed`, contains invented or weak source IDs, and must validate citation/source authority before generated defaults become user-facing.

## Two User Sets Only

PulsePlay should design around two users for now.

### 1. End User / Customer

Goal: use the app daily because it is useful, fast, trustworthy, and low-friction.

The end user should not configure org type, domain, preset libraries, metric rules, knowledge packs, or connector details. They should land in the experience with enough context already prepared by an Author.

Primary needs:

- Understand what BI asset they are looking at.
- Ask questions naturally.
- See AI Insights and Ask Pulse answers that match the visible business context.
- Refine an answer quickly without changing the global setup.
- See why an answer is trustworthy: source, freshness, request id, governance posture, and citations/evidence.
- Learn small digital-wellbeing habits without climate overclaiming.

End-user controls should be limited to:

- Ask input.
- Suggested questions.
- "Refine this answer" actions.
- Evidence/source drawer.
- View mode or density if appropriate.
- Token/session efficiency near the Ask surface, not as a live Settings gauge.

### 2. Author

Goal: configure a reliable experience for customers and hand it off with confidence.

Authors own the progressive setup:

```text
1. BI Surface
2. AI Connector
3. Business Context
4. Generated Defaults Review
5. Governance And Sources
6. Test As Viewer
7. Handoff
```

Authors should see the reasoning behind generated defaults, but they should not be forced through many parallel select lists. The setup should say:

> "Based on CPG / Supply Chain, PulsePlay will use these KPI definitions, metric directions, insight sections, starter questions, guided filters, and source expectations. Review or override only where needed."

## Canonical Model

Introduce a single pure model named `BusinessContextProfile`.

```ts
export type BusinessContextConfidence =
    | "inferred"
    | "author-confirmed"
    | "sme-reviewed"
    | "deprecated";

export interface BusinessContextProfile {
    id: string;
    displayName: string;
    shortLabel: string;
    pack: string;
    subVertical?: string;
    overlays: string[];
    audienceLabel: string;
    confidence: BusinessContextConfidence;
    provenance: {
        sourceRegisterPath?: string;
        sourceIds: string[];
        owner?: string;
        lastReviewedAt?: string;
    };
    glossary: Array<{
        term: string;
        definition: string;
        sourceIds: string[];
    }>;
    kpis: Array<{
        id: string;
        label: string;
        description?: string;
        formula?: string;
        direction: "higher-is-better" | "lower-is-better" | "target-band" | "neutral";
        thresholds?: Array<{
            tone: "good" | "watch" | "risk";
            expression: string;
        }>;
        sourceIds: string[];
    }>;
    insightTemplates: Array<{
        id: string;
        label: string;
        sections: Array<{ name: string; instruction: string }>;
        generatedFrom: "pack" | "overlay" | "author-override";
    }>;
    starterQuestions: Array<{
        id: string;
        label: string;
        prompt: string;
        intent: "summary" | "diagnostic" | "risk" | "opportunity" | "what-if" | "follow-up";
        sourceIds: string[];
    }>;
    guidedFilters: Array<{
        field: string;
        label: string;
        reason: string;
        source: "bi-metadata" | "pack" | "author-override";
    }>;
    retrievalPolicy: {
        citationMode: "required" | "when-available" | "off";
        freshnessExpectation?: string;
        allowedSourceTiers: string[];
    };
}
```

### Ownership Rule

`BusinessContextProfile` is owned by the Authoring layer and consumed by runtime surfaces.

```text
Authoring owns:
  pack selection
  sub-vertical selection
  overlays
  source review
  generated defaults review
  overrides

Runtime consumes:
  starter questions
  Adjust suggestions
  guided filters
  metric coloring
  insight template choices
  evidence/source labels
```

Runtime must not create an independent business context unless the user is explicitly in Author preview mode.

## Collapse Matrix

| Current concept | Keep? | New name / owner | UX decision |
|---|---|---|---|
| Persona presets | Mostly remove from default path | `User intent`: View experience / Configure experience | Replace Analyst/Executive/Developer/Designer with the two real roles. UI layout can be a preference later. |
| Org type | Collapse | `Business Context` | Do not expose separately if pack/sub-vertical already expresses it. |
| Sector | Rename | `Focus area` | Use friendly language. "CPG / Supply Chain" is a context, not another separate sector switch. |
| Knowledge pack | Keep | `Business Context source` | It is the canonical source, but the user-facing label should be Business Context. |
| Sub-vertical | Keep | `Focus area` | Lives only inside Business Context selection. |
| Sustainability | Keep as overlay | `Sustainability overlay` | Cross-cutting overlay that adds ESG/Scope/packaging/water/waste guidance without replacing the main context. |
| Custom-section presets | Derive | `Generated insight templates` | Author reviews generated defaults. It should not appear as a separate first-class picker in the normal path. |
| Metric direction presets | Derive | `Generated KPI behavior` | Show as preview and allow advanced overrides. |
| Domain guidance | Merge | `Business guidance` | Pack prompt context plus author notes. Avoid separate `domainGuidance` and `insightsDomainGuidance` prompts in the normal UI. |
| Guided filters | Derive | `Suggested filters` | Derived from BI metadata plus Business Context. End user can use chips; Author can review why they appear. |
| Adjust | Keep but rename/scope | `Refine this answer` | Temporary answer-level refinement. It must not look like setup. |
| Template gallery | Keep as review mode | `Generated defaults` | Show "why this template was suggested" and references. |
| Vector Search KB / UC Metric View | Keep under grounding | `Grounding sources` | Advanced/source section inside Authoring, not peers of Business Context. |

## Target Author Flow

### Step 1: BI Surface

Intent: connect or select what the viewer sees.

Behavior:

- Pick BI vendor or native dashboard mode.
- Enter secure embed details or select an asset.
- Run a reachability/allowlist check.
- Do not ask for sector/domain/preset here.

Reusable components:

- `SetupGate`
- `ModeCard`
- `InlineProbeResult`
- `PolicyCallout`

State:

- Writes BI vendor/config through governed setters.
- Produces a BI metadata snapshot for later filter/template suggestions.

### Step 2: AI Connector

Intent: choose what answers questions.

Behavior:

- Choose an approved profile.
- Test profile reachability.
- Show profile type, auth mode, and governance posture.
- Do not show business templates here.

State:

- Writes active AI profile.
- Produces connector capability metadata: streaming support, citations, tool support, cost/tokens availability.

### Step 3: Business Context

Intent: choose the one canonical context.

Behavior:

- Show one selector labelled `Business context`.
- Inside it, allow pack and focus area selection.
- Display a compact explanation:
  - "This controls KPI vocabulary, starter questions, templates, metric coloring, guided filters, and evidence expectations."
- If probe inference suggests a context, label it as suggested and require confirmation.
- Optional overlays such as Sustainability sit here.

State:

- Writes `BusinessContextProfile`.
- Updates the generated defaults preview.

### Step 4: Generated Defaults Review

Intent: make reasoning visible without forcing manual setup.

Behavior:

- Show one review page with tabs:
  - Insight templates
  - KPI behavior
  - Starter questions
  - Guided filters
  - Grounding and references
- Each recommendation must answer:
  - What was generated?
  - Why was it generated?
  - What source or pack module supports it?
  - Is it safe to use as-is?
- Default action is `Accept generated defaults`.
- Advanced action is `Override`.

State:

- Generated defaults are deterministic projections of `BusinessContextProfile`.
- Overrides are stored separately as author overrides, not by mutating the pack.

### Step 5: Governance And Sources

Intent: prove the content is trustworthy.

Behavior:

- Surface source register status.
- Show source tiers, last reviewed date, owner, confidence, and missing-source warnings.
- Do not default governance to "verified" unless the evidence exists.
- Show unresolved issues as blockers before publish.

State:

- Produces publish blockers for missing source register, stale source, unreviewed prompt context, missing KPI provenance, or unsupported connector auth.

### Step 6: Test As Viewer

Intent: verify the customer's actual experience.

Behavior:

- Render the Viewer experience exactly as the customer will see it.
- Keep an Author-only inspection drawer for metadata, prompt preview, request ids, and validation results.
- Test Ask Pulse, AI Insights, guided filters, references, and token/session efficiency.

State:

- No hidden setup mutation from Viewer preview unless the Author explicitly saves an override.

### Step 7: Handoff

Intent: produce a clean deployment/support handoff.

Behavior:

- Show readiness summary:
  - BI surface ready
  - AI connector ready
  - Business context confirmed
  - Generated defaults accepted or overridden
  - Governance/source review complete
  - Viewer smoke passed
- Export support bundle or deployment checklist.

State:

- Depends on `AuthoringStateSnapshot` and `BusinessContextProfile`.

## Target Viewer Flow

The Viewer should see PulsePlay as one coherent AI-over-BI experience, not a setup console.

```text
Open experience
  -> See current BI asset/context strip
  -> Read AI insight or ask a question
  -> Use suggested question or type naturally
  -> Refine this answer if needed
  -> Open evidence when trust is needed
  -> Continue working
```

Viewer-visible controls:

- Ask input.
- Suggested questions.
- Refine this answer.
- Evidence/source drawer.
- Scope chips from active filters.
- Token/session efficiency gesture near Ask.

Viewer-hidden controls:

- Org type.
- Pack.
- Sub-vertical.
- Custom-section preset picker.
- Metric-direction preset picker.
- Connector profile details.
- Vector Search index details.
- UC Metric View mapping details.
- Author prompt textareas.

## Digital Wellbeing And Token/Session Efficiency

Keep the measurement, but reposition it.

Decision:

- Rename from sustainability/gauge language to `Token/session efficiency`.
- Place near Ask Pulse, not as a live Settings gauge.
- Use calm copy. No climate overclaiming.
- Explain the human benefit:
  - focused questions,
  - shorter sessions when context changes,
  - reuse of trusted prompts,
  - fewer repeated large context sends.

Suggested viewer copy:

```text
Token/session efficiency
Focused. 1.8k tokens this session.
```

Tooltip:

```text
Focused questions and fresh sessions help PulsePlay answer faster, reduce repeated context, and keep the conversation easier to review.
```

Author setting:

- Optional preference for whether the efficiency chip is visible to Viewers.
- No live gauge in the core Author setup path.

## Trustworthy Content Regularization

Every generated default must carry provenance.

### Required metadata

```ts
interface GeneratedDefaultProvenance {
    generatedDefaultId: string;
    generatedDefaultType:
        | "insight-template"
        | "metric-direction"
        | "starter-question"
        | "guided-filter"
        | "business-guidance"
        | "retrieval-policy";
    businessContextProfileId: string;
    sourceIds: string[];
    owner?: string;
    confidence: "draft" | "reviewed" | "sme-approved" | "deprecated";
    generatedFrom: "pack" | "bi-metadata" | "connector-capability" | "author-override";
    lastReviewedAt?: string;
}
```

### Regularization rules

- If a KPI formula has no source ID, show `Needs source review`.
- If a template comes from pack text, show pack module and source register.
- If a guided filter comes from BI metadata only, say so.
- If an author override changes generated guidance, mark it as `Author override` and require review before publish.
- If a source is stale or deprecated, show a warning in Authoring and a restrained trust indicator in Viewer evidence.
- Demo/sample assumptions must be labelled illustrative.

## Implementation Architecture

### New pure modules

```text
playground/src/authoring/businessContextProfile.ts
playground/src/authoring/generatedDefaults.ts
playground/src/authoring/authoringStateSnapshot.ts
playground/src/authoring/provenance.ts
playground/src/commands/commandTypes.ts
```

### Component structure

```text
AuthoringConsole
  SetupHome
  SetupGate
  BusinessContextSelector
  GeneratedDefaultsReview
  SourceReviewPanel
  ViewerPreviewFrame
  HandoffSummary

ViewerExperience
  ContextBar
  AskSurface
  SuggestedQuestions
  RefineAnswerMenu
  TrustFooter
  EvidenceDrawer
  TokenSessionEfficiencyChip
```

### State flow

```text
Pack registry + BI metadata + connector capabilities
  -> buildBusinessContextProfile()
  -> generateDefaults(profile)
  -> buildAuthoringStateSnapshot()
  -> ViewerExperience consumes snapshot/profile
```

### Do not do

- Do not create a new org-type selector.
- Do not keep persona presets as the first meaningful product choice.
- Do not expose custom-section preset and metric preset as ordinary parallel setup steps.
- Do not let the Adjust menu persist author settings.
- Do not show "verified" governance until source facts support it.
- Do not let first-run, Settings, guided filters, and Adjust each own separate context state.

## Code Impact Map

| File / area | Current issue | Target change |
|---|---|---|
| [FirstRunWizard.tsx](../../playground/src/components/FirstRunWizard.tsx) | Persona presets make four artificial user types. | Replace with View experience / Configure experience, or skip role choice when setup is already known. |
| [PackPicker.tsx](../../playground/src/components/PackPicker.tsx) | Correct source, technical label. | Rename visible language to Business context / Focus area; keep pack/sub-vertical internally. |
| [AiGroup.tsx](../../playground/src/settings/groups/AiGroup.tsx) | Business context, grounding, response behavior, and connector details share one dense page. | Move Business Context near the top; move Vector Search / UC Metric View under Grounding sources; move response behavior under Output behavior. |
| [setupStep5.tsx](../../playground/src/pulse/setupStep5.tsx) | Domain, section preset, and metric preset repeat Business Context decisions. | Render generated defaults from `BusinessContextProfile`; keep manual preset pickers in Advanced override. |
| [insightsPresetLibrary.ts](../../playground/src/pulse/insightsPresetLibrary.ts) | Presets are TypeScript constants detached from source-register governance. | Treat as transitional generated-default library until pack-derived runtime profile exists. |
| [_packs/cpgFmcgPresets.ts](../../playground/src/pulse/_packs/cpgFmcgPresets.ts) | Strong pack-derived content, but still appears as preset list. | Reuse as generated templates under Business Context review. |
| [visual.tsx](../../playground/src/pulse/visual.tsx) | Adjust, guided filters, and runtime prompt override can look like setup controls. | Rename Adjust to Refine this answer; ensure runtime override precedence is visible and non-persistent. |
| [pulseVisualSettingsStore.ts](../../playground/src/settings/pulseVisualSettingsStore.ts) | Stores inherited Pulse settings as separate authoring concepts. | Add adapter layer that maps Business Context into legacy fields during migration. |

## Migration Plan

### Phase 0: Decision lock

Acceptance:

- This document is linked from README, docs hub, Agenda, Handover, and project memory.
- The next brainstorming session treats Business Context as the canonical setup model.

### Phase 1: Pure model and tests

Build:

- `BusinessContextProfile` type.
- `buildBusinessContextProfile()` from pack/sub-vertical/overlay input.
- `generateDefaults(profile)`.
- Test fixture for `cpg-fmcg/supply-chain`.

Acceptance:

- One selected Business Context produces insight templates, KPI behavior, starter questions, guided filters, and provenance.
- No React, DOM, fetch, localStorage, or connector imports in pure modules.

### Phase 2: Authoring UI simplification

Build:

- Rename PackPicker visible UI to Business Context.
- Add Generated Defaults review.
- Move custom-section and metric-preset lists behind Advanced override.
- Collapse duplicate domain/org controls in the normal path.

Acceptance:

- Default Author setup has one Business Context decision.
- Search for `domain`, `preset`, `metric direction`, and `pack` all lands on the same Business Context / Generated Defaults flow.
- User cannot make conflicting context choices in first-run wizard and Settings.

### Phase 3: Viewer simplification

Build:

- Rename Adjust to Refine this answer.
- Move token/session efficiency near Ask.
- Show trust footer/evidence consistently.
- Hide author-only selectors from Viewer mode.

Acceptance:

- Viewer mode has no org type, pack, sector, custom preset, or metric preset selector.
- Refine action affects one answer only.
- Evidence drawer explains source, freshness, governance, and request id.

### Phase 4: Infrastructure cleanup

Build:

- Apply Gemini's `SettingsQuerySync` or equivalent once semantic ownership is clear.
- Use shared TanStack Query cache for allowlist/profile/pack reads.
- Keep tests compatible by allowing SettingsProvider test wrappers without requiring QueryClientProvider everywhere.

Acceptance:

- No duplicate production fetches for allowlist/profile/pack data.
- Existing Settings tests remain stable.
- State synchronization supports the new Business Context model instead of preserving old duplicate concepts.

## Required Tests

Add tests before claiming the UX is fixed:

- Selecting Business Context updates generated templates, KPI behavior, starter questions, guided filters, and provenance together.
- First-run and Settings cannot hold conflicting context selections.
- The default Author path shows only one context selector.
- Advanced overrides do not mutate the pack-derived profile.
- Viewer mode hides author-only setup controls.
- Refine this answer does not persist to settings.
- Token/session efficiency renders near Ask and never claims measured carbon impact.
- Generated defaults with missing source IDs show review warnings.
- Source-reviewed defaults show source IDs and confidence.
- Search aliases route `org type`, `sector`, `pack`, `preset`, `metric direction`, and `template` to Business Context / Generated Defaults.

## Final Product Rule

If a choice changes the whole experience, it belongs to Authoring and must be part of `BusinessContextProfile`.

If a choice changes only the current answer, it belongs near Ask and must not persist.

If a choice is diagnostic, security, connector, or deployment-related, it belongs under System, Governance, or Observability.

No user should have to reconcile the same idea across first-run wizard, Settings, preset templates, guided filters, and Adjust.
