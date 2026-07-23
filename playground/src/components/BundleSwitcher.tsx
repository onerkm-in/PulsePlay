// BundleSwitcher, the "AI & BI enabler" chained chip (ADR-0011). Collapses
// the old two-knob vendor/connector pickers into one control: a chip showing
// the bound pair, e.g. Power BI with Genie. Picking another bundle swaps both
// axes atomically through the existing governance-aware setters. The active
// bundle is a pure projection of the current (biVendor, aiProfile); it keeps
// no state of its own. Showing two panes at once is deferred.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../settings/settingsStore";
import {
    deriveBundles,
    resolveActiveBundle,
    vendorLabel,
    profileLabel,
    CONTEXT_BUNDLES_STORAGE_KEY,
    type ContextBundle,
} from "../lib/contextBundles";

function readAuthoredRaw(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(CONTEXT_BUNDLES_STORAGE_KEY);
    } catch {
        return null;
    }
}

export interface BundleSwitcherProps {
    /** The BI surface actually rendering right now (from resolveBiSurfaceVendor),
     *  which may differ from the author's requested `biVendor` (e.g. a "native"
     *  fallback when no embed config exists). The chip must show this, not the
     *  request, so it never claims a vendor is running when it isn't. */
    runtimeVendor?: string;
    /** Pre-formatted display label for runtimeVendor (e.g. "Pulse Canvas" for
     *  a native fallback). Falls back to vendorLabel(biVendor) when omitted,
     *  which reproduces the pre-fix (requested-vendor) behavior for callers
     *  that don't yet track runtime resolution, such as isolated tests. */
    runtimeVendorLabel?: string;
}

