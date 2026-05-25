# Comparative Feature Assessment: Legacy DwD Visual vs. Modern PulsePlay React Playground

This document performs a deep visual, architectural, and semantic comparison between **DwD_AI_Assistant_for_PBI** (the legacy, feature-rich Power BI custom visual visual) and **PulsePlay** (the modern standalone React playground). 

It validates the user's observation: **significant research on strategic presets, metric direction rules, and structured executive briefs was meticulously developed for the visual, but is currently "trapped" in the legacy compatibility layer (`playground/src/pulse/`) instead of being surfaced as first-class, highly engaging features of the modern conversational chat (`Ask Pulse`).**

We outline the feature gaps and present a concrete plan for **Claude** to roll out these presets natively into the modern conversational experience.

---

## 1. The Core Paradox: Coexist vs. Confinement

When PulsePlay was created as a standalone React playground, the development team ported the legacy DwD custom visual codebase under `playground/src/pulse/` to act as a backward-compatibility shim. 

However, because the standalone development path was highly aggressive, a major gap was introduced:
* **The Legacy Visual (DwD)** is incredibly **feature-rich**: it contains 17 research-backed presets (SWOT, BCG Matrix, RFM customer segmentation, Pareto 80/20, Variance Bridge, Anomaly Detection) and 3 large domain metric direction rules (Retail, Operations, Healthcare) with dynamic, sanitized token-parameterization.
* **The Modern Interface (PulsePlay)** has a clean conversational shell (`Ask Pulse` / `AISidebar.tsx`) but **does not surface or leverage any of this strategic research**. In the new chat UI, users are limited to freeform typing or generic suggestion chips, while the rich visual templates, structured tables, and mathematical parameters are entirely hidden.

By bringing the visual presets directly into the chat flow, we turn `Ask Pulse` into a **highly structured, executive-grade conversational cockpit** that viewers and authors cannot say no to.

---

## 2. Comprehensive Feature Gap Matrix

| Feature / Research Area | Legacy Visual (DwD) Posture | Modern PulsePlay Posture | Status / Gap Analysis |
|---|---|---|---|
| **AI Insights Presets** | 17 structured presets under `insightsPresetLibrary.ts` detailing SWOT, BCG, RFM, Pareto, and Variance templates. | Code is ported but only callable by the legacy `setupStep5.tsx` visual frame. | **Trapped**: Completely inaccessible from the conversational `Ask Pulse` sidebar. |
| **Conversational Briefing Hook** | Hoisted prompt instructions that mold responses into specific `## SECTION` Markdown headers. | Basic `isBriefingQuestion` keyword matcher in `visualHelpers.ts` that triggers only a single `## HEADLINE` section. | **Omitted**: The chat cannot generate multi-section strategic summaries (e.g., a conversation-driven SWOT or RFM card). |
| **Domain Metric Direction Rules** | Hardcoded logic matrices under `METRIC_DIRECTION_PRESETS` defining thresholds (e.g. `Return Rate <=4%`). | Exists as static rules, but only passed during multi-stage visual compilation. | **Trapped**: Conversational AI is unaware of these domain-specific metric thresholds when answering chat questions. |
| **Parameter Tuning UI** | Dynamic inline form panels in setup enabling authors to customize thresholds (e.g., changing SWOT Materiality from `$5,000` to `₹5,00,000`). | Exists only within the legacy `setupStep5` form. | **Omitted**: No way for a user or author to adjust analysis parameters during active chat exploration. |
| **Interactive Chart Rationale** | Basic popover detailing KB auto-pick rules. | Expanded `ChartRationalePill` with data-shape warnings and a "Switch to view" button. | **Improved**: PulsePlay has matured the chart auto-pick visualization pipeline. |
| **Governance Attestations** | None or basic local logging. | Deep G3 fail-closed attestation pipeline on proxy and native canvas. | **Improved**: PulsePlay is vastly superior in enterprise data security and audits. |

---

## 3. The Surfacing Plan: Rollout Presets to Chat (`Ask Pulse`)

To elevate the conversational interface into a delightful, feature-rich powerhouse, Claude will implement the following three-part integration.

### Part A: Chat Slash Commands (`/swot`, `/bcg`, `/rfm`, `/pareto`, `/variance`)
We introduce a first-class command-interceptor in the `Ask Pulse` composer. When a user types a forward slash, a sleek dropdown surfaces our research-backed strategic templates.

```
+-------------------------------------------------------------+
| /s                                                          |
+-------------------------------------------------------------+
|  📊  /swot       Run a quantified SWOT Strategic analysis   |
|  🎯  /bcg        Generate a BCG Growth-Share matrix         |
|  👥  /rfm        Perform RFM Customer Segmentation          |
|  📈  /pareto     Execute a Pareto 80/20 Concentration Scan  |
|  🌉  /variance   Construct a Variance & Waterfall Bridge    |
+-------------------------------------------------------------+
```

