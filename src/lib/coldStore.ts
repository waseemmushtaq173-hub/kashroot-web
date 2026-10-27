/**
 * A cold store as its owner describes it in the owner wizard
 * (components/rental/owner): who runs it and where it is, the building (its
 * length, width and height, and the main door), and its chambers — each
 * holding bins (big wooden pallet bins stacked by forklift) or plastic
 * crates, on one or more floors, with its own size, door and rent.
 *
 * `storeModel(draft)` turns exactly what the owner typed into exactly what is
 * saved — the store, and one cold_chambers row per floor of each chamber —
 * and what the drawings and the 3D view show, with kind, specific checks.
 * The live preview and the saved store come from the same output, so
 * farmers see what the owner saw.
 *
 * The owner's count of bins or crates is the truth. A chamber's count is
 * split over its floors as evenly as possible (lower floors take the extra
 * one); on each floor a place is one stack, as high as the largest number
 * that fits under the floor's ceiling (or that the owner says they stack)
 * and divides that floor's count exactly — so places × stack = the count,
 * nothing left over (a count with no such divisor gives stacks of one).
 * The places are laid out by lib/coldLayout.
 *
 * The chambers stand along a passage that starts at the main door and runs
 * straight in: on its left, on its right or on both sides (1 left, 2 right,
 * 3 left …), in chamber-number order from the main door inward, each with its
 * door in the wall that faces the passage — unless the owner says where a
 * chamber stands.
 *
 * Walls: front, back, left and right as the building is seen from the front.
 * A "length" runs along the front (left to right), a "width" from the front
 * to the back. A door's distance is from the left corner of its wall as you
 * stand outside facing that wall. Everything is kept in metres; `unit`
 * remembers how the owner typed. Shared by browser and server, no side
 * effects.
 */
import { FOOT, GRID_ROWS, MAX_COLS, planOf, WALLS, type ChamberPlan, type ChamberSize, type SizeUnit, type Wall } from '@/lib/coldLayout';
import type { ColdChamber } from '@/lib/db/coldMap';

export { WALLS, type Wall, type SizeUnit };

/** Where the chambers are, as you walk in through the main door: left of the passage, right of it, or both sides. */
export type Sides = 'left' | 'right' | 'both';
export type Side = Exclude<Sides, 'both'>;
export const SIDES: Sides[] = ['left', 'right', 'both'];
/** The side of the passage for the n-th chamber placed in order (from 0): all on one side, or 1 left, 2 right, 3 left … */
export const sideOrder = (sides: Sides, n: number): Side => (sides === 'both' ? (n % 2 ? 'right' : 'left') : sides);

// ───────────────────────── what a chamber stores ─────────────────────────

/** What a chamber's places hold: bins or crates (owner wizard), or boxes (stores set up before it). */
export type Storage = 'bins' | 'crates' | 'boxes';
export type Packed = Exclude<Storage, 'boxes'>;

