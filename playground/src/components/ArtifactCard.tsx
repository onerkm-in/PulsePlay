// playground/src/components/ArtifactCard.tsx

import React, { useState } from 'react';
import { VerifiedArtifact } from '../types/assistant';

export const ArtifactCard: React.FC<{ artifact: VerifiedArtifact }> = ({ artifact }) => {
    const [activeTab, setActiveTab] = useState<'Answer' | 'Chart' | 'Table' | 'SQL' | 'Evidence' | 'Reasoning'>(artifact.type);

    return (
        <div className="artifact-card">
            <div className="artifact-header">
                <div className="artifact-status-badge">
                    {artifact.status}
                </div>
                <div className="artifact-tabs">
                    {['Answer', 'Chart', 'Table', 'SQL', 'Evidence', 'Reasoning'].map(tab => (
                        <button 
                            key={tab} 
                            className={\	ab-btn \\}
                            onClick={() => setActiveTab(tab as any)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="artifact-body">
                {activeTab === 'Answer' && <div className="tab-pane answer-pane">{JSON.stringify(artifact.content)}</div>}
                {activeTab === 'Chart' && <div className="tab-pane chart-pane">Chart Area</div>}
                {activeTab === 'Table' && <div className="tab-pane table-pane">Table Area</div>}
                {activeTab === 'SQL' && <div className="tab-pane sql-pane">{artifact.sqlCitation || 'No SQL provided'}</div>}
                {activeTab === 'Evidence' && <div className="tab-pane evidence-pane">{artifact.dataCitation || 'No evidence provided'}</div>}
                {activeTab === 'Reasoning' && <div className="tab-pane reasoning-pane">Reasoning details here.</div>}
            </div>
            
            <div className="artifact-footer">
                {artifact.rowCount !== undefined && <span className="stat">Rows: {artifact.rowCount}</span>}
                {artifact.executionTimeMs !== undefined && <span className="stat">Time: {artifact.executionTimeMs}ms</span>}
            </div>
        </div>
    );
};
