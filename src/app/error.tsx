"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-4 text-center">
      <div className="bg-red-500/10 p-4 rounded-full mb-6">
        <AlertTriangle className="w-12 h-12 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Something went wrong!</h2>
      <p className="text-white/60 mb-8 max-w-md">
        We encountered an unexpected error while rendering this portal. Please try again or return home.
      </p>
      <button
        onClick={() => reset()}
        className="flex items-center gap-2 bg-[#D4AF37] hover:bg-[#B37A0B] text-black px-6 py-3 rounded-xl font-bold transition-colors shadow-lg"
      >
        <RotateCcw className="w-5 h-5" /> Try Again
      </button>
    </div>
  );
}

