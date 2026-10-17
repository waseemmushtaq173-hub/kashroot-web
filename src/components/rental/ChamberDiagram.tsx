'use client';

/**
 * One chamber drawn to scale from its measured size (lib/coldLayout): the
 * walls with the door, the walkway, and every stack where it really stands,
 * with the measurements written on the drawing. Row 1 is by the door (at the
 * bottom), stacks are counted from the left wall. A shared place shows how
 * full it is and the boxes that still fit. Tap a place to choose it
 * (booking), to see whose it is or mark a pillar (owner).
 */
import { useId } from 'react';

import { PLACE_LOOK, type Look } from '@/components/rental/placeLook';
import { layersText, planOf, showLength, type ChamberPlan, type ChamberSize } from '@/lib/coldLayout';
import { placeKey, placeLabel, placeName, type ColdChamber } from '@/lib/db/coldMap';

/** Drawing margins (px) for row labels, stack numbers, measurements and the door. */
const M = { l: 64, r: 74, t: 64, b: 54 };
/** A place is never drawn smaller than this (px), so it stays easy to tap. */
const MIN_PLACE = 30;
/** The room is drawn about this wide (px) when places allow. */
const ROOM_W = 560;

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
  const plan: ChamberPlan = planOf(size);
  const { width: W, length: L } = size;
  const k = Math.max(ROOM_W / W, MIN_PLACE / Math.min(plan.placeW, plan.placeD));
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
    const quiet = mode === 'view' && look === 'free';
    const f = quiet ? { fill: '#ffffff', stroke: '#e2e8f0', text: '#cbd5e1' } : FILL[look];
    const clickable = mode === 'book' ? look === 'free' || look === 'part' || look === 'selected' : mode === 'owner';
    const label = labelOf?.(key);
    const x = X(plan.colX[i]);
    const y = Y(plan.rowZ[r - 1] + plan.placeD);
    const room = look === 'part' ? roomOf(c, slot) : 0;
    // How much of a shared place is taken, drawn from the bottom of the place.
    const taken = look === 'part' ? Math.min(1, Math.max(0, 1 - room / c.boxes_per_slot)) : 0;
    const mark = look === 'selected' ? '✓' : label && (look === 'booked' || look === 'held' || look === 'part') ? label : look === 'mine' ? (label ?? 'You') : look === 'part' ? String(room) : look === 'free' && mode === 'book' ? '+' : '';
    const name = placeLabel(slot);
    const act = () => clickable && onPlace?.(c, slot, look);
    return (
      <g
        key={slot}
        role="button"
        tabIndex={clickable ? 0 : -1}
        aria-disabled={!clickable}
        aria-pressed={mode === 'book' ? look === 'selected' : undefined}
        aria-label={`${c.name}, ${name}: ${PLACE_LOOK[look].label}${look === 'free' ? `, ${c.boxes_per_slot} boxes` : look === 'part' ? `, room for ${room} of ${c.boxes_per_slot} boxes` : ''}${label ? `, ${label}` : ''}`}
        onClick={act}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            act();
          }
        }}
        className={clickable ? 'cursor-pointer outline-none [&:focus-visible>rect]:stroke-sky-900 [&:focus-visible>rect]:[stroke-width:3]' : 'cursor-default'}
      >
        <title>{`${name} · ${PLACE_LOOK[look].label}${look === 'part' ? ` · room for ${room} boxes` : ''}${label ? ` · ${label}` : ''}`}</title>
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

  return (
    <div className="overflow-x-auto overscroll-x-contain pb-2">
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
          <text x={(doorL + doorR) / 2} y={M.t + h + 20} textAnchor="middle" fontSize={12} fontWeight={700} letterSpacing="0.16em" fill="#b45309">DOOR</text>
          <text x={(doorL + doorR) / 2} y={M.t + h + 36} textAnchor="middle" fontSize={11} fill="#64748b">you enter here · Row 1 is nearest</text>
        </g>

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
          <text x={M.l + w / 2} y={M.t - 40} textAnchor="middle" stroke="none">{`Breadth ${showLength(W, u)}`}</text>
          <line x1={M.l + w + 30} y1={M.t} x2={M.l + w + 30} y2={M.t + h} markerStart={`url(#arr-${uid})`} markerEnd={`url(#arr-${uid})`} />
          <text x={M.l + w + 46} y={M.t + h / 2} transform={`rotate(90 ${M.l + w + 46} ${M.t + h / 2})`} textAnchor="middle" stroke="none">
            {`Length ${showLength(L, u)} (door → back wall)`}
          </text>
        </g>
      </svg>
      <p className="mt-1 text-center text-xs text-slate-600">
        Height {showLength(size.height, u)} · each place {showLength(plan.placeW, u)} × {showLength(plan.placeD, u)}: {layersText(plan)} = <strong>{c.boxes_per_slot.toLocaleString('en-IN')} boxes</strong>, stacked {showLength(plan.stackHeight, u)} high
      </p>
    </div>
  );
}
