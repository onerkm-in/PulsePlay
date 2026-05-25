// playground/src/visualization/entryToEnvelope.ts
//
// FW1 — pure mapper from an UnifiedAssistantSurface completed entry into an
// AIResultEnvelope that the native BI adapter can render.
//
// What this module owns
// ─────────────────────
//   * The shape contract for the subset of UnifiedAssistantSurface entry fields the
//     mapper needs (so UnifiedAssistantSurface can call it without exposing its full
//     internal `AnswerEntry` interface).
//   * The mapping logic: prefer `messageId` as the envelope id (it's the
//     proxy-supplied stable identifier; the canvas's `data-result-id`
//     binding stays auditable to the same response that produced it);
//     fall back to `fallbackId` (typically the entry's numeric id) only
//     when the proxy returned no message_id.
//   * Schema coercion: UnifiedAssistantSurface's `queryResult.columns` is currently
//     `string[]`; this mapper widens that into `AIResultColumn[]` with
//     names only (no role inference here — that's the chart-pick
//     policy's job once it sees the rows).
//   * Cell coercion: anything outside the typed `AIResultCell` union
//     gets stringified, so the envelope is always JSON-safe.
//   * Governance pass-through: the proxy-built attestation is forwarded
//     iff it structurally validates. An invalid/missing attestation is
//     a no-op here — the native adapter's render gate decides what to
//     do with that (fail-closed in production, `ungoverned-result-preview`
//     in dev).
//
// What this module does NOT own
// ─────────────────────────────
//   * Adapter dispatch — the caller (App.tsx) decides whether the
//     runtime BI vendor is "native" and whether a primary adapter is
//     mounted.
//   * Governance policy — same as the canvas-standalone smoke and the
//     G3d native fail-closed gate, that decision lives on the adapter
//     side.
//   * Chart picking — `chartAutoPick` runs inside the canvas once the
//     envelope arrives.

import type {
    AIResultEnvelope,
    AIResultColumn,
    AIResultCell,
} from "./aiResultEnvelope";
import { isGovernanceAttestation } from "./governance";

/**
 * Minimal subset of an UnifiedAssistantSurface `AnswerEntry` the mapper needs. Keeping
 * this thin means UnifiedAssistantSurface can build the snapshot at the finalize site
 * without leaking its full internal entry type to consumers.
 */
export interface CompletedEntrySnapshot {
    /** Proxy-supplied `message_id`. When present, used as the envelope id. */
    readonly messageId?: string;
    /** Required fallback id when `messageId` is missing. */
    readonly fallbackId: string;
    readonly question?: string;
    readonly answer?: string;
    readonly sqlQuery?: string;
    readonly queryResult?: {
        readonly columns?: ReadonlyArray<string>;
        readonly rows?: ReadonlyArray<ReadonlyArray<unknown>>;
    };
    /** Raw `governance` field from the proxy response. Mapper validates
     *  shape via `isGovernanceAttestation` and forwards only if valid. */
    readonly governance?: unknown;
}

function toAIResultCell(value: unknown): AIResultCell {
    if (value === null || value === undefined) return null;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
        return value as AIResultCell;
    }
    // Anything else (Date, bigint, object, ...) gets stringified so the
    // envelope stays JSON-safe and the renderer doesn't have to defend.
    return String(value);
}

function toAIResultRow(row: ReadonlyArray<unknown>): AIResultCell[] {
    return row.map(toAIResultCell);
}

function toColumns(rawColumns: ReadonlyArray<string>): AIResultColumn[] {
    return rawColumns.map((name) => ({ name: String(name) }));
}

/**
 * Build an `AIResultEnvelope` from a completed UnifiedAssistantSurface entry snapshot.
 *
 * - `id` prefers `messageId` (the proxy-supplied stable correlation id)
 *   so the canvas's `data-result-id` binding stays auditable to the
 *   same response that produced the entry.
 * - When `queryResult` carries non-empty columns + rows, the envelope
 *   gets `schema` + `rows`. Empty arrays are dropped so downstream
 *   chart picking sees a clean "answer-only" envelope.
 * - `governance` is forwarded only if it satisfies
 *   `isGovernanceAttestation`; otherwise the field is omitted and the
 *   adapter's render gate handles the "no attestation" case.
 *
 * Pure function — no DOM, fetch, React, localStorage, or SDK imports.
 */
export function entryToAIResultEnvelope(
    snapshot: CompletedEntrySnapshot,
): AIResultEnvelope {
    const id = snapshot.messageId && snapshot.messageId.trim()
        ? snapshot.messageId
        : snapshot.fallbackId;

    const envelope: { -readonly [P in keyof AIResultEnvelope]: AIResultEnvelope[P] } = {
        id,
    };

    if (snapshot.question && snapshot.question.trim()) {
        envelope.question = snapshot.question;
    }
    if (snapshot.answer && snapshot.answer.trim()) {
        envelope.answer = snapshot.answer;
    }
    if (snapshot.sqlQuery && snapshot.sqlQuery.trim()) {
        envelope.sql = snapshot.sqlQuery;
    }

    const qr = snapshot.queryResult;
    if (
        qr
        && Array.isArray(qr.columns)
        && Array.isArray(qr.rows)
        && qr.columns.length > 0
        && qr.rows.length > 0
    ) {
        envelope.schema = toColumns(qr.columns);
        envelope.rows = qr.rows.map(toAIResultRow);
    }

    if (isGovernanceAttestation(snapshot.governance)) {
        envelope.governance = snapshot.governance;
    }

    return envelope;
}
