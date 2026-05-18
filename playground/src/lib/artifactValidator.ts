// playground/src/lib/artifactValidator.ts
//
// Step 4 — Artifact validation gate.
//
// Hard rule (locked in docs/UNIFIED_ASK_PULSE_WORKBENCH.md):
//   The artifact status is emitted by THIS validator, NEVER by the LLM.
//   `CandidateArtifact.llmClaimedStatus` exists so we can RECORD what the
//   LLM tried to claim, but it is intentionally never read for the
//   authoritative status. Tests pin this.
//
// The validator also strips a small set of HTML injection vectors from
// markdown payloads at the boundary, because the AnswerTab paragraph-
// splits and renders the text as React children — which would still
// reject `<script>` but is defense in depth.

import type {
    ArtifactCitation,
    ArtifactResultTable,
    ArtifactStatus,
    ChartSpec,
    ConnectorType,
    MarkdownPayload,
    ReasoningTrace,
    WorkbenchArtifact,
    WorkbenchTab,
} from '../types/assistant';
import { workbenchProblem, type ProblemDetails } from './problemDetails';

// ─────────────────────────────────────────────────────────────────────────
// Candidate input shape
// ─────────────────────────────────────────────────────────────────────────

export interface CandidateArtifact {
    readonly id: string;
    /**
     * The status the LLM (or upstream) CLAIMED. Intentionally separated
     * from the validator-emitted status. NEVER consulted for the
     * authoritative status — see tests.
     */
    readonly llmClaimedStatus?: ArtifactStatus;
    readonly answer?: MarkdownPayload;
    readonly chart?: ChartSpec;
    readonly table?: ArtifactResultTable;
    readonly sql?: string;
    readonly citations?: ReadonlyArray<ArtifactCitation>;
    readonly reasoning?: ReasoningTrace;
    readonly executionTimeMs?: number;
    readonly rowCount?: number;
    readonly sourceProfile?: string;
    readonly sourceConnectorType?: ConnectorType;
}

// ─────────────────────────────────────────────────────────────────────────
// Result shape
// ─────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
    readonly artifact: WorkbenchArtifact;
    /** Present when status is `blocked`. Use to populate UI status reason + diagnostic logs. */
    readonly problem?: ProblemDetails;
    /** True when llmClaimedStatus differed from the emitted authoritative status. */
    readonly overrodeLlmStatus: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Grounding classification
// ─────────────────────────────────────────────────────────────────────────

/**
 * Citation kinds that are sufficient evidence for a `chart` or `table`
 * payload to be considered grounded. `pack` (knowledge) is intentionally
 * NOT sufficient — a chart needs data, not knowledge of charts.
 */
const DATA_BEARING_CITATION_KINDS: ReadonlySet<ArtifactCitation['kind']> = new Set<ArtifactCitation['kind']>([
    'sql',
    'dax',
    'result-rows',
    'vendor',
    'vector',
]);

function hasDataBearingCitation(citations: ReadonlyArray<ArtifactCitation> | undefined): boolean {
    if (!citations || citations.length === 0) return false;
    return citations.some((c) => DATA_BEARING_CITATION_KINDS.has(c.kind));
}

function hasAnyCitation(citations: ReadonlyArray<ArtifactCitation> | undefined): boolean {
    return !!citations && citations.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Markdown sanitization (defense in depth)
// ─────────────────────────────────────────────────────────────────────────

const MARKDOWN_INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
    /<script[\s\S]*?<\/script>/gi,
    /<iframe[\s\S]*?<\/iframe>/gi,
    /\son\w+\s*=\s*"[^"]*"/gi,
    /\son\w+\s*=\s*'[^']*'/gi,
    /javascript:/gi,
];

export function sanitizeMarkdown(payload: MarkdownPayload | undefined): MarkdownPayload | undefined {
    if (!payload) return undefined;
    let md = payload.markdown;
    for (const pattern of MARKDOWN_INJECTION_PATTERNS) {
        md = md.replace(pattern, '');
    }
    return { markdown: md };
}

// ─────────────────────────────────────────────────────────────────────────
// Tab derivation
// ─────────────────────────────────────────────────────────────────────────

function deriveTabs(input: {
    answer?: MarkdownPayload;
    chart?: ChartSpec;
    table?: ArtifactResultTable;
    sql?: string;
    citations?: ReadonlyArray<ArtifactCitation>;
    reasoning?: ReasoningTrace;
    chartBlocked: boolean;
    tableBlocked: boolean;
}): WorkbenchTab[] {
    const tabs: WorkbenchTab[] = [];
    if (input.answer && input.answer.markdown.trim().length > 0) tabs.push('answer');
    if (input.chart && !input.chartBlocked) tabs.push('chart');
    if (input.table && input.table.rows.length > 0 && !input.tableBlocked) tabs.push('table');
    if (input.sql && input.sql.trim().length > 0) tabs.push('sql');
    if (input.citations && input.citations.length > 0) tabs.push('evidence');
    if (input.reasoning && input.reasoning.steps.length > 0) tabs.push('reasoning');
    return tabs;
}

