# My Decision Canvas — Design Approach Prompt

> Hand this to any implementation agent (Claude, Codex, a developer) building or revising
> the "My Decision Canvas" unified workspace. It describes HOW to approach the design —
> the structure, content model, and visual system — distilled from the working reference
> (`My Decision Canvas v4.dc.html`) and the Industry design system it's built on.

## 1. Framing

My Decision Canvas is PulsePlay's flagship **unified** surface — one workspace that
consolidates Decision Assist, AI Insights, Ask Pulse, and Dashboard instead of forcing
the user to jump between segregated screens. A **Segregated** mode stays available for
users who prefer one screen at a time; both modes share the same components and data.

Design it as an **enterprise BI cockpit**, not a marketing surface: dense, scannable,
governed, and calm — but visually alive (colorful KPI tiles, charts, clear severity
color-coding), not a flat grey wireframe.

## 2. Structural approach — sidebar shell, not a stacked single column

Use a persistent **left sidebar** (≈216px) for navigation between the four capability
screens plus "Unified Canvas," with a governance/freshness card pinned at the bottom.
The main area gets a **top bar** (page title, governed chip, notifications, persona
avatar) and then a **content column** that scales to the viewport (max-width ~1320px).

This reads as a real product shell (like a sales/ops dashboard) rather than a marketing
page or a single scrolling document — nav on the left, context at the top, work in the
middle.

## 3. Content model, top to bottom

1. **KPI strip** — 3–4 pastel tinted tiles, each: icon in a tinted chip, big tabular
   number, a colored delta chip, label underneath. This is the "at a glance" band.
2. **Chart row** — a trend line/area chart (2/3 width) + a small multi-segment donut or
   gauge (1/3 width). Real visual data, not a wireframe placeholder box.
3. **Attainment/region bars** — one card, horizontal bars per segment, colored by status.
4. **Needs Your Decision** — the hero list. Full cards, not a compact row: severity chip
   (+ "AI" chip when the detection is AI-narrated vs deterministic), headline, one-line
   issue, a compact **WHY / FIX** scan line, a large impact number + label, the action
   question, then actions: **Approve** (primary) · **View Evidence** · **Ask Pulse** ·
   **Dismiss** · **Save ▾** (opens Pin/Bookmark/Note/Highlight/Snapshot). Footer meta:
   confidence, level, rule id, owner, status, timestamp.
5. **Since You Last Visited** — a slim list, each row tagged UPDATED / STALE / RESOLVED /
   NEW with a relative timestamp.
6. **My Canvas** — the user's pinned items (dashboard, AI insight, native chart — label
   each with its kind), drag-to-reorder, plus an explicit dashed "Pin something here" slot.
7. **Saved Items** — bookmarks/snapshots not currently pinned.
8. **Suggested for You** — collapsed by default, "AI" chip, teaser copy only until expanded.

Only ONE contextual detail layer exists: a right-side drawer with tabs (Evidence · Ask
Pulse · Dashboard · Approval). Never stack a second modal/drawer on top of it.

## 4. Visual system — Industry tokens + a controlled semantic palette

Base every value on the Industry design system tokens (`--font-heading` Barlow Condensed,
`--font-body` Barlow, `--color-*` steel accent ramp, `--space-*`, `--radius-*`). Industry
itself is intentionally mono (one steel accent) — for a BI dashboard that needs to read
"colorful" and support fast status scanning, layer a **small, fixed semantic palette** on
top, used consistently everywhere (never introduce more colors ad hoc):

```
--pp-good:   #1f9d6b   (on track / resolved / positive delta)
--pp-warn:   #e0902c   (medium severity / stale / watch)
--pp-bad:    #d1453d   (critical severity / at risk / negative delta)
--pp-violet: #7c5cd8   (AI-narrated content / "changed" status / suggestions)
```
Each has a `-soft` tint (10–15% mix on white) for chip/card backgrounds, with the solid
color as text/icon/border. Map severity → color consistently: Critical = bad, High =
warn, Medium = violet (also carries the "AI" badge when the detection is AI-narrated).
KPI deltas: up-is-good = good, down-is-bad = bad, flat = neutral.

Cards are `#fff` on a light neutral page background, `border-radius: var(--radius-lg)`,
a soft `box-shadow: var(--shadow-sm)` that deepens slightly on hover — rounded and
elevated here (a deliberate divergence from Industry's flat blueprint-card default,
justified because this is a data-dense BI cockpit, not a wireframe document). Keep
Barlow/Barlow Condensed typography and the steel accent as the PRIMARY brand color
(nav active state, primary buttons, governed chip) — the semantic palette is secondary,
reserved for status/severity/delta meaning only.

## 5. Interaction & state rules

- Loading: a real "Scanning KPIs for decisions…" message, never a fake progress bar.
- Empty: still reachable, one line + a way to see resolved items.
- Error: specific message + support code + non-destructive **Retry**.
- Governance is visible everywhere data renders: persona, data-as-of, trust chip.
- Deterministic vs AI-narrated must be visually distinguishable (the "AI" chip).
- 44px minimum touch targets, visible 2px accent focus rings, no hover-only actions.
- Mobile: sidebar collapses to a top nav or hamburger; content stays single column in
  the same top-to-bottom order.

## 6. What to avoid

- Don't fall back to a flat, colorless wireframe page for this surface — that reads as
  under-designed for a BI product (see the "Design Standards Review" audit for why the
  base Industry template alone under-serves a dashboard use case).
- Don't invent new hues beyond the four semantic colors above — consistency is what
  makes the "colorful" version still feel governed and premium rather than noisy.
- Don't reintroduce pill-shaped chips, heavy multi-layer shadows, gradients on brand
  text, or emoji — those are the specific anti-patterns flagged in the 2026-07 audit.
- Don't stack multiple modals/drawers — one contextual detail layer only.

## 7. Reference implementation

`My Decision Canvas v4.dc.html` is the working reference for this approach — sidebar
shell, KPI tiles, trend/donut charts, full decision cards with real reference copy
(OTIF SLA, Inventory Variance, Forecast Drift examples), and all four supporting
sections. Treat it as the starting point for further iteration, not something to
rebuild from scratch.
