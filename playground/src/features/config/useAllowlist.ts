import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';
import type { PulsePlayAllowlist } from '../../types/allowlist';

export const allowlistQueryKey = ['config', 'allowlist'] as const;

export function useAllowlist() {
    return useQuery<PulsePlayAllowlist, Error>({
        queryKey: allowlistQueryKey,
        retry: false,
        queryFn: async () => {
            const resp = await apiFetch("/api/assistant/allowlist");
            return resp.json();
        },
    });
}
