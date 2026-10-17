/**
 * What each place of the cold store map looks like — shared by the floor
 * plan (ColdStoreMap) and the 3D view (ColdStore3D).
 */
import { placeName, type ColdChamber, type PlaceState } from '@/lib/db/coldMap';

export type Look = PlaceState | 'selected';

export const PLACE_LOOK: Record<Look, { label: string; cell: string; swatch: string; mini: string; hex: string }> = {
  free: { label: 'Free', cell: 'bg-sky-100 text-sky-800 ring-1 ring-sky-300 hover:bg-sky-200', swatch: 'bg-sky-100 ring-1 ring-sky-300', mini: '#bae6fd', hex: '#38bdf8' },
  part: {
    label: 'Shared — room for more boxes',
    cell: 'bg-[linear-gradient(to_top,#cbd5e1_0_var(--full,50%),#e0f2fe_var(--full,50%))] text-sky-900 ring-1 ring-sky-400 hover:ring-2',
    swatch: 'bg-[linear-gradient(to_top,#cbd5e1_0_50%,#e0f2fe_50%)] ring-1 ring-sky-400',
    mini: '#7dd3fc',
    hex: '#67e8f9',
  },
  selected: { label: 'Your choice', cell: 'bg-emerald-500 text-white ring-2 ring-emerald-700 shadow-md', swatch: 'bg-emerald-500', mini: '#10b981', hex: '#10b981' },
  held: { label: 'Waiting for payment', cell: 'bg-amber-300 text-amber-950', swatch: 'bg-amber-300', mini: '#fcd34d', hex: '#fbbf24' },
  booked: { label: 'Booked', cell: 'bg-slate-400 text-white', swatch: 'bg-slate-400', mini: '#94a3b8', hex: '#94a3b8' },
  mine: { label: 'Your boxes', cell: 'bg-violet-600 text-white shadow-sm', swatch: 'bg-violet-600', mini: '#7c3aed', hex: '#7c3aed' },
  blocked: {
    label: 'No place here (pillar, walkway)',
    cell: 'bg-[repeating-linear-gradient(45deg,#e2e8f0_0_4px,#f8fafc_4px_8px)] text-slate-400',
    swatch: 'bg-[repeating-linear-gradient(45deg,#cbd5e1_0_3px,#f8fafc_3px_6px)] ring-1 ring-slate-300',
    mini: '#e2e8f0',
    hex: '#cbd5e1',
  },
};

/** Every place of a chamber, front row first: [row, stack index, code]. */
export function placesOf(c: Pick<ColdChamber, 'rows' | 'cols'>): [number, number, string][] {
  const out: [number, number, string][] = [];
  for (let r = 1; r <= c.rows; r++) for (let i = 0; i < c.cols; i++) out.push([r, i, placeName(r, i)]);
  return out;
}

/** How many places of each kind a chamber has. */
export function countLooks(c: ColdChamber, stateOf: (c: ColdChamber, slot: string) => Look): Record<Look, number> {
  const n: Record<Look, number> = { free: 0, part: 0, selected: 0, held: 0, booked: 0, mine: 0, blocked: 0 };
  for (const [, , slot] of placesOf(c)) n[stateOf(c, slot)]++;
  return n;
}
