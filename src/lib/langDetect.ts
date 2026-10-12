/**
 * Which language to answer in, from how the person actually asked — so a
 * farmer who types or speaks Urdu, Hindi or Kashmiri is answered (and
 * spoken to) in that language even if the language buttons say English.
 * Safe on the server and in the browser.
 */
export type ReplyLang = 'en' | 'hi' | 'ur' | 'ks';

const ROMAN_HINDUSTANI = new Set([
  'kya', 'kyaa', 'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'mai', 'main', 'kaise', 'kaisa', 'kab', 'kitna', 'kitne',
  'aaj', 'kal', 'nahi', 'nahin', 'mera', 'meri', 'mere', 'hum', 'ham', 'bhav', 'bhaav', 'daam', 'barish', 'baarish', 'mausam',
  'chahiye', 'karo', 'karein', 'kare', 'batao', 'bataiye', 'bataye', 'yeh', 'ye', 'woh', 'aur', 'kahan', 'kyun', 'kaun', 'kidhar',
  'seb', 'akhrot', 'khad', 'dawai', 'dawa', 'bimari', 'keeda', 'paisa', 'kholo', 'dikhao', 'chalo',
]);

/** "Answer in Kashmiri", "kashmiri mein batao", "کٲشرِس منز" … — an explicit request wins. */
const ASKED: [ReplyLang, RegExp][] = [
  ['ks', /\b(koshur|kashur|kaashur)\b|\b(in|mein|me|main)\s+kashmiri\b|\bkashmiri\s+(mein|me|main|language|zaban|zubaan)\b|\b(answer|reply|speak|talk|say|bolo|batao)\b.*\bkashmiri\b|कश्मीरी में|कॉशुर|کٲشرِس منز|کٲشُر|کاشُر|کشمیری میں/i],
  ['ur', /\b(in|mein|me)\s+urdu\b|\burdu\s+(mein|me|main)\b|اردو میں/i],
  ['hi', /\b(in|mein|me)\s+hindi\b|\bhindi\s+(mein|me|main)\b|हिंदी में|हिन्दी में/i],
  ['en', /\bin english\b|\benglish\s+(mein|me|main)\b|अंग्रेज़ी में|انگریزی میں/i],
];

export function detectReplyLang(text: string, picked: ReplyLang): ReplyLang {
  for (const [lang, re] of ASKED) if (re.test(text)) return lang;
  // Letters only Kashmiri uses (ٲ ٕ ۄ ؠ ۆ ٚ): Kashmiri, whatever was picked.
  if (/[ٲٕۄؠۆٚ]/.test(text)) return 'ks';
  if (/[؀-ۿ]/.test(text)) return picked === 'ks' ? 'ks' : 'ur'; // Urdu / Kashmiri script
  if (/[ऀ-ॿ]/.test(text)) return 'hi'; // Devanagari
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hindustani = words.filter((w) => ROMAN_HINDUSTANI.has(w)).length;
  const english = words.filter((w) => ENGLISH.has(w)).length;
  // "seb ka bhav kya hai" → their chosen Urdu/Kashmiri, else Hindi (most phones have a Hindi voice).
  if (hindustani >= 2 || (words.length <= 3 && hindustani >= 1 && english === 0)) return picked === 'en' ? 'hi' : picked;
  // "How do I book cold storage?" → English, whatever was chosen before.
  if (english >= 2) return 'en';
  return picked;
}

const ENGLISH = new Set([
  'how', 'what', 'when', 'where', 'which', 'why', 'who', 'do', 'does', 'did', 'i', 'the', 'is', 'are', 'was', 'my', 'to', 'can',
  'of', 'for', 'in', 'an', 'it', 'this', 'that', 'will', 'should', 'with', 'and', 'or', 'me', 'you', 'please', 'tell', 'show', 'open',
]);

const KEY = 'kr_lang';

/** The language this phone last used, or the phone's own language if Urdu/Hindi. */
export function rememberedLang(): ReplyLang | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'hi' || v === 'ur' || v === 'ks') return v;
  } catch {
    /* storage blocked */
  }
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  if (langs.some((l) => l.toLowerCase().startsWith('ks'))) return 'ks';
  if (langs.some((l) => l.toLowerCase().startsWith('ur'))) return 'ur';
  if (langs.some((l) => l.toLowerCase().startsWith('hi'))) return 'hi';
  return null;
}

export function rememberLang(lang: ReplyLang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked */
  }
}
