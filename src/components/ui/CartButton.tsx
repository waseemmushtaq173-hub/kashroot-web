'use client';

/**
 * The KashRoot cart button: a dark pill with a little barcode scanner. Pressed,
 * the scanner's beam sweeps the barcode, its light turns green, and the label
 * becomes "✓ Added" for a moment — so it is clear the product went into the
 * cart. With `doneLabel={null}` (e.g. "Order", which opens the order form) it
 * only plays the scan.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

export function CartButton({
  children,
  onClick,
  doneLabel = 'Added',
  disabled = false,
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  /** Shown with a tick after a press; null for no "added" moment. */
  doneLabel?: string | null;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'scan' | 'done'>('idle');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const press = () => {
    if (disabled) return;
    onClick();
    timers.current.forEach((t) => window.clearTimeout(t));
    setPhase('scan');
    timers.current = [
      window.setTimeout(() => setPhase(doneLabel ? 'done' : 'idle'), 450),
      ...(doneLabel ? [window.setTimeout(() => setPhase('idle'), 1800)] : []),
    ];
  };

  const done = phase === 'done';
  return (
    <button
      type="button"
      onClick={press}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`group relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(15,23,42,0.65)] ring-1 ring-white/10 transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {done ? (
        <span className="kr-cart-in inline-flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-full ring-2 ring-emerald-400">
            <Check className="h-3 w-3 text-emerald-300" strokeWidth={3} aria-hidden />
          </span>
          {doneLabel}
        </span>
      ) : (
        <>
          {/* The scanner: a barcode, a light, and a beam that sweeps when pressed. */}
          <span aria-hidden className="relative h-4 w-6 shrink-0 overflow-hidden rounded-[4px] bg-slate-950 ring-1 ring-white/20">
            <span className={`absolute left-[3px] top-[3px] h-[3px] w-[3px] rounded-full ${phase === 'scan' ? 'bg-emerald-400' : 'kr-cart-led bg-amber-300'}`} />
            <span className="absolute bottom-[3px] left-[3px] flex h-[6px] w-[17px] gap-[1px] overflow-hidden rounded-[1px]">
              {[2, 1, 1, 2, 1, 2, 1, 1, 2].map((w, i) => (
                <span key={i} className="h-full bg-slate-200/90" style={{ width: w }} />
              ))}
            </span>
            {phase === 'scan' && <span className="kr-cart-beam absolute inset-y-0 w-[3px] bg-rose-500/90 shadow-[0_0_6px_2px_rgba(244,63,94,0.7)]" />}
          </span>
          <span className="relative">{children}</span>
        </>
      )}
    </button>
  );
}
