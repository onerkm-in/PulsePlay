// playground/src/components/PackPicker.tsx
//
// Smart Connect — Step 2 UI. Two-level picker (pack -> sub-vertical) that
// supports a probe-suggested preselection while always letting the author
// override. Per docs/CONNECTOR_PROBE_AND_SMART_CONNECT.md the author has
// the final say at every step — the UX must never trap them in an inferred
// choice.
//
// Visual cues:
//   *  marker + tooltip "auto-suggested by probe" when the current
//      selection still matches the probe suggestion
//   "(manual override)" tag when the author changed away from the
//      suggestion
//
// Controlled component pattern — parent owns the selection state.

import { useMemo } from "react";

export interface PackSubVerticalInfo {
    name: string;
    displayName: string;
    description?: string;
}

export interface PackInfo {
    name: string;
    displayName: string;
    description?: string;
    subVerticals: PackSubVerticalInfo[];
}

export interface PackSelection {
    pack: string;
    subVertical?: string;
}

export interface PackPickerProps {
    /** All installed packs visible to the current user, normally loaded from the proxy pack registry. */
    availablePacks: PackInfo[];
    /** Suggested pack from probe inference (preselect, also drives the * marker). */
    suggested?: PackSelection;
    /** Currently selected. Null until the user (or the parent applying the suggestion) picks. */
    value: PackSelection | null;
    onChange: (selection: PackSelection) => void;
}

/**
 * Legacy fallback list for tests/story-like callers that render PackPicker in
 * isolation. App.tsx uses /api/assistant/knowledge/packs instead.
 */
export const DEFAULT_AVAILABLE_PACKS: PackInfo[] = [
    {
        name: "cpg-fmcg",
        displayName: "CPG / FMCG",
        description:
            "Consumer Packaged Goods / Fast-Moving Consumer Goods preset pack. Ten sub-verticals plus a sustainability cross-cutting overlay.",
        subVerticals: [
            { name: "supply-chain", displayName: "Supply Chain", description: "Demand sensing, inventory health, OTIF, S&OP, control tower, logistics." },
            { name: "procurement", displayName: "Procurement", description: "Sourcing, supplier risk, contracts, commodity exposure, RFx orchestration." },
            { name: "manufacturing", displayName: "Manufacturing", description: "OEE, yield, downtime, predictive maintenance, quality, batch genealogy." },
            { name: "commercial-retail", displayName: "Commercial / Retail", description: "Revenue growth management, trade promotion, retail execution, digital shelf, JBP." },
            { name: "finance-fpa", displayName: "Finance / FP&A", description: "Margin bridge, working capital, FP&A, scenario modelling, close anomaly detection." },
            { name: "hr", displayName: "HR", description: "Workforce planning, skills, frontline staffing, safety, learning, attrition." },
            { name: "it-admin", displayName: "IT / Admin", description: "Service desk, infrastructure, application portfolio, AI governance ops, license utilisation." },
            { name: "vendor-management", displayName: "Vendor Management", description: "Supplier 360, contract intelligence, tier 2/3/4 dependency, ESG scorecards." },
            { name: "client-management", displayName: "Client Management", description: "Retail customer JBP, scorecards, deductions; warehousing-client SLAs and throughput." },
            { name: "sustainability", displayName: "Sustainability", description: "Cross-cutting overlay: Scope 1/2/3 emissions, water, waste, packaging, ESG reporting." },
        ],
    },
];

