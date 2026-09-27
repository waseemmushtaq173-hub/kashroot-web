'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Error — route-subtree boundary. The root layout (and globals.css) is still
 * mounted here, so design tokens / component classes are available.
 *
 * Catches render-time exceptions in any page under the app tree and offers a
 * reset, instead of letting the crash bubble up to a raw 500.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 py-16 text-center bg-kr-bg-page"
    >
      <div className="w-12 h-12 rounded-full bg-kr-fill-brand-subtle flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-kr-danger-600" aria-hidden="true" />
      </div>
      <h1 className="font-heading text-h2 text-kr-text-primary">Something went wrong</h1>
      <p className="text-body text-kr-text-secondary max-w-md">
        We hit an unexpected error while loading this page. This is often
        temporary — please try again in a moment.
      </p>
      {error.digest && (
        <p className="text-caption text-kr-text-disabled">Reference: {error.digest}</p>
      )}
      <button onClick={reset} className="kr-btn-primary kr-btn-lg mt-2">
        <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again
      </button>
    </main>
  );
}
