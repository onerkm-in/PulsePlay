# Master Design Handoff & Technical Briefing for Claude

* **Status:** Master Design Assessment & Consolidated Handoff. Ready for developer execution.
* **Target Developer Agent:** Claude
* **Purpose:** This document consolidates all visual critique, dual-user journey blueprints, sibling project comparisons (`DwD_AI_Assistant_for_PBI`), and integration pathways into a single, cohesive developer specification. Claude must consume this file to implement, validate, and deploy the next generation of the PulsePlay platform.

---

## Part 1: Executive Design Critique & Dual-User Journeys

PulsePlay orchestrates a vendor-agnostic BI panel (Y-axis) with a connector-agnostic AI sidebar (X-axis). However, the current visual implementation presents these high-power features in a fragmented, form-heavy layout. We must split the user experience into two distinct, high-fidelity journeys:

### 1. The Viewer (End-User) Journey: The "Sugar Candy" Cockpit
* **Goal:** A gorgeous, intuitive, and frictionless space where viewers consume briefings, inspect dashboards, and chat with AI in business language.
* **UX Strategy:** High visual focus, "eye-candy" aesthetics, clean micro-animations, zero form clutter, and high trust signals.
* **Key Surface:** A single unified "Ask" view combining the BI dashboard (or native governed canvas) on the left/main viewport, and the choreographed AI Briefing + Chat on the right sidebar.

### 2. The Author (Super-User) Journey: Progressive Setup
* **Goal:** Configure BI sources, test AI profiles, bind packs, and review governance rules in a simple progressive workflow.
* **UX Strategy:** Replace monolithic settings sheets with a progressive **Readiness Task List** (Setup Home) showing status, impact, and next action for five distinct gates (BI, AI, Knowledge, Governance, Smoke & Handoff).
* **Key Surface:** An Authoring Console that leverages a persistent Global Context Bar and a global `Ctrl/Cmd+K` Command Palette to enable quick actions, navigation, and diagnostics.

---

## Part 2: Sibling Project Comparison & "Trapped" Research Parity

A comparative audit against `DwD_AI_Assistant_for_PBI` reveals that the legacy visual had completed extensive research on **strategic templates, metric direction rules, and parameter sanitization** that are currently "trapped" in the legacy compatibility layer (`playground/src/pulse/`) instead of being surfaced as first-class, highly engaging features of the modern conversational chat (`Ask Pulse`).

### The Trapped Preset Inventory
Located in [insightsPresetLibrary.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/pulse/insightsPresetLibrary.ts), this library includes:
* **Metric Direction Presets:** Rules defining color-coded thresholds (e.g. Retail, Supply Chain, and Healthcare hospital operations).
* **Custom Section Presets (14):** Sales Performance, Customer Health, Operations Supply Chain, Hospital Operations, HR Workforce, Finance Budget, SWOT Analysis, BCG Growth-Share, RFM Customer Segmentation, Pareto 80/20, Variance Bridge, and Anomaly Detection.

### The Surfacing Plan
Claude must natively integrate these strategic presets directly into the modern conversational chat (`Ask Pulse` / `AISidebar.tsx`) using the following patterns:
1. **Slash Commands (`/swot`, `/bcg`, `/rfm`, `/pareto`, `/variance`)** in the Ask Pulse composer to inject structured visual templates dynamically.
2. **An Interactive Parameter Drawer** next to the chat input, enabling users to adjust preset thresholds (e.g. `materialityThreshold = $5000` or `zScoreThreshold = 2.0`) dynamically in-chat.
3. **Grounded Suggestion Chips** triggered automatically when the dashboard's active domain (e.g. Retail Performance) is resolved.

---

## Part 3: Step-by-Step Code Modification Plan for Claude

Claude must execute the following localized modifications across the codebase:

### 1. App Shell & Navigation Structure
* **Create** [AppShell.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/appShell/AppShell.tsx):
  * Builds the master layout wrapping all routes.
  * Embeds the vertical navigation rail and the global header.
  * Integrates a responsive `ContextBar.tsx` showing active parameters (`Surface | Assistant | Context | Quality | Freshness`) at desktop, and collapses to `Context · Freshness` (with expand chevron) on viewports `< 640px`.
  * Integrates a left-side `MobileNavDrawer.tsx` with safe-swipe dismissal.
* **Modify** [App.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/App.tsx):
  * Mount the main router inside the new `AppShell`.
  * Prevent phantom "Unsaved changes" save-bar triggers by excluding state keys (`pulseplay:settings-last-group` and `pulseplay:wizard-dismissed`) from dirty-checking.
* **Create** [tokens.css](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/design-system/tokens.css):
  * Declare cohesive semantic `--pp-*` and `--gn-*` visual variables for light and dark modes, honoring OS preference.

