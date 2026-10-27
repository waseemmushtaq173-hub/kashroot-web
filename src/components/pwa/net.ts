'use client';

/**
 * Is this phone online? Read from the browser (navigator.onLine and its
 * online / offline events), and what to say when something needs the
 * internet. Orders, bookings, payments and the identity check are never
 * kept for later: without signal they say NEEDS_INTERNET.
 */
import { useSyncExternalStore } from 'react';

export const NEEDS_INTERNET = 'You are offline — this needs the internet. Try again when you have signal.';

function subscribe(fn: () => void) {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}

/** True while the browser says it is online (true on the server and during the first render). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** No signal right now (as far as the browser knows). */
export const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Did this fail for want of signal? The browser's own fetch errors, the
 * database helpers' "Could not reach KashRoot" / "You are offline"
 * (lib/db/client dbMessage), and the service worker's "You are offline"
 * answer (public/sw.js).
 */
export function isOfflineError(err: unknown): boolean {
  if (offlineNow()) return true;
  const m = err instanceof Error ? err.message : typeof err === 'string' ? err : String((err as { message?: unknown } | null)?.message ?? '');
  return /Failed to fetch|NetworkError|Load failed|network connection was lost|No internet connection|Could not reach KashRoot|You are offline/i.test(m);
}
