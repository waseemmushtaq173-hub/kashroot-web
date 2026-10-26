'use client';

/**
 * One chamber (one floor of it) drawn to scale from its measured size
 * (lib/coldLayout), as you see it walking in through its door: the walls
 * with the door and windows where the owner measured them, the walkway, and
 * every stack of bins, crates or boxes where it really stands, with the
 * measurements written on the drawing. Row 1 is by the door (at the
 * bottom), stacks are counted from the left. A shared place shows how full
 * it is and how many still fit. Tap a place to choose it (booking) or to
 * see whose it is (owner). Drawn to the width it has on screen; only very
 * small places (crates) make it wider than a phone, to stay easy to tap.
 */
import { useCallback, useId, useState } from 'react';

import { lookLabel, type Look } from '@/components/rental/placeLook';
import { layersText, planOf, showLength, type ChamberPlan, type ChamberSize, type WindowSize } from '@/lib/coldLayout';
import { countText, UNIT_WORDS } from '@/lib/coldStore';
import { placeKey, placeLabel, placeName, type ColdChamber } from '@/lib/db/coldMap';

/** Drawing margins (px) for row labels, stack numbers, measurements and the door. */
const M = { l: 64, r: 74, t: 64, b: 76 };

const WALL_NAME = { front: 'door wall', back: 'back wall', left: 'left wall', right: 'right wall' } as const;

/** "Window 1: left wall, 10 ft from the door wall, 3 ft × 2 ft, 12 ft above the floor". */
export function windowText(win: WindowSize, i: number, unit: ChamberSize['unit']): string {
  const from = win.wall === 'front' || win.wall === 'back' ? 'from the left wall' : 'from the door wall';
  return `Window ${i + 1}: ${WALL_NAME[win.wall]}, ${showLength(win.at, unit)} ${from}, ${showLength(win.width, unit)} wide × ${showLength(win.height, unit)} high, ${showLength(win.sill, unit)} above the floor`;
}
/** A place is never drawn smaller than this (px), so it stays easy to tap. */
const MIN_PLACE = 30;
/** The room is drawn about this wide (px) when there is room on screen. */
const ROOM_W = 560;

/** How wide the drawing's box is on screen (0 until known). */
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

const FILL: Record<Look, { fill: string; stroke: string; text: string }> = {
  free: { fill: '#e0f2fe', stroke: '#38bdf8', text: '#0369a1' },
  part: { fill: '#e0f2fe', stroke: '#0ea5e9', text: '#0c4a6e' },
  selected: { fill: '#10b981', stroke: '#047857', text: '#ffffff' },
  held: { fill: '#fcd34d', stroke: '#d97706', text: '#78350f' },
  booked: { fill: '#94a3b8', stroke: '#64748b', text: '#ffffff' },
  mine: { fill: '#7c3aed', stroke: '#5b21b6', text: '#ffffff' },
  blocked: { fill: 'url(#hatch)', stroke: '#cbd5e1', text: '#94a3b8' },
};

