/**
 * Kashmiri text check shared by the server and the browser (no secrets):
 * urduSigns() finds Urdu-only words (ہے، نہیں، آپ …) in a text meant to be
 * Kashmiri, so the assistant can rewrite an answer that came out as Urdu.
 */

/** Harakat, Kashmiri vowel signs (ٕ ٚ ٛ ٟ …), superscript alef and Quranic marks. */
const MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Letters and marks of the Arabic script (Kashmiri, Urdu) — one word. */
const WORD = /[\u0620-\u065F\u066E-\u06D3\u06D5-\u06EF\u06FA-\u06FF\u0750-\u077F\u08A0-\u08FF\u200C\u200D]+/g;

export const stripMarks = (s: string) => s.normalize('NFC').replace(MARKS, '');

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
