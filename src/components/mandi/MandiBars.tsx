'use client';

/**
 * MandiBars — the Mandi Helpers portal's 2D multi-mandi comparison chart:
 * one labelled horizontal bar per mandi, length = that mandi's latest modal
 * price (per kg where the unit allows), commodity named under each mandi.
 * The fast replacement for the decorative 3D volume bars — pure SVG/CSS,
 * renders instantly, works on every phone.
 */
export interface MandiBar {
  mandi: string;
  /** Modal price in ₹ (already normalised per kg by the caller when possible). */
  modal: number;
  /** Short label under the mandi, e.g. "Delicious · per kg". */
  detail?: string;
}

const BAR_COLOURS = ['#2f9e44', '#e8590c', '#1d4ed8', '#9c36b5', '#0c8599', '#c92a2a', '#5f3dc4', '#e8a317'];

export function MandiBars({ bars, className = '' }: { bars: MandiBar[]; className?: string }) {
  if (bars.length === 0) return null;
  const shown = bars.slice(0, 8);
  const max = Math.max(...shown.map((b) => b.modal), 1);
  return (
    <div className={`rounded-2xl bg-gradient-to-b from-purple-50 to-white p-4 ring-1 ring-purple-100 ${className}`} role="img" aria-label="Latest modal price per mandi, highest first">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Latest modal price by mandi{bars.length > shown.length ? ` (top ${shown.length} of ${bars.length})` : ''}</p>
      <ol className="space-y-2">
        {shown.map((b, i) => (
          <li key={`${b.mandi}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 truncate text-right font-semibold text-slate-700" title={b.mandi}>{b.mandi}</span>
            <span className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(4, (b.modal / max) * 100)}%`, backgroundColor: BAR_COLOURS[i % BAR_COLOURS.length] }}
              />
            </span>
            <span className="w-24 shrink-0 text-right font-bold tabular-nums text-slate-900">₹{Math.round(b.modal).toLocaleString('en-IN')}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-slate-400">{shown.map((b) => `${b.mandi}: ${b.detail ?? ''}`).filter(Boolean).join(' · ')}</p>
    </div>
  );
}