/** Words for one and many: "1 bin", "80 bins", "1 crate", "1 box". */
export const UNIT_WORDS: Record<Storage, { one: string; many: string; title: string }> = {
  bins: { one: 'bin', many: 'bins', title: 'Bins' },
  crates: { one: 'crate', many: 'crates', title: 'Crates' },
  boxes: { one: 'box', many: 'boxes', title: 'Boxes' },
};
export const unitWord = (storage: Storage, n = 2) => (n === 1 ? UNIT_WORDS[storage].one : UNIT_WORDS[storage].many);
/** "80 bins", "1 crate", "4,480 boxes". */
export const countText = (n: number, storage: Storage) => `${n.toLocaleString('en-IN')} ${unitWord(storage, n)}`;
/** The words for a mix of chambers: "bins", "bins and crates", "bins, boxes and crates". */
export function unitsText(storages: Storage[]): string {
  const words = (['bins', 'crates', 'boxes'] as const).filter((s) => storages.includes(s)).map((s) => UNIT_WORDS[s].many);
  if (words.length < 2) return words[0] ?? 'boxes';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * One bin or crate as it stands in a stack: footprint (l × w) and the height
 * it adds to a stack, gap included; the kg it usually holds; and the gaps
 * the layout keeps (at the walls, between stacks, inside the door) and the
 * walkway's width (as wide as the door, within these limits).
 */
export const PACKING: Record<Packed, { size: { l: number; w: number; h: number }; kg: [number, number]; usualKg: string; wallGap: number; gap: number; doorGap: number; walk: [number, number] }> = {
  bins: { size: { l: 1.2, w: 1.2, h: 0.76 }, kg: [50, 1500], usualKg: 'about 200–400 kg', wallGap: 0.3, gap: 0.1, doorGap: 1.5, walk: [1.2, 3.5] },
  crates: { size: { l: 0.6, w: 0.4, h: 0.3 }, kg: [2, 60], usualKg: 'about 20 kg', wallGap: 0.2, gap: 0.05, doorGap: 1, walk: [0.9, 2.5] },
};

// ───────────────────────── places in India ─────────────────────────

export const JK = 'Jammu & Kashmir';
/** States and union territories, Jammu & Kashmir first. */
export const STATES = [
  JK,
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];
/** The 20 districts of Jammu & Kashmir. */
export const JK_DISTRICTS = ['Anantnag', 'Bandipora', 'Baramulla', 'Budgam', 'Doda', 'Ganderbal', 'Jammu', 'Kathua', 'Kishtwar', 'Kulgam', 'Kupwara', 'Poonch', 'Pulwama', 'Rajouri', 'Ramban', 'Reasi', 'Samba', 'Shopian', 'Srinagar', 'Udhampur'];

// ───────────────────────── what the owner types ─────────────────────────

/** A door as typed: which wall, how far from the left corner (standing outside facing it), width, height. */
export interface DoorDraft {
  wall: Wall;
  from: string;
  width: string;
  height: string;
}

/** One chamber as typed (lengths in the store's unit). */
export interface ChamberDraft {
  /** Stable while editing (the drawings and 3D keep track of it by this). */
  key: string;
  /** Chamber number. */
  no: string;
  storage: Packed;
  /** How many bins / crates the chamber holds. */
  count: string;
  /** Kg in one bin / crate. */
  kg: string;
  /** Capacity in metric tonnes as the owner wrote it; '' = count × kg. */
  tonnes: string;
  floors: string;
  /** Along the front (left to right), front to back, floor to ceiling. */
  length: string;
  width: string;
  height: string;
  door: DoorDraft;
  /** Rupees for one bin / crate for one month. */
  rate: string;
  /** How high they stack, if the owner says ('' = as high as fits). */
  stackHigh: string;
  /** Where it stands, if the owner says: from the building's left wall and front wall ('' = drawn in order). */
  spotX: string;
  spotY: string;
}

/** The whole store as typed. */
export interface StoreDraft {
  title: string;
  ownerName: string;
  ownerPhone: string;
  managerName: string;
  managerPhone: string;
  state: string;
  district: string;
  area: string;
  address: string;
  /** Feet or metres, for the building and every chamber. */
  unit: SizeUnit;
  /** `sides`: where the chambers are along the passage from the main door ('' = not chosen yet). */
  building: { length: string; width: string; height: string; door: DoorDraft; sides: Sides | '' };
  chambers: ChamberDraft[];
}

/** Where farmers pay the owner, as typed (saved to payout_accounts). */
export interface PayoutDraft {
  name: string;
  account: string;
  account2: string;
  ifsc: string;
  bank: string;
  upi: string;
}

let made = 0;
/** A new key for a chamber being typed. */
export const newKey = () => `c${Date.now().toString(36)}${(made++).toString(36)}`;

export const blankDoor = (): DoorDraft => ({ wall: 'front', from: '', width: '', height: '' });

export function blankStore(who?: { name?: string; phone?: string; district?: string; village?: string } | null, prefill?: { title?: string; district?: string; address?: string } | null): StoreDraft {
  const district = prefill?.district || who?.district || '';
  return {
    title: prefill?.title ?? '',
    ownerName: who?.name ?? '',
    ownerPhone: cleanMobile(who?.phone ?? ''),
    managerName: '',
    managerPhone: '',
    state: JK,
    district: JK_DISTRICTS.find((d) => d.toLowerCase() === district.trim().toLowerCase()) ?? '',
    area: who?.village ?? '',
    address: prefill?.address ?? '',
    unit: 'ft',
    building: { length: '', width: '', height: '', door: blankDoor(), sides: '' },
    chambers: [],
  };
}

export const blankChamber = (no: number, storage: Packed = 'bins'): ChamberDraft => ({
  key: newKey(),
  no: String(no),
  storage,
  count: '',
  kg: '',
  tonnes: '',
  floors: '1',
  length: '',
  width: '',
  height: '',
  door: blankDoor(),
  rate: '',
  stackHigh: '',
  spotX: '',
  spotY: '',
});

/** The next free chamber number. */
export const nextNumber = (chambers: Pick<ChamberDraft, 'no'>[], taken = 0) => Math.max(taken, 0, ...chambers.map((c) => Math.floor(Number(c.no)) || 0)) + 1;

/** A copy of a chamber with a new number (where it stands is not copied). */
export const copyChamber = (c: ChamberDraft, no: number): ChamberDraft => ({ ...c, door: { ...c.door }, key: newKey(), no: String(no), spotX: '', spotY: '' });

export const blankPayout = (name = ''): PayoutDraft => ({ name, account: '', account2: '', ifsc: '', bank: '', upi: '' });

// ───────────────────────── reading numbers ─────────────────────────

/** A typed number: null when empty, NaN when not a number. Commas and spaces are fine ("1,200"). */
export function readNumber(s: string): number | null {
  const t = s.replace(/[,\s]/g, '');
  if (!t) return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : NaN;
}
/** "32", "1.5", "2,00,000" (Indian grouping, up to 2 decimals). */
export const nice = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
/**
 * A length in metres as the owner would type it: 12.192 m → "40" (ft). To a
 * hundredth, or one or two digits more when needed so that switching feet ⇄
 * metres and back never changes a measurement (40 ft = 12.192 m, not 12.19).
 */
export function typed(m: number, unit: SizeUnit): string {
  const per = unit === 'ft' ? FOOT : 1;
  const perOther = unit === 'ft' ? 1 : FOOT;
  for (const r of [100, 1000, 10000]) {
    const v = Math.round((m / per) * r) / r;
    if (Math.round(((v * per) / perOther) * 100) === Math.round((m / perOther) * 100)) return String(v);
  }
  return String(Math.round((m / per) * 10000) / 10000);
}
const metres = (n: number, unit: SizeUnit) => n * (unit === 'ft' ? FOOT : 1);
/** A length in the owner's unit for a message: "25 ft", "7.6 m". */
const say = (v: number, unit: SizeUnit) => `${nice(Math.round(v * 10) / 10)} ${unit}`;

/** A 10-digit mobile number without +91, 91 or 0 in front. */
export function cleanMobile(v: string): string {
  let d = v.replace(/[\s\-()]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
/** What is wrong with a mobile number, or null. */
export function mobileProblem(v: string, whose: string): string | null {
  const d = cleanMobile(v);
  if (!d) return `Write ${whose} mobile number (10 digits).`;
  if (!/^\d+$/.test(d)) return `A mobile number has only digits. Check ${whose} number.`;
  if (d.length !== 10) return `A mobile number has 10 digits. ${whose[0].toUpperCase()}${whose.slice(1)} number has ${d.length}.`;
  if (!/^[6-9]/.test(d)) return `A mobile number starts with 6, 7, 8 or 9. Check the first digit of ${whose} number.`;
  return null;
}

// ───────────────────────── the model ─────────────────────────

/** Something to fix or check, next to the box it is about. */
export interface Issue {
  /** Errors stop the step; warnings ask the owner to check. */
  level: 'error' | 'warn';
  step: 1 | 2 | 3 | 4;
  /** The input: 'title', 'building.length', 'building.door.from', or `${chamber key}.height`, `${chamber key}.door.from`, `${chamber key}.fit`. */
  field: string;
  message: string;
  /** A one-tap fix: put `value` into `field` ('' for tonnes: back to count × kg). */
  fix?: { label: string; field: string; value: string };
}

/** The building (rental_listings.building), in metres. */
export interface Building {
  unit: SizeUnit;
  /** Along the front, front to back, ground to roof. */
  length: number;
  width: number;
  height: number;
  door: DoorAt;
  /** Where the chambers are along the passage from the main door ('both' for stores saved before it was asked). */
  sides: Sides;
}
/** A door in metres: its wall, from the left corner of that wall (standing outside facing it), width, height. */
export interface DoorAt {
  wall: Wall;
  from: number;
  width: number;
  height: number;
}

/** A chamber seen in the building's frame, in metres: along the front, front to back, height, and its own door. */
export interface Outline {
  length: number;
  width: number;
  height: number;
  door: DoorAt | null;
}

/** A row of cold_chambers as the owner wizard saves it (kr_save_cold_chambers). */
export interface ChamberRow {
  chamber_no: number;
  floor: number;
  name: string;
  position: number;
  rows: number;
  cols: number;
  boxes_per_slot: number;
  blocked: string[];
  storage: Packed;
  unit_kg: number;
  capacity_mt: number;
  rate: number;
  size: ChamberSize;
}

/** One floor of a chamber: its share of the count, the stack height, the places, and its plan. */
export interface ModelFloor {
  floor: number;
  count: number;
  /** Bins / crates in one stack (boxes_per_slot). */
  stack: number;
  places: number;
  /** The most that fit in one stack under this floor's ceiling. */
  fits: number;
  size: ChamberSize;
  plan: ChamberPlan;
  row: ChamberRow;
}

export interface ModelChamber {
  key: string;
  no: number;
  name: string;
  storage: Packed;
  count: number;
  kg: number;
  /** The tonnes saved (the owner's, else count × kg), and count × kg. */
  tonnes: number;
  tonnesCalc: number;
  rate: number;
  /** In the building's frame, its door in the wall facing the passage when it stands along it. */
  outline: Outline;
  /** The side of the passage it stands on (null: where the owner said, or the building is not known yet). */
  side: Side | null;
  /** Where the owner said it stands (metres from the building's left wall and front wall). */
  spot?: { x: number; y: number };
  /** The floors, laid out (empty until the count, floors and door are right). */
  floors: ModelFloor[];
  /** Everything about it is right: it can be saved. */
  ready: boolean;
}

/** The store's own row in rental_listings, as the wizard saves it. */
export interface StoreRow {
  title: string;
  owner_name: string;
  phone: string;
  manager_name: string | null;
  manager_phone: string | null;
  state: string;
  district: string;
  area: string;
  address: string | null;
  building: Building | null;
}

export interface StoreModel {
  store: StoreRow;
  building: Building | null;
  /** Chambers whose size is typed in (to draw); `ready` ones can be saved. */
  chambers: ModelChamber[];
  /** Exactly what is saved (and previewed in 3D): one row per laid-out floor, numbered in order. Save only when there are no errors. */
  rows: ChamberRow[];
  /** Where each chamber stands in the building (when the building is known). */
  layout: Arrangement | null;
  /**
   * By chamber key, for chambers that stand along the passage (the owner did
   * not say where): the side they are on and the wall their door is in — the
   * wall facing the passage, whatever wall is in the draft. Known as soon as
   * the building is, even before the chamber's size is typed.
   */
  along: Record<string, { side: Side; wall: Wall }>;
  issues: Issue[];
  totals: { bins: number; crates: number; tonnes: number; places: number };
}

/** Typical and allowed sizes, in metres: [allowed low, typical low, typical high, allowed high]. */
const RANGE = {
  buildingSide: [3, 15, 120, 600],
  buildingHeight: [2.5, 6, 18, 40],
  chamberSide: [2, 5, 60, 300],
  chamberHeight: [2, 4.5, 12, 20],
} as const;
const RANGE_TEXT: Record<'buildingHeight' | 'chamberHeight', Record<SizeUnit, string>> = {
  buildingHeight: { ft: '20 to 60 ft', m: '6 to 18 m' },
  chamberHeight: { ft: '15 to 40 ft', m: '5 to 12 m' },
};

/** A number that is far too big, divided by 10 until it is usual — "Did you mean 25 ft?". */
function meant(v: number, unit: SizeUnit, typicalLo: number, typicalHi: number): number | null {
  for (let x = v / 10; x >= 1; x /= 10) {
    const m = metres(x, unit);
    if (m >= typicalLo && m <= typicalHi) return Math.round(x * 100) / 100;
  }
  return null;
}

/** The store, its building and chambers from what the owner typed. */
export function storeModel(d: StoreDraft): StoreModel {
  const issues: Issue[] = [];
  const add = (level: Issue['level'], step: Issue['step'], field: string, message: string, fix?: Issue['fix']) => issues.push({ level, step, field, message, ...(fix ? { fix } : {}) });
  const u = d.unit;

  // ── 1. The store ──
  const title = d.title.trim().replace(/\s+/g, ' ');
  if (title.length < 2) add('error', 1, 'title', 'Write the name of your cold store.');
  else if (title.length > 100) add('error', 1, 'title', `The name is too long (${title.length} letters). Keep it under 100.`);
  const ownerName = d.ownerName.trim().replace(/\s+/g, ' ');
  if (!ownerName) add('error', 1, 'ownerName', 'Write the owner’s name.');
  else if (ownerName.length > 80) add('error', 1, 'ownerName', 'The owner’s name is too long. Keep it under 80 letters.');
  const ownerPhone = mobileProblem(d.ownerPhone, 'the owner’s');
  if (ownerPhone) add('error', 1, 'ownerPhone', ownerPhone);
  const managerName = d.managerName.trim().replace(/\s+/g, ' ');
  if (managerName.length > 80) add('error', 1, 'managerName', 'The manager’s name is too long. Keep it under 80 letters.');
  const managerPhone = mobileProblem(d.managerPhone, 'the manager’s');
  if (managerPhone) add('error', 1, 'managerPhone', managerPhone.startsWith('Write') ? 'Write the manager’s mobile number (10 digits). If you run the store yourself, write your own number.' : managerPhone);
  if (!STATES.includes(d.state)) add('error', 1, 'state', 'Choose the state or union territory.');
  const district = d.district.trim().replace(/\s+/g, ' ');
  if (d.state === JK && !JK_DISTRICTS.includes(district)) add('error', 1, 'district', 'Choose the district from the list.');
  else if (district.length < 2) add('error', 1, 'district', 'Write the district.');
  else if (district.length > 80) add('error', 1, 'district', 'The district name is too long.');
  const area = d.area.trim().replace(/\s+/g, ' ');
  if (area.length < 2) add('error', 1, 'area', 'Write the area or village where the cold store is.');
  else if (area.length > 80) add('error', 1, 'area', 'The area name is too long. Keep it under 80 letters.');
  const address = d.address.trim().replace(/\s+/g, ' ');
  if (address.length > 200) add('error', 1, 'address', `The address is too long (${address.length} letters). Keep it under 200.`);

  // ── 2. The building ──
  const side = (field: string, label: string, v: string, range: readonly number[], what: string): number | null => {
    const n = readNumber(v);
    if (n === null) return add('error', 2, field, `Write the ${label} of the building.`), null;
    if (Number.isNaN(n)) return add('error', 2, field, `Write the ${label} as a number, like 120.`), null;
    const m = metres(n, u);
    if (m < range[0]) return add('error', 2, field, `${say(n, u)} is too small for a cold store building. Check the ${label}.`), null;
    if (m > range[3]) {
      const fix = meant(n, u, range[1], range[2]);
      add('error', 2, field, `${say(n, u)} is too ${what} for a cold store building. Check the ${label}.${fix ? ` Did you mean ${say(fix, u)}?` : ''}`, fix ? { label: `Use ${say(fix, u)}`, field, value: String(fix) } : undefined);
      return null;
    }
    return m;
  };
  const bL = side('building.length', 'length', d.building.length, RANGE.buildingSide, 'long');
  const bW = side('building.width', 'width', d.building.width, RANGE.buildingSide, 'wide');
  let bH: number | null = null;
  {
    const n = readNumber(d.building.height);
    const field = 'building.height';
    if (n === null) add('error', 2, field, 'Write the height of the building, ground to roof.');
    else if (Number.isNaN(n)) add('error', 2, field, 'Write the height as a number, like 30.');
    else {
      const m = metres(n, u);
      const [lo, tlo, thi, hi] = RANGE.buildingHeight;
      if (m < lo) add('error', 2, field, `${say(n, u)} is too low for a cold store building — most are ${RANGE_TEXT.buildingHeight[u]} high. Check the height.`);
      else if (m > hi) {
        const fix = meant(n, u, tlo, thi);
        add('error', 2, field, `${say(n, u)} is too high for a cold store building — most are ${RANGE_TEXT.buildingHeight[u]} high.${fix ? ` Did you mean ${say(fix, u)}?` : ' Check the height.'}`, fix ? { label: `Use ${say(fix, u)}`, field, value: String(fix) } : undefined);
      } else bH = m;
    }
  }
  const mainDoor = readDoor(d.building.door, 'building.door', 'the main door', 'the building', 2, bL !== null && bW !== null && bH !== null ? { length: bL, width: bW, height: bH } : null, u, add);
  const sides = SIDES.includes(d.building.sides as Sides) ? (d.building.sides as Sides) : null;
  if (!sides) add('error', 2, 'building.sides', 'Choose where the chambers are, as you walk in through the main door: on the left side of the passage, on the right side, or on both sides.');
  // Drawn on both sides until the owner chooses (it cannot be saved before).
  const building: Building | null = bL !== null && bW !== null && bH !== null && mainDoor ? { unit: u, length: bL, width: bW, height: bH, door: mainDoor, sides: sides ?? 'both' } : null;

  // ── 3. The chambers ──
  if (!d.chambers.length) add('error', 3, 'chambers', 'Add your first chamber: tap “Add a chamber”.');
  const numbers = new Map<number, number>();
  for (const c of d.chambers) {
    const n = readNumber(c.no);
    if (n !== null && Number.isInteger(n)) numbers.set(n, (numbers.get(n) ?? 0) + 1);
  }
  // In number order from the main door inward, the chambers the owner did not place stand
  // on their side of the passage, each with its door in the wall that faces the passage.
  const byNumber = (n: number | null) => (n !== null && Number.isFinite(n) ? n : Infinity);
  const along = new Map<string, { side: Side; wall: Wall }>();
  if (building) {
    d.chambers
      .map((c, i) => ({ c, i, no: byNumber(readNumber(c.no)) }))
      .filter(({ c }) => !spotOf(c))
      .sort((a, b) => a.no - b.no || a.i - b.i)
      .forEach(({ c }, n) => {
        const side = sideOrder(building.sides, n);
        along.set(c.key, { side, wall: passageWall(building.door.wall, side) });
      });
  }
  const chambers: ModelChamber[] = [];
  for (const c of d.chambers) {
    const mc = readChamber(c, numbers, u, add, along.get(c.key));
    if (mc) chambers.push(mc);
  }
  chambers.sort((a, b) => byNumber(a.no || null) - byNumber(b.no || null));
  const rows: ChamberRow[] = [];
  for (const mc of chambers) for (const f of mc.floors) rows.push(f.row);
  rows.forEach((r, i) => (r.position = i + 1));
  if (rows.length > 100) add('error', 3, 'chambers', `KashRoot shows up to 100 chamber floors in one store. Yours has ${rows.length} (chambers × floors). Use fewer chambers or floors.`);

  // Where the chambers stand, and whether they fit inside the building.
  let layout: Arrangement | null = null;
  if (building && chambers.length) {
    layout = arrangeStore(building, chambers.map((mc) => ({ key: mc.key, name: mc.name, outline: mc.outline, spot: mc.spot, side: mc.side ?? undefined })));
    for (const p of layout.problems) add('warn', 3, `${p.key}.fit`, p.message);
  }

  const totals = { bins: 0, crates: 0, tonnes: 0, places: 0 };
  for (const mc of chambers) {
    totals[mc.storage] += mc.count;
    totals.tonnes += mc.tonnes;
    for (const f of mc.floors) totals.places += f.places;
  }
  if (totals.bins + totals.crates > 10_000_000) add('error', 3, 'chambers', 'More than 1 crore bins and crates in one store — please check the counts.');

  return {
    store: {
      title,
      owner_name: ownerName,
      phone: cleanMobile(d.ownerPhone),
      manager_name: managerName || null,
      manager_phone: cleanMobile(d.managerPhone) || null,
      state: d.state,
      district,
      area,
      address: address || null,
      building,
    },
    building,
    chambers,
    rows,
    layout,
    along: Object.fromEntries(along),
    issues,
    totals,
  };
}

type Add = (level: Issue['level'], step: Issue['step'], field: string, message: string, fix?: Issue['fix']) => void;

/**
 * A door as typed, checked against its wall (`room` in the building's frame); null until it is right.
 * `passage`: the door is in the wall that faces the passage (a chamber standing along it), whatever wall was picked.
 */
function readDoor(dd: DoorDraft, field: string, name: string, of: string, step: Issue['step'], room: { length: number; width: number; height: number } | null, u: SizeUnit, add: Add, passage = false): DoorAt | null {
  if (!WALLS.includes(dd.wall)) return add('error', step, `${field}.wall`, `Choose the wall ${name} is in.`), null;
  const read = (k: 'from' | 'width' | 'height', ask: string, like: string) => {
    const n = readNumber(dd[k]);
    if (n === null) return add('error', step, `${field}.${k}`, ask), null;
    if (Number.isNaN(n)) return add('error', step, `${field}.${k}`, `Write it as a number, like ${like}.`), null;
    return n;
  };
  const wallOf = passage ? `the wall of ${of} that faces the passage` : `the ${dd.wall} wall of ${of}`;
  const from = read(
    'from',
    passage
      ? `How far is ${name} from the left corner of the wall that faces the passage? (Stand in the passage, facing that wall.) Write 0 if it is at the corner.`
      : `How far is ${name} from the left corner of the ${dd.wall} wall? (Stand outside, facing that wall.) Write 0 if it is at the corner.`,
    '10',
  );
  const width = read('width', `Write how wide ${name} is.`, u === 'ft' ? '10' : '3');
  const height = read('height', `Write how high ${name} is.`, u === 'ft' ? '12' : '3.5');
  if (from === null || width === null || height === null) return null;
  let good = true;
  const wM = metres(width, u);
  const hM = metres(height, u);
  if (wM < 0.5) good = (add('error', step, `${field}.width`, `${say(width, u)} is too narrow for a door — a door is at least ${u === 'ft' ? '2 ft' : '0.6 m'} wide. Check the width.`), false);
  if (hM < 1.5) good = (add('error', step, `${field}.height`, `${say(height, u)} is too low for a door — a door is at least ${u === 'ft' ? '5 ft' : '1.5 m'} high. Check the height.`), false);
  if (room) {
    const wall = dd.wall === 'front' || dd.wall === 'back' ? room.length : room.width;
    const wallU = wall / (u === 'ft' ? FOOT : 1);
    const slack = 1.005;
    if (good && wM > wall * slack) good = (add('error', step, `${field}.width`, `${cap(name)} is ${say(width, u)} wide, but ${wallOf} is only ${say(wallU, u)} long. Check the door width.`), false);
    else if (good && metres(from + width, u) > wall * slack)
      good = (add('error', step, `${field}.from`, `${cap(name)} ends ${say(from + width, u)} from the left corner (${say(from, u)} + ${say(width, u)} wide), but ${wallOf} is only ${say(wallU, u)} long. Check the distance or the door width.`), false);
    if (hM > room.height * slack) good = (add('error', step, `${field}.height`, `${cap(name)} is ${say(height, u)} high, but ${of} is only ${say(room.height / (u === 'ft' ? FOOT : 1), u)} high. Check the door height.`), false);
  }
  return good && room ? { wall: dd.wall, from: metres(from, u), width: wM, height: hM } : null;
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Where the owner said a chamber stands (both distances typed as numbers), in metres — else undefined. */
function spotOf(c: Pick<ChamberDraft, 'spotX' | 'spotY'>, u?: SizeUnit): { x: number; y: number } | undefined {
  const sx = readNumber(c.spotX);
  const sy = readNumber(c.spotY);
  if (sx === null || sy === null || Number.isNaN(sx) || Number.isNaN(sy)) return undefined;
  return u ? { x: metres(sx, u), y: metres(sy, u) } : { x: sx, y: sy };
}

/**
 * One chamber as typed → its outline, floors and rows (null until its length, width and height are right).
 * `onPassage`: it stands on this side of the passage, its door in this wall (the one facing the passage).
 */
function readChamber(c: ChamberDraft, numbers: Map<number, number>, u: SizeUnit, add: Add, onPassage?: { side: Side; wall: Wall }): ModelChamber | null {
  const k = c.key;
  const P = PACKING[c.storage];
  const W = UNIT_WORDS[c.storage];
  let ok = true;
  const no = readNumber(c.no);
  let name = 'This chamber';
  if (no === null || Number.isNaN(no) || !Number.isInteger(no) || no < 1 || no > 999) ok = (add('error', 3, `${k}.no`, 'Give the chamber a number from 1 to 999.'), false);
  else {
    name = `Chamber ${no}`;
    if ((numbers.get(no) ?? 0) > 1) ok = (add('error', 3, `${k}.no`, `Chamber number ${no} is used twice. Give each chamber its own number.`), false);
  }

  // How many, how heavy, how many tonnes.
  const count = readNumber(c.count);
  if (count === null) ok = (add('error', 3, `${k}.count`, `Write how many ${W.many} ${name} holds.`), false);
  else if (Number.isNaN(count) || !Number.isInteger(count) || count < 1) ok = (add('error', 3, `${k}.count`, `Write a whole number of ${W.many}, like 80.`), false);
  else if (count > 1_000_000) ok = (add('error', 3, `${k}.count`, `${nice(count)} ${W.many} is too many for one chamber. Please check the number.`), false);
  const kg = readNumber(c.kg);
  if (kg === null) ok = (add('error', 3, `${k}.kg`, `Write how many kg of apples one ${W.one} holds.`), false);
  else if (Number.isNaN(kg) || kg <= 0) ok = (add('error', 3, `${k}.kg`, `Write the kg in one ${W.one} as a number, like ${c.storage === 'bins' ? '200' : '20'}.`), false);
  else if (kg < P.kg[0]) {
    const other = c.storage === 'bins' ? ' If they are plastic crates (about 20 kg), choose Crates above.' : '';
    ok = (add('error', 3, `${k}.kg`, `${nice(kg)} kg is too little for one ${W.one} — a ${c.storage === 'bins' ? 'wooden apple bin' : 'plastic crate'} usually holds ${P.usualKg}.${other} Check the kg.`), false);
  } else if (kg > P.kg[1]) {
    const tenth = Math.round(kg / 10);
    const fix = tenth >= P.kg[0] && tenth <= P.kg[1] ? tenth : null;
    const other = c.storage === 'crates' && !fix ? ' If they are big wooden bins, choose Bins above.' : '';
    ok = (add('error', 3, `${k}.kg`, `${nice(kg)} kg is too much for one ${W.one} — a ${c.storage === 'bins' ? 'wooden apple bin' : 'plastic crate'} usually holds ${P.usualKg}.${fix ? ` Did you mean ${nice(fix)} kg?` : ''}${other}`, fix ? { label: `Use ${nice(fix)} kg`, field: `${k}.kg`, value: String(fix) } : undefined), false);
  }
  const tonnesCalc = count && kg && Number.isFinite(count) && Number.isFinite(kg) ? Math.round(count * kg) / 1000 : 0;
  let tonnes = tonnesCalc;
  const typedT = readNumber(c.tonnes);
  if (typedT !== null) {
    if (Number.isNaN(typedT) || typedT <= 0) ok = (add('error', 3, `${k}.tonnes`, 'Write the capacity in metric tonnes as a number, like 32 — or clear it to use bins × kg.'), false);
    else if (typedT > 1_000_000) ok = (add('error', 3, `${k}.tonnes`, `${nice(typedT)} tonnes is too much for one chamber. Please check.`), false);
    else {
      tonnes = typedT;
      if (tonnesCalc > 0 && Math.abs(typedT - tonnesCalc) / tonnesCalc > 0.25) {
        add('warn', 3, `${k}.tonnes`, `${nice(count!)} ${unitWord(c.storage, count!)} × ${nice(kg!)} kg = ${nice(tonnesCalc)} tonnes, but you wrote ${nice(typedT)} tonnes. Please check.`, { label: `Use ${nice(tonnesCalc)} tonnes`, field: `${k}.tonnes`, value: '' });
      }
    }
  }

  // Floors.
  const floors = readNumber(c.floors);
  if (floors === null) ok = (add('error', 3, `${k}.floors`, `Write how many floors ${name} has (1 if it has no upper floors).`), false);
  else if (Number.isNaN(floors) || !Number.isInteger(floors) || floors < 1 || floors > 10) ok = (add('error', 3, `${k}.floors`, 'A chamber has 1 to 10 floors.'), false);
  else if (count !== null && Number.isInteger(count) && count >= 1 && count < floors) ok = (add('error', 3, `${k}.count`, `${name} has ${floors} floors but only ${countText(count, c.storage)}. Each floor needs at least one ${W.one}.`), false);

  // Size.
  const len = (f: 'length' | 'width', label: string): number | null => {
    const n = readNumber(c[f]);
    if (n === null) return add('error', 3, `${k}.${f}`, `Write the ${label} of ${name}.`), null;
    if (Number.isNaN(n)) return add('error', 3, `${k}.${f}`, `Write the ${label} as a number, like ${u === 'ft' ? '40' : '12'}.`), null;
    const m = metres(n, u);
    if (m < RANGE.chamberSide[0]) return add('error', 3, `${k}.${f}`, `${say(n, u)} is too small for a chamber. Check the ${label}.`), null;
    if (m > RANGE.chamberSide[3]) {
      const fix = meant(n, u, RANGE.chamberSide[1], RANGE.chamberSide[2]);
      add('error', 3, `${k}.${f}`, `${say(n, u)} is too ${f === 'length' ? 'long' : 'wide'} for a chamber.${fix ? ` Did you mean ${say(fix, u)}?` : ` Check the ${label}.`}`, fix ? { label: `Use ${say(fix, u)}`, field: `${k}.${f}`, value: String(fix) } : undefined);
      return null;
    }
    return m;
  };
  const A = len('length', 'length');
  const D = len('width', 'width');
  let H: number | null = null;
  {
    const n = readNumber(c.height);
    const field = `${k}.height`;
    const [lo, tlo, thi, hi] = RANGE.chamberHeight;
    if (n === null) add('error', 3, field, `Write the height of ${name}, floor to ceiling.`);
    else if (Number.isNaN(n)) add('error', 3, field, `Write the height as a number, like ${u === 'ft' ? '28' : '8.5'}.`);
    else if (metres(n, u) > hi) {
      const fix = meant(n, u, tlo, thi);
      add('error', 3, field, `${say(n, u)} is too high for a chamber — most chambers are ${RANGE_TEXT.chamberHeight[u]} high.${fix ? ` Did you mean ${say(fix, u)}?` : ' Check the height.'}`, fix ? { label: `Use ${say(fix, u)}`, field, value: String(fix) } : undefined);
    } else if (metres(n, u) < lo) add('error', 3, field, `${say(n, u)} is too low for a chamber — most chambers are ${RANGE_TEXT.chamberHeight[u]} high. Check the height.`);
    else H = metres(n, u);
  }
  if (A === null || D === null || H === null) ok = false;

  // The chamber's own door.
  const door = readDoor(onPassage ? { ...c.door, wall: onPassage.wall } : c.door, `${k}.door`, `the door of ${name}`, name, 3, A !== null && D !== null && H !== null ? { length: A, width: D, height: H } : null, u, add, Boolean(onPassage));
  if (!door) ok = false;
  if (door && c.storage === 'bins' && door.width < P.size.w * 0.98) add('warn', 3, `${k}.door.width`, `A bin is about ${u === 'ft' ? '4 ft' : '1.2 m'} wide, but the door of ${name} is only ${say(door.width / (u === 'ft' ? FOOT : 1), u)} wide. Check the door width.`);

  // Rent.
  const rate = readNumber(c.rate);
  if (rate === null) ok = (add('error', 3, `${k}.rate`, `Write the rent for one ${W.one} for one month, in rupees.`), false);
  else if (Number.isNaN(rate) || rate <= 0) ok = (add('error', 3, `${k}.rate`, `Write the rent as a number of rupees for one ${W.one} for one month.`), false);
  else if (rate > 100_000) ok = (add('error', 3, `${k}.rate`, `₹${nice(rate)} for one ${W.one} for one month is too much. Please check.`), false);

  // How high a stack goes on each floor.
  let fits = 0;
  if (H !== null && floors !== null && Number.isInteger(floors) && floors >= 1 && floors <= 10) {
    const floorH = H / floors;
    fits = Math.floor(floorH / P.size.h + 0.02);
    if (fits < 1) ok = (add('error', 3, `${k}.floors`, `Each floor of ${name} would be ${say(floorH / (u === 'ft' ? FOOT : 1), u)} high (${say(H / (u === 'ft' ? FOOT : 1), u)} ÷ ${floors} floors) — too low for one ${W.one} (${u === 'ft' ? (c.storage === 'bins' ? '2.5 ft' : '1 ft') : `${P.size.h} m`} with the gap). Use fewer floors or check the height.`), false);
  }
  let stackHigh: number | null = null;
  const sh = readNumber(c.stackHigh);
  if (sh !== null) {
    if (Number.isNaN(sh) || !Number.isInteger(sh) || sh < 1) ok = (add('error', 3, `${k}.stackHigh`, `Write how many ${W.many} high you stack, like ${c.storage === 'bins' ? '5' : '10'} — or leave it empty.`), false);
    else if (fits >= 1 && sh > fits) {
      const need = sh * P.size.h;
      const floorH = H! / Number(floors);
      ok = (add('error', 3, `${k}.stackHigh`, `${W.title} stacked ${sh} high need ${say(need / (u === 'ft' ? FOOT : 1), u)}, but each floor of ${name} is only ${say(floorH / (u === 'ft' ? FOOT : 1), u)} high. At most ${fits} fit.`, { label: `Use ${fits}`, field: `${k}.stackHigh`, value: String(fits) }), false);
    } else stackHigh = sh;
  }

  // Where it stands, if the owner said.
  const spot = spotOf(c, u);
  if (!spot && (readNumber(c.spotX) !== null || readNumber(c.spotY) !== null)) ok = (add('error', 3, `${k}.spot`, `Write both distances for where ${name} stands (from the left wall and from the front wall), or leave both empty.`), false);

  // Drawn as soon as its size is known; laid out once the count, floors and door are right too.
  if (A === null || D === null || H === null) return null;
  const outline: Outline = { length: A, width: D, height: H, door };
  const chamber: ModelChamber = { key: k, no: no !== null && Number.isInteger(no) ? no : 0, name, storage: c.storage, count: count ?? 0, kg: kg ?? 0, tonnes, tonnesCalc, rate: rate ?? 0, outline, side: onPassage?.side ?? null, ...(spot ? { spot } : {}), floors: [], ready: ok };
  const layable = door && count !== null && Number.isInteger(count) && count >= 1 && count <= 1_000_000 && floors !== null && Number.isInteger(floors) && floors >= 1 && floors <= 10 && count >= floors && fits >= 1 && (sh === null || stackHigh !== null);
  if (!layable) return chamber;

  // The floors: the count split evenly (lower floors take the extra one), each in equal stacks.
  const along = door.wall === 'front' || door.wall === 'back';
  const out = chamber.floors;
  const raised: { floor: number; n: number; stack: number }[] = [];
  const base = Math.floor(count / floors);
  const extra = count % floors;
  for (let f = 1; f <= floors; f++) {
    const n = base + (f <= extra ? 1 : 0);
    const most = stackHigh ?? fits;
    let stack = 1;
    for (let s = Math.min(most, n); s >= 1; s--) {
      if (n % s === 0) {
        stack = s;
        break;
      }
    }
    // The booking map holds at most 99 × 26 places a floor: only then, taller stacks.
    const limit = GRID_ROWS * MAX_COLS;
    if (n / stack > limit) {
      let s = stack + 1;
      while (s <= n && (n % s !== 0 || n / s > limit)) s++;
      stack = s;
      raised.push({ floor: f, n, stack });
    }
    const places = n / stack;
    const size: ChamberSize = {
      unit: u,
      length: along ? D : A,
      width: along ? A : D,
      height: H,
      box: { ...P.size },
      place: { l: P.size.l, w: P.size.w },
      base: 0,
      aisle: Math.min(P.walk[1], Math.max(P.walk[0], door.width)),
      wallGap: P.wallGap,
      stackGap: P.gap,
      topGap: 0,
      doorGap: P.doorGap,
      boxes: stack,
      door: { at: door.from, width: door.width, height: door.height },
      doorWall: door.wall,
      floors,
      floor: f,
      places,
      stackOf: c.storage === 'bins' ? 'bin' : 'crate',
      ...(stackHigh ? { stackHigh } : {}),
      ...(spot ? { spot } : {}),
    };
    if (stack > 5000) {
      const room = roomOnFloor(size);
      const near = nearestEven(count, floors, stackHigh ?? fits, room);
      const most = room * (stackHigh ?? fits) * floors;
      add(
        'error',
        3,
        `${k}.count`,
        `${countText(n, c.storage)} on floor ${f} of ${name} cannot stand in equal stacks that fit (${nice(n)} cannot be split into equal stacks of ${stackHigh ?? fits} or less). Please check the count.${near ? ` Did you mean ${countText(near, c.storage)}?` : most > 0 ? ` At most about ${countText(most, c.storage)} fit in ${name}.` : ''}`,
        near ? { label: `Use ${countText(near, c.storage)}`, field: `${k}.count`, value: String(near) } : undefined,
      );
      chamber.ready = false;
      chamber.floors = [];
      return chamber;
    }
    const plan = planOf(size);
    const unused = plan.unused ?? [];
    if (plan.problems.length || (plan.rows * plan.cols - unused.length) * stack !== n) {
      add('error', 3, `${k}.fit`, plan.problems.length ? `${name}: ${plan.problems[0]}` : `${name}: the places on floor ${f} do not add up. Please change the count a little and try again.`);
      chamber.ready = false;
      chamber.floors = [];
      return chamber;
    }
    out.push({
      floor: f,
      count: n,
      stack,
      places,
      fits,
      size,
      plan,
      row: {
        chamber_no: chamber.no,
        floor: f,
        name: floors > 1 ? `${name} · Floor ${f}` : name,
        position: 0,
        rows: plan.rows,
        cols: plan.cols,
        boxes_per_slot: stack,
        blocked: unused,
        storage: c.storage,
        unit_kg: kg ?? 0,
        capacity_mt: Math.round(tonnes * 1000) / 1000,
        rate: rate ?? 0,
        size,
      },
    });
  }
  // Too many places for the floor or the booking map: say so, and the nearest count that stacks evenly and fits.
  const crowded = out.filter((f) => f.plan.crowded);
  if (raised.length || crowded.length) {
    const most = stackHigh ?? fits;
    const room = roomOnFloor(out[0].size);
    const near = nearestEven(count, floors, most, room);
    const fix = near ? { label: `Use ${countText(near, c.storage)}`, field: `${k}.count`, value: String(near) } : undefined;
    const better = near ? ` Did you mean ${countText(near, c.storage)}? Those stand in equal stacks that fit.` : '';
    if (raised.length) {
      const r = raised[0];
      add('warn', 3, `${k}.count`, `${countText(r.n, c.storage)} on floor ${r.floor} of ${name} cannot stand in equal stacks of ${most} or less without too many places for the booking map, so each place counts as a stack of ${nice(r.stack)}. Please check the count.${better}`, fix);
    } else {
      const f0 = crowded[0];
      const why = f0.stack === 1 && most > 1 ? ` (${nice(f0.count)} cannot be split into equal stacks of 2 to ${most})` : '';
      const fitsAll = room * most * floors;
      add(
        'warn',
        3,
        `${k}.fit`,
        `${countText(f0.count, c.storage)} on floor ${f0.floor} of ${name} make ${nice(f0.places)} stacks of ${f0.stack}${why}, but only about ${nice(room)} stacks fit on a ${say(A / (u === 'ft' ? FOOT : 1), u)} × ${say(D / (u === 'ft' ? FOOT : 1), u)} floor. ${fitsAll > 0 ? `At most about ${countText(fitsAll, c.storage)} fit in ${name}. ` : ''}Check the count and the size.${better}`,
        fix,
      );
    }
  }
  return chamber;
}

/**
 * The count nearest to `count` (a little less first) whose floors all stand
 * in equal stacks of at most `most` that fit on a floor with room for `room`
 * stacks — or null when none is near.
 */
export function nearestEven(count: number, floors: number, most: number, room: number): number | null {
  const even = (n: number) => {
    if (n < floors) return false;
    const base = Math.floor(n / floors);
    const extra = n % floors;
    for (let f = 1; f <= floors; f++) {
      const c = base + (f <= extra ? 1 : 0);
      let k = 1;
      for (let s = Math.min(most, c); s >= 1; s--) {
        if (c % s === 0) {
          k = s;
          break;
        }
      }
      if (c / k > Math.min(room, GRID_ROWS * MAX_COLS)) return false;
    }
    return true;
  };
  const span = Math.min(200, Math.max(20, Math.ceil(count * 0.05)));
  for (let d = 1; d <= span; d++) {
    if (even(count - d)) return count - d;
    if (even(count + d)) return count + d;
  }
  return null;
}

/** The most places that stand on one floor at their real size. */
export function roomOnFloor(size: ChamberSize): number {
  const fit = (space: number, s: number, g: number) => (space >= s * 0.995 ? Math.floor((space + g) / (s + g) + 0.005) : 0);
  const g = size.stackGap;
  const wg = size.wallGap;
  let best = 0;
  const turns: [number, number][] = [[size.place.w, size.place.l], [size.place.l, size.place.w]];
  for (const [pw, pd] of turns) {
    const rows = Math.min(GRID_ROWS, fit(size.length - size.doorGap - wg, pd, g));
    best = Math.max(best, rows * Math.min(MAX_COLS, fit(size.width - 2 * wg, pw, g)));
  }
  return best;
}

// ───────────────────────── chambers in the building ─────────────────────────

/** Where a chamber stands in the building, in metres from its left wall (x) and front wall (y) to the chamber's front-left corner. */
export interface Spot {
  x: number;
  y: number;
  /** Along the front, and front to back. */
  w: number;
  d: number;
  /** Inside the building, clear of the others and of the passage. */
  fits: boolean;
  /** The owner said where it stands (else it stands along the passage). */
  byOwner: boolean;
  /** The side of the passage it stands on (not when the owner said where). */
  side?: Side;
}

/**
 * The passage from the main door: as wide as the door (at least CORRIDOR),
 * straight in to the wall opposite. `u` runs along the main door's wall from
 * its left corner (standing outside facing it, as you walk in: left to
 * right), `v` in from that wall.
 */
export interface Passage {
  /** In the building's frame. */
  rect: { x: number; y: number; w: number; d: number };
  /** The main door's wall. */
  wall: Wall;
  /** Where the passage is across the building (u), and how wide and deep the building is that way. */
  u0: number;
  u1: number;
  across: number;
  depth: number;
}

export interface Arrangement {
  spots: Record<string, Spot>;
  problems: { key: string; message: string }[];
  passage: Passage;
  sides: Sides;
}
/** The narrowest passage from the main door. */
export const CORRIDOR = 3;
/** How far in from the main door the way in must be clear. */
const DOOR_CLEAR = 1.5;

/** The passage from the main door (in the middle of the front wall when the door is not known). */
export function passageOf(b: { length: number; width: number; door?: DoorAt | null }): Passage {
  const door = b.door ?? { wall: 'front' as Wall, from: b.length / 2, width: 0, height: 0 };
  const alongFront = door.wall === 'front' || door.wall === 'back';
  const across = alongFront ? b.length : b.width;
  const depth = alongFront ? b.width : b.length;
  const wide = Math.min(across, Math.max(CORRIDOR, door.width));
  const u0 = Math.min(Math.max(0, door.from + door.width / 2 - wide / 2), across - wide);
  const room = { length: b.length, width: b.width };
  const p = fromDoor(door.wall, room, u0, 0);
  const q = fromDoor(door.wall, room, u0 + wide, depth);
  return { rect: { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(p.x - q.x), d: Math.abs(p.y - q.y) }, wall: door.wall, u0, u1: u0 + wide, across, depth };
}

/** The wall of a chamber on this side of the passage that faces the passage (building frame), for a main door in `mainWall`. */
export function passageWall(mainWall: Wall, side: Side): Wall {
  // To the right as you walk in (u growing), in the building's frame.
  const right: Record<Wall, Wall> = { front: 'right', back: 'left', left: 'front', right: 'back' };
  const left: Record<Wall, Wall> = { front: 'left', back: 'right', left: 'back', right: 'front' };
  return side === 'left' ? right[mainWall] : left[mainWall];
}

const SIDE_TEXT: Record<Side, string> = { left: 'Left side', right: 'Right side' };

/**
 * Where each chamber stands. Where the owner said, there. The others stand
 * along the passage from the main door, in the order given (chamber
 * numbers), from the main door inward: against the wall on the left of the
 * passage, on the right, or 1 left, 2 right, 3 left … for both sides (a
 * chamber's `side` says which, when known). Chambers that do not fit are
 * still drawn — into the passage or past the far wall — and named in
 * `problems`, as is a chamber standing in the passage or in front of the
 * main door (when `b.door` is given).
 */
export function arrangeStore(
  b: Pick<Building, 'length' | 'width' | 'height' | 'unit'> & { door?: DoorAt | null; sides?: Sides },
  chambers: { key: string; name: string; outline: Outline; spot?: { x: number; y: number }; side?: Side }[],
): Arrangement {
  const spots: Record<string, Spot> = {};
  const problems: { key: string; message: string }[] = [];
  const u = b.unit;
  const show = (m: number) => say(m / (u === 'ft' ? FOOT : 1), u);
  const slack = 0.02;
  const sides = b.sides ?? 'both';
  const pass = passageOf(b);
  const alongFront = pass.wall === 'front' || pass.wall === 'back';
  const room = { length: b.length, width: b.width };
  const roomOn: Record<Side, number> = { left: pass.u0, right: pass.across - pass.u1 };
  // How far in from the main door's wall each side is taken.
  const taken: Record<Side, number> = { left: 0, right: 0 };
  const sized = new Set<string>();
  const inPassage = new Set<string>();
  let n = 0;
  for (const c of chambers) {
    const { length: w, width: d, height } = c.outline;
    const say1 = (message: string) => (problems.push({ key: c.key, message }), sized.add(c.key));
    if (w > b.length + slack) say1(`${c.name} is ${show(w)} long, but the building is only ${show(b.length)} long. Check the sizes.`);
    if (d > b.width + slack) say1(`${c.name} is ${show(d)} wide (front to back), but the building is only ${show(b.width)} wide. Check the sizes.`);
    if (height > b.height + slack) problems.push({ key: c.key, message: `${c.name} is ${show(height)} high, but the building is only ${show(b.height)} high. Check the heights.` });
    if (c.spot) {
      spots[c.key] = { x: c.spot.x, y: c.spot.y, w, d, fits: true, byOwner: true };
      continue;
    }
    const side = c.side ?? sideOrder(sides, n);
    n++;
    // Across the passage (out from it to the wall) and along it.
    const out = alongFront ? w : d;
    const deep = alongFront ? d : w;
    const ua = side === 'left' ? 0 : pass.across - out;
    const va = taken[side];
    taken[side] += deep;
    const p = fromDoor(pass.wall, room, ua, va);
    const q = fromDoor(pass.wall, room, ua + out, va + deep);
    spots[c.key] = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w, d, fits: true, byOwner: false, side };
    if (sized.has(c.key)) continue;
    if (va + deep > pass.depth + slack) {
      spots[c.key].fits = false;
      problems.push({
        key: c.key,
        message: `${c.name} does not fit: the chambers on the ${side} of the passage need ${show(va + deep)} from the main door’s wall inward, but the building is only ${show(pass.depth)} deep that way. ${sides === 'both' ? 'Check the sizes, or say where each chamber stands (More details).' : 'Check the sizes, or choose “Both sides” in step 2 (The building).'}`,
      });
    }
    if (out > roomOn[side] + slack) {
      spots[c.key].fits = false;
      inPassage.add(c.key);
      const other: Side = side === 'left' ? 'right' : 'left';
      const swap = sides !== 'both' && out <= roomOn[other] + slack ? ` or choose “${SIDE_TEXT[other]}” in step 2 (The building),` : '';
      problems.push({
        key: c.key,
        message: `${c.name} needs ${show(out)} on the ${side} of the passage (as you walk in), but there are only ${show(roomOn[side])} between the passage and the wall on that side, so it stands in the passage. Check the sizes,${swap} or check where the main door is.`,
      });
    }
  }
  // Placed by the owner: inside the building, and clear of each other and of the passage.
  const list = chambers.map((c) => ({ c, s: spots[c.key] }));
  const overlaps = (a: { x: number; y: number; w: number; d: number }, o: { x: number; y: number; w: number; d: number }) =>
    a.x < o.x + o.w - slack && o.x < a.x + a.w - slack && a.y < o.y + o.d - slack && o.y < a.y + a.d - slack;
  for (const { c, s } of list) {
    const inside = s.x >= -slack && s.y >= -slack && s.x + s.w <= b.length + slack && s.y + s.d <= b.width + slack;
    if (inside) continue;
    s.fits = false;
    if (s.byOwner && !sized.has(c.key)) {
      problems.push({ key: c.key, message: `${c.name} goes outside the building where you said it stands (${show(s.x)} from the left wall, ${show(s.y)} from the front wall). Check those distances.` });
    }
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const o = list[j];
      if (!overlaps(a.s, o.s)) continue;
      a.s.fits = o.s.fits = false;
      if (inPassage.has(a.c.key) || inPassage.has(o.c.key)) continue;
      problems.push({ key: o.c.key, message: `${o.c.name} and ${a.c.name} overlap in the drawing. Say where each of them stands (More details).` });
    }
  }
  // The way in from the main door: as wide as the door, DOOR_CLEAR deep; and the passage.
  if (b.door) {
    const p = fromDoor(b.door.wall, room, b.door.from, 0);
    const q = fromDoor(b.door.wall, room, b.door.from + b.door.width, 0);
    const way = {
      front: { x: Math.min(p.x, q.x), y: 0, w: Math.abs(p.x - q.x), d: DOOR_CLEAR },
      back: { x: Math.min(p.x, q.x), y: b.width - DOOR_CLEAR, w: Math.abs(p.x - q.x), d: DOOR_CLEAR },
      left: { x: 0, y: Math.min(p.y, q.y), w: DOOR_CLEAR, d: Math.abs(p.y - q.y) },
      right: { x: b.length - DOOR_CLEAR, y: Math.min(p.y, q.y), w: DOOR_CLEAR, d: Math.abs(p.y - q.y) },
    }[b.door.wall];
    for (const { c, s } of list) {
      if (overlaps(s, way)) {
        s.fits = false;
        // Said once: standing in front of the main door says it all.
        if (inPassage.has(c.key)) {
          const at = problems.findIndex((x) => x.key === c.key && /stands in the passage/.test(x.message));
          if (at >= 0) problems.splice(at, 1);
        }
        problems.push({
          key: c.key,
          message: `${c.name} stands in front of the main door (in the ${b.door.wall} wall), so nobody can walk in. ${s.byOwner ? 'Check where you said it stands, or where the main door is.' : 'Check the sizes and where the main door is, or choose another side in step 2 (The building).'}`,
        });
      } else if (s.byOwner && overlaps(s, pass.rect)) {
        s.fits = false;
        problems.push({ key: c.key, message: `${c.name} stands in the passage from the main door, where you said it stands, so the way to the other chambers is blocked. Check those distances.` });
      }
    }
  }
  return { spots, problems, passage: pass, sides };
}

/** A chamber in the building's frame from a saved size (which is measured from its door). */
export function outlineOf(s: ChamberSize): Outline {
  const wall = s.doorWall ?? 'front';
  const along = wall === 'front' || wall === 'back';
  return {
    length: along ? s.width : s.length,
    width: along ? s.length : s.width,
    height: s.height,
    door: s.door ? { wall, from: s.door.at, width: s.door.width, height: s.door.height } : null,
  };
}

/**
 * A point measured from a door — `u` along its wall from the left corner (as
 * you stand outside facing it), `v` in from that wall — in the frame of the
 * room it opens into: x from the room's left side, y from its front side.
 * `room` is the room's length (along the front) and width (front to back).
 */
export function fromDoor(wall: Wall, room: { length: number; width: number }, u: number, v: number): { x: number; y: number } {
  switch (wall) {
    case 'back':
      return { x: room.length - u, y: room.width - v };
    case 'left':
      return { x: v, y: room.width - u };
    case 'right':
      return { x: room.length - v, y: u };
    default:
      return { x: u, y: v };
  }
}

/** Where a place (row 1 nearest the door, stack index from 0) stands in its chamber: x from the chamber's left side, y from its front side, w along the front, d front to back. */
export function placeRect(size: ChamberSize, plan: ChamberPlan, row: number, col: number): { x: number; y: number; w: number; d: number } | null {
  const u0 = plan.colX[col];
  const v0 = plan.rowZ[row - 1];
  if (u0 === undefined || v0 === undefined) return null;
  const o = outlineOf(size);
  const a = fromDoor(size.doorWall ?? 'front', o, u0, v0);
  const b = fromDoor(size.doorWall ?? 'front', o, u0 + plan.placeW, v0 + plan.placeD);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), d: Math.abs(a.y - b.y) };
}

