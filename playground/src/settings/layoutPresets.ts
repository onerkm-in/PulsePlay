// playground/src/settings/layoutPresets.ts
//
// LayoutPreset facade over existing `enabledComponents` + `layoutMode` +
// Pulse `enabledFeatures` state.
//
// Background: Codex's [PROPOSAL] in commit `aca0c2b` (extracted from
// Rajesh's hand-drawn `docs/Proposed_Preset_Templates.pdf`) defined five
// templates T1-T5 for how an author wants the playground to feel:
//
//   T1  AI Insights | Ask Pulse | BI Viz   — all three available
//   T2  AI/BI Insights | Ask Pulse | BI Viz — fused AI+BI (deferred, v1.x)
//   T3  BI Viz only                          — viewer-only kiosk
//   T4  AI Insights only                     — exec dashboard
//   T5  Ask Pulse only                       — chat-first internal tool
//
// Claude's [CHALLENGE] in `0a85fb5` argued these are PRESETS over existing
// state. Rajesh's follow-up clarified the visible experience still must be a
// unified surface by default: BI should not occupy a permanent separate pane
// unless the author explicitly chooses Split + Mix. Each T-template maps
// directly to a combination of three settings we already have:
//
//   enabledComponents : "aiOnly" | "biOnly" | "both" | "mix"
//   layoutMode        : "ai-left" | "ai-right" | "ai-top" | "ai-bottom"
//   enabledFeatures   : "both" | "insightsOnly" | "chatOnly"  (Pulse-level)
//
// After the binary architecture decision (locked 2026-05-17 — see AGENT_SYNC
// `[DECISION]`), Rajesh chose Option A (LayoutPreset facade) over Option B
// (TabStrip + FloatingCompanion + BubbleLauncher coordinated release).
//
// This module is the facade. It owns:
//   - The 5 v0 preset definitions
//   - A detector that derives "which preset is currently active?" from
//     existing state (preset is NOT separately persisted — facade only)
//   - A helper for the picker UI to apply a preset (writes to the three
//     underlying setters; downstream consumers see normal setting changes)

import type { EnabledComponents, LayoutMode } from "./settingsStore";
import type { PulseEnabledFeatures } from "./pulseVisualSettingsStore";

/** v0 preset keys. T2 ("fused AI/BI Insights") is deferred to v1.x — it's
 *  a new surface type (compose AI commentary inline with BI visuals), not
 *  a presentation collapse, so it's not implementable as a preset over
 *  existing state.
 *
 *  Custom = "user manually configured a combination that doesn't match
 *  any preset." Computed; not selectable. Lets the picker indicate "no
 *  preset matches current settings" without showing a stale selection. */
export type LayoutPreset = "balanced" | "bi-focus" | "insights-focus" | "ask-focus" | "split-mix";
export type LayoutPresetOrCustom = LayoutPreset | "custom";

export interface LayoutPresetConfig {
    /** Display label for the picker. Author-facing. */
    label: string;
    /** One-sentence helper text shown in the picker. */
    description: string;
    /** Maps to T-number from Rajesh's PDF. For reference + cross-link only. */
    template: "T1" | "T3" | "T4" | "T5" | "T6-custom";
    /** Underlying state values the preset writes. */
    state: {
        enabledComponents: EnabledComponents;
        layoutMode: LayoutMode;
        enabledFeatures: PulseEnabledFeatures;
    };
}

export const LAYOUT_PRESETS: Record<LayoutPreset, LayoutPresetConfig> = {
    "balanced": {
        label: "Balanced",
        description: "Unified default. AI Insights, Ask Pulse, and Dashboard are peer surfaces; the dashboard opens on demand instead of taking a permanent second section.",
        template: "T1",
        state: {
            enabledComponents: "mix",
            layoutMode: "ai-left",
            enabledFeatures: "both",
        },
    },
    "bi-focus": {
        label: "BI focus",
        description: "Show only the BI canvas. AI is hidden. For viewer-only kiosks or governed dashboards where AI is disabled by policy.",
        template: "T3",
        state: {
            enabledComponents: "biOnly",
            // layoutMode + enabledFeatures don't affect a BI-only deployment;
            // we still write them so the underlying state is normalized to a
            // known baseline rather than whatever the user had previously.
            layoutMode: "ai-left",
            enabledFeatures: "both",
        },
    },
    "insights-focus": {
        label: "AI Insights focus",
        description: "Auto-generated AI Insights only. No BI canvas, no Ask Pulse tab. For exec dashboards where the briefing IS the product.",
        template: "T4",
        state: {
            enabledComponents: "aiOnly",
            layoutMode: "ai-left",
            enabledFeatures: "insightsOnly",
        },
    },
    "ask-focus": {
        label: "Ask Pulse focus",
        description: "Chat-first. Ask Pulse only — no Insights tab, no BI canvas. For internal tools where users come in with specific questions.",
        template: "T5",
        state: {
            enabledComponents: "aiOnly",
            layoutMode: "ai-left",
            enabledFeatures: "chatOnly",
        },
    },
    "split-mix": {
        label: "Split + Mix",
        description: "Both AI and BI panes visible with draggable divider. Power-user side-by-side view — best for the \"look and ask\" workflow PulsePlay was originally designed for.",
        template: "T6-custom",
        state: {
            enabledComponents: "both",
            layoutMode: "ai-left",
            enabledFeatures: "both",
        },
    },
};

/** Ordered list of presets for picker rendering. Order is intentional:
 *  Balanced (default) first, then focused single-surface presets, then the
 *  power-user split at the end. */
export const LAYOUT_PRESET_ORDER: ReadonlyArray<LayoutPreset> = [
    "balanced",
    "split-mix",
    "bi-focus",
    "insights-focus",
    "ask-focus",
];

/** Derive which preset is currently active from the three underlying
 *  settings. Returns "custom" if no preset matches exactly (e.g. the user
 *  has hand-tuned `enabledComponents` + `enabledFeatures` to a combination
 *  that isn't in the catalog).
 *
 *  Note: `layoutMode` is NOT part of the equality check. All v0 presets
 *  default to "ai-left" but the author can change AI position
 *  independently — we don't want changing it to push the preset to
 *  "custom" when nothing material about the preset's intent has changed.
 */
export function detectActivePreset(input: {
    enabledComponents: EnabledComponents;
    enabledFeatures: PulseEnabledFeatures;
}): LayoutPresetOrCustom {
    for (const key of LAYOUT_PRESET_ORDER) {
        const preset = LAYOUT_PRESETS[key];
        if (preset.state.enabledComponents === input.enabledComponents
            && preset.state.enabledFeatures === input.enabledFeatures) {
            return key;
        }
    }
    return "custom";
}
