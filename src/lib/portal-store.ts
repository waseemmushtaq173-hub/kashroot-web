'use client';

/**
 * usePersistentState — React state that lives in localStorage, for the portal
 * dashboards whose features have no backend endpoint yet (catalogues, carts,
 * spray logs, inquiries …). Same idea as the `kr_mock_*` keys used elsewhere
 * in this repo, with three guarantees those ad-hoc reads lack:
 *
 *   - SSR-safe: the server render and the first client render both use the
 *     seed, so there is no hydration mismatch; stored data swaps in after.
 *   - Shared: every component reading the same key re-renders on a write, in
 *     this tab and (via the `storage` event) in other tabs.
 *   - Stable: snapshots are cached per raw string, as useSyncExternalStore
 *     requires — so SEEDS MUST BE MODULE-LEVEL CONSTANTS, never inline
 *     literals, or every render would hand React a "new" value.
 *
 * When an API exists for a feature, replace that key's usage with a query; the
 * component code around it does not need to change shape.
 */
import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode / storage disabled
  }
}

function snapshot<T>(key: string, seed: T): T {
  const raw = readRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return (raw === null ? seed : hit.value) as T;
  let value: unknown = seed;
  if (raw !== null) {
    try {
      value = JSON.parse(raw);
    } catch {
      value = seed;
    }
  }
  cache.set(key, { raw, value });
  return value as T;
}

export function usePersistentState<T>(
  key: string,
  seed: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot(key, seed),
    () => seed,
  );

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = snapshot(key, seed);
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // Storage full or disabled: keep the in-memory value for this session.
        cache.set(key, { raw: JSON.stringify(resolved), value: resolved });
      }
      listeners.forEach((listener) => listener());
    },
    [key, seed],
  );

  return [value, setValue];
}

/** Short unique id for locally created records. */
export function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}
