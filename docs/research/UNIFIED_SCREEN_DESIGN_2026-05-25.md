# Unified Screen Design — 2026-05-25

> **Status:** Design doc awaiting Rajesh sign-off. **NO CODE until this is locked.**
>
> **Replaces:** Old Steps 2-6 of the unified-surface beast-mode plan. Steps 0/1/1.5 (cell catalog, uiMode drop, UnifiedAssistantSurface rename) are already shipped and stand as foundation.
>
> **Source decisions:** Locked 2026-05-25 in a 4-question beast-mode brainstorm with Rajesh.

---

## 1. Vision (one paragraph)

PulsePlay is ONE consistent screen with a stable chrome — three top tabs (`AI Insights` / `Ask Pulse` / `Dashboard`), a top bar, a side rail, and a composer at the bottom. The content inside the main canvas morphs as the user jumps between tabs, but the layout/frames stay consistent so the experience feels continuous, not page-loaded. Authors get rich per-tab configurability; viewers see a flawless, predictable surface. Detach is duplicative (the floating window is a synchronized clone of the original, not a relocation). BI and AI sync at the data-context layer (one-way today, bidirectional later). The BI tab can host one or two BI canvases — author chooses the count and which surface fills each.

---

## 2. The three locked decisions (with explicit wording)

### D1 — Tab layout: author-configurable per tab via Settings → Display

Each of the three tabs (`AI Insights`, `Ask Pulse`, `Dashboard`) carries its own Layout Preset (ai-left / ai-right / ai-top / ai-bottom). The author picks; users inherit. Same Settings → Display surface owns all three.

### D2 — Cross-pane sync: phased

- **Phase 1 (ships in v1 of the unified screen):** BI → AI. BI selections (filter, page, cell) feed AI context automatically on the next prompt. One-way, universal (works for every vendor adapter).
- **Phase 2 (later cycle):** AI → BI. AI answers can apply filters, highlight cells, navigate pages on the BI canvas. Requires deep per-vendor adapter contracts; some vendors may not support every primitive.

### D3 — BI tab: author controls pane count AND pane assignment, free choice

- Pane count: 1 OR 2 (author setting).
- Pane assignment (if 2): author picks any combination of Native BI / Power BI / Tableau / Qlik / Looker / generic-iframe for each pane. No "Native + Vendor only" lock; full freedom.

### D4 — Execution discipline

Write this design doc, get sign-off, THEN sequence rebuilt steps. No code lands until the doc is signed.

---

## 3. The unified screen anatomy

### 3.1 Consistent chrome (every tab)

```
┌────────────────────────────── PulsePlay ────────────────────────────────┐
│ PulsePlay logo + breadcrumb           Connection pills          ⚙ menu │
├─────────────────────────────────────────────────────────────────────────┤
│ [✨ AI Insights] [💬 Ask Pulse] [📊 Dashboard]   Tab tools / pane menu  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                                                                         │
│              MAIN CANVAS — content depends on active tab                │
│                                                                         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ Composer — visible on AI tabs; collapsed on Dashboard tab               │
└─────────────────────────────────────────────────────────────────────────┘
```

**What stays constant across tabs:**
- Top bar (logo, breadcrumb, connection pills, settings menu)
- Tab strip (always shows the three pills)
- Tab tools (right-side row: detach ↗, minimize ─, maximize ⛶, frame selector, pane menu)
- Composer at the bottom (visible on AI Insights + Ask Pulse; collapsed/iconified on Dashboard)
- Settings deep-links open the same Settings surface

**What changes per tab:**
- Main canvas content
- Tab-specific pane menu options (e.g., "BI panes: 1 / 2" only on Dashboard)
- Composer placeholder text (briefing vs chat vs quick-ask)

### 3.2 Tab 1: AI Insights (briefing-first)

Primary purpose: auto-generated structured briefing on the loaded data. User reads, then may follow up via chat.

