'use client';

/**
 * One chamber from the side, as you see it standing at its door: the floors
 * one above the other, the door, and the front row of stacks on each floor —
 * every bin or crate drawn, as high as they stand — with each floor's share
 * of the owner's count written beside it. Drawn to scale from the same plan
 * that is saved (lib/coldStore), so "8 stacks of 5 bins" is what farmers get.
 * Drawn at the width it has on screen; on a phone the words about each floor
 * stand inside it.
 */
import { memo } from 'react';

import { useWidth } from '@/components/rental/owner/useWidth';
import { FOOT, type SizeUnit } from '@/lib/coldLayout';
import { countText, unitWord, type ModelChamber } from '@/lib/coldStore';

const say = (m: number, unit: SizeUnit) => {
  const v = m / (unit === 'ft' ? FOOT : 1);
  return `${(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('en-IN')} ${unit}`;
};
const LOOK = { bins: { fill: '#d6a46b', stroke: '#7c2d12' }, crates: { fill: '#60a5fa', stroke: '#1e3a8a' } } as const;

/** "Floor 1: 40 bins = 8 stacks of 5" */
export function floorText(mc: ModelChamber, f: ModelChamber['floors'][number]): string {
  return `${mc.floors.length > 1 ? `Floor ${f.floor}: ` : ''}${countText(f.count, mc.storage)} = ${f.places.toLocaleString('en-IN')} stack${f.places === 1 ? '' : 's'} of ${f.stack} ${unitWord(mc.storage, f.stack)}`;
}

export const ChamberSide = memo(function ChamberSide({ chamber: mc }: { chamber: ModelChamber }) {
  const [ref, shownWidth] = useWidth();
  const f0 = mc.floors[0];
  if (!f0) {
    return <p ref={ref} className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-900/5">Fill in how many {mc.storage}, the floors and the door — {mc.name} is drawn here from the side.</p>;
  }
  const s = f0.size;
  const u = s.unit;
  const Wd = s.width; // along the door wall
  const H = s.height;
  const floorH = H / mc.floors.length;
  const W = shownWidth ? Math.max(280, Math.min(800, shownWidth)) : 720;
  // Narrow: the words about each floor inside it; wide: beside the chamber.
  const narrow = W < 520;
  const font = narrow ? 13 : 15;
  const M = { l: 40, r: narrow ? 12 : 230, t: 16, b: 36 };
  const k = Math.min((W - M.l - M.r) / Wd, 420 / H);
  const h = H * k;
  const X = (x: number) => M.l + x * k;
  const Y = (z: number) => M.t + (H - z) * k; // z: height above the ground
  const svgH = M.t + h + M.b;
  const door = s.door;
  const unitH = s.box.h;
  const label = `${mc.name} from the side: ${say(H, u)} high, ${mc.floors.length} floor${mc.floors.length === 1 ? '' : 's'} of ${say(floorH, u)}. ${mc.floors.map((f) => floorText(mc, f)).join('. ')}.`;

  return (
    <figure ref={ref} className="space-y-1">
      <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-900/10">
        <svg viewBox={`0 0 ${W} ${svgH}`} width="100%" role="img" aria-label={label} className="block h-auto w-full">
          <title>{label}</title>
          <rect x={X(0)} y={Y(H)} width={Wd * k} height={h} fill="#f8fafc" stroke="#334155" strokeWidth={4} />
          {mc.floors.map((f) => {
            const z0 = (f.floor - 1) * floorH;
            const unused = new Set(f.plan.unused ?? []);
            // The front row of stacks (row 1, by the door); where row 1 has a gap, the row behind shows.
            const cols = Array.from({ length: f.plan.cols }, (_, c) => c).filter((c) => !unused.has(`1${String.fromCharCode(65 + c)}`) || f.plan.rows > 1);
            const pw = f.plan.placeW * k;
            const bh = Math.max(1.5, unitH * k * (f.plan.crowded ? 0.9 : 1));
            return (
              <g key={f.floor}>
                {f.floor > 1 && <line x1={X(0)} y1={Y(z0)} x2={X(Wd)} y2={Y(z0)} stroke="#475569" strokeWidth={4} />}
                {cols.map((c) =>
                  // A very tall stack is one block (too many to draw one by one).
                  f.stack > 60 ? (
                    <rect key={c} x={X(f.plan.colX[c])} y={Y(z0) - Math.min(f.stack * bh, floorH * k)} width={Math.max(1, pw)} height={Math.min(f.stack * bh, floorH * k)} fill={LOOK[mc.storage].fill} stroke={LOOK[mc.storage].stroke} strokeWidth={0.8} />
                  ) : (
                    Array.from({ length: f.stack }, (_, i) => (
                      <rect key={`${c}-${i}`} x={X(f.plan.colX[c])} y={Y(z0) - (i + 1) * bh} width={Math.max(1, pw)} height={Math.max(1, bh - (bh > 4 ? 1 : 0))} fill={LOOK[mc.storage].fill} stroke={LOOK[mc.storage].stroke} strokeWidth={bh > 4 ? 0.8 : 0} />
                    ))
                  ),
                )}
                {narrow ? (
                  <text x={X(0) + 8} y={Y(z0 + floorH) + 8 + font} fontSize={font} fontWeight={800} fill="#0f172a" stroke="#ffffff" strokeWidth={4} paintOrder="stroke">
                    {`${mc.floors.length > 1 ? `Floor ${f.floor}` : 'One floor'} · ${countText(f.count, mc.storage)}`}
                    <tspan x={X(0) + 8} dy={font + 3} fontSize={font - 2} fontWeight={600} fill="#334155">{`${f.places.toLocaleString('en-IN')} stacks × ${f.stack} high`}</tspan>
                  </text>
                ) : (
                  <>
                    <text x={X(Wd) + 12} y={Y(z0 + floorH / 2) - 6} fontSize={font} fontWeight={800} fill="#0f172a">
                      {mc.floors.length > 1 ? `Floor ${f.floor}` : 'One floor'}
                    </text>
                    <text x={X(Wd) + 12} y={Y(z0 + floorH / 2) + 14} fontSize={font - 2} fill="#334155">
                      {`${countText(f.count, mc.storage)} · ${f.places.toLocaleString('en-IN')} × ${f.stack} high`}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          {door && <rect x={X(door.at)} y={Y(Math.min(door.height, H))} width={door.width * k} height={Math.min(door.height, H) * k} fill="none" stroke="#d97706" strokeWidth={3} strokeDasharray="7 4" />}
          {door && (
            <text x={X(door.at + door.width / 2)} y={Y(0) + 22} textAnchor="middle" fontSize={font - 2} fontWeight={700} fill="#b45309">
              Door {say(door.width, u)} × {say(door.height, u)}
            </text>
          )}
          <text transform={`translate(${X(0) - 16} ${Y(H / 2)}) rotate(-90)`} textAnchor="middle" fontSize={font - 1} fontWeight={700} fill="#334155">
            Height {say(H, u)}
          </text>
        </svg>
      </div>
      <figcaption className="text-xs text-slate-600">From the door: the front row of stacks on each floor. Each floor is {say(floorH, u)} high.</figcaption>
    </figure>
  );
});
