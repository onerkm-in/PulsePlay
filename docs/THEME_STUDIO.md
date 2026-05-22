# PulsePlay — Theme Studio

> **Status: Roadmap — not yet started.**
> Owner lane: Track 4 (Experience). No Phase 1 scope is in the codebase today.
> Locked 2026-05-18 by Rajesh.

## Goal

Let authors customize the AI briefing and workbench visual language **without writing code**. Theme Studio is a Settings-resident editor that maps a small set of design tokens to every rendered surface (section cards, pills, headers, backgrounds, shadows, accents) and persists the chosen theme across sessions.

---

## Color mode is a first-class user control (locked 2026-05-21)

**Hard rule for every phase of Theme Studio AND for the F1 `--pp-*` / `--gn-*` token unification cycle.** Dark mode must be **directly selectable** in Appearance, NOT only inferred from the OS `prefers-color-scheme`. Users need an explicit menu/control with three values: `System`, `Light`, `Dark`.

### Why this matters

- Authors presenting to executives often want to force dark mode regardless of OS state (projector glare, late-evening sessions).
- Power BI and Databricks workspaces themselves have explicit dark themes; aligning PulsePlay's appearance to those surfaces requires a manual override.
- "Follow OS" is a sensible default, but making it the *only* path strands users on the wrong appearance when the OS preference doesn't match the room.

### The two-axis model

PulsePlay's appearance picker is **two independent dimensions**:

```ts
// Preset = palette + structural feel (chrome / surface / accent / radii / shadows).
// Multiple palettes can ship in light + dark variants; the preset itself
// does NOT decide which variant renders — the color mode does.
type ThemePresetId =
    | "pulse-default"      // current PulsePlay baseline
    | "slate-dark"         // dark preset (preserved from existing styles)
    | "midnight-ink"       // dark preset (Phase 1)
    | "warm-slate"         // light preset (Phase 1)
    | "high-contrast"      // accessibility-first
    | "brand-neutral"      // white-label safe
    | "forest"             // dark green
    // Future enterprise presets must ship light + dark pairs when feasible.
    | "custom";

// Color mode is orthogonal to preset selection.
type ColorMode = "system" | "light" | "dark";
```

`themePreset` chooses the palette and structural feel. `colorMode` decides whether the user follows the OS or forces a specific brightness when the preset supports both. A preset that only ships one variant (e.g. `high-contrast`) ignores the mode but still respects the user's stored choice for future presets that DO support both.

### F1 (`--pp-*` / `--gn-*` token unification) MUST preserve this

When F1 bridges the two token families, it MUST:

- Keep `slate-dark` (or equivalent dark palette) directly **selectable** in Appearance.
- Keep `colorMode` as a separate stored value (`pulseplay:color-mode`) independent of `themePreset` (`pulseplay:active-theme` or `pulseplay:theme-preset`).
- Treat `colorMode: "system"` as "subscribe to `(prefers-color-scheme: dark)` MediaQueryList and re-apply the matching preset variant on change" — NOT as "ignore the user's stored mode."
- Treat `colorMode: "dark"` (or `"light"`) as "force this brightness regardless of OS" — including when the user revisits the page on a different OS state.
- Persist BOTH values across sessions.

### What NOT to do

- **Do not** make dark mode an OS-only inference. The presence of `@media (prefers-color-scheme: dark) { ... }` in a stylesheet is fine as a fallback, but a stored user preference MUST override the media query.
- **Do not** collapse `themePreset` and `colorMode` into a single string (`"slate-dark"` vs `"slate-light"`). They are independent axes and the storage shape must reflect that — otherwise the "preset stays, user wanted to flip to light" path becomes a rename rather than a flag flip.
- **Do not** ship enterprise/brand preset packs that hard-code one brightness without a paired light/dark variant — but **do not** block F1 on producing those pairs either. F1's deliverable is preserving the existing selectable behavior while the token plane unifies; new paired presets can land later.

### Acceptance signal for F1

The F1 PR is not complete until the Appearance leaf in Settings exposes BOTH:

1. A **theme preset grid** with the existing presets (including `slate-dark` as a directly selectable dark option), AND
2. A **separate color-mode control** with `System` / `Light` / `Dark` segmented buttons (or equivalent),

