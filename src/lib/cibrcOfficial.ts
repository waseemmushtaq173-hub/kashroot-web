/**
 * The official CIB&RC lists (Central Insecticides Board & Registration Committee, Directorate of Plant Protection,
 * Quarantine & Storage, ppqs.gov.in), read row for row from the five PDFs the Government publishes
 * (scripts/extract-cibrc-lists.py → src/data/cibrc-official.json). Nothing here is typed in by KashRoot:
 *
 *   pesticides    371 active ingredients registered under section 9(3) of the Insecticides Act, 1968
 *   formulations  1,160 registered formulations (insecticide, fungicide, herbicide, plant growth regulator, nematicide, bio…)
 *   banned        banned · banned for use but made for export · withdrawn · refused registration · restricted in use
 *   household     household, public health and rodent-control insecticides
 *   locust        pesticides approved for desert locust control, with doses
 *
 * The lists name chemicals and formulations, not brands or batches, so a typed word is matched against names:
 * a banned or restricted chemical is found from "Paraquat 24% SL" as well as "paraquat", but "Copper oxychloride" is
 * never taken for the banned "Copper acetoarsenite" (every distinctive word of a name must be in what was typed).
 * Pure functions over the data; the big JSON is fetched only when a check needs it.
 */
import meta from '@/data/cibrc-official-meta.json';

export interface NamedRow {
  n: number;
  name: string;
}
export interface FormulationRow extends NamedRow {
  category: string;
  part: string;
}
export interface StatusRow extends NamedRow {
  status: string;
  notification: string;
  note?: string;
}
export interface RestrictedRow extends NamedRow {
  status: string;
  details: string;
}
export interface HouseholdRow extends NamedRow {
  category: string;
}
export interface LocustRow extends NamedRow {
  group: string;
  ai_g_per_ha: string;
  formulation_per_ha: string;
}

export interface CibrcData {
  source: string;
  page: string;
  pesticides: { title: string; as_on: string; rows: NamedRow[]; numbers_not_printed: number[] };
  formulations: { title: string; as_on: string; rows: FormulationRow[]; numbers_not_printed: number[] };
  banned: {
    title: string;
    as_on: string;
    banned: StatusRow[];
    banned_for_export_only: StatusRow[];
    withdrawn: StatusRow[];
    refused: StatusRow[];
    restricted: RestrictedRow[];
  };
  household: { title: string; as_on: string; rows: HouseholdRow[] };
  locust: { title: string; rows: LocustRow[]; note: string };
}

export const CIBRC_META = meta;
export const CIBRC_SOURCE_NAME = 'Central Insecticides Board & Registration Committee (CIB&RC), ppqs.gov.in';

