# AI Briefing Design Direction

> **Status:** locked 2026-05-18. Source: Rajesh's "sugar candy" direction on top of the earlier 4-priority brief (semantic cue consistency, toolbar noise reduction, information hierarchy, calmer visual system). Mirrored into HANDOVER + AGENDA + AGENT_SYNC + memory. Phases A + B of the structural work already shipped (`1e04a31`, `e87bae0`); Phases C + D inherit this direction.

## The intent

The AI Insights briefing should feel like **sugar candy** in the best product-design sense:

> Visually attractive, satisfying, and delightful enough that users want to come back again and again.

Said another way: a **premium AI business briefing that feels trustworthy and executive-grade, but also magnetic**. Calm enterprise-grade foundation with a sweet, modern, irresistible interaction layer that makes others feel the hard work that has gone into it (Pulse → PulsePlay long journey, many things worked on — bring that experience as cleanness).

The phrase is "sugar candy" — **not literally candy, not childish, not gimmicky, not noisy**. It is the *flavour* that pulls users back.

## Do

- **Tasteful motion.** Short (180–300ms), eased, never bouncy. Stagger when sequences appear; let them feel choreographed, not random.
- **Soft depth.** Subtle shadow + 1-pixel inset highlight on lift, never harsh. Depth signals interactivity, not decoration.
- **Refined colour accents.** One accent moment per screen. Restrained gradients used as polish on the primary CTA, never as background fills.
- **Satisfying hover/press states.** Buttons, tabs, chips, cards should *react* — tiny scale change, soft glow, subtle shadow shift. Press feedback ~60ms (haptic-feeling); hover ~180ms (intentional).
- **Arrival polish on insights.** Sections should *appear* — short fade + small slide-up, with a small stagger so the briefing feels composed, not dumped.
- **Memorable visual personality.** The product should be recognizable from a thumbnail. The surface switcher rail, the status badges, and the artifact card shell are the signature elements; they get the most polish.
- **Strong sense of reward** when validated insights land. Status badge for Verified is the user's "OK to act" cue; it should feel earned.

## Don't

- **Cartoonish styling.** No bouncy springs, oversized icons, emoji-heavy chrome, or playful illustrations.
- **Loud gradients everywhere.** Accent moments only; backgrounds stay neutral.
- **Visual clutter.** Fewer containers, fewer borders, fewer footers. White space is the canvas; chrome is the frame.
- **Sacrifice semantic accuracy or readability.** Tone classes always win over decorative color; status badges always render their literal status; tabular data wins over visual flourish.
- **Marketing-landing-page feel.** No hero animations on load, no autoplay, no "delight burst" on every interaction.

## Concrete techniques

### Motion grammar

| Surface | Motion | Duration | Easing |
|---|---|---|---|
| Section card arrival | Opacity 0 → 1, translateY 6px → 0 | 280ms | cubic-bezier(.2,.7,.2,1) |
| Section card stagger | 60ms per index | — | — |
| Surface switcher tab :active | scale(1) → scale(.97) → scale(1) | 60ms / 120ms | ease-out |
| KPI tile :hover | translateY(0) → translateY(-1px) + shadow softening | 180ms | ease-out |
| Status badge first render | scale(.94) → scale(1) | 220ms | cubic-bezier(.2,.9,.2,1) |
| Follow-up chip :hover | background + 1px elevation | 160ms | ease-out |
| Composer submit | Loading shimmer on the Ask button | continuous | linear |

All motion is gated by `@media (prefers-reduced-motion: reduce)` — animations collapse to instant.

### Depth grammar

| Element | Resting | Hover | Press |
|---|---|---|---|
| Section card | shadow 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(15,23,42,.04) | shadow 0 1px 2px rgba(0,0,0,.04), 0 16px 36px rgba(15,23,42,.06) | inset 0 0 0 1px rgba(0,0,0,.04) |
| KPI tile | shadow 0 1px 2px rgba(0,0,0,.05) | shadow 0 4px 14px rgba(15,23,42,.06), translateY(-1px) | none |
| Surface switcher tab (active) | gradient #3b82f6 → #1d4ed8 + shadow 0 8px 20px rgba(37,99,235,.22) | brighten 4% | scale(.97) |
| Follow-up chip | 1px border, no shadow | bg accent-soft, 1px elevation | scale(.98) |
| Artifact card | 1px border, soft outer shadow | unchanged (sits inside a pane, not interactive itself) | — |