/** A door as a line on its wall, in the frame of the room it belongs to: from (x1, y1) to (x2, y2). */
export function doorLine(door: DoorAt, room: { length: number; width: number }) {
  const a = fromDoor(door.wall, room, door.from, 0);
  const b = fromDoor(door.wall, room, door.from + door.width, 0);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** A building as JSON from the database, checked (null when it is not usable). */
export function asBuilding(v: unknown): Building | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Partial<Building>;
  const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const d = b.door as Partial<DoorAt> | undefined;
  if (!num(b.length) || !num(b.width) || !num(b.height) || !d || !WALLS.includes(d.wall as Wall) || typeof d.from !== 'number' || !num(d.width) || !num(d.height)) return null;
  // Stores saved before the owner was asked which side the chambers are on: both sides.
  const sides = SIDES.includes(b.sides as Sides) ? (b.sides as Sides) : 'both';
  return { unit: b.unit === 'm' ? 'm' : 'ft', length: b.length, width: b.width, height: b.height, door: { wall: d.wall as Wall, from: d.from, width: d.width, height: d.height }, sides };
}

// ───────────────────────── saved chambers, grouped ─────────────────────────

/** The floors of one chamber together (stores set up before the wizard: one row is one chamber). */
export interface ChamberGroup {
  /** `no:<chamber_no>` for wizard chambers, the row id for older ones. */
  key: string;
  no: number | null;
  name: string;
  storage: Storage;
  unitKg: number | null;
  capacityMt: number | null;
  rate: number | null;
  /** Floor rows, lowest first. */
  floors: ColdChamber[];
  /** Bins / crates / boxes it holds: usable places × stack, over its floors. */
  count: number;
  /** The lowest floor's size (all floors share the chamber's size and door), or null. */
  size: ChamberSize | null;
}

