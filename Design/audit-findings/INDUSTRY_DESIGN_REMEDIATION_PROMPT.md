# PulsePlay — Industry Design System Remediation Prompt

> **Purpose:** hand this doc to Claude, Codex, or another implementation agent when making ANY
> UI change in PulsePlay. It encodes the binding visual standard (the "Industry" design system),
> the audit findings from the July 2026 design review, and the target designs for the unified
> ("My Decision Canvas") and segregated experiences.
>
> **Rule zero:** the Industry design system is a BINDING visual contract. Do not invent colors,
> type, spacing, radii, or components not grounded in it.

---

## 1. The Industry design system in one paragraph

Industry is a **wireframe**: steel-blue accent (`#5980a6`) on a light technical ground
(`#f2f2f3`), **Barlow Condensed** headings over **Barlow** body, a modular grid, and cards,
figures and buttons framed as **blueprint objects** — square-cornered, hairline-bordered, with
`+` registration marks at the corners. Cards and figures stay **transparent line drawings**; the
primary button is the one solid object on the board (accent fill, square corners, marks).
Photography is duotoned into the steel accent. Icons are **Lucide at stroke-width 1.5**.

## 2. Token contract (source of truth)

Define these once in `playground/src/styles.css` `:root` and alias the existing `--pp-*` tokens
to them. Never hard-code a hex, font name, or px value the tokens carry.

| Token | Value | Replaces |
|---|---|---|
| `--color-bg` | `#f2f2f3` | `--pp-bg: #f4f6f9` |
| `--color-surface` | `#e9e9ea` | `--pp-surface: #ffffff` |
| `--color-text` | `#1d1f20` | `--pp-text: #0f172a` |
| `--color-accent` | `#5980a6` | `--pp-accent: #2563eb` |
| `--color-divider` | `color-mix(in srgb, #1d1f20 16%, transparent)` | `--pp-border` |
| `--font-heading` | `"Barlow Condensed", system-ui, sans-serif` (weight 600) | (none existed) |
| `--font-body` | `"Barlow", system-ui, sans-serif` | `--pp-font: Inter` |
| `--space-1..8` | 3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2 px (0.85× density) | `--pp-s1..s10` (4px grid) |
| `--radius-sm/md/lg` | 2 / 4 / 7 px | `--pp-radius-*` (4–20px + 999px) |
| `--shadow-sm/md/lg` | subtle ink-tinted, max `0 12px 32px` | `--pp-shadow-xs..xl` (5 levels) |

Tonal ramps: each role has 100–900 steps (`--color-accent-100..900`,
`--color-neutral-100..900`). Hover = one step past base (`-600`), pressed = `-700`.
Accent is NOT body-copy safe — use `--color-accent-700` for paragraph-size accent text.

## 3. Hard rules (violations found in the 2026-07 audit — do not reintroduce)

1. **No rounded corners.** Cards/figures/tags = 0. Buttons/inputs = `--radius-md` (4px) max.
   **No `border-radius: 999px` pills anywhere** (found on 14+ component types: chips, setup
   pill, surface-mode chip, allowlist chip, settings chips, toolbar…).
2. **No filled card surfaces.** Cards are `background: transparent` + 1px `--color-divider`
   border + four corner registration marks. The `.pp-app__empty` white card, wizard persona
   gradient cards, and all `box-shadow` card elevation are violations.
3. **Blueprint frame is mandatory** on every card, figure, and primary button:
   ```html
   <div class="card blueprint">
     <i class="corner tl"></i><i class="corner tr"></i>
     <i class="corner bl"></i><i class="corner br"></i>
     …
   </div>
   ```
4. **No gradients.** Remove: brand `h1` clip-text gradient, settings header icon purple
   gradient (`#2563eb → #7c3aed`), persona card fills, input "paper texture"
   `repeating-linear-gradient`, control inset highlights.
5. **No emoji as UI.** Replace ✨ 📊 🎯 🛠️ 🎨 with Lucide icons.
6. **Icons: Lucide only, `strokeWidth={1.5}`.** Replace all custom inline SVGs
   (currently strokeWidth 1.8–2 in `TopRightToolbar.tsx`, `SurfaceSwitcher.tsx`).
7. **Mono palette.** One steel accent. No purple `#7c3aed`, cyan `#0891b2`, or the 4-colour
   severity stoplight in `DecisionPromptCard.tsx` (`#b42318/#b54708/#854d0e/#475467`).
   Severity maps to accent/neutral ramp steps + type weight + text label:
   - critical → rail `--color-accent-900`, tag `.tag-accent`
   - high → rail `--color-accent-700`, tag `.tag-accent`
   - medium → rail `--color-accent-500`, tag `.tag-neutral`
   - low → rail `--color-neutral-400`, tag `.tag-neutral`
8. **No inline-style components.** `DecisionCanvasShell.tsx`, `DecisionPromptCard.tsx`, and
   `ActionInsightsPanel.tsx` are 100% hardcoded inline styles with zero tokens — extract to
   token-driven CSS classes. This is the worst-offending surface in the codebase.
9. **Interaction states are colour-only.** Hover = ramp tint, pressed = deeper step,
   focus = `outline: 2px solid var(--color-accent); outline-offset: 2px;` (no glow
   box-shadow, no `transform: translateX` hover animations).
