/**
 * KashRoot's built-in Kashmiri sentences (the assistant's buttons, its
 * "sorry" and "no internet" lines, the "opening…" line). The assistant's
 * answers themselves come from the AI, following the Kashmiri rules in
 * lib/server/kashmiri.ts. Safe in the browser and on the server.
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
  'nav.opening': { en: 'Opening {place}.', ks: '{place} چھُ کھُلان۔' },
} as const satisfies Record<string, { en: string; ks: string }>;

export type KsPhraseKey = keyof typeof KS_PHRASES;

/** A built-in Kashmiri sentence with {place}-style blanks filled. */
export function ksText(key: KsPhraseKey, vars: Record<string, string> = {}): string {
  return KS_PHRASES[key].ks.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
