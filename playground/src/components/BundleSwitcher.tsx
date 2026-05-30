// ─── BundleSwitcher — the "AI & BI enabler" chained chip (ADR-0011) ───────
//
// Collapses the two-knob (VendorPicker + ConnectorPicker) anti-pattern into
// ONE control: a chained chip showing the bound pair `[Power BI ⇄ Genie]`.
// Picking another bundle swaps BOTH axes atomically via the existing
// governance-aware setters. Single live pane (Option A); simultaneous display
// is deferred (Option B). The active bundle is a PURE PROJECTION of the
// current (biVendor, aiProfile) — no new state.

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

export function BundleSwitcher(): React.ReactElement | null {
    const settings = useSettings();
    const { biVendor, activeAiProfile, allowlist, setBiVendor, setActiveAiProfile } = settings;

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

    // Nothing to switch between → don't render the control at all.
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
        setError(null);
        setOpen(false);
    };

    const curVendorLabel = vendorLabel(biVendor);
    const curProfileLabel = profileLabel(activeAiProfile);

    return (
        <div ref={rootRef} className="pp-bundle-switcher" style={{ position: "relative", display: "inline-flex" }}>
            <button
                type="button"
                className="pp-bundle-switcher__chip"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`AI & BI enabler: ${curVendorLabel} with ${curProfileLabel}. Switch enabler.`}
                title="Switch the AI & BI enabler (BI surface + AI brain)"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "4px 9px",
                    borderRadius: 999,
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
                <span aria-hidden="true" style={{ opacity: 0.7, fontSize: 12 }}>⇄</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{curProfileLabel}</span>
                {!active && (
                    <span
                        style={{
                            marginLeft: 2,
                            padding: "1px 6px",
                            borderRadius: 999,
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
                <div
                    role="listbox"
                    aria-label="Enabler bundles"
                    className="pp-bundle-switcher__menu"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        zIndex: 50,
                        minWidth: 240,
                        maxWidth: 360,
                        padding: 5,
                        borderRadius: 12,
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
                        Switch enabler
                    </div>
                    {bundles.map(b => {
                        const isActive = active?.id === b.id;
                        return (
                            <button
                                key={b.id}
                                type="button"
                                role="option"
                                aria-selected={isActive}
                                onClick={() => applyBundle(b)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    width: "100%",
                                    padding: "7px 8px",
                                    borderRadius: 8,
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
                                <span aria-hidden="true" style={{ width: 14, color: "var(--pp-accent, #4b9cf5)", fontWeight: 700 }}>
                                    {isActive ? "✓" : ""}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.label}</span>
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
            )}
        </div>
    );
}
