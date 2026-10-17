/**
 * The directory of all cold stores: one shape for every source, and reading
 * the lists they come in. Shared by the browser (the admin's import) and the
 * server (the live NHB list), no side effects.
 *
 * Sources, best first:
 *   kashroot  stores listed on KashRoot by their owners (bookable)
 *   admin     entries the KashRoot admin imported or added (cold_store_directory)
 *   nhb       National Horticulture Board — National Cold Storage database
 *   osm       OpenStreetMap — the community map
 * Names are shown as each source publishes them; nothing is made up.
 */

export type DirSource = 'kashroot' | 'admin' | 'nhb' | 'osm';

export interface DirEntry {
  name: string;
  district: string | null;
  place: string | null;
  state: string | null;
  capacity_mt: number | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  source: DirSource;
  /** Where the entry was published (admin entries: what the admin wrote). */
  sourceLabel: string;
  sourceUrl: string | null;
  /** A KashRoot listing id when the store can be booked here. */
  listingId?: string;
}

/** How a live source answered (api/cold-stores). */
export interface SourceState {
  id: 'nhb' | 'osm';
  label: string;
  url: string;
  ok: boolean;
  count: number;
  /** When the copy shown was read. */
  at: string | null;
  error?: string;
}

export const NHB_GIS_URL = 'https://www.nhb.gov.in/Handlers/GeoIndiaHandlerGis.ashx';
export const NHB_DATABASE_URL = 'https://www.nhb.gov.in/csrIndex.aspx';
export const SOURCE_LABEL: Record<DirSource, string> = {
  kashroot: 'On KashRoot',
  admin: 'KashRoot directory',
  nhb: 'National Horticulture Board',
  osm: 'OpenStreetMap',
};

/** Is this state Jammu & Kashmir (as the lists write it)? */
export const isJK = (state: string | null | undefined) => /jammu|kashmir|^\s*j\s*&\s*k\s*$/i.test(state ?? '');