export function ChamberDiagram({
  chamber: c,
  size,
  stateOf,
  roomOf,
  onPlace,
  mode,
  labelOf,
}: {
  chamber: ColdChamber;
  size: ChamberSize;
  stateOf: (c: ColdChamber, slot: string) => Look;
  /** Boxes that still fit on a place. */
  roomOf: (c: ColdChamber, slot: string) => number;
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  mode: 'book' | 'owner' | 'view';
  labelOf?: (key: string) => string | undefined;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [boxRef, shown] = useShownWidth();
  const plan: ChamberPlan = planOf(size);
  const { width: W, length: L } = size;
  const room = shown ? Math.max(160, Math.min(ROOM_W, shown - M.l - M.r)) : ROOM_W;
  const k = Math.max(room / W, MIN_PLACE / Math.min(plan.placeW, plan.placeD));
  const words = UNIT_WORDS[c.storage];
  // Owner wizard floors: the cells left over (so the count is exact) are just floor, not places.
  const counted = size.places !== undefined;
  const floors = size.floors ?? 1;
  const w = W * k;
  const h = L * k;
  const svgW = M.l + w + M.r;
  const svgH = M.t + h + M.b;
  const X = (m: number) => M.l + m * k;
  const Y = (z: number) => M.t + (L - z) * k; // z: metres in from the door wall
  const rows = Math.min(c.rows, plan.rows);
  const cols = Math.min(c.cols, plan.cols);
  const pw = plan.placeW * k;
  const pd = plan.placeD * k;
  // Row labels every row when rows are tall enough, else every few.
  const every = pd >= 16 ? 1 : pd >= 8 ? 2 : 5;
  const u = size.unit;
  const hatch = `hatch-${uid}`;

  const place = (r: number, i: number) => {
    const slot = placeName(r, i);
    const key = placeKey(c.id, slot);
    const look = stateOf(c, slot);
    if (counted && look === 'blocked') return null;
    const quiet = mode === 'view' && look === 'free';
    const f = quiet ? { fill: '#ffffff', stroke: '#e2e8f0', text: '#cbd5e1' } : FILL[look];
    const clickable = mode === 'book' ? look === 'free' || look === 'part' || look === 'selected' : mode === 'owner';
    const label = labelOf?.(key);
    const x = X(plan.colX[i]);
    const y = Y(plan.rowZ[r - 1] + plan.placeD);
    const spare = look === 'part' ? roomOf(c, slot) : 0;
    // How much of a shared place is taken, drawn from the bottom of the place.
    const taken = look === 'part' ? Math.min(1, Math.max(0, 1 - spare / c.boxes_per_slot)) : 0;
    const mark = look === 'selected' ? '✓' : label && (look === 'booked' || look === 'held' || look === 'part') ? label : look === 'mine' ? (label ?? 'You') : look === 'part' ? String(spare) : look === 'free' && mode === 'book' ? '+' : '';
    const name = placeLabel(slot);
    const act = () => clickable && onPlace?.(c, slot, look);
    return (
      <g
        key={slot}
        role="button"
        tabIndex={clickable ? 0 : -1}
        aria-disabled={!clickable}
        aria-pressed={mode === 'book' ? look === 'selected' : undefined}
        aria-label={`${c.name}, ${name}: ${lookLabel(look, words.many)}${look === 'free' ? `, ${countText(c.boxes_per_slot, c.storage)}` : look === 'part' ? `, room for ${spare} of ${countText(c.boxes_per_slot, c.storage)}` : ''}${label ? `, ${label}` : ''}`}
        onClick={act}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            act();
          }
        }}
        className={clickable ? 'cursor-pointer outline-none [&:focus-visible>rect]:stroke-sky-900 [&:focus-visible>rect]:[stroke-width:3]' : 'cursor-default'}
      >
        <title>{`${name} · ${lookLabel(look, words.many)}${look === 'part' ? ` · room for ${countText(spare, c.storage)}` : ''}${label ? ` · ${label}` : ''}`}</title>
        <rect x={x} y={y} width={pw} height={pd} rx={Math.min(6, pw / 6)} fill={look === 'blocked' && !quiet ? `url(#${hatch})` : f.fill} stroke={f.stroke} strokeWidth={1.5} />
        {taken > 0 && <rect x={x + 1} y={y + pd * (1 - taken)} width={pw - 2} height={pd * taken - 1} rx={Math.min(5, pw / 7)} fill="#cbd5e1" pointerEvents="none" />}
        {mark && pw >= 18 && pd >= 14 && (
          <text x={x + pw / 2} y={y + pd / 2} dominantBaseline="central" textAnchor="middle" fontSize={Math.min(14, pd * 0.5, pw * 0.4)} fontWeight={700} fill={f.text}>
            {mark}
          </text>
        )}
      </g>
    );
  };

  const doorL = X(plan.doorX[0]);
  const doorR = X(plan.doorX[1]);
  const wall = '#475569';
  // A window: an opening in its wall, drawn as glass across the wall line.
  const windowMark = (win: WindowSize, i: number) => {
    const T = 10;
    const along = win.wall === 'front' || win.wall === 'back';
    const x = along ? X(win.at) : win.wall === 'left' ? M.l - T / 2 : M.l + w - T / 2;
    const y = along ? (win.wall === 'back' ? M.t - T / 2 : M.t + h - T / 2) : Y(win.at + win.width);
    const ww = along ? win.width * k : T;
    const hh = along ? T : win.width * k;
    const tx = along ? x + ww / 2 : win.wall === 'left' ? M.l + 12 : M.l + w - 12;
    const ty = along ? (win.wall === 'back' ? M.t + 16 : M.t + h - 12) : y + hh / 2;
    return (
      <g key={i}>
        <title>{windowText(win, i, u)}</title>
        <rect x={x} y={y} width={ww} height={hh} fill="#e0f2fe" stroke="#0284c7" strokeWidth={1.5} />
        {along ? <line x1={x} y1={y + T / 2} x2={x + ww} y2={y + T / 2} stroke="#0284c7" strokeWidth={1} /> : <line x1={x + T / 2} y1={y} x2={x + T / 2} y2={y + hh} stroke="#0284c7" strokeWidth={1} />}
        <text x={tx} y={ty} textAnchor={along ? 'middle' : win.wall === 'left' ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight={700} fill="#0369a1" paintOrder="stroke" stroke="#f8fafc" strokeWidth={3}>
          {`W${i + 1}`}
        </text>
      </g>
    );
  };

  return (
    <div ref={boxRef} className="overflow-x-auto overscroll-x-contain pb-2">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto block max-w-none select-none"
        role="group"
        aria-label={`${c.name}, drawn to scale: ${showLength(L, u)} from the door to the back wall, ${showLength(W, u)} wide, ${showLength(size.height, u)} high. ${rows} rows, ${cols} stacks in each row${plan.aisleAfter !== null ? ', with a walkway' : ''}.`}
      >
        <defs>
          <pattern id={hatch} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#f8fafc" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="4" />
          </pattern>
          <marker id={`arr-${uid}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
          </marker>
        </defs>

        {/* Floor */}
        <rect x={M.l} y={M.t} width={w} height={h} fill="#f8fafc" />

        {/* Walkway from the door to the back wall */}
        {plan.aisleX && (
          <g aria-hidden>
            <rect x={X(plan.aisleX[0])} y={M.t} width={(plan.aisleX[1] - plan.aisleX[0]) * k} height={h} fill="#fef3c7" />
            <line x1={X(plan.aisleX[0])} y1={M.t} x2={X(plan.aisleX[0])} y2={M.t + h} stroke="#fbbf24" strokeDasharray="6 5" />
            <line x1={X(plan.aisleX[1])} y1={M.t} x2={X(plan.aisleX[1])} y2={M.t + h} stroke="#fbbf24" strokeDasharray="6 5" />
            <text
              x={X((plan.aisleX[0] + plan.aisleX[1]) / 2)}
              y={M.t + h / 2}
              transform={`rotate(-90 ${X((plan.aisleX[0] + plan.aisleX[1]) / 2)} ${M.t + h / 2})`}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.min(13, (plan.aisleX[1] - plan.aisleX[0]) * k * 0.45)}
              fontWeight={700}
              letterSpacing="0.15em"
              fill="#92400e"
            >
              {`WALKWAY · ${showLength(plan.aisleX[1] - plan.aisleX[0], u)}`}
            </text>
          </g>
        )}

        {/* Places */}
        {Array.from({ length: rows }, (_, ri) => Array.from({ length: cols }, (_, i) => place(ri + 1, i)))}

        {/* Walls, with the door in the front wall */}
        <g aria-hidden fill="none" stroke={wall} strokeWidth={6} strokeLinecap="square">
          <path d={`M${doorL},${M.t + h} L${M.l},${M.t + h} L${M.l},${M.t} L${M.l + w},${M.t} L${M.l + w},${M.t + h} L${doorR},${M.t + h}`} />
        </g>
        <g aria-hidden>
          <path d={`M${doorL},${M.t + h} A${doorR - doorL},${doorR - doorL} 0 0 0 ${doorR},${M.t + h - (doorR - doorL)}`} fill="none" stroke="#d97706" strokeDasharray="3 3" strokeWidth={1.2} opacity={0.6} />
          <text x={(doorL + doorR) / 2} y={M.t + h + 20} textAnchor="middle" fontSize={12} fontWeight={700} letterSpacing="0.16em" fill="#b45309">{`DOOR · ${showLength(plan.doorX[1] - plan.doorX[0], u)} × ${showLength(plan.doorH, u)}`}</text>
          <text x={(doorL + doorR) / 2} y={M.t + h + 36} textAnchor="middle" fontSize={11} fill="#64748b">you enter here · Row 1 is nearest</text>
          {plan.doorSet && plan.doorX[0] > 0.05 && (
            <g stroke="#b45309" strokeWidth={1} fill="#b45309" fontSize={11} fontWeight={600}>
              <line x1={M.l} y1={M.t + h + 54} x2={doorL} y2={M.t + h + 54} markerStart={`url(#arr-${uid})`} markerEnd={`url(#arr-${uid})`} />
              <text x={(M.l + doorL) / 2} y={M.t + h + 68} textAnchor="middle" stroke="none">{`${showLength(plan.doorX[0], u)} from the ${counted ? 'left corner' : 'left wall'}`}</text>
            </g>
          )}
        </g>

        {/* Windows and vents, where the owner measured them */}
        {plan.windows.length > 0 && <g aria-hidden>{plan.windows.map(windowMark)}</g>}

        {/* Row and stack numbers */}
        <g aria-hidden fontSize={11} fill="#334155" fontWeight={600}>
          {Array.from({ length: rows }, (_, ri) => ri + 1)
            .filter((r) => r === 1 || r === rows || r % every === 0)
            .map((r) => (
              <text key={r} x={M.l - 8} y={Y(plan.rowZ[r - 1] + plan.placeD / 2)} textAnchor="end" dominantBaseline="central">
                Row {r}
              </text>
            ))}
          {pw >= 14 &&
            Array.from({ length: cols }, (_, i) => (
              <text key={i} x={X(plan.colX[i]) + pw / 2} y={M.t - 8} textAnchor="middle" fontSize={11} fill="#475569">
                {i + 1}
              </text>
            ))}
          <text x={M.l - 8} y={M.t - 8} textAnchor="end" fontSize={10} fill="#64748b">Stack →</text>
        </g>

        {/* Measurements */}
        <g aria-hidden stroke="#64748b" strokeWidth={1.2} fill="#334155" fontSize={12} fontWeight={600}>
          <line x1={M.l} y1={M.t - 34} x2={M.l + w} y2={M.t - 34} markerStart={`url(#arr-${uid})`} markerEnd={`url(#arr-${uid})`} />
          <text x={M.l + w / 2} y={M.t - 40} textAnchor="middle" stroke="none">{`Width ${showLength(W, u)}`}</text>
          <line x1={M.l + w + 30} y1={M.t} x2={M.l + w + 30} y2={M.t + h} markerStart={`url(#arr-${uid})`} markerEnd={`url(#arr-${uid})`} />
          <text x={M.l + w + 46} y={M.t + h / 2} transform={`rotate(90 ${M.l + w + 46} ${M.t + h / 2})`} textAnchor="middle" stroke="none">
            {`Length ${showLength(L, u)} (door → back wall)`}
          </text>
        </g>
      </svg>
      <p className="mt-1 text-center text-xs text-slate-600">
        {counted && floors > 1
          ? `Floor ${size.floor ?? 1} of ${floors} · ${showLength(plan.floorH ?? size.height / floors, u)} high (the chamber is ${showLength(size.height, u)})`
          : `Height ${showLength(size.height, u)}`}{' '}
        · each place {showLength(plan.placeW, u)} × {showLength(plan.placeD, u)}: {layersText(plan)} = <strong>{countText(c.boxes_per_slot, c.storage)}</strong>, stacked {showLength(plan.stackHeight, u)} high
        {plan.crowded ? ` · ${words.title} are drawn closer together than they stand: there are more of them than fit on this floor.` : ''}
      </p>
      {plan.windows.length > 0 && (
        <ul aria-label={`${c.name}: windows`} className="mt-1 space-y-0.5 text-center text-xs text-sky-900">
          {plan.windows.map((win, i) => <li key={i}>{windowText(win, i, u)}</li>)}
        </ul>
      )}
    </div>
  );
}
