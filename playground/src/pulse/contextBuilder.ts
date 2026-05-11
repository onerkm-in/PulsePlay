/**
 * contextBuilder.ts
 * Converts Power BI DataView categories + highlights into a Genie context string
 */

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;

export interface FilterTarget {
    table: string;
    column: string;
}

export interface FilterDimension {
    key: string;
    displayName: string;
    values: string[];
    target?: FilterTarget;
    kind: "region" | "time" | "segment" | "dimension";
}

export interface ContextSummary {
    hasSelection: boolean;
    contextText: string;
    safeContextText: string;
    boundFieldNames: string[];
    dimensions: Record<string, PrimitiveValue[]>;
    measures: Record<string, number>;
    availableFilters: FilterDimension[];
    filterCount: number;
    dataUserRole?: string;
    dataUserId?: string;
    /**
     * Optional prefix rendered before `[Power BI Context]`. Communicates the
     * user-visible report scope (page filters, slicers, cross-filters) to
     * Genie as a non-authoritative hint. Honest labelling only — this does
     * NOT enforce RLS/OLS, which Genie cannot see through the shared PAT.
     */
    mandatoryScopeText: string;
}

/** Options controlling how much pre-aggregation the visual emits.
 *
 *  Session 56 principle (per user direction):
 *  - For single-space Genie / supervisor agent / direct connections, the
 *    upstream agent has its OWN authoritative server-side aggregation.
 *    Sending our per-row client-side aggregations can ACTIVELY MISLEAD it
 *    (e.g., the model called out "your 4.37% margin diverges from my
 *    computed 12.73%"). Default: send dimension scope + measure NAMES only,
 *    no pre-aggregated numbers.
 *  - For multi-space connector mode there is NO agent on top doing the
 *    aggregation, so the visual MUST aggregate. Caller passes
 *    `includeAggregatedMeasures: true` in that case. */
export interface BuildContextOptions {
    includeAggregatedMeasures?: boolean;
}

