import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000, // 10s — app uses PTY/events for real-time updates
      gcTime: 5 * 60_000, // 5 min garbage collection
      refetchOnWindowFocus: false, // app uses PTY/events for real-time updates
      refetchOnReconnect: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
