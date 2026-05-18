// playground/src/components/workbench/__tests__/ArtifactCard.test.tsx
//
// Step 3 — ArtifactCard shell invariants. Covers status badge rendering,
// tab visibility (declared subset only), tab switching, and per-tab
// rendering (including empty states when the artifact omits a payload).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { ArtifactCard } from '../ArtifactCard';
import type { ArtifactStatus, WorkbenchArtifact, WorkbenchTab } from '../../../types/assistant';

interface MountState {
    container: HTMLElement;
    root: Root;
}

function mount(ui: React.ReactNode): MountState {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(ui); });
    return { container, root };
}
function unmount(state: MountState) {
    act(() => { state.root.unmount(); });
    state.container.remove();
}
let mounted: MountState | null = null;
beforeEach(() => { mounted = null; });
afterEach(() => { if (mounted) unmount(mounted); mounted = null; });

function artifact(overrides: Partial<WorkbenchArtifact> = {}): WorkbenchArtifact {
    return {
        id: 'fixture-1',
        status: 'verified',
        tabs: ['answer'],
        answer: { markdown: 'The answer.' },
        ...overrides,
    };
}

// ─── Status badge ──────────────────────────────────────────────────────

describe('ArtifactCard — status badge', () => {
    const cases: ReadonlyArray<{ status: ArtifactStatus; label: string }> = [
        { status: 'verified', label: 'Verified' },
        { status: 'grounded-draft', label: 'Grounded draft' },
        { status: 'suggestion', label: 'Suggestion' },
        { status: 'blocked', label: 'Blocked' },
    ];
    for (const { status, label } of cases) {
        it(`renders ${status} → "${label}"`, () => {
            mounted = mount(<ArtifactCard artifact={artifact({ status })} />);
            const badge = mounted.container.querySelector('[data-testid="artifact-status-badge"]');
            expect(badge?.textContent).toBe(label);
            const card = mounted.container.querySelector('[data-testid="artifact-card"]');
            expect(card?.getAttribute('data-artifact-status')).toBe(status);
        });
    }

    it('renders statusReason when provided', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ status: 'blocked', statusReason: 'No SQL provenance' })} />);
        const reason = mounted.container.querySelector('[data-testid="artifact-status-reason"]');
        expect(reason?.textContent).toBe('No SQL provenance');
    });

    it('omits statusReason when not provided', () => {
        mounted = mount(<ArtifactCard artifact={artifact()} />);
        expect(mounted.container.querySelector('[data-testid="artifact-status-reason"]')).toBeNull();
    });
});

// ─── Tab strip ─────────────────────────────────────────────────────────

describe('ArtifactCard — tab strip', () => {
    it('renders only declared tabs', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['answer', 'sql'] })} />);
        expect(mounted.container.querySelector('[data-testid="artifact-tab-btn-answer"]')).not.toBeNull();
        expect(mounted.container.querySelector('[data-testid="artifact-tab-btn-sql"]')).not.toBeNull();
        expect(mounted.container.querySelector('[data-testid="artifact-tab-btn-chart"]')).toBeNull();
        expect(mounted.container.querySelector('[data-testid="artifact-tab-btn-table"]')).toBeNull();
        expect(mounted.container.querySelector('[data-testid="artifact-tab-btn-evidence"]')).toBeNull();
        expect(mounted.container.querySelector('[data-testid="artifact-tab-btn-reasoning"]')).toBeNull();
    });

    it('renders tabs in WORKBENCH_TABS order regardless of declared order', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['reasoning', 'answer', 'sql'] })} />);
        const buttons = Array.from(mounted.container.querySelectorAll<HTMLButtonElement>('.workbench-artifact-tab-btn'));
        expect(buttons.map((b) => b.textContent)).toEqual(['Answer', 'SQL', 'Reasoning']);
    });

    it('first declared tab is active by default (in canonical order)', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['sql', 'reasoning'] })} />);
        const sqlBtn = mounted.container.querySelector('[data-testid="artifact-tab-btn-sql"]')!;
        const reasoningBtn = mounted.container.querySelector('[data-testid="artifact-tab-btn-reasoning"]')!;
        expect(sqlBtn.getAttribute('aria-selected')).toBe('true');
        expect(reasoningBtn.getAttribute('aria-selected')).toBe('false');
    });

    it('honors initialTab when it is in the declared set', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['answer', 'sql'] })} initialTab="sql" />);
        const sqlBtn = mounted.container.querySelector('[data-testid="artifact-tab-btn-sql"]')!;
        expect(sqlBtn.getAttribute('aria-selected')).toBe('true');
    });

    it('ignores initialTab when it is not in the declared set', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['answer', 'sql'] })} initialTab={'chart' as WorkbenchTab} />);
        const answerBtn = mounted.container.querySelector('[data-testid="artifact-tab-btn-answer"]')!;
        expect(answerBtn.getAttribute('aria-selected')).toBe('true');
    });

    it('switches the active tab on click', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['answer', 'sql'], sql: 'SELECT 1' })} />);
        const sqlBtn = mounted.container.querySelector<HTMLButtonElement>('[data-testid="artifact-tab-btn-sql"]')!;
        act(() => { sqlBtn.click(); });
        expect(sqlBtn.getAttribute('aria-selected')).toBe('true');
        const sqlPanel = mounted.container.querySelector('[data-testid="artifact-tab-sql"]');
        expect(sqlPanel?.textContent).toContain('SELECT 1');
    });

    it('omits the tab strip entirely when no tabs are declared', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: [] })} />);
        expect(mounted.container.querySelector('.workbench-artifact-tab-strip')).toBeNull();
    });
});