```
┌────────────────────────────── PulsePlay ────────────────────────────────┐
│ PulsePlay   ●  Ready BI+AI                                           ⚙ │
├─────────────────────────────────────────────────────────────────────────┤
│ [✨ AI Insights ●] [💬 Ask Pulse] [📊 Dashboard]   ⛶ ─ ↗  Frame: SWOT ▾ │
├─────────────────────────────────────┬───────────────────────────────────┤
│                                     │ ┌─ HEADLINE ─────────────  ↻ ─┐  │
│   BI canvas (passive view)          │ │ Revenue ▲ 12.4% QoQ          │  │
│                                     │ └──────────────────────────────┘  │
│   - Shows the same vendor surface   │ ┌─ TRENDS ──────────────  ↻ ─┐   │
│     as Dashboard tab                │ │ Sustained growth in EMEA…   │   │
│   - Read-only mode visually         │ │ Margin compression APAC…    │   │
│   - User selections still feed      │ └──────────────────────────────┘  │
│     AI context (Phase 1 sync)       │ ┌─ RISKS ───────────────  ↻ ─┐   │
│                                     │ │ Top 3 risks, each cited…    │   │
│                                     │ └──────────────────────────────┘  │
│                                     │ ┌─ RECOMMENDED ACTIONS  ↻ ─┐     │
│                                     │ │ 1. Reallocate Q4 budget…    │   │
│                                     │ │ 2. Audit pricing in APAC…   │   │
│                                     │ │ 3. Pilot subscription tier… │   │
│                                     │ └──────────────────────────────┘  │
├─────────────────────────────────────┴───────────────────────────────────┤
│ Composer: "Refine this briefing…"   [/swot] [/bcg] [/rfm]            ↑ │
└─────────────────────────────────────────────────────────────────────────┘
```

**Layout direction** (left vs right vs top vs bottom): driven by author setting `pulseplay:layout-mode:ai-insights` (see §6). Wireframe above shows `ai-right`.

### 3.3 Tab 2: Ask Pulse (chat-first)

Primary purpose: conversational chat. User asks, AI replies. Multi-turn.

```
┌────────────────────────────── PulsePlay ────────────────────────────────┐
│ PulsePlay   ●  Ready BI+AI                                           ⚙ │
├─────────────────────────────────────────────────────────────────────────┤
│ [✨ AI Insights] [💬 Ask Pulse ●] [📊 Dashboard]   ⛶ ─ ↗  Frame: BCG ▾  │
├─────────────────────────────────────┬───────────────────────────────────┤
│                                     │ You: Top 3 categories?           │
│   BI canvas (passive view)          │ ┌────────────── Verified ──────┐ │
│                                     │ │ AI: Technology $836K…        │ │
│   - Same vendor surface             │ │ ┌──────────────────────────┐ │ │
│   - User selections feed AI context │ │ │ Category │Sales │ Margin% │ │ │
│   - User can click a cell → AI is   │ │ │ Tech     │$836K │ 🟢 17.4%│ │ │
│     scoped to that cell on next     │ │ │ Furniture│$742K │ 🔴 2.5% │ │ │
│     question                        │ │ │ Office   │$719K │ 🟢 17.0%│ │ │
│                                     │ │ └──────────────────────────┘ │ │
│                                     │ └──────────────────────────────┘ │
│                                     │ You: What's pulling margin down? │
│                                     │ AI (Generating…) …               │
├─────────────────────────────────────┴───────────────────────────────────┤
│ Composer: "Ask about the loaded view…" [/swot] [/bcg] [/rfm]         ↑ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Tab 3: Dashboard, 1-pane mode (default)

Primary purpose: rich BI interaction. Full canvas for filter/drill/select/explore.

```
┌────────────────────────────── PulsePlay ────────────────────────────────┐
│ PulsePlay   ●  Ready BI+AI                                           ⚙ │
├─────────────────────────────────────────────────────────────────────────┤
│ [✨ AI Insights] [💬 Ask Pulse] [📊 Dashboard ●]  ⛶ ─ ↗  BI Panes: ❶ ▾ │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                                                                         │
│       BI canvas (full width, active interaction)                        │
│                                                                         │
│       Whichever vendor the author configured:                           │
│       Power BI / Tableau / Qlik / Looker / Native BI / generic-iframe   │
│                                                                         │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ Composer: ▾ Ask about this dashboard  (collapsed; click to expand)      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Tab 3: Dashboard, 2-pane mode (author-configured)

