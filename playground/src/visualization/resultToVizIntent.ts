// playground/src/visualization/resultToVizIntent.ts
//
// G2 - decide what visual surface an AI result wants before any renderer
// sees it. Pure policy only; no charts are rendered here.

import { chartAutoPick, type ChartKind } from "./chartAutoPick";
import { isAIResultEnvelope, type AIResultEnvelope } from "./aiResultEnvelope";

export type VizIntentKind = "empty" | "text" | "table" | "chart" | "kpi";

export interface VizIntent {
    readonly kind: VizIntentKind;
    readonly chartType?: ChartKind;
    readonly reason: string;
    readonly rowCount: number;
    readonly columnCount: number;
}

export function resultToVizIntent(envelope: AIResultEnvelope): VizIntent {
    if (!isAIResultEnvelope(envelope)) {
        return { kind: "empty", reason: "invalid-envelope", rowCount: 0, columnCount: 0 };
    }

    const rows = envelope.rows ?? [];
    const schema = envelope.schema ?? [];
    const rowCount = rows.length;
    const columnCount = schema.length;

    if (rowCount === 0 || columnCount === 0) {
        if (envelope.answer && envelope.answer.trim().length > 0) {
            return { kind: "text", reason: "answer-without-rows", rowCount, columnCount };
        }
        return { kind: "empty", reason: "no-renderable-content", rowCount, columnCount };
    }

    const columns = schema.map(col => col.name);
    const pick = chartAutoPick(columns, rows);

    if (pick.dataShape.numericColCount === 0) {
        return { kind: "table", reason: "no-numeric-series", rowCount, columnCount };
    }

    if (rowCount === 1 && pick.dataShape.numericColCount === 1) {
        return { kind: "kpi", chartType: "kpi", reason: "single-row-single-measure", rowCount, columnCount };
    }

    return {
        kind: "chart",
        chartType: pick.chartType,
        reason: pick.reason,
        rowCount,
        columnCount,
    };
}