// ─── Per-tab body rendering ────────────────────────────────────────────

describe('ArtifactCard — per-tab content', () => {
    it('Answer tab paragraph-splits on blank lines', () => {
        const md = 'First paragraph.\n\nSecond paragraph.';
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['answer'], answer: { markdown: md } })} />);
        const paragraphs = mounted.container.querySelectorAll('[data-testid="artifact-tab-answer"] p');
        expect(paragraphs).toHaveLength(2);
        expect(paragraphs[0].textContent).toBe('First paragraph.');
        expect(paragraphs[1].textContent).toBe('Second paragraph.');
    });

    it('Answer tab shows empty state when payload missing', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['answer'], answer: undefined })} />);
        const empty = mounted.container.querySelector('.workbench-tab-empty');
        expect(empty?.textContent).toBe('No answer available.');
    });

    it('Chart tab compiles a real bar spec into an ECharts host', () => {
        mounted = mount(<ArtifactCard artifact={artifact({
            tabs: ['chart'],
            chart: {
                mark: 'bar',
                data: { values: [{ x: 'Tech', y: 836154 }, { x: 'Furniture', y: 741999 }] },
                encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y', type: 'quantitative' } },
            },
        })} />);
        expect(mounted.container.querySelector('[data-testid="echarts-host"]')).not.toBeNull();
    });

    it('Chart tab compiles an object-shaped line mark', () => {
        mounted = mount(<ArtifactCard artifact={artifact({
            tabs: ['chart'],
            chart: {
                mark: { type: 'line' },
                data: { values: [{ x: 'Jan', y: 1 }, { x: 'Feb', y: 2 }] },
                encoding: { x: { field: 'x' }, y: { field: 'y' } },
            },
        })} />);
        expect(mounted.container.querySelector('[data-testid="echarts-host"]')).not.toBeNull();
    });

    it('Chart tab surfaces unsupported reason when spec has no data', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['chart'], chart: { mark: 'bar', data: {}, encoding: {} } })} />);
        expect(mounted.container.querySelector('[data-testid="artifact-chart-unsupported"]')).not.toBeNull();
        expect(mounted.container.querySelector('[data-testid="echarts-host"]')).toBeNull();
    });

    it('Table tab renders columns + rows', () => {
        mounted = mount(<ArtifactCard artifact={artifact({
            tabs: ['table'],
            table: {
                columns: [{ name: 'category', type: 'STRING' }, { name: 'sales', type: 'DECIMAL' }],
                rows: [['Tech', 836154.03], ['Furniture', 741999.80]],
            },
        })} />);
        const ths = mounted.container.querySelectorAll('th');
        expect(ths).toHaveLength(2);
        expect(ths[0].textContent).toBe('category');
        expect(ths[0].getAttribute('data-column-type')).toBe('STRING');
        const tds = mounted.container.querySelectorAll('td');
        expect(tds).toHaveLength(4);
        expect(tds[0].textContent).toBe('Tech');
        expect(tds[1].textContent).toBe('836154.03');
    });

    it('Table tab formats null cells as em-dash', () => {
        mounted = mount(<ArtifactCard artifact={artifact({
            tabs: ['table'],
            table: { columns: [{ name: 'x', type: 'STRING' }], rows: [[null]] },
        })} />);
        const td = mounted.container.querySelector('td');
        expect(td?.textContent).toBe('—');
    });

    it('SQL tab renders SQL inside a <pre><code>', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ tabs: ['sql'], sql: 'SELECT category FROM x' })} />);
        const code = mounted.container.querySelector('[data-testid="artifact-tab-sql"] code');
        expect(code?.textContent).toBe('SELECT category FROM x');
    });

    it('Evidence tab renders one entry per citation with kind-specific class', () => {
        mounted = mount(<ArtifactCard artifact={artifact({
            tabs: ['evidence'],
            citations: [
                { kind: 'sql', statement: 'SELECT 1', statementId: 'st1' },
                { kind: 'result-rows', statementId: 'st1', rowCount: 3 },
                { kind: 'vendor', source: 'Databricks Genie', url: 'https://example' },
                { kind: 'pack', packId: 'cpg-fmcg', moduleId: 'kpis' },
                { kind: 'vector', indexName: 'kb_v1', chunkId: 'c42' },
                { kind: 'dax', expression: 'SUM([Sales])' },
            ],
        })} />);
        const items = mounted.container.querySelectorAll('[data-testid="artifact-tab-evidence"] li');
        expect(items).toHaveLength(6);
        expect(items[0].getAttribute('data-evidence-kind')).toBe('sql');
        expect(items[1].getAttribute('data-evidence-kind')).toBe('result-rows');
        expect(items[2].getAttribute('data-evidence-kind')).toBe('vendor');
        expect(items[3].getAttribute('data-evidence-kind')).toBe('pack');
        expect(items[4].getAttribute('data-evidence-kind')).toBe('vector');
        expect(items[5].getAttribute('data-evidence-kind')).toBe('dax');
        expect(items[2].querySelector('a')?.getAttribute('href')).toBe('https://example');
    });

    it('Reasoning tab renders steps in order with optional atMs marker', () => {
        mounted = mount(<ArtifactCard artifact={artifact({
            tabs: ['reasoning'],
            reasoning: {
                steps: [
                    { label: 'Parse intent', content: 'Identified top-N question' },
                    { label: 'Plan SQL', content: 'RANK over sum(sales)', atMs: 120 },
                ],
            },
        })} />);
        const lis = mounted.container.querySelectorAll('[data-testid="artifact-tab-reasoning"] li');
        expect(lis).toHaveLength(2);
        expect(lis[0].textContent).toContain('Parse intent');
        expect(lis[0].textContent).not.toContain('ms');
        expect(lis[1].textContent).toContain('+120ms');
    });

    const emptyStates: ReadonlyArray<{ tab: WorkbenchTab; expectedCopy: string }> = [
        { tab: 'chart', expectedCopy: 'No chart spec attached.' },
        { tab: 'table', expectedCopy: 'No tabular result.' },
        { tab: 'sql', expectedCopy: 'No SQL attached.' },
        { tab: 'evidence', expectedCopy: 'No evidence chain attached.' },
        { tab: 'reasoning', expectedCopy: 'No reasoning trace attached.' },
    ];
    for (const { tab, expectedCopy } of emptyStates) {
        it(`${tab} tab renders the empty state when payload is missing`, () => {
            mounted = mount(<ArtifactCard artifact={artifact({ tabs: [tab] })} />);
            expect(mounted.container.querySelector('.workbench-tab-empty')?.textContent).toBe(expectedCopy);
        });
    }
});

