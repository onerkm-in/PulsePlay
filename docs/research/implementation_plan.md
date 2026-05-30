# PulsePlay: Dual-User UX/UI Simplification & Premium Aesthetic Elevation

This document serves as the **Master Design Handoff & Implementation Plan** to be executed by **Claude**. It provides a comprehensive, expert-level design assessment of PulsePlay and details a step-by-step layout, interaction, and visual choreography plan. 

The goal is to turn PulsePlay into a **"sweetheart" application** that viewers adore, while packaging its high-power features into a **simple, progressive cockpit** that super users (authors) can easily navigate without losing focus.

---

## 1. Executive Design Critique & User Persona Mapping

PulsePlay’s core architecture is incredibly strong: it successfully orchestrates a vendor-agnostic BI panel (Y-axis) with a connector-agnostic AI sidebar (X-axis). However, the current interface presents high-power features in a fragmented, chrome-heavy layout. 

To achieve visual excellence and drive massive engagement, we partition the app's interfaces into two distinct, high-fidelity journeys:

### User Persona 1: The End User (Viewer / Business Analyst)
* **Goal**: View their dashboard, consume the AI briefing, ask follow-up questions, and copy key insights with absolute ease.
* **UX Needs**: High visual focus, "eye-candy" aesthetics, clean micro-animations, logical storytelling, zero form-clutter, and high trust signals.
* **The "Sugar Candy" Concept**: Visually magnetic, executive-grade business briefings that load progressively, stagger beautifully, hover with soft-depth scaling, and keep key metrics clean.

### User Persona 2: The Super User (Author / Admin)
* **Goal**: Connect BI sources, test AI profiles, bind business contexts, review governance, and monitor system health.
* **UX Needs**: "Super reach" without complexity. Instead of a monolithic settings wall, they need a progressive, task-list-driven Setup Console that discloses details only when needed.
* **The Command Center Concept**: A persistent global context bar showing active parameters and a super-powered `Ctrl/Cmd+K` Typeahead Command Palette to navigate, configure, ask, and diagnose instantly.

---

## 2. User Review Required & Strategic Alignment

Before Claude begins code modifications, the following high-priority architectural and visual alignments are confirmed:

> [!IMPORTANT]  
> **1. Smart 2-Parent Architecture**  
> We drop the strict 3-parent picker setup. The primary nav is simplified to **Surface + Assistant**. The *Business Context* is derived directly from Surface metadata (e.g., Genie space description, Power BI workspace path, semantic-model business glossary) and presented as an editable context chip in the header. Only in ambiguous/iframe scenarios does it act as an explicit override picker.
>
> **2. Identity-Optional with Nudge-on-Save**  
> First-time use is fully anonymous and fully functional. Sign-in prompts only trigger at risk-of-loss moments (saving a context profile, exporting a handoff bundle, publishing a config). Work is preserved in `pulseplay:anon:` localStorage namespace and seamlessly merged on login.
>
> **3. Restrained "One Accent" Visual Policy**  
> Avoid giant gradient cards or colorful backgrounds. Accent colors are reserved for primary action points (Surface Switcher active state, Ask button shimmer, and the "Verified" status badge). All canvas containers are neutral, high-contrast, and dense.

---

## 3. Visual System, Motion & Depth Grammar (The Spec)

Every component modified or created by Claude must strictly adhere to this visual spec. Ad-hoc utility colors or bouncy springs are forbidden.

### A. The "Sugar Candy" Motion Grammar
All animations must be buttery-smooth and respect user preference via `@media (prefers-reduced-motion: reduce)`.

