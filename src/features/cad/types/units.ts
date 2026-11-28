/**
 * Lengths in Kashroot Design Studio.
 *
 * Every length in a document, a command and the geometry kernel is a plain
 * number of millimetres. Metres appear only where a person reads a result
 * (room volume in m³, for example) and are converted at that edge.
 *
 * These helpers turn what someone types into a checked millimetre value, and
 * a millimetre value back into text. They never guess: "12,5" is refused with
 * a message instead of silently becoming 125.
 */

/** A length in millimetres. A plain number, named so signatures say what they hold. */
export type Millimetres = number;

/** What a length field accepts unless it sets its own limits: 0.01 mm up to 1 km. */
export const DEFAULT_LENGTH_LIMITS = { minMm: 0.01, maxMm: 1_000_000 } as const;

/** Lengths are kept to the micrometre: plenty for buildings and machinery, and free of float noise such as 12000.000000001. */
export const LENGTH_DECIMALS = 3;

const UNIT_TO_MM = { mm: 1, cm: 10, m: 1000 } as const;
export type LengthUnit = keyof typeof UNIT_TO_MM;

export type LengthResult = { ok: true; mm: Millimetres } | { ok: false; error: string };

export interface LengthRules {
  minMm?: number;
  maxMm?: number;
  /** Zero is refused by default: a wall, a door or a chamber cannot be 0 mm. */
  allowZero?: boolean;
}

/** Round to the micrometre and turn -0 into 0, so nothing ever shows "-0 mm". */
export function roundMm(mm: number): number {
  const factor = 10 ** LENGTH_DECIMALS;
  const r = Math.round(mm * factor) / factor;
  return r === 0 ? 0 : r;
}

/** Spaces people use between digit groups: normal, no-break, thin and narrow no-break. */
const GROUP_SPACES = /[\s   ]/g;
const UNIT_SUFFIX = /(mm|cm|m)$/;
const NUMBER_SHAPE = /^\d[\d,]*(\.\d+)?$|^\.\d+$/;

/**
 * Commas are accepted only as digit grouping, in the Western (12,000) or
 * Indian (1,20,000) style. Anything else ("12,5", "1,2345") is ambiguous.
 */
function commasAreGrouping(integerPart: string): boolean {
  if (!integerPart.includes(',')) return true;
  const groups = integerPart.split(',');
  const last = groups[groups.length - 1];
  if (groups[0].length === 0 || last.length !== 3) return false;
  return groups.slice(1, -1).every((g) => g.length === 2 || g.length === 3);
}

/**
 * Read a length someone typed. Accepts "12000", "12 000", "12,000",
 * "1,20,000", "12.5", and a unit: "12 m", "250 cm", "40 mm" (millimetres when
 * no unit is given).
 */
export function parseLength(input: string, rules: LengthRules = {}): LengthResult {
  const minMm = rules.minMm ?? DEFAULT_LENGTH_LIMITS.minMm;
  const maxMm = rules.maxMm ?? DEFAULT_LENGTH_LIMITS.maxMm;
  const text = input.trim().toLowerCase().replace(GROUP_SPACES, '');

  if (text.length === 0) return { ok: false, error: 'Enter a length, for example 12000 mm.' };
  if (/^[-−]/.test(text)) return { ok: false, error: 'A length cannot be negative.' };

  const unitMatch = UNIT_SUFFIX.exec(text);
  const unit: LengthUnit = unitMatch ? (unitMatch[1] as LengthUnit) : 'mm';
  const numberText = unitMatch ? text.slice(0, -unitMatch[1].length) : text;

  if (!NUMBER_SHAPE.test(numberText)) {
    return { ok: false, error: 'Enter a number, for example 12000 or 12 m.' };
  }
  const [integerPart] = numberText.split('.');
  if (!commasAreGrouping(integerPart)) {
    return { ok: false, error: 'Use a dot for decimals, for example 12.5. Commas only group thousands.' };
  }

  const value = Number(numberText.replace(/,/g, ''));
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a number, for example 12000 or 12 m.' };

  const mm = roundMm(value * UNIT_TO_MM[unit]);
  if (mm === 0) {
    return rules.allowZero ? { ok: true, mm: 0 } : { ok: false, error: 'A length must be more than 0 mm.' };
  }
  if (mm < minMm) return { ok: false, error: `A length must be at least ${formatMm(minMm)}.` };
  if (mm > maxMm) return { ok: false, error: `A length must be at most ${formatMm(maxMm)}.` };
  return { ok: true, mm };
}

/** A number with Indian digit grouping (1,20,000) and at most three decimals. */
export function formatNumber(value: number, maxDecimals: number = LENGTH_DECIMALS): string {
  return roundMm(value).toLocaleString('en-IN', { maximumFractionDigits: maxDecimals, minimumFractionDigits: 0 });
}

/** "12,000 mm" */
export function formatMm(mm: Millimetres, maxDecimals: number = LENGTH_DECIMALS): string {
  return `${formatNumber(mm, maxDecimals)} mm`;
}

export function mmToM(mm: Millimetres): number {
  return mm / UNIT_TO_MM.m;
}
