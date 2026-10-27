'use client';

/**
 * "Your area: Jammu & Kashmir" — the state whose crops are shown first
 * (lib/region.ts), with "Use my location" (asks the phone) and a list to
 * choose the state by hand. Used by the voice assistant and the shops.
 */
import { Loader2, LocateFixed, MapPin } from 'lucide-react';

import { stateLabel, STATES, useRegion } from '@/lib/region';

export function RegionChip({ district, className = '' }: { district?: string | null; className?: string }) {
  const { region, crops, locating, problem, locate, choose } = useRegion({ district });
  const how = region?.from === 'location' ? ' (from your location)' : region?.from === 'district' ? ' (from My details)' : '';
  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm text-slate-700 ${className}`}>
      <p className="flex items-center gap-1.5" aria-live="polite">
        <MapPin className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        {region ? (
          <span>
            Your area: <strong className="text-slate-900">{stateLabel(region.state)}</strong>
            {how}
            {crops.length === 0 && ' — no crop list for it yet'}
          </span>
        ) : (
          <span>Show your area’s crops first:</span>
        )}
      </p>
      <button
        type="button"
        onClick={() => void locate()}
        disabled={locating}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 font-semibold text-slate-800 ring-1 ring-slate-900/10 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
      >
        {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}
        {locating ? 'Finding…' : 'Use my location'}
      </button>
      <label className="inline-flex items-center">
        <span className="sr-only">Your state</span>
        <select value={region?.state ?? ''} onChange={(e) => choose(e.target.value)} className="min-h-11 max-w-[14rem] cursor-pointer rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-slate-900/10 focus:ring-2 focus:ring-emerald-600">
          <option value="">Choose your state</option>
          {STATES.map((s) => (
            <option key={s.name} value={s.name}>{stateLabel(s.name)}</option>
          ))}
        </select>
      </label>
      {problem && <p role="status" className="w-full rounded-xl bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-200">{problem}</p>}
    </div>
  );
}
