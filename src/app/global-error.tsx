'use client';

import { useEffect } from 'react';

/**
 * GlobalError — last-resort boundary for errors thrown in the ROOT layout.
 *
 * When this renders, the root layout (and its globals.css) has NOT mounted,
 * so it must supply its own <html>/<body> and use inline styles only.
 * Catches render-time crashes that would otherwise surface on Vercel as a
 * raw FUNCTION_INVOCATION_FAILED, and logs the error for the runtime logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('GlobalError boundary caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#faf9f7', color: '#1a1a1a' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Something went wrong</h1>
          <p style={{ maxWidth: '28rem', color: '#666', margin: 0, lineHeight: 1.5 }}>
            The page failed to load. This is usually temporary — please try again.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#999', margin: 0 }}>Reference: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: '0.5rem', padding: '0.625rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#f5a623', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
