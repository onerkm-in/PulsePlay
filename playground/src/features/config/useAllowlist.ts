import { useQuery } from '@tanstack/react-query';
import { fetchAllowlistShared } from '../../lib/allowlistFetch';
import type { PulsePlayAllowlist } from '../../types/allowlist';

export const allowlistQueryKey = ['config', 'allowlist'] as const;

export function useAllowlist() {
    return useQuery<PulsePlayAllowlist, Error>({
        queryKey: allowlistQueryKey,
        retry: false,
        // Shared with the SettingsProvider's loader so one boot = ONE
        // allowlist request (COST-P2); see lib/allowlistFetch.ts.
        queryFn: () => fetchAllowlistShared(),
    });
}
