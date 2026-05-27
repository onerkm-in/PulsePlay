// playground/src/settings/components/PresetCombobox.tsx
//
// PulsePlay-native combobox wrappers that consume the existing preset
// libraries (insightsPresetLibrary.ts) and apply to PulseAiVisualSettings
// in the same shape the setupStep5 gn-* pickers do — but rendered via
// SettingsCombobox so we get a transparent custom scrollbar, search,
// and ARIA combobox semantics that the native <select> popup denies.
//
// 2026-05-28 — built per user direction: "if the dropdown has more
// number of LOV than a transparent scroller bar." Both libraries have
// 10+ options each; native <select> popup scrollbar uncustomizable.
// These wrappers leave setupStep5's gn-* pickers alone (still used by
// the PulseShell PBI format pane) — PulsePlay-native Settings → AI
// uses these.

import * as React from "react";
import { useMemo, useState } from "react";
import {
    CUSTOM_SECTION_PRESETS,
    METRIC_DIRECTION_PRESETS,
    interpolatePreset,
    defaultParamValues,
    type CustomSectionPreset,
    type MetricDirectionPreset,
} from "../../pulse/insightsPresetLibrary";
import { isDomainRelated } from "../../pulse/setupStep5";
import { SettingsCombobox } from "../primitives/SettingsCombobox";

/* ─── Custom-section preset combobox ────────────────────────────── */

export interface CustomSectionPresetComboboxProps {
    currentDomain: string;
    onApplyDomain: (v: string) => void;
    onApplySections: (json: string) => void;
    /** When supplied AND the picked preset has bundled
     *  metricDirectionRules, apply them in the same action. */
    onApplyMetricRules?: (rules: string) => void;
}

export function CustomSectionPresetCombobox({
    currentDomain,
    onApplyDomain,
    onApplySections,
    onApplyMetricRules,
}: CustomSectionPresetComboboxProps): React.ReactElement {
    const [selectedId, setSelectedId] = useState("");

    // Group options: "Recommended for {domain}" first when domain set, then "Other presets"
    const options = useMemo(() => {
        const dom = currentDomain.trim();
        const related = dom
            ? CUSTOM_SECTION_PRESETS.filter(p => isDomainRelated(dom, p.domain))
            : [];
        const others = related.length > 0
            ? CUSTOM_SECTION_PRESETS.filter(p => !isDomainRelated(dom, p.domain))
            : CUSTOM_SECTION_PRESETS;
        const groupRecommended = dom ? `Recommended for ${dom}` : null;
        const out: Array<{ value: string; label: string; description?: string; group?: string }> = [];
        for (const p of related) {
            out.push({
                value: p.id,
                label: p.label,
                description: p.description,
                group: groupRecommended || undefined,
            });
        }
        for (const p of others) {
            out.push({
                value: p.id,
                label: p.label,
                description: p.description,
                group: related.length > 0 ? "Other presets" : "All presets",
            });
        }
        return out;
    }, [currentDomain]);

    const apply = (preset: CustomSectionPreset | undefined) => {
        if (!preset) return;
        if (!currentDomain.trim()) onApplyDomain(preset.domain);
        const sections = preset.params
            ? interpolatePreset(preset, defaultParamValues(preset))
            : preset.sections;
        onApplySections(JSON.stringify(sections, null, 2));
        if (preset.metricDirectionRules && onApplyMetricRules) {
            onApplyMetricRules(preset.metricDirectionRules);
        }
    };

    const handleChange = (id: string) => {
        setSelectedId(id);
        const preset = CUSTOM_SECTION_PRESETS.find(p => p.id === id);
        apply(preset);
    };

    return (
        <SettingsCombobox
            value={selectedId}
            onChange={handleChange}
            options={options}
            ariaLabel="Custom sections preset library"
            placeholder="Choose a custom-section preset…"
        />
    );
}

/* ─── Metric-direction preset combobox ──────────────────────────── */

export interface MetricDirectionPresetComboboxProps {
    currentDomain: string;
    onApplyDomain: (v: string) => void;
    onApplyRules: (rules: string) => void;
}

export function MetricDirectionPresetCombobox({
    currentDomain,
    onApplyDomain,
    onApplyRules,
}: MetricDirectionPresetComboboxProps): React.ReactElement {
    const [selectedId, setSelectedId] = useState("");

    const options = useMemo(() => {
        const dom = currentDomain.trim();
        const related = dom
            ? METRIC_DIRECTION_PRESETS.filter(p => isDomainRelated(dom, p.domain))
            : [];
        const others = related.length > 0
            ? METRIC_DIRECTION_PRESETS.filter(p => !isDomainRelated(dom, p.domain))
            : METRIC_DIRECTION_PRESETS;
        const groupRecommended = dom ? `Recommended for ${dom}` : null;
        const out: Array<{ value: string; label: string; description?: string; group?: string }> = [];
        for (const p of related) {
            out.push({
                value: p.id,
                label: p.label,
                description: p.description,
                group: groupRecommended || undefined,
            });
        }
        for (const p of others) {
            out.push({
                value: p.id,
                label: p.label,
                description: p.description,
                group: related.length > 0 ? "Other presets" : "All presets",
            });
        }
        return out;
    }, [currentDomain]);

    const apply = (preset: MetricDirectionPreset | undefined) => {
        if (!preset) return;
        if (!currentDomain.trim()) onApplyDomain(preset.domain);
        onApplyRules(preset.rules);
    };

    const handleChange = (id: string) => {
        setSelectedId(id);
        const preset = METRIC_DIRECTION_PRESETS.find(p => p.id === id);
        apply(preset);
    };

    return (
        <SettingsCombobox
            value={selectedId}
            onChange={handleChange}
            options={options}
            ariaLabel="Metric direction preset library"
            placeholder="Choose a metric-rules preset…"
        />
    );
}