| Interaction | Visual Behavior | Duration | Easing (cubic-bezier) |
|---|---|---|---|
| **Briefing Section Card Arrival** | Opacity `0 -> 1`, TranslateY `8px -> 0px` | 280ms | `cubic-bezier(0.16, 1, 0.3, 1)` (Ease-Out Quint) |
| **Section Stagger Offset** | Delay of `60ms` per card index | — | Choreographed waterfall effect |
| **Surface Switcher Tab Active** | Press scales to `0.97`, snaps back to `1.0` | 180ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` (Back Ease-Out) |
| **KPI Metric Tile Hover** | TranslateY `-2px` with shadow expansion | 180ms | `ease-out` |
| **Status Badge First Render** | Scale `0.94 -> 1.0` | 220ms | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` |
| **Follow-up Chip Hover** | Soft background transition + 1px elevation lift | 160ms | `ease-out` |

### B. Soft Depth Grammar
Shadows must feel natural and high-end, utilizing multi-layered low-opacity variables.

* **Section Cards (Resting)**: `box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(15,23,42,0.03);`
* **Section Cards (Hover)**: `box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 12px 28px rgba(15,23,42,0.06);`
* **KPI Metric Tiles (Hover)**: `box-shadow: 0 4px 14px rgba(15,23,42,0.06); transform: translateY(-1px);`
* **Surface Switcher Active Tab**: `background: linear-gradient(135deg, #1e6fd4, #1256a8); box-shadow: 0 4px 12px rgba(30,111,212,0.25);`

### C. Color Grammar & Status Badges
Semantic colors are prioritized over decorative gradients. Only one focal accent point is allowed per screen.

* **Primary Accent Color**: `#1a6fd4` (Light Mode) / `#3b82f6` (Dark Mode).
* **"Verified" Attestation Badge**: `#15803d` (Emerald Green) - represents a validated insight.
* **"Grounded Draft" Badge**: `#b45309` (Warm Amber) - indicates AI generation without final confirmation.
* **"Blocked / Caution" Badge**: `#c1392b` (Deep Crimson) - alerts user to a governance policy block.
* **Neutral Surface**: Light gray `#f8fafc` or pure white container frames with `#e2e8f0` thin borders.

---

## 4. The Global Shell & Journey Choreography

The application will be restructured by Claude into a cohesive **AppShell** with L0, L1, and L2 navigation pathways.

```
+-----------------------------------------------------------------------------------+
|  [P] PulsePlay   [ 🔍 Ask, search, or run... ]        BI: Power BI  AI: Genie  CPG |  L0 Global Header
+-----------------------------------------------------------------------------------+
|  [=] Experience  |  Context Bar: Sales Dashboard · Freshness 2m · Grounded ✓      |  L1 Context Header
+------------------+----------------------------------------------------------------+
|                  |                                                                |
|  Experience      |                      MAIN ACTIVE VIEWPORT                      |  L2 Main Workspace
|  Authoring Setup |                                                                |
|  Grounding Packs |                                                                |
|  System Logs     |                                                                |
|                  |                                                                |
+------------------+----------------------------------------------------------------+
```

### L0 Global Header Elements
1. **Logo & Brand Signature**: Minimalist typography, high contrast, clean icon alignment.
2. **Global Command Input**: Centered, button-styled search box reading `"Ask, search, or run a command... (Ctrl+K)"` with keycap triggers.
3. **Derived Context Chips**: Small, elegant pills reflecting active setup parameters: `[BI: PowerBI]` `[AI: Genie]` `[Pack: CPG]`.

### L1 Context & Quality Bar
Placed directly beneath the global header, presenting immediate trust details to the user:
* **Current Workspace**: Display label (e.g., "Sample Superstore Operations").
* **Freshness Indicator**: Timestamp showing "Updated 2m ago" or "Live".
* **Quality & Governance Status**: Green Check `[Reviewed]`, Yellow Sparkle `[AI-Generated]`, or Red Warning `[Blocked]`.
* **Mobile Behaviour**: Show only `Context · Freshness` by default, with a collapsible chevron to slide open `Surface`, `Assistant`, and `Quality`.

---

## 5. Proposed Changes (Modular Structure for Claude)

Below is the directory architecture of new files to create and existing files to adapt. This provides Claude with clear file references and clean code boundaries.

