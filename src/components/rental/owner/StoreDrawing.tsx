'use client';

/**
 * The owner's cold store from above, drawn to scale from what they typed
 * (lib/coldStore storeModel) and redrawn on every keystroke: the building's
 * walls with the main door where they measured it, the passage straight in
 * from it, every chamber where it stands — on the left, the right or both
 * sides of the passage — with its own door, its walkway and every stack of
 * bins or crates on its lowest floor. Before any chamber is added, the side
 * the chambers go on is shaded. A chamber that does not fit is drawn in red,
 * where it would stand. Tap a chamber to open it.
 * It is drawn at the width it has on screen, so its words stay big enough to
 * read on a phone; the words about a wall stand along that wall.
 */
import { memo, type SVGProps } from 'react';
import { DoorOpen } from 'lucide-react';

import { DimLine, ScaleBar } from '@/components/rental/drawingMarks';
import { useWidth } from '@/components/rental/owner/useWidth';
import { countText, doorLine, fromDoor, passageOf, placeRect, type Building, type ModelChamber, type Sides, type StoreModel, type Wall } from '@/lib/coldStore';
import { FOOT, type SizeUnit } from '@/lib/coldLayout';

const WALL_NAME = { front: 'front', back: 'back', left: 'left', right: 'right' } as const;
const say = (m: number, unit: SizeUnit) => {
  const v = m / (unit === 'ft' ? FOOT : 1);
  return `${(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-IN')} ${unit}`;
};
/** Bins are wood, crates are blue plastic. */
const STACK = { bins: { fill: '#c2884a', stroke: '#7c2d12' }, crates: { fill: '#3b82f6', stroke: '#1e3a8a' } } as const;
/** Out from each wall on the drawing (the front at the bottom). */
const OUT: Record<Wall, [number, number]> = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] };
/** A font size for words that should fit in `room` px: at most `max`, at least `min`. */
const fitFont = (text: string, room: number, max: number, min: number) => Math.max(min, Math.min(max, room / (text.length * 0.58)));

/** Where the chambers are, in words: "on both sides of the passage from the main door". */
export const SIDES_TEXT: Record<Sides, string> = {
  left: 'on the left side of the passage from the main door',
  right: 'on the right side of the passage from the main door',
  both: 'on both sides of the passage from the main door',
};

/** "Building 120 ft long, 60 ft wide, 30 ft high; main door in the front wall, 10 ft from the left corner, 10 ft wide; chambers on both sides of the passage from the main door." */
export function buildingText(b: Building): string {
  const u = b.unit;
  return `Building ${say(b.length, u)} long, ${say(b.width, u)} wide, ${say(b.height, u)} high; main door in the ${WALL_NAME[b.door.wall]} wall, ${say(b.door.from, u)} from the left corner, ${say(b.door.width, u)} wide and ${say(b.door.height, u)} high; chambers ${SIDES_TEXT[b.sides]}`;
}