with a manual test in the PR description confirming that:

- Switching `colorMode` from `System` to `Dark` on a light-OS machine forces dark immediately.
- Switching back to `System` re-syncs to OS state.
- The selection persists across page reload.
- Selecting a non-dark preset while `colorMode: "dark"` is set renders that preset's dark variant (if it ships one) or its sole variant (if it only ships one).

---

## Supported inputs (all phases)

| # | Input method | Phase |
|---|---|---|
| 1 | Built-in theme presets (curated, tested) | 1 |
| 2 | Manual token editor (direct value control) | 1 |
| 3 | JSON / W3C design-token import | 2 |
| 4 | Figma file/key → variables/styles extraction | 3 |
| 5 | Image upload → palette + density inference | 4 |

---

## Phase 1 — Token contract + presets + live preview

**Goal:** Ship the foundation that every later phase builds on.

### `PulsePlayThemeTokens` contract

A flat, typed TypeScript interface. Every token maps to one or more CSS custom properties already in `visual.less`.

```ts
interface PulsePlayThemeTokens {
    // Surface
    colorBackground:        string;  // --gn-bg
    colorSurface:           string;  // --gn-surface
    colorSurfaceRaised:     string;  // --gn-surface-raised
    colorBorder:            string;  // --gn-border
    colorBorderSubtle:      string;  // --gn-border-subtle

    // Text
    colorText:              string;  // --gn-text
    colorTextMuted:         string;  // --gn-text-muted

    // Accent
    colorAccent:            string;  // --gn-accent
    colorAccentSubtle:      string;  // --gn-accent-subtle
    colorAccentBorder:      string;  // --gn-accent-border

    // Semantic — MUST remain meaningful; see Tripwires
    colorGood:              string;  // --gn-success
    colorGoodSubtle:        string;  // --gn-success-subtle
    colorWarn:              string;  // --gn-warning
    colorBad:               string;  // --gn-error
    colorBadSubtle:         string;  // --gn-error-subtle

    // Shape + depth
    radiusSm:               string;  // --gn-radius-sm   (e.g. "6px")
    radiusMd:               string;  // --gn-radius-md   (e.g. "10px")
    shadowXs:               string;  // --gn-shadow-xs
    shadowSm:               string;  // --gn-shadow-sm
}
```

Tokens deliberately omit font family and size — those are layout concerns, not brand concerns, and changing them silently breaks grid assumptions.

### CSS variable injection

A single `applyTheme(tokens: PulsePlayThemeTokens, root: HTMLElement)` utility writes the token values as inline CSS custom properties on the `:root` (or a scoped container). Existing `visual.less` reads `var(--gn-*)` variables — no LESS changes required.

### Built-in presets (Phase 1 ships 4–6)

Each preset must pass WCAG AA contrast on every token pair before shipping.

| Preset id | Description |
|---|---|
| `pulse-default` | Current PulsePlay palette (no visual change — baseline) |
| `slate-dark` | Dark slate-blue surface, light text — preserved from existing styles, directly selectable per the locked 2026-05-21 dark-mode direction above |
| `midnight-ink` | Dark navy surface, white text, electric-blue accent |
| `warm-slate` | Warm gray background, amber accent |
| `high-contrast` | Pure black/white + bold borders for accessibility-first deployments |
| `brand-neutral` | Desaturated grays + teal accent — safe for white-label |
| `forest` | Dark green tones, natural palette |

### Settings → Preferences → Theme Studio

- Route: `/settings/preferences/theme-studio`
- Layout: left rail = preset picker + "Custom" option; right panel = live preview of the AI Insights briefing surface (a static fixture — not a live API call)
- Live preview updates token application in real time as user adjusts values
- "Apply" button: writes to `localStorage` key `pulseplay:active-theme`; dispatches `pulseplay:theme-change` custom event so open tabs pick up the change immediately
- "Reset to default" link available at all times

### Persistence

```ts
// Write
localStorage.setItem("pulseplay:active-theme", JSON.stringify(tokens));
// Read on mount (App.tsx or ThemeProvider wrapper)
const saved = localStorage.getItem("pulseplay:active-theme");
if (saved) applyTheme(JSON.parse(saved), document.documentElement);
```

### Phase 1 acceptance criteria

