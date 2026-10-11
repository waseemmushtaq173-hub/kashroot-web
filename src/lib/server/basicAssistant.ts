/**
 * The assistant's free "basic mode", used when no AI key is set: typed or
 * spoken questions in English, Hindi, Urdu or Kashmiri are matched by
 * keywords and answered from live data or fixed how-to answers —
 *   • mandi prices  → Agmarknet / data.gov.in (fetchMandiPrices)
 *   • weather/spray → Open-Meteo, with today's dry hours for spraying
 *   • how to …      → where to go on KashRoot and which button to press
 * Kashmiri is answered in Urdu (closest written form). For Urdu and
 * Kashmiri a Devanagari copy is returned too, for phones with only a Hindi
 * voice. Nothing is made up: if a source fails, it says so. Server-only.
 */
import 'server-only';

import type { Lang } from '@/lib/server/claude';
import { fetchMandiPrices, type MandiQuery, type MandiRecord } from '@/lib/server/mandi';
import { forecast, geocode, type Forecast } from '@/lib/server/weather';
import { dryHours } from '@/lib/sprayWindow';
import { has, norm } from '@/lib/textMatch';

type Text = { en: string; hi: string; ur: string };
export interface BasicAnswer {
  reply: string;
  /** Devanagari copy of an Urdu/Kashmiri reply, for a Hindi voice. */
  speech?: string;
}
export interface BasicDeps {
  prices: (q: MandiQuery) => Promise<{ records: MandiRecord[] }>;
  weather: (place: string) => Promise<Forecast | null>;
}

const defaultDeps: BasicDeps = {
  prices: fetchMandiPrices,
  weather: async (name) => {
    const place = (await geocode(name))[0];
    return place ? forecast(place) : null;
  },
};

export { norm };

// ── what people ask about ──

const COMMODITIES: { name: string; label: Text; keys: string[] }[] = [
  // Plum before potato: "aloo bukhara" contains "aloo".
  { name: 'Plum', label: { en: 'Plum', hi: 'आलूबुखारा', ur: 'آلو بخارا' }, keys: ['plum', 'aloo bukhara', 'alubukhara', 'आलूबुखारा', 'आलू बुखारा', 'آلو بخارا', 'آلوچہ'] },
  { name: 'Apple', label: { en: 'Apple', hi: 'सेब', ur: 'سیب' }, keys: ['apple', 'seb', 'saeb', 'सेब', 'سیب', 'ژونٹھ', 'tsoont', 'chhunth'] },
  { name: 'Walnut', label: { en: 'Walnut', hi: 'अखरोट', ur: 'اخروٹ' }, keys: ['walnut', 'akhrot', 'अखरोट', 'اخروٹ'] },
  { name: 'Almond(Badam)', label: { en: 'Almond', hi: 'बादाम', ur: 'بادام' }, keys: ['almond', 'badam', 'बादाम', 'بادام', 'وادام'] },
  { name: 'Cherry', label: { en: 'Cherry', hi: 'चेरी', ur: 'چیری' }, keys: ['cherry', 'cherries', 'gilas', 'चेरी', 'چیری', 'گلاس'] },
  { name: 'Pear(Marasebu)', label: { en: 'Pear', hi: 'नाशपाती', ur: 'ناشپاتی' }, keys: ['pear', 'nashpati', 'नाशपाती', 'ناشپاتی'] },
  { name: 'Apricot(Jardalu/Khumani)', label: { en: 'Apricot', hi: 'खुबानी', ur: 'خوبانی' }, keys: ['apricot', 'khubani', 'khumani', 'खुबानी', 'خوبانی'] },
  { name: 'Rice', label: { en: 'Rice', hi: 'चावल', ur: 'چاول' }, keys: ['rice', 'paddy', 'chawal', 'dhan', 'चावल', 'धान', 'چاول', 'دھان', 'تومل'] },
  { name: 'Potato', label: { en: 'Potato', hi: 'आलू', ur: 'آلو' }, keys: ['potato', 'aloo', 'आलू', 'آلو'] },
  { name: 'Onion', label: { en: 'Onion', hi: 'प्याज', ur: 'پیاز' }, keys: ['onion', 'pyaz', 'pyaaz', 'प्याज', 'پیاز'] },
  { name: 'Tomato', label: { en: 'Tomato', hi: 'टमाटर', ur: 'ٹماٹر' }, keys: ['tomato', 'tamatar', 'टमाटर', 'ٹماٹر', 'رومی وانگن'] },
  { name: 'Garlic', label: { en: 'Garlic', hi: 'लहसुन', ur: 'لہسن' }, keys: ['garlic', 'lahsun', 'लहसुन', 'لہسن'] },
  { name: 'Maize', label: { en: 'Maize', hi: 'मक्का', ur: 'مکئی' }, keys: ['maize', 'corn', 'makka', 'makki', 'मक्का', 'مکئی', 'مکائی'] },
  { name: 'Wheat', label: { en: 'Wheat', hi: 'गेहूं', ur: 'گندم' }, keys: ['wheat', 'gehu', 'gehun', 'गेहूं', 'गेहूँ', 'گندم'] },
];

