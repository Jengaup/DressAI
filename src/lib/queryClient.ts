import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 minutes before refetch in background
      gcTime: 1000 * 60 * 30,       // 30 minutes before cache eviction
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (auth/not-found)
        if (error instanceof Error && error.message.includes('4')) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 1,
    },
  },
});
