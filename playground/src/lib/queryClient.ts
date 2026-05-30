import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient';

/**
 * Standard React Query contract for PulsePlay Phase 1 Server State
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Stale policy: High staleTime for config/governance data like allowlists/packs.
            // Data is considered fresh for 5 minutes.
            staleTime: 5 * 60 * 1000, 
            
            // Retry defaults: Only retry if the error explicitly says it's retryable or is a 5xx.
            retry: (failureCount, error) => {
                if (failureCount >= 3) return false;
                if (error instanceof ApiError) {
                    if (error.retryable === false) return false;
                    if (error.status >= 500) return true;
                    if (error.status === 429) return true; // Rate limits
                    return false; // 400s usually shouldn't be retried blindly
                }
                // Network errors
                return true;
            },
            
            // Query key shape: All keys should be an array of strings/objects
            // Example: ['allowlist'], ['packs'], ['profile', id]
            
            // Avoid refetching on window focus for standard config data to reduce proxy load
            refetchOnWindowFocus: false,
        },
    },
});
