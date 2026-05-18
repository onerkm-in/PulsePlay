// playground/src/components/workbench/ArtifactTabs.tsx
//
// Per-tab renderers for the Unified Workbench artifact card.
//
// Step 3 of the build sequence. Renderers are intentionally simple: this
// step ships the shell + plain renderers; chart compilation moves into the
// ChartTab in Step 5 (ECharts adapter), and the AnswerTab will swap a
// proper markdown renderer when the workbench picks one. Until then,
// AnswerTab paragraph-splits on blank lines as a safe lossless render.
//
// Every renderer is pure — no state, no effects. Easy to test, swap, and
// portable into other surfaces (history scrolls, evidence drawers, exports).

import React from 'react';
import type {
    ArtifactCitation,
    ArtifactResultTable,
    ChartSpec,
    MarkdownPayload,
    ReasoningTrace,
} from '../../types/assistant';
import { compileVegaLiteToECharts, type VegaLiteSpec } from '../../lib/vegaLiteToECharts';
import { EChartsRenderer } from './EChartsRenderer';

// ─── Answer tab ────────────────────────────────────────────────────────

export const AnswerTab: React.FC<{ payload: MarkdownPayload | undefined }> = ({ payload }) => {
    if (!payload || !payload.markdown.trim()) {
        return <div className="workbench-tab-empty">No answer available.</div>;
    }
    const paragraphs = payload.markdown.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    return (
        <div className="workbench-tab-answer" data-testid="artifact-tab-answer">
            {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
            ))}
        </div>
    );
};

// ─── Chart tab ─────────────────────────────────────────────────────────

/**
 * Compiles the Vega-Lite spec to an ECharts option via the chart registry
 * (Step 5). If the compiler cannot render the spec, surfaces the reason
 * inline rather than a generic empty state.
 */
export const ChartTab: React.FC<{ spec: ChartSpec | undefined }> = ({ spec }) => {
    if (!spec) {
        return <div className="workbench-tab-empty">No chart spec attached.</div>;
    }
    const result = compileVegaLiteToECharts(spec as unknown as VegaLiteSpec);
    if (!result.ok || !result.option) {
        return (
            <div className="workbench-tab-chart" data-testid="artifact-tab-chart">
                <div className="workbench-chart-unsupported" data-testid="artifact-chart-unsupported">
                    Chart spec could not be rendered: {result.reason ?? 'unknown reason'}
                </div>
            </div>
        );
    }
    return (
        <div className="workbench-tab-chart" data-testid="artifact-tab-chart">
            <EChartsRenderer option={result.option} />
        </div>
    );
};

// ─── Table tab ─────────────────────────────────────────────────────────

export const TableTab: React.FC<{ table: ArtifactResultTable | undefined }> = ({ table }) => {
    if (!table || table.rows.length === 0) {
        return <div className="workbench-tab-empty">No tabular result.</div>;
    }
    return (
        <div className="workbench-tab-table" data-testid="artifact-tab-table">
            <table className="workbench-result-table">
                <thead>
                    <tr>
                        {table.columns.map((col, i) => (
                            <th key={i} data-column-type={col.type}>
                                {col.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {table.rows.map((row, i) => (
                        <tr key={i}>
                            {row.map((cell, j) => (
                                <td key={j}>{formatCell(cell)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

function formatCell(value: string | number | null): string {
    if (value === null || value === undefined) return '—';
    return String(value);
}

// ─── SQL tab ───────────────────────────────────────────────────────────

export const SqlTab: React.FC<{ sql: string | undefined }> = ({ sql }) => {
    if (!sql || !sql.trim()) {
        return <div className="workbench-tab-empty">No SQL attached.</div>;
    }
    return (
        <pre className="workbench-tab-sql" data-testid="artifact-tab-sql">
            <code>{sql}</code>
        </pre>
    );
};

// ─── Evidence tab ──────────────────────────────────────────────────────

export const EvidenceTab: React.FC<{ citations: ReadonlyArray<ArtifactCitation> | undefined }> = ({ citations }) => {
    if (!citations || citations.length === 0) {
        return <div className="workbench-tab-empty">No evidence chain attached.</div>;
    }
    return (
        <ul className="workbench-tab-evidence" data-testid="artifact-tab-evidence">
            {citations.map((c, i) => (
                <li key={i} className={`workbench-evidence-${c.kind}`} data-evidence-kind={c.kind}>
                    {renderCitation(c)}
                </li>
            ))}
        </ul>
    );
};

function renderCitation(c: ArtifactCitation): React.ReactNode {
    switch (c.kind) {
        case 'sql':
            return (
                <>
                    <strong>SQL</strong>
                    {c.statementId ? <> <code>({c.statementId})</code></> : null}
                    <pre><code>{c.statement}</code></pre>
                </>
            );
        case 'dax':
            return (
                <>
                    <strong>DAX</strong>
                    <pre><code>{c.expression}</code></pre>
                </>
            );
        case 'result-rows':
            return (
                <>
                    <strong>Rows</strong> from statement <code>{c.statementId}</code> ({c.rowCount} row{c.rowCount === 1 ? '' : 's'})
                </>
            );
        case 'vendor':
            return (
                <>
                    <strong>Vendor source:</strong> {c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener">{c.source}</a> : c.source}
                </>
            );
        case 'pack':
            return (
                <>
                    <strong>Pack:</strong> <code>{c.packId}</code> module <code>{c.moduleId}</code>
                </>
            );
        case 'vector':
            return (
                <>
                    <strong>Vector index:</strong> <code>{c.indexName}</code> chunk <code>{c.chunkId}</code>
                </>
            );
    }
}

// ─── Reasoning tab ─────────────────────────────────────────────────────

export const ReasoningTab: React.FC<{ trace: ReasoningTrace | undefined }> = ({ trace }) => {
    if (!trace || trace.steps.length === 0) {
        return <div className="workbench-tab-empty">No reasoning trace attached.</div>;
    }
    return (
        <ol className="workbench-tab-reasoning" data-testid="artifact-tab-reasoning">
            {trace.steps.map((step, i) => (
                <li key={i} className="workbench-reasoning-step">
                    <div className="workbench-reasoning-label">{step.label}</div>
                    {typeof step.atMs === 'number' ? (
                        <div className="workbench-reasoning-at">+{step.atMs}ms</div>
                    ) : null}
                    <div className="workbench-reasoning-content">{step.content}</div>
                </li>
            ))}
        </ol>
    );
};