- [ ] `PulsePlayThemeTokens` TypeScript interface locked and exported
- [ ] CSS variable mapping documented (one variable → one token, bidirectional)
- [ ] `applyTheme()` utility with unit tests (token → CSS variable round-trip)
- [ ] 4–6 built-in presets, each passing WCAG AA contrast check (automated in test)
- [ ] Settings → Preferences → Theme Studio UI: preset picker + color swatches + live preview
- [ ] Apply + persist + load on mount
- [ ] Dispatches `pulseplay:theme-change` for cross-tab sync
- [ ] Vitest coverage: token contract shape, applyTheme, contrast checks, preset round-trip

---

## Phase 2 — JSON / design-token import + validation

**Goal:** Power users can export from any design system and import directly.

- Accepts **W3C Design Tokens Community Group** format (`$value`, `$type`) as primary
- Also accepts a flat `{ "key": "value" }` shorthand mapped to `PulsePlayThemeTokens` keys
- Validation: schema check → contrast check → fallback-default fill for missing tokens → preview before apply
- Export: "Download as JSON" exports the current active theme in W3C format
- Error display: inline per-token errors (e.g. "colorGood #fff fails AA against colorBackground #fafafa — contrast 1.05:1, minimum 4.5:1")

### Phase 2 acceptance criteria

- [ ] JSON import UI: textarea + drag-and-drop file zone in Theme Studio
- [ ] W3C token parser (extracts `$value` from nested group format)
- [ ] Contrast validation runs on every import; hard-blocks apply on WCAG AA failures
- [ ] Missing-token fallback fills from `pulse-default` preset before preview
- [ ] Export button serializes active theme to W3C JSON
- [ ] Vitest coverage: parser, validator, fallback-fill, round-trip export→import

---

## Phase 3 — Figma import

**Goal:** Authors using Figma for brand management can push their color/radius/shadow tokens directly into PulsePlay.

### Flow

1. Author provides a Figma file URL or file key in Theme Studio
2. PulsePlay proxy fetches variables and styles via the Figma REST API (`GET /v1/files/:key/variables` + `GET /v1/files/:key/styles`)
3. Proxy extracts color, radius, and shadow values; maps them to `PulsePlayThemeTokens` key names using a heuristic name matcher (e.g. `Surface/Background` → `colorBackground`)
4. Candidate mapping displayed as a diff table: Figma token name → PulsePlay token → current value → proposed value
5. Author reviews, can override individual mappings, then applies
6. Figma API key is entered in Settings → System → Integrations; stored in localStorage only (never sent to a third-party relay)

### Implementation notes

- Figma variables API returns resolved color values as `{ r, g, b, a }` floats — convert to hex before storing
- Shadow styles map to `shadowXs`/`shadowSm` via computed CSS `box-shadow` string
- Radius is not a native Figma variable type — infer from corner-radius style hints in Figma styles
- The proxy intermediates the Figma API call so the Figma token never hits the browser network tab
- Name-match heuristic is a ranked list: exact match → prefix match → fuzzy match → "unmapped" (user assigns manually)

### Phase 3 acceptance criteria

- [ ] Proxy `/theme/figma-import` endpoint (validates key, fetches, extracts, returns candidate mapping)
- [ ] Figma API key stored in Settings → System → Integrations
- [ ] Diff table UI with per-token override
- [ ] Heuristic name matcher with confidence score per token
- [ ] Contrast validation on the full mapped set before apply
- [ ] No Figma file content cached beyond the current session
- [ ] Proxy test: valid Figma response → correct extraction; invalid key → 400; missing token → fallback filled

---

## Phase 4 — Image-based theme extraction

**Goal:** Upload a screenshot or brand asset; PulsePlay suggests a theme that harmonizes with it.

### Flow

1. Author uploads an image (PNG/JPG/WebP ≤ 4 MB) in Theme Studio
2. Client-side palette extraction using a median-cut or k-means algorithm over the image pixels (no server round-trip for the image)
3. Extracted palette (dominant + accent colors) is sent to the proxy `/theme/suggest` endpoint along with a small metadata blob (palette array, image filename)
4. Proxy calls the active Foundation Model / Azure OpenAI endpoint with a structured prompt: given a color palette, suggest `PulsePlayThemeTokens` values that are accessible and coherent; return JSON
5. AI-suggested theme is presented as a full preview in Theme Studio
6. Author confirms before apply; can adjust individual tokens in the editor
7. All contrast and semantic-safety checks run before "Apply" is enabled

