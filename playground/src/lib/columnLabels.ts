// playground/src/lib/columnLabels.ts
//
// Column-name humanization + per-unit value formatting for chart axes,
// legends, and tooltips. Shipped 2026-05-22 as G2 — Ask Pulse charts were
// displaying raw SQL aliases like `prev_order_count` and unformatted
// floats like `0.05747126436781609`. Sources logged in
// docs/research/EXTERNAL_REFERENCES.md (Tableau / ThoughtSpot / Looker /
// Tabular Editor / SQLBI / ONS / Datawrapper / D3 / dbt).
//
// Three-tier cascade (user-approved 2026-05-22):
//   Tier 1: TOKEN_REGISTRY — explicit dictionary of common analytics
//           tokens (deterministic, audit-friendly, zero LLM cost).
//   Tier 2: (deferred) LLM-emitted `columnLabels: { raw: friendly }` map.
//   Tier 3: Algorithmic snake_case → Title Case fallback for unknown
//           tokens (guarantees no raw `prev_order_count` ever displays).
//
// Companion: `formatValueByUnit` consumes UnitType from
// chartAutoPick.detectColumnUnit() and formats values per industry
// conventions (% for ratios, " pp" for percentage points, currency
// grouping, SI prefix on big counts).
//
// Brutal-honesty caveat: without a semantic model, we can't perfectly
// distinguish `_change` (delta) from `_change_pct` (ratio) from
// `_change_pp` (already in pp). The registry encodes all three suffix
// variants explicitly; ambiguous columns get a no-transform passthrough.

import type { UnitType } from "../visualization/chartAutoPick";

// ── Tier 1: token registry ────────────────────────────────────────────
//
// Tokens that get a specific human form. Casing is significant for
// recognized acronyms (YoY / QoQ / YTD / etc).
const TOKEN_REGISTRY: Readonly<Record<string, string>> = Object.freeze({
    // Prior-period prefixes
    prev: "Prior",
    previous: "Prior",
    prior: "Prior",
    last: "Last",
    py: "PY",                    // Prior Year — preserved as acronym
    ly: "LY",                    // Last Year
    // Current-period prefixes
    cur: "Current",
    current: "Current",
    curr: "Current",
    // Period acronyms (preserve casing)
    yoy: "YoY",
    qoq: "QoQ",
    mom: "MoM",
    wow: "WoW",
    ytd: "YTD",
    qtd: "QTD",
    mtd: "MTD",
    wtd: "WTD",
    // Statistical / aggregate
    avg: "Avg",
    average: "Average",
    med: "Median",
    median: "Median",
    mean: "Mean",
    min: "Min",
    max: "Max",
    sum: "Sum",
    total: "Total",
    cnt: "Count",
    count: "Count",
    nbr: "Number",
    num: "Number",
    qty: "Quantity",
    quantity: "Quantity",
    amt: "Amount",
    amount: "Amount",
    pct: "%",                    // Pct treated as unit suffix
    percent: "%",
    percentage: "%",
    pp: "pp",                    // Percentage points — lowercase per ONS / FT convention
    // Direction
    delta: "Δ",
    chg: "Change",
    change: "Change",
    diff: "Diff",
    growth: "Growth",
    // Common business measures (preserve full word)
    rev: "Revenue",
    revenue: "Revenue",
    sales: "Sales",
    profit: "Profit",
    cost: "Cost",
    price: "Price",
    margin: "Margin",
    discount: "Discount",
    orders: "Orders",
    order: "Order",
    customers: "Customers",
    customer: "Customer",
    units: "Units",
    rate: "Rate",
    // Common ID/key tokens (rarely shown in charts but mapped for completeness)
    id: "ID",
    uuid: "UUID",
    sku: "SKU",
    // Date / time
    dt: "Date",
    date: "Date",
    ts: "Timestamp",
    timestamp: "Timestamp",
    week: "Week",
    month: "Month",
    quarter: "Quarter",
    year: "Year",
    day: "Day",
});

