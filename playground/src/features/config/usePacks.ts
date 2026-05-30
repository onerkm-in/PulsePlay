import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/apiClient';
import type { PackInfo } from '../../components/PackPicker';

export const packsQueryKey = ['config', 'packs'] as const;

export function usePacks() {
    return useQuery<PackInfo[], Error>({
        queryKey: packsQueryKey,
        queryFn: async () => {
            const resp = await apiFetch("/api/assistant/knowledge/packs");
            const data = await resp.json() as { packs?: PackInfo[] };
            return data.packs || [];
        },
    });
}
