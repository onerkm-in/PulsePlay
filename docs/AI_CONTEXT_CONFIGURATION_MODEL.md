# PulsePlay AI Context Configuration Model

> **Status:** Planning baseline plus first UI alignment slice, 2026-05-16.
>
> **Scope:** How domain, preset strategy, metric semantics, Knowledge Base, AI Insights, and Chat settings should relate. This is internal-enterprise guidance for PulsePlay, not a public product promise.

## Problem

PulsePlay inherited several powerful AI Insights controls from the older Pulse visual:

- analytics domain selection,
- custom-section preset strategy,
- metric direction / threshold rules,
- business guidance,
- knowledge-base toggles,
- Chat context and rendering behavior.

The issue is not that these controls are wrong. The issue is that they can look like separate decisions when they are actually different projections of the same thing: **the active domain context**.

The user should pick or infer a business domain once. From that, PulsePlay should derive relevant sections, metrics, starter questions, guidance, and Chat behavior.

## Source Of Truth

The durable source of truth should be the active Knowledge Base pack:

```text
Knowledge pack
  -> sub-vertical / overlay
  -> canonical KPIs and metric semantics
  -> prompt context and business rules
  -> sample questions and recommended AI shape
  -> Prompt IR / section templates
  -> retrieval profile and citation expectations
```

Today, PulsePlay has partial sources:

- `pulsepacks/<pack>/sub-verticals/*/kpis.md`
- `pulsepacks/<pack>/sub-verticals/*/sample-questions.md`
- `pulsepacks/<pack>/sub-verticals/*/prompt-context.md`
- `pulsepacks/<pack>/sub-verticals/*/prompt-ir.yaml`
- `playground/src/pulse/insightsPresetLibrary.ts`
- `playground/src/pulse/_packs/*Presets.ts`
- `playground/src/pulse/metricRulesEngine.ts`

The first code alignment now keeps the visible domain picker derived from preset libraries and prioritizes presets related to the current domain. The next real architecture step is to derive these from pack metadata at runtime instead of TypeScript constants.

## Common Vs Specific

### Common AI Context

These settings should be authored once and consumed by both AI Insights and Chat:

| Setting family | Source | Used by |
|---|---|---|
| Domain / sub-vertical | Knowledge pack, probe inference, author override | AI Insights, Chat, Launchpad, frame picker |
| Field dictionary | BI metadata, Genie space metadata, `genieFields` override | Prompt builder, binding drift checks, Chat context |
| Business guidance | Pack prompt context + org overrides | AI Insights stage prompts, Chat first-turn context |
| Metric semantics | Pack KPI definitions + metric rules form | AI Insights color/status, Chat tables, answer validation |
| Formatting standards | Pack/default guidance + author overrides | Renderer, export, Chat answer formatting |
| Retrieval profile | Pack + role + connector + BI context | Grounding bundle, citations, Chat memory scope |
| BI context sharing | User setting + governance | AI Insights, Chat |

### AI Insights Specific

AI Insights should own output-shape settings:

- authoring mode: preset / AI-assisted / manual,
- universal stage visibility,
- custom section presets,
- per-stage instruction overrides,
- staged rendering and cache policy,
- provenance footer,
- briefing refresh trigger.

These are not Chat settings. Chat may reuse the renderer and metric semantics, but Chat should not expose AI Insights stage toggles as if they change conversational behavior.

### Chat Specific

Chat should own conversational settings:

- starter questions from the selected pack/sub-vertical,
- conversation memory/history scope,
- retrieval/citation mode,
- follow-up suggestion behavior,
- multi-space / supervisor routing,
- evidence drawer and source visibility,
- answer verbosity and audience mode.

Chat should borrow the best AI Insights work where it fits:

- metric-direction color semantics,
- narrative/table renderer polish,
- SQL provenance and validation patterns,
- prompt redaction and safe authoring,
- progress/status patterns,
- cache and sustainability telemetry where useful.

## UX Rule

The setup UI should follow this order:

```text
1. Pick or infer Knowledge pack / sub-vertical
2. Confirm Common AI Context
3. Tune AI Insights output strategy
4. Tune Chat behavior
5. Review compiled prompt / payload preview
```

Avoid repeating a domain dropdown, a preset dropdown, and a metric preset dropdown as unrelated fields. If the selected domain is `CPG / Supply Chain`, the UI should recommend supply-chain custom sections and supply-chain metric rules first.

## Implementation Sequence

1. **Done in first slice:** derive domain options from section/metric preset domains, prioritize related presets, let metric presets seed domain when blank, and group Section A as Common AI Context plus AI Insights output strategy.
2. Add a `DomainContextProfile` builder that reads active pack/sub-vertical metadata.
3. Add a proxy or playground endpoint such as `GET /assistant/domain-context?pack=&subVertical=` returning domain label, KPIs, metric semantics, prompt context, starter questions, and recommended AI shape.
4. Make `DomainPicker`, `CustomSectionPresetPicker`, `MetricKnowledgeBaseEditor`, `FramePicker`, and `AISidebar` consume the same profile.
5. Move Chat-specific controls into a dedicated Chat behavior section while keeping shared context visible on both tabs.
6. Add tests that prove one selected domain changes the recommended section presets, metric rules, starter questions, and compiled prompt preview together.

## Debate Point

Do not force every Chat answer through the AI Insights pipeline. That would make Chat slow and over-structured. The right model is:

- AI Insights = structured briefing surface.
- Chat = conversational surface.
- Both consume the same domain context and evidence contracts.