/** Saved rows grouped into chambers, in order (wizard chambers by number, then older ones). */
export function groupChambers(rows: ColdChamber[]): ChamberGroup[] {
  const groups = new Map<string, ChamberGroup>();
  const sorted = [...rows].sort((a, b) => (a.chamber_no ?? 1e6) - (b.chamber_no ?? 1e6) || a.floor - b.floor || a.position - b.position);
  for (const r of sorted) {
    const key = r.chamber_no !== null ? `${r.listing_id}:no:${r.chamber_no}` : r.id;
    let g = groups.get(key);
    if (!g) {
      g = { key, no: r.chamber_no, name: r.chamber_no !== null ? `Chamber ${r.chamber_no}` : r.name, storage: r.storage, unitKg: r.unit_kg, capacityMt: r.capacity_mt, rate: r.rate, floors: [], count: 0, size: r.size };
      groups.set(key, g);
    }
    g.floors.push(r);
    g.count += (r.rows * r.cols - r.blocked.length) * r.boxes_per_slot;
  }
  return [...groups.values()];
}

/**
 * Preview rows carry the model's building, so a 3D view of them draws the
 * building and the passage too, and where each chamber stands (by row id)
 * with the model's warnings — exactly as the owner's top view has it, even
 * while a chamber before it is still half typed (and so not in 3D yet).
 */
