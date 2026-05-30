// playground/src/lib/problemDetails.ts
//
// Minimal RFC 9457 Problem Details helper for in-app problem objects.
// Mirrors the proxy-side helper in proxy/lib/problemDetails.js. The frontend
// uses this to represent validator-emitted `blocked` artifacts in a shape
// the rest of the app can reason about consistently with proxy errors.
//
// See: docs/ERROR_HANDLING_STRATEGY.md

export interface ProblemDetails {
    /** Stable URI-shaped problem identifier. */
    readonly type: string;
    /** Short, human-readable summary. */
    readonly title: string;
    /** Specific human-readable explanation of THIS occurrence. */
    readonly detail: string;
    /** HTTP-style status code; 422 is the workbench-internal convention for validator blocks. */
    readonly status: number;
    /** PulsePlay-specific category, mirrors the proxy taxonomy. */
    readonly category: string;
    /** Optional support code joining UI + logs. */
    readonly supportCode?: string;
    /** Free-form structured context. */
    readonly extensions?: Readonly<Record<string, unknown>>;
}

export const WORKBENCH_PROBLEM_TYPE_PREFIX = 'https://pulseplay.local/problems/workbench/';

export function workbenchProblem(input: {
    code: string;
    title: string;
    detail: string;
    category?: string;
    status?: number;
    supportCode?: string;
    extensions?: Record<string, unknown>;
}): ProblemDetails {
    return {
        type: `${WORKBENCH_PROBLEM_TYPE_PREFIX}${input.code}`,
        title: input.title,
        detail: input.detail,
        status: input.status ?? 422,
        category: input.category ?? 'workbench.validation',
        ...(input.supportCode ? { supportCode: input.supportCode } : {}),
        ...(input.extensions ? { extensions: Object.freeze({ ...input.extensions }) } : {}),
    };
}
