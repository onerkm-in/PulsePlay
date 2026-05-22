# PulsePlay — Floating Companion Windows

> **Status: Roadmap — not yet started.**
> Owner lane: Track 4 (Experience). No implementation is in the codebase today.
> Locked 2026-05-18 by Rajesh.

## Goal

Keep the default unified screen clean while letting users temporarily view any PulsePlay surface **on top of** any other surface — without leaving their primary context, without opening a browser popup, and without reverting to the permanent split layout as the default.

The key word is **contextual**: a companion appears when the user actively requests it, stays out of the way otherwise, and disappears just as easily.

---

## Use cases

| Primary surface | Companion surface | Why |
|---|---|---|
| AI Insights | BI Viz / dashboard | User wants to cross-check a metric card against the live chart without leaving the briefing |
| BI Viz | Ask Pulse | User wants to query the data while keeping the dashboard visible |
| Ask Pulse | AI Insights | User wants the briefing summary beside an active conversation |
| Evidence / SQL / Artifact detail | BI Viz | User wants to verify a SQL result against what the dashboard shows |

---

## Interaction model

### Primary trigger: surface tab context menu

Right-clicking (or long-pressing on touch) a surface tab opens a context menu with four options:

```
┌─────────────────────────────────┐
│  Open as floating companion     │  ← default companion mode
│  Open in side panel             │  ← docked half-panel (like Split + Mix but transient)
│  Open in new tab                │  ← browser tab (existing "Open page" behaviour)
│  Pin companion                  │  ← promoted: companion persists across surface switches
└─────────────────────────────────┘
```

### Keyboard / accessibility equivalent

Right-click **must not be the only path**. Every surface tab also exposes an icon button (⊟ or ⧉ — "companion") that opens the same context menu. This button is:
- Always focusable via Tab
- Announces its action in `aria-label="Open [Surface name] as companion"`
- Opens the menu on Enter / Space; Escape closes it
- The context menu items are standard `role="menuitem"` elements

### Additional trigger: pane-action overflow (⋮)

The existing `⋮` overflow popover on the AI Insights toolbar gets a new item:
```
Open as floating companion
```
This mirrors the tab context menu for surfaces that don't have a visible tab in the current layout mode.

---

## Companion behavior

### Position and sizing

- Default spawn position: right edge of the viewport, vertically centered (same as the current in-app float panel, `5b10ff4`)
- Default size: 480 × 80vh (matches the existing `FloatingPanel` component)
- Per-surface last-used size/position persisted in `localStorage` key `pulseplay:companion-pos:<surfaceId>`
- On first open for a given surface: use the default position, not a random one

### Dragging

Mouse drag on the companion's title bar repositions it. Uses the same `dragAnchor` pattern already in `FloatingPanel` (`App.tsx`, commit `5b10ff4`). Touch drag supported.

### Snapping

When the user drags near a viewport edge (threshold: 24px), the companion snaps to that edge:

| Snap target | Resulting position |
|---|---|
| Left edge | `left: 0; top: 0; width: 360px; height: 100vh` |
| Right edge | `right: 0; top: 0; width: 360px; height: 100vh` |
| Top edge | `left: 0; top: 0; width: 100vw; height: 44vh` |
| Bottom edge | `left: 0; bottom: 0; width: 100vw; height: 44vh` |

Snap preview is shown as a highlight on the edge while dragging (CSS overlay, not DOM mutation). Snapping is cancelled if the user releases away from the edge.

### Resizing

CSS `resize: both` on the companion container, same as the existing float panel. Minimum dimensions: 280 × 160px.

### Collapsing

The companion title bar has a **collapse** toggle (▲/▼ chevron). Collapsed state shows only the 34px title bar — content is hidden (`visibility: hidden; height: 0`), preserving mount state so no re-fetch is needed on expand. Collapsed position and surface are persisted in `localStorage`.

### Dismissing

- "×" button in the title bar: dismisses the companion, removes `localStorage` position key for that surface.
- Pressing Escape while focus is inside the companion: dismisses it and returns focus to the primary surface.
- `aria-label="Close [Surface name] companion"` on the × button.

### Pinning

"Pin companion" promotes the companion to survive surface switches in the primary area. A pinned companion:
- Shows a pushpin icon (📌 / ⊕) in its title bar, togglable
- Persists when the primary surface switches (e.g. primary goes from AI Insights → Ask Pulse; the BI Viz companion stays)
- An unpinned companion closes automatically when the primary surface changes

### One companion at a time (Phase 1)

Only one companion is open at a time by default. Opening a second one replaces the first (with an animation: first slides out, second slides in). "Allow multiple companions" is a Phase 2 option, gated behind a Settings toggle.

---

## Surface sources

These surfaces can be opened as companions (Phase 1):

| Surface | `surfaceId` | Notes |
|---|---|---|
| AI Insights | `ai-insights` | Renders the Pulse briefing read-only (no Refresh in companion mode — companion reflects the last briefing result) |
| Ask Pulse | `ask-pulse` | Full conversation input; messages sync with the primary Ask Pulse state if primary is also open |
| BI Viz | `bi-viz` | Renders the active BI adapter iframe; iframe sandboxing rules unchanged |
| Evidence / SQL / Artifact detail | `evidence` | Phase 2 — promoted when the evidence panel ships as a first-class surface |

### BI Viz companion — iframe sandboxing note

The BI Viz companion renders the same `BIPanel` component as the primary pane. The `BIAdapter.mount()` contract handles sandboxing via the adapter's own `sandboxAttr`. The companion does **not** relax the sandbox — it passes the same `sandboxAttr` as the primary mount. If the adapter requires `allow-same-origin`, the companion gets it; if not, not. No special case for companion mode in the adapter contract.