export const StoreDrawing = memo(function StoreDrawing({ model, selected, onPick, title, empty }: { model: StoreModel; selected?: string | null; onPick?: (key: string) => void; title?: string; /** What to say before the building is known. */ empty?: string }) {
  const [ref, shownWidth] = useWidth();
  const b = model.building;
  if (!b) {
    return (
      <p ref={ref} className="grid min-h-[200px] place-items-center rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600 ring-1 ring-slate-900/5">
        {empty ?? 'Write the building’s length, width and height and where the main door is — the drawing appears here at once.'}
      </p>
    );
  }
  const u = b.unit;
  const items = model.chambers.map((mc) => ({ mc, spot: model.layout?.spots[mc.key] })).filter((x): x is { mc: ModelChamber; spot: NonNullable<typeof x.spot> } => Boolean(x.spot));
  // Everything drawn, in metres (chambers outside the building too).
  let x0 = 0;
  let y0 = 0;
  let x1 = b.length;
  let y1 = b.width;
  for (const { spot } of items) {
    x0 = Math.min(x0, spot.x);
    y0 = Math.min(y0, spot.y);
    x1 = Math.max(x1, spot.x + spot.w);
    y1 = Math.max(y1, spot.y + spot.d);
  }

  // Drawn at its width on screen (1 unit = 1 px), the words at a size that reads.
  const W = shownWidth ? Math.max(280, Math.min(800, shownWidth)) : 720;
  const font = W < 480 ? 13 : 15;
  const wall = b.door.wall;
  // The size of each side stands on a side without the main door.
  const lengthOn: Wall = wall === 'back' ? 'front' : 'back';
  const widthOn: Wall = wall === 'left' ? 'right' : 'left';
  // How far out from a wall each line of words stands (to its middle).
  const off = { door: font + 4, line: 2 * font + 12, dist: 3 * font + 16, size: font + 4 };
  const frontAt = wall === 'front' ? off.dist + font + 8 : lengthOn === 'front' ? off.size + font + 8 : off.size;
  const need = (s: Wall) => (s === wall ? off.dist + font : s === lengthOn || s === widthOn ? off.size + font : 12);
  // A row under everything for the scale bar.
  const scaleRow = font + 18;
  const M = { l: need('left'), r: need('right'), t: need('back'), b: frontAt + font / 2 + 10 + scaleRow };
  const k = Math.min((W - M.l - M.r) / (x1 - x0), 560 / (y1 - y0));
  const left = M.l + (W - M.l - M.r - (x1 - x0) * k) / 2;
  const H = M.t + (y1 - y0) * k + M.b;
  // The words below the front wall stand above the scale bar's row.
  const Hw = H - scaleRow;
  const X = (x: number) => left + (x - x0) * k;
  const Y = (y: number) => M.t + (y1 - y) * k; // the front at the bottom

  // Words along a wall: `a` from its left corner (standing outside facing it), `out` px out from it.
  const room = { length: b.length, width: b.width };
  const pass = model.layout?.passage ?? passageOf(b);
  const at = (w: Wall, a: number, out: number) => {
    const p = fromDoor(w, room, a, 0);
    return { x: X(p.x) + OUT[w][0] * out, y: Y(p.y) + OUT[w][1] * out };
  };
  const words = (w: Wall, a: number, out: number, text: string, size: number, props: SVGProps<SVGTextElement>) => {
    const c = at(w, a, out);
    const side = w === 'left' || w === 'right';
    // Kept inside the drawing.
    const half = text.length * size * 0.3 + 4;
    if (side) c.y = Math.min(Hw - half, Math.max(half, c.y));
    else c.x = Math.min(W - half, Math.max(half, c.x));
    return (
      <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central" fontSize={size} transform={side ? `rotate(-90 ${c.x} ${c.y})` : undefined} {...props}>
        {text}
      </text>
    );
  };
  const dl = doorLine(b.door, room);
  const lineFrom = at(wall, 0, off.line);
  const lineTo = at(wall, b.door.from, off.line);

  const summary = `${title ? `${title}, from above: ` : 'From above: '}${buildingText(b)}. ${items.length ? `${items.length} chamber${items.length === 1 ? '' : 's'}: ${items.map(({ mc }) => `${mc.name}${mc.count ? `, ${mc.count.toLocaleString('en-IN')} ${mc.storage}` : ''}`).join('; ')}.` : 'No chambers drawn yet.'}`;

  return (
    <figure ref={ref} className="space-y-2">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-b from-slate-50 to-white ring-1 ring-slate-900/10">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="group" aria-label={summary} className="block h-auto w-full select-none">
          <title>{summary}</title>
          {/* Building */}
          <rect x={X(0)} y={Y(b.width)} width={b.length * k} height={b.width * k} fill="#f1f5f9" stroke="#334155" strokeWidth={5} />
          {(() => {
            const along = (w: Wall, len: number, text: string, dim: string) => {
              const p = at(w, 0, off.size);
              const q = at(w, len, off.size);
              return <DimLine dim={dim} x1={p.x} y1={p.y} x2={q.x} y2={q.y} text={text} font={font} />;
            };
            return (
              <>
                {along(lengthOn, b.length, `Length ${say(b.length, u)}`, 'length')}
                {along(widthOn, b.width, `Width ${say(b.width, u)}`, 'width')}
              </>
            );
          })()}
          {words('front', b.length / 2, frontAt, 'FRONT', font, { fontWeight: 800, letterSpacing: 3, fill: '#64748b' })}
          {/* The passage from the main door, and (before any chamber) the side the chambers go on */}
          {(() => {
            const r = pass.rect;
            const upright = pass.wall === 'front' || pass.wall === 'back';
            const cx = X(r.x + r.w / 2);
            const cy = Y(r.y + r.d / 2);
            const across = (upright ? r.w : r.d) * k;
            const size = Math.min(font - 1, Math.max(9, across * 0.55));
            const zone = (side: 'left' | 'right') => {
              const [u0, u1] = side === 'left' ? [0, pass.u0] : [pass.u1, pass.across];
              if (u1 - u0 < 0.5) return null;
              const a = fromDoor(pass.wall, room, u0, 0);
              const c = fromDoor(pass.wall, room, u1, pass.depth);
              const z = { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(a.x - c.x), d: Math.abs(a.y - c.y) };
              const zx = X(z.x + z.w / 2);
              const zy = Y(z.y + z.d / 2);
              const text = `Chambers on the ${side}`;
              const fs = fitFont(text, (upright ? z.w : z.d) * k - 8, font, 9);
              return (
                <g key={side} data-zone={side}>
                  <rect x={X(z.x) + 4} y={Y(z.y + z.d) + 4} width={Math.max(0, z.w * k - 8)} height={Math.max(0, z.d * k - 8)} rx={8} fill="#ede9fe" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="6 4" />
                  <text x={zx} y={zy} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={700} fill="#5b21b6">{text}</text>
                </g>
              );
            };
            return (
              <g data-passage>
                <rect x={X(r.x)} y={Y(r.y + r.d)} width={r.w * k} height={r.d * k} fill="#fef3c7" />
                {upright ? (
                  <>
                    <line x1={X(r.x)} y1={Y(r.y)} x2={X(r.x)} y2={Y(r.y + r.d)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 5" />
                    <line x1={X(r.x + r.w)} y1={Y(r.y)} x2={X(r.x + r.w)} y2={Y(r.y + r.d)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 5" />
                  </>
                ) : (
                  <>
                    <line x1={X(r.x)} y1={Y(r.y)} x2={X(r.x + r.w)} y2={Y(r.y)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 5" />
                    <line x1={X(r.x)} y1={Y(r.y + r.d)} x2={X(r.x + r.w)} y2={Y(r.y + r.d)} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 5" />
                  </>
                )}
                {across >= 14 && (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={800} letterSpacing={2} fill="#92400e" transform={upright ? `rotate(-90 ${cx} ${cy})` : undefined}>
                    PASSAGE
                  </text>
                )}
                {!items.length && (b.sides === 'both' ? [zone('left'), zone('right')] : [zone(b.sides)])}
              </g>
            );
          })()}
          {items.map(({ mc, spot }) => {
            const on = selected === mc.key;
            const sx = (x: number) => X(spot.x + x);
            const sy = (y: number) => Y(spot.y + y);
            const f1 = mc.floors[0];
            // Stacks on the lowest floor, one path for all.
            let stacks = '';
            if (f1) {
              const unused = new Set(f1.plan.unused ?? []);
              for (let r = 1; r <= f1.plan.rows; r++) {
                for (let c = 0; c < f1.plan.cols; c++) {
                  if (r === 1 && unused.has(`1${String.fromCharCode(65 + c)}`)) continue;
                  const q = placeRect(f1.size, f1.plan, r, c);
                  if (q) stacks += `M${sx(q.x).toFixed(1)} ${sy(q.y + q.d).toFixed(1)}h${(q.w * k).toFixed(1)}v${(q.d * k).toFixed(1)}h${(-q.w * k).toFixed(1)}z`;
                }
              }
            }
            const walk = f1?.plan.aisleX ? (() => {
              const a = fromDoor(f1.size.doorWall ?? 'front', { length: spot.w, width: spot.d }, f1.plan.aisleX![0], 0);
              const c = fromDoor(f1.size.doorWall ?? 'front', { length: spot.w, width: spot.d }, f1.plan.aisleX![1], f1.size.length);
              return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(a.x - c.x), d: Math.abs(a.y - c.y) };
            })() : null;
            const door = mc.outline.door ? doorLine(mc.outline.door, { length: spot.w, width: spot.d }) : null;
            const label = `${mc.name}${mc.count ? ` · ${mc.count.toLocaleString('en-IN')} ${mc.storage}` : ''}${mc.floors.length > 1 ? ` · ${mc.floors.length} floors` : ''}${spot.fits ? '' : ' · does not fit'}`;
            // Its name and count, as big as fits inside it (just the number in a narrow chamber).
            const wide = spot.w * k - 8;
            const name = wide < 56 ? String(mc.no || '?') : mc.name;
            const nameSize = fitFont(name, wide, font + 1, 10);
            const more = spot.fits ? [mc.count ? countText(mc.count, mc.storage) : 'count?', mc.floors.length > 1 ? `${mc.floors.length} floors` : ''].filter(Boolean) : ['Does not fit'];
            const moreSize = Math.min(...more.map((t) => fitFont(t, wide, font - 2, 9)));
            while (more.length && nameSize * 1.15 + more.length * moreSize * 1.2 > spot.d * k - 6) more.pop();
            const top = sy(spot.d / 2) - (nameSize * 1.15 + more.length * moreSize * 1.2) / 2;
            const ink = spot.fits ? '#0f172a' : '#9f1239';
            return (
              <g
                key={mc.key}
                data-chamber={mc.no || undefined}
                data-side={spot.side ?? (spot.byOwner ? 'owner' : undefined)}
                role={onPick ? 'button' : undefined}
                tabIndex={onPick ? 0 : undefined}
                aria-label={onPick ? `${label}. Open ${mc.name}.` : undefined}
                onClick={() => onPick?.(mc.key)}
                onKeyDown={(e) => {
                  if (onPick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onPick(mc.key);
                  }
                }}
                className={onPick ? 'cursor-pointer outline-none' : undefined}
              >
                <rect
                  x={sx(0)}
                  y={sy(spot.d)}
                  width={spot.w * k}
                  height={spot.d * k}
                  fill={spot.fits ? '#ffffff' : '#fff1f2'}
                  stroke={spot.fits ? (on ? '#6d28d9' : '#0369a1') : '#e11d48'}
                  strokeWidth={on ? 5 : 3}
                  strokeDasharray={spot.fits ? undefined : '8 5'}
                />
                {walk && <rect x={sx(walk.x)} y={sy(walk.y + walk.d)} width={walk.w * k} height={walk.d * k} fill="#fef3c7" />}
                {on && walk && f1 && (() => {
                  // The open chamber's walkway: its width across it, a third of the way in from the door.
                  const dw = f1.size.doorWall ?? 'front';
                  const upright = dw === 'front' || dw === 'back';
                  const width = upright ? walk.w : walk.d;
                  const text = `Walkway ${say(width, u)}`;
                  if (width * k < text.length * (font - 2) * 0.62 + 12) return null;
                  const t = dw === 'front' || dw === 'left' ? 1 / 3 : 2 / 3;
                  return upright ? (
                    <DimLine dim="walkway" x1={sx(walk.x)} y1={sy(walk.y + walk.d * t)} x2={sx(walk.x + walk.w)} y2={sy(walk.y + walk.d * t)} text={text} font={font - 2} color="#92400e" halo="#fef3c7" />
                  ) : (
                    <DimLine dim="walkway" x1={sx(walk.x + walk.w * t)} y1={sy(walk.y)} x2={sx(walk.x + walk.w * t)} y2={sy(walk.y + walk.d)} text={text} font={font - 2} color="#92400e" halo="#fef3c7" />
                  );
                })()}
                {stacks && <path d={stacks} fill={STACK[mc.storage].fill} stroke={STACK[mc.storage].stroke} strokeWidth={k > 20 ? 1 : 0.5} />}
                {door && <line x1={sx(door.x1)} y1={sy(door.y1)} x2={sx(door.x2)} y2={sy(door.y2)} stroke="#d97706" strokeWidth={7} />}
                <text x={sx(spot.w / 2)} y={top + nameSize * 0.575} textAnchor="middle" dominantBaseline="central" fontSize={nameSize} fontWeight={800} fill={ink} stroke="#ffffff" strokeWidth={5} paintOrder="stroke">
                  {name}
                </text>
                {more.map((t, i) => (
                  <text key={t} x={sx(spot.w / 2)} y={top + nameSize * 1.15 + (i + 0.5) * moreSize * 1.2} textAnchor="middle" dominantBaseline="central" fontSize={moreSize} fontWeight={600} fill={spot.fits ? '#334155' : '#9f1239'} stroke="#ffffff" strokeWidth={4} paintOrder="stroke">
                    {t}
                  </text>
                ))}
              </g>
            );
          })}

          {/* Main door, on top: a chamber standing in front of it is plain to see */}
          <line x1={X(dl.x1)} y1={Y(dl.y1)} x2={X(dl.x2)} y2={Y(dl.y2)} stroke="#d97706" strokeWidth={10} strokeLinecap="butt" />
          {words(wall, b.door.from + b.door.width / 2, off.door, 'Main door', font, { fontWeight: 800, fill: '#b45309' })}
          {b.door.from > 0.05 && (
            <g>
              <line x1={lineFrom.x} y1={lineFrom.y} x2={lineTo.x} y2={lineTo.y} stroke="#b45309" strokeDasharray="4 3" strokeWidth={1.5} />
              {words(wall, b.door.from / 2, off.dist, `${say(b.door.from, u)} from the corner`, font - 2, { fill: '#b45309' })}
            </g>
          )}
          <ScaleBar x={12} y={H - scaleRow / 2 - 2} k={k} most={(W * 0.3) / k} unit={u} font={font - 1} />
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-5 rounded bg-amber-600" aria-hidden /> <DoorOpen className="h-3.5 w-3.5" aria-hidden /> Doors</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-[#c2884a] ring-1 ring-[#7c2d12]" aria-hidden /> Stacks of bins</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-blue-500 ring-1 ring-blue-900" aria-hidden /> Stacks of crates</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300" aria-hidden /> Passage and walkways</span>
        {items.some(({ mc }) => mc.floors.length > 1) && <span>Upper floors stand above the lowest one shown.</span>}
        {items.some(({ spot }) => !spot.byOwner) && <span>Chambers stand in number order from the main door inward, {SIDES_TEXT[b.sides]}, each door facing it. To put one somewhere else, say where it stands under “More details”.</span>}
      </figcaption>
    </figure>
  );
});
