/**
 * Kashmiri text tools shared by the server and the browser (no secrets).
 *
 *   skeleton()     a word with its vowel marks and Kashmiri vowel letters folded
 *                  away (کٲشُر → کاشر), so a spelling without marks can be matched
 *                  to the same word written properly.
 *   restoreMarks() puts the vowel marks back on words a native speaker has
 *                  written in the Kashmiri Lab — only on words written with no
 *                  marks at all, and only where the plain spelling belongs to
 *                  exactly one known word, so a different word is never changed.
 *   urduSigns()    Urdu-only words (ہے، نہیں، آپ …) in a text meant to be Kashmiri.
 */

/** Harakat, Kashmiri vowel signs (ٕ ٚ ٛ ٟ …), superscript alef and Quranic marks. */
const MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Kashmiri vowel letters and Arabic variants → the plain letter people type without marks. */
const FOLD: Record<string, string> = {
  'ٲ': 'ا', 'ٳ': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ۄ': 'و', 'ۆ': 'و', 'ؤ': 'و', 'ۏ': 'و',
  'ێ': 'ی', 'ؠ': 'ی', 'ي': 'ی', 'ى': 'ی', 'ې': 'ی', 'ئ': 'ی',
  'ك': 'ک', 'ە': 'ہ', 'ة': 'ہ', 'ۂ': 'ہ', 'ۓ': 'ے',
  '\u200c': '', '\u200d': '',
};
const FOLD_RE = new RegExp(`[${Object.keys(FOLD).join('')}]`, 'g');

/** Letters and marks of the Arabic script (Kashmiri, Urdu) — one word. */
const WORD = /[\u0620-\u065F\u066E-\u06D3\u06D5-\u06EF\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\u200C\u200D]+/g;
const LETTERS_ONLY = /[\u0620-\u064A\u066E-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export const stripMarks = (s: string) => s.normalize('NFC').replace(MARKS, '');

export const skeleton = (s: string) => stripMarks(s).replace(FOLD_RE, (c) => FOLD[c] ?? c).replace(/[؟،۔؛]/g, '').trim();

/** True when a word has no vowel marks and no Kashmiri vowel letters — written "plain". */
const isPlain = (w: string) => skeleton(w) === w.normalize('NFC').replace(/[يك]/g, (c) => FOLD[c] ?? c);

export interface MarkMap {
  /** plain spelling → the one known word with marks */
  get(plain: string): string | undefined;
  size: number;
}

/** Plain spelling → marked word, for single words whose plain spelling is shared by no other known word. */
export function markMap(words: string[]): MarkMap {
  const seen = new Map<string, string | null>();
  for (const raw of words) {
    const w = raw.normalize('NFC').trim();
    if (!w || /\s/.test(w) || !LETTERS_ONLY.test(w)) continue;
    const k = skeleton(w);
    if (!k || k === w) continue; // nothing to restore
    const prev = seen.get(k);
    if (prev === undefined) seen.set(k, w);
    else if (prev !== w) seen.set(k, null); // two words share this spelling: never guess
  }
  const map = new Map([...seen].filter((e): e is [string, string] => e[1] !== null));
  return { get: (plain) => map.get(plain), size: map.size };
}

/** Puts back the vowel marks on known words written plain. Returns the text and how many words changed. */
export function restoreMarks(text: string, map: MarkMap): { text: string; changed: number } {
  if (!map.size) return { text, changed: 0 };
  let changed = 0;
  const out = text.normalize('NFC').replace(WORD, (w) => {
    if (!isPlain(w)) return w;
    const marked = map.get(skeleton(w));
    if (!marked || marked === w) return w;
    changed++;
    return marked;
  });
  return { text: out, changed };
}

/**
 * Words only Urdu uses — Kashmiri says چھُ for ہے, نہٕ for نہیں, تُہۍ for آپ,
 * تہٕ for اور. Whole words only.
 */
const URDU_ONLY = new Set(['ہے', 'ہیں', 'ہوں', 'ہوگا', 'ہوگی', 'نہیں', 'آپ', 'اور', 'چاہیے', 'چاہئے', 'تھا', 'تھی', 'تھے', 'گا', 'گی', 'گے', 'کریں', 'کیجیے', 'کیجئے', 'سکتے', 'سکتی', 'سکتا', 'رہا', 'رہی', 'رہے', 'میں', 'ہمیں', 'آپکو', 'لیکن', 'کیونکہ', 'بہت']);

/** Signs of real Kashmiri: its vowel letters and marks, or the helping verb چھ… */
const KASHMIRI_SIGN = /[\u0672\u0673\u06C4\u06C6\u06CE\u0620\u0655\u065A\u065B\u065F]|(^|[^\u0600-\u06FF])\u0686\u06BE/;

export interface UrduCheck {
  /** Urdu-only words found, in order. */
  found: string[];
  /** The text reads as Urdu, not Kashmiri — rewrite it. */
  leaks: boolean;
}

export function urduSigns(text: string): UrduCheck {
  const words = text.normalize('NFC').match(WORD) ?? [];
  const found = words.map((w) => stripMarks(w)).filter((w) => URDU_ONLY.has(w));
  const kashmiri = KASHMIRI_SIGN.test(text);
  // Two Urdu-only words, or one with no sign of Kashmiri at all.
  const leaks = found.length >= 2 || (found.length === 1 && !kashmiri) || (words.length >= 6 && !kashmiri);
  return { found, leaks };
}

/** Words of a question, for matching it to similar ones (English lower-cased, Kashmiri/Urdu folded). */
export function keyWords(text: string): Set<string> {
  const latin = (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).map((w) => w.replace(/(es|s)$/, ''));
  const arabic = (text.match(WORD) ?? []).map(skeleton).filter((w) => w.length >= 2);
  return new Set([...latin, ...arabic]);
}

/** How alike two questions are, 0–1. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}
