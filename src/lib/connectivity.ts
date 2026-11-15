'use client';

/**
 * Online-first connectivity manager (the genuine one).
 *
 * "Online" is claimed only when BOTH the browser's network stack says so
 * AND a live probe of /api/health — which reads a real Supabase table —
 * succeeds. Nothing is hidden with CSS, nothing is hardcoded to "online",
 * and no stale localStorage banner survives a successful probe:
 *
 *   - `useOnlineFirst()` — React hook (safe with SSR: the server snapshot
 *     is online; the first client probe corrects it).
 *   - When the probe succeeds, stale offline flags and queued-action
 *     banners are cleared from localStorage / sessionStorage, and service
 *     workers that served a stale cached page over a live connection are
 *     unregistered (one guarded reload per session).
 *   - When a specific API or query fails while online, callers show their
 *     own accurate, service-specific error — never a fake global
 *     "No Internet Connection" banner.
 */

import { useSyncExternalStore } from 'react';

export const HEALTH_ENDPOINT = '/api/health';
const PROBE_TIMEOUT_MS = 3000;

export interface OnlineFirstState {
  /** True only when the browser is not offline AND the health probe succeeded. */
  online: boolean;
  /** What the browser's own network stack says (navigator.onLine). */
  browserOnline: boolean;
  /** The probe's own verdict about the Supabase data layer. */
  supabaseConnected: boolean | null;
  latencyMs: number | null;
  lastCheck: number | null;
}

interface InternalState extends OnlineFirstState {
  browserOnline: boolean;
}

let state: InternalState = {
  online: true,
  supabaseConnected: null,
  latencyMs: null,
  lastCheck: null,
  browserOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
};

const listeners = new Set<() => void>();

function notify() {
  state = { ...state };
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const serverSnapshot: OnlineFirstState = { online: true, browserOnline: true, supabaseConnected: null, latencyMs: null, lastCheck: null };

export function useOnlineFirst(): OnlineFirstState {
  // useSyncExternalStore keeps every consumer in sync with one probe loop.
  return useSyncExternalStore(subscribe, () => state, () => serverSnapshot);
}

/** Keys the offline stack writes; all are cleared the moment health succeeds. */
const STALE_KEYS = [
  'kr_offline',
  'kr_offline_banner',
  'kr_offline_since',
  'kr_saved_banner',
  'kr_queued_actions_banner',
  'kr_sync_pending_banner',
];

/** One reload after a broken service worker was removed, per session. */
const SW_RELOAD_FLAG = 'kr_sw_reloaded';

function clearStaleOfflineFlags() {
  try {
    for (const key of STALE_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    /* storage blocked (private mode) — nothing to clear */
  }
}

/** Unregister service workers that served stale cache over a live connection. */
async function unregisterBrokenServiceWorkers(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    // A cached page handed to us by the worker while health succeeds = broken.
    const cachedPage = performance.getEntriesByType('navigation').length > 0
      ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).transferSize === 0
      : false;
    const registrations = await navigator.serviceWorker.getRegistrations();
    let removed = false;
    for (const reg of registrations) {
      const script = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? '';
      const ours = script.endsWith('/sw.js');
      if (!ours || (cachedPage && reg.active)) {
        await reg.unregister();
        removed = true;
      }
    }
    if (removed) {
      try {
        if (!sessionStorage.getItem(SW_RELOAD_FLAG)) {
          sessionStorage.setItem(SW_RELOAD_FLAG, '1');
          window.location.reload();
        }
      } catch {
        /* private mode: no guarded reload */
      }
    }
    return removed;
  } catch {
    return false;
  }
}

export interface ProbeResult {
  online: boolean;
  supabaseConnected: boolean;
  latencyMs: number;
  error?: string;
}

/** One live probe: the browser must be online and /api/health must read Supabase. */
export async function probeHealth(): Promise<ProbeResult> {
  const started = performance.now();
  const browserOnline = navigator.onLine;
  if (!browserOnline) {
    state = { ...state, browserOnline, online: false, supabaseConnected: null, latencyMs: null, lastCheck: Date.now() };
    notify();
    return { online: false, supabaseConnected: false, latencyMs: 0, error: 'browser-offline' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(HEALTH_ENDPOINT, { method: 'GET', cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - started);
    let body: { ok?: boolean; online?: boolean; supabaseConnected?: boolean; error?: string | null } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* a 502/503 body may not parse */
    }
    const ok = res.ok && (body.ok ?? true);
    const connected = Boolean(body.supabaseConnected ?? ok);
    state = { browserOnline, online: ok, supabaseConnected: connected, latencyMs: ok ? latencyMs : null, lastCheck: Date.now() };
    notify();
    if (ok) {
      clearStaleOfflineFlags();
      await unregisterBrokenServiceWorkers();
    }
    return { online: ok, supabaseConnected: connected, latencyMs, error: ok ? undefined : body.error ?? `HTTP ${res.status}` };
  } catch (err) {
    state = { browserOnline, online: false, supabaseConnected: null, latencyMs: null, lastCheck: Date.now() };
    notify();
    return { online: false, supabaseConnected: false, latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'probe failed' };
  }
}

let started = false;

/** Start the probe loop (initial probe now, then every 30 s / 10 s when offline). */
export function startOnlineFirstChecks(): () => void {
  if (started) return () => undefined;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    await probeHealth();
    busy = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, state.online ? 30_000 : 10_000);
  };
  void run();
  const onOnline = () => void run();
  const onOffline = () => {
    state = { ...state, browserOnline: false, online: false, latencyMs: null, lastCheck: Date.now() };
    notify();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void run();
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    started = false;
    if (timer) clearTimeout(timer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Accurate, service-specific failure text — never a fake global banner. */
export function describeFailure(what: string, error?: string | null): string {
  if (state.online) return error ? `${what}: ${error}` : `${what} did not go through just now. Try again.`;
  return `${what} needs the internet, and KashRoot cannot reach it right now. It will keep your work safe and send it when you are back online.`;
}
