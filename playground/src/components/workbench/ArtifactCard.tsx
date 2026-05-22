// playground/src/components/workbench/ArtifactCard.tsx
//
// Step 3 — Artifact card shell with status badge + 6 tabs.
//
// The card consumes a `WorkbenchArtifact` and renders only the tabs the
// artifact declares (`artifact.tabs`). A tab without payload renders an
// empty state inside the active tab body; the tab is omitted from the
// strip only if it is not in the artifact's tab list. This keeps tab
// availability under the validator's control (Step 4), not the renderer's.

import React, { useMemo, useState } from 'react';
import {
    WORKBENCH_TABS,
    type ArtifactStatus,
    type WorkbenchArtifact,
    type WorkbenchTab,
} from '../../types/assistant';
import {
    AnswerTab,
    ChartTab,
    EvidenceTab,
    ReasoningTab,
    SqlTab,
    TableTab,
} from './ArtifactTabs';

export interface ArtifactCardProps {
    readonly artifact: WorkbenchArtifact;
    /**
     * Optional initial tab override. Falls back to the artifact's first
     * declared tab, then to the first tab in `WORKBENCH_TABS` if the
     * declared set is empty.
     */
    readonly initialTab?: WorkbenchTab;
    /** Optional className override on the outer card wrapper. */
    readonly className?: string;
}

/** Human-readable status labels and semantic class names. */
const STATUS_LABEL: Readonly<Record<ArtifactStatus, string>> = Object.freeze({
    'verified': 'Verified',
    'grounded-draft': 'Grounded draft',
    'suggestion': 'Suggestion',
    'blocked': 'Blocked',
});

/** Stable order for the tab strip — matches WORKBENCH_TABS. */
function orderedTabs(declared: ReadonlyArray<WorkbenchTab>): WorkbenchTab[] {
    const set = new Set(declared);
    return WORKBENCH_TABS.filter((t) => set.has(t));
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, initialTab, className }) => {
    const tabs = useMemo(() => orderedTabs(artifact.tabs), [artifact.tabs]);
    const firstTab = tabs[0] ?? WORKBENCH_TABS[0];
    const [activeTab, setActiveTab] = useState<WorkbenchTab>(initialTab && tabs.includes(initialTab) ? initialTab : firstTab);

    const statusLabel = STATUS_LABEL[artifact.status];
    const wrapperClassName = ['workbench-artifact-card', `workbench-artifact-status-${artifact.status}`, className]
        .filter(Boolean)
        .join(' ');

    return (
        <article
            className={wrapperClassName}
            data-testid="artifact-card"
            data-artifact-status={artifact.status}
            data-artifact-id={artifact.id}
        >
            <header className="workbench-artifact-header">
                <div
                    className={`workbench-artifact-status-badge workbench-artifact-status-badge-${artifact.status}`}
                    role="status"
                    aria-label={`Artifact status: ${statusLabel}`}
                    data-testid="artifact-status-badge"
                >
                    {statusLabel}
                </div>
                {artifact.statusReason ? (
                    <div className="workbench-artifact-status-reason" data-testid="artifact-status-reason">
                        {artifact.statusReason}
                    </div>
                ) : null}
                {tabs.length > 0 ? (
                    <nav className="workbench-artifact-tab-strip" role="tablist" aria-label="Artifact views">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab}
                                aria-controls={`workbench-tab-panel-${tab}`}
                                id={`workbench-tab-${tab}`}
                                className={`workbench-artifact-tab-btn${activeTab === tab ? ' workbench-artifact-tab-btn-active' : ''}`}
                                onClick={() => setActiveTab(tab)}
                                data-testid={`artifact-tab-btn-${tab}`}
                            >
                                {TAB_LABEL[tab]}
                            </button>
                        ))}
                    </nav>
                ) : null}
            </header>

            <section
                className="workbench-artifact-body"
                role="tabpanel"
                id={`workbench-tab-panel-${activeTab}`}
                aria-labelledby={`workbench-tab-${activeTab}`}
                data-testid="artifact-body"
            >
                {renderTab(activeTab, artifact)}
            </section>

            <footer className="workbench-artifact-footer" data-testid="artifact-footer">
                {artifact.sourceProfile ? (
                    <span className="workbench-artifact-stat" data-testid="artifact-source-profile">
                        Source: {artifact.sourceProfile}
                        {artifact.sourceConnectorType ? ` (${artifact.sourceConnectorType})` : ''}
                    </span>
                ) : null}
                {typeof artifact.rowCount === 'number' ? (
                    <span className="workbench-artifact-stat" data-testid="artifact-row-count">
                        Rows: {artifact.rowCount}
                    </span>
                ) : null}
                {typeof artifact.executionTimeMs === 'number' ? (
                    <span className="workbench-artifact-stat" data-testid="artifact-exec-time">
                        Time: {artifact.executionTimeMs} ms
                    </span>
                ) : null}
            </footer>
        </article>
    );
};

const TAB_LABEL: Readonly<Record<WorkbenchTab, string>> = Object.freeze({
    answer: 'Answer',
    chart: 'Chart',
    table: 'Table',
    sql: 'SQL',
    evidence: 'Evidence',
    reasoning: 'Reasoning',
});

function renderTab(tab: WorkbenchTab, artifact: WorkbenchArtifact): React.ReactNode {
    switch (tab) {
        case 'answer':
            return <AnswerTab payload={artifact.answer} />;
        case 'chart':
            return <ChartTab spec={artifact.chart} />;
        case 'table':
            return <TableTab table={artifact.table} />;
        case 'sql':
            return <SqlTab sql={artifact.sql} sections={artifact.sqlSections} />;
        case 'evidence':
            return <EvidenceTab citations={artifact.citations} />;
        case 'reasoning':
            return <ReasoningTab trace={artifact.reasoning} />;
    }
}