export function buildContext(
    dataView: DataView | undefined,
    highlights: PrimitiveValue[] | null,
    opts: BuildContextOptions = {}
): ContextSummary {
    const summary: ContextSummary = {
        hasSelection: false,
        contextText: "",
        safeContextText: "",
        boundFieldNames: [],
        dimensions: {},
        measures: {},
        availableFilters: [],
        filterCount: 0,
        mandatoryScopeText: ""
    };

    if (!dataView?.categorical) return summary;

    const cat = dataView.categorical;

    // User Role / Identity measures (bound via dedicated data roles)
    if (cat.values) {
        for (const series of cat.values) {
            if (series.source?.roles?.["userRole"] && series.values?.length) {
                const raw = series.values[0];
                if (raw != null && String(raw).trim()) {
                    summary.dataUserRole = String(raw).trim().toLowerCase();
                }
            }
            if (series.source?.roles?.["userIdentity"] && series.values?.length) {
                const raw = series.values[0];
                if (raw != null && String(raw).trim()) {
                    summary.dataUserId = safeContextText(String(raw).trim().toLowerCase());
                }
            }
        }
    }

    // Dimensions
    if (cat.categories) {
        for (const category of cat.categories) {
            const colName = category.source?.displayName ?? "Dimension";
            const values  = category.values ?? [];
            summary.boundFieldNames.push(colName);

            if (highlights && highlights.length > 0) {
                // Only capture values that have highlights (selected data points)
                const selectedVals = values.filter((_, i) =>
                    highlights[i] !== null && highlights[i] !== undefined
                );
                if (selectedVals.length > 0) {
                    summary.dimensions[colName] = [...new Set(selectedVals)];
                    summary.hasSelection = true;
                }
            } else {
                // All visible values (respects slicer/filters already applied)
                const uniqueVals = [...new Set(values.filter(v => v != null))];
                if (uniqueVals.length > 0 && uniqueVals.length <= 20) {
                    summary.dimensions[colName] = uniqueVals;
                }
            }

            const filterValues = [...new Set(values.filter(v => v != null))]
                .map(value => String(value))
                .slice(0, 25);
            if (filterValues.length > 0) {
                summary.availableFilters.push({
                    key: normalizeKey(category.source?.queryName ?? colName),
                    displayName: colName,
                    values: filterValues,
                    target: parseFilterTarget(category.source?.queryName),
                    kind: detectDimensionKind(colName)
                });
            }
        }
    }

    // Measures — Session 56 watchdog fix.
    // We send the LLM enough metadata to make its own aggregation /
    // formatting decisions instead of pre-computing a single scalar that
    // strips context. For each measure we now track:
    //   - aggregation hint (sum vs average) based on a name heuristic
    //   - row count (how many data points contributed)
    //   - sample range (min / max) so the model can sanity-check
    // The actual scalar value still goes into summary.measures (back-compat
    // with downstream code), but the prompt line below is now richer.
    const RATIO_NAME_RE = /(margin|rate|ratio|%|percent|days\s*to|avg|average|mean)/i;
    const ratioNames = new Set<string>();
    const measureRange: Record<string, { count: number; min: number; max: number }> = {};
    if (cat.values) {
        for (const series of cat.values) {
            const colName = series.source?.displayName ?? "Measure";
            summary.boundFieldNames.push(colName);
            const vals = ((highlights && highlights.length > 0 ? highlights : series.values) ?? [])
                              .filter(v => typeof v === "number") as number[];
            if (vals.length > 0) {
                const isRatio = RATIO_NAME_RE.test(colName);
                if (isRatio) ratioNames.add(colName);
                const aggregated = isRatio
                    ? vals.reduce((a, b) => a + b, 0) / vals.length
                    : vals.reduce((a, b) => a + b, 0);
                summary.measures[colName] = Math.round(aggregated * 100) / 100;
                measureRange[colName] = {
                    count: vals.length,
                    min: Math.min(...vals),
                    max: Math.max(...vals),
                };
            }
        }
    }

    // Build human-readable context string
    const lines: string[] = ["[Power BI Context]"];

    // Cycle 47.11 — duplication fix. `buildMandatoryScope` (called below
    // for the prefixed ACTIVE FILTERS block) already lists every bound
    // dimension with its values. Repeating them here meant every Genie
    // stage prompt carried the same `region: A, B, C` / `category: ...`
    // lines TWICE (once under "## ACTIVE FILTERS", again under "[Power
    // BI Context]"). Pure prompt-budget waste. When the mandatory-scope
    // block will cover the dimensions, skip them here and let the
    // bound-measures line carry the [Power BI Context] block alone.
    const dimensionsCount = Object.keys(summary.dimensions).length;
    const willEmitMandatoryScope = dimensionsCount > 0;
    if (!willEmitMandatoryScope) {
        for (const [dim, vals] of Object.entries(summary.dimensions)) {
            const display = vals
                .slice(0, 5)
                .map(v => String(v))
                .join(", ");
            lines.push(`- ${dim}: ${display}${vals.length > 5 ? ` (+${vals.length - 5} more)` : ""}`);
        }
    }

    if (opts.includeAggregatedMeasures) {
        // MULTI-SPACE mode: visual must aggregate (no upstream agent).
        // Emit aggregation hint + range so downstream consumers know what
        // to do with the numbers.
        for (const [measure, total] of Object.entries(summary.measures)) {
            const isRatio = ratioNames.has(measure);
            const range = measureRange[measure];
            if (isRatio && range) {
                const pct = total > -1 && total < 1 ? ` (≈${(total * 100).toFixed(2)}%)` : "";
                lines.push(`- ${measure}: ${formatNumber(total)}${pct} [avg of ${range.count} rows; per-row range ${formatNumber(range.min)}…${formatNumber(range.max)}]`);
            } else if (range && range.count > 1) {
                lines.push(`- ${measure}: ${formatNumber(total)} [sum across ${range.count} rows]`);
            } else {
                lines.push(`- ${measure}: ${formatNumber(total)}`);
            }
        }
    } else {
        // DEFAULT (single-space Genie / supervisor / direct): respect the
        // upstream agent's authoritative server-side aggregation. Emit ONLY
        // measure names so the agent can run its own SQL and report the
        // correct values. Sending pre-aggregated numbers from per-row data
        // misleads the model (per user direction Session 56).
        const measureNames = Object.keys(summary.measures);
        if (measureNames.length > 0) {
            lines.push(`- Bound measures (server-side aggregation): ${measureNames.join(", ")}`);
        }
    }

    // Cycle 47.11 — only emit the "(No selection)" fallback when there
    // is genuinely nothing scoped. If `willEmitMandatoryScope` is true,
    // the prefixed ACTIVE FILTERS block carries the dimension list above
    // even though the [Power BI Context] body is now sparse — the user
    // DID make a selection, just one we already documented.
    if (lines.length === 1 && !willEmitMandatoryScope) {
        lines.push("(No selection - answering across full dataset)");
    }

    summary.filterCount = Object.keys(summary.dimensions).length;
    summary.mandatoryScopeText = buildMandatoryScope(summary.dimensions);
    summary.contextText = [summary.mandatoryScopeText, lines.join("\n")]
        .filter(Boolean)
        .join("\n\n");
    summary.safeContextText = safeContextText(summary.contextText);
    summary.boundFieldNames = Array.from(new Set(summary.boundFieldNames));
    return summary;
}