### 2. Conversational Chat & Prompt Interception
* **Modify** [visualHelpers.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/pulse/visualHelpers.ts):
  * Update `buildGenieRequest` to parse slash commands:
    ```typescript
    const swotMatch = question.match(/^\/swot\b/i);
    if (swotMatch) {
      const swotPreset = CUSTOM_SECTION_PRESETS.find(p => p.id === "swot-analysis");
      const compiled = interpolatePreset(swotPreset, activeDrawerParams);
      const formatBlock = compiled.map(s => `RESPONSE STRUCTURE CONTRACT: your response MUST contain a ## ${s.name} section.\n## ${s.name}\n${s.instruction}`).join("\n\n");
      sections.push(formatBlock);
    }
    ```
* **Modify** [visual.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/pulse/visual.tsx):
  * Ensure the conversational message renderer (`renderKpiSnapshot`) captures multi-section Markdown headers (e.g. `## STRENGTHS`) and maps them into the staggered briefing card grid with `SlideUpStagger` CSS animations.
  * Standardize a unified `TrustFooter.tsx` at the bottom of every answer card, displaying the source label, active filters, attestation badge (`[Reviewed]`, `[AI-Generated]`), and a lightweight `TokenSessionEfficiencyChip`.

### 3. Ask Pulse UI Enhancements
* **Modify** [AISidebar.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/components/AISidebar.tsx):
  * Add a floating suggestions dropdown when `/` is typed in the composer textarea, displaying strategic presets from `insightsPresetLibrary.ts`.
  * Add a collapsible parameter adjustment panel that maps `params` schemas dynamically and binds modified values to local prompt state.
  * Replace inline styles with static CSS classes.

### 4. Authoring Console
* **Create** [AuthoringShell.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/authoring/AuthoringShell.tsx):
  * Expose Setup Home as a 5-gate **Readiness Task List** (BI, AI, Knowledge, Governance, Smoke & Publish).
  * Build a central state provider [authoringStateSnapshot.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/authoring/authoringStateSnapshot.ts) to deterministically track gate completion.
  * Create [inferBusinessContext.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/authoring/inferBusinessContext.ts) to dynamically derive context from active BI dashboard descriptors.

### 5. Global Command Palette (`Ctrl/Cmd+K`)
* **Create** `playground/src/commands/`:
  * `CommandPalette.tsx`: A keyboard-accessible combobox modal overlay utilizing `aria-activedescendant` and focus restoration.
  * `commandRegistry.ts`: Defines command types (`Navigate`, `Configure`, `Ask`, `Action`, `Recovery`).
  * `commandRanking.ts`: Implements query matching, abbreviation/alias support, and dynamic ranking boosts for active error recovery.

---

## Part 4: Visual & Motion Guidelines (The "Sugar Candy" Spec)

Claude must write CSS classes that adhere strictly to these transitions and depth rules:

* **Staggered Narrative Stagger:**
  ```css
  .pp-ai-briefing-card {
    opacity: 0;
    transform: translateY(8px);
    animation: ppSlideUpStagger 280ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes ppSlideUpStagger {
    to { opacity: 1; transform: translateY(0); }
  }
  ```
* **Active Switcher Tab Press:**
  ```css
  .pp-tab-active {
    background: linear-gradient(135deg, #1e6fd4, #1256a8);
    box-shadow: 0 4px 12px rgba(30,111,212,0.25);
    transition: transform 120ms ease-out;
  }
  .pp-tab-active:active {
    transform: scale(0.97);
  }
  ```
* **Low-Opacity Soft Shadows:**
  ```css
  .pp-card-elevated {
    box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(15,23,42,0.03);
    border: 1px solid var(--pp-border);
  }
  .pp-card-elevated:hover {
    box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 12px 28px rgba(15,23,42,0.06);
    transform: translateY(-1px);
  }
  ```

---

## Part 5: Verification & Validation Gate

Claude must validate all code against these three gates before declaring the sprint complete:

1. **Gate 1: Static Audits & Unit Tests**
   * Run `npm run lint` and `npm run test` inside the playground.
   * Ensure there are zero TypeScript compiler warnings or `any` parameters in new models.
   * Verify all 17 custom presets interpolate parameters correctly in unit tests.
2. **Gate 2: Responsive Footprint**
   * Assert zero horizontal viewport scroll at `390px` (mobile) and `1440px` (desktop).
   * Verify the mobile drawer operates smoothly with safe swipe boundaries.
3. **Gate 3: Telemetry & telemetry attributes**
   * Run the headed automated smoke test suite to confirm the native canvas renders charts and KPIs correctly.
   * Verify that `data-active-surface`, `data-bi-surface-mode`, and `data-runtime-bi-vendor` report truthful runtime parameters.
   * Confirm `data-result-id` bindings are byte-identical across the sidebar metrics, canvas charts, and the new `TrustFooter`.