### Safety rules for Phase 4

- Image data never leaves the browser (palette extraction is client-side only)
- The proxy sends only the extracted palette array (hex strings), not the image
- AI suggestions are **advisory** — the user always confirms
- If the AI returns a token that fails contrast, it is marked red in the diff view and Apply is blocked

### Phase 4 acceptance criteria

- [ ] Client-side palette extractor (k-means, ≤ 500ms on a 1920×1080 image)
- [ ] Proxy `/theme/suggest` endpoint accepting palette array + returning full `PulsePlayThemeTokens` JSON
- [ ] Proxy prompt is structured (JSON schema output mode) — no free-text parsing
- [ ] Preview rendered from AI suggestion before apply
- [ ] Contrast failures block apply; warnings shown for tokens approaching threshold
- [ ] Vitest: palette extractor unit tests; proxy endpoint test with mock AI response

---

## Tripwires (all phases)

These are **hard rules** — no phase ships without satisfying them:

1. **Never apply imported design blindly.** Every import path (JSON, Figma, image) ends at a preview-then-confirm step. "Apply without preview" is not a valid code path.

2. **Always validate before apply.** `validateThemeTokens(tokens)` runs on every apply. It checks:
   - All required tokens present (no undefined CSS variables after apply)
   - WCAG AA contrast for every foreground/background pair
   - Semantic color invariants (see below)
   - Shape sanity (`radiusSm` is a valid CSS length; `shadowXs` parses as a box-shadow value)

3. **Accessibility contrast is mandatory.** Minimum WCAG AA (4.5:1 for normal text, 3:1 for large text). Any import that produces a sub-AA contrast hard-blocks apply. A WCAG AAA mode ("require AAA everywhere") is a v2 option.

4. **Semantic colors must remain meaningful — always.** `colorGood` / `colorWarn` / `colorBad` are used by the validator, the pill renderer, the KPI tile system, and the accuracy contract. They are **not rebrandable to arbitrary aesthetics**. Specifically:
   - `colorGood` must have ≥ 4.5:1 contrast against `colorBackground` AND must read as "positive" in cultural context — no pure red or pure gray allowed
   - `colorWarn` must be visually distinct from both `colorGood` and `colorBad`
   - `colorBad` must read as "negative" — no pure green allowed
   - Validation rejects combinations that violate these rules with an explicit error

5. **Layout and text readability must not break.** Theme Studio does NOT expose `fontFamily`, `fontSize`, `lineHeight`, or layout-critical `--gn-shell-width` variables. Restricting token scope keeps the token surface small and safe.

6. **Theme import is visual tokens, not code execution.** JSON import is parsed as data (JSON.parse), never evaluated (no `eval`, no `new Function`). Figma API content is never rendered as HTML. Image data stays in the browser.

7. **Reset must always work.** The "Reset to default" path removes the stored theme and reloads `pulse-default` unconditionally, regardless of what a broken custom theme did to the CSS variables.

---

## Cross-track dependencies

| Dependency | Strength | Notes |
|---|---|---|
| Phase 3 (Figma) requires proxy Figma API relay | HARD | Figma API key must not touch the browser's network tab |
| Phase 4 (image) requires an active AI connector | HARD | `/theme/suggest` uses the active Foundation Model or Azure OpenAI profile |
| All phases depend on Phase 1 `PulsePlayThemeTokens` contract | HARD | No phase 2-4 work starts before the contract is locked |
| Phase 1 live preview uses the AI briefing fixture | LOOSE | Can use static fixture; does not need a live Genie session |

---

## What stays modular

- Theme tokens apply to the **rendering layer** (CSS variables) only. No connector, no BI adapter, no proxy route is aware of the active theme.
- `applyTheme()` is a pure function — given tokens + root element, it writes CSS variables. No side effects beyond that.
- The Settings → Preferences → Theme Studio leaf is a standalone feature flag — it can be hidden via allowlist without breaking anything else.
- Phase 3 (Figma) and Phase 4 (image) are independent of each other. Either can ship without the other.
