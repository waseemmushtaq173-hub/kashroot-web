/**
 * Keyword matching that works across English, Hindi, Urdu and Kashmiri:
 * lower-case, and drop the vowel marks that vary in Urdu/Kashmiri and Hindi
 * spelling. Safe on the server and in the browser.
 */
export function norm(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭ]/g, '')
    .replace(/[ۄۆۇ]/g, 'و')
    .replace(/[ۍێيى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ँं़]/g, '');
}

/** Does the (already normalised, space-padded) text contain any of the keywords? */
export const has = (normalised: string, keys: string[]) => keys.some((k) => normalised.includes(norm(k)));

const LATIN = /^[a-z0-9 ]+$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordCache = new Map<string, RegExp>();

/**
 * Like `has`, but English/romanised keywords must be whole words ("rice" is
 * not found in "price", "rain" not in "train", "order" not in "border"); a
 * plural s/es is allowed. Hindi, Urdu and Kashmiri keywords still match
 * inside words, since their endings change with grammar.
 */
export const hasWord = (normalised: string, keys: string[]) =>
  keys.some((k) => {
    const key = norm(k).trim();
    if (!key) return false;
    if (!LATIN.test(key)) return normalised.includes(key);
    let re = wordCache.get(key);
    if (!re) {
      re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(key)}(?:e?s)?(?=$|[^\\p{L}\\p{N}])`, 'u');
      wordCache.set(key, re);
    }
    return re.test(normalised);
  });
