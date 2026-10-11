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