export function BundleSwitcher(props: BundleSwitcherProps = {}): React.ReactElement | null {
    const settings = useSettings();
    const { biVendor, activeAiProfile, allowlist, setBiVendor, setActiveAiProfile, setPackSelection } = settings;

    const [open, setOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const bundles = useMemo(
        () => deriveBundles(allowlist, { authoredRaw: readAuthoredRaw() }),
        // re-derive when the allowlist identity changes
        [allowlist],
    );
    const active = useMemo(
        () => resolveActiveBundle(bundles, biVendor, activeAiProfile),
        [bundles, biVendor, activeAiProfile],
    );

    // Close on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    // With nothing to switch between, don't render the control at all.
    if (bundles.length <= 1 && active) return null;

    const applyBundle = (b: ContextBundle) => {
        // Swap both axes. The setters are governance-aware ({ ok, reason }).
        const r1 = setBiVendor(b.biVendor);
        if (!r1.ok) {
            setError(r1.reason || "Could not switch BI surface.");
            return;
        }
        const r2 = setActiveAiProfile(b.aiProfile);
        if (!r2.ok) {
            setError(r2.reason || "Could not switch AI brain.");
            return;
        }
        if (b.pack) {
            const r3 = setPackSelection({ pack: b.pack });
            if (!r3.ok) {
                setError(r3.reason || "Could not switch knowledge pack.");
                return;
            }
        }
        setError(null);
        setOpen(false);
    };

    const curVendorLabel = props.runtimeVendorLabel ?? vendorLabel(props.runtimeVendor ?? biVendor);
    const curProfileLabel = profileLabel(activeAiProfile);

    // Honesty tag per BI surface: only Power BI has a real vendor SDK bridge;
    // Tableau/Qlik/Looker render an iframe you must point at a URL (no event or
    // command bridge yet). Don't present a stub as an equal of a live surface.
    const surfaceTag = (vendor: string): { text: string; hint: string } | null => {
        if (vendor === "powerbi") return { text: "live SDK", hint: "Real vendor SDK with event + command bridge." };
        if (["tableau", "qlik", "looker", "generic-iframe", "databricks-genie"].includes(vendor)) {
            return { text: "iframe preview", hint: "Renders an embed URL only — no vendor SDK bridge yet. You supply the URL in Settings → BI." };
        }
        return null;
    };

    return (
        <div ref={rootRef} className="pp-bundle-switcher" style={{ position: "relative", display: "inline-flex" }}>
            <button
                type="button"
                className="pp-bundle-switcher__chip"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`BI surface and AI brain: ${curVendorLabel}${curProfileLabel ? ` with ${curProfileLabel}` : " — no AI brain selected"}. Switch combination.`}
                title="Switch which BI surface and AI brain you're working with"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "4px 9px",
                    borderRadius: 4,
                    border: "1px solid var(--pp-accent-border, rgba(75,156,245,0.42))",
                    background: "var(--pp-accent-soft, rgba(75,156,245,0.10))",
                    color: "var(--pp-text, #1f2937)",
                    cursor: "pointer",
                    fontSize: 11.5,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    maxWidth: "min(52vw, 420px)",
                }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{curVendorLabel}</span>
                <span aria-hidden="true" style={{ opacity: 0.7, fontSize: 12 }}>×</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{curProfileLabel}</span>
                {!active && (
                    <span
                        title="Your current BI surface + AI brain pair isn't one of the curated combinations below."
                        style={{
                            marginLeft: 2,
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                            textTransform: "uppercase",
                            background: "var(--pp-surface, rgba(0,0,0,0.06))",
                            color: "var(--pp-text-muted, #6b7280)",
                        }}
                    >
                        Custom
                    </span>
                )}
                <span aria-hidden="true" style={{ opacity: 0.6, fontSize: 9 }}>▾</span>
            </button>

            {open && (
                <>
                {/* Backdrop catches outside clicks so they close the menu
                    instead of leaking through to toolbar controls beneath the
                    overlay (the menu drops down over the Row-2 control strip). */}
                <div
                    aria-hidden="true"
                    onClick={() => setOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 59 }}
                />
                <div
                    role="listbox"
                    aria-label="BI surface and AI brain combinations"
                    className="pp-bundle-switcher__menu"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        // above the fixed window-controls toolbar (z 50), which
                        // otherwise bleeds its maximize/minimize icons through the
                        // menu and reads as a stray checkbox on the first row
                        zIndex: 60,
                        minWidth: 264,
                        maxWidth: 380,
                        padding: 5,
                        borderRadius: 7,
                        border: "1px solid var(--pp-border, rgba(0,0,0,0.12))",
                        background: "var(--pp-surface-raised, #ffffff)",
                        boxShadow: "var(--pp-shadow-md, 0 10px 30px rgba(15,23,42,0.18))",
                    }}
                >
                    <div
                        style={{
                            padding: "4px 8px 6px",
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            textTransform: "uppercase",
                            color: "var(--pp-text-subtle, #94a3b8)",
                        }}
                    >
                        BI surface × AI brain
                    </div>
                    {/* Always show what you're on NOW — especially when the current
                        pair isn't one of the curated rows below (the "Custom" case
                        that otherwise leaves nothing marked as selected). */}
                    <div
                        aria-hidden="true"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 8px 8px",
                            marginBottom: 4,
                            borderBottom: "1px solid var(--pp-border-subtle, rgba(0,0,0,0.07))",
                            fontSize: 11.5,
                        }}
                    >
                        <span style={{ width: 14, color: "var(--pp-accent, #5980a6)", fontWeight: 700 }}>✓</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                Now: {curVendorLabel} × {curProfileLabel || "no AI brain"}
                            </span>
                            {!active && (
                                <span style={{ display: "block", fontSize: 10, color: "var(--pp-text-muted, #6b7280)" }}>
                                    Custom pair — not one of the combinations below
                                </span>
                            )}
                        </span>
                    </div>
                    {bundles.map(b => {
                        const isActive = active?.id === b.id;
                        const tag = surfaceTag(b.biVendor);
                        return (
                            <button
                                key={b.id}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => applyBundle(b)}
                                title={tag?.hint}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    width: "100%",
                                    padding: "7px 8px",
                                    borderRadius: 4,
                                    border: "none",
                                    background: isActive ? "var(--pp-accent-soft, rgba(75,156,245,0.12))" : "transparent",
                                    color: "var(--pp-text, #1f2937)",
                                    cursor: "pointer",
                                    fontSize: 12,
                                    fontWeight: isActive ? 600 : 500,
                                    textAlign: "left",
                                }}
                                onMouseEnter={e => {
                                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "var(--pp-surface, rgba(0,0,0,0.04))";
                                }}
                                onMouseLeave={e => {
                                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                                }}
                            >
                                <span aria-hidden="true" style={{ width: 14, color: "var(--pp-accent, #5980a6)", fontWeight: 700 }}>
                                    {isActive ? "✓" : ""}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</span>
                                        {tag && (
                                            <span
                                                style={{
                                                    flex: "0 0 auto",
                                                    padding: "1px 5px",
                                                    borderRadius: 3,
                                                    fontSize: 8.5,
                                                    fontWeight: 700,
                                                    letterSpacing: 0.3,
                                                    textTransform: "uppercase",
                                                    background: b.biVendor === "powerbi"
                                                        ? "color-mix(in srgb, var(--pp-good, #1f9d6b) 14%, transparent)"
                                                        : "var(--pp-surface, rgba(0,0,0,0.05))",
                                                    color: b.biVendor === "powerbi"
                                                        ? "var(--pp-good, #1f9d6b)"
                                                        : "var(--pp-text-muted, #6b7280)",
                                                }}
                                            >
                                                {tag.text}
                                            </span>
                                        )}
                                    </span>
                                    <span style={{ display: "block", fontSize: 10, color: "var(--pp-text-muted, #6b7280)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {vendorLabel(b.biVendor)} surface · {profileLabel(b.aiProfile)} brain
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                    {error && (
                        <div
                            role="alert"
                            style={{
                                margin: "4px 6px 2px",
                                padding: "6px 8px",
                                borderRadius: 8,
                                fontSize: 10.5,
                                lineHeight: 1.3,
                                background: "var(--pp-error-soft, rgba(248,81,73,0.10))",
                                color: "var(--pp-error, #b42318)",
                                border: "1px solid var(--pp-error-border, rgba(248,81,73,0.30))",
                            }}
                        >
                            {error}
                        </div>
                    )}
                </div>
                </>
            )}
        </div>
    );
}