const PLACES: { name: string; state: string; district: string; label: Text; keys: string[] }[] = [
  { name: 'Srinagar', state: 'Jammu and Kashmir', district: 'Srinagar', label: { en: 'Srinagar', hi: 'श्रीनगर', ur: 'سرینگر' }, keys: ['srinagar', 'parimpora', 'श्रीनगर', 'سرینگر', 'سری نگر', 'پارمپورہ'] },
  { name: 'Sopore', state: 'Jammu and Kashmir', district: 'Baramulla', label: { en: 'Sopore', hi: 'सोपोर', ur: 'سوپور' }, keys: ['sopore', 'सोपोर', 'سوپور'] },
  { name: 'Shopian', state: 'Jammu and Kashmir', district: 'Shopian', label: { en: 'Shopian', hi: 'शोपियां', ur: 'شوپیان' }, keys: ['shopian', 'शोपियां', 'शोपियन', 'شوپیان', 'شوپیاں'] },
  { name: 'Baramulla', state: 'Jammu and Kashmir', district: 'Baramulla', label: { en: 'Baramulla', hi: 'बारामूला', ur: 'بارہمولہ' }, keys: ['baramulla', 'baramula', 'बारामूला', 'बारामुला', 'بارہمولہ', 'بارامولہ'] },
  { name: 'Pulwama', state: 'Jammu and Kashmir', district: 'Pulwama', label: { en: 'Pulwama', hi: 'पुलवामा', ur: 'پلوامہ' }, keys: ['pulwama', 'पुलवामा', 'پلوامہ'] },
  { name: 'Anantnag', state: 'Jammu and Kashmir', district: 'Anantnag', label: { en: 'Anantnag', hi: 'अनंतनाग', ur: 'اننت ناگ' }, keys: ['anantnag', 'अनंतनाग', 'اننت ناگ', 'اننتناگ'] },
  { name: 'Kulgam', state: 'Jammu and Kashmir', district: 'Kulgam', label: { en: 'Kulgam', hi: 'कुलगाम', ur: 'کولگام' }, keys: ['kulgam', 'कुलगाम', 'کولگام'] },
  { name: 'Budgam', state: 'Jammu and Kashmir', district: 'Budgam', label: { en: 'Budgam', hi: 'बडगाम', ur: 'بڈگام' }, keys: ['budgam', 'बडगाम', 'بڈگام'] },
  { name: 'Ganderbal', state: 'Jammu and Kashmir', district: 'Ganderbal', label: { en: 'Ganderbal', hi: 'गांदरबल', ur: 'گاندربل' }, keys: ['ganderbal', 'गांदरबल', 'گاندربل'] },
  { name: 'Kupwara', state: 'Jammu and Kashmir', district: 'Kupwara', label: { en: 'Kupwara', hi: 'कुपवाड़ा', ur: 'کپواڑہ' }, keys: ['kupwara', 'handwara', 'कुपवाड़ा', 'کپواڑہ', 'ہندواڑہ'] },
  { name: 'Bandipora', state: 'Jammu and Kashmir', district: 'Bandipora', label: { en: 'Bandipora', hi: 'बांदीपोरा', ur: 'بانڈی پورہ' }, keys: ['bandipora', 'बांदीपोरा', 'بانڈی پورہ', 'بانڈیپورہ'] },
  { name: 'Jammu', state: 'Jammu and Kashmir', district: 'Jammu', label: { en: 'Jammu', hi: 'जम्मू', ur: 'جموں' }, keys: ['jammu', 'narwal', 'जम्मू', 'جموں'] },
  { name: 'Kathua', state: 'Jammu and Kashmir', district: 'Kathua', label: { en: 'Kathua', hi: 'कठुआ', ur: 'کٹھوعہ' }, keys: ['kathua', 'कठुआ', 'کٹھوعہ'] },
  { name: 'Delhi', state: 'Delhi', district: 'Delhi', label: { en: 'Delhi', hi: 'दिल्ली', ur: 'دہلی' }, keys: ['delhi', 'dilli', 'azadpur', 'दिल्ली', 'आज़ादपुर', 'دہلی', 'دلی', 'آزادپور'] },
  { name: 'Shimla', state: 'Himachal Pradesh', district: 'Shimla', label: { en: 'Shimla', hi: 'शिमला', ur: 'شملہ' }, keys: ['shimla', 'शिमला', 'شملہ'] },
];