### A. App Shell & Global Layout System

---

#### [NEW] [AppShell.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/appShell/AppShell.tsx)
Builds the primary navigation layout, wrapping all routes. Hosts the sidebar rail, global header, context bar, and mobile responsive drawer.
* Integrates `MobileNavDrawer.tsx` (opens from left edge on viewports `< 640px` with safe-swipe dismissal).
* Includes a responsive `ContextBar.tsx` that collapses gracefully on mobile (`Context · Freshness` visible, rest tap-to-expand).

#### [NEW] [tokens.css](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/design-system/tokens.css)
Declares unified `--pp-*` (PulsePlay shell) and `--gn-*` (Pulse-ported AI pane) CSS tokens.
* Maps a semantic structure: `--pp-bg`, `--pp-surface`, `--pp-border`, `--pp-accent`, `--pp-accent-hover`, `--pp-text-primary`, `--pp-text-muted`.
* Handles `@media (prefers-color-scheme: dark)` and explicit `data-color-mode="dark"` to support proper, flawless dark mode.

#### [MODIFY] [App.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/App.tsx)
* Wraps the route router inside the new `AppShell` component.
* Excludes `META_KEYS` from dirty-checking to prevent phantom "Unsaved changes" triggers on first-launch routing.
* Imports and initializes the global Command Palette keyboard listener.

---

### B. The Viewer Experience Surface

---

#### [MODIFY] [visual.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/pulse/visual.tsx)
Elevates the Ask Pulse and AI Insights answer card designs.
* Renders all incoming rich text via a sanitized Markdown engine (`renderMarkdown.tsx`), replacing plain `pre-wrap` formats.
* Implements a **staggered animation container** for narrative sections. Each card slides up progressively with a 60ms delay index.
* Replaces inline style blocks with static CSS classes (`.pp-ai-briefing-card`, `.pp-kpi-tile-grid`, etc.).
* Standardizes the `TrustFooter.tsx` layout at the bottom of every message block, rendering a structured `AnswerContextSummary` (Freshness, Source Label, Governance Attestation, Request ID).

#### [NEW] [TrustFooter.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/trust/TrustFooter.tsx)
Reusable trust component for all answer outputs.
* Renders the data source origin (e.g., "Genie Space Sales Data"), active filters applied, and the governance attestation badge.
* Includes a subtle digital wellbeing/token usage chip (`TokenSessionEfficiencyChip`) showing actual session token costs rather than heavy greenhouse metrics.
* Contains a small `⎘ Copy SQL` and `⋮` actions overflow button to clean toolbar noise.

---

### C. The Authoring Console

---

#### [NEW] [AuthoringShell.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/authoring/AuthoringShell.tsx)
Converts settings page into a progressive dashboard for super users.
* Integrates a clean Setup Home with a 5-gate **Readiness Task List**:
  1. **BI Surface** (Mode select: Native Canvas vs. Quick Iframe vs. Governed SDK)
  2. **AI Assistant** (Active Profile pick + Reachability Probe)
  3. **Knowledge Pack** (Grounding glossary + Custom pack bind)
  4. **Governance Rules** (Attestation gates + Allowlist check)
  5. **Smoke & Publish** (E2E diagnostic validation + Handoff generation)

#### [NEW] [authoringStateSnapshot.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/authoring/authoringStateSnapshot.ts)
A single state provider that returns active setup values.
* Centralizes checking logic. If a setup step lacks critical data (e.g., empty allowlist, invalid embed token), it returns `status: "blocked"` with an explicit recovery owner.
* Feeds both the `SetupTaskList` and the global `CommandPalette` with live configuration metrics.

#### [NEW] [inferBusinessContext.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/authoring/inferBusinessContext.ts)
Logic module that inspects active BI Surface metadata to auto-populate the active business context profile.
* E.g., reading a Databricks catalog descriptor or Power BI report tag and matching it to CPG/FMCG, Retail, or SaaS pack glossaries automatically.
* Falls back to `Choose Business Context` prompt on ambiguous or iframe surfaces.

