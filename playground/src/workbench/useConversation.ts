// playground/src/workbench/useConversation.ts
//
// React Query composition for the workbench's real conversation loop:
//   1. POST /api/assistant/conversations/start with { profile, content }.
//   2. Poll GET /api/assistant/conversations/:cid/messages/:mid?profile=...
//      until the upstream status is terminal (COMPLETED / FAILED / CANCELLED).
//   3. Map the terminal Genie message into a CandidateArtifact.
//   4. Run validateArtifact() — the validator is the sole authority for
//      artifact status. The LLM cannot self-declare.
//   5. Return the validated artifact + any Problem Details emitted by
//      the validator + the upstream Genie status so the UI can show
//      "still polling" vs "completed but blocked" distinctly.
//
// Apple-tree note: tests stub apiFetch by monkey-patching globalThis.fetch.
// The hook itself never imports anything that prevents tree-shaking.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiClient';
import { validateArtifact, type ValidationResult } from '../lib/artifactValidator';
import { GENIE_TERMINAL_STATUSES, isGenieTerminal, mapGenieMessageToCandidate, type GenieMessage } from './genieResponseMapper';
import type { ConnectorType } from '../types/assistant';

// ─────────────────────────────────────────────────────────────────────────
// Start response shape
// ─────────────────────────────────────────────────────────────────────────

export interface StartConversationResponse {
    readonly conversation_id?: string;
    readonly message_id?: string;
    readonly message?: GenieMessage;
    readonly conversation?: { readonly id?: string; readonly conversation_id?: string };
}

export interface ConversationStartedHandle {
    readonly conversationId: string;
    readonly messageId: string;
}

function extractHandle(start: StartConversationResponse): ConversationStartedHandle | null {
    const conversationId = start.conversation_id ?? start.conversation?.conversation_id ?? start.conversation?.id;
    const messageId = start.message_id ?? start.message?.id ?? start.message?.message_id;
    if (typeof conversationId !== 'string' || typeof messageId !== 'string') return null;
    if (!conversationId.trim() || !messageId.trim()) return null;
    return { conversationId, messageId };
}

// ─────────────────────────────────────────────────────────────────────────
// Hook options + result
// ─────────────────────────────────────────────────────────────────────────

export interface UseConversationOptions {
    readonly profile: string;
    readonly connectorType?: ConnectorType;
    /** Override the poll interval; default 2000 ms. */
    readonly pollIntervalMs?: number;
}

export interface UseConversationResult {
    /** Submit a new question. Resets prior state via reset() implicitly. */
    readonly ask: (content: string) => void;
    /** Reset the hook to its idle state. */
    readonly reset: () => void;
    /** True while the start request is in flight. */
    readonly isStarting: boolean;
    /** True while the poll is in flight and the upstream status is not terminal. */
    readonly isPolling: boolean;
    /** Upstream Genie status string, e.g. "SUBMITTED" / "EXECUTING" / "COMPLETED". */
    readonly upstreamStatus: string | undefined;
    /** Result of validateArtifact() — null until poll terminates. */
    readonly result: ValidationResult | null;
    /** Surfaced when start or poll fails OR when the upstream status is FAILED/CANCELLED. */
    readonly error: Error | null;
    /** True after a terminal poll, regardless of validator outcome. */
    readonly isTerminal: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;

// ─────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────

export function useConversation(opts: UseConversationOptions): UseConversationResult {
    const profile = opts.profile;
    const connectorType: ConnectorType = opts.connectorType ?? 'genie';
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const queryClient = useQueryClient();

    const startMutation: UseMutationResult<StartConversationResponse, Error, string> = useMutation({
        mutationFn: async (content: string): Promise<StartConversationResponse> => {
            const resp = await apiFetch('/api/assistant/conversations/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile, content }),
            });
            return resp.json();
        },
    });

    const handle = useMemo(() => startMutation.data ? extractHandle(startMutation.data) : null, [startMutation.data]);

    const pollQuery = useQuery<GenieMessage, Error>({
        queryKey: ['workbench', 'conversation-message', profile, handle?.conversationId, handle?.messageId],
        enabled: !!handle,
        retry: false,
        // Default cache settings — we want the polled response to be the
        // single source of truth for this conversation.
        queryFn: async () => {
            if (!handle) throw new Error('useConversation: poll started without a handle');
            const url = `/api/assistant/conversations/${encodeURIComponent(handle.conversationId)}/messages/${encodeURIComponent(handle.messageId)}?profile=${encodeURIComponent(profile)}`;
            const resp = await apiFetch(url);
            return resp.json();
        },
        refetchInterval: (q) => {
            const data = q.state.data as GenieMessage | undefined;
            if (data && isGenieTerminal(data.status)) return false;
            return pollIntervalMs;
        },
    });

    const upstreamStatus = pollQuery.data?.status;
    const isStarting = startMutation.isPending;
    const isTerminal = !!upstreamStatus && GENIE_TERMINAL_STATUSES.has(upstreamStatus);
    const isPolling = !!handle && !isTerminal && (pollQuery.isFetching || pollQuery.isPending);

    const result = useMemo<ValidationResult | null>(() => {
        if (!pollQuery.data || !isTerminal) return null;
        if (upstreamStatus !== 'COMPLETED') {
            // Surface FAILED / CANCELLED as a validator-blocked artifact so
            // the UI can render the same Blocked treatment used for the
            // chart-without-data path. We pass a minimally synthesized
            // candidate to the validator so the contract stays uniform.
            const blockedResult = validateArtifact({
                id: pollQuery.data.id ?? pollQuery.data.message_id ?? 'conversation-failure',
                sourceProfile: profile,
                sourceConnectorType: connectorType,
                // No payload — validator emits the empty-artifact blocked path
                // by default. We do not fabricate an "ungrounded chart" to
                // force the blocked path; empty-artifact is a real signal.
            });
            return blockedResult;
        }
        const candidate = mapGenieMessageToCandidate({ message: pollQuery.data, profile, connectorType });
        return validateArtifact(candidate);
    }, [pollQuery.data, isTerminal, upstreamStatus, profile, connectorType]);

    const startError = startMutation.error;
    const pollError = pollQuery.error;
    const upstreamError = upstreamStatus === 'FAILED'
        ? new Error(`Conversation failed upstream (status=${upstreamStatus}).`)
        : upstreamStatus === 'CANCELLED'
            ? new Error('Conversation cancelled upstream.')
            : null;

    const error: Error | null = startError ?? pollError ?? upstreamError ?? null;

    return {
        ask: (content: string) => {
            // Reset any prior poll cache so a fresh ask starts clean.
            if (handle) {
                queryClient.removeQueries({
                    queryKey: ['workbench', 'conversation-message', profile, handle.conversationId, handle.messageId],
                });
            }
            startMutation.reset();
            startMutation.mutate(content);
        },
        reset: () => {
            if (handle) {
                queryClient.removeQueries({
                    queryKey: ['workbench', 'conversation-message', profile, handle.conversationId, handle.messageId],
                });
            }
            startMutation.reset();
        },
        isStarting,
        isPolling,
        upstreamStatus,
        result,
        error,
        isTerminal,
    };
}
