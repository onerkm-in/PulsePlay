// playground/src/workbench/demoArtifact.ts
//
// Stand-in artifact fixture used by the /workbench preview route until the
// real query → validator → workbench pipeline is wired (downstream slice).
// Mirrors the shape the validator emits, so the demo exercises the same
// types the real path will use.

import { validateArtifact } from '../lib/artifactValidator';
import type { WorkbenchArtifact } from '../types/assistant';

export function buildSuperstoreDemoArtifact(): WorkbenchArtifact {
    const sql = [
        'WITH category_sales AS (',
        '    SELECT category, SUM(sales) AS total_sales',
        '    FROM workspace.databrickspractice.vw_genie_sales_performance',
        '    GROUP BY category',
        ')',
        'SELECT category, total_sales',
        'FROM category_sales',
        'ORDER BY total_sales DESC',
        'LIMIT 3',
    ].join('\n');

    const rows: ReadonlyArray<readonly [string, number]> = [
        ['Technology', 836154.03],
        ['Furniture', 741999.80],
        ['Office Supplies', 719047.03],
    ];

    const result = validateArtifact({
        id: 'demo-superstore-top3',
        llmClaimedStatus: 'verified',
        answer: {
            markdown:
                'The top 3 product categories by total sales are Technology, Furniture, and Office Supplies.\n\n' +
                'Technology leads with $836,154, followed by Furniture at $742,000 and Office Supplies at $719,047.',
        },
        chart: {
            mark: 'bar',
            title: 'Top 3 product categories by total sales',
            data: { values: rows.map(([category, total_sales]) => ({ category, total_sales })) },
            encoding: { x: { field: 'category', type: 'nominal' }, y: { field: 'total_sales', type: 'quantitative' } },
        },
        table: {
            columns: [{ name: 'category', type: 'STRING' }, { name: 'total_sales', type: 'DECIMAL' }],
            rows: rows.map((r) => [r[0], r[1]]),
        },
        sql,
        citations: [
            { kind: 'sql', statement: sql, statementId: 'demo-st1' },
            { kind: 'result-rows', statementId: 'demo-st1', rowCount: rows.length },
        ],
        reasoning: {
            steps: [
                { label: 'Parse intent', content: 'Top-N question over sales aggregated by category.' },
                { label: 'Plan SQL', content: 'Aggregate sum(sales) by category, order desc, limit 3.', atMs: 120 },
                { label: 'Execute', content: 'Run on the Sample Superstore view in the workspace catalog.', atMs: 1840 },
            ],
        },
        rowCount: rows.length,
        executionTimeMs: 39000,
        sourceProfile: 'default',
        sourceConnectorType: 'genie',
    });

    return result.artifact;
}