export function PackPicker(props: PackPickerProps) {
    const packs = props.availablePacks;
    const selectedPackName = props.value?.pack ?? "";
    const selectedSubVerticalName = props.value?.subVertical ?? "";

    const activePack = useMemo<PackInfo | undefined>(
        () => packs.find(p => p.name === selectedPackName),
        [packs, selectedPackName],
    );

    const packMatchesSuggestion =
        !!props.suggested && !!selectedPackName && selectedPackName === props.suggested.pack;

    const subVerticalMatchesSuggestion =
        packMatchesSuggestion
        && !!props.suggested?.subVertical
        && selectedSubVerticalName === props.suggested.subVertical;

    // Manual override tag fires only when a suggestion exists and the user
    // changed AWAY from it. No suggestion ⇒ no marker, no override tag.
    const packWasOverridden =
        !!props.suggested && !!selectedPackName && selectedPackName !== props.suggested.pack;

    const subVerticalWasOverridden =
        !!props.suggested?.subVertical
        && packMatchesSuggestion
        && !!selectedSubVerticalName
        && selectedSubVerticalName !== props.suggested.subVertical;

    const handlePackChange = (packName: string) => {
        // When the pack changes, drop the sub-vertical — old sub-vertical
        // belongs to the old pack and the user must reconfirm the choice
        // for the new one.
        props.onChange({ pack: packName, subVertical: undefined });
    };

    const handleSubVerticalChange = (subVerticalName: string) => {
        if (!selectedPackName) return; // shouldn't happen — sub-select disabled
        props.onChange({
            pack: selectedPackName,
            subVertical: subVerticalName || undefined,
        });
    };

    const subVerticals = activePack?.subVerticals ?? [];

    return (
        <section className="pp-pack-picker">
            <header className="pp-pack-picker__header">
                <h2 className="pp-pack-picker__title">Pack</h2>
            </header>

            {/* ── Pack-level select ──────────────────────────────────── */}
            <div className="pp-pack-picker__field">
                <label htmlFor="pp-pack-picker__pack" className="pp-pack-picker__label">
                    Pack
                    {packMatchesSuggestion && (
                        <span
                            className="pp-pack-picker__suggested-marker"
                            title="auto-suggested by probe"
                            aria-label="auto-suggested by probe"
                        >
                            {" *"}
                        </span>
                    )}
                    {packWasOverridden && (
                        <span className="pp-pack-picker__override-tag">
                            {" (manual override)"}
                        </span>
                    )}
                </label>
                <select
                    id="pp-pack-picker__pack"
                    className="pp-pack-picker__select"
                    value={selectedPackName}
                    onChange={(e) => handlePackChange(e.target.value)}
                >
                    <option value="">— Select a pack —</option>
                    {packs.map(p => (
                        <option key={p.name} value={p.name}>
                            {p.displayName}
                            {props.suggested?.pack === p.name ? " *" : ""}
                        </option>
                    ))}
                </select>
                {activePack?.description && (
                    <p className="pp-pack-picker__desc">{activePack.description}</p>
                )}
            </div>

            {/* ── Sub-vertical select ────────────────────────────────── */}
            <div className="pp-pack-picker__field">
                <label htmlFor="pp-pack-picker__subv" className="pp-pack-picker__label">
                    Sub-vertical
                    {subVerticalMatchesSuggestion && (
                        <span
                            className="pp-pack-picker__suggested-marker"
                            title="auto-suggested by probe"
                            aria-label="auto-suggested by probe"
                        >
                            {" *"}
                        </span>
                    )}
                    {subVerticalWasOverridden && (
                        <span className="pp-pack-picker__override-tag">
                            {" (manual override)"}
                        </span>
                    )}
                </label>
                <select
                    id="pp-pack-picker__subv"
                    className="pp-pack-picker__select"
                    value={selectedSubVerticalName}
                    onChange={(e) => handleSubVerticalChange(e.target.value)}
                    disabled={!selectedPackName || subVerticals.length === 0}
                >
                    <option value="">
                        {selectedPackName ? "— Select a sub-vertical —" : "— Pick a pack first —"}
                    </option>
                    {subVerticals.map(sv => (
                        <option key={sv.name} value={sv.name}>
                            {sv.displayName}
                            {packMatchesSuggestion && props.suggested?.subVertical === sv.name ? " *" : ""}
                        </option>
                    ))}
                </select>
                {selectedSubVerticalName && (
                    <p className="pp-pack-picker__desc">
                        {subVerticals.find(sv => sv.name === selectedSubVerticalName)?.description ?? ""}
                    </p>
                )}
            </div>

            {/* Footer hint — only render when there's actually a suggestion to talk about. */}
            {props.suggested && (
                <p className="pp-pack-picker__hint">
                    Items marked <span aria-hidden="true">*</span> were auto-suggested by the probe. You can override at any time.
                </p>
            )}
        </section>
    );
}
