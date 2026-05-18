// playground/src/workbench/__tests__/useConversation.test.tsx
//
// Step 6 - useConversation invariants.
//
// Coverage:
//   1. success — start + first-poll COMPLETED -> validated artifact
//   2. polling — SUBMITTED -> COMPLETED across multiple polls
//   3. failure — start request fails (API error)
//   4. blocked artifact — terminal FAILED upstream surfaces a blocked
//      validator result with an error
//   5. no-ungrounded behavior — answer-only Genie response validates
//      to suggestion, not verified; chart attempted without data is
//      rejected by the validator (here exercised via a tampered candidate
//      handed to validateArtifact directly to round out the contract).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { useConversation, type UseConversationResult } from '../useConversation';
import { validateArtifact } from '../../lib/artifactValidator';

// ─── Mount helpers ─────────────────────────────────────────────────────

interface MountState { container: HTMLElement; root: Root; queryClient: QueryClient; }

function mount(ui: React.ReactElement): MountState {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    act(() => { root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>); });
    return { container, root, queryClient };
}

function unmount(state: MountState) {
    act(() => { state.root.unmount(); });
    state.container.remove();
    state.queryClient.clear();
}

// Captures the hook result on every render so tests can assert against it.
const TestHarness: React.FC<{
    onResult: (r: UseConversationResult) => void;
    profile: string;
    pollIntervalMs?: number;
    askOnMount?: string;
}> = ({ onResult, profile, pollIntervalMs = 50, askOnMount }) => {
    const result = useConversation({ profile, pollIntervalMs });
    onResult(result);
    useEffect(() => {
        if (askOnMount) result.ask(askOnMount);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
};

let mounted: MountState | null = null;
let lastResult: UseConversationResult | null = null;
const captureResult = (r: UseConversationResult) => { lastResult = r; };

beforeEach(() => {
    mounted = null;
    lastResult = null;
    vi.useFakeTimers();
});
afterEach(() => {
    if (mounted) unmount(mounted);
    mounted = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ─── Fetch stub helpers ────────────────────────────────────────────────

interface StubScript {
    start: () => Response | Promise<Response>;
    polls: Array<() => Response | Promise<Response>>;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function installFetchStub(script: StubScript) {
    let pollIdx = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | Request | URL) => {
        const s = typeof url === 'string' ? url : url.toString();
        if (s.includes('/conversations/start')) {
            return script.start();
        }
        if (s.includes('/conversations/')) {
            const handler = script.polls[Math.min(pollIdx, script.polls.length - 1)];
            pollIdx++;
            return handler();
        }
        return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;
}

const SUPERSTORE_COMPLETED = {
    id: 'msg-1',
    message_id: 'msg-1',
    conversation_id: 'conv-1',
    status: 'COMPLETED',
    created_timestamp: 1000,
    last_updated_timestamp: 2000,
    content: 'Top 3 categories: Technology, Furniture, Office Supplies.',
    attachments: [
        {
            query: {
                query: 'SELECT category, SUM(sales) FROM x GROUP BY category',
                statement_id: 'st-1',
                query_result_metadata: { row_count: 3 },
                result: {
                    columns: [{ name: 'category', type: 'STRING' }, { name: 'sales', type: 'DECIMAL' }],
                    data_table: [['Tech', '836154.03']],
                    row_count: 1,
                },
            },
        },
    ],
};

async function flush() {
    // Push pending microtasks + scheduled timers through.
    await act(async () => {
        await Promise.resolve();
        vi.runOnlyPendingTimers();
        await Promise.resolve();
    });
}

// ─── 1. Success ────────────────────────────────────────────────────────

describe('useConversation — success path', () => {
    it('emits a validated verified artifact when start succeeds and first poll is COMPLETED', async () => {
        installFetchStub({
            start: () => jsonResponse({ conversation_id: 'conv-1', message_id: 'msg-1' }),
            polls: [() => jsonResponse(SUPERSTORE_COMPLETED)],
        });

        mounted = mount(<TestHarness onResult={captureResult} profile="default" askOnMount="Top 3 categories?" />);
        await flush();
        await flush();
        await flush();

        expect(lastResult).not.toBeNull();
        expect(lastResult!.isTerminal).toBe(true);
        expect(lastResult!.upstreamStatus).toBe('COMPLETED');
        expect(lastResult!.error).toBeNull();
        expect(lastResult!.result).not.toBeNull();
        expect(lastResult!.result!.artifact.status).toBe('verified');
        expect(lastResult!.result!.artifact.sourceProfile).toBe('default');
        expect(lastResult!.result!.artifact.sourceConnectorType).toBe('genie');
        expect(lastResult!.result!.overrodeLlmStatus).toBe(false);
    });
});

// ─── 2. Polling ────────────────────────────────────────────────────────

describe('useConversation — polling progression', () => {
    it('keeps polling on SUBMITTED then settles when COMPLETED arrives', async () => {
        installFetchStub({
            start: () => jsonResponse({ conversation_id: 'conv-1', message_id: 'msg-1' }),
            polls: [
                () => jsonResponse({ status: 'SUBMITTED', id: 'msg-1' }),
                () => jsonResponse({ status: 'EXECUTING', id: 'msg-1' }),
                () => jsonResponse(SUPERSTORE_COMPLETED),
            ],
        });

        mounted = mount(<TestHarness onResult={captureResult} profile="default" pollIntervalMs={20} askOnMount="Top 3?" />);

        // Allow the start mutation + first poll to settle.
        await flush();
        await flush();
        expect(lastResult?.upstreamStatus === 'SUBMITTED' || lastResult?.upstreamStatus === 'EXECUTING' || lastResult?.upstreamStatus === undefined).toBe(true);
        expect(lastResult?.isTerminal).toBe(false);
        expect(lastResult?.result).toBeNull();

        // Advance the poll interval a few times.
        for (let i = 0; i < 5; i++) {
            await act(async () => { vi.advanceTimersByTime(40); });
            await flush();
        }

        expect(lastResult?.isTerminal).toBe(true);
        expect(lastResult?.upstreamStatus).toBe('COMPLETED');
        expect(lastResult?.result?.artifact.status).toBe('verified');
    });
});

// ─── 3. Failure ────────────────────────────────────────────────────────

describe('useConversation — start failure', () => {
    it('surfaces an error and never enters polling', async () => {
        installFetchStub({
            start: () => new Response(JSON.stringify({ title: 'Server error', detail: 'simulated' }), {
                status: 500,
                headers: { 'content-type': 'application/problem+json' },
            }),
            polls: [],
        });

        mounted = mount(<TestHarness onResult={captureResult} profile="default" askOnMount="?" />);
        await flush();
        await flush();

        expect(lastResult?.error).not.toBeNull();
        expect(lastResult?.error?.message).toMatch(/simulated|Server error/i);
        expect(lastResult?.isPolling).toBe(false);
        expect(lastResult?.result).toBeNull();
    });
});

// ─── 4. Blocked artifact via FAILED upstream ───────────────────────────

describe('useConversation — terminal FAILED upstream', () => {
    it('produces a validator-blocked result and surfaces an error', async () => {
        installFetchStub({
            start: () => jsonResponse({ conversation_id: 'conv-1', message_id: 'msg-1' }),
            polls: [() => jsonResponse({ status: 'FAILED', id: 'msg-1' })],
        });

        mounted = mount(<TestHarness onResult={captureResult} profile="default" askOnMount="?" />);
        await flush();
        await flush();
        await flush();

        expect(lastResult?.isTerminal).toBe(true);
        expect(lastResult?.upstreamStatus).toBe('FAILED');
        expect(lastResult?.error?.message).toMatch(/failed upstream/i);
        expect(lastResult?.result?.artifact.status).toBe('blocked');
        expect(lastResult?.result?.problem).toBeDefined();
        expect(lastResult?.result?.problem?.category).toBe('workbench.validation');
    });
});

// ─── 5. No-ungrounded-artifacts behavior ───────────────────────────────

describe('useConversation — no ungrounded artifacts', () => {
    it('answer-only Genie response validates to suggestion (never verified)', async () => {
        installFetchStub({
            start: () => jsonResponse({ conversation_id: 'conv-1', message_id: 'msg-1' }),
            polls: [() => jsonResponse({
                id: 'msg-1',
                status: 'COMPLETED',
                content: 'You might consider profit margin trends.',
                created_timestamp: 1000,
                last_updated_timestamp: 1100,
            })],
        });

        mounted = mount(<TestHarness onResult={captureResult} profile="default" askOnMount="?" />);
        await flush();
        await flush();
        await flush();

        expect(lastResult?.result?.artifact.status).toBe('suggestion');
        expect(lastResult?.result?.artifact.tabs).toEqual(['answer']);
    });

    it('validator rejects an injected ungrounded chart even if status was claimed as verified', () => {
        // Direct exercise of the contract: a candidate that the mapper would
        // never produce (chart without grounding) MUST still be blocked by
        // the validator. This pins the no-ungrounded guarantee at the
        // validator boundary the hook depends on.
        const result = validateArtifact({
            id: 'injected',
            llmClaimedStatus: 'verified',
            chart: { mark: 'bar', data: { values: [{ x: 1 }] }, encoding: {} },
        });
        expect(result.artifact.status).toBe('blocked');
        expect(result.overrodeLlmStatus).toBe(true);
        expect(result.problem?.type).toContain('ungrounded-data-payload');
    });
});