export type PreviewRows = ColdChamber[] & { building?: Building | null; spots?: Record<string, Spot>; problems?: string[] };

/**
 * The model's floors as chambers the map and 3D views draw (ids
 * "preview:<chamber key>:<floor>") — the very rows that will be saved —
 * with the model's building attached (components/rental/ColdStore3D reads
 * it when it is not given its own).
 */
export function previewChambers(m: Pick<StoreModel, 'chambers'> & { building?: Building | null; layout?: Arrangement | null }, listingId: string): PreviewRows {
  const rows: PreviewRows = m.chambers.flatMap((mc) =>
    mc.floors.map((f) => ({
      id: `preview:${mc.key}:${f.floor}`,
      listing_id: listingId,
      name: f.row.name,
      position: f.row.position,
      rows: f.row.rows,
      cols: f.row.cols,
      boxes_per_slot: f.row.boxes_per_slot,
      blocked: f.row.blocked,
      note: null,
      size: f.size,
      chamber_no: f.row.chamber_no,
      floor: f.floor,
      storage: mc.storage,
      unit_kg: f.row.unit_kg,
      capacity_mt: f.row.capacity_mt,
      rate: f.row.rate,
    })),
  );
  rows.building = m.building ?? null;
  if (m.layout) {
    const spots: Record<string, Spot> = {};
    for (const mc of m.chambers) {
      const sp = m.layout.spots[mc.key];
      if (sp) for (const f of mc.floors) spots[`preview:${mc.key}:${f.floor}`] = sp;
    }
    rows.spots = spots;
    rows.problems = m.layout.problems.map((p) => p.message);
  }
  return rows;
}

