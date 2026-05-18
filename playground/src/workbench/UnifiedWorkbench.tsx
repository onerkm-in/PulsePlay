// playground/src/workbench/UnifiedWorkbench.tsx
//
// Preview shell that wires the workbench primitives together:
//   - mode resolver picks native-embed / verified / hybrid from descriptor
//   - native-embed mode renders GenieNativeEmbed
//   - verified mode renders the artifact card
//   - hybrid mode renders both, side-by-side, with the rails on the right
//
// Step 6 wiring slice; the actual conversation flow + composer wiring is
// downstream. This component is feature-flagged (see workbenchRoute.ts).

import React, { useMemo, useState } from 'react';
import { ArtifactCard } from '../components/workbench/ArtifactCard';
import { GenieNativeEmbed } from '../components/workbench/GenieNativeEmbed';
import { buildGenieDescriptor } from '../lib/workbenchDescriptors';
import { resolveAssistantMode } from '../lib/connectorCapabilities';
import { setWorkbenchPreviewEnabled } from './workbenchRoute';
import { buildSuperstoreDemoArtifact } from './demoArtifact';
import type { AssistantConnectorDescriptor, AssistantMode } from '../types/assistant';

export interface UnifiedWorkbenchProps {
    /**
     * The connector to drive the workbench. When omitted, falls back to a
     * dev-mode Genie descriptor pointing at the default profile so the
     * preview surface is exercisable without proxy round-trips.
     */
    readonly descriptor?: AssistantConnectorDescriptor;
}

export const UnifiedWorkbench: React.FC<UnifiedWorkbenchProps> = ({ descriptor }) => {
    const activeDescriptor = useMemo<AssistantConnectorDescriptor>(() => {
        return descriptor ?? buildGenieDescriptor({ profile: 'default', displayName: 'Default Genie (preview)' });
    }, [descriptor]);

    const [preference, setPreference] = useState<AssistantMode | undefined>(undefined);
    const resolution = useMemo(
        () => resolveAssistantMode({ capabilities: activeDescriptor.capabilities, preference }),
        [activeDescriptor.capabilities, preference],
    );

    const demoArtifact = useMemo(() => buildSuperstoreDemoArtifact(), []);
    const mode = resolution.mode;

    return (
        <div className="workbench-shell" data-testid="workbench-shell">
            <header className="workbench-header">
                <h1 className="workbench-title">Unified Ask Pulse Workbench</h1>
                <div className="workbench-mode-controls" role="group" aria-label="Workbench mode">
                    <span className="workbench-mode-label">Mode:</span>
                    {(['verified', 'native-embed', 'hybrid'] as const).map((m) => {
                        const supported = isModeSupported(m, activeDescriptor);
                        const isActive = mode === m && (preference === m || (!preference && resolution.reason === 'capability'));
                        return (
                            <button
                                key={m}
                                type="button"
                                disabled={!supported}
                                className={`workbench-mode-btn${isActive ? ' workbench-mode-btn-active' : ''}`}
                                onClick={() => setPreference(m)}
                                data-testid={`workbench-mode-btn-${m}`}
                                aria-pressed={isActive}
                            >
                                {MODE_LABEL[m]}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        className="workbench-preview-disable"
                        onClick={() => { setWorkbenchPreviewEnabled(false); window.location.assign('/'); }}
                        data-testid="workbench-preview-disable"
                    >
                        Disable preview
                    </button>
                </div>
                <div className="workbench-mode-status" data-testid="workbench-mode-status">
                    Active mode: <strong>{mode ? MODE_LABEL[mode] : 'unavailable'}</strong>{' '}
                    (reason: <code>{resolution.reason}</code>)
                </div>
            </header>

            <main className="workbench-body" data-testid="workbench-body">
                {mode === 'native-embed' ? (
                    <section className="workbench-pane workbench-pane-native">
                        <GenieNativeEmbed descriptor={activeDescriptor} />
                    </section>
                ) : null}

                {mode === 'verified' ? (
                    <section className="workbench-pane workbench-pane-verified">
                        <ArtifactCard artifact={demoArtifact} />
                    </section>
                ) : null}

                {mode === 'hybrid' ? (
                    <>
                        <section className="workbench-pane workbench-pane-native">
                            <GenieNativeEmbed descriptor={activeDescriptor} />
                        </section>
                        <section className="workbench-pane workbench-pane-rails">
                            <ArtifactCard artifact={demoArtifact} />
                        </section>
                    </>
                ) : null}

                {mode === null ? (
                    <section className="workbench-pane workbench-pane-empty" role="alert">
                        No mode is available for this connector ({activeDescriptor.connectorType}).
                    </section>
                ) : null}
            </main>
        </div>
    );
};

const MODE_LABEL: Readonly<Record<AssistantMode, string>> = Object.freeze({
    'native-embed': 'Native Embed',
    'verified': 'Verified',
    'hybrid': 'Hybrid',
});

function isModeSupported(mode: AssistantMode, descriptor: AssistantConnectorDescriptor): boolean {
    const r = resolveAssistantMode({ capabilities: descriptor.capabilities, preference: mode });
    return r.mode === mode;
}
