// playground/src/settings/primitives/SettingsCombobox.tsx
//
// Generic combobox primitive for Settings pickers that have many
// options (LOV) where a native <select> popup can't be styled (the
// scrollbar inside the OS-rendered popup is uncustomizable in every
// major browser). This primitive replaces <select> with a fully owned
// button + popover + filtered list, so we can render a transparent
// scrollbar, add search, and own ARIA combobox semantics.
//
// 2026-05-28 — built per user direction:
//   "if the dropdown has more number of LOV than a transparent scroller bar"
//
// API mirrors a typical <select> shape (value, onChange, options) so
// callers can swap with minimum churn.

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SettingsComboboxOption<TValue extends string = string> {
    value: TValue;
    label: string;
    /** Optional sub-label rendered smaller below the main label. */
    description?: string;
    /** Optional group header — options sharing the same group string
     *  cluster together with a single group label rendered above. */
    group?: string;
}

export interface SettingsComboboxProps<TValue extends string = string> {
    /** Currently selected value. Empty string = no selection. */
    value: TValue | "";
    /** Called with the picked option's value when the user selects. */
    onChange: (value: TValue) => void;
    /** Options to render. Order is preserved within a group; groups
     *  are rendered in first-appearance order. */
    options: ReadonlyArray<SettingsComboboxOption<TValue>>;
    /** Trigger button label when value is empty. Default: "Select…". */
    placeholder?: string;
    /** When true, render a search input at the top of the popover that
     *  filters options by case-insensitive substring on label + group.
     *  Default: true. */
    searchable?: boolean;
    /** Max height of the popover's scroll area in px. Default: 320. */
    maxHeight?: number;
    /** ARIA label for the trigger button (combobox role). */
    ariaLabel: string;
    /** Optional className on the outer wrapper for layout adjustments. */
    className?: string;
    /** Disable the combobox entirely. */
    disabled?: boolean;
}

