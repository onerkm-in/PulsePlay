// playground/src/workbench/genieResponseMapper.ts
//
// Map a Databricks Genie Conversation API message response into a
// CandidateArtifact the workbench validator can consume.
//
// The mapper NEVER fabricates citations or chart specs. It only emits
// what the upstream response actually contains. The validator (Step 4)
// then derives the authoritative artifact status. Together they enforce
// the locked "no ungrounded artifacts" contract.

import type { CandidateArtifact } from '../lib/artifactValidator';
import type {
    ArtifactCitation,
    ArtifactResultTable,
    ConnectorType,
} from '../types/assistant';

// ─────────────────────────────────────────────────────────────────────────
// Genie message shape (only the fields we read; everything else ignored)
// ─────────────────────────────────────────────────────────────────────────

export interface GenieThought {
    readonly thought_type?: string;
    readonly content?: string;
}

export interface GenieQueryResultColumn {
    readonly name: string;
    readonly type?: string;
}

export interface GenieQueryResult {
    readonly columns?: ReadonlyArray<GenieQueryResultColumn>;
    readonly data_table?: ReadonlyArray<ReadonlyArray<string | number | null>>;
    readonly row_count?: number;
}

export interface GenieQueryAttachment {
    readonly query?: string;
    readonly description?: string;
    readonly statement_id?: string;
    readonly query_result_metadata?: { readonly row_count?: number };
    readonly thoughts?: ReadonlyArray<GenieThought>;
    readonly result?: GenieQueryResult;
}

export interface GenieAttachment {
    readonly attachment_id?: string;
    readonly query?: GenieQueryAttachment;
    readonly text?: { readonly content?: string };
    readonly suggested_questions?: { readonly questions?: ReadonlyArray<string> };
}

export interface GenieMessage {
    readonly id?: string;
    readonly message_id?: string;
    readonly conversation_id?: string;
    readonly status?: string;
    readonly content?: string;
    readonly created_timestamp?: number;
    readonly last_updated_timestamp?: number;
    readonly attachments?: ReadonlyArray<GenieAttachment>;
    readonly query_result?: { readonly statement_id?: string; readonly row_count?: number };
}

export type GenieTerminalStatus = 'COMPLETED' | 'FAILED' | 'CANCELLED';
export const GENIE_TERMINAL_STATUSES: ReadonlySet<string> = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function isGenieTerminal(status: string | undefined): boolean {
    return typeof status === 'string' && GENIE_TERMINAL_STATUSES.has(status);
}

// ─────────────────────────────────────────────────────────────────────────
// Mapper
// ─────────────────────────────────────────────────────────────────────────

export interface MapGenieToCandidateInput {
    readonly message: GenieMessage;
    readonly profile: string;
    readonly connectorType?: ConnectorType; // defaults to 'genie'
}

