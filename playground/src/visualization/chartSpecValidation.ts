// playground/src/visualization/chartSpecValidation.ts
//
// G2 - small, serializable ChartRenderSpec validation. This is deliberately
// Vega-Lite-ish rather than a full Vega-Lite runtime dependency.

import type { ChartKind } from "./chartAutoPick";

export type VegaLiteMark = "bar" | "line" | "area" | "point" | "arc" | "rect";

export interface VegaLiteEncodingField {
    readonly field?: string;
    readonly type?: string;
    readonly aggregate?: string;
}

export interface VegaLiteChartSpec {
    readonly mark: VegaLiteMark | { readonly type: VegaLiteMark };
    readonly data?: {
        readonly values?: ReadonlyArray<Readonly<Record<string, unknown>>>;
    };
    readonly encoding?: {
        readonly x?: VegaLiteEncodingField;
        readonly y?: VegaLiteEncodingField;
        readonly color?: VegaLiteEncodingField;
    };
    readonly title?: string;
}

export interface ChartRenderSpec extends VegaLiteChartSpec {
    readonly version?: "chart-render-spec/v0";
    readonly renderer?: "echarts" | "vega-lite";
    readonly chartType?: ChartKind;
    readonly dataCitation?: string;
}

export interface ChartSpecValidationError {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}

export type ChartSpecValidationResult =
    | { readonly ok: true; readonly spec: ChartRenderSpec }
    | { readonly ok: false; readonly errors: ReadonlyArray<ChartSpecValidationError> };

const ALLOWED_MARKS: ReadonlySet<string> = new Set(["bar", "line", "area", "point", "arc", "rect"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function markType(mark: unknown): string | undefined {
    if (typeof mark === "string") return mark;
    if (isPlainObject(mark) && typeof mark.type === "string") return mark.type;
    return undefined;
}

function err(path: string, code: string, message: string): ChartSpecValidationError {
    return { path, code, message };
}

export function validateChartRenderSpec(value: unknown): ChartSpecValidationResult {
    const errors: ChartSpecValidationError[] = [];
    if (!isPlainObject(value)) {
        return { ok: false, errors: [err("$", "not-object", "ChartRenderSpec must be an object.")] };
    }

    const mark = markType(value.mark);
    if (!mark) {
        errors.push(err("$.mark", "missing-mark", "Spec must define mark as a string or { type }."));
    } else if (!ALLOWED_MARKS.has(mark)) {
        errors.push(err("$.mark", "unsupported-mark", `Mark "${mark}" is not supported by the portable renderer contract.`));
    }

    const data = value.data;
    if (!isPlainObject(data)) {
        errors.push(err("$.data", "missing-data", "Spec must define data.values with inline rows."));
    } else {
        if ("url" in data) {
            errors.push(err("$.data.url", "external-data-url", "External data URLs are not allowed in portable chart specs."));
        }
        if (!Array.isArray(data.values) || data.values.length === 0) {
            errors.push(err("$.data.values", "missing-values", "Spec must include at least one inline data row."));
        } else if (!data.values.every(isPlainObject)) {
            errors.push(err("$.data.values", "invalid-row", "Every data.values row must be an object."));
        }
    }

    const encoding = value.encoding;
    if (!isPlainObject(encoding)) {
        errors.push(err("$.encoding", "missing-encoding", "Spec must define encoding.x.field and encoding.y.field."));
    } else {
        const x = encoding.x;
        const y = encoding.y;
        if (!isPlainObject(x) || typeof x.field !== "string" || x.field.length === 0) {
            errors.push(err("$.encoding.x.field", "missing-x-field", "Spec must define encoding.x.field."));
        }
        if (!isPlainObject(y) || typeof y.field !== "string" || y.field.length === 0) {
            errors.push(err("$.encoding.y.field", "missing-y-field", "Spec must define encoding.y.field."));
        }
    }

    if (value.title !== undefined && typeof value.title !== "string") {
        errors.push(err("$.title", "invalid-title", "Spec title must be a string when present."));
    }
    if (value.dataCitation !== undefined && typeof value.dataCitation !== "string") {
        errors.push(err("$.dataCitation", "invalid-data-citation", "Spec dataCitation must be a string when present."));
    }

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, spec: value as unknown as ChartRenderSpec };
}