10. **No dashed borders** (DeferredRegion). "Coming later" scaffolds = blueprint card +
    `.tag-neutral` kicker ("Arriving Phase 2").

## 4. Component mapping (use these, don't invent parallels)

| PulsePlay element | Industry class |
|---|---|
| Top bar | `.nav` + `.nav-brand` |
| Any card / empty state / panel | `.card.blueprint` + 4 corner marks |
| Primary action | `.btn.btn-primary` (solid accent, square, marks) |
| Secondary / ghost actions | `.btn.btn-secondary` / `.btn.btn-ghost` |
| Chips, badges, severity labels | `.tag` (`-accent` / `-neutral` / `-outline`) |
| Persona / mode switchers | `.seg` + `.seg-opt` segmented control |
| Inputs, textareas, selects | `.input` (flat `--color-surface`, 4px radius) |
| Data tables | `.table` |
| Modals | `.dialog-backdrop` + `.dialog` |
| Photography | `.duotone` wrapper |

## 5. Target experience architecture

Two experience modes, switchable from a `.seg` control in the context bar:

### 5a. Unified — "My Decision Canvas" (flagship, default)
Single calm column (max-width ~880px), in this order:
1. **Context bar** — verified persona, business scope, data-as-of, trust chip
   (`.tag-accent` with shield icon), subtle AI-connector + BI-vendor indicator.
2. **Action Inbox** — ranked "NEEDS YOUR DECISION" cards (hero component, see §6).
   Governed tier ordering; personal relevance only re-orders within a tier.
3. **Since You Last Visited** — slim list band, ≤10 items, `Changed / Stale / Resolved` tags.
4. **My Canvas** — pinned sections grid, drag handles, saved order.
5. **Saved Items** — bookmarks + snapshots not pinned, "Pin to Canvas" action.
6. **Suggested for You** — collapsed by default, max 3, each with an explainable
   reason tag ("Related to your pending approval").
7. **One contextual detail drawer** — right-side panel (full-width sheet on mobile) with
   tabs: **Evidence | Ask Pulse | Dashboard | Approval**. Only one detail layer ever owns
   focus. Never stack modals/drawers.

### 5b. Segregated
A screens nav row (square nav buttons, active = solid accent) switching between full-screen:
**Decision Assist · AI Insights · Ask Pulse · Dashboard**. Same blueprint components, one
screen at a time.

Both modes respect the fixed 36px provenance footer and render states explicitly:
- **Loading:** skeleton blueprint card + "Scanning KPIs for decisions…" (no fake progress).
- **Empty:** slim band, still reachable ("No decisions need attention" + View resolved).
- **Error:** blueprint alert band + support code + **Retry**; never destroys card state.

## 6. The Decision Prompt card (hero component) — exact anatomy

```
┌─ blueprint frame + corner marks, 3px left severity rail ─────────────┐
│ NEEDS YOUR DECISION  [Severity tag]                     $000,000     │
│ Headline (Barlow Cond. 19px)                     impact label       │
│ Issue line (13px, neutral-700)                   ▬▬▬▬▬▬░░ mini-bar  │
│ WHY [root cause] · FIX [recommended action]      "measured ·        │
│                                                   deterministic"    │
│ Action question (13.5px, weight 500)                                 │
│ [Primary →] [Snooze] [Mark false positive] [Details]     [Save ▾]   │
│ confidence · Level n · RULE-ID · owner · status · data-as-of        │
└──────────────────────────────────────────────────────────────────────┘
```
- Impact value: `--font-heading`, tabular-nums, scaled mini-bar (single accent hue) vs stack max.
- **Save ▾** opens one menu: Pin to Canvas / Bookmark / Add note / Highlight / Snapshot.
- Deterministic values are labelled "measured · deterministic"; AI-narrated content is
  labelled "AI-narrated" — never imply a generated number is measured.

## 7. Non-negotiables (carry into every change)

- Governance visible: persona, data-as-of, trust/freshness on everything rendered.
- WCAG 2.2 AA: keyboard nav, visible 2px accent focus ring, labelled controls, non-color
  status cues (text labels beside every severity/status color), 44px touch targets,
  no hover-only actions.
- Dark theme = documented Industry extension only: ground from the neutral-900 ramp
  (`#1a1c1e` bg / `#232628` surface), dividers re-derived, accent ramp unchanged. Do not
  fork a parallel dark token system.
- Mobile: same content order, single column; drawer becomes full-width sheet returning
  focus to origin on close.
- No fake business data in mocks — bracketed placeholders (`[KPI name]`, `[timestamp]`).

## 8. Remediation order (when touching existing code)

1. **P1 Foundations:** load Industry tokens; alias `--pp-*`; Barlow fonts; steel accent;
   add lucide-react; kill hard-coded hexes.
2. **P2 Components:** zero radii; blueprint frames on all cards + primary buttons;
   transparent card backgrounds; de-gradient; de-emoji; extract Decision Assist inline styles.
3. **P3 Polish:** `.nav` top bar; flat inputs; clean focus rings; remove hover transforms;
   0.85× spacing; dark-mode alignment.

Reference implementations live in the design workspace:
`My Decision Canvas.dc.html` (unified + segregated + drawer + states) and
`PulsePlay Design Audit.dc.html` (full findings, token deltas, compliance matrix).