export function mapGenieMessageToCandidate(input: MapGenieToCandidateInput): CandidateArtifact {
    const { message, profile } = input;
    const connectorType: ConnectorType = input.connectorType ?? 'genie';

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const queryAttachment = attachments.find((a) => a && a.query)?.query;
    const textAttachment = attachments.find((a) => a && a.text && typeof a.text.content === 'string');
    const textAttachmentContent = textAttachment?.text?.content;

    const answerMarkdown = typeof message.content === 'string' && message.content.trim().length > 0
        ? message.content
        : typeof textAttachmentContent === 'string' && textAttachmentContent.trim().length > 0
            ? textAttachmentContent
            : undefined;

    const sql = typeof queryAttachment?.query === 'string' && queryAttachment.query.trim().length > 0
        ? queryAttachment.query
        : undefined;

    const table = extractResultTable(queryAttachment?.result);
    const citations = buildCitations(queryAttachment, message);
    const reasoningSteps = buildReasoningSteps(queryAttachment?.thoughts);
    const rowCount = queryAttachment?.result?.row_count
        ?? queryAttachment?.query_result_metadata?.row_count
        ?? message.query_result?.row_count;
    const executionTimeMs = typeof message.created_timestamp === 'number'
        && typeof message.last_updated_timestamp === 'number'
        && message.last_updated_timestamp >= message.created_timestamp
            ? message.last_updated_timestamp - message.created_timestamp
            : undefined;
    const messageId = message.id ?? message.message_id ?? `genie-${Date.now()}`;

    const candidate: CandidateArtifact = {
        id: messageId,
        // The upstream `status` is the Genie execution state, NOT an artifact
        // status claim. We deliberately do NOT forward it as llmClaimedStatus:
        // the validator's authority covers artifact correctness, not Genie
        // execution state. (Recording the LLM claim is for cases where the
        // upstream LLM literally emits a status string in its narrative.)
        ...(answerMarkdown ? { answer: { markdown: answerMarkdown } } : {}),
        ...(table ? { table } : {}),
        ...(sql ? { sql } : {}),
        ...(citations.length > 0 ? { citations } : {}),
        ...(reasoningSteps.length > 0 ? { reasoning: { steps: reasoningSteps } } : {}),
        ...(typeof rowCount === 'number' ? { rowCount } : {}),
        ...(typeof executionTimeMs === 'number' ? { executionTimeMs } : {}),
        sourceProfile: profile,
        sourceConnectorType: connectorType,
    };

    return candidate;
}

function extractResultTable(result: GenieQueryResult | undefined): ArtifactResultTable | undefined {
    if (!result) return undefined;
    const columns = Array.isArray(result.columns) ? result.columns : [];
    const rows = Array.isArray(result.data_table) ? result.data_table : [];
    if (columns.length === 0 || rows.length === 0) return undefined;

    return {
        columns: columns.map((c) => ({
            name: typeof c.name === 'string' ? c.name : '',
            type: typeof c.type === 'string' ? c.type : 'STRING',
        })),
        rows: rows.map((row) => Array.isArray(row)
            ? row.map((cell) => normalizeCell(cell))
            : []),
    };
}

function normalizeCell(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value;
    return String(value);
}

function buildCitations(
    queryAttachment: GenieQueryAttachment | undefined,
    message: GenieMessage,
): ArtifactCitation[] {
    const citations: ArtifactCitation[] = [];
    if (queryAttachment?.query) {
        citations.push({
            kind: 'sql',
            statement: queryAttachment.query,
            ...(queryAttachment.statement_id ? { statementId: queryAttachment.statement_id } : {}),
        });
    }
    const statementId = queryAttachment?.statement_id ?? message.query_result?.statement_id;
    const rowCount = queryAttachment?.result?.row_count
        ?? queryAttachment?.query_result_metadata?.row_count
        ?? message.query_result?.row_count;
    if (statementId && typeof rowCount === 'number') {
        citations.push({ kind: 'result-rows', statementId, rowCount });
    }
    return citations;
}

const THOUGHT_LABEL: Readonly<Record<string, string>> = Object.freeze({
    THOUGHT_TYPE_DESCRIPTION: 'Intent',
    THOUGHT_TYPE_DATA_SOURCING: 'Sources',
    THOUGHT_TYPE_STEPS: 'Plan',
    THOUGHT_TYPE_SQL_PLAN: 'SQL plan',
});

function buildReasoningSteps(thoughts: ReadonlyArray<GenieThought> | undefined) {
    if (!Array.isArray(thoughts) || thoughts.length === 0) return [];
    const steps: Array<{ label: string; content: string }> = [];
    for (const t of thoughts) {
        if (!t || typeof t.content !== 'string' || t.content.trim().length === 0) continue;
        const labelKey = typeof t.thought_type === 'string' ? t.thought_type : '';
        const label = THOUGHT_LABEL[labelKey] ?? (labelKey || 'Step');
        steps.push({ label, content: t.content });
    }
    return steps;
}