/** "FRUIT MASTER AGRO FRESH PVT" → "Fruit Master Agro Fresh Pvt"; "CA", "MT" and similar stay as they are. */
export function niceName(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  const keep = new Set(['CA', 'MT', 'LLP', 'NHB', 'J&K', 'JK', 'II', 'III', 'IV', 'M/S']);
  return t
    .split(' ')
    .map((w) => (keep.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}

/** The same store from two sources: compare names without "Pvt Ltd", "M/s" or punctuation. */
export function storeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bm\s*\/\s*s\b\.?/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|llp|the|co|company|india)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/** Splits one CSV line, with "quoted, values" and "" inside quotes. */
function csvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

type Field = 'name' | 'district' | 'state' | 'place' | 'capacity' | 'phone' | 'lat' | 'lon';
/** Which column is which, from its heading (e.g. NHB: NameofProject, latitude, longitude, StateName, DistrictName). */
function fieldOf(heading: string): Field | null {
  const h = heading.toLowerCase().replace(/[^a-z]/g, '');
  if (/^(lat|latitude)$/.test(h)) return 'lat';
  if (/^(lon|lng|long|longitude)$/.test(h)) return 'lon';
  if (h.includes('district')) return 'district';
  if (h.includes('state')) return 'state';
  if (/capacity|mt$|tonnes?/.test(h)) return 'capacity';
  if (/phone|mobile|contact/.test(h)) return 'phone';
  if (/address|place|location|village|city|town|area/.test(h)) return 'place';
  if (/name|project|firm|coldstor|castore/.test(h)) return 'name';
  return null;
}

const num = (s: string | undefined) => {
  const n = Number(String(s ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : null;
};

export interface ParsedList {
  entries: Omit<DirEntry, 'source' | 'sourceLabel' | 'sourceUrl'>[];
  /** Rows in the list (before the Jammu & Kashmir filter). */
  rows: number;
  /** Why nothing could be read, if so. */
  problem?: string;
}

/** Rows (objects) from any list: column names are matched by meaning, not exact spelling. */
function fromRecords(records: Record<string, unknown>[], onlyJK: boolean): ParsedList {
  const entries: ParsedList['entries'] = [];
  for (const r of records) {
    const v: Partial<Record<Field, string>> = {};
    for (const [k, val] of Object.entries(r)) {
      const f = fieldOf(k);
      if (f && v[f] === undefined && val !== null && val !== undefined && String(val).trim() !== '') v[f] = String(val).trim();
    }
    if (!v.name || v.name.length < 2) continue;
    if (onlyJK && v.state !== undefined && !isJK(v.state)) continue;
    if (onlyJK && v.state === undefined && !isJK(`${v.place ?? ''} ${v.district ?? ''}`) && !isJKDistrict(v.district)) continue;
    const lat = num(v.lat);
    const lon = num(v.lon);
    const cap = num(v.capacity);
    entries.push({
      name: niceName(v.name).slice(0, 120),
      district: v.district ? niceName(v.district).slice(0, 60) : null,
      place: v.place ? v.place.replace(/\s+/g, ' ').slice(0, 160) : null,
      state: v.state ? niceName(v.state) : onlyJK ? 'Jammu & Kashmir' : null,
      capacity_mt: cap !== null && cap >= 1 && cap <= 1_000_000 ? Math.round(cap) : null,
      phone: v.phone ? v.phone.replace(/\s/g, '').slice(0, 20) : null,
      lat: lat !== null && Math.abs(lat) <= 90 && lat !== 0 ? lat : null,
      lon: lon !== null && Math.abs(lon) <= 180 && lon !== 0 ? lon : null,
    });
  }
  return { entries, rows: records.length };
}

/** The districts of Jammu & Kashmir, for lists that give a district but no state. */
const JK_DISTRICTS = ['anantnag', 'bandipora', 'baramulla', 'budgam', 'ganderbal', 'kulgam', 'kupwara', 'pulwama', 'shopian', 'srinagar', 'doda', 'jammu', 'kathua', 'kishtwar', 'poonch', 'rajouri', 'ramban', 'reasi', 'samba', 'udhampur'];
export const isJKDistrict = (d: string | null | undefined) => JK_DISTRICTS.includes((d ?? '').trim().toLowerCase());

/**
 * Reads a cold storage list: CSV (comma, semicolon or tab separated, with a
 * heading row) or JSON (an array of rows, or {records|data|features: […]}).
 * `onlyJK` keeps Jammu & Kashmir.
 */
export function parseColdStoreList(text: string, onlyJK = true): ParsedList {
  const body = text.replace(/^﻿/, '').trim();
  if (!body) return { entries: [], rows: 0, problem: 'The list is empty.' };
  if (/^[[{]/.test(body)) {
    try {
      const data = JSON.parse(body) as unknown;
      const list = Array.isArray(data)
        ? data
        : ((data as Record<string, unknown>).records ?? (data as Record<string, unknown>).data ?? (data as Record<string, unknown>).features ?? []) as unknown[];
      const records = (list as Record<string, unknown>[]).map((r) => (r && typeof r === 'object' && 'properties' in r ? { ...(r.properties as object) } : r)) as Record<string, unknown>[];
      return fromRecords(records.filter((r) => r && typeof r === 'object'), onlyJK);
    } catch {
      return { entries: [], rows: 0, problem: 'The list looks like JSON but could not be read.' };
    }
  }
  if (/^<(!doctype|html)/i.test(body)) return { entries: [], rows: 0, problem: 'This is a web page, not a list. Save the list itself (CSV) and try again.' };
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0];
  const sep = [',', '\t', ';', '|'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const headings = csvLine(first, sep);
  if (!headings.some((h) => fieldOf(h) === 'name')) return { entries: [], rows: lines.length, problem: 'No heading row with the cold store names (e.g. "Name") was found.' };
  const records = lines.slice(1).map((l) => {
    const cells = csvLine(l, sep);
    return Object.fromEntries(headings.map((h, i) => [h, cells[i] ?? '']));
  });
  return fromRecords(records, onlyJK);
}

/**
 * One list from several sources: the same store (same name, or the same
 * name in the same district) appears once, with the best source's details
 * and the others' as backup.
 */
export function mergeDirectory(lists: DirEntry[][]): (DirEntry & { also: DirSource[] })[] {
  const order: DirSource[] = ['kashroot', 'admin', 'nhb', 'osm'];
  const all = lists.flat().sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
  const byKey = new Map<string, DirEntry & { also: DirSource[] }>();
  for (const e of all) {
    const key = storeKey(e.name);
    if (!key) continue;
    const have = byKey.get(key);
    if (!have) {
      byKey.set(key, { ...e, also: [] });
      continue;
    }
    // Two stores listed on KashRoot are always two stores, whatever their names.
    if (have.listingId && e.listingId) {
      byKey.set(`${key}|${e.listingId}`, { ...e, also: [] });
      continue;
    }
    if (have.district && e.district && have.district.toLowerCase() !== e.district.toLowerCase()) {
      // Same name, another district: a different store.
      const k2 = `${key}|${e.district.toLowerCase()}`;
      if (!byKey.has(k2)) byKey.set(k2, { ...e, also: [] });
      continue;
    }
    if (!have.also.includes(e.source) && have.source !== e.source) have.also.push(e.source);
    have.district ??= e.district;
    have.place ??= e.place;
    have.capacity_mt ??= e.capacity_mt;
    have.phone ??= e.phone;
    if (have.lat === null && e.lat !== null) {
      have.lat = e.lat;
      have.lon = e.lon;
    }
  }
  return [...byKey.values()].sort((a, b) => (a.district ?? '~').localeCompare(b.district ?? '~') || a.name.localeCompare(b.name));
}