/** The draft of a saved store, to change it in the wizard (older chambers are left out). */
export function draftFromSaved(
  l: { title: string; owner_name: string; phone: string; manager_name?: string | null; manager_phone?: string | null; state?: string | null; district: string; area?: string | null; address: string | null; building?: unknown },
  rows: ColdChamber[],
): StoreDraft {
  const building = asBuilding(l.building);
  const groups = groupChambers(rows).filter((g) => g.no !== null && g.size && g.storage !== 'boxes');
  const unit: SizeUnit = building?.unit ?? groups[0]?.size?.unit ?? 'ft';
  const t = (m: number) => typed(m, unit);
  const state = l.state && STATES.includes(l.state) ? l.state : JK;
  return {
    title: l.title,
    ownerName: l.owner_name,
    ownerPhone: cleanMobile(l.phone),
    managerName: l.manager_name ?? '',
    managerPhone: l.manager_phone ?? '',
    state,
    district: state === JK ? (JK_DISTRICTS.find((d) => d.toLowerCase() === l.district.trim().toLowerCase()) ?? '') : l.district,
    area: l.area ?? '',
    address: l.address ?? '',
    unit,
    building: building
      ? { length: t(building.length), width: t(building.width), height: t(building.height), door: { wall: building.door.wall, from: t(building.door.from), width: t(building.door.width), height: t(building.door.height) }, sides: building.sides }
      : { length: '', width: '', height: '', door: blankDoor(), sides: '' },
    chambers: groups.map((g) => {
      const s = g.size!;
      const o = outlineOf(s);
      const calc = g.unitKg ? Math.round(g.count * g.unitKg) / 1000 : 0;
      return {
        key: `saved-${g.no}`,
        no: String(g.no),
        storage: g.storage as Packed,
        count: String(g.count),
        kg: g.unitKg ? String(g.unitKg) : '',
        tonnes: g.capacityMt && Math.abs(g.capacityMt - calc) > 0.0005 ? String(g.capacityMt) : '',
        floors: String(g.floors.length),
        length: t(o.length),
        width: t(o.width),
        height: t(o.height),
        door: o.door ? { wall: o.door.wall, from: t(o.door.from), width: t(o.door.width), height: t(o.door.height) } : blankDoor(),
        rate: g.rate !== null ? String(g.rate) : '',
        stackHigh: s.stackHigh ? String(s.stackHigh) : '',
        spotX: s.spot ? t(s.spot.x) : '',
        spotY: s.spot ? t(s.spot.y) : '',
      };
    }),
  };
}

