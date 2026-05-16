# PulsePlay Structured Authoring Standard

> **Status:** Planning baseline as of 2026-05-16.
>
> **Scope:** Text-entry surfaces where users or authors provide prompt guidance, analysis instructions, custom templates, SQL-adjacent instructions, pack notes, or middleware-bound configuration. This covers the aesthetic and interaction standard as much as the payload contract.
>
> **Companion docs:** [MODULAR_INTEGRATION_ARCHITECTURE.md](MODULAR_INTEGRATION_ARCHITECTURE.md), [PROMPT_IR_ARCHITECTURE.md](PROMPT_IR_ARCHITECTURE.md), [SETTINGS_SPEC.md](SETTINGS_SPEC.md), [CONNECTOR_PROBE_AND_SMART_CONNECT.md](CONNECTOR_PROBE_AND_SMART_CONNECT.md).

## Executive Rule

PulsePlay should not use blank, unstructured textareas for important prompt or guidance authoring.

Every meaningful authoring field should be a **structured editor** that:

- shows the required middleware format,
- exposes required and optional parameters,
- lets users insert parameters from clear controls,
- validates before saving or sending,
- previews the compiled middleware payload,
- keeps free-form writing possible without making it unsafe or ambiguous.

The user sees a clean, guided writing surface. The middleware receives a predictable structured payload.

## Where This Applies

| Surface | Examples | Required behavior |
|---|---|---|
| First-run wizard | Suggested question, setup guidance, persona-driven defaults | Show expected inputs and safe defaults; validate before auto-send |
| Settings | AI guidance, prompt template, connector instructions, pack mapping notes | Use sectioned template editor with parameter chips and validation |
| Knowledge Base | Pack notes, glossary/KPI guidance, retrieval instructions | Tie sections to pack/schema fields and citations |
| Prompt IR authoring | `role`, `task`, `vocabulary`, `guardrails`, `output`, `examples` | Prefer schema-backed form sections; allow raw YAML/JSON advanced mode |
| Guided analysis frames | Frame parameters, comparison window, metric/dimension selections | Use controls first; write the compiled prompt as preview, not hidden magic |
| Diagnostics/support | Prompt preview, assembled payload, SQL/query preview | Read-only formatted preview with copy/export redaction |

## UX Standard

Each structured authoring surface should have these parts.

| Area | Purpose |
|---|---|
| Format strip | Shows contract name and version, for example `Prompt IR v1`, `Guidance v1`, `Frame Params v1` |
| Section rail or tabs | Lets the user jump between Intent, Inputs, Guardrails, Output, Examples, Preview |
| Parameter palette | Chips or menu items for allowed variables, such as `{{metric}}`, `{{time_period}}`, `{{dimension}}`, `{{surface_filters}}` |
| Required markers | Required sections/parameters are visually marked and validated |
| Editor body | Plain writing area, but scaffolded with headings/placeholders |
| Options panel | Field-specific controls for enumerations, toggles, output sections, tone, audience, citation mode |
| Validation panel | Missing required parameter, unknown parameter, malformed section, unsafe keyword, or middleware mismatch |
| Compiled preview | Read-only preview of exactly what will be sent to the proxy/middleware |

This should feel like completing a well-designed form, not filling a wall of text.

## Authoring Modes

Use the same underlying data model for all modes.

| Mode | Audience | UI |
|---|---|---|
| Guided | Business users, analysts | Section cards, dropdowns, parameter chips, examples |
| Structured text | Power users | Markdown body with required headings and highlighted `{{parameters}}` |
| Raw schema | Developers/admins | YAML/JSON editor matching Prompt IR or middleware contract |

Switching modes must preserve content. Raw schema is not a separate source of truth.

## Canonical Sections

For guidance/prompt text that is not full Prompt IR yet, use this structured markdown shape:

```markdown
---
schemaVersion: 1
kind: guidance
target: assistant
middlewareContract: author-guidance-v1
---

## INTENT
Explain what the AI should help with.

## REQUIRED_INPUTS
- metric: {{metric}}
- time_period: {{time_period}}
- dimension: {{dimension}}

## BUSINESS_CONTEXT
Describe definitions, assumptions, and audience context.

## GUARDRAILS
- Do not invent metrics.
- Cite visible data, SQL, or knowledge sources when available.
- State limitations when data is missing.

## OUTPUT_FORMAT
- HEADLINE
- TRENDS
- RISKS
- ACTIONS

## EXAMPLES
Question: ...
Expected answer shape: ...
```