export function SettingsCombobox<TValue extends string = string>({
    value,
    onChange,
    options,
    placeholder = "Select…",
    searchable = true,
    maxHeight = 320,
    ariaLabel,
    className,
    disabled = false,
}: SettingsComboboxProps<TValue>): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);

    // Filtered options based on the search query.
    const filteredOptions = useMemo(() => {
        if (!query.trim()) return options;
        const q = query.trim().toLowerCase();
        return options.filter(o =>
            o.label.toLowerCase().includes(q)
            || (o.description?.toLowerCase().includes(q) ?? false)
            || (o.group?.toLowerCase().includes(q) ?? false)
        );
    }, [options, query]);

    // Group filtered options by their group string (preserving first-
    // appearance order across the original list).
    const grouped = useMemo(() => {
        const out: Array<{ group: string | null; opts: SettingsComboboxOption<TValue>[] }> = [];
        const indexByGroup = new Map<string, number>();
        for (const o of filteredOptions) {
            const g = o.group ?? null;
            const key = g ?? "__no_group__";
            let idx = indexByGroup.get(key);
            if (idx === undefined) {
                idx = out.length;
                indexByGroup.set(key, idx);
                out.push({ group: g, opts: [] });
            }
            out[idx].opts.push(o);
        }
        return out;
    }, [filteredOptions]);

    // Flat list of options in render order — used for keyboard nav indexing.
    const flatRendered = useMemo(() => grouped.flatMap(g => g.opts), [grouped]);

    // Reset activeIndex when filter changes.
    useEffect(() => {
        if (open) setActiveIndex(0);
    }, [query, open]);

    // Click-outside to close.
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                popoverRef.current && !popoverRef.current.contains(target)
                && triggerRef.current && !triggerRef.current.contains(target)
            ) {
                setOpen(false);
            }
        };
        window.addEventListener("mousedown", handler);
        return () => window.removeEventListener("mousedown", handler);
    }, [open]);

    // Focus search on open, restore focus to trigger on close.
    useEffect(() => {
        if (open && searchable) {
            // Defer to next tick so the popover is in the DOM.
            const t = setTimeout(() => { searchRef.current?.focus(); }, 0);
            return () => clearTimeout(t);
        }
    }, [open, searchable]);

    const selectByIndex = useCallback((idx: number) => {
        const opt = flatRendered[idx];
        if (!opt) return;
        onChange(opt.value);
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
    }, [flatRendered, onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, flatRendered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            selectByIndex(activeIndex);
        } else if (e.key === "Home") {
            e.preventDefault();
            setActiveIndex(0);
        } else if (e.key === "End") {
            e.preventDefault();
            setActiveIndex(flatRendered.length - 1);
        }
    }, [activeIndex, flatRendered.length, selectByIndex]);

    // Scroll active option into view. jsdom doesn't implement
    // scrollIntoView, so guard with typeof check for test compatibility.
    useEffect(() => {
        if (!open) return;
        const list = listRef.current;
        if (!list) return;
        const active = list.querySelector('[aria-selected="true"]') as HTMLElement | null;
        if (active && typeof active.scrollIntoView === "function") {
            active.scrollIntoView({ block: "nearest" });
        }
    }, [activeIndex, open]);

    const currentLabel = useMemo(() => {
        const opt = options.find(o => o.value === value);
        return opt?.label ?? placeholder;
    }, [options, value, placeholder]);

    return (
        <div
            className={`pp-combobox${className ? ` ${className}` : ""}`}
            onKeyDown={handleKeyDown}
            data-testid="pp-combobox"
        >
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls="pp-combobox-listbox"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className={`pp-combobox__trigger${value ? "" : " pp-combobox__trigger--empty"}`}
                data-testid="pp-combobox-trigger"
            >
                <span className="pp-combobox__trigger-label">{currentLabel}</span>
                <span className="pp-combobox__trigger-chevron" aria-hidden="true">▾</span>
            </button>

            {open && (
                <div
                    ref={popoverRef}
                    className="pp-combobox__popover"
                    role="dialog"
                    aria-label={`${ariaLabel} options`}
                    data-testid="pp-combobox-popover"
                >
                    {searchable && (
                        <div className="pp-combobox__search-wrap">
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder={`Search ${options.length} options…`}
                                className="pp-combobox__search"
                                aria-label="Filter options"
                                data-testid="pp-combobox-search"
                            />
                        </div>
                    )}
                    <ul
                        ref={listRef}
                        id="pp-combobox-listbox"
                        role="listbox"
                        aria-label={ariaLabel}
                        className="pp-combobox__list"
                        style={{ maxHeight }}
                        data-testid="pp-combobox-list"
                    >
                        {flatRendered.length === 0 && (
                            <li className="pp-combobox__empty" role="presentation">
                                No matches for "{query}"
                            </li>
                        )}
                        {(() => {
                            let flatIdx = 0;
                            return grouped.map((g, gi) => (
                                <React.Fragment key={`group-${gi}-${g.group || "ungrouped"}`}>
                                    {g.group && (
                                        <li className="pp-combobox__group-header" role="presentation">
                                            {g.group}
                                        </li>
                                    )}
                                    {g.opts.map(opt => {
                                        const myIndex = flatIdx++;
                                        const isActive = myIndex === activeIndex;
                                        const isSelected = opt.value === value;
                                        return (
                                            <li
                                                key={opt.value}
                                                role="option"
                                                aria-selected={isActive}
                                                aria-current={isSelected ? "true" : undefined}
                                                className={`pp-combobox__option${isActive ? " pp-combobox__option--active" : ""}${isSelected ? " pp-combobox__option--selected" : ""}`}
                                                onClick={() => selectByIndex(myIndex)}
                                                onMouseEnter={() => setActiveIndex(myIndex)}
                                                data-testid={`pp-combobox-option-${opt.value}`}
                                            >
                                                <div className="pp-combobox__option-label">{opt.label}</div>
                                                {opt.description && (
                                                    <div className="pp-combobox__option-desc">{opt.description}</div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </React.Fragment>
                            ));
                        })()}
                    </ul>
                </div>
            )}
        </div>
    );
}
