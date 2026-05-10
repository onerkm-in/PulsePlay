# ADR-0006 — Trend pills use a section allowlist + numeric anchor, not a free regex

**Status:** SUPERSEDED for PulsePlay v0.x — applies only when the Pulse insights renderer is ported. The trend-pill renderer is part of Pulse's `genieChatVisual/src/visual.tsx` and is not yet present in PulsePlay's `playground/`. When the AI Insights pipeline lands in v0.3+ and the renderer is ported, this ADR's section-allowlist + numeric-anchor logic should be carried over verbatim.

**Original status:** Accepted (2026-04) in Pulse.

**Owners:** maintainer

## Context

AI Insights output uses inline "trend pills" — small coloured chips like `▲ $733K` or `▼ -1.94%` — to make direction obvious at a glance. The renderer must transform a plain-text token in the model's markdown output into a styled `<span>` with the right colour, arrow, and accessibility metadata.

A naive approach (one regex applied to every paragraph) produced two failure modes:

1. **Pill bleed** — narrative sentences in HEADLINE / RECOMMENDED ACTIONS got pilled because they contained numbers. The pane filled with chips that weren't trend signals.
2. **Double pills** — when a bullet contained two numeric tokens (`from 0.41% to -0.44%`), both got pilled and the bullet became unreadable.

Codex Review #2 surfaced both problems via a live SWOT test. The user feedback was explicit: "the pill should be only the arrow + number, the trend word stays as prose."

## Decision

Trend-pill rendering is gated by two predicates:

1. **Section allowlist.** `inlineFormat` consults a `SECTIONS_WITH_TREND_PILLS` set (declared in `visual.tsx`). Sections in the set get pill rendering; everything else gets plain inline format. HEADLINE is **not** in the set — that section is paragraph-shaped narrative.

2. **Numeric anchor.** Inside an allowlisted section, the regex requires either a sign (`+`/`-`), an arrow (`▲`/`▼`), or a recognised connective (`up`, `down`, `to`, `by`) immediately before the number. Bare numbers in the middle of a sentence don't pill.

The currency-prefix character class (`[+-]?[$€£₹¥]?`) lets `$11,644.10` pill correctly without breaking the anchor rule.

The renderer also runs a **trailing-prose stripper** (`stripTrailingProse`) on STRUCTURED_LIST and TABLE_SECTIONS to drop "Bottom Line Up Front..." sentences the model sometimes appends.

## Consequences

- Adding a new section that should pill (e.g., "MOMENTUM") requires editing the `SECTIONS_WITH_TREND_PILLS` set. There is no auto-discovery.
- The pill regex is now load-bearing — a change that loosens it will likely re-introduce pill bleed. The renderer-edge-cases test (`tests/rendererEdgeCases.test.ts`) and the renderer DOM test (`tests/insightsRendererDom.test.tsx`) cover the cases we've already broken once.
- Author-facing output cannot rely on pills appearing for every number, even in TRENDS — only numbers with a sign / arrow / connective are anchored. Prompts that ask the model to "include a pill on every metric" need to also ask the model to use ▲/▼.
- The Copy button calls `cleanInsightsContent`, not `renderInsightsSections`. Trailing-prose stripping has to happen at both layers; a divergence here was the cause of the "Copy still has the BLUF prose" bug from Session 49.
