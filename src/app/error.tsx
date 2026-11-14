'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Home, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

/**
 * The portal's error boundary. A crash here used to hide behind a generic
 * screen; now it shows the real exception, and recovers on its own when the
 * cause is a stale chunk left over from a deploy (ChunkLoadError): the most
 * common crash on a phone that had the portal open while the site updated.
 */

/** Values that look like JSON but fail to parse are corrupt: drop them. */
function clearCorruptedKeys(): void {
  if (typeof window === 'undefined') return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (let i = store.length - 1; i >= 0; i--) {
      const key = store.key(i);
      if (!key) continue;
      const raw = store.getItem(key);
      if (raw === null) continue;
      // Only stored JSON can be corrupt in a way that crashes a render.
      // Plain strings (names, ids, flags) are left alone.
      const first = raw.charAt(0);
      if (first !== '{' && first !== '[' && first !== '"') continue;
      try {
        JSON.parse(raw);
      } catch {
        store.removeItem(key);
      }
    }
  }
}

/** A stale chunk from an older deploy (the page was open while the site updated). */
function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${error.stack ?? ''}` : String(error ?? '');
  return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text);
}

/** The app's own cached state (kr_* keys), kept out of a hard reset. */
function clearPortalState(): void {
  if (typeof window === 'undefined') return;
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        // The Supabase auth session (sb-…) survives: clearing it would sign the
        // person out everywhere, and it is not what poisons a render.
        if (key && (key.startsWith('kr_') || key === 'user_roles')) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    } catch {
      /* storage blocked: nothing to clear */
    }
  }
  // Old service-worker caches serve stale chunks on some phones.
  try {
    void navigator.serviceWorker?.getRegistrations?.().then((regs) => regs.forEach((r) => void r.update()));
  } catch {
    /* no service worker: nothing to refresh */
  }
  window.location.reload();
}

export default function GlobalError({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    console.error(error);
    clearCorruptedKeys();
    // One automatic recovery for a stale chunk: never loop.
    if (isChunkLoadError(error)) {
      try {
        if (!window.sessionStorage.getItem('kr_chunk_reset_done')) {
          window.sessionStorage.setItem('kr_chunk_reset_done', '1');
          setRecovered(true);
          reset();
          return;
        }
      } catch {
        /* storage blocked: just show the screen */
      }
    }
    window.sessionStorage.removeItem('kr_chunk_reset_done');
  }, [error, reset]);

  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const digest = error instanceof Error && 'digest' in error && typeof (error as { digest?: unknown }).digest === 'string' ? (error as { digest: string }).digest : null;

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-4 text-center">
      <div className="bg-red-500/10 p-4 rounded-full mb-6">
        <AlertTriangle className="w-12 h-12 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Something went wrong!</h2>
      <p className="text-white/60 mb-4 max-w-md">
        {recovered
          ? 'The portal was holding files from an older update. Reloading it fresh…'
          : 'We encountered an unexpected error while rendering this portal. Please try again or return home.'}
      </p>

      <div className="mb-6 w-full max-w-2xl rounded-xl bg-slate-950/80 p-4 text-left ring-1 ring-red-500/30">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-400">
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Error details
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-slate-200">{message}</pre>
        {digest && <p className="mt-2 font-mono text-[11px] text-slate-500">digest: {digest}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 bg-[#D4AF37] hover:bg-[#B37A0B] text-black px-6 py-3 rounded-xl font-bold transition-colors shadow-lg"
        >
          <RotateCcw className="w-5 h-5" /> Try Again
        </button>
        <a
          href="/"
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold transition-colors ring-1 ring-white/20"
        >
          <Home className="w-5 h-5" /> Return Home
        </a>
        <button
          onClick={clearPortalState}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg"
        >
          <RefreshCw className="w-5 h-5" /> Clear Portal State &amp; Reload
        </button>
      </div>
    </div>
  );
}