```
┌────────────────────────────── PulsePlay ────────────────────────────────┐
│ PulsePlay   ●  Ready BI+AI                                           ⚙ │
├─────────────────────────────────────────────────────────────────────────┤
│ [✨ AI Insights] [💬 Ask Pulse] [📊 Dashboard ●]  ⛶ ─ ↗  BI Panes: ❷ ▾ │
├──────────────────────────────────────┬──────────────────────────────────┤
│ ❶ Pane A: Power BI                   │ ❷ Pane B: Native BI              │
│ ┌──────────────────────────────────┐ │ ┌──────────────────────────────┐ │
│ │                                  │ │ │                              │ │
│ │  Power BI canvas                 │ │ │  PulsePlay-native (ECharts)  │ │
│ │  (vendor-rendered)               │ │ │  charts/tables/KPIs          │ │
│ │                                  │ │ │                              │ │
│ │                                  │ │ │  Same dataset; different     │ │
│ │  Pane menu: switch surface       │ │ │  visualization story         │ │
│ │  / hide pane / promote to        │ │ │                              │ │
│ │  primary                         │ │ │                              │ │
│ │                                  │ │ │                              │ │
│ └──────────────────────────────────┘ │ └──────────────────────────────┘ │
├──────────────────────────────────────┴──────────────────────────────────┤
│ Composer: ▾ Ask about either dashboard  (selections from EITHER pane   │
│ feed AI context)                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

**Author's free choice (D3):** Each pane independently picks from `{Native, Power BI, Tableau, Qlik, Looker, generic-iframe}`. Including duplicates (Pane A = Power BI report 1, Pane B = Power BI report 2) is allowed.

### 3.6 Detach behavior — duplicative

```
                  Main PulsePlay window                       Floating window