---

### D. The Global Command Palette (Ctrl+K Surface)

---

#### [NEW] [CommandPalette.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/commands/CommandPalette.tsx)
A full modal-dialog overlay triggered via `Ctrl/Cmd + K` or `/` keys.
* Follows strict WAI-ARIA APG patterns (`role="dialog"`, `role="combobox"`, `aria-autocomplete="list"`, `aria-activedescendant`).
* Retains focus in the input while navigating options via `ArrowUp` / `ArrowDown` and executes on `Enter`.
* Restores keyboard focus back to the page trigger upon dismissal.

#### [NEW] [commandRegistry.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/commands/commandRegistry.ts)
Registers static, state-driven, and diagnostic commands.
* **Navigate Group**: `"Go to experience"`, `"Open setup"`, `"Browse knowledge packs"`.
* **Configure Group**: `"Change BI surface"`, `"Connect Genie"`, `"Edit embed configuration"`.
* **Ask Group**: `"Summarize operations"`, `"Run risk scan"`, `"Analyze key drivers"`.
* **Action Group**: `"Refresh dashboard"`, `"Copy diagnostics"`, `"Export support bundle"`.
* **Recovery Group**: `"Why is embed blocked?"`, `"Restart proxy"`, `"Test allowlist"`.

#### [NEW] [commandRanking.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/commands/commandRanking.ts)
Deterministic query matcher and sorter.
* Slices terms to match shortcuts, aliases (e.g. `"pbi"` matches `"Power BI"`), and fuzzy inputs.
* Dynamically boosts recovery commands when system states report errors, and boosts context-specific prompt suggestions based on the active viewport.

---

## 6. Visual Design Specifications & Wireframes (Viewer Journey)

Claude should build the **Viewer Experience** with the following visual layout.

### Section Card Arrival (CSS Transitions)
```css
.pp-ai-briefing-card {
  opacity: 0;
  transform: translateY(8px);
  animation: ppSlideUpStagger 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: box-shadow 180ms ease-out, transform 180ms ease-out;
}

@keyframes ppSlideUpStagger {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pp-ai-briefing-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 12px 28px rgba(15,23,42,0.06);
}
```

### Trust Footer & KPI Snapshots
```css
.pp-trust-footer {
  border-top: 1px solid var(--pp-border);
  padding: 12px 16px;
  background: var(--pp-surface-muted);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--pp-text-muted);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}

.pp-trust-attestation {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(21, 128, 61, 0.08);
  color: var(--pp-success);
}
```

---

## 7. Verification & Handoff Plan for Claude

To guarantee that Claude implements this flawless design without introducing regressions, the following verification gates are set:

### Phase 1: Linting & Type Consistency
Claude must run:
```powershell
cd D:\Working_Folder\Projects\PulsePlay\playground
npm run lint
```
* No `any` declarations in the new routing or command models.
* Full unit coverage on `inferBusinessContext` and `commandRanking` via Vitest.

### Phase 2: Headless DOM & Layout Check
Claude must verify the mobile drawer responsive footprint:
* Test layouts at `390px` (mobile viewport) and `1440px` (desktop viewport).
* Verify zero horizontal page scrolling.
* Assert that key interactive focus elements are not occluded by the Save bar or the DevTools beach icon.

### Phase 3: Headed Smoke Test
Claude will run the automated headed UI smoke script to assert:
* The native canvas paints perfectly with G3 attested envelopes.
* All `data-result-id` bindings across sidebar metrics, canvas charts, and the new `TrustFooter` are byte-identical.
* Keyboard navigation drives `CommandPalette` seamlessly.

---

### Ready for Execution
This Plan establishes the layout guidelines, CSS structures, and behavioral goals. Claude can now consume this file and implement the visual logic precisely, raising the PulsePlay platform to state-of-the-art visual excellence.