// ─── Footer telemetry ──────────────────────────────────────────────────

describe('ArtifactCard — footer', () => {
    it('renders source profile + connector type when both present', () => {
        mounted = mount(<ArtifactCard artifact={artifact({
            sourceProfile: 'default',
            sourceConnectorType: 'genie',
        })} />);
        const stat = mounted.container.querySelector('[data-testid="artifact-source-profile"]');
        expect(stat?.textContent).toBe('Source: default (genie)');
    });

    it('renders row count when present', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ rowCount: 42 })} />);
        const stat = mounted.container.querySelector('[data-testid="artifact-row-count"]');
        expect(stat?.textContent).toBe('Rows: 42');
    });

    it('renders execution time when present', () => {
        mounted = mount(<ArtifactCard artifact={artifact({ executionTimeMs: 1234 })} />);
        const stat = mounted.container.querySelector('[data-testid="artifact-exec-time"]');
        expect(stat?.textContent).toBe('Time: 1234 ms');
    });

    it('omits footer stats when fields are missing', () => {
        mounted = mount(<ArtifactCard artifact={artifact()} />);
        expect(mounted.container.querySelector('[data-testid="artifact-source-profile"]')).toBeNull();
        expect(mounted.container.querySelector('[data-testid="artifact-row-count"]')).toBeNull();
        expect(mounted.container.querySelector('[data-testid="artifact-exec-time"]')).toBeNull();
    });
});