┌─────────────── PulsePlay ───────────────┐         ┌─── AI Insights ↗ ────┐
│ [✨][💬][📊]                              │         │ HEADLINE              │
│ ┌─────────────┐ ┌───────────────────┐   │         │ TRENDS                │
│ │             │ │ HEADLINE          │   │ ←┄┄┄┤ RISKS                 │
│ │ BI canvas   │ │ TRENDS  ← STAYS!  │   │  sync │ ACTIONS               │
│ │             │ │ RISKS             │   │         │                       │
│ │             │ │ ACTIONS           │   │         │ Composer  ↑           │
│ └─────────────┘ └───────────────────┘   │         └───────────────────────┘
└─────────────────────────────────────────┘
```

**Contract:**
- Detached window is a SYNCHRONIZED CLONE, not a relocation.
- Edits to either (composer typed, scroll position, section expanded) propagate via shared state.
- Closing the floating window restores nothing visually (the slot was never empty).
- Re-docking is a no-op visually (the float just closes).

This solves the "feels detached" complaint. The user sees continuity in the main window AND has a floating workspace.

---

## 4. Settings model

### 4.1 New keys (added)

| Key | Type | Purpose |
|---|---|---|
| `pulseplay:layout:ai-insights` | `"ai-left" \| "ai-right" \| "ai-top" \| "ai-bottom"` | Layout preset for AI Insights tab |
| `pulseplay:layout:ask-pulse` | same | Layout preset for Ask Pulse tab |
| `pulseplay:layout:dashboard` | `"single" \| "split-h" \| "split-v"` | 1-pane (single) or 2-pane (horizontal/vertical split) on Dashboard |
| `pulseplay:bi-pane-assignment` | `{ paneA: VendorId, paneB: VendorId | null }` | Which BI surface fills each Dashboard pane |
| `pulseplay:detached-windows` | `Array<{ pane: "ai-insights" \| "ask-pulse" \| "bi-pane-a" \| "bi-pane-b", windowId: string }>` | Currently floating windows; persists across reloads |

### 4.2 Keys deprecated / repurposed

| Key | Status | Action |
|---|---|---|
| `pulseplay:layout-mode` | Repurposed | Becomes the default for all 3 tabs; per-tab overrides via the new keys above |
| `pulseplay:active-surface` | Kept | Still tracks which tab is active |
| `pulseplay:ui-mode` | Already deprecated 2026-05-25 (Step 1) | Stays as escape hatch only |
| `pulseplay:bi-vendor` | Kept | Pane A defaults to this; Pane B starts unassigned |

### 4.3 Settings → Display group, reshaped

```
Settings → Display
  ├─ Layout per tab
  │   ├─ AI Insights layout: [ai-left / ai-right / ai-top / ai-bottom]
  │   ├─ Ask Pulse layout:   [ai-left / ai-right / ai-top / ai-bottom]
  │   └─ Dashboard layout:   [single / split-horizontal / split-vertical]
  ├─ BI panes (Dashboard tab)
  │   ├─ Pane A surface:     [Native / Power BI / Tableau / Qlik / Looker / iframe]
  │   └─ Pane B surface:     [— / Native / Power BI / Tableau / Qlik / Looker / iframe]
  ├─ Detach behavior
  │   └─ "Detach duplicates" (always on; not user-toggleable v1)
  └─ Default landing tab
      └─ [AI Insights / Ask Pulse / Dashboard]
```

---

## 5. State management & component shape

### 5.1 New top-level component

```
App.tsx (bootstrap — routing, allowlist, settings provider, wizards)
  └─ <PulsePlayScreen>                       ← NEW: the unified screen owner
       ├─ <TabBar>                           ← AI Insights / Ask Pulse / Dashboard
       ├─ <TabToolsBar>                      ← detach / minimize / maximize / frame / panes
       ├─ <TabBody>                          ← morphs per active tab:
       │    ├─ <AIInsightsLayout>            ← briefing + passive BI (layout from setting)
       │    │    ├─ <BIPanel> (passive)
       │    │    └─ <UnifiedAssistantSurface entryIntent="briefing">
       │    ├─ <AskPulseLayout>              ← chat + passive BI
       │    │    ├─ <BIPanel> (passive)
       │    │    └─ <UnifiedAssistantSurface entryIntent="chat">
       │    └─ <DashboardLayout>             ← 1 or 2 BI panes (active)
       │         ├─ <BIPanel paneId="A"> (active)
       │         └─ <BIPanel paneId="B"> (active, only when split)
       ├─ <ComposerDock>                     ← bottom bar, intent depends on tab
       └─ <FloatingWindows>                  ← portal-rendered duplicates
            └─ for each detached pane: a window mirroring the source pane
