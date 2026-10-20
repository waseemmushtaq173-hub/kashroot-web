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
  /** Why it could not be read now, in plain words. */
  error?: string;
  /** Whose side the problem is on, when that is clear: the website's, or the KashRoot server's (it could not get out). */
  fault?: 'site' | 'server';
  /** Read, but worth saying (e.g. rows in the list, none in Jammu & Kashmir). */
  note?: string;
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
    // The first letter, even after a quote or bracket ("FRESH" → "Fresh").
    .map((w) => (keep.has(w) ? w : w.toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase())))
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

/**
 * Splits CSV text into rows of cells: "quoted, values", "" inside quotes, and
 * line breaks inside quoted cells (addresses often have them) all handled.
 */
function csvRows(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/** How many times `sep` splits a line outside "quotes". */
function sepCount(line: string, sep: string): number {
  let n = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) n++;
  }
  return n;
}

type Field = 'name' | 'district' | 'state' | 'place' | 'capacity' | 'phone' | 'lat' | 'lon';
/** Which column is which, from its heading (e.g. NHB: NameofProject, latitude, longitude, StateName, DistrictName). */
function fieldOf(heading: string): Field | null {
  const h = heading.toLowerCase().replace(/[^a-z]/g, '');
  // Government lists often spell these "Lattitude" / "Longtitude".
  if (/^(lat|latt?itt?ude|ycoord)$/.test(h)) return 'lat';
  if (/^(lon|lng|long|longt?itt?ude|longitute|xcoord)$/.test(h)) return 'lon';
  if (h.includes('district')) return 'district';
  if (h.includes('state')) return 'state';
  if (/capacity|mt$|tonnes?/.test(h)) return 'capacity';
  if (/phone|mobile|contactno|contactnumber|telephone|^contact$/.test(h)) return 'phone';
  // "Name (and address) of the cold storage", also "… / Owner", is the name;
  // "Name of the owner of the cold storage" is not.
  const other = h.search(/owner|proprietor|promoter|person|applicant|contact|type|category|kind|status|scheme/);
  const store = h.search(/project|firm|unit|coldstor|castore|storage/);
  if (h.includes('name') && store >= 0 && (other < 0 || store < other)) return 'name';
  // Not the store's name: the owner's or contact person's, or the kind of store.
  if (other >= 0) return null;
  if (/address|place|location|village|city|town|area|tehsil|block/.test(h)) return 'place';
  if (/name|project|firm|unit|coldstor|castore|storage/.test(h)) return 'name';
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
      if (val !== null && typeof val === 'object') continue;
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

/** The rows inside a JSON answer: an array, or the first array of rows inside it ({d: …}, {records: …}, {data: {rows: …}}…). */
function jsonRows(data: unknown, depth = 0): Record<string, unknown>[] | null {
  // ASP.NET handlers sometimes send the list as JSON written inside a string.
  if (typeof data === 'string' && /^\s*[[{]/.test(data) && depth < 3) {
    try {
      return jsonRows(JSON.parse(data), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(data)) {
    const rows = data.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object' && !Array.isArray(r));
    return rows.map((r) => {
      // GeoJSON: the fields are in properties, the location in geometry ([lon, lat]).
      if (r.properties && typeof r.properties === 'object') {
        const at = (r.geometry as { type?: string; coordinates?: unknown } | undefined)?.coordinates;
        const point = Array.isArray(at) && typeof at[0] === 'number' && typeof at[1] === 'number' ? { longitude: at[0], latitude: at[1] } : {};
        return { ...point, ...(r.properties as Record<string, unknown>) };
      }
      return r;
    });
  }
  if (data && typeof data === 'object' && depth < 3) {
    const o = data as Record<string, unknown>;
    for (const key of ['records', 'data', 'features', 'd', 'Table', 'rows', 'result', 'results', 'items', 'list']) {
      if (key in o) {
        const rows = jsonRows(o[key], depth + 1);
        if (rows) return rows;
      }
    }
    for (const value of Object.values(o)) {
      if (Array.isArray(value) && value.some((r) => r && typeof r === 'object')) return jsonRows(value, depth + 1);
    }
  }
  return null;
}

const xmlText = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

/**
 * Rows from an XML list: repeated elements whose children are plain values
 * (<Table><NameofProject>…</NameofProject>…</Table>, as ASP.NET writes a
 * DataSet), or repeated elements with the values as attributes.
 */
function xmlRows(xml: string): Record<string, unknown>[] {
  const nested: Record<string, unknown>[] = [];
  const record = /<([\w:.-]+)(?:\s[^>]*)?>((?:\s*<([\w:.-]+)(?:\s[^>]*)?>[^<]*<\/\3>|\s*<[\w:.-]+(?:\s[^>]*)?\/>)+)\s*<\/\1>/g;
  for (const m of xml.matchAll(record)) {
    const row: Record<string, unknown> = {};
    for (const c of m[2].matchAll(/<([\w:.-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) row[c[1]] = xmlText(c[2]);
    nested.push(row);
  }
  const flat: Record<string, unknown>[] = [];
  for (const m of xml.matchAll(/<[\w:.-]+((?:\s+[\w:.-]+\s*=\s*"[^"]*"){2,})\s*\/?>/g)) {
    flat.push(Object.fromEntries([...m[1].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((a) => [a[1], xmlText(a[2])])));
  }
  return nested.length >= flat.length ? nested : flat;
}

/** The JSON written inside a JSON string ("[{…}]"), or null when the body is not that. */
function jsonString(body: string): string | null {
  try {
    const v = JSON.parse(body) as unknown;
    return typeof v === 'string' && /^\s*[[{]/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Reads a cold storage list: CSV (comma, semicolon, tab or | separated, with
 * a heading row), JSON (an array of rows, or rows inside {records|data|d|
 * features…}, GeoJSON included) or XML rows. `onlyJK` keeps Jammu & Kashmir.
 */
export function parseColdStoreList(text: string, onlyJK = true): ParsedList {
  const body = text.replace(/^\uFEFF/, '').trim();
  if (!body) return { entries: [], rows: 0, problem: 'The list is empty.' };
  if (/^<(!doctype\s+html|html)\b/i.test(body) || /^<\?xml[^>]*\?>\s*<html\b/i.test(body)) return { entries: [], rows: 0, problem: 'This is a web page, not a list. Save the list itself (CSV) and try again.' };
  let records: Record<string, unknown>[];
  // A list written as JSON inside a string ("[{…}]") is JSON too; a CSV whose
  // headings are in quotes ("Name","District",…) is not.
  const quotedJson = body.startsWith('"') ? jsonString(body) : null;
  if (/^[[{]/.test(body) || quotedJson !== null) {
    let data: unknown = quotedJson;
    if (quotedJson === null) {
      try {
        data = JSON.parse(body) as unknown;
      } catch {
        return { entries: [], rows: 0, problem: 'The list looks like JSON but could not be read. Save it again as CSV or JSON and try again.' };
      }
    }
    const rows = jsonRows(data);
    if (!rows) return { entries: [], rows: 0, problem: 'The JSON has no list of cold stores in it.' };
    records = rows;
  } else if (body.startsWith('<')) {
    records = xmlRows(body);
    if (!records.length) return { entries: [], rows: 0, problem: 'The XML has no list of cold stores in it.' };
  } else {
    const first = body.split(/\r?\n/, 1)[0];
    const sep = [',', '\t', ';', '|'].sort((a, b) => sepCount(first, b) - sepCount(first, a))[0];
    const [headings, ...lines] = csvRows(body, sep);
    if (!headings.some((h) => fieldOf(h) === 'name')) return { entries: [], rows: lines.length + 1, problem: 'No heading row with the cold store names was found. The first line must name the columns, e.g. "Name,District".' };
    records = lines.map((cells) => Object.fromEntries(headings.map((h, i) => [h, cells[i] ?? ''])));
  }
  if (!records.length) return { entries: [], rows: 0, problem: 'The list is empty: it has no cold stores in it.' };
  if (!records.some((r) => Object.keys(r).some((k) => fieldOf(k) === 'name'))) return { entries: [], rows: records.length, problem: 'No column with the cold store names (e.g. "Name") was found.' };
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
