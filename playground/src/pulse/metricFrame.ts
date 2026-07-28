// playground/src/pulse/metricFrame.ts
//
// One deterministic metric frame: current, prior and delta for each measure,
// computed ONCE in code from the executed query rows, formatted ONCE, and then
// narrated verbatim by every insights section.
//
// Why this exists. HEADLINE and KPI SNAPSHOT are two separate Genie messages
// with two separate SQL executions, and each was doing its own arithmetic in
// prose. On the live SCM run they disagreed about the same figures: the brief
// said "4.3%" growth and "a gain of 0.46 %", the KPI table said "+4.29 %" and
// "(+0.45 %)". Against the real rows the true values were +4.2524% and
// +0.4530 — so "+4.29 %" was simply wrong, and "0.46" was the artefact of
// subtracting two already-rounded displays. Numbers a reader compares across
// two cards must come from one computation, not two narrations.
//
// The two calls are deliberately NOT merged: the split is what keeps first
// paint fast (visualHelpers.ts, "HEADLINE alone is the lead"). Instead the
// frame travels from the lead stage into the prompts of every later stage as
// authoritative pre-computed text.
//
// Deliberately conservative: this returns an empty frame rather than guessing.
// An empty frame degrades to exactly the previous behaviour (each section
// narrates its own numbers), which is wrong-ish but not broken; a guessed frame
// would be confidently wrong, which is worse.

/** One measure's movement, in raw unrounded numbers. */
export interface MetricFrameRow {
    /** Measure label exactly as the query returned it. */
    key: string;
    current: number;
    prior: number;
    /** current - prior. For a ratio measure this is a percentage-point move. */
    absDelta: number;
    /** (current - prior) / |prior|, as a fraction. NaN when prior is 0. */
    relDelta: number;
    /** Ratio measures (margin, rate, %) report their absolute move, not a
     *  relative one — a "4% rise in a 55% margin" is ambiguous, the move from
     *  55.14 to 55.60 is not. */
    isRatio: boolean;
    currentPeriod: string;
    priorPeriod: string;
}

/** The same movement, formatted once to the project number convention. */
export interface MetricFrameText {
    key: string;
    currentText: string;
    priorText: string;
    deltaText: string;
}

export interface QueryResultLike {
    columns?: string[];
    rows?: unknown[][];
}

const RATIO_RE = /margin|rate|pct|percent|share|ratio|%/i;
const CURRENCY_RE = /sales|revenue|cost|cogs|profit|spend|usd|amount|value/i;
const PERIOD_HEADER_RE = /^(period|month|quarter|year|date|timeframe|time)$/i;
const METRIC_HEADER_RE = /^(metric|measure|kpi|name|indicator)$/i;
const VALUE_HEADER_RE = /^(value|amount|result|figure)$/i;

/** Parse a cell that may arrive as a number or as a string in scientific
 *  notation — Genie returns `data_table` values as strings ("1.8953E9"). */
function toNumber(cell: unknown): number {
    if (typeof cell === "number") return Number.isFinite(cell) ? cell : NaN;
    if (typeof cell !== "string") return NaN;
    const cleaned = cell.trim().replace(/[$€£₹¥,\s]/g, "").replace(/%$/, "");
    if (!cleaned) return NaN;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
}

/** Rank a period label so "current" and "prior" can be told apart without
 *  assuming row order. Uses the 4-digit year, then any trailing number. */
function periodRank(label: string): number {
    const year = /\b(19|20)\d{2}\b/.exec(label);
    if (year) return Number(year[0]);
    const n = /\d+/.exec(label);
    return n ? Number(n[0]) : NaN;
}

/**
 * Build the frame from a TALL result: one label column, one period column, one
 * numeric column, one row per (measure, period).
 *
 * Tall is what the lead stage asks for by construction, and it is what the live
 * SCM space returns:
 *   columns ["Metric","Period","Value"]
 *   rows    [["Net Sales USD","Jan-Jun 2025","1.8953528300799997E9"], ...]
 *
 * A wide shape (paired current_/prior_ columns) is NOT handled: it has never
 * been observed from this path, and inventing a parser for an unobserved shape
 * is how a function ends up silently returning nothing in production.
 */
