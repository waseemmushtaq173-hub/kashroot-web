/**
 * Checks a label reading against what Indian law requires on the pack —
 * independent of whether the product or dealer is listed on KashRoot.
 *
 *   • Fertiliser bag — Fertiliser (Control) Order, 1985: manufacturer, the
 *     fertiliser and its grade, net weight, batch number, date of manufacture
 *     and MRP. Common fertilisers are also matched to their FCO Schedule I
 *     standard (fco.ts) so the farmer sees the official nutrient minimums.
 *   • Pesticide — Insecticides Act, 1968 and Rules, 1971: CIB&RC registration
 *     number, manufacturer, batch number, manufacturing and expiry dates, the
 *     antidote statement and the coloured warning triangle.
 *
 * These are paperwork checks on what is printed. A label can be copied; only a
 * Government quality-control lab test proves what is inside.
 */
import { FCO_PRODUCTS, type FcoProduct } from '@/lib/fertilizer/fco';

export interface LabelFacts {
  readable: boolean;
  product_type: 'fertilizer' | 'pesticide' | 'seed' | 'other' | 'unknown';
  product_name: string;
  manufacturer: string;
  batch_code: string;
  registration_no: string;
  grade_or_composition: string;
  mfg_date: string;
  expiry_date: string;
  mrp: string;
  net_quantity?: string;
  mfg_date_iso?: string;
  expiry_date_iso?: string;
  toxicity_mark?: 'red' | 'yellow' | 'blue' | 'green' | 'none' | 'unreadable';
  antidote_printed?: boolean;
}

export type RuleStatus = 'ok' | 'missing' | 'problem' | 'caution';

export interface RuleCheck {
  label: string;
  status: RuleStatus;
  detail?: string;
}

export interface RuleReport {
  law: string;
  checks: RuleCheck[];
  verdict: 'good' | 'incomplete' | 'warning' | 'unknown';
  /** The official FCO standard for this fertiliser, when it is one KashRoot holds. */
  fco?: FcoProduct;
}