Shadows are always **soft + low-opacity** — never harsh. Inset highlights are reserved for press feedback only.

### Colour grammar

| Use | Reference | When |
|---|---|---|
| Primary accent | `#1a6fd4` (light) / `#3b82f6` (dark) | Surface switcher active, composer submit, primary CTA |
| Verified | `#15803d` | Verified status badge only |
| Grounded draft | `#b45309` | Grounded-draft status badge only |
| Suggestion | accent | Suggestion status badge |
| Blocked | `#c1392b` | Blocked status badge + composer error banner |
| Watch (amber) | `#fbbf24` (dark) / `#92400e` (light) | Watch tone on inline pills and KPI deltas |
| Surface neutral | bg / surface / border tokens | Everything else |

**One accent moment per screen** is the rule. The surface switcher is the accent in the Pulse view; the Verified badge is the accent in the artifact card; the Ask button is the accent in the composer.

### Information hierarchy (Phase D scope)

```
┌──────────────────────────────────────────────────────────┐
│  Executive Brief                                         │  ← top, full-width or 60/40 with KPI Snapshot
│  ─────────                                               │
│  Briefing prose + headline. The card most people will    │
│  read first; calmest layout, no inline pills crowding.   │
└──────────────────────────────────────────────────────────┘
┌─────────────────────────┬────────────────────────────────┐
│  KPI Snapshot           │  What Changed                  │  ← middle pair
│  ──────────────         │  ──────────                    │
│  Status tile grid.      │  Inline-pill narrative.        │
│  Hover lifts subtly.    │  Trend pills carry tone.       │
└─────────────────────────┴────────────────────────────────┘
┌─────────────────────────┬────────────────────────────────┐
│  What Needs Attention   │  Next Best Actions             │  ← lower pair; Actions gets prominence
│  ────────────────       │  ─────────────                 │
│  Risk cards.            │  ACTION-FORWARD chrome.        │
│  Restrained red accent. │  Accent-tinted card; CTA-like. │
└─────────────────────────┴────────────────────────────────┘
```

**Next Best Actions** is the section that earns the prominence treatment (slight accent tint background, stronger border, CTA-feeling). Everything else stays calm.

### Toolbar (Phase C scope)

Keep visible:
- AI Insights / Ask Pulse / BI Viz surface switcher
- Adjust ⚙
- Run/status chip
- Refresh + Export (only if truly primary; otherwise overflow)

Move to `⋮` overflow:
- Copy (Markdown / HTML / PNG)
- Code / SQL view toggle
- Diagnostics
- Console
- Anything else secondary

Overflow opens as a small popover; items have hover affordance; press feedback matches the surface switcher grammar.

## Tripwires (do not regress)

- **Semantic accuracy first.** Tone classes always win over decorative color. A "Verified" badge means the validator emitted Verified — never repurpose the badge for visual decoration.
- **Readability first.** Motion never delays content arrival by more than ~300ms total. Reduced-motion users get instant. Contrast ratios stay AA.
- **No permanent BI pane.** BI Viz is the peer same-canvas surface in `mix` mode. Polish does not re-introduce focused-pane defaults.
- **Validator + sandbox untouched.** No artifact validator change. No iframe sandbox widening. No "100% hallucination-free" wording.
- **No `pulse/*` modifications by other workbench work.** Pulse-port detangling stays additive (the AI Briefing is Pulse-native, so the Pulse view itself is allowed to evolve — that's separate from the additive constraint on workbench-borrowed Pulse helpers).
- **One accent moment per screen.** Pulse pulled itself into "loud gradient" territory in the past; do not regress.
- **Stagger respects streaming order.** When sections stream in incrementally, each new section animates as it arrives; do not re-animate already-rendered sections on every new arrival.

## What ships when

| Lane | Shipped | Direction applies |
|---|---|---|
| Phase A — semantic cue consistency (inline pill tone) | `1e04a31` | ✅ tone grammar locked |
| Phase B — section label renames | `e87bae0` | ✅ briefing language locked |
| Phase X — sugar candy proof slice (section arrival, switcher press, KPI hover) | next commit this session | demonstrates the direction |
| Phase C — toolbar noise reduction | queued | use overflow popover grammar above |
| Phase D — information hierarchy + visual calming | queued | use layout sketch above, "Next Best Actions" gets prominence |