const PRICE = ['price', 'rate', 'bhav', 'bhaav', 'mandi', 'market', 'kimat', 'qeemat', 'daam', 'भाव', 'दाम', 'मंडी', 'कीमत', 'रेट', 'قیمت', 'بھاؤ', 'بھاو', 'منڈی', 'ریٹ', 'دام'];
const WEATHER = ['weather', 'rain', 'snow', 'forecast', 'temperature', 'hail', 'frost', 'mausam', 'barish', 'baarish', 'मौसम', 'बारिश', 'बर्फ', 'ओले', 'तापमान', 'पाला', 'موسم', 'بارش', 'برف', 'اولے', 'درجہ حرارت', 'رود'];
const SPRAY = ['spray', 'chhidkav', 'छिड़काव', 'छिडकाव', 'स्प्रे', 'سپرے', 'اسپرے', 'چھڑکاؤ'];
const GREET = ['hello', ' hi ', 'salam', 'salaam', 'assalam', 'namaste', 'नमस्ते', 'नमस्कार', 'सलाम', 'سلام', 'آداب'];

// Order matters: the first topic whose keyword appears wins (fertiliser before
// selling, since Urdu "بیچ" can mean a batch or to sell).
const HELP: { keys: string[]; text: Text }[] = [
  {
    keys: ['scab', 'disease', 'sick', 'pest', 'insect', 'fungus', 'doctor', 'expert', 'agronomist', 'leaf', 'keeda', 'bimari', 'स्कैब', 'बीमारी', 'रोग', 'कीड़ा', 'कीड़े', 'पत्ते', 'विशेषज्ञ', 'اسکیب', 'سکیب', 'بیماری', 'روگ', 'کیڑا', 'کیڑے', 'پتے', 'ماہر', 'داغ'],
    text: {
      en: 'For a sick tree, pest or scab, open Advisory and press Ask an expert. Speak or type the problem and add a photo; an agronomist answers in My requests. Orchard Health also has a scab risk map for your orchard and a spray log.',
      hi: 'बीमार पेड़, कीड़े या स्कैब के लिए Advisory खोलें और "Ask an expert" दबाएँ। अपनी समस्या बोलें या लिखें और फ़ोटो लगाएँ; विशेषज्ञ का जवाब "My requests" में आएगा। Orchard Health में आपके बाग़ के लिए स्कैब का ख़तरा और स्प्रे का रिकॉर्ड भी है।',
      ur: 'بیمار درخت، کیڑے یا اسکیب کے لیے Advisory کھولیں اور "Ask an expert" دبائیں۔ اپنا مسئلہ بولیں یا لکھیں اور تصویر لگائیں؛ ماہر کا جواب "My requests" میں آئے گا۔ Orchard Health میں آپ کے باغ کے لیے اسکیب کا خطرہ اور اسپرے کا ریکارڈ بھی ہے۔',
    },
  },
  {
    keys: ['cold', 'storage', 'store', 'godown', 'ca store', 'कोल्ड', 'स्टोर', 'भंडार', 'گودام', 'کولڈ', 'سٹور', 'اسٹور', 'اسٹوریج'],
    text: {
      en: 'Open Cold storage and machinery. In the Cold storage tab, find a store with free boxes and press Book. Choose how many boxes and for how many months, pay the owner from your UPI app, and type the payment number. The owner then confirms your space.',
      hi: 'Cold storage and machinery खोलें। Cold storage टैब में ख़ाली जगह वाला स्टोर ढूँढें और Book दबाएँ। कितनी पेटियाँ और कितने महीने चुनें, अपने UPI ऐप से मालिक को भुगतान करें और भुगतान नंबर लिखें। फिर मालिक आपकी जगह पक्की करेगा।',
      ur: 'Cold storage and machinery کھولیں۔ Cold storage ٹیب میں خالی جگہ والا اسٹور ڈھونڈیں اور Book دبائیں۔ کتنی پیٹیاں اور کتنے مہینے چنیں، اپنے UPI ایپ سے مالک کو ادائیگی کریں اور ادائیگی نمبر لکھیں۔ پھر مالک آپ کی جگہ پکی کرے گا۔',
    },
  },
  {
    keys: ['buy', 'order', 'kharid', 'खरीद', 'ख़रीद', 'ऑर्डर', 'خرید', 'آرڈر', 'ہیون'],
    text: {
      en: 'Open Price Comparison, choose Farm inputs or Fruit and produce, and press Order. You pay nothing now; when the goods reach you, press I received the goods in My orders and pay the seller from your UPI app.',
      hi: 'Price Comparison खोलें, खाद-दवा या फल-सब्ज़ी चुनें और Order दबाएँ। अभी कुछ नहीं देना है; सामान पहुँचने पर My orders में "I received the goods" दबाएँ और अपने UPI ऐप से विक्रेता को भुगतान करें।',
      ur: 'Price Comparison کھولیں، کھاد دوائی یا پھل سبزی چنیں اور Order دبائیں۔ ابھی کچھ نہیں دینا ہے؛ سامان پہنچنے پر My orders میں "I received the goods" دبائیں اور اپنے UPI ایپ سے بیچنے والے کو ادائیگی کریں۔',
    },
  },
  {
    keys: ['track', 'truck', 'consignment', 'gaadi', 'gadi', 'ट्रक', 'गाड़ी', 'ٹرک', 'گاڑی', 'کھیپ'],
    text: {
      en: 'Open Tracking and type the KashRoot code your transporter sent you (it starts with KR-), then press Track to see the truck on the map.',
      hi: 'Tracking खोलें और ट्रांसपोर्टर का भेजा KashRoot कोड लिखें (KR- से शुरू होता है), फिर Track दबाएँ, ट्रक नक़्शे पर दिखेगा।',
      ur: 'Tracking کھولیں اور ٹرانسپورٹر کا بھیجا KashRoot کوڈ لکھیں (KR- سے شروع ہوتا ہے)، پھر Track دبائیں، ٹرک نقشے پر نظر آئے گا۔',
    },
  },
  {
    keys: ['fertiliser', 'fertilizer', 'pesticide', 'fungicide', 'khad', 'dawai', 'dawa', 'fake', 'nakli', 'batch', 'खाद', 'दवा', 'दवाई', 'नकली', 'कीटनाशक', 'बैच', 'کھاد', 'دوائی', 'دوا', 'نقلی'],
    text: {
      en: 'To check fertiliser or pesticide, use the fertiliser check on the KashRoot home page: type the batch number from the bag, or photograph the label. If it looks fake, press Report as suspicious.',
      hi: 'खाद या दवा जाँचने के लिए KashRoot के होम पेज पर खाद जाँच इस्तेमाल करें: बोरी पर लिखा बैच नंबर लिखें या लेबल की फ़ोटो लें। नकली लगे तो "Report as suspicious" दबाएँ।',
      ur: 'کھاد یا دوائی جانچنے کے لیے KashRoot کے ہوم پیج پر کھاد کی جانچ استعمال کریں: بوری پر لکھا بیچ نمبر لکھیں یا لیبل کی تصویر لیں۔ نقلی لگے تو "Report as suspicious" دبائیں۔',
    },
  },
  {
    keys: ['sell', 'list produce', 'bech', 'बेच', 'बिक्री', 'بیچ', 'فروخت'],
    text: {
      en: 'To sell your harvest, open the Farmer portal and press List produce. Choose the crop, write its name, your price and how many boxes, and press Save. Buyers order it on Price Comparison and pay you by UPI after the goods reach them.',
      hi: 'अपनी फ़सल बेचने के लिए किसान पोर्टल खोलें और "List produce" दबाएँ। फ़सल चुनें, उसका नाम, अपना दाम और कितनी पेटियाँ हैं लिखें, और Save दबाएँ। ख़रीदार Price Comparison पर ऑर्डर करेंगे और सामान मिलने के बाद आपको UPI से भुगतान करेंगे।',
      ur: 'اپنی فصل بیچنے کے لیے کسان پورٹل کھولیں اور "List produce" دبائیں۔ فصل چنیں، اس کا نام، اپنا دام اور کتنی پیٹیاں ہیں لکھیں، اور Save دبائیں۔ خریدار Price Comparison پر آرڈر کریں گے اور سامان ملنے کے بعد آپ کو UPI سے ادائیگی کریں گے۔',
    },
  },
  {
    keys: ['pay', 'upi', 'money', 'paisa', 'paise', 'payment', 'पैसा', 'पैसे', 'भुगतान', 'پیسہ', 'پیسے', 'ادائیگی', 'پونسہ'],
    text: {
      en: 'KashRoot does not hold your money. You pay the seller or cold-store owner directly from your UPI app — for orders, only after the goods reach you — and type the payment number so they can confirm.',
      hi: 'KashRoot आपका पैसा अपने पास नहीं रखता। आप विक्रेता या कोल्ड स्टोर मालिक को सीधे अपने UPI ऐप से भुगतान करते हैं — ऑर्डर में सामान पहुँचने के बाद ही — और भुगतान नंबर लिखते हैं ताकि वे पक्का कर सकें।',
      ur: 'KashRoot آپ کا پیسہ اپنے پاس نہیں رکھتا۔ آپ بیچنے والے یا کولڈ اسٹور مالک کو سیدھے اپنے UPI ایپ سے ادائیگی کرتے ہیں — آرڈر میں سامان پہنچنے کے بعد ہی — اور ادائیگی نمبر لکھتے ہیں تاکہ وہ پکا کر سکیں۔',
    },
  },
];

