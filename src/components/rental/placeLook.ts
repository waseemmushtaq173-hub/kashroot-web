/**
 * What each place of the cold store map looks like — shared by the floor
 * plan (ColdStoreMap) and the 3D view (ColdStore3D).
 */
import { placeName, type ColdChamber, type PlaceState } from '@/lib/db/coldMap';

export type Look = PlaceState | 'selected';

/**
 * The one palette of the bin map (the drawing, the top view, the 3D view and
 * the walk all read it from here):
 *   free      soft green #EAF3EE, green edge #286B54
 *   part      shared: cream #FEF3C7, gold edge #C6A45B (filled from the bottom as it fills)
 *   booked    full: muted slate #E2E8F0 / #64748B
 *   selected  the viewer's choice: forest green #174C3C with a gold ring #C6A45B
 *   mine      the viewer's own stored bins: deep green #12382E with the same gold ring
 *   held      someone's 24-hour hold: slate, dashed edge
 *   blocked   no place here: pale red #FEE2E2 / #991B1B, striped
 * `mini` (the top view's fill) and `fill` must differ for every look: the top view groups places by fill.
 */
export const PLACE_LOOK: Record<Look, { label: string; cell: string; swatch: string; mini: string; hex: string; fill: string; stroke: string; text: string }> = {
  free: { label: 'Free', cell: 'bg-[#EAF3EE] text-[#174C3C] ring-1 ring-[#286B54] hover:bg-[#DCEBE3]', swatch: 'bg-[#EAF3EE] ring-1 ring-[#286B54]', mini: '#CFE5D9', hex: '#5FA98A', fill: '#EAF3EE', stroke: '#286B54', text: '#174C3C' },
  part: {
    label: 'Shared — room for more boxes',
    cell: 'bg-[linear-gradient(to_top,#E9D8A6_0_var(--full,50%),#FEF3C7_var(--full,50%))] text-[#6B4F0F] ring-1 ring-[#C6A45B] hover:ring-2',
    swatch: 'bg-[linear-gradient(to_top,#E9D8A6_0_50%,#FEF3C7_50%)] ring-1 ring-[#C6A45B]',
    mini: '#F5DF9A',
    hex: '#E3C877',
    fill: '#FEF3C7',
    stroke: '#C6A45B',
    text: '#6B4F0F',
  },
  selected: { label: 'Your choice', cell: 'bg-[#174C3C] text-white ring-2 ring-[#C6A45B] shadow-md', swatch: 'bg-[#174C3C] ring-2 ring-[#C6A45B]', mini: '#174C3C', hex: '#174C3C', fill: '#174C3C', stroke: '#C6A45B', text: '#ffffff' },
  held: { label: 'Waiting for payment', cell: 'bg-[#CBD5E1] text-[#334155] ring-1 ring-[#64748B]', swatch: 'bg-[#CBD5E1] ring-1 ring-[#64748B]', mini: '#CBD5E1', hex: '#94A3B8', fill: '#CBD5E1', stroke: '#64748B', text: '#334155' },
  booked: { label: 'Booked', cell: 'bg-[#E2E8F0] text-[#475569] ring-1 ring-[#64748B]', swatch: 'bg-[#E2E8F0] ring-1 ring-[#64748B]', mini: '#E2E8F0', hex: '#64748B', fill: '#E2E8F0', stroke: '#64748B', text: '#475569' },
  mine: { label: 'Your boxes', cell: 'bg-[#12382E] text-white ring-2 ring-[#C6A45B] shadow-sm', swatch: 'bg-[#12382E] ring-2 ring-[#C6A45B]', mini: '#12382E', hex: '#12382E', fill: '#12382E', stroke: '#C6A45B', text: '#ffffff' },
  blocked: {
    label: 'No place here (pillar, walkway)',
    cell: 'bg-[repeating-linear-gradient(45deg,#FEE2E2_0_4px,#ffffff_4px_8px)] text-[#991B1B] ring-1 ring-[#991B1B]/40',
    swatch: 'bg-[repeating-linear-gradient(45deg,#FECACA_0_3px,#ffffff_3px_6px)] ring-1 ring-[#991B1B]/50',
    mini: '#FEE2E2',
    hex: '#E8A9A9',
    fill: '#FEE2E2',
    stroke: '#991B1B',
    text: '#991B1B',
  },
};

/**
 * A look in the words of what the store holds (`units`: "bins", "bins and
 * crates"; stores set up before the owner wizard hold boxes):
 * "Shared — room for more bins", "Your crates".
 */
export function lookLabel(look: Look, units = 'boxes'): string {
  if (look === 'part') return `Shared — room for more ${units}`;
  if (look === 'mine') return `Your ${units}`;
  return PLACE_LOOK[look].label;
}

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