// Suffix tokens that should be moved to a parenthetical when at the end
// (matches Tabular Editor's `<Metric> <Modifier> <Unit?>` pattern).
// Example: `sales_change_pct` → "Sales Change %" (pct moves to suffix).
const UNIT_SUFFIX_TOKENS = new Set(["%", "pp", "USD", "EUR", "GBP", "INR", "JPY"]);

// Prefix tokens that — when at position 0 — get moved into a parenthetical
// suffix. Example: `prev_order_count` → "Order Count (Prior)".
const PARENTHESISED_PRIOR_PREFIXES = new Set(["Prior", "Last", "PY", "LY", "Previous"]);

/**
 * Humanize a raw SQL column name into a chart-ready label.
 *
 * Examples:
 *   prev_order_count       → "Order Count (Prior)"
 *   sales_change_pct       → "Sales Change %"
 *   margin_change_pp       → "Margin Change (pp)"
 *   return_rate_change_pp  → "Return Rate Change (pp)"
 *   current_profit_margin  → "Current Profit Margin"
 *   total_sales_yoy        → "Total Sales YoY"
 *   prev_return_rate       → "Return Rate (Prior)"
 *   prev_orders            → "Orders (Prior)"
 *
 * Unknown tokens fall through to Title Case (e.g. `widget_count` →
 * "Widget Count") rather than being mangled.
 */
export function humanizeColumnName(raw: string): string {
    const input = String(raw || "").trim();
    if (!input) return "";

    // Already friendly? If the input contains a space or is mixed-case
    // without underscores, treat it as author-supplied and pass through.
    if (/\s/.test(input) || (!/_/.test(input) && /[a-z][A-Z]|^[A-Z][a-z]/.test(input))) {
        return input;
    }

    // Tokenize on snake / camelCase / digits. Lowercase each piece for
    // registry lookup; the registry preserves the canonical casing.
    const tokens = tokenize(input);
    if (!tokens.length) return input;

    // Map tokens through the registry (or Title Case fallback).
    const mapped = tokens.map(tok => TOKEN_REGISTRY[tok.toLowerCase()] ?? titleCase(tok));

    // Move trailing unit token to a suffix (e.g. "Sales Change %" or
    // "Margin Change (pp)"). Only one trailing unit gets pulled.
    let unitSuffix = "";
    if (mapped.length >= 2 && UNIT_SUFFIX_TOKENS.has(mapped[mapped.length - 1])) {
        const unit = mapped.pop()!;
        unitSuffix = unit === "%" ? " %" : ` (${unit})`;
    }

    // Move a leading prior-period token to a parenthetical suffix
    // (e.g. "Order Count (Prior)" instead of "Prior Order Count").
    let priorSuffix = "";
    if (mapped.length >= 2 && PARENTHESISED_PRIOR_PREFIXES.has(mapped[0])) {
        priorSuffix = ` (${mapped.shift()})`;
    }

    return mapped.join(" ") + priorSuffix + unitSuffix;
}

function tokenize(input: string): string[] {
    // Split on underscores, hyphens, and the camelCase boundary.
    return input
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .split(/[_\-\s]+/)
        .filter(Boolean);
}

function titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ── Value formatting per unit ─────────────────────────────────────────

/**
 * Format a numeric value for display in a chart axis label, tooltip, or
 * legend. The unit type comes from chartAutoPick.detectColumnUnit() so
 * registry + formatter stay aligned on the same column-name heuristics.
 *
 * Conventions follow D3-format mini-language + Datawrapper guidance:
 *   - currency: $83,829 (locale grouping; SI prefix above 100K on axes)
 *   - percentage from ratio: 0.057 → "5.7%"
 *   - percentage point: 1.9 → "+1.9 pp" (sign included)
 *   - count: 1,687 (locale grouping)
 *   - duration: "12 days" / "3h"
 *   - generic: rounded with locale grouping
 *
 * `kind: "axis"` triggers SI-style abbreviation for big values so labels
 * stay short (84K vs $83,829). `kind: "tooltip"` keeps full precision.
 */