const INTRO: Text = {
  en: 'I can tell you mandi prices (say: apple price in Sopore), the weather and when to spray (say: weather in Shopian), and how to use KashRoot — selling, buying, cold storage, tracking, experts and checking fertiliser. For a crop problem, press Ask an expert to reach an agronomist.',
  hi: 'मैं मंडी भाव बता सकता हूँ (बोलें: सोपोर में सेब का भाव), मौसम और स्प्रे का सही समय (बोलें: शोपियां का मौसम), और KashRoot इस्तेमाल करने का तरीक़ा — बेचना, ख़रीदना, कोल्ड स्टोर, ट्रैकिंग, विशेषज्ञ और खाद की जाँच। फ़सल की बीमारी के लिए "Ask an expert" दबाएँ।',
  ur: 'میں منڈی بھاؤ بتا سکتا ہوں (بولیں: سوپور میں سیب کا بھاؤ)، موسم اور اسپرے کا صحیح وقت (بولیں: شوپیان کا موسم)، اور KashRoot استعمال کرنے کا طریقہ — بیچنا، خریدنا، کولڈ اسٹور، ٹریکنگ، ماہر اور کھاد کی جانچ۔ فصل کی بیماری کے لیے "Ask an expert" دبائیں۔',
};

// ── answer building ──