The companion BI Viz is a second `BIPanel` instance mounted with the same `embedConfig`. This means two adapter instances are live simultaneously. Adapters must tolerate this — `BIAdapter.mount()` is called twice for the same config. Power BI's `powerbi-client` supports multiple embeds per page; iframe adapters trivially support it. This is a **new requirement** to document in `BIAdapter.ts`.

---

## State model

```ts
interface CompanionState {
    surfaceId: CompanionSurfaceId;     // which surface is in the companion
    pos: { x: number; y: number };
    size: { w: number; h: number };
    snapEdge: "left" | "right" | "top" | "bottom" | null;
    collapsed: boolean;
    pinned: boolean;
}
```

`companionState: CompanionState | null` lives in App-level React state. `null` = no companion open.

Persistence: on every position/size change, write `companionState` (minus `surfaceId`) to `localStorage` under `pulseplay:companion-pos:<surfaceId>` so the next open of that surface restores to last position.

---

## Implementation plan

### Phase 1 — core companion (single, draggable, dismissible, snappable)

1. **`CompanionPanel` component** (extends `FloatingPanel`, commit `5b10ff4`) — adds snap detection, collapse toggle, pin button, `aria-label` contract.
2. **Surface tab context menu** — `<CompanionMenu>` component: right-click handler + fallback icon button + `role="menu"` accessibility tree.
3. **App state**: add `companionState: CompanionState | null` and `openCompanion(surfaceId)` / `closeCompanion()` / `pinCompanion()` handlers.
4. **Surface renderer inside companion**: conditional render per `surfaceId`:
   - `ai-insights`: `<PulseShell>` in read-only mode (suppress Refresh button in companion)
   - `ask-pulse`: `<PulseShell>` on Chat tab
   - `bi-viz`: `<BIPanel>` (second adapter instance)
5. **⋮ overflow item**: add "Open as floating companion" to the existing Pulse `gn-insights-overflow-pop`.
6. **localStorage persistence** per surface.
7. **Tests**: companion opens/closes; pin survives surface switch; snap positions; collapse preserves mount; Escape dismisses; keyboard path for context menu.

### Phase 2 — multiple companions + "Open in side panel"

1. **Multiple companions**: `companionState: CompanionState[]` (array). Settings toggle: "Allow multiple companions". Z-index stack managed by last-focused.
2. **"Open in side panel"**: transient half-panel alongside the primary — like Split + Mix but initiated ad-hoc and dismissed when done. Uses a `transientSidePanel` state separate from `companionState`.
3. **Evidence / SQL / Artifact detail** as a companion surface source.

### Phase 3 — enhanced snap + cross-surface sync

1. **Snap to other companions**: when multiple companions are open, they snap to each other's edges (magnetic grid).
2. **Ask Pulse sync**: when both primary and companion show Ask Pulse, messages are shared (one conversation, two views).

---

## Tripwires

1. **Do not bring back permanent BI split as default.** The companion is optional and contextual. The default layout is `mix` (unified). Companions disappear when dismissed and do not persist across page reloads unless pinned. The permanent Split + Mix layout (`enabledComponents = "both"`) remains a separate, explicit user preference.

2. **Floating companion is opt-in.** No companion appears without an explicit user action (right-click context menu, icon button, or ⋮ menu item). Never auto-open companions based on detected state.

3. **Keep Split + Mix for persistent power-user layout.** Split + Mix (`enabledComponents = "both"`) is the right answer for users who always want two surfaces side by side. Companions are for transient cross-referencing. Do not deprecate Split + Mix to push users toward companions.

4. **Keep browser pop-out separate from in-app floating companion.** "Open in new tab" (existing `open-page` action) remains available and distinct from "Open as floating companion". They are different use cases: browser pop-out = monitor on a second screen; companion = quick side-reference in the same window.

5. **Must be keyboard accessible.** Every companion action must be reachable without a mouse. The icon button on the surface tab, the ⋮ overflow, and the context menu are all fully keyboard-navigable. The companion panel itself is a `role="dialog"` with a focus trap activated on open and released on close.

6. **Must not hide critical alerts or status.** Companions render at `z-index: 1200` (same as the current float panel). Governance allowlist banners, fail-closed alerts, and error toasts render at `z-index: 1300` — always above companions. Never lower an alert's z-index to accommodate companion stacking.

7. **Must not break iframe sandboxing or BI adapter boundaries.** The BI Viz companion mounts `BIPanel` with the same `sandboxAttr` as the primary embed. No sandbox relaxation in companion mode. The companion does not add `allow-popups-to-escape-sandbox` or `allow-top-navigation`. Two adapter instances for the same config is explicitly permitted but must be documented in `BIAdapter.ts` as a supported scenario.

8. **State reset on dock/float matches current `FloatingPanel` behavior.** When a companion is closed and re-opened, the surface content remounts (same cost as minimize + restore). This is acceptable and should be documented — do not attempt to portal or preserve DOM across open/close to avoid this cost.

---

## Relationship to existing features

| Feature | Relationship |
|---|---|
| `FloatingPanel` component (`App.tsx`, `5b10ff4`) | `CompanionPanel` extends or wraps this. The existing float button on the AI pane header becomes "Open AI Insights as companion" in the new model — same UX, same component, cleaner framing. |
| Split + Mix (`enabledComponents = "both"`) | Orthogonal. Split + Mix is a permanent layout; companions are transient overlays. Both can coexist. |
| `open-page` / `window.open` | Unchanged. "Open in new tab" in the context menu maps to the existing `handleViewportOpenPage` handler. |
| Theme Studio (THEME_STUDIO.md) | Companions inherit the active theme via CSS custom properties — no extra theming work needed. |
| Trust / Evidence panel (Track 5) | When evidence ships as a first-class surface, it becomes a companion source (Phase 2). |