// ─────────────────────────────────────────────────────────────────────────
// validateArtifact
// ─────────────────────────────────────────────────────────────────────────

export function validateArtifact(candidate: CandidateArtifact): ValidationResult {
    const sanitizedAnswer = sanitizeMarkdown(candidate.answer);
    const hasChart = !!candidate.chart;
    const hasTable = !!candidate.table && candidate.table.rows.length > 0;
    const hasAnswer = !!sanitizedAnswer && sanitizedAnswer.markdown.trim().length > 0;
    const hasSql = !!candidate.sql && candidate.sql.trim().length > 0;
    const hasReasoning = !!candidate.reasoning && candidate.reasoning.steps.length > 0;
    const grounded = hasDataBearingCitation(candidate.citations);
    const anyCitation = hasAnyCitation(candidate.citations);

    // Empty artifact — block.
    if (!hasChart && !hasTable && !hasAnswer && !hasSql && !hasReasoning && !anyCitation) {
        const problem = workbenchProblem({
            code: 'empty-artifact',
            title: 'No artifact content',
            detail: 'The candidate artifact had no answer, chart, table, SQL, evidence, or reasoning to render.',
            extensions: { artifactId: candidate.id },
        });
        return finalize(candidate, sanitizedAnswer, 'blocked', problem, problem.detail, /*chartBlocked*/ false, /*tableBlocked*/ false);
    }

    // Chart / table without data — block.
    const chartBlocked = hasChart && !grounded;
    const tableBlocked = hasTable && !grounded;
    if (chartBlocked || tableBlocked) {
        const which = chartBlocked && tableBlocked ? 'chart and table' : chartBlocked ? 'chart' : 'table';
        const problem = workbenchProblem({
            code: 'ungrounded-data-payload',
            title: 'Ungrounded data payload',
            detail: `The candidate artifact attempted to render a ${which} without a data-bearing citation (sql, dax, result-rows, vendor, or vector).`,
            extensions: {
                artifactId: candidate.id,
                blockedTabs: [chartBlocked ? 'chart' : null, tableBlocked ? 'table' : null].filter(Boolean),
            },
        });
        return finalize(candidate, sanitizedAnswer, 'blocked', problem, problem.detail, chartBlocked, tableBlocked);
    }

    // Authoritative status derivation.
    let status: ArtifactStatus;
    if (hasChart || hasTable || hasSql) {
        // We have a structured payload AND survived the grounding check above.
        status = 'verified';
    } else if (grounded || anyCitation) {
        // Answer with at least some citation backing.
        status = 'grounded-draft';
    } else {
        // Answer-only, no citations.
        status = 'suggestion';
    }

    return finalize(candidate, sanitizedAnswer, status, undefined, undefined, /*chartBlocked*/ false, /*tableBlocked*/ false);
}

// ─────────────────────────────────────────────────────────────────────────
// Finalization helper
// ─────────────────────────────────────────────────────────────────────────

function finalize(
    candidate: CandidateArtifact,
    sanitizedAnswer: MarkdownPayload | undefined,
    status: ArtifactStatus,
    problem: ProblemDetails | undefined,
    statusReason: string | undefined,
    chartBlocked: boolean,
    tableBlocked: boolean,
): ValidationResult {
    const tabs = deriveTabs({
        answer: sanitizedAnswer,
        chart: candidate.chart,
        table: candidate.table,
        sql: candidate.sql,
        citations: candidate.citations,
        reasoning: candidate.reasoning,
        chartBlocked,
        tableBlocked,
    });

    const artifact: WorkbenchArtifact = {
        id: candidate.id,
        status,
        ...(statusReason ? { statusReason } : {}),
        tabs,
        ...(sanitizedAnswer ? { answer: sanitizedAnswer } : {}),
        ...(candidate.chart && !chartBlocked ? { chart: candidate.chart } : {}),
        ...(candidate.table && !tableBlocked ? { table: candidate.table } : {}),
        ...(candidate.sql ? { sql: candidate.sql } : {}),
        ...(candidate.citations ? { citations: candidate.citations } : {}),
        ...(candidate.reasoning ? { reasoning: candidate.reasoning } : {}),
        ...(typeof candidate.executionTimeMs === 'number' ? { executionTimeMs: candidate.executionTimeMs } : {}),
        ...(typeof candidate.rowCount === 'number' ? { rowCount: candidate.rowCount } : {}),
        ...(candidate.sourceProfile ? { sourceProfile: candidate.sourceProfile } : {}),
        ...(candidate.sourceConnectorType ? { sourceConnectorType: candidate.sourceConnectorType } : {}),
    };

    const overrodeLlmStatus = !!candidate.llmClaimedStatus && candidate.llmClaimedStatus !== status;

    return {
        artifact,
        ...(problem ? { problem } : {}),
        overrodeLlmStatus,
    };
}
