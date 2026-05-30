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

### D5 — Detach mechanism: in-app overlay (NOT `window.open()`) for v0.1

Detach floats panes as an in-app overlay z-indexed above the tab content. Because the overlay sits above the morphing main canvas, switching tabs (within the same PulsePlay browser window) keeps the float visible — your "detach Dashboard, navigate to Ask Pulse, Dashboard stays floating" works without spawning a real OS-level window. Deferred to Phase 2 (if ever): true `window.open()` floats (separate browser windows, BroadcastChannel state sync, popup-blocker handling, cross-window auth). The in-app overlay needs to become **duplicative**, not relocational — see §3.6 + §5.4 fixes.

### D6 — Multi-mount safety: per-pane fresh token issuance + conformance test

Every detached pane or 2-pane BI mount gets a fresh embed token from `/assistant/embed-token/powerbi` keyed on `paneId`. Same-vendor different-reports + same-vendor different-tokens is permitted. **Same-vendor, same-report, same-token is prohibited** (Power BI's embed token is single-use; sharing one across two embeds breaks both). A new conformance test "two Power BI panes with separate tokens render concurrently" gates the unified-screen ship. Other vendor adapters (currently GenericIframeAdapter stubs) are multi-mount safe by construction — iframes are isolated contexts.

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

### 3.6 Detach behavior — duplicative, in-app overlay (locked via D5)

```
                  PulsePlay browser window                 In-app overlay (z-index 1200)
┌─────────────── PulsePlay ─────────────────┐
│ [✨][💬][📊]                                │       ┌─── AI Insights ↗ ────┐
│ ┌─────────────┐ ┌─────────────────────┐   │       │ HEADLINE              │
│ │             │ │ HEADLINE            │   │       │ TRENDS                │
│ │ BI canvas   │ │ TRENDS  ← STAYS!    │   │ ←┄┄┤ RISKS                 │
│ │             │ │ RISKS               │   │ sync  │ ACTIONS               │
│ │             │ │ ACTIONS             │   │       │                       │
│ └─────────────┘ └─────────────────────┘   │       │ Composer  ↑           │
└─────────────────────────────────────────────┘       └─── Drag / Resize ────┘
```

**Contract (locked):**
- Detach is **duplicative**: the original pane slot stays full; the overlay is a synchronized clone (NOT a relocation). [This is the OPPOSITE of today's implementation at [App.tsx:1454](../../playground/src/App.tsx#L1454), which hides the original — that's the bug we fix in Step 2.x of the rebuilt plan.]
- The overlay is an **in-app fixed-position div** z-indexed above the tab-changing main canvas. Because it's above the canvas, switching tabs (within the same PulsePlay window) keeps the overlay visible — your "detach Dashboard, navigate to Ask Pulse, Dashboard stays floating" works natively.
- Edits to either (composer text, scroll position, section expanded) propagate via shared React state — they share the same `PulsePlayScreenContext` because they're in the same React tree.
- **Multi-pane detach**: multiple panes can be floating simultaneously. Each detached pane is keyed on `paneId` in a `Map<paneId, DetachedPaneState>` (see §5.4).
- Closing a float restores nothing visually (the slot was never empty). Re-docking is a no-op visually (just closes the float).
- **NOT in v0.1**: true OS-level windows via `window.open()`. Deferred to Phase 2 (if ever) — adds popup-blocker handling, cross-window auth, vendor SDK reissuance per window, BroadcastChannel state sync.

This solves the "feels detached today" complaint (where the original slot empties when you float) without paying the multi-window complexity cost.

---

## 4. Settings model

### 4.1 New keys (added)

| Key | Type | Purpose |
|---|---|---|
| `pulseplay:layout:ai-insights` | `"ai-left" \| "ai-right" \| "ai-top" \| "ai-bottom"` | Layout preset for AI Insights tab |
| `pulseplay:layout:ask-pulse` | same | Layout preset for Ask Pulse tab |
| `pulseplay:layout:dashboard` | `"single" \| "split-h" \| "split-v"` | 1-pane (single) or 2-pane (horizontal/vertical split) on Dashboard |
| `pulseplay:bi-pane-assignment` | `{ paneA: VendorId, paneB: VendorId | null }` | Which BI surface fills each Dashboard pane |
| `pulseplay:detached-panes` | `Record<PaneId, { pos: {x,y}, size: {w,h} }>` | Per-pane float state (position, size). Map keyed on paneId. Persists across reloads. |
| `pulseplay:float-z-order` | `string[]` | Render order of detached overlays (last item = top). Click-to-focus reorders. |
| `pulseplay:pane-toolbar:<paneId>` | `Record<ActionId, boolean>` | Per-pane toolbar action visibility (author override). Defaults to all standard actions on. |
| `pulseplay:bi-token-cache:<paneId>` | string (token) | Power BI embed token issued per-pane via `/assistant/embed-token/powerbi?paneId=<id>&pageId=<id>`. Short-lived; refreshed transparently. Page-specific when same-report-different-page configurations are used. |
| `pulseplay:composer-draft-scope` | `"per-tab" \| "shared"` | Default `"per-tab"`. Author-configurable in Settings → Display → Composer behavior. Controls whether typed-but-unsent composer text persists per-tab or across tabs. |
| `pulseplay:composer-draft:<tabId>` | string | The per-tab composer draft (when scope is "per-tab"). |
| `pulseplay:composer-draft-shared` | string | The shared composer draft (when scope is "shared"). |
| `pulseplay:bi-ai-sync-enabled` | boolean | Default `true`. Author-configurable. When `false`, AI→BI filter pushes (Phase 2) are disabled even if Phase 2 ships — strict read-only BI posture. |

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
  │   ├─ "Detach duplicates" (always on; not user-toggleable v1)
  │   └─ "Persist floats on reload" (default on; restores detached panes after page reload)
  └─ Default landing tab
      └─ [AI Insights / Ask Pulse / Dashboard]
```

---

## 4.5 Unified pane affordance set (NEW — locked from research findings)

The biggest current inconsistency: BIAdapter declares `refresh` + `export` commands but the toolbar never surfaces them; meanwhile AI panes have no equivalent buttons. Per Rajesh's "features applicable to one should reflect for all" directive, every pane MUST expose the same canonical action set.

### 4.5.1 The 10 canonical actions

Every pane (BI, AI Insights briefing, Ask Pulse chat) gets the same toolbar. Actions a pane doesn't support are GREYED, not hidden, so the layout stays consistent.

| # | Action | Semantic | Icon | Keyboard | BI pane | AI pane |
|---|---|---|---|---|---|---|
| 1 | **Maximize / Restore** | Toggle focus mode (full canvas vs split) | ⬜ / ⬛ | `Ctrl+Alt+M` | ✅ | ✅ |
| 2 | **Minimize** | Hide to dock; show MinimizedPaneDock | − | `Ctrl+Alt+−` | ✅ | ✅ |
| 3 | **Refresh** | Reload pane content | 🔄 | `F5` (focus-scoped) | ✅ → `BIAdapter.send({kind:"refresh"})` | ✅ → clear AI history or fire Pulse `reload` action |
| 4 | **Float / Dock** | In-app overlay duplicate (per §3.6) | ⇱ / ⇲ | `Ctrl+Alt+F` | ✅ | ✅ |
| 5 | **Pin (save startup layout)** | Persist current pane focus as startup default | 📌 | — | ✅ | ✅ |
| 6 | **Export** | Download pane content | 📥 | — | ✅ → BI adapter export (PNG/PDF/CSV/JSON per adapter capabilities) | ✅ → conversation export (Markdown/JSON) |
| 7 | **Open in new page** | Spawn full app instance in new tab | ↗ | `Ctrl+Alt+O` | ✅ | ✅ |
| 8 | **Settings** | Deep-link to pane-relevant Settings group | ⚙ | — | ✅ → Settings → BI | ✅ → Settings → AI |
| 9 | **Frame selector** | Pick analysis frame / view | ▾ | — | ✅ → BI page picker (where supported) | ✅ → discovery frame picker |
| 10 | **Overflow ⋯** | Per-pane extras (Show SQL, Show trace, vendor-specific) | ⋯ | — | adapter-defined | pane-defined (Show SQL, Show evidence, etc.) |

### 4.5.2 Tier visibility

- **Tier 1 — always visible in the toolbar header:** Maximize/Restore, Minimize, Refresh, Float, Settings
- **Tier 2 — visible at normal viewport widths, collapsed to overflow at narrow:** Pin, Export, Open in new page, Frame selector
- **Tier 3 — always inside overflow:** Pane-specific extras (Show SQL, vendor-specific actions, etc.)

### 4.5.3 Rename mandates

The audit found 2 confusing labels in the current PaneChrome that get locked-in renames:

- **"Pin layout" → "Save startup layout"** (action #5). The current label suggests "always-on-top" semantics; the actual behavior persists `pulseplay:pinned-viewport-pane`. Renaming removes ambiguity. (Always-on-top floats are a separate future feature; not in v0.1.)
- **"Pop out window" → "Float"** (action #4). The current label implies an OS-level window; v0.1 is an in-app overlay. "Float" is honest about the in-app scope.

### 4.5.4 Implementation contract

- A new `PaneActionId` typed union enumerates the 10 actions.
- `PaneChrome` accepts an `actions: PaneActionId[]` prop; default includes all 10.
- Per-pane action handlers wire through `usePulsePlayScreen()` context (Refresh dispatches to either BIAdapter or AI history clear; Export reads the pane type and routes to the right exporter; etc.).
- Disabled state: an action a pane genuinely can't support (e.g., BIAdapter returns `false` from `supports("refresh")`) renders the icon greyed with a tooltip ("This adapter doesn't support refresh"). NOT hidden — preserves layout consistency.

---

## 4.6 Multi-mount contract (NEW — locked via D6)

Per-vendor rules for concurrent BI mounts (2-pane Dashboard, detached + docked, etc.):

| Scenario | Power BI | Tableau / Qlik / Looker (stubs) | Generic iframe | Native BI |
|---|---|---|---|---|
| Two panes, **different vendors** | ✅ | ✅ | ✅ | ✅ |
| Two panes, **same vendor, different reports, different tokens** | ✅ (per-pane token issuance required) | ✅ | ✅ | ✅ |
| Two panes, **same vendor, same report, different tokens** | ⚠ UNKNOWN — needs live test; conformance test gates ship | ✅ | ✅ | N/A |
| Two panes, **same vendor, same report, same token** | ❌ PROHIBITED — Power BI embed token is single-use; sharing breaks both | N/A (stubs don't use tokens) | ✅ (iframes are isolated) | N/A |

### 4.6.1 Per-pane fresh token issuance

The proxy's existing `/assistant/embed-token/powerbi` endpoint gets a new `paneId` query/body parameter. Each concurrent Power BI mount calls it with a unique `paneId` (auto-generated UUID per pane). The proxy issues a fresh token keyed on `(reportId, paneId)`. Tokens are independent — revoking one doesn't affect the other.

Frontend cache key: `pulseplay:bi-token-cache:<paneId>` (see §4 settings).

### 4.6.2 Configuration UI guards

The BI 2-pane assignment UI (Settings → Display → BI panes) **does not block** any combination — author has free choice (per D3). But it guides the author toward valid configurations:

- ❌ red chip + suggested fix: "Power BI doesn't allow two embeds of the same report PAGE. Pick a different page for one of the panes." Shows a page picker dropdown beside each Power BI pane so author can disambiguate (e.g., Pane A = Report X / "Revenue" page, Pane B = Report X / "Margin" page). Token issuance becomes per-page automatically.
- ⚠ amber chip: "Same vendor, same report — different pages or fresh tokens recommended." (for non-Power-BI vendors where multi-mount-same-report is UNKNOWN and pending conformance test results).
- ✅ no chip otherwise (different vendors, OR different reports, OR Power BI with different pages selected).

### 4.6.3 New conformance test (gates the unified-screen ship)

`bi-adapters/powerbi/__tests__/index.test.ts` gets a new `describe` block "Concurrent mounts (multi-pane safety)":

- **Test A**: Two PowerBIAdapter instances mounting different reports with different tokens render concurrently; both emit `loaded` events; commands route to the right report.
- **Test B**: Two PowerBIAdapter instances mounting the **same** report with **different** tokens — assert one of: (a) both render successfully, OR (b) both render but with documented limitations, OR (c) explicit failure mode with a clear error.

The conformance test result determines the warning vs error chip in the configuration UI (§4.6.2).

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

### 5.4 Detached panes (in-app overlays, multi-pane, per D5)

**Revised from v1** based on the detach/float audit finding that current implementation is relocational + singular, and Rajesh's directive that any pane (incl. BI) must be detachable + persist across tabs.

Detached panes are **in-app overlays** — fixed-position `<div>` elements z-indexed above the main canvas (current `FloatingPanel` at [App.tsx:2102](../../playground/src/App.tsx#L2102)). Each detached pane is rendered via `React.createPortal` into a fixed-position container so it sits above tab-changing content. Multiple panes can be detached simultaneously via `Map<paneId, DetachedPaneState>`.

**Why NOT `window.open()` for v0.1** (per D5):
- Pop-up blocker risk on the first-detach click
- Vendor SDK token reissuance per browser window (every detached Power BI pane needs a NEW token, NEW SDK init)
- BroadcastChannel state sync adds ~200 LOC + serialization schema
- Cross-window auth + cookie handling
- Browser focus management across windows
- DevTools sees only one root at a time
- Closing parent leaves orphaned children
- ~1.5 weeks of engineering vs ~3 days for in-app overlay
- The "persist across tabs" requirement is met by in-app overlays anyway (overlay sits ABOVE the tab-changing canvas)

**State shape:**
```typescript
interface DetachedPaneState {
    paneId: PaneId;              // "ai-insights" | "ask-pulse" | "bi-pane-a" | "bi-pane-b"
    pos: { x: number; y: number };
    size: { w: number; h: number };
    // Pane-specific snapshot — used for restoring scroll position, expanded sections,
    // etc. after page reload. Each pane defines its own serializer.
    snapshot?: Record<string, unknown>;
}

interface PulsePlayScreenContext {
    // …
    detachedPanes: Map<PaneId, DetachedPaneState>;
    floatZOrder: PaneId[]; // last item = top; click-to-focus reorders
    detachPane(paneId: PaneId): void;
    dockPane(paneId: PaneId): void;
    moveDetachedPane(paneId: PaneId, pos: { x: number; y: number }): void;
    resizeDetachedPane(paneId: PaneId, size: { w: number; h: number }): void;
}
```

**Render contract:**
- Original pane slot ALWAYS renders the pane in the main canvas (never hidden because of detach).
- For each entry in `detachedPanes`, a `<DetachedPaneOverlay>` is portal'd into `document.body` with the pane re-rendered inside. **Same React tree → no postMessage bridge needed.** Both renders share the same `PulsePlayScreenContext`.
- Vendor BI adapters: each rendered instance gets its own `paneId` and its own fresh embed token (per §4.6). Two PowerBIAdapter instances (one docked, one detached) coexist by virtue of independent Report objects.
- State persistence: on detach/move/resize, write to `pulseplay:detached-panes` localStorage. On page load, restore floats by replaying the saved Map.

**BI pane detach specifics:**
- BIPanel must accept a `paneId` prop so the detached instance is distinguishable from the docked instance (matters for token cache + DOM mount targets).
- BIAdapter contract gains an optional `paneId` field in the embed config so the proxy's `/assistant/embed-token/powerbi` request carries it.
- The conformance test from §4.6.3 gates whether BI detach ships.

**AI pane detach specifics:**
- UnifiedAssistantSurface is stateless above the composer + history — both can be cleanly rendered twice with shared context.
- The composer's typed-but-unsent text lives in context, so editing in either render syncs to both.
- Per-tab composer drafts (open question §11): for v0.1, defer — single shared draft across docked + detached renders of the same pane. Per-tab drafts is a future cycle.

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

- ~~`window.open()` blocked by browser pop-up blockers~~ — **NOT A RISK in v0.1**, since D5 locked in-app overlays (no `window.open()`). Phase 2 (if ever) re-introduces this risk.
- ~~BroadcastChannel browser support~~ — **NOT NEEDED in v0.1** (same React tree across docked + detached, no cross-window sync). Phase 2 brings this back.
- **BIPanel multiple mounts (Power BI same-report-twice)** — **mitigated by D6 + §4.6.** Per-pane fresh token issuance + ⚠ warning chip + conformance test gate. Acceptable risk profile.
- **Cell catalog audit timing** — **defaulted in §9 above:** empty state with "Switch cell" affordance when a tab requires a missing capability. Lock during Step 10.
- **State persistence in localStorage** — `pulseplay:detached-panes` could grow unbounded if user repeatedly detaches without explicit dock. Mitigate: cap at 4 simultaneous floats; oldest evicted on detach #5. Document.
- **Performance: PulsePlayScreenContext re-render storm** — every BIEvent (filter, page-change, etc.) updates `biSelectionState`, potentially re-rendering every detached pane. Mitigate: throttle `biSelectionState` updates to 250ms; use React's `useMemo` aggressively on context consumers.

### Open questions — ALL RESOLVED 2026-05-25

- **Per-tab composer draft** — **LOCKED:** screen-specific by default (each tab gets its own draft). BUT it's an **author-configurable option**: a setting `pulseplay:composer-draft-scope` accepts `"per-tab"` (default) or `"shared"`. Authors can opt the org into shared drafts if their use case wants context to carry across tabs. Surfaced in Settings → Display → "Composer behavior".
- **Cell catalog audit timing** — **LOCKED:** notify the user in plain English when a tab requires a capability the active cell lacks. Render a friendly notice ("This combination doesn't include the structured-briefing capability — switch cells in Settings → AI, or continue with conversational chat only") with a Settings deep-link. NEVER silently fail at request time. NEVER hide the tab (hiding makes users wonder where it went).
- **2-pane same-report-twice for Power BI** — **LOCKED:** Power BI rejects two embeds of the same report-page. The UI guides authors to use **page-specific embed URLs** — when same-report is detected, the assignment UI surfaces "Pick a different page" with a page picker (e.g., Pane A = Report X / Page 1, Pane B = Report X / Page 2). The proxy `/assistant/embed-token/powerbi` accepts `pageId` so per-page tokens can be issued. Same-page-twice is still prohibited.
- **Detached pane URL** — **LOCKED:** detach is ALWAYS an in-app overlay (no separate browser window). Floating panes have no URL. Users who want a separate URL use the **"Open in new page"** action (action #7 from §4.5.1) which spawns a full new tab with its own URL — that path IS bookmarkable, and unlike floats does NOT sync state with the parent. Two distinct actions, two distinct semantics.
- **Phase 2 AI→BI sync primitives** — **LOCKED for MVP:** filters only. Highlights, page navigation, drill, selection, and other primitives stay in Phase 2 backlog for per-vendor cycles. Filters are universal across BIAdapters (every adapter implements `applyFilter`). **Author-configurable**: a setting `pulseplay:bi-ai-sync-enabled` (default ON) lets the author disable AI→BI filter pushes per org if they want a strict read-only BI posture. Mirrors the "optional" directive — authors choose, viewers consume.
- **"Compare mode" pill on Dashboard tab** that auto-syncs cross-pane filters (Pane A filter → Pane B filter) — nice but not in MVP. Defer to Phase 2.

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

## 10.5 Polish defaults (defaulted; revisit during the step they affect)

Six polish items came up in the design brainstorm. None block sign-off; each has a defaulted answer locked here so Steps 2-13 can implement against a known target. If any default turns out wrong in practice, we revise in-step rather than re-opening the foundation.

### 10.5.1 Tab activity indicators

When a tab's content updates while the user is on a different tab (e.g., a sectioned briefing finishes generating on AI Insights while user is reading Dashboard), the tab pill shows a small unread-dot indicator (●). Click-to-clear semantics.

- **Visual:** 6px filled circle in the tab pill's accent color, top-right corner.
- **State key:** `pulseplay:tab-unread-flags` → `Record<TabId, boolean>`.
- **Cleared:** on tab activation OR on explicit "mark all read" action in the overflow menu.
- **Lands in:** Step 3 (tab strip).

### 10.5.2 Drag-to-detach

For v0.1, panes detach via the toolbar Float button ONLY. Drag-to-detach (grab the pane header, drag outside the tab body) is deferred to Phase 2. Reason: drag detection adds significant complexity (drop zones, ghost preview, drag-start threshold) and the toolbar Float button is sufficiently discoverable when paired with the tooltip + keyboard shortcut.

- **Lands in:** Phase 2 polish cycle.
- **Phase 2 trigger:** if user feedback says "I keep dragging the header expecting it to float," we revisit.

### 10.5.3 Mobile collapse

The 3 tabs stay visible always (mobile + desktop). Dashboard 2-pane mode always stacks vertically on mobile (no horizontal split below 768px width — vertical split looks like one BI canvas atop the other). AI Insights and Ask Pulse tabs collapse their split layout to vertical (AI on top, BI below) below 768px regardless of the author's per-tab layout setting.

- **Breakpoint:** 768px wide.
- **Storage:** no new keys; runtime decision.
- **Lands in:** Step 3.5 (per-tab layout settings) — the resolver respects breakpoint overrides.

### 10.5.4 Tab-switch animation

Content swap uses a **150ms cross-fade**. Cheap, feels native, doesn't compete with the briefing/chat content for attention. Honors `prefers-reduced-motion` — when set, the swap is instant.

- **Implementation:** CSS opacity transition on the `<TabBody>` content layer; key the layer on `activeTab` so React re-mounts.
- **Lands in:** Step 3 (tab strip).

### 10.5.5 Empty state when no AI profile configured

The unified screen shows a **notice strip** (full-width banner at top of the canvas) when no AI profile is configured. The 3 tabs all stay visible:

- **AI Insights tab + Ask Pulse tab:** main canvas shows a focused empty state — "Connect an AI assistant to start. Settings → AI →  Connector catalogue" with a single deep-link button. NO briefing / chat content area.
- **Dashboard tab:** works fully — BI doesn't require AI. The notice strip stays visible reminding the user that AI tabs are inactive.

This is better than today's full-screen hijack (which makes Dashboard unreachable until AI is configured).

- **Lands in:** Step 2 (PulsePlayScreen wrapper) — the empty-state logic is a peer of the tab body.

### 10.5.6 Keyboard shortcuts to switch tabs

- `Ctrl+1` → AI Insights tab
- `Ctrl+2` → Ask Pulse tab
- `Ctrl+3` → Dashboard tab
- `Ctrl+Tab` → cycle next tab
- `Ctrl+Shift+Tab` → cycle previous tab

Plus the existing toolbar keyboard shortcuts (per §4.5.1: Ctrl+Alt+M for Maximize, etc.).

- **Implementation:** `window.addEventListener("keydown", …)` in PulsePlayScreen; respects standard "don't fire while user is in an input field" pattern.
- **Lands in:** Step 3 (tab strip).

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
