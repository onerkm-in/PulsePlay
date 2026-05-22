/**
 * Builds a compact, readable context summary from the Power BI data view.
 *
 * The visual sends this summary to Genie instead of raw model data so the prompt
 * stays small and explainable while still reflecting the effective report state.
 */

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;

export interface ContextSummary {
    hasSelection: boolean;
    contextText: string;
    dimensions: Record<string, PrimitiveValue[]>;
    dimensionCounts: Record<string, number>;
    measures: Record<string, number>;
}

export function buildContext(dataView: DataView | undefined, highlights: PrimitiveValue[] | null): ContextSummary {
    const summary: ContextSummary = {
        hasSelection: false,
        contextText: "",
        dimensions: {},
        dimensionCounts: {},
        measures: {},
    };

    if (!dataView?.categorical) return summary;

    const cat = dataView.categorical;

    // Capture explicit category values so Genie can describe the active slice,
    // such as Region, City, Segment, or Category.
    if (cat.categories) {
        for (const category of cat.categories) {
            const colName = category.source?.displayName ?? "Dimension";
            const values  = category.values ?? [];

            if (highlights && highlights.length > 0) {
                // When another visual highlights this visual, preserve only the
                // selected points so Genie reflects the interaction state.
                const selectedVals = values.filter((_, i) =>
                    highlights[i] !== null && highlights[i] !== undefined
                );
                if (selectedVals.length > 0) {
                    const uniqueVals = [...new Set(selectedVals)];
                    summary.dimensions[colName] = uniqueVals;
                    summary.dimensionCounts[colName] = uniqueVals.length;
                    summary.hasSelection = true;
                }
            } else {
                // Without highlights, use the visible filtered values already
                // shaped by slicers, page filters, and report filters.
                const uniqueVals = [...new Set(values.filter(v => v != null))];
                if (uniqueVals.length > 0) {
                    summary.dimensions[colName] = uniqueVals;
                    summary.dimensionCounts[colName] = uniqueVals.length;
                }
            }
        }
    }

    // Aggregate visible measures so Genie gets numeric context without requiring
    // the entire dataset payload from Power BI.
    if (cat.values) {
        for (const series of cat.values) {
            const colName = series.source?.displayName ?? "Measure";
            const vals    = (highlights && highlights.length > 0 ? highlights : series.values)
                              .filter(v => typeof v === "number") as number[];
            if (vals.length > 0) {
                const total  = vals.reduce((a, b) => a + b, 0);
                summary.measures[colName] = Math.round(total * 100) / 100;
            }
        }
    }

    // Build the final text block sent to Genie and shown in dev mode.
    const lines: string[] = ["[Power BI Context]"];

    for (const [dim, vals] of Object.entries(summary.dimensions)) {
        const totalCount = summary.dimensionCounts[dim] ?? vals.length;
        const display = vals
            .slice(0, 12)
            .map(v => String(v))
            .join(", ");
        lines.push(`- ${dim}: ${display}${totalCount > 12 ? ` (+${totalCount - 12} more)` : ""}`);
    }

    for (const [measure, total] of Object.entries(summary.measures)) {
        lines.push(`- ${measure}: ${formatNumber(total)}`);
    }

    if (lines.length === 1) {
        lines.push("(No selection - answering across full dataset)");
    }

    summary.contextText = lines.join("\n");
    return summary;
}

// This formatting is for prompt readability, not precise financial presentation.
function formatNumber(n: number): string {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(2);
}
