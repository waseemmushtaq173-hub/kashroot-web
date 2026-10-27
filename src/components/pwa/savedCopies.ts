'use client';

/**
 * Which public data on this page came from the copy saved on this phone.
 * The service worker (public/sw.js) answers mandi rates and weather from
 * that copy at once and tells the page { url, savedAt, fresh } — savedAt
 * null for an answer from the internet, fresh for a copy under a minute
 * old (shown as "Saved at" only with no signal) — and `updated` once a
 * fresher copy arrived behind it. useSavedAt gives a page its "Saved at".
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

interface Note {
  path: string;
  savedAt: number | null;
  fresh: boolean;
}

let notes: Note[] = [];
const listeners = new Set<() => void>();
const updates = new Set<(path: string) => void>();

function record(url: string, savedAt: number | null, fresh: boolean, updated: boolean) {
  let path = '';
  try {
    path = new URL(url, window.location.origin).pathname;
  } catch {
    return;
  }
  if (updated) {
    for (const fn of updates) fn(path);
    return;
  }
  notes = [...notes.filter((n) => n.path !== path), { path, savedAt, fresh }];
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: string; savedAt?: number | null; fresh?: boolean; updated?: boolean } | null;
    if (d?.type === 'kr-data' && typeof d.url === 'string') record(d.url, d.savedAt ?? null, d.fresh !== false, Boolean(d.updated));
  });
  // Messages wait until the page listens; it does now.
  navigator.serviceWorker.startMessages();
}

/** A new page: what the last page was shown no longer counts. */
export function forgetSavedCopies() {
  if (!notes.length) return;
  notes = [];
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Going offline turns a fresh copy into "Saved at".
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}

/** The saved time to show for this address, or null. */
function shown(path: string): number | null {
  const n = notes.find((x) => x.path === path);
  return n?.savedAt && (!n.fresh || !navigator.onLine) ? n.savedAt : null;
}

/**
 * When the last answer for this address (e.g. '/api/weather') was the copy
 * saved on this phone: the time it was saved (ms). Null when it was fresh.
 * `reload` runs when a fresher copy has arrived, and when the signal comes
 * back while the saved copy is showing.
 */
export function useSavedAt(path: string, reload?: () => void): number | null {
  const savedAt = useSyncExternalStore(
    subscribe,
    () => shown(path),
    () => null,
  );
  const again = useRef(reload);
  useEffect(() => {
    again.current = reload;
  });
  useEffect(() => {
    const fresher = (p: string) => {
      if (p === path) again.current?.();
    };
    const back = () => {
      if (notes.find((n) => n.path === path && n.savedAt && !n.fresh)) again.current?.();
    };
    updates.add(fresher);
    window.addEventListener('online', back);
    return () => {
      updates.delete(fresher);
      window.removeEventListener('online', back);
    };
  }, [path]);
  return savedAt;
}

/** "10:42 am" today, "10:42 am, 24 Oct" another day. */
export function savedTime(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${time}, ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}