const filled = (v?: string) => Boolean(v && v.trim() && !/^(n\/?a|none|not visible|unreadable|-+)$/i.test(v.trim()));
/** Drop chemical formulas (P2O5, K2O, H2O) so their digits are not read as nutrient figures. */
const stripFormulas = (v: string) => v.replace(/[\u2080-\u2089]/g, '').replace(/\b[a-z]{1,2}\d[a-z0-9]*\b/gi, ' ');
const numbers = (v: string) => (v.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const isoDay = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

const TOXICITY: Record<string, string> = {
  red: 'red — extremely toxic',
  yellow: 'yellow — highly toxic',
  blue: 'blue — moderately toxic',
  green: 'green — slightly toxic',
};

/** "DAP 18:46:0", "Urea (46% N)", "NPK 12-32-16" → the FCO product it names, if KashRoot holds it. */
export function matchFco(name: string, grade: string): FcoProduct | undefined {
  const text = stripFormulas(`${name} ${grade}`).toLowerCase();
  const nums = numbers(text);
  const gradeOf = (p: FcoProduct) => (p.grade.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const sameGrade = (p: FcoProduct) => {
    const g = gradeOf(p);
    return g.length >= 2 && g.every((n, i) => nums[i] === n);
  };
  const byName: [RegExp, string][] = [
    [/\burea\b/, 'urea'],
    [/\bdap\b|di-?ammonium phosphate/, 'dap'],
    [/\bmop\b|muriate of potash|potassium chloride/, 'mop'],
    [/\bssp\b|single super ?phosphate/, 'ssp'],
    [/ammonium sulph?f?ate/, 'as'],
    [/calcium nitrate/, 'cn'],
    [/zinc sulph?f?ate.*mono|mono.*zinc sulph?f?ate|33\s*%\s*zn/, 'znm'],
    [/zinc sulph?f?ate/, 'znh'],
    [/\bborax\b/, 'borax'],
    [/ammonium phosphate sulph?f?ate/, 'aps'],
  ];
  // NPK complexes are named by their grade.
  const npk = FCO_PRODUCTS.filter((p) => p.id.startsWith('npk')).find(sameGrade);
  if (npk) return npk;
  for (const [re, id] of byName) if (re.test(text)) return FCO_PRODUCTS.find((p) => p.id === id);
  return undefined;
}

export function checkLabel(r: LabelFacts, today = new Date()): RuleReport {
  const todayIso = today.toISOString().slice(0, 10);
  const checks: RuleCheck[] = [];
  const need = (label: string, value: string | undefined, detail?: string) => checks.push(filled(value) ? { label, status: 'ok', detail: value?.trim() } : { label, status: 'missing', detail });

  const expiry = isoDay(r.expiry_date_iso);
  const mfg = isoDay(r.mfg_date_iso);
  const dates = () => {
    if (mfg && mfg > todayIso) checks.push({ label: 'Manufacturing date', status: 'problem', detail: `${r.mfg_date || mfg} is in the future` });
    else need('Manufacturing date', r.mfg_date);
  };

  if (r.product_type === 'pesticide') {
    const reg = r.registration_no?.trim();
    if (!filled(reg)) checks.push({ label: 'CIB&RC registration number', status: 'missing', detail: 'Every pesticide sold in India must print it' });
    else if (!/cir/i.test(reg!)) checks.push({ label: 'CIB&RC registration number', status: 'caution', detail: `"${reg}" — CIB&RC numbers usually start with CIR-; ask the dealer` });
    else checks.push({ label: 'CIB&RC registration number', status: 'ok', detail: reg });
    need('Manufacturer', r.manufacturer);
    need('Batch number', r.batch_code);
    dates();
    if (!filled(r.expiry_date)) checks.push({ label: 'Expiry date', status: 'missing', detail: 'Pesticides must print an expiry date' });
    else if (expiry && expiry < todayIso) checks.push({ label: 'Expiry date', status: 'problem', detail: `Expired on ${r.expiry_date} — do not use or buy` });
    else checks.push({ label: 'Expiry date', status: 'ok', detail: r.expiry_date });
    checks.push(r.antidote_printed ? { label: 'Antidote / first aid', status: 'ok' } : { label: 'Antidote / first aid', status: 'missing', detail: 'The law requires the antidote on the label' });
    const mark = r.toxicity_mark;
    checks.push(mark && TOXICITY[mark] ? { label: 'Warning triangle', status: 'ok', detail: TOXICITY[mark] } : { label: 'Warning triangle', status: mark === 'unreadable' ? 'caution' : 'missing', detail: mark === 'unreadable' ? 'Not clear in the photo' : 'Every pesticide must show the coloured warning triangle' });
    need('Net quantity', r.net_quantity);
    need('MRP', r.mrp);
  } else if (r.product_type === 'fertilizer') {
    need('Manufacturer', r.manufacturer);
    need('Fertiliser name and grade', [r.product_name, r.grade_or_composition].filter(filled).join(' — '));
    need('Net weight', r.net_quantity);
    need('Batch number', r.batch_code);
    dates();
    need('MRP', r.mrp);
    if (expiry && expiry < todayIso) checks.push({ label: 'Expiry / best before', status: 'problem', detail: `Past ${r.expiry_date}` });
  } else {
    need('Manufacturer', r.manufacturer);
    need('Batch number', r.batch_code);
    dates();
    if (expiry && expiry < todayIso) checks.push({ label: 'Expiry date', status: 'problem', detail: `Expired on ${r.expiry_date}` });
    need('MRP', r.mrp);
  }

  const fco = r.product_type === 'fertilizer' ? matchFco(r.product_name, r.grade_or_composition) : undefined;
  if (fco) {
    // A printed grade lower than the official one is a red flag. Compared only
    // when it is unambiguous: an N:P:K grade ("18:46:0") for a grade product,
    // or the one nutrient figure of a single-nutrient fertiliser ("Urea 44% N").
    const official = numbers(fco.grade);
    const printedGrade = /(\d+(?:\.\d+)?)\s*[:\-–]\s*(\d+(?:\.\d+)?)\s*[:\-–]\s*(\d+(?:\.\d+)?)/.exec(stripFormulas(r.grade_or_composition));
    const percents = [...stripFormulas(r.grade_or_composition).matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
    const minimums = fco.parameters.filter((p) => p.min !== undefined);
    let lower = false;
    if (printedGrade && /:/.test(fco.grade)) lower = official.some((n, i) => Number(printedGrade[i + 1]) < n);
    else if (minimums.length === 1 && percents.length === 1) lower = percents[0] < minimums[0].min!;
    checks.push(lower ? { label: 'Grade vs Government standard', status: 'problem', detail: `Label shows ${r.grade_or_composition}; the FCO standard for ${fco.name} is ${fco.grade}` } : { label: 'Grade vs Government standard', status: 'ok', detail: `${fco.name} ${fco.grade} (FCO Schedule I)` });
  }

  const law = r.product_type === 'pesticide' ? 'Insecticides Act, 1968 and Insecticides Rules, 1971' : r.product_type === 'fertilizer' ? 'Fertiliser (Control) Order, 1985' : 'Indian labelling rules';
  const verdict: RuleReport['verdict'] = !r.readable ? 'unknown' : checks.some((c) => c.status === 'problem') ? 'warning' : checks.some((c) => c.status === 'missing' || c.status === 'caution') ? 'incomplete' : 'good';
  return { law, checks, verdict, fco };
}