let loading: Promise<CibrcData> | null = null;
/** The five lists, fetched once, when a check or the list browser first needs them. */
export function loadCibrc(): Promise<CibrcData> {
  if (!loading) {
    loading = import('@/data/cibrc-official.json').then((m) => (m.default ?? m) as unknown as CibrcData).catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

export type BannedList = 'banned' | 'banned_for_export_only' | 'withdrawn' | 'refused';
export const BANNED_LABEL: Record<BannedList, string> = {
  banned: 'Banned',
  banned_for_export_only: 'Banned for use in India (may be made for export only)',
  withdrawn: 'Withdrawn',
  refused: 'Refused registration',
};

export interface CibrcAnswer {
  query: string;
  banned: { list: BannedList; row: StatusRow }[];
  restricted: RestrictedRow[];
  pesticides: NamedRow[];
  formulations: (FormulationRow & { exact: boolean })[];
  household: (HouseholdRow & { exact: boolean })[];
  locust: LocustRow[];
  /** Everything found, so a screen can say "nothing" honestly. */
  total: number;
  /** Close spellings of listed names, only when nothing was found. */
  didYouMean: string[];
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Words that describe the product or its form, not which chemical it is. */
const FORM_WORDS = new Set([
  'wp', 'wg', 'sc', 'ec', 'sl', 'sp', 'dp', 'gr', 'cg', 'ulv', 'ew', 'me', 'cs', 'zc', 'fs', 'ds', 'wdg', 'wsg', 'od', 'ow', 'fl', 'sg', 'ls', 'ao', 'cs', 'tc', 'ai',
  'oil', 'powder', 'granule', 'granules', 'liquid', 'suspension', 'concentrate', 'emulsifiable', 'wettable', 'soluble', 'dispersible', 'technical', 'solution',
  'dust', 'water', 'spray', 'household', 'house', 'hold', 'bait', 'cake', 'gel', 'paste', 'capsule', 'smoke', 'generator', 'tablet', 'tablets', 'min', 'pure',
  'and', 'the', 'for', 'with', 'plus',
]);

/** In a listed name these only say which salt or ester it is; the chemical is the rest ("Paraquat Dichloride", "Ethyl Parathion"). */
const SALT_WORDS = new Set(['ethyl', 'methyl', 'dimethyl', 'chloride', 'dichloride', 'sulphate', 'sulfate', 'acetate', 'hydroxide', 'oxide', 'salt', 'amine', 'ester', 'acid', 'technical']);

const words = (s: string) => fold(s).split(' ').filter(Boolean);

/** The names a list entry goes by: the whole name, and each part around brackets and slashes ("Lindane (Gamma-HCH)" → Lindane, Gamma-HCH). */
function altNames(name: string): string[] {
  const parts = name.split(/[()/]|\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
  return Array.from(new Set([name, ...parts]));
}

/** The words of the typed text that say which chemical it is (letters only, no strengths or formulation codes). */
export function identityWords(query: string): string[] {
  return Array.from(new Set(words(query).filter((w) => w.length >= 3 && /^[a-z]+$/.test(w) && !FORM_WORDS.has(w)))).slice(0, 6);
}

/**
 * Is this chemical (a listed name) what was typed? Either every distinctive word of the name (or of one of its
 * alternative names) was typed, or everything typed is part of the name (someone still typing "manco").
 */
function chemicalMatches(query: string, name: string): boolean {
  const q = words(query);
  if (!q.length) return false;
  const typed = new Set(q);
  for (const alt of altNames(name)) {
    const tokens = words(alt);
    if (!tokens.length) continue;
    const core = tokens.filter((t) => !SALT_WORDS.has(t));
    const need = core.length ? core : tokens;
    // A short name (an acronym such as DDT or MCPA) counts only as a whole typed word.
    if (need.every((t) => typed.has(t) && (t.length >= 3 || tokens.length === 1))) return true;
  }
  // Still typing: every typed word of four or more letters is inside the name; shorter ones (dap, ddt, 2 4 d) must be whole words.
  const nameWords = words(name);
  const flat = nameWords.join(' ');
  return q.every((w) => (w.length >= 4 ? flat.includes(w) : nameWords.includes(w)));
}

/** A formulation row matches when every chemical word typed is in it; `exact` when its strength and form were typed too. */
function formulationMatches(query: string, ids: string[], name: string): { hit: boolean; exact: boolean } {
  if (!ids.length) return { hit: false, exact: false };
  const flat = fold(name);
  const rowWords = new Set(flat.split(' '));
  // Four letters or more may be part of a longer word ("manco"); three must be a whole word ("dap" is not inside "Fluindapyr").
  if (!ids.every((w) => (w.length >= 4 ? flat.includes(w) : rowWords.has(w)))) return { hit: false, exact: false };
  const all = words(query);
  return { hit: true, exact: all.length > ids.length && all.every((w) => rowWords.has(w) || flat.includes(w)) };
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * What each official class of product is for, in a few plain words. The class names are the Government's (they head its
 * formulation list); the words after them only say what the class means, never anything about one product.
 */
export const CLASS_PURPOSE: Record<string, string> = {
  Insecticides: 'kills insect pests',
  Fungicides: 'controls fungal diseases',
  Herbicides: 'kills weeds',
  'Bio-insecticides': 'controls insect pests with biological agents',
  'Bio-fungicides': 'controls fungal diseases with biological agents',
  'Plant growth regulators': 'regulates how the plant grows',
  Nematicides: 'controls nematode worms in the soil',
  'Insecticide + fungicide': 'controls insects and fungal diseases',
  'Plant growth regulator + fungicide': 'regulates plant growth and controls fungal diseases',
  Household: 'household pest control',
  'Household (combination)': 'household pest control',
  'Public health': 'public-health use against disease-carrying insects',
  Rodenticides: 'rat and rodent control',
};

export interface ProfileUse {
  /** The Government's own class name ("Fungicides", "Public health"). */
  label: string;
  /** What that class is for. */
  purpose: string;
  /** How many registered formulations of the chemical are in this class. */
  formulations: number;
}
export interface Profile {
  uses: ProfileUse[];
  /** Registered formulations found, and the first few by name. */
  formulationCount: number;
  formulationNames: string[];
  /** On a banned, withdrawn, refused or restricted list. */
  flagged: boolean;
  /** Also approved for desert locust control. */
  locust: boolean;
}

/**
 * What the official lists, taken together, say a chemical is approved for: its class (from the formulation list's headings),
 * the forms it is registered in, whether it is flagged, and the other approvals (household, public health, desert locust).
 * Null when nothing registered matched. Pure: every word comes from the rows given.
 */
export function profileOf(a: CibrcAnswer): Profile | null {
  if (a.pesticides.length === 0 && a.formulations.length === 0 && a.household.length === 0) return null;
  const byClass = new Map<string, number>();
  for (const f of a.formulations) byClass.set(f.category, (byClass.get(f.category) ?? 0) + 1);
  for (const h of a.household) byClass.set(h.category, (byClass.get(h.category) ?? 0) + 1);
  const uses = [...byClass].map(([label, formulations]) => ({ label, purpose: CLASS_PURPOSE[label] ?? '', formulations })).sort((x, y) => y.formulations - x.formulations || x.label.localeCompare(y.label));
  return {
    uses,
    formulationCount: a.formulations.length,
    formulationNames: a.formulations.slice(0, 6).map((f) => f.name),
    flagged: a.banned.length > 0 || a.restricted.length > 0,
    locust: a.locust.length > 0,
  };
}

/** Looks the typed text up in the five official lists. */
export function lookupCibrc(data: CibrcData, query: string): CibrcAnswer {
  const q = query.trim().slice(0, 120);
  const empty: CibrcAnswer = { query: q, banned: [], restricted: [], pesticides: [], formulations: [], household: [], locust: [], total: 0, didYouMean: [] };
  if (fold(q).length < 3) return empty;
  const ids = identityWords(q);

  const b = data.banned;
  const banned = (['banned', 'banned_for_export_only', 'withdrawn', 'refused'] as BannedList[]).flatMap((list) =>
    b[list].filter((row) => chemicalMatches(q, row.name)).map((row) => ({ list, row })),
  );
  const restricted = b.restricted.filter((r) => chemicalMatches(q, r.name));
  const pesticides = data.pesticides.rows.filter((r) => chemicalMatches(q, r.name));

  const rank = <T extends { exact: boolean }>(rows: T[]) => [...rows].sort((x, y) => Number(y.exact) - Number(x.exact));
  const formulations = rank(
    data.formulations.rows.flatMap((r) => {
      const m = formulationMatches(q, ids, r.name);
      return m.hit ? [{ ...r, exact: m.exact }] : [];
    }),
  );
  const household = rank(
    data.household.rows.flatMap((r) => {
      const m = formulationMatches(q, ids, r.name);
      return m.hit ? [{ ...r, exact: m.exact }] : [];
    }),
  );
  const locust = data.locust.rows.filter((r) => ids.length > 0 && ids.every((w) => fold(r.name).includes(w)));

  const total = banned.length + restricted.length + pesticides.length + formulations.length + household.length + locust.length;
  let didYouMean: string[] = [];
  if (total === 0 && ids.length === 1 && ids[0].length >= 6) {
    const limit = ids[0].length >= 9 ? 2 : 1;
    const names = [...b.banned, ...b.banned_for_export_only, ...b.withdrawn, ...b.refused, ...b.restricted, ...data.pesticides.rows].map((r) => r.name);
    const near = names.filter((name) => words(name).some((w) => w.length >= 5 && levenshtein(w, ids[0]) <= limit));
    didYouMean = Array.from(new Set(near)).slice(0, 4);
  }
  return { query: q, banned, restricted, pesticides, formulations, household, locust, total, didYouMean };
}
