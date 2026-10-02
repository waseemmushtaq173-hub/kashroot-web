'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthContext';

/**
 * Providers — client-side context providers mounted at the app root.
 *
 * QueryClient is created lazily inside useState so a single instance is
 * preserved across re-renders while remaining per-request on the server
 * (avoids leaking cached data between users during SSR).
 *
 * AuthProvider supplies the decoded JWT identity. It must wrap every route
 * that calls useAuth(), which throws outside of it.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
