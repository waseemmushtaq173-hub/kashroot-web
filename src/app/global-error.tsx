'use client';

import { useEffect } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import './globals.css';

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
      <body className="antialiased font-sans">
        <div className="flex min-h-screen flex-col items-center justify-center bg-transparent p-4 text-center">
          <div className="kr-glass rounded-3xl shadow-xl border border-kr-border-default max-w-lg w-full p-8 md:p-12">
            <div className="w-20 h-20 bg-kr-badge-rejected-bg rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-[#E76F51]" />
            </div>
            
            <h1 className="text-3xl font-extrabold text-[#1B4332] mb-3 font-heading tracking-tight">
              Something went wrong on our end
            </h1>
            
            <p className="text-kr-text-secondary mb-8 max-w-sm mx-auto">
              We encountered an unexpected server error while trying to process your request. Our engineering team has been notified.
            </p>
            
            <button
              onClick={() => reset()}
              className="bg-[#E76F51] hover:bg-[#D4A373] text-white font-bold py-4 px-8 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto mx-auto"
            >
              <RefreshCw className="w-5 h-5" />
              Try Again
            </button>

            {process.env.NODE_ENV === 'development' && error?.message && (
              <div className="mt-8 text-left bg-kr-bg-sunken p-4 rounded-xl border border-kr-border-default overflow-auto max-h-40">
                <p className="text-sm font-mono text-kr-badge-rejected-text">{error.message}</p>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