const pick = (t: Text, lang: Lang) => (lang === 'hi' ? t.hi : lang === 'en' ? t.en : t.ur);
/** Urdu/Kashmiri replies also come in Devanagari, for a Hindi voice. */
const answer = (lang: Lang, make: (l: 'en' | 'hi' | 'ur') => string): BasicAnswer =>
  lang === 'en' ? { reply: make('en') } : lang === 'hi' ? { reply: make('hi') } : { reply: make('ur'), speech: make('hi') };

/** A market's name in the reader's script when it is a town we know ("Sopore" → "سوپور"). */
function marketName(market: string, l: 'en' | 'hi' | 'ur'): string {
  const known = PLACES.find((p) => norm(p.name) === norm(market));
  return known ? known.label[l] : market;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
function day(iso: string, l: 'en' | 'hi' | 'ur'): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(l === 'en' ? 'en-IN' : l === 'hi' ? 'hi-IN' : 'ur-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

async function priceAnswer(lang: Lang, crop: (typeof COMMODITIES)[number], place: (typeof PLACES)[number] | undefined, deps: BasicDeps): Promise<BasicAnswer> {
  const state = place?.state ?? 'Jammu and Kashmir';
  let rows: MandiRecord[];
  try {
    rows = (await deps.prices({ commodity: crop.name, state, limit: 200 })).records;
  } catch {
    return answer(lang, (l) => ({
      en: `The government mandi price service is not answering right now, so I can't tell you today's ${crop.label.en} rate. Please try again in a little while.`,
      hi: `सरकारी मंडी भाव सेवा अभी जवाब नहीं दे रही, इसलिए आज का ${crop.label.hi} का भाव नहीं बता सकता। थोड़ी देर बाद फिर पूछें।`,
      ur: `سرکاری منڈی بھاؤ سروس ابھی جواب نہیں دے رہی، اس لیے آج کا ${crop.label.ur} کا بھاؤ نہیں بتا سکتا۔ تھوڑی دیر بعد دوبارہ پوچھیں۔`,
    })[l]);
  }
  const near = place ? rows.filter((r) => [r.market, r.district].some((v) => norm(v).includes(norm(place.name)) || norm(v).includes(norm(place.district)))) : [];
  const chosen = (near.length ? near : rows).slice().sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));
  const seen = new Set<string>();
  const top = chosen.filter((r) => (seen.has(r.market) ? false : (seen.add(r.market), true))).slice(0, 3);
  if (!top.length) {
    return answer(lang, (l) => ({
      en: `No mandi has reported ${crop.label.en} recently${place ? ` in ${place.label.en}` : ''}. Try another crop or market.`,
      hi: `हाल में${place ? ` ${place.label.hi} में` : ''} किसी मंडी ने ${crop.label.hi} का भाव नहीं भेजा। कोई और फ़सल या मंडी पूछें।`,
      ur: `حال میں${place ? ` ${place.label.ur} میں` : ''} کسی منڈی نے ${crop.label.ur} کا بھاؤ نہیں بھیجا۔ کوئی اور فصل یا منڈی پوچھیں۔`,
    })[l]);
  }
  const missed = place && !near.length;
  return answer(lang, (l) => {
    const lines = top.map((r) =>
      l === 'en'
        ? `${marketName(r.market, l)} on ${day(r.arrivalDate, l)}: ${rupees(r.modalPrice)} a quintal, that is ${rupees(r.modalPrice / 100)} a kilo`
        : l === 'hi'
          ? `${marketName(r.market, l)} में ${day(r.arrivalDate, l)} को ${rupees(r.modalPrice)} प्रति क्विंटल, यानी ${rupees(r.modalPrice / 100)} प्रति किलो`
          : `${marketName(r.market, l)} میں ${day(r.arrivalDate, l)} کو ${rupees(r.modalPrice)} فی کوئنٹل، یعنی ${rupees(r.modalPrice / 100)} فی کلو`,
    );
    const head = {
      en: `${crop.label.en} mandi rates${missed ? ` (no report from ${place!.label.en}; nearest mandis)` : ''}: `,
      hi: `${crop.label.hi} के मंडी भाव${missed ? ` (${place!.label.hi} से कोई रिपोर्ट नहीं; दूसरी मंडियाँ)` : ''}: `,
      ur: `${crop.label.ur} کے منڈی بھاؤ${missed ? ` (${place!.label.ur} سے کوئی رپورٹ نہیں؛ دوسری منڈیاں)` : ''}: `,
    }[l];
    const tail = { en: '. Source: Agmarknet, Government of India.', hi: '। स्रोत: एगमार्कनेट, भारत सरकार।', ur: '۔ ذریعہ: ایگمارک نیٹ، حکومتِ ہند۔' }[l];
    return head + lines.join(l === 'en' ? '; ' : l === 'hi' ? '; ' : '؛ ') + tail;
  });
}