export function formatValueByUnit(
    value: number,
    unit: UnitType,
    kind: "axis" | "tooltip" | "legend" = "tooltip",
    columnHint?: string,
): string {
    if (!Number.isFinite(value)) return String(value ?? "");

    const isAxis = kind === "axis";
    // Distinguish "_pp" (already in percentage points) from "_pct" (ratio).
    // detectColumnUnit() returns "percentage" for both — we need the
    // original column name to tell them apart.
    const isPercentagePoint = /\bpp\b|_pp$|_pp_/i.test(columnHint || "");

    switch (unit) {
        case "currency": {
            const abs = Math.abs(value);
            if (isAxis && abs >= 1_000_000) return signed(value, v => `$${(v / 1_000_000).toFixed(1)}M`);
            if (isAxis && abs >= 100_000) return signed(value, v => `$${(v / 1_000).toFixed(1)}K`);
            // For tooltips / legend / small values, full grouped form.
            return signed(value, v => `$${Math.round(v).toLocaleString()}`);
        }

        case "percentage": {
            // _pp values are already in percentage points; don't multiply.
            if (isPercentagePoint) {
                return signed(value, v => `${v >= 0 ? "+" : ""}${v.toFixed(1)} pp`);
            }
            // Ratio (0.057) → 5.7%. Sign included for negative.
            const pct = value * 100;
            // Honest fallback: if the column is _pct/_rate but the value
            // is already >1 (likely the LLM already multiplied), don't
            // double-multiply. The 1.5 cutoff handles values like 1.0
            // (100%) correctly while catching pre-multiplied 25.5 → 25.5%.
            const finalPct = Math.abs(value) > 1.5 ? value : pct;
            return signed(finalPct, v => `${v.toFixed(1)}%`);
        }

        case "count": {
            const abs = Math.abs(value);
            if (isAxis && abs >= 1_000_000) return signed(value, v => `${(v / 1_000_000).toFixed(1)}M`);
            if (isAxis && abs >= 10_000) return signed(value, v => `${(v / 1_000).toFixed(1)}K`);
            return signed(value, v => Math.round(v).toLocaleString());
        }

        case "duration": {
            // Hint-based: days for cycle/lead_time, hours for latency, ms otherwise.
            const lower = (columnHint || "").toLowerCase();
            if (/days|cycle|lead/.test(lower)) return signed(value, v => `${v.toFixed(1)}d`);
            if (/hours|hrs/.test(lower)) return signed(value, v => `${v.toFixed(1)}h`);
            if (/minutes|mins/.test(lower)) return signed(value, v => `${v.toFixed(0)} min`);
            if (/seconds|secs/.test(lower)) return signed(value, v => `${v.toFixed(1)}s`);
            return signed(value, v => v.toLocaleString());
        }

        case "ratio": {
            return signed(value, v => v.toFixed(2));
        }

        case "generic":
        default: {
            const abs = Math.abs(value);
            if (isAxis && abs >= 1_000_000) return signed(value, v => `${(v / 1_000_000).toFixed(1)}M`);
            if (isAxis && abs >= 10_000) return signed(value, v => `${(v / 1_000).toFixed(1)}K`);
            // Small fractions: keep 2 decimals; integers stay grouped.
            if (Number.isInteger(value)) return value.toLocaleString();
            if (abs < 1) return value.toFixed(3);
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
    }
}

function signed(value: number, formatter: (v: number) => string): string {
    // formatter receives the raw value. For negative values, the formatter
    // is expected to render with a leading minus (toLocaleString does this
    // automatically; explicit-sign cases like `${v >= 0 ? "+" : ""}` are
    // handled inside the formatter callback itself).
    return formatter(value);
}
