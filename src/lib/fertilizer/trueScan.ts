/**
 * KashRoot TrueScan — what a person typed from the label, and what can be
 * checked about it. No side effects.
 *
 *   registration  a CIB&RC registration number ("CIR-12345/2019-…", or just
 *                 "12345/2019"): checked against the official list.
 *   name          a product name or fertiliser grade ("Mancozeb 75% WP",
 *                 "DAP 18-46-0"): checked against the official list, and a
 *                 fertiliser type against the Fertiliser (Control) Order specs.
 *   batch         anything else with numbers ("21-F02-267"): the Government
 *                 publishes no list of batch numbers, so only a KashRoot
 *                 dealer record can be shown, and the person is told so.
 */
import { FCO_PRODUCTS, type FcoProduct } from '@/lib/fertilizer/fco';
import { matchFco } from '@/lib/fertilizer/labelRules';

export type TypedKind = 'registration' | 'name' | 'batch';

export interface Typed {
  /** What was typed, tidied ("Batch no." and the like left out). */
  text: string;
  kind: TypedKind;
}

/** "Reg. No.: CIR-…", "Regn No", "Registration number" in front of a number (not "Regent"). */
const REG_LABEL = /^\s*reg(?:n|d|istration)?\b\.?\s*(?:(?:no|number|num)\b\.?)?\s*[:#.\-]?\s*/i;
/** "Batch No.", "B. No.", "Lot" in front of a batch number (not the B of "B12345"). */
const BATCH_LABEL = /^\s*(?:batch|lot|b\.)\s*(?:(?:no|number|num)\b\.?)?\s*[:#.\-]?\s*(?=\S*\d)/i;
/** "CIR" or a "number/year" (12345/2019) — the shape of a CIB&RC registration. */
const CIR = /\bc\s*\.?\s*i\s*\.?\s*r\b|(?:^|[^\d/])\d[\d,]*\s*\/\s*(?:19|20)\d{2}\b/i;
/** "18-46-0", "12:32:16", "20.5-0-0-23": a fertiliser grade on its own. */
const GRADE_ONLY = /^\d+(?:\.\d+)?(?:\s*[:\-–]\s*\d+(?:\.\d+)?){2,3}$/;

export function readTyped(raw: string): Typed {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (BATCH_LABEL.test(text) && !CIR.test(text)) return { text: text.replace(BATCH_LABEL, '').trim(), kind: 'batch' };
  if (CIR.test(text)) return { text, kind: 'registration' };
  const bare = text.replace(REG_LABEL, '');
  if (bare !== text && /\d/.test(bare)) return { text, kind: 'registration' };
  if (GRADE_ONLY.test(text)) return { text, kind: 'name' };
  // Words (three letters in a row) with a space, or no number at all: a name.
  // One run of letters and numbers ("MZ-24-1187", "EKC0526"): a batch number.
  const words = /[a-z]{3,}/i.test(text) && (/\s/.test(text) || !/\d/.test(text));
  return { text, kind: words || !/\d/.test(text) ? 'name' : 'batch' };
}

/**
 * The fertiliser type a name or grade names, when it is one of the FCO
 * Schedule I specs KashRoot holds: by name ("DAP", "Urea", "NPK 12:32:16")
 * or by its grade alone ("18-46-0" is DAP).
 */
export function fcoTypeOf(text: string): FcoProduct | undefined {
  const byName = matchFco(text, '');
  if (byName) return byName;
  const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length < 2) return undefined;
  return FCO_PRODUCTS.find((p) => {
    const g = (p.grade.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    return /:/.test(p.grade) && g.length === nums.length && g.every((n, i) => n === nums[i]);
  });
}