/** Feet ⇄ metres: the same building and chambers, typed in the other unit. */
export function switchUnit(d: StoreDraft, unit: SizeUnit): StoreDraft {
  if (d.unit === unit) return d;
  const conv = (s: string) => {
    const n = readNumber(s);
    return n === null || Number.isNaN(n) ? s : typed(metres(n, d.unit), unit);
  };
  const door = (dd: DoorDraft): DoorDraft => ({ wall: dd.wall, from: conv(dd.from), width: conv(dd.width), height: conv(dd.height) });
  return {
    ...d,
    unit,
    building: { ...d.building, length: conv(d.building.length), width: conv(d.building.width), height: conv(d.building.height), door: door(d.building.door) },
    chambers: d.chambers.map((c) => ({ ...c, length: conv(c.length), width: conv(c.width), height: conv(c.height), door: door(c.door), spotX: conv(c.spotX), spotY: conv(c.spotY) })),
  };
}

/** The value of a field of the draft by its issue name ('title', 'building.door.from', '<key>.count'). */
export function getField(d: StoreDraft, field: string): string {
  const path = field.split('.');
  if (path[0] === 'building') return String(path[1] === 'door' ? d.building.door[path[2] as keyof DoorDraft] ?? '' : d.building[path[1] as 'length' | 'width' | 'height' | 'sides'] ?? '');
  const c = d.chambers.find((x) => x.key === path[0]);
  if (c) return String(path[1] === 'door' ? c.door[path[2] as keyof DoorDraft] ?? '' : c[path[1] as keyof ChamberDraft] ?? '');
  const v = d[path[0] as keyof StoreDraft];
  return typeof v === 'string' ? v : '';
}