The editor can render this as friendly sections. The raw stored content can still be markdown plus frontmatter.

## Parameter Standard

Use double-brace placeholders only:

```text
{{metric}}
{{time_period}}
{{dimension}}
{{surface_filters}}
{{pack_name}}
{{connector_name}}
{{asset_name}}
{{lineage_reference}}
```

Rules:

- Parameter names use lowercase snake_case.
- Unknown parameters are validation errors.
- Required parameters must be filled before save/send.
- Optional parameters must show fallback behavior.
- Secrets, tokens, tenant IDs, private URLs, and user identifiers must not be suggested as parameters.
- Parameter insertion should happen through chips/menus, not by making users memorize names.

## Middleware Contract

The UI should compile authoring content into a normalized object before sending it.

```typescript
interface StructuredAuthoringPayload {
    schemaVersion: 1;
    kind: "guidance" | "prompt-template" | "frame-params" | "knowledge-note" | "sql-instruction";
    target: "assistant" | "prompt-ir" | "connector-probe" | "knowledge-retriever" | "surface-adapter";
    sourceSurface: "wizard" | "settings" | "knowledge" | "launchpad" | "frame-picker";
    contract: string;
    sections: Array<{
        id: "INTENT" | "REQUIRED_INPUTS" | "BUSINESS_CONTEXT" | "GUARDRAILS" | "OUTPUT_FORMAT" | "EXAMPLES" | string;
        required: boolean;
        content: string;
    }>;
    parameters: Array<{
        name: string;
        required: boolean;
        value?: string | number | boolean | string[];
        fallback?: string;
    }>;
    validation: {
        status: "valid" | "warning" | "error";
        messages: Array<{ code: string; message: string; section?: string; parameter?: string }>;
    };
}
```

The proxy/middleware should consume the structured object where possible. If a legacy route still expects a string, compile the string from the validated sections and keep the structured object available for audit/evidence.

## Validation Rules

Minimum validation before save/send:

- Required sections exist.
- Required parameters are filled.
- Parameter names are known for the selected contract.
- Output sections are supported by the selected backend/translator.
- No raw secrets or high-risk identifiers are present.
- Prompt-injection phrases are flagged and sanitized by the existing redaction path.
- Prompt IR raw mode passes schema validation before activation.
- Compiled preview matches the selected middleware contract.

Validation should be specific. Prefer "Missing required parameter `{{metric}}` in REQUIRED_INPUTS" over "Invalid prompt."

## Visual Design Rules

- Use a code-like editor treatment only for raw schema or compiled preview.
- Use regular readable text styling for guided mode.
- Keep section cards shallow; do not nest cards inside cards.
- Use chips for parameters and toggles/selects for options.
- Show errors inline next to the relevant section and in a compact validation list.
- Keep the editor height stable; expanding validation should not push primary actions out of reach.
- On small screens, section rail becomes tabs or a dropdown, and the parameter palette becomes an insert menu.

## Implementation Recommendation

Build one reusable component family:

```text
StructuredAuthoringEditor
  AuthoringFormatStrip
  AuthoringSectionRail
  AuthoringParameterPalette
  AuthoringTextArea
  AuthoringOptionsPanel
  AuthoringValidationPanel
  AuthoringCompiledPreview
```

Do not create separate one-off textareas for wizard, settings, knowledge, and prompt IR. They should share parsing, validation, parameter insertion, redaction, and preview code.

## Migration Path

1. Inventory all prompt/guidance textareas and free-form inputs.
2. Classify each one by `kind` and `target`.
3. Add contract metadata and allowed parameters.
4. Replace the most important field first: Settings AI guidance or Prompt IR authoring.
5. Add validation tests for missing parameters, unknown parameters, unsafe content, and compiled-preview shape.
6. Then move wizard suggested-question editing and Knowledge Base authoring to the same component.

## Design Goal

The final experience should make authors feel guided, not boxed in:

- They can write in human language.
- They can see exactly what the system needs.
- They can fill required parameters without guessing syntax.
- The middleware receives clean, structured, validated content.
- Future agents can parse, audit, reuse, and translate the content without brittle string scraping.
