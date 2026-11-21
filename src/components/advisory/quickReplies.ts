/**
 * One-tap replies for the expert conversation. A tap puts the words in the message box (nothing is sent until the person
 * taps Send), so a farmer who finds typing hard can answer in a tap and still sees what will be sent. Plain, neutral lines
 * only: no advice, doses or products, which an expert must write for the case.
 */
export type ThreadLang = 'en' | 'hi' | 'ur' | 'ks';

const FARMER: Record<'en' | 'hi' | 'ur', string[]> = {
  en: ['Thank you 🙏', 'Please call me', 'The problem is still there', 'I did not understand. Please explain again.'],
  hi: ['धन्यवाद 🙏', 'कृपया मुझे फ़ोन करें', 'समस्या अभी भी है', 'समझ नहीं आया। कृपया फिर से समझाएँ।'],
  ur: ['شکریہ 🙏', 'براہِ کرم مجھے فون کریں', 'مسئلہ ابھی بھی ہے', 'سمجھ نہیں آیا۔ براہِ کرم دوبارہ سمجھائیں۔'],
};

/** Questions an expert often has to ask before answering. */
const EXPERT = ['Since when is this happening?', 'Which variety is it, and how old are the trees?', 'What did you spray last, and when?', 'Is it getting better or worse?'];

/** The replies to offer: the farmer's in the language of the question (Kashmiri readers get the Urdu lines), the expert's in English. */
export function quickRepliesFor(asExpert: boolean, lang: ThreadLang): string[] {
  if (asExpert) return EXPERT;
  return FARMER[lang === 'ks' ? 'ur' : lang];
}

/** A reply added to what is already written: on a new line, never over the person's own words. */
export function addQuickReply(current: string, reply: string): string {
  const text = current.trimEnd();
  return text ? `${text}\n${reply}` : reply;
}