/** Put a value into a field of the draft by its issue name ('title', 'building.door.from', '<key>.tonnes', '<key>.door.width'). */
export function setField(d: StoreDraft, field: string, value: string): StoreDraft {
  const path = field.split('.');
  if (path[0] === 'building') {
    if (path[1] === 'door') return { ...d, building: { ...d.building, door: { ...d.building.door, [path[2]]: value } } };
    return { ...d, building: { ...d.building, [path[1]]: value } };
  }
  const c = d.chambers.find((x) => x.key === path[0]);
  if (c) {
    const next: ChamberDraft = path[1] === 'door' ? { ...c, door: { ...c.door, [path[2]]: value } } : { ...c, [path[1]]: value };
    return { ...d, chambers: d.chambers.map((x) => (x.key === c.key ? next : x)) };
  }
  return path.length === 1 && path[0] in d ? { ...d, [path[0]]: value } : d;
}

// ───────────────────────── payment details ─────────────────────────

/** Bank names by the first four letters of the IFSC (read without asking any website). */
export const BANKS: Record<string, string> = {
  JAKA: 'J&K Bank', SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', PUNB: 'Punjab National Bank', UTIB: 'Axis Bank',
  BARB: 'Bank of Baroda', CNRB: 'Canara Bank', UBIN: 'Union Bank of India', IDIB: 'Indian Bank', BKID: 'Bank of India', KKBK: 'Kotak Mahindra Bank',
  YESB: 'Yes Bank', IOBA: 'Indian Overseas Bank', UCBA: 'UCO Bank', MAHB: 'Bank of Maharashtra', CBIN: 'Central Bank of India', PSIB: 'Punjab & Sind Bank',
  INDB: 'IndusInd Bank', FDRL: 'Federal Bank', IDFB: 'IDFC FIRST Bank', IBKL: 'IDBI Bank', AUBL: 'AU Small Finance Bank', RATN: 'RBL Bank',
  KARB: 'Karnataka Bank', KVBL: 'Karur Vysya Bank', SIBL: 'South Indian Bank', CSBK: 'CSB Bank', DLXB: 'Dhanlaxmi Bank', TMBL: 'Tamilnad Mercantile Bank',
  SCBL: 'Standard Chartered Bank', CITI: 'Citibank', HSBC: 'HSBC', DBSS: 'DBS Bank', PYTM: 'Paytm Payments Bank', AIRP: 'Airtel Payments Bank', IPOS: 'India Post Payments Bank',
};
export const bankOf = (ifsc: string) => BANKS[ifsc.trim().toUpperCase().slice(0, 4)] ?? null;
export const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,64}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** What is wrong with the payment details, field by field. */
export function payoutIssues(p: PayoutDraft): Issue[] {
  const out: Issue[] = [];
  const add = (field: string, message: string) => out.push({ level: 'error', step: 4, field, message });
  const name = p.name.trim();
  if (name.length < 2) add('name', 'Write the account holder’s name, as the bank has it.');
  else if (name.length > 80) add('name', 'The name is too long. Keep it under 80 letters.');
  const acc = p.account.replace(/[\s-]/g, '');
  const upi = p.upi.trim();
  if (acc) {
    if (!/^\d+$/.test(acc)) add('account', 'A bank account number has only digits. Check it.');
    else if (acc.length < 9 || acc.length > 18) add('account', `A bank account number has 9 to 18 digits. Yours has ${acc.length}. Check it.`);
    if (p.account2.replace(/[\s-]/g, '') !== acc) add('account2', p.account2.trim() ? 'The two account numbers are not the same. Please type it again.' : 'Type the account number again, to be sure it is right.');
    const ifsc = p.ifsc.trim().toUpperCase();
    if (!ifsc) add('ifsc', 'Write the IFSC of the bank branch (on the passbook or cheque book).');
    else if (ifsc.length !== 11) add('ifsc', `An IFSC has 11 letters and numbers, like JAKA0SHOPIA. Yours has ${ifsc.length}.`);
    else if (ifsc[4] !== '0') add('ifsc', 'The 5th letter of an IFSC is always 0 (zero). Check it.');
    else if (!IFSC_RE.test(ifsc)) add('ifsc', 'An IFSC starts with 4 letters, then 0, then 6 letters or numbers — like JAKA0SHOPIA. Check it.');
  } else if (p.ifsc.trim() && !upi) add('account', 'Write the bank account number for this IFSC.');
  if (upi && !UPI_RE.test(upi)) add('upi', 'A UPI ID looks like name@bank (for example 9876543210@ybl). Check it.');
  if (!acc && !upi) add('account', 'Add a bank account or a UPI ID, so farmers can pay you.');
  if (p.bank.trim().length > 80) add('bank', 'The bank name is too long.');
  return out;
}