```

### 5.2 Shared state — single source of truth

A **`PulsePlayScreenContext`** at the `<PulsePlayScreen>` root owns:
- `activeTab: "ai-insights" | "ask-pulse" | "dashboard"`
- `perTabLayout: { aiInsights, askPulse, dashboard }`
- `biPaneAssignment: { paneA, paneB | null }`
- `biSelectionState: { paneA: BIEvent[], paneB: BIEvent[] }` ← feeds AI context (Phase 1 sync)
- `detachedWindows: DetachedWindowSpec[]`
- `composerState: { value: string, intent: "briefing" | "chat" }`
- Settings + governance attestation (from existing settings provider)

Children consume via `usePulsePlayScreen()` hook. Both the in-screen render AND the floating-window render read the same state — that's how detach-duplicates stay synchronized.

### 5.3 Cross-pane sync (Phase 1: BI → AI only)

The `biSelectionState` updates whenever BIPanel emits a `BIEvent`. UnifiedAssistantSurface reads it and includes the summary in its next prompt's `[BI Context]` block (this is already partially implemented). The sync requires NO per-vendor work — every adapter already emits `BIEvent` via the `BIAdapter` contract.

### 5.4 Detached windows (Phase 1: ai-insights + ask-pulse only)

Detached windows are rendered via `React.createPortal` into a new browser window opened by `window.open()`. Cross-window React state sync is done via the `BroadcastChannel` API (works across same-origin windows in modern browsers). Each floating window has its own React root but consumes the same `PulsePlayScreenContext` snapshot via BroadcastChannel-bridged updates.

**Constraints:**
- Floating windows are same-origin (no iframe shenanigans)
- BroadcastChannel is the sync mechanism (no shared memory)
- Closing the floating window detaches the BroadcastChannel cleanly
- BI panes can't be detached in Phase 1 (vendor adapters don't tolerate multiple mounts of the same surface; some embed tokens are single-use)

---

## 6. Cell Catalog integration

The cell catalog (Step 0) becomes the authoritative source for:
- Which BI vendors are available in the BI Pane A/B picker (filtered by cells that match the active AI assistant profile)
- Which capabilities the active cell requires (e.g., `powerbi-genie` requires `sectioned-chat` → if AI Insights tab uses sectioned briefing, it works; if not, audit fails with a warning)
- The default Dashboard pane assignment (read from `cell.surface.vendor` on cell activation)

A new `usePulsePlayActiveCell()` hook returns `getCellEntry(matchActiveCell(activeVendor, activeProfileType))`. Settings UI surfaces shape: "You're using the `powerbi-genie` cell. Available capabilities: chat ✓ sectioned-chat ✓ trust-badges ✓ embed-token-server ✓".

---

## 7. Migration plan — how do we get from today to this

The current architecture mounts BIPanel + UnifiedAssistantSurface as App.tsx siblings. The unified screen needs them inside `<PulsePlayScreen>`. The migration is mechanical but multi-step:

### Phase A — Foundation (the rebuilt Steps 2/3, ~1 week)

1. **Step 2 (rebuilt)** — Create `<PulsePlayScreen>` wrapper. App.tsx mounts it. The wrapper internally mounts BIPanel + UnifiedAssistantSurface in the current 2-component side-by-side layout. **No user-visible change. ~6-8 hours.**
2. **Step 3 (rebuilt)** — Implement the 3-tab strip in `<PulsePlayScreen>`. Each tab mounts the same components with different `entryIntent` props + different layouts. **First user-visible change: tabs now switch content.** ~6 hours.
3. **Step 3.5** — Move tab-layout settings into the new per-tab keys (`pulseplay:layout:ai-insights` etc.). Settings → Display reshape. ~4 hours.

### Phase B — Cross-cutting features (the rebuilt Steps 4/5/6, ~2 weeks)

4. **Step 4 (rebuilt)** — Surface preset library (`/swot`, `/bcg`, `/rfm`, etc.) in the composer. Works on both AI Insights and Ask Pulse tabs since the composer is shared. ~2-3 days.
5. **Step 5 (rebuilt)** — Phase 1 BI → AI sync via `biSelectionState`. Wire the BIPanel `BIEvent` emissions into PulsePlayScreenContext. ~1 day.
6. **Step 6 (rebuilt)** — Per-tab layout settings UI in Settings → Display. ~1 day.
7. **Step 7 (new)** — Dashboard 2-pane mode + Pane A/B assignment. ~2-3 days (the BIPanel registry needs to handle two simultaneous mounts of different vendors).

### Phase C — Polish (~1 week)

8. **Step 8** — Detach-duplicate behavior via window.open + BroadcastChannel. ~3 days.
9. **Step 9** — Composer dock that morphs based on active tab. ~2 days.
10. **Step 10** — Cell catalog consumers in Settings (the active-cell readout). ~1 day.

### Phase D — Migration of legacy PulseShell features (Steps from prior plan)

11. **Step 11** — Port history persistence (was Step 5 of old plan). ~1 day.
12. **Step 12** — Port Show-SQL-per-section toggle (was Step 6). ~6 hours.
13. **Step 13** — Port remaining P1 features from the PulseShell audit (multi-space, presets in briefing, two-tier cache). ~1-2 weeks.

### Phase E — Phase 2 sync (post-MVP)

14. **Step 14** — AI → BI sync (D2 Phase 2). Per-vendor adapter extension. Cycle-by-cycle work. ~2-4 weeks total spread across vendors.

**Total estimate to full vision: 6-10 weeks of focused work.**

---

## 8. Cross-cutting concerns

### 8.1 Performance

- BIPanel-passive on AI tabs: the BI canvas is rendered but interactions disabled. Vendor SDKs DO consume CPU even when "read-only"; consider auto-unmount when the user has been off the BI tab for >2 minutes (Suspense + lazy re-mount).
- Detached windows: each opens a new browser window with its own React root + bundle. Cold-start cost ~500ms-1s. Acceptable for power users.
- Cell catalog audit: runs once on cell change; cached in `PulsePlayScreenContext`. No per-render cost.

### 8.2 Accessibility

- Tab strip: standard ARIA tabs pattern with `role="tablist"`, `aria-selected`, keyboard nav (←/→/Home/End).
- Floating windows: must announce open/close via `aria-live` so screen-reader users aren't surprised.
- Layout switches: announce "Layout changed to AI on right" via `aria-live` polite when user toggles per-tab layout.
- Cell catalog: missing-capability warnings rendered as `role="status"` not silently hidden.

### 8.3 Governance

- Detached windows must inherit the same proxy-attached `governance` envelope as the main window. Validated via BroadcastChannel hash.
- BI panes in 2-pane mode: each pane has its OWN governance attestation (different vendor, different embed token). UI shows pill per pane.
- Per-cell required capabilities must be satisfied before the cell is activated; partial fail = warning chip, not silent acceptance.

### 8.4 Testing

- Existing 1571 tests must stay green after every step.
- New tests: PulsePlayScreen tab switching, per-tab layout persistence, BI 2-pane render, detach-window BroadcastChannel sync (use jsdom mock), cross-pane sync (BIEvent → AI context).
- Live smoke after each Phase: drive playwright through the unified screen, capture screenshots.

---

## 9. Risks and open questions

### Risks

- **`window.open()` blocked by browser pop-up blockers** — needs user-initiated trigger (click on Detach button). First-time users may see a pop-up blocker prompt. Need fallback UX.
- **BroadcastChannel browser support** — IE/old Edge don't have it. PulsePlay already requires modern browsers per ADR-0002, but worth documenting.
- **BIPanel multiple mounts** — some vendor adapters (Power BI specifically) DO NOT tolerate two embeds of the same report on the same page. 2-pane mode with same-vendor different-reports works; 2-pane mode with same-report-twice may break. Test matrix needed.
- **Cell catalog audit happens at the wrong moment** — if AI Insights tab requires `sectioned-chat` capability and the active cell doesn't carry it, we either (a) hide the tab, (b) show a "Not available with this cell" empty state, (c) ignore the audit and let it fail at request time. Need to pick one.

### Open questions for future cycles

- Does the floating window get its own URL (so users can bookmark a detached view)?
- Should the Dashboard tab have a "compare mode" pill that auto-syncs cross-pane filters (Pane A filter → Pane B filter)?
- Does Phase 2 AI→BI sync include "AI asks BI to navigate to a specific page" or only filters/highlights?
- Per-tab composer state (typed-but-not-sent text) — does it persist across tab switches, or each tab gets its own draft?

---

## 10. The rebuilt step plan (replaces old Steps 2-6)

| # | Step | Effort | User-visible? | Dependencies |
|---|---|---|---|---|
| ✅ 0 | Cell catalog source-of-truth | shipped | no | — |
| ✅ 1 | Drop uiMode toggle | shipped | yes | — |
| ✅ 1.5 | Rename AISidebar → UnifiedAssistantSurface | shipped | no | — |
| 2 | Create `<PulsePlayScreen>` wrapper | 6-8h | no | sign-off |
| 3 | Implement 3-tab strip + tab-body morph | 6h | **YES — tabs work** | 2 |
| 3.5 | Per-tab layout settings | 4h | yes | 3 |
| 4 | Surface preset library `/swot /bcg /rfm` in composer | 2-3d | **YES — slash commands** | 2 |
| 5 | Phase 1 BI → AI sync | 1d | subtle | 2 |
| 6 | Per-tab layout settings UI | 1d | yes | 3.5 |
| 7 | Dashboard 2-pane mode + assignment UI | 2-3d | **YES — split BI** | 2 |
| 8 | Detach-duplicate via window.open + BroadcastChannel | 3d | **YES — detach works** | 2 |
| 9 | Composer dock morph per tab | 2d | yes | 3 |
| 10 | Cell catalog consumer in Settings | 1d | yes | 2 |
| 11 | Port history persistence (dwd_ai_chat_history) | 1d | yes | 2 |
| 12 | Port Show-SQL-per-section toggle | 6h | yes | 2 |
| 13 | Port remaining P1 PulseShell features | 1-2w | yes | 2, 11, 12 |
| 14 | Phase 2 AI → BI sync (deferred) | 2-4w | yes | per vendor |

**Total to MVP unified screen (Steps 2-10): ~3 weeks.**
**Total to full feature parity with PulseShell (Steps 11-13): +2-3 weeks.**
**Total including AI→BI sync (Step 14): +2-4 weeks per vendor.**

---

## 11. Sign-off checklist

Before any code lands, Rajesh confirms:

- [ ] §3 wireframes match the vision (3 tabs, 1-pane Dashboard default, 2-pane Dashboard configurable, AI Insights briefing-first, Ask Pulse chat-first)
- [ ] §3.6 detach behavior is duplicative (clone, not relocate)
- [ ] §4 settings model is correct (per-tab layout + BI pane assignment)
- [ ] §5 component shape is acceptable (PulsePlayScreen wraps BIPanel + UnifiedAssistantSurface)
- [ ] §6 cell catalog integration is the right scope (Settings readout + tab gating)
- [ ] §7 phased migration is acceptable (3 weeks to MVP, 6-10 weeks to full)
- [ ] §9 open questions answered or explicitly deferred
- [ ] §10 step sequence is approved

Once signed: code begins on Step 2 (PulsePlayScreen wrapper).

---

## 12. Foundation principles (for future-Claude / future-LLMs)

These are the foundational rules that any future change must respect:

1. **ONE user-visible screen.** Never add a parallel UI surface that bypasses PulsePlayScreen.
2. **Three tabs, no more, no fewer** until a new design doc supersedes this one.
3. **Stable chrome.** Top bar, tab strip, side rail, composer dock — these exist on every tab. New features go INSIDE the main canvas, not as new chrome elements.
4. **State in PulsePlayScreenContext.** No per-component state bypassing the context if that state is observable cross-tab or cross-window.
5. **Cell catalog is the source of truth for valid configurations.** Settings UI consumes it; tab availability respects it.
6. **Detach is duplicative, never relocational.** Any new "open in window" feature must follow this contract.
7. **Sync is governed by the BIAdapter contract.** No per-vendor short-cuts in PulsePlayScreen; everything flows through the registry.
8. **Authors configure; viewers consume.** Settings expose author choices; user-mode hides them.

Future changes that violate any of these need a new design doc, not just a PR.
