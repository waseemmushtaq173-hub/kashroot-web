'use client';

/**
 * Real connectivity detection with health checks.
 * Not just navigator.onLine — actually pings a lightweight endpoint.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { recordConnectivity, hasRecentConnectivity, getConnectivityHistory } from './offlineDb';

export const CONNECTIVITY_ENDPOINT = '/api/health'; // Lightweight endpoint
export const CONNECTIVITY_TIMEOUT_MS = 3000;
export const CONNECTIVITY_CHECK_INTERVAL_MS = 30_000; // 30 seconds when online
export const CONNECTIVITY_CHECK_INTERVAL_OFFLINE_MS = 10_000; // 10 seconds when offline

interface ConnectivityState {
  online: boolean;
  latencyMs: number | null;
  lastCheck: number | null;
  lastOnline: number | null;
}

/** In-memory state for fast reads. */
let state: ConnectivityState = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  latencyMs: null,
  lastCheck: null,
  lastOnline: typeof navigator !== 'undefined' && navigator.onLine ? Date.now() : null,
};

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return { online: true, latencyMs: null, lastCheck: null, lastOnline: Date.now() };
}

/** React hook for connectivity state (uses sync external store). */
export function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Run a single health check. */
export async function checkConnectivity(): Promise<{ online: boolean; latencyMs: number | null; error?: string }> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);

    const res = await fetch(CONNECTIVITY_ENDPOINT, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Math.round(performance.now() - start);
    const online = res.ok;

    const record = {
      timestamp: Date.now(),
      online,
      latencyMs: online ? latencyMs : null,
      endpoint: CONNECTIVITY_ENDPOINT,
      error: online ? undefined : `HTTP ${res.status}`,
    };
    await recordConnectivity(record);

    state = { ...state, online, latencyMs: online ? latencyMs : null, lastCheck: Date.now(), lastOnline: online ? Date.now() : state.lastOnline };
    notify();

    return { online, latencyMs: online ? latencyMs : null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const error = err instanceof Error ? err.message : 'Unknown error';

    const record = {
      timestamp: Date.now(),
      online: false,
      latencyMs: null,
      endpoint: CONNECTIVITY_ENDPOINT,
      error,
    };
    await recordConnectivity(record);

    state = { ...state, online: false, latencyMs: null, lastCheck: Date.now() };
    notify();

    return { online: false, latencyMs: null, error };
  }
}

/** Start periodic connectivity checks. */
export function startConnectivityChecks(): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isChecking = false;

  const runCheck = async () => {
    if (isChecking) return;
    isChecking = true;
    await checkConnectivity();
    isChecking = false;
  };

  // Initial check
  runCheck();

  // Schedule recurring checks
  const scheduleNext = () => {
    const delay = state.online ? CONNECTIVITY_CHECK_INTERVAL_MS : CONNECTIVITY_CHECK_INTERVAL_OFFLINE_MS;
    intervalId = setTimeout(() => {
      runCheck().finally(scheduleNext);
    }, delay);
  };
  scheduleNext();

  // Also check on visibility change and online/offline events
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') runCheck();
  };
  const onOnline = () => runCheck();
  const onOffline = () => {
    state = { ...state, online: false, lastCheck: Date.now() };
    notify();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    if (intervalId) clearTimeout(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

/** Check if we have recent successful connectivity (for "stale data" banners). */
export async function isRecentlyOnline(maxAgeMs = 5 * 60 * 1000): Promise<boolean> {
  return hasRecentConnectivity(maxAgeMs);
}

/** Get connectivity history for debugging. */
export async function getRecentConnectivity(limit = 20) {
  return getConnectivityHistory(limit);
}

/** Format latency for display. */
export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}