'use client';

/**
 * The whole cold store from above, to scale (three/storeScene — the same
 * store the 3D view and the walk inside show): the building with its
 * measurements, the main door where the owner measured it, the passage
 * straight in from it, every chamber where it stands with its own door, and
 * the places of one floor coloured by what they are (components/rental/
 * placeLook). Tap a chamber to open it. Drawn at the width it has on screen,
 * so its words stay readable on a phone.
 */
import { memo, useCallback, useState, type SVGProps } from 'react';

import { PLACE_LOOK, type Look } from '@/components/rental/placeLook';
import { midOf, type SceneChamber, type StoreScene, type Vec } from '@/components/rental/three/storeScene';
import { showLength } from '@/lib/coldLayout';
import { countText, nice, type Storage } from '@/lib/coldStore';
import type { ColdChamber } from '@/lib/db/coldMap';

/** How wide an element is on screen (0 until known). */
function useShownWidth(): [(el: HTMLElement | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, width];
}

/** A font size for words that should fit in `room` px: at most `max`, at least `min`. */
const fitFont = (text: string, room: number, max: number, min: number) => Math.max(min, Math.min(max, room / (text.length * 0.58)));

/** What one chamber holds and has free (on all its floors), and the places with room. */
export interface ChamberCount {
  holds: number;
  free: number;
  open: number;
  places: number;
}

