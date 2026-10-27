'use client';

/**
 * The buttons over the walk inside: big arrows to walk and turn, look up and
 * down (hold to keep going), "Go to floor" in a chamber with floors, the
 * small map with "you are here", and a mark in the middle of the view — the
 * place it rests on can be chosen with one tap.
 *
 * On phones every page is laid out 800px wide and shown shrunk to fit
 * (app/layout viewport), so the buttons grow by as much as the page is
 * shrunk: they stay at least 44px under a finger.
 */
import { useEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronsDown, ChevronsUp, RotateCcw, RotateCw } from 'lucide-react';

/** How much this phone shrinks the page (1 on a computer, about 2 on a phone; less when pinched in). */
export function usePageZoom(): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia('(pointer: coarse)').matches) return;
    const read = () => setZoom(Math.min(2.4, Math.max(1, 1 / (vv.scale || 1))));
    read();
    vv.addEventListener('resize', read);
    return () => vv.removeEventListener('resize', read);
  }, []);
  return zoom;
}

/** What is held down right now (buttons or keys). */
export interface WalkInput {
  fwd: boolean;
  back: boolean;
  turnL: boolean;
  turnR: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}
export const noInput = (): WalkInput => ({ fwd: false, back: false, turnL: false, turnR: false, left: false, right: false, up: false, down: false });

/** Where the visitor is, in words, and the floors of the chamber they stand in. */
export interface Where {
  text: string;
  chamber: number;
  level: number;
  floors: number;
}

/** The place the mark in the middle rests on. */
export interface Target {
  key: string;
  text: string;
  /** It can be chosen (booking) or looked at (owner). */
  can: boolean;
  chosen: boolean;
}

/** Held down, a button keeps working (walk, turn, look) until it is let go. */
export type Press = (k: keyof WalkInput, on: boolean) => void;

function Hold({ press, k, label, size, children }: { press: Press; k: keyof WalkInput; label: string; size: CSSProperties; children: ReactNode }) {
  const set = (on: boolean) => press(k, on);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={size}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          set(true);
        }
      }}
      onKeyUp={() => set(false)}
      onBlur={() => set(false)}
      className="pointer-events-auto grid cursor-pointer touch-none select-none place-items-center rounded-2xl bg-white/90 text-slate-900 shadow-lg ring-1 ring-slate-900/15 backdrop-blur transition active:scale-95 active:bg-emerald-100"
    >
      {children}
    </button>
  );
}

export function WalkHud({
  press,
  where,
  onFloor,
  target,
  onChoose,
  mapRef,
  mode,
  zoom = 1,
}: {
  press: Press;
  where: Where;
  onFloor: (n: number) => void;
  target: Target | null;
  onChoose: () => void;
  mapRef: RefObject<HTMLCanvasElement | null>;
  mode: 'book' | 'owner' | 'view';
  /** How much the page is shrunk on this phone (usePageZoom). */
  zoom?: number;
}) {
  const z = Math.min(2.2, Math.max(1, zoom * 0.95));
  const btn = Math.round(52 * z);
  const size: CSSProperties = { width: btn, height: btn };
  const icon = { width: Math.round(24 * z), height: Math.round(24 * z) };
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* The small map, and where you are */}
      <div className="absolute left-2 top-2" style={{ width: Math.round(150 * Math.min(z, 1.7)) }}>
        <canvas ref={mapRef} aria-hidden className="block aspect-square w-full rounded-xl shadow-lg ring-1 ring-slate-900/20" />
        <p role="status" aria-live="polite" className="mt-1 rounded-lg bg-slate-900/85 px-2 py-1 font-semibold leading-snug text-white" style={{ fontSize: Math.round(11 * Math.min(z, 1.7)) }}>
          {where.text}
        </p>
      </div>

      {/* Floors of the chamber you are in */}
      {where.floors > 1 && (
        <div role="group" aria-label="Go to a floor" className="absolute right-2 top-2 flex flex-col gap-1.5">
          {Array.from({ length: where.floors }, (_, i) => where.floors - i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onFloor(n)}
              aria-pressed={where.level === n}
              style={{ minHeight: Math.round(44 * z), fontSize: Math.round(14 * z) }}
              className={`pointer-events-auto cursor-pointer rounded-xl px-3 font-bold shadow-lg ring-1 transition ${where.level === n ? 'bg-emerald-700 text-white ring-emerald-800' : 'bg-white/90 text-slate-900 ring-slate-900/15 hover:bg-emerald-50'}`}
            >
              {where.level === n ? `Floor ${n} · here` : `Go to floor ${n}`}
            </button>
          ))}
        </div>
      )}

      {/* The mark in the middle and the place it rests on */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <span className="block rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(15,23,42,0.55)]" style={{ width: Math.round(24 * z), height: Math.round(24 * z) }} />
      </div>
      {target && (
        <p data-walk-target className="absolute left-1/2 w-max max-w-[86%] -translate-x-1/2 rounded-xl bg-slate-900/88 px-3 py-1.5 text-center font-semibold text-white shadow-lg" style={{ top: `calc(50% - ${Math.round(58 * z)}px)`, fontSize: Math.round(12 * z) }}>
          {target.text}
        </p>
      )}

      {/* Walk and turn */}
      <div role="group" aria-label="Walk" className="absolute bottom-2 left-2 grid grid-cols-3 gap-1.5">
        <Hold press={press} k="turnL" label="Turn left" size={size}><RotateCcw style={icon} aria-hidden /></Hold>
        <Hold press={press} k="fwd" label="Walk forward" size={size}><ArrowUp style={icon} aria-hidden /></Hold>
        <Hold press={press} k="turnR" label="Turn right" size={size}><RotateCw style={icon} aria-hidden /></Hold>
        <span />
        <Hold press={press} k="back" label="Walk back" size={size}><ArrowDown style={icon} aria-hidden /></Hold>
        <span />
      </div>

      {/* Look up and down, and choose */}
      <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1.5">
        {target?.can && mode !== 'view' && (
          <button
            type="button"
            onClick={onChoose}
            style={{ minHeight: btn, fontSize: Math.round(14 * z) }}
            className={`pointer-events-auto inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 font-bold text-white shadow-lg transition active:scale-95 ${target.chosen ? 'bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            <Check style={icon} aria-hidden />
            {mode === 'owner' ? 'Who is on this place?' : target.chosen ? 'Remove from my choice' : 'Choose this place'}
          </button>
        )}
        <div role="group" aria-label="Look" className="flex flex-col gap-1.5">
          <Hold press={press} k="up" label="Look up" size={size}><ChevronsUp style={icon} aria-hidden /></Hold>
          <Hold press={press} k="down" label="Look down" size={size}><ChevronsDown style={icon} aria-hidden /></Hold>
        </div>
      </div>
    </div>
  );
}
