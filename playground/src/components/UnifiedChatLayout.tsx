// playground/src/components/UnifiedChatLayout.tsx

import React from 'react';
import { UnifiedAssistantSurface } from './UnifiedAssistantSurface';
import { AssistantMode, ConnectorCapabilities } from '../types/assistant';

export const UnifiedChatLayout: React.FC<{
    profile: string;
    mode: AssistantMode;
    capabilities: ConnectorCapabilities;
}> = ({ profile, mode, capabilities }) => {
    return (
        <div className="unified-workbench-layout">
            <div className="workbench-sidebar">
                <div className="chat-history">
                    {/* Placeholder for Conversation Rail */}
                    <p>Conversation History Rail</p>
                </div>
                <div className="chat-composer-sticky">
                    {/* Placeholder for Composer */}
                    <input type="text" placeholder="Ask Pulse..." className="composer-input" />
                </div>
            </div>
            <div className="workbench-main-canvas">
                <UnifiedAssistantSurface 
                    selectedProfile={profile}
                    mode={mode}
                    capabilities={capabilities}
                />
            </div>
            {mode === 'hybrid' && (
                <div className="workbench-inspector-drawer">
                     <h3>Inspector Drawer</h3>
                     <p>Filters, source BI surface, SQL, row count, execution time, validation, citations, exports</p>
                </div>
            )}
        </div>
    );
};
