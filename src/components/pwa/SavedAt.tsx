'use client';

/**
 * "Saved at 10:42 am": shown next to mandi rates and weather that came from
 * the copy saved on this phone (no signal, or the internet too slow).
 * "Last updated 10:42 am": the KashRoot server's last good copy, shown when
 * the source itself (Open-Meteo, Agmarknet…) is not answering.
 */
import { History } from 'lucide-react';

import { savedTime } from './savedCopies';

export function SavedAt({ at, className = '' }: { at: number | null | undefined; className?: string }) {
  if (!at) return null;
  return (
    <span role="status" title="The copy saved on this phone. A fresh one shows as soon as the internet allows." className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 ${className}`}>
      <History className="h-4 w-4" aria-hidden /> Saved at {savedTime(at)}
    </span>
  );
}

/** `at`: when the source gave this copy (ISO time); `source`: who is not answering ("Open-Meteo"). */
export function LastUpdated({ at, source, className = '' }: { at: string | null | undefined; source: string; className?: string }) {
  const ms = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(ms)) return null;
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 ${className}`}>
      <History className="h-4 w-4 shrink-0" aria-hidden /> Last updated {savedTime(ms)} · {source} is not answering just now
    </span>
  );
}