async function weatherAnswer(lang: Lang, place: (typeof PLACES)[number] | undefined, sprayAsked: boolean, deps: BasicDeps): Promise<BasicAnswer> {
  const name = place?.name ?? 'Srinagar';
  let f: Forecast | null;
  try {
    f = await deps.weather(name);
  } catch {
    f = null;
  }
  const label = place?.label ?? { en: 'Srinagar', hi: 'श्रीनगर', ur: 'سرینگر' };
  if (!f) {
    return answer(lang, (l) => ({
      en: 'The weather service is not answering right now. Please try again in a little while.',
      hi: 'मौसम सेवा अभी जवाब नहीं दे रही। थोड़ी देर बाद फिर पूछें।',
      ur: 'موسم کی سروس ابھی جواب نہیں دے رہی۔ تھوڑی دیر بعد دوبارہ پوچھیں۔',
    })[l]);
  }
  const t = Math.round(f.current.temperature);
  const today = f.daily[0];
  const tomorrow = f.daily[1];
  const dry = dryHours(f.current.time, f.hourly);
  const mm1 = today?.precipitation ?? 0;
  const mm2 = tomorrow?.precipitation ?? 0;
  /** "rain 3.2 mm", or "no rain" — in each language. */
  const rain = (mm: number, l: 'en' | 'hi' | 'ur') =>
    mm < 0.1 ? { en: 'no rain', hi: 'बारिश नहीं', ur: 'بارش نہیں' }[l] : { en: `rain ${mm.toFixed(1)} mm`, hi: `बारिश ${mm.toFixed(1)} मिलीमीटर`, ur: `بارش ${mm.toFixed(1)} ملی میٹر` }[l];
  return answer(lang, (l) => {
    const parts = {
      en: [
        `Weather in ${label.en}: now ${t}°C, humidity ${Math.round(f.current.humidity)}%.`,
        today ? `Today ${Math.round(today.min)}° to ${Math.round(today.max)}°, ${rain(mm1, 'en')}.` : '',
        tomorrow ? `Tomorrow ${Math.round(tomorrow.min)}° to ${Math.round(tomorrow.max)}°, ${rain(mm2, 'en')}.` : '',
        sprayAsked || mm1 >= 0.1 ? (dry ? `Dry hours for spraying today: ${dry}.` : 'Rain is likely for the rest of today, so better not to spray.') : '',
        place ? '' : 'Tell me your town for local weather.',
      ],
      hi: [
        `${label.hi} का मौसम: अभी ${t} डिग्री, नमी ${Math.round(f.current.humidity)} प्रतिशत।`,
        today ? `आज ${Math.round(today.min)} से ${Math.round(today.max)} डिग्री, ${rain(mm1, 'hi')}।` : '',
        tomorrow ? `कल ${Math.round(tomorrow.min)} से ${Math.round(tomorrow.max)} डिग्री, ${rain(mm2, 'hi')}।` : '',
        sprayAsked || mm1 >= 0.1 ? (dry ? `आज स्प्रे के लिए सूखा समय: ${dry}।` : 'आज बाक़ी दिन बारिश की संभावना है, इसलिए स्प्रे न करें।') : '',
        place ? '' : 'अपने इलाक़े का मौसम जानने के लिए अपने शहर का नाम बताएँ।',
      ],
      ur: [
        `${label.ur} کا موسم: ابھی ${t} ڈگری، نمی ${Math.round(f.current.humidity)} فیصد۔`,
        today ? `آج ${Math.round(today.min)} سے ${Math.round(today.max)} ڈگری، ${rain(mm1, 'ur')}۔` : '',
        tomorrow ? `کل ${Math.round(tomorrow.min)} سے ${Math.round(tomorrow.max)} ڈگری، ${rain(mm2, 'ur')}۔` : '',
        sprayAsked || mm1 >= 0.1 ? (dry ? `آج اسپرے کے لیے خشک وقت: ${dry}۔` : 'آج باقی دن بارش کا امکان ہے، اس لیے اسپرے نہ کریں۔') : '',
        place ? '' : 'اپنے علاقے کا موسم جاننے کے لیے اپنے شہر کا نام بتائیں۔',
      ],
    }[l];
    return parts.filter(Boolean).join(' ');
  });
}