When a command is executed:
1. The composer populates the input with the selected preset label (e.g. `"[SWOT Analysis]"`).
2. The request builder interceptor in `visualHelpers.ts` extracts the command and loads the corresponding preset from `insightsPresetLibrary.ts`.
3. It compiles the preset’s custom section instructions and injects them as a structured format contract into the proxy prompt stream (`buildGenieRequest`).
4. The LLM returns a beautiful, multi-stage Markdown briefing (`## STRENGTHS`, `## WEAKNESSES`, etc.) which the chat renderer immediately formats into a choreographed card cascade.

### Part B: The Interactive Parameter Drawer
When a strategic command (like `/swot` or `/variance`) is active in the composer, a subtle **Adjust (⚙)** button lights up next to the Send button. Clicking it slides open a clean drawer, exposing the preset's actual parameters.

```
+-------------------------------------------------------------+
| SWOT Analysis Parameters                                [x] |
+-------------------------------------------------------------+
| Materiality Threshold                                       |
| [ $ ] [ 5000     ]                                          |
|                                                             |
| Healthy Margin Floor (%)                                    |
| [ 15%            ]                                          |
|                                                             |
| High-Growth Threshold (%)                                   |
| [ 20%            ]                                          |
|                                                             |
| [ Apply and Run Analysis ]                                  |
+-------------------------------------------------------------+
```

* **Implementation**: The drawer maps the `params` schema declared in the selected `insightsPresetLibrary.ts` card dynamically.
* **Flow**: When the user clicks **Apply**, the sanitized inputs are passed to `interpolatePreset()`, generating customized prompts dynamically.
* **Benefit**: The user is in complete control, enabling instant recalculations (e.g., lowering the materiality threshold to capture smaller threats) directly in-chat.

### Part C: Grounded Domain suggestion chips
When the `BIPanel` mounts a dashboard, the `ContextBar` extracts its active domain (e.g. "Retail Performance"). The chatbot immediately surfaces relevant domain metric suggestions:
* `[🟢 Retail Sales Directional Rules]`
* `[📊 Run Merchandising SWOT]`
* `[🎯 RFM Customer Segmentation]`

This eliminates the "dead-end" empty state, inviting the user to explore the data using established analytical frameworks.

---

## 4. Handoff Instructions for Claude (Step-by-Step Code Actions)

To bring this blueprint to life, Claude must perform the following localized code enhancements:

### Step 1: Wire Presets into Prompt Construction
* **Target File**: [visualHelpers.ts](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/pulse/visualHelpers.ts)
* **Action**: Update `buildGenieRequest` to parse conversational command prefixes:
```typescript
// Detect slash commands in chat question
const swotMatch = question.match(/^\/swot\b/i);
if (swotMatch) {
  const swotPreset = CUSTOM_SECTION_PRESETS.find(p => p.id === "swot-analysis");
  // Interpolate defaults or user-supplied drawer params
  const compiledSections = interpolatePreset(swotPreset, activeDrawerParams);
  // Append as structural prompt instruction
  const formatBlock = compiledSections.map(s => `RESPONSE STRUCTURE CONTRACT: your response MUST contain a ## ${s.name} section.\n## ${s.name}\n${s.instruction}`).join("\n\n");
  sections.push(formatBlock);
}
```

### Step 2: Build the Chat Composer Slash Dropdown
* **Target File**: [AISidebar.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/components/AISidebar.tsx)
* **Action**: Inside the `<textarea>` input handler, listen for keypress `/`. Render a floating popover above the input listing the `id` and `description` of the strategic custom presets from `insightsPresetLibrary.ts`. 

### Step 3: Implement the Parameter Adjustment Drawer
* **Target File**: [AISidebar.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/components/AISidebar.tsx)
* **Action**: Mount a collapsible side panel that reads the active command’s `params` metadata. Render clean `<input type="number">` or prefix-toggled boxes, validate them using `sanitizeParamValue`, and cache them in local state.

### Step 4: Standardize Card Cascade in Chat
* **Target File**: [visual.tsx](file:///d:/Working_Folder/Projects/PulsePlay/playground/src/pulse/visual.tsx)
* **Action**: Ensure the chat message renderer (`renderKpiSnapshot`) properly captures multi-section Markdown headers emitted by the chatbot (e.g. `## STRENGTHS`) and maps them into the same beautiful, staggered card CSS grid used by AI Insights.

---

## 5. Verification Plan for Claude

1. **Unit Verification**:
   * Add a Vitest suite in `setupStep5DomainPresets.test.ts` asserting that `interpolatePreset` correctly replaces parameter values when called via the chat request builder.
2. **Visual Interaction Sweep**:
   * Type `/swot` in the `Ask Pulse` input in headed Chrome.
   * Open the parameters drawer, change the materiality value to `10000`, click Apply, and confirm the generated prompt payload contains `{{params.materialityThreshold}}` correctly resolved to `10000`.
   * Verify that the returned answer renders as 4 distinct, staggered SWOT cards with soft-depth borders and proper semantic badges.
3. **No Legacy Regression**:
   * Run the full Vitest suite to ensure that legacy PBI custom visual wrappers in `pulse/` continue to load and compile presets unchanged.
