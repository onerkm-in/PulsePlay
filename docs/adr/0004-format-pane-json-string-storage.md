# ADR-0004 — Format-pane stores complex shapes as JSON strings, not nested objects

**Status:** SUPERSEDED — Pulse-only. There is no Power BI custom-visual format pane in PulsePlay (we are not a custom visual; we are a React playground). This ADR is preserved for historical context only and applies only to the sister project Pulse.

**Original status:** Accepted (2026-02) in Pulse.

**Owners:** Pulse maintainer (this ADR is no longer load-bearing in PulsePlay)

## Context

The Power BI custom-visual format pane (`capabilities.json`) supports a fixed set of primitive types: `Text`, `Bool`, `Numeric`, `Color`, `Enumeration`, plus a few specialised ones. There is no native "list of objects" type and no native "key-value map" type.

Multiple settings need shapes that are richer than a primitive can express:

- `insightsCustomSections` — array of `{ name, instruction }`
- `insightsMetricDirections` — array of `{ name, higherIsBetter, aliases?, redPct?, amberPct? }` (added 2026-05)
- `genieTextInstructionsJson`, `genieSampleQuestionsJson`, `genieExampleSqlsJson` — Genie-format arrays of `{ id, content }`
- `kbFlags` — bag of booleans

We need these to **persist** when the report is saved and **survive** a `.pbip` round-trip, which means they have to be serialisable through `capabilities.json`.

## Decision

Store every complex shape as a `Text` field whose value is JSON-stringified.

- The settings module (`settings.ts`) declares the field as `Text`.
- The setup UI accepts a JSON-shaped string (with a "format" / "validate" button next to each).
- Validation in `setupStep5Validation.ts` runs `JSON.parse` and rejects malformed input with a section-level error.
- Length caps in `setupStep5Validation.ts` (ADR-0001's Codex Review #2 close) prevent the JSON blob from blowing the model context window.

## Consequences

- Authors edit raw JSON. The Setup tab includes preset libraries and an Advanced Editor to soften this.
- Bumping a shape (adding a new optional field) does **not** require a `capabilities.json` migration — old reports continue to parse.
- A breaking shape change (renaming a required field) requires a versioned migration helper. We have one example so far: the legacy free-text `metricDirectionRules` was migrated into structured `insightsMetricDirections` via `migrateLegacyMetricDirectionRules` in `src/rendering/metricDirections.ts`.
- The format-pane property name and the JSON shape are two coupled contracts; both are tested in `tests/settings.test.ts`.