export function buildMetricFrame(qr: QueryResultLike | null | undefined): MetricFrameRow[] {
    const columns = qr?.columns;
    const rows = qr?.rows;
    if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length < 2) return [];

    // Locate the three roles: prefer the conventional headers, otherwise infer
    // from content (a period column's cells carry years; the value column parses
    // as numbers throughout).
    let metricIdx = columns.findIndex(c => METRIC_HEADER_RE.test(String(c ?? "").trim()));
    let periodIdx = columns.findIndex(c => PERIOD_HEADER_RE.test(String(c ?? "").trim()));
    let valueIdx = columns.findIndex(c => VALUE_HEADER_RE.test(String(c ?? "").trim()));

    if (valueIdx < 0) {
        valueIdx = columns.findIndex((_c, i) => rows.every(r => !Number.isNaN(toNumber(r?.[i]))));
    }
    if (periodIdx < 0) {
        periodIdx = columns.findIndex((_c, i) =>
            i !== valueIdx && rows.every(r => !Number.isNaN(periodRank(String(r?.[i] ?? "")))));
    }
    if (metricIdx < 0) {
        metricIdx = columns.findIndex((_c, i) => i !== valueIdx && i !== periodIdx);
    }
    if (metricIdx < 0 || periodIdx < 0 || valueIdx < 0) return [];
    if (metricIdx === periodIdx || metricIdx === valueIdx || periodIdx === valueIdx) return [];

    // Group by measure, keeping the two most recent distinct periods.
    const byMetric = new Map<string, Map<string, number>>();
    for (const r of rows) {
        const key = String(r?.[metricIdx] ?? "").trim();
        const period = String(r?.[periodIdx] ?? "").trim();
        const value = toNumber(r?.[valueIdx]);
        if (!key || !period || Number.isNaN(value)) continue;
        if (!byMetric.has(key)) byMetric.set(key, new Map());
        byMetric.get(key)!.set(period, value);
    }

    const out: MetricFrameRow[] = [];
    for (const [key, periods] of byMetric) {
        if (periods.size < 2) continue;
        const ordered = [...periods.keys()].sort((a, b) => {
            const ra = periodRank(a), rb = periodRank(b);
            if (Number.isNaN(ra) || Number.isNaN(rb)) return a.localeCompare(b);
            return ra - rb;
        });
        const priorPeriod = ordered[ordered.length - 2];
        const currentPeriod = ordered[ordered.length - 1];
        const prior = periods.get(priorPeriod)!;
        const current = periods.get(currentPeriod)!;
        out.push({
            key,
            current,
            prior,
            absDelta: current - prior,
            relDelta: prior === 0 ? NaN : (current - prior) / Math.abs(prior),
            isRatio: RATIO_RE.test(key),
            currentPeriod,
            priorPeriod,
        });
    }
    return out;
}

/** Project number convention (also stated to the model as domain guidance):
 *  Roman scale M = thousand, MN = million, B = billion; exactly 2 decimals;
 *  the mantissa never carries a thousands separator — a comma means the unit
 *  should have been promoted. */
export function formatMagnitude(value: number, currency: boolean): string {
    if (!Number.isFinite(value)) return "n/a";
    const sign = value < 0 ? "-" : "";
    const v = Math.abs(value);
    const sym = currency ? "$" : "";
    if (v >= 1e9) return `${sign}${sym}${(v / 1e9).toFixed(2)} B`;
    if (v >= 1e6) return `${sign}${sym}${(v / 1e6).toFixed(2)} MN`;
    if (v >= 1e3) return `${sign}${sym}${(v / 1e3).toFixed(2)} M`;
    return `${sign}${sym}${v.toFixed(2)}`;
}

function signed(value: number, suffix: string): string {
    if (!Number.isFinite(value)) return "n/a";
    return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)} ${suffix}`;
}

/** Format every row once. Percentage-metric changes carry "%" and never a "pp"
 *  suffix — that is this project's stated convention, not a taste call. */
export function formatMetricFrame(rows: MetricFrameRow[]): MetricFrameText[] {
    return rows.map(r => {
        if (r.isRatio) {
            return {
                key: r.key,
                currentText: `${r.current.toFixed(2)} %`,
                priorText: `${r.prior.toFixed(2)} %`,
                deltaText: signed(r.absDelta, "%"),
            };
        }
        const currency = CURRENCY_RE.test(r.key);
        return {
            key: r.key,
            currentText: formatMagnitude(r.current, currency),
            priorText: formatMagnitude(r.prior, currency),
            deltaText: Number.isFinite(r.relDelta)
                ? `${formatMagnitude(r.absDelta, currency)} (${signed(r.relDelta * 100, "%")})`
                : formatMagnitude(r.absDelta, currency),
        };
    });
}

/**
 * The literal block spliced into every later stage's prompt. Empty string when
 * the frame could not be built, so callers can strip the anchor entirely rather
 * than send the model an empty promise of authoritative numbers.
 */
export function renderMetricFrameBlock(rows: MetricFrameRow[]): string {
    if (!rows.length) return "";
    const text = formatMetricFrame(rows);
    const lines = [
        "PRE-COMPUTED METRIC FRAME (authoritative). Every value below was computed in code from the executed query rows.",
        "Narrate these EXACT strings. Do NOT recompute, do NOT re-round, and NEVER derive a change by subtracting two displayed values.",
        "",
        "| Metric | Current | Prior | Change |",
        "| --- | --- | --- | --- |",
    ];
    rows.forEach((r, i) => {
        lines.push(`| ${r.key} | ${text[i].currentText} | ${text[i].priorText} | ${text[i].deltaText} |`);
    });
    const basis = rows[0];
    lines.push("", `Period basis: ${basis.currentPeriod} vs ${basis.priorPeriod}.`);
    return lines.join("\n");
}