export const StoreTopView = memo(function StoreTopView({
  scene,
  floor,
  stateOf,
  counts,
  active,
  onPick,
  mode,
}: {
  scene: StoreScene;
  /** The floor whose places are shown (1 = lowest). */
  floor: number;
  stateOf: (c: ColdChamber, slot: string) => Look;
  /** By chamber index. */
  counts: ChamberCount[];
  /** The open chamber's index (-1: none). */
  active: number;
  onPick: (index: number) => void;
  mode: 'book' | 'owner' | 'view';
}) {
  const [ref, shownWidth] = useShownWidth();
  const b = scene.building;
  const u = scene.unit;
  const W = shownWidth ? Math.max(300, Math.min(900, shownWidth)) : 760;
  const narrow = W < 480;
  const font = narrow ? 12 : 14;
  // Everything drawn (chambers outside the building too), and room round it for the words.
  const bx = scene.bounds;
  const md = scene.mainDoor;
  // The sizes stand on walls without the main door; the main door's words outside its wall.
  const lengthOn = md?.wall === 'back' ? 'front' : 'back';
  const widthOn = md?.wall === 'left' ? 'right' : 'left';
  const side = font * 2 + 10;
  const pad = b
    ? { l: widthOn === 'left' || md?.wall === 'left' ? side : 10, r: widthOn === 'right' || md?.wall === 'right' ? side : 10, t: side, b: font * 3 + 24 }
    : { l: 8, r: 10, t: 8, b: font * 2 + 16 };
  const k = Math.min((W - pad.l - pad.r) / Math.max(1, bx.w), (narrow ? 460 : 560) / Math.max(1, bx.d));
  const left = pad.l + (W - pad.l - pad.r - bx.w * k) / 2;
  const H = Math.ceil(pad.t + bx.d * k + pad.b);
  const X = (x: number) => left + (x - bx.x) * k;
  // The front at the bottom.
  const Y = (y: number) => pad.t + (bx.y + bx.d - y) * k;
  const seg = (p: Vec, q: Vec) => ({ x1: X(p.x), y1: Y(p.y), x2: X(q.x), y2: Y(q.y) });
  const text = (x: number, y: number, t: string, size: number, props: SVGProps<SVGTextElement> = {}) => (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size} {...props}>
      {t}
    </text>
  );

  /** One chamber: its walls, the walkway and places of this floor, its door and its name. */
  const chamber = (c: SceneChamber) => {
    const r = c.rect;
    const on = c.index === active;
    const f = c.floors.find((x) => x.floor === floor) ?? (c.floors.length === 1 && !c.toScale ? c.floors[0] : null);
    const n = counts[c.index] ?? { holds: 0, free: 0, open: 0, places: 0 };
    const st: Storage = c.storage;
    // Places of this floor: one path per colour.
    const paths = new Map<string, string>();
    if (f) {
      for (const p of f.places) {
        const look = p.blocked ? 'blocked' : stateOf(f.row, p.slot);
        if (look === 'blocked' && c.storage !== 'boxes') continue;
        const fill = mode === 'view' && look === 'free' ? '#e2e8f0' : PLACE_LOOK[look].mini;
        const q = p.rect;
        const inset = Math.min(q.w, q.d) * k > 6 ? 0.6 : 0;
        const d = `M${(X(q.x) + inset).toFixed(1)} ${(Y(q.y + q.d) + inset).toFixed(1)}h${Math.max(0.6, q.w * k - 2 * inset).toFixed(1)}v${Math.max(0.6, q.d * k - 2 * inset).toFixed(1)}h${(-Math.max(0.6, q.w * k - 2 * inset)).toFixed(1)}z`;
        paths.set(fill, (paths.get(fill) ?? '') + d);
      }
    }
    const wide = r.w * k - 8;
    const tall = r.d * k - 6;
    const name = wide < 64 ? (c.no !== null ? String(c.no) : c.name.slice(0, 4)) : c.name;
    const nameSize = fitFont(name, wide, font + 2, 9);
    const lines = [
      // With floors in the store, every chamber says whether it has the floor shown.
      c.floors.length > 1 ? (f ? `Floor ${floor} of ${c.floors.length}` : `No floor ${floor}`) : floor > 1 && c.toScale ? `No floor ${floor}` : '',
      `${nice(n.free)} free`,
      // Its size as the owner typed it: length × width × height (older chambers: from the door to the back wall first).
      c.toScale ? (c.no !== null ? `${showLength(r.w, u)} × ${showLength(r.d, u)} × ${showLength(c.h, u)}` : `${showLength(r.d, u)} × ${showLength(r.w, u)} × ${showLength(c.h, u)}`) : '',
    ].filter(Boolean);
    const lineSize = Math.min(...lines.map((t) => fitFont(t, wide, font - 1, 8)));
    while (lines.length && nameSize * 1.2 + lines.length * lineSize * 1.25 > tall) lines.pop();
    const top = Y(r.y + r.d / 2) - (nameSize * 1.2 + lines.length * lineSize * 1.25) / 2;
    const cx = X(r.x + r.w / 2);
    const label = `${c.name}: holds ${countText(n.holds, st)}, ${nice(n.free)} free (${n.open} places with room)${c.floors.length > 1 ? `, ${c.floors.length} floors` : ''}${c.fits ? '' : ', drawn where it would stand: it does not fit'}. Open this chamber.`;
    return (
      <g
        key={c.key}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={on}
        data-chamber={c.name}
        onClick={() => onPick(c.index)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick(c.index);
          }
        }}
        className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-sky-900"
      >
        <title>{label}</title>
        <rect x={X(r.x)} y={Y(r.y + r.d)} width={r.w * k} height={r.d * k} fill={c.fits ? (f ? '#ffffff' : '#f1f5f9') : '#fff1f2'} stroke={c.fits ? (on ? '#0369a1' : '#475569') : '#e11d48'} strokeWidth={on ? 5 : 3} strokeDasharray={c.fits ? undefined : '8 5'} />
        {f?.walkway && <rect x={X(f.walkway.x)} y={Y(f.walkway.y + f.walkway.d)} width={f.walkway.w * k} height={f.walkway.d * k} fill="#fef3c7" />}
        {[...paths].map(([fill, d]) => <path key={fill} d={d} fill={fill} stroke={fill === PLACE_LOOK.blocked.mini ? '#cbd5e1' : 'none'} strokeWidth={0.6} />)}
        {c.door && <line {...seg({ x: c.door.x1, y: c.door.y1 }, { x: c.door.x2, y: c.door.y2 })} stroke="#d97706" strokeWidth={6} />}
        {text(cx, top + nameSize * 0.6, name, nameSize, { fontWeight: 800, fill: c.fits ? '#0f172a' : '#9f1239', stroke: '#ffffff', strokeWidth: 4, paintOrder: 'stroke' })}
        {lines.map((t, i) => (
          <g key={t}>{text(cx, top + nameSize * 1.2 + (i + 0.5) * lineSize * 1.25, t, lineSize, { fontWeight: 600, fill: '#334155', stroke: '#ffffff', strokeWidth: 3.5, paintOrder: 'stroke' })}</g>
        ))}
      </g>
    );
  };

  const pass = scene.passage;
  const summary = `${b ? `The building from above: ${showLength(b.length, u)} long and ${showLength(b.width, u)} wide, the main door in the ${b.door.wall} wall. ` : ''}${scene.chambers.length} chamber${scene.chambers.length === 1 ? '' : 's'}: ${scene.chambers.map((c) => c.name).join(', ')}. Showing floor ${floor}.`;
  return (
    <figure ref={ref} className="space-y-1">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-slate-50 to-white ring-1 ring-slate-900/10">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label={summary} className="block h-auto w-full select-none">
          {b ? (
            <>
              <rect x={X(0)} y={Y(b.width)} width={b.length * k} height={b.width * k} fill="#e2e8f0" stroke="#334155" strokeWidth={5} />
              {text(X(b.length / 2), lengthOn === 'back' ? Y(b.width) - font - 2 : Y(0) + font + 6, `Length ${showLength(b.length, u)}`, font, { fontWeight: 700, fill: '#334155' })}
              {(() => {
                const x = widthOn === 'left' ? X(0) - font - 2 : X(b.length) + font + 2;
                return (
                  <text x={x} y={Y(b.width / 2)} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={700} fill="#334155" transform={`rotate(-90 ${x} ${Y(b.width / 2)})`}>
                    {`Width ${showLength(b.width, u)}`}
                  </text>
                );
              })()}
            </>
          ) : (
            <>
              <rect x={X(scene.hall.x)} y={Y(scene.hall.y + scene.hall.d)} width={scene.hall.w * k} height={scene.hall.d * k} fill="#f1f5f9" rx={12} />
              <rect x={X(scene.hall.x)} y={Y(3)} width={scene.hall.w * k} height={3 * k} fill="#fef3c7" />
              {text(X(scene.hall.x + scene.hall.w / 2), Y(1.5), 'CORRIDOR · LOADING BAY', Math.min(font - 1, 3 * k * 0.4), { fontWeight: 800, letterSpacing: 2, fill: '#92400e' })}
            </>
          )}
          {pass && (
            <g data-passage>
              <rect x={X(pass.x)} y={Y(pass.y + pass.d)} width={pass.w * k} height={pass.d * k} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="7 5" />
              {(() => {
                const upright = md ? md.wall === 'front' || md.wall === 'back' : true;
                const across = (upright ? pass.w : pass.d) * k;
                if (across < 14) return null;
                const cx = X(pass.x + pass.w / 2);
                const cy = Y(pass.y + pass.d / 2);
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(font - 1, across * 0.55)} fontWeight={800} letterSpacing={2} fill="#92400e" transform={upright ? `rotate(-90 ${cx} ${cy})` : undefined}>
                    PASSAGE
                  </text>
                );
              })()}
            </g>
          )}
          {scene.chambers.map(chamber)}
          {md && (
            <g>
              <line {...seg({ x: md.seg.x1, y: md.seg.y1 }, { x: md.seg.x2, y: md.seg.y2 })} stroke="#d97706" strokeWidth={10} />
              {(() => {
                const m = midOf(md.seg);
                const out = { x: m.x - md.inward.x, y: m.y - md.inward.y };
                const px = X(m.x) + (X(out.x) - X(m.x)) / Math.max(1e-6, k) * (font + 6);
                const py = Y(m.y) + (Y(out.y) - Y(m.y)) / Math.max(1e-6, k) * (font + 6);
                const upright = md.wall === 'left' || md.wall === 'right';
                return (
                  <text x={px} y={py} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={800} fill="#b45309" transform={upright ? `rotate(-90 ${px} ${py})` : undefined}>
                    {`Main door · ${showLength(md.width, u)}`}
                  </text>
                );
              })()}
            </g>
          )}
          {b && text(X(b.length / 2), H - font / 2 - 4, 'FRONT (road side)', font - 1, { fontWeight: 800, letterSpacing: 2, fill: '#64748b' })}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-5 rounded bg-amber-600" aria-hidden /> Doors</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300" aria-hidden /> Passage and walkways</span>
        {b && md && <span>Main door {showLength(md.from, u)} from the left corner of the {md.wall} wall (standing outside, facing it).</span>}
        {scene.floors > 1 && <span>Showing floor {floor}. Upper floors are steel decks inside the same chamber.</span>}
        {scene.beside && <span>Chambers set up before the building was measured stand beside it here.</span>}
      </figcaption>
    </figure>
  );
});
