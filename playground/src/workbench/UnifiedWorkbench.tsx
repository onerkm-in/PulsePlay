// playground/src/workbench/UnifiedWorkbench.tsx
//
// Preview shell that wires the workbench primitives together:
//   - mode resolver picks native-embed / verified / hybrid from descriptor
//   - native-embed mode renders GenieNativeEmbed
//   - verified mode renders the artifact card (live via useConversation;
//     demo Superstore fixture is fallback when no question has been asked)
//   - hybrid mode renders both, side-by-side, with the rails on the right
//
// Preview-gated via workbenchRoute.ts.

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ArtifactCard } from '../components/workbench/ArtifactCard';
import { GenieNativeEmbed } from '../components/workbench/GenieNativeEmbed';
import { FollowUpQuestions } from '../components/workbench/FollowUpQuestions';
import { buildGenieDescriptor } from '../lib/workbenchDescriptors';
import { resolveAssistantMode } from '../lib/connectorCapabilities';
import { setWorkbenchPreviewEnabled } from './workbenchRoute';
import { buildSuperstoreDemoArtifact } from './demoArtifact';
import { useConversation } from './useConversation';
import type { SanitizedComposerInput } from './composerInput';
import type { AssistantConnectorDescriptor, AssistantMode, WorkbenchArtifact } from '../types/assistant';

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
    const composerRef = useRef<HTMLTextAreaElement | null>(null);

    const conversation = useConversation({
        profile: activeDescriptor.profile,
        connectorType: activeDescriptor.connectorType,
    });

    // Live artifact replaces the demo as soon as a real conversation has
    // produced a validated result. Until then the demo Superstore artifact
    // shows so the preview surface is non-empty on first load.
    const visibleArtifact: WorkbenchArtifact = conversation.result?.artifact ?? demoArtifact;
    const livePromoted = conversation.result !== null;

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
                    {livePromoted ? <span className="workbench-mode-source" data-testid="workbench-source-live"> · source: live</span> : <span className="workbench-mode-source" data-testid="workbench-source-demo"> · source: demo fixture</span>}
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
                        <WorkbenchComposer
                            disabled={conversation.isStarting || conversation.isPolling}
                            isStarting={conversation.isStarting}
                            isPolling={conversation.isPolling}
                            upstreamStatus={conversation.upstreamStatus}
                            error={conversation.error}
                            onAsk={(question) => conversation.ask(question)}
                            composerRef={composerRef}
                            onReset={() => conversation.reset()}
                            livePromoted={livePromoted}
                            sanitization={conversation.lastSanitization}
                        />
                        <ArtifactCard artifact={visibleArtifact} />
                        <FollowUpQuestions
                            questions={conversation.suggestedQuestions}
                            onAsk={(q) => conversation.ask(q)}
                            disabled={conversation.isStarting || conversation.isPolling}
                        />
                    </section>
                ) : null}

                {mode === 'hybrid' ? (
                    <>
                        <section className="workbench-pane workbench-pane-native">
                            <GenieNativeEmbed descriptor={activeDescriptor} />
                        </section>
                        <section className="workbench-pane workbench-pane-rails">
                            <WorkbenchComposer
                                disabled={conversation.isStarting || conversation.isPolling}
                                isStarting={conversation.isStarting}
                                isPolling={conversation.isPolling}
                                upstreamStatus={conversation.upstreamStatus}
                                error={conversation.error}
                                onAsk={(question) => conversation.ask(question)}
                                composerRef={composerRef}
                                onReset={() => conversation.reset()}
                                livePromoted={livePromoted}
                                sanitization={conversation.lastSanitization}
                            />
                            <ArtifactCard artifact={visibleArtifact} />
                            <FollowUpQuestions
                                questions={conversation.suggestedQuestions}
                                onAsk={(q) => conversation.ask(q)}
                                disabled={conversation.isStarting || conversation.isPolling}
                            />
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

interface WorkbenchComposerProps {
    readonly disabled: boolean;
    readonly isStarting: boolean;
    readonly isPolling: boolean;
    readonly upstreamStatus: string | undefined;
    readonly error: Error | null;
    readonly onAsk: (question: string) => void;
    readonly onReset: () => void;
    readonly composerRef: React.MutableRefObject<HTMLTextAreaElement | null>;
    readonly livePromoted: boolean;
    readonly sanitization: SanitizedComposerInput | null;
}

const WorkbenchComposer: React.FC<WorkbenchComposerProps> = ({
    disabled,
    isStarting,
    isPolling,
    upstreamStatus,
    error,
    onAsk,
    onReset,
    composerRef,
    livePromoted,
    sanitization,
}) => {
    const [draft, setDraft] = useState('');
    const submit = () => {
        const trimmed = draft.trim();
        if (!trimmed || disabled) return;
        onAsk(trimmed);
    };

    useEffect(() => {
        if (composerRef.current && !disabled) {
            // Keep focus on the composer after a submission so follow-ups stay fast.
            composerRef.current.focus();
        }
    }, [disabled, composerRef]);

    return (
        <div className="workbench-composer" data-testid="workbench-composer">
            <label className="workbench-composer-label" htmlFor="workbench-composer-input">Ask Pulse</label>
            <textarea
                id="workbench-composer-input"
                ref={composerRef}
                className="workbench-composer-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submit();
                    }
                }}
                placeholder="Ask a grounded question about your data. Cmd/Ctrl+Enter to submit."
                disabled={disabled}
                rows={3}
                data-testid="workbench-composer-input"
            />
            <div className="workbench-composer-actions">
                <button
                    type="button"
                    onClick={submit}
                    disabled={disabled || draft.trim().length === 0}
                    className="workbench-composer-submit"
                    data-testid="workbench-composer-submit"
                >
                    {isStarting ? 'Starting…' : isPolling ? `Polling${upstreamStatus ? ` (${upstreamStatus})` : '…'}` : 'Ask'}
                </button>
                {livePromoted ? (
                    <button
                        type="button"
                        onClick={() => { setDraft(''); onReset(); }}
                        className="workbench-composer-reset"
                        data-testid="workbench-composer-reset"
                    >
                        Reset to demo
                    </button>
                ) : null}
            </div>
            {error ? (
                <div className="workbench-composer-error" role="alert" data-testid="workbench-composer-error">
                    {error.message || 'Conversation failed. See diagnostics.'}
                </div>
            ) : null}
            {sanitization && sanitization.mutated ? (
                <div className="workbench-composer-sanitization" role="status" data-testid="workbench-composer-sanitization">
                    Input was sanitized before send:
                    {sanitization.secretsHit.length > 0 ? <> redacted {sanitization.secretsHit.length} secret{sanitization.secretsHit.length === 1 ? '' : 's'} ({sanitization.secretsHit.join(', ')})</> : null}
                    {sanitization.injectionHit.length > 0 ? <> stripped {sanitization.injectionHit.length} injection keyword{sanitization.injectionHit.length === 1 ? '' : 's'} ({sanitization.injectionHit.join(', ')})</> : null}
                    .
                </div>
            ) : null}
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
