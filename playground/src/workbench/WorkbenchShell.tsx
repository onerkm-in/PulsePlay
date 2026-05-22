// playground/src/workbench/WorkbenchShell.tsx
//
// Page-level wrapper for the /workbench route. Surfaces a clear notice when
// the preview flag is off, and lets the user opt-in from this page rather
// than the browser console.

import React from 'react';
import { UnifiedWorkbench } from './UnifiedWorkbench';
import { isWorkbenchEnabled, setWorkbenchPreviewEnabled } from './workbenchRoute';
import './workbench.css';

export const WorkbenchShell: React.FC = () => {
    const enabled = isWorkbenchEnabled();

    if (!enabled) {
        return (
            <div className="workbench-preview-gate" data-testid="workbench-preview-gate">
                <h1>Unified Ask Pulse Workbench — preview</h1>
                <p>
                    The workbench is preview-grade. Steps 1–5 (capability model, Genie native
                    embed, artifact card shell, validation gates, ECharts renderer) have shipped.
                    Steps 6 (Pulse-asset refactor) and 7 (theme) are queued.
                </p>
                <p>Opt in to preview the surface in this browser:</p>
                <button
                    type="button"
                    onClick={() => { setWorkbenchPreviewEnabled(true); window.location.reload(); }}
                    data-testid="workbench-preview-enable"
                >
                    Enable preview
                </button>
                <p style={{ marginTop: 24, fontSize: 13, color: '#555' }}>
                    To enable for everyone on this build, set <code>VITE_PULSEPLAY_ENABLE_WORKBENCH=true</code>.
                </p>
            </div>
        );
    }

    return <UnifiedWorkbench />;
};