/**
 * Renders the ACTIVE FILTERS block that prefixes the Power BI context.
 *
 * Intent: give Genie an explicit, human-readable list of the dimensional
 * scope the report author has applied (page filters, slicers, cross-filters,
 * and any RLS-pre-filtered categories that reach the DataView). This is a
 * *prompt hint*, not an enforcement mechanism — Genie's runtime API accepts
 * no filter field, and the shared PAT bypasses RLS/OLS. Callers that need
 * airtight enforcement must use Unity Catalog row filters + OAuth OBO.
 *
 * Exported for unit testing.
 */
export function buildMandatoryScope(dimensions: Record<string, PrimitiveValue[]>): string {
    const entries = Object.entries(dimensions);
    if (entries.length === 0) return "";

    const out: string[] = ["## ACTIVE FILTERS (MANDATORY SCOPE)"];
    out.push("The Power BI report is currently filtered to the following scope.");
    out.push("Constrain your answer to this scope unless the user explicitly asks otherwise.");
    for (const [dim, vals] of entries) {
        const display = vals
            .slice(0, 10)
            .map(v => String(v))
            .join(", ");
        const suffix = vals.length > 10 ? ` (+${vals.length - 10} more)` : "";
        out.push(`- ${dim}: ${display}${suffix}`);
    }
    return out.join("\n");
}

/**
 * Describes the data-governance controls the report author has declared in
 * the Security Posture settings group. The visual does NOT enforce these —
 * they are assertions about what's in place downstream (Unity Catalog row
 * filters, column masks, OAuth on-behalf-of). Emitting them as a prompt
 * block lets Genie acknowledge the constraint in its narrative and avoids
 * it making claims that would obviously violate the declared posture.
 *
 * Returns an empty string when nothing is declared, so callers can safely
 * concatenate without whitespace fiddling.
 *
 * Exported for unit testing.
 */
export interface GovernancePostureInput {
    ucRowFiltersEnforced: boolean;
    ucColumnMasksEnforced: boolean;
    authMode: "sharedPat" | "oauthObo";
}

export function buildGovernancePosture(input: GovernancePostureInput): string {
    const { ucRowFiltersEnforced, ucColumnMasksEnforced, authMode } = input;
    if (!ucRowFiltersEnforced && !ucColumnMasksEnforced && authMode === "sharedPat") {
        return "";
    }

    const lines: string[] = ["## DATA GOVERNANCE POSTURE"];
    lines.push(
        "The report author has declared the following governance controls. Respect them when answering."
    );

    if (authMode === "oauthObo") {
        lines.push(
            "- Authentication: OAuth on-behalf-of. This request carries the end user's identity; Unity Catalog policies apply per user."
        );
    } else {
        lines.push(
            "- Authentication: shared service identity (PAT). Power BI RLS/OLS do not flow to this query."
        );
    }

    if (ucRowFiltersEnforced) {
        lines.push(
            "- Unity Catalog ROW FILTERS are enforced on the underlying tables. Do not claim to see rows the current user is not permitted to see."
        );
    }
    if (ucColumnMasksEnforced) {
        lines.push(
            "- Unity Catalog COLUMN MASKS are enforced. Treat redacted or null values for restricted columns as expected, not as data quality gaps."
        );
    }

    return lines.join("\n");
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// Stricter phone pattern: requires either a leading '+' (international),
// a parenthesized area code, or a standard US/intl prefix pattern.
// Avoids matching generic long digit runs like "1 2 3 4 5 6 7 8 9".
const PHONE_PATTERN = /(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\d{3}[\s.-]\d{3}[\s.-]\d{4}|\+\d{7,15})(?!\w)/g;

export function redactPII(value: string): string {
    return value
        .replace(EMAIL_PATTERN, "[redacted-email]")
        .replace(PHONE_PATTERN, "[redacted-phone]");
}

export function safeContextText(value: string): string {
    return redactPII(value);
}

function formatNumber(n: number): string {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(2);
}

function parseFilterTarget(queryName: string | undefined): FilterTarget | undefined {
    if (!queryName) {
        return undefined;
    }

    const cleaned = queryName
        .replace(/\]\.\[/g, ".")
        .replace(/\[|\]/g, "");
    const parts = cleaned
        .split(".")
        .map(part => part.trim())
        .filter(Boolean);
    if (parts.length < 2) {
        return undefined;
    }

    return {
        table: parts[parts.length - 2],
        column: parts[parts.length - 1]
    };
}

function detectDimensionKind(name: string): FilterDimension["kind"] {
    const normalized = name.toLowerCase();
    if (/(region|country|market|territory|area|state)/i.test(normalized)) {
        return "region";
    }
    if (/(year|quarter|month|week|date|time|fiscal)/i.test(normalized)) {
        return "time";
    }
    if (/(segment|channel|product|category|sku|customer|group)/i.test(normalized)) {
        return "segment";
    }
    return "dimension";
}

function normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