/**
 * Questions basic mode answers fully and at once (prices, weather, how to
 * use the site) — worth answering without the AI even when it is connected.
 * Crop problems and anything unrecognised go to the AI.
 */
export function quickIntent(query: string): boolean {
  const q = ` ${norm(query)} `;
  const weatherAsked = has(q, SPRAY) || has(q, WEATHER);
  const priceAsked = has(q, PRICE);
  if (weatherAsked && !priceAsked) return true;
  if (priceAsked && COMMODITIES.some((c) => has(q, c.keys))) return true;
  const help = HELP.find((h) => has(q, h.keys));
  if (!help || help === HELP[0]) return false; // crop care, disease, pests: the AI answers
  // "Which fertiliser for walnut?" is crop care; "is this batch fake?" is the check.
  if (help.keys.includes('fertiliser') && !has(q, ['check', 'fake', 'nakli', 'batch', 'genuine', 'asli', 'real', 'नकली', 'जाँच', 'जांच', 'असली', 'بیچ نمبر', 'جانچ', 'نقلی', 'اصلی'])) return false;
  return true;
}

export async function basicAnswer(query: string, lang: Lang, deps: BasicDeps = defaultDeps): Promise<BasicAnswer> {
  const q = ` ${norm(query)} `;
  const crop = COMMODITIES.find((c) => has(q, c.keys));
  const place = PLACES.find((p) => has(q, p.keys));
  const sprayAsked = has(q, SPRAY);
  const weatherAsked = sprayAsked || has(q, WEATHER);
  const priceAsked = has(q, PRICE);

  if (weatherAsked && !priceAsked) return weatherAnswer(lang, place, sprayAsked, deps);
  if (crop && (priceAsked || !HELP.some((h) => has(q, h.keys)))) return priceAnswer(lang, crop, place, deps);
  if (priceAsked) {
    return answer(lang, (l) => ({
      en: 'Which crop? Say for example: apple price in Sopore, or walnut rate in Srinagar.',
      hi: 'कौन सी फ़सल? जैसे बोलें: सोपोर में सेब का भाव, या श्रीनगर में अखरोट का भाव।',
      ur: 'کون سی فصل؟ جیسے بولیں: سوپور میں سیب کا بھاؤ، یا سرینگر میں اخروٹ کا بھاؤ۔',
    })[l]);
  }
  const help = HELP.find((h) => has(q, h.keys));
  if (help) return answer(lang, (l) => pick(help.text, l));
  if (has(q, GREET)) return answer(lang, (l) => ({ en: 'Hello! ', hi: 'नमस्ते! ', ur: 'خوش آمدید! ' })[l] + pick(INTRO, l));
  return answer(lang, (l) => pick(INTRO, l));
}
