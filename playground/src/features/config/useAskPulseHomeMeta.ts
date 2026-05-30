import { useEffect, useState } from 'react';

/**
 * UX-VIEWER-1.2B — Ask Pulse home metadata hook.
 *
 * Calls the proxy `/assistant/home-meta` endpoint to fetch the data
 * identity (displayName + description) and curated starter questions for
 * the active AI profile. The shape mirrors what the Databricks Genie UI
 * uses to populate its empty state — but works across every PulsePlay
 * backend (Genie, Foundation Model, Bedrock, Supervisor, ResponsesAgent,
 * Power BI semantic-model) via the proxy's per-profile branching.
 *
 * Implementation note: this hook uses plain `useState` + `useEffect` +
 * `fetch` rather than React Query because its primary consumer (the
 * Pulse-port `visual.tsx`) mounts its own nested React root that lives
 * OUTSIDE PulsePlay's `QueryClientProvider`. `useQuery` would crash
 * there at runtime with "No QueryClient set". Plain fetch keeps the hook
 * portable to any React context and matches the existing Pulse-port
 * XHR-only pattern documented in CLAUDE.md.
 *
 * Strategy context: PulsePlay is the enabler — features and flexibility
 * are built into PulsePlay's own chat surface, not embedded from any
 * single vendor. This hook gives every backend the same rich starter
 * affordances that Genie users get from `serialized_space.sample_questions`.
 */
export interface AskPulseHomeMetaQuestion {
    id: string;
    text: string;
    category: string;
}

export interface AskPulseHomeMeta {
    displayName: string | null;
    description: string | null;
    curatedQuestions: AskPulseHomeMetaQuestion[];
    /**
     * Provenance tag so the FE can label the source honestly:
     * - "genie" → real Genie space metadata + curated questions
     * - "genie-no-curated" → real Genie identity + pack evergreen fallback
     * - "genie-fetch-failed" → Databricks call failed; pack evergreen fallback
     * - "pack-fallback" → non-Genie profile; pack evergreen
     * - "no-profile" → no profile resolved; default evergreen
     */
    source:
        | 'genie'
        | 'genie-no-curated'
        | 'genie-fetch-failed'
        | 'pack-fallback'
        | 'no-profile';
    spaceId?: string;
    fetchedAt?: string;
}

export interface UseAskPulseHomeMetaArgs {
    assistantProfile: string | undefined;
    pack?: string | null;
    subVertical?: string | null;
}

export interface UseAskPulseHomeMetaResult {
    data: AskPulseHomeMeta | undefined;
    isLoading: boolean;
    error: Error | null;
}

export function useAskPulseHomeMeta(args: UseAskPulseHomeMetaArgs): UseAskPulseHomeMetaResult {
    const [data, setData] = useState<AskPulseHomeMeta | undefined>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    const key = `${args.assistantProfile || ''}|${args.pack || ''}|${args.subVertical || ''}`;

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (args.assistantProfile) params.set('assistantProfile', args.assistantProfile);
        if (args.pack) params.set('pack', args.pack);
        if (args.subVertical) params.set('subVertical', args.subVertical);
        const url = `/api/assistant/home-meta${params.toString() ? `?${params.toString()}` : ''}`;

        fetch(url, { headers: { Accept: 'application/json' } })
            .then(async (resp) => {
                if (!resp.ok) {
                    // Silently degrade: caller falls through to STATIC_ACTIONS.
                    // No error surfaced to the UI — the existing allowlist chip
                    // already covers proxy-unreachable signal.
                    if (!cancelled) {
                        setData(undefined);
                        setIsLoading(false);
                    }
                    return;
                }
                const body = await resp.json() as AskPulseHomeMeta;
                if (!cancelled) {
                    setData({
                        displayName: body.displayName ?? null,
                        description: body.description ?? null,
                        curatedQuestions: Array.isArray(body.curatedQuestions) ? body.curatedQuestions : [],
                        source: body.source ?? 'no-profile',
                        spaceId: body.spaceId,
                        fetchedAt: body.fetchedAt,
                    });
                    setIsLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setIsLoading(false);
                }
            });

        return () => { cancelled = true; };
    // We key the effect on the composed cache key rather than the individual
    // args so a stable string change is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { data, isLoading, error };
}
