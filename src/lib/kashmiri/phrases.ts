/**
 * KashRoot's built-in Kashmiri sentences (the assistant's buttons, its
 * "sorry" and "no internet" lines, the "opening…" line).
 *
 * The Kashmiri here is a first draft, not yet checked by a native speaker.
 * Editors correct each one in the Kashmiri Lab; the corrected text is saved in
 * ks_phrases and used instead, on the website and on the server.
 * Safe in the browser and on the server.
 */
export const KS_PHRASES = {
  'assistant.sorry': { en: 'Sorry, I could not answer just now. Please try again in a minute.', ks: 'معاف کٔرِو، بہٕ ہیٚکُس نہٕ وۄنی جواب دِتھ۔ اَکھ مِنَٹ پَتہٕ کٔرِو بیٚیہِ کوشش۔' },
  'assistant.offline': { en: 'No internet connection. Please check your mobile data and try again.', ks: 'اِنٹرنیٹ چھُ نہٕ۔ پنُن موبائل ڈیٹا وُچھِو تہٕ کٔرِو بیٚیہِ کوشش۔' },
  'assistant.placeholder': { en: 'Or type your question…', ks: 'یا لیٚکھِو پنُن سوال…' },
  'assistant.ask': { en: 'Ask', ks: 'پرٛژھِو' },
  'assistant.tap': { en: 'Tap and speak', ks: 'دبٲوِو تہٕ وَنِو' },
  'assistant.listening': { en: 'Listening…', ks: 'بوزان…' },
  'assistant.thinking': { en: 'Thinking…', ks: 'سوچان…' },
  'assistant.speaking': { en: 'Speaking…', ks: 'وَنان…' },
  'assistant.checking': { en: 'Checking live data…', ks: 'تازٕ خبر چھِ وُچھنہٕ یِوان…' },
  'assistant.speak_hint': { en: 'Speak in Kashmiri or Urdu', ks: 'کٲشرِس یا اُردوہس منٛز وَنِو' },
  'assistant.suggest.1': { en: 'What is the apple rate today?', ks: 'اَز کیاہ چھُ سیبُک ریٹ؟' },
  'assistant.suggest.2': { en: 'Will it rain this week?', ks: 'یَتھ ہفتس منٛز روٗد آسہِ؟' },
  'assistant.suggest.3': { en: 'How do I stop scab on apples?', ks: 'سیبس پیٹھ اسکیب کِتھ کٔنۍ رۄکہٕ؟' },
  'assistant.suggest.4': { en: 'How do I book cold storage?', ks: 'کولڈ سٹور کِتھ کٔنۍ کرٕ بُک؟' },
  'assistant.correct': { en: 'Not proper Kashmiri? Correct it', ks: 'یہِ چھا نہٕ صحیح کٲشُر؟ ٹھیک کٔرِو' },
  'report.title': { en: 'Help KashRoot speak proper Kashmiri', ks: 'کٲشُر ٹھیک کرنس منٛز کٔرِو مدد' },
  'report.write': { en: 'How would you say it in Kashmiri? (optional)', ks: 'تُہۍ کِتھ کٔنۍ وَنِو یہِ کٲشرِس منٛز؟' },
  'report.send': { en: 'Send', ks: 'سوزِو' },
  'report.thanks': { en: 'Thank you — a Kashmiri editor will check it.', ks: 'شُکریہ! کٲشرِ ہُنٛد ایڈیٹر وُچھِ یہِ۔' },
  'nav.opening': { en: 'Opening {place}.', ks: '{place} چھُ کھُلان۔' },
} as const satisfies Record<string, { en: string; ks: string }>;

export type KsPhraseKey = keyof typeof KS_PHRASES;
export const KS_PHRASE_KEYS = Object.keys(KS_PHRASES) as KsPhraseKey[];

/** Corrections saved by editors (ks_phrases), loaded once per page / server instance. */
let overrides: Partial<Record<string, string>> = {};

export function setKsOverrides(map: Partial<Record<string, string>>) {
  overrides = { ...map };
}

/** A built-in Kashmiri sentence — the editors' version when there is one — with {place}-style blanks filled. */
export function ksText(key: KsPhraseKey, vars: Record<string, string> = {}, from: Partial<Record<string, string>> = overrides): string {
  const text = from[key]?.trim() || KS_PHRASES[key].ks;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
