/**
 * The assistant's free "basic mode", used when no AI key is set: typed or
 * spoken questions in English, Hindi, Urdu or Kashmiri are matched by
 * keywords and answered from live data or fixed how-to answers —
 *   • mandi prices  → rates posted on KashRoot by approved Mandi Helpers,
 *                     then Agmarknet / data.gov.in (fetchMandiPrices)
 *   • weather/spray → Open-Meteo, with today's dry hours for spraying
 *   • how to …      → where to go on KashRoot and which button to press
 * Kashmiri is answered in Urdu (closest written form). For Urdu and
 * Kashmiri a Devanagari copy is returned too, for phones with only a Hindi
 * voice. Nothing is made up: if a source fails, it says so. Server-only.
 */
import 'server-only';

import type { Lang } from '@/lib/server/claude';
import { fetchMandiPrices, type MandiQuery, type MandiRecord } from '@/lib/server/mandi';
import { istDate, perKilo, postedRates, type PostedRate } from '@/lib/server/postedRates';
import { forecast, geocode, type Forecast } from '@/lib/server/weather';
import { dryHours } from '@/lib/sprayWindow';
import { hasWord as has, norm } from '@/lib/textMatch';

type Text = { en: string; hi: string; ur: string };
export interface BasicAnswer {
  reply: string;
  /** Devanagari copy of an Urdu/Kashmiri reply, for a Hindi voice. */
  speech?: string;
}
/**
 * Where the person is, sent by the page (lib/region): the phone's position, the
 * district from My details, or the main town of the state they chose (not
 * exact). Used when the question names no place.
 */
export interface Here {
  name: string;
  lat?: number;
  lng?: number;
  state?: string;
  exact: boolean;
}
export interface BasicDeps {
  prices: (q: MandiQuery) => Promise<{ records: MandiRecord[] }>;
  weather: (place: string) => Promise<Forecast | null>;
  /** The forecast for where the person is (by position when known, else by name). */
  weatherAt?: (here: Here) => Promise<Forecast | null>;
  /** Rates posted on KashRoot by Mandi Helpers, for one crop. */
  posted?: (crop: string) => Promise<PostedRate[]>;
}

const defaultDeps: BasicDeps = {
  prices: fetchMandiPrices,
  posted: (crop) => postedRates(crop),
  weather: async (name) => {
    const place = (await geocode(name, { deep: true }))[0];
    return place ? forecast(place) : null;
  },
  weatherAt: async (here) => {
    if (here.lat !== undefined && here.lng !== undefined) return forecast({ name: here.name, admin: here.state ?? '', country: 'India', lat: here.lat, lng: here.lng });
    const place = (await geocode(here.name, { deep: true }))[0];
    return place ? forecast(place) : null;
  },
};

export { norm };

// ── what people ask about ──

const COMMODITIES: { name: string; label: Text; keys: string[] }[] = [
  // Plum before potato: "aloo bukhara" contains "aloo".
  { name: 'Plum', label: { en: 'Plum', hi: 'आलूबुखारा', ur: 'آلو بخارا' }, keys: ['plum', 'aloo bukhara', 'alubukhara', 'आलूबुखारा', 'आलू बुखारा', 'آلو بخارا', 'آلوچہ'] },
  { name: 'Apple', label: { en: 'Apple', hi: 'सेब', ur: 'سیب' }, keys: ['apple', 'seb', 'seeb', 'sev', 'saeb', 'सेब', 'सेव', 'سیب', 'ژونٹھ', 'tsoont', 'chhunth'] },
  { name: 'Walnut', label: { en: 'Walnut', hi: 'अखरोट', ur: 'اخروٹ' }, keys: ['walnut', 'akhrot', 'doon', 'अखरोट', 'اخروٹ'] },
  { name: 'Saffron', label: { en: 'Saffron', hi: 'केसर', ur: 'زعفران' }, keys: ['saffron', 'kesar', 'zafran', 'kong', 'केसर', 'ज़ाफ़रान', 'زعفران', 'کیسر'] },
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
      en: 'For a sick tree, pest or scab, open Advisory and press Ask an expert. Speak or type the problem and add a photo; an agronomist answers in My requests. Orchard Health in the Farmer portal also has a scab risk map for your orchard and a spray log.',
      hi: 'बीमार पेड़, कीड़े या स्कैब के लिए Advisory खोलें और "Ask an expert" दबाएँ। अपनी समस्या बोलें या लिखें और फ़ोटो लगाएँ; विशेषज्ञ का जवाब "My requests" में आएगा। Farmer portal के Orchard Health में आपके बाग़ के लिए स्कैब का ख़तरा और स्प्रे का रिकॉर्ड भी है।',
      ur: 'بیمار درخت، کیڑے یا اسکیب کے لیے Advisory کھولیں اور "Ask an expert" دبائیں۔ اپنا مسئلہ بولیں یا لکھیں اور تصویر لگائیں؛ ماہر کا جواب "My requests" میں آئے گا۔ Farmer portal کے Orchard Health میں آپ کے باغ کے لیے اسکیب کا خطرہ اور اسپرے کا ریکارڈ بھی ہے۔',
    },
  },
  {
    keys: ['cold storage', 'cold store', 'storage', 'godown', 'ca store', 'कोल्ड', 'स्टोर', 'भंडार', 'گودام', 'کولڈ', 'سٹور', 'اسٹور', 'اسٹوریج'],
    text: {
      en: 'Open Cold Storage Booking. Find a store with free space and press Choose your place: you see the whole store, every chamber, on a floor plan or in 3D. Tap the free places you want, or type how many boxes you have and press Choose places for me. Pay the owner from your UPI app within 24 hours and type the payment number. The owner then confirms your space.',
      hi: 'Cold Storage Booking खोलें। ख़ाली जगह वाला स्टोर ढूँढें और Choose your place दबाएँ: पूरा स्टोर, हर चैंबर, नक़्शे पर या 3D में दिखेगा। अपनी पसंद की ख़ाली जगहें छुएँ, या अपनी पेटियों की गिनती लिखकर Choose places for me दबाएँ। 24 घंटे के अंदर अपने UPI ऐप से मालिक को भुगतान करें और भुगतान नंबर लिखें। फिर मालिक आपकी जगह पक्की करेगा।',
      ur: 'Cold Storage Booking کھولیں۔ خالی جگہ والا اسٹور ڈھونڈیں اور Choose your place دبائیں: پورا اسٹور، ہر چیمبر، نقشے پر یا 3D میں دکھے گا۔ اپنی پسند کی خالی جگہیں چھوئیں، یا اپنی پیٹیوں کی گنتی لکھ کر Choose places for me دبائیں۔ 24 گھنٹے کے اندر اپنے UPI ایپ سے مالک کو ادائیگی کریں اور ادائیگی نمبر لکھیں۔ پھر مالک آپ کی جگہ پکی کرے گا۔',
    },
  },
  {
    keys: ['buy', 'order', 'kharid', 'खरीद', 'ख़रीद', 'ऑर्डर', 'خرید', 'آرڈر', 'ہیون'],
    text: {
      en: 'To buy apples or other produce, open the Buyer portal and press Buy apples & produce. For farm inputs, open Price Comparison. Press Order. You pay nothing now; when the goods reach you, press I received the goods in My orders and pay the seller from your UPI app.',
      hi: 'सेब या दूसरी फ़सल ख़रीदने के लिए Buyer portal खोलें और "Buy apples & produce" दबाएँ। खाद-दवा के लिए Price Comparison खोलें। Order दबाएँ। अभी कुछ नहीं देना है; सामान पहुँचने पर My orders में "I received the goods" दबाएँ और अपने UPI ऐप से विक्रेता को भुगतान करें।',
      ur: 'سیب یا دوسری فصل خریدنے کے لیے Buyer portal کھولیں اور "Buy apples & produce" دبائیں۔ کھاد دوائی کے لیے Price Comparison کھولیں۔ Order دبائیں۔ ابھی کچھ نہیں دینا ہے؛ سامان پہنچنے پر My orders میں "I received the goods" دبائیں اور اپنے UPI ایپ سے بیچنے والے کو ادائیگی کریں۔',
    },
  },
  {
    // "How do I book a truck?": KashRoot records and tracks loads, it books no trucks.
    keys: ['book a truck', 'book truck', 'truck book', 'hire a truck', 'load carrier', 'transporter', 'ट्रक बुक', 'ट्रक किराए', 'ٹرک بک', 'ٹرک کرائے'],
    text: {
      en: 'KashRoot does not find or book trucks. Arrange the truck with your own transporter. Then, in the Tracking portal, press My consignments and create the consignment: the driver gets a link that shows the load live to you and your buyer.',
      hi: 'KashRoot ट्रक नहीं ढूँढता और बुक भी नहीं करता। ट्रक अपने ट्रांसपोर्टर से तय करें। फिर Tracking portal में My consignments दबाकर consignment बनाएँ: ड्राइवर को एक लिंक मिलेगा जिससे आपको और ख़रीदार को माल रास्ते में दिखेगा।',
      ur: 'KashRoot ٹرک نہیں ڈھونڈتا اور بک بھی نہیں کرتا۔ ٹرک اپنے ٹرانسپورٹر سے طے کریں۔ پھر Tracking portal میں My consignments دبا کر consignment بنائیں: ڈرائیور کو ایک لنک ملے گا جس سے آپ کو اور خریدار کو مال راستے میں دکھے گا۔',
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
    keys: ['truescan', 'fertiliser', 'fertilizer', 'pesticide', 'fungicide', 'khad', 'dawai', 'dawa', 'fake', 'nakli', 'batch', 'खाद', 'दवा', 'दवाई', 'नकली', 'कीटनाशक', 'बैच', 'کھاد', 'دوائی', 'دوا', 'نقلی'],
    text: {
      en: 'To check a fertiliser or pesticide, open KashRoot TrueScan on the KashRoot home page: type the registration number (CIR-…), the product name or the batch number from the bag, or photograph the label. It is checked against the Government lists. If it looks fake, press Report as suspicious.',
      hi: 'खाद या दवा जाँचने के लिए KashRoot के होम पेज पर KashRoot TrueScan खोलें: बोरी पर लिखा रजिस्ट्रेशन नंबर (CIR-…), दवा का नाम या बैच नंबर लिखें, या लेबल की फ़ोटो लें। इसे सरकारी सूची से मिलाया जाता है। नकली लगे तो "Report as suspicious" दबाएँ।',
      ur: 'کھاد یا دوائی جانچنے کے لیے KashRoot کے ہوم پیج پر KashRoot TrueScan کھولیں: بوری پر لکھا رجسٹریشن نمبر (CIR-…)، دوائی کا نام یا بیچ نمبر لکھیں، یا لیبل کی تصویر لیں۔ اسے سرکاری فہرست سے ملایا جاتا ہے۔ نقلی لگے تو "Report as suspicious" دبائیں۔',
    },
  },
  {
    keys: ['sell', 'list produce', 'bech', 'बेच', 'बिक्री', 'بیچ', 'فروخت'],
    text: {
      en: 'To sell your harvest, open the Farmer portal and press List produce. Choose the crop, write its name, your price and how many boxes, and press Save. Buyers see it in their Buyer portal and on Price Comparison, order it, and pay you by UPI after the goods reach them.',
      hi: 'अपनी फ़सल बेचने के लिए किसान पोर्टल खोलें और "List produce" दबाएँ। फ़सल चुनें, उसका नाम, अपना दाम और कितनी पेटियाँ हैं लिखें, और Save दबाएँ। ख़रीदार इसे अपने Buyer portal में और Price Comparison पर देखकर ऑर्डर करेंगे, और सामान मिलने के बाद आपको UPI से भुगतान करेंगे।',
      ur: 'اپنی فصل بیچنے کے لیے کسان پورٹل کھولیں اور "List produce" دبائیں۔ فصل چنیں، اس کا نام، اپنا دام اور کتنی پیٹیاں ہیں لکھیں، اور Save دبائیں۔ خریدار اسے اپنے Buyer portal میں اور Price Comparison پر دیکھ کر آرڈر کریں گے، اور سامان ملنے کے بعد آپ کو UPI سے ادائیگی کریں گے۔',
    },
  },
  {
    keys: ['pay', 'escrow', 'upi', 'money', 'paisa', 'paise', 'payment', 'पैसा', 'पैसे', 'भुगतान', 'پیسہ', 'پیسے', 'ادائیگی', 'پونسہ'],
    text: {
      en: 'KashRoot does not hold your money. You pay the seller or cold-store owner directly from your UPI app — for orders, only after the goods reach you — and type the payment number so they can confirm.',
      hi: 'KashRoot आपका पैसा अपने पास नहीं रखता। आप विक्रेता या कोल्ड स्टोर मालिक को सीधे अपने UPI ऐप से भुगतान करते हैं — ऑर्डर में सामान पहुँचने के बाद ही — और भुगतान नंबर लिखते हैं ताकि वे पक्का कर सकें।',
      ur: 'KashRoot آپ کا پیسہ اپنے پاس نہیں رکھتا۔ آپ بیچنے والے یا کولڈ اسٹور مالک کو سیدھے اپنے UPI ایپ سے ادائیگی کرتے ہیں — آرڈر میں سامان پہنچنے کے بعد ہی — اور ادائیگی نمبر لکھتے ہیں تاکہ وہ پکا کر سکیں۔',
    },
  },
];

const INTRO: Text = {
  en: 'I can tell you mandi prices (say: apple price in Sopore), the weather and when to spray (say: weather in Shopian), and how to use KashRoot — selling, buying, cold storage, tracking, experts and checking fertilisers with KashRoot TrueScan. For a crop problem, press Ask an expert to reach an agronomist.',
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

type Crop = (typeof COMMODITIES)[number];
type Place = (typeof PLACES)[number];

const UNIT: Record<PostedRate['unit'], Text> = {
  box: { en: 'a box', hi: 'प्रति पेटी', ur: 'فی پیٹی' },
  kg: { en: 'a kilo', hi: 'प्रति किलो', ur: 'فی کلو' },
  quintal: { en: 'a quintal', hi: 'प्रति क्विंटल', ur: 'فی کوئنٹل' },
};

function postedDay(iso: string, l: 'en' | 'hi' | 'ur'): string {
  if (iso === istDate()) return { en: 'today', hi: 'आज', ur: 'آج' }[l];
  if (iso === istDate(-1)) return { en: 'yesterday', hi: 'कल', ur: 'کل' }[l];
  return { en: `on ${day(iso, l)}`, hi: `${day(iso, l)} को`, ur: `${day(iso, l)} کو` }[l];
}

/** Rates reporters posted on KashRoot, nearest mandi first; null when none were posted. */
function postedAnswer(lang: Lang, crop: Crop, place: Place | undefined, rates: PostedRate[]): BasicAnswer | null {
  if (!rates.length) return null;
  const at = (r: PostedRate, v: string) => norm(v).includes(norm(r.mandi)) || norm(r.mandi).includes(norm(v));
  const exact = place ? rates.filter((r) => at(r, place.name) || place.keys.some((k) => at(r, k))) : [];
  const near = place && !exact.length ? rates.filter((r) => norm(r.district ?? '').includes(norm(place.district))) : [];
  const chosen = exact.length ? exact : near.length ? near : rates;
  // Newest first; on the same day, confirmed rates before unchecked ones.
  const top = chosen.slice().sort((a, b) => b.rate_date.localeCompare(a.rate_date) || Number(b.status === 'verified') - Number(a.status === 'verified')).slice(0, 4);
  const missed = place && !exact.length && !near.length;
  return answer(lang, (l) => {
    const lines = top.map((r) => {
      const kind = [r.variety, r.grade].filter(Boolean).join(' ');
      const kg = r.unit === 'kg' ? null : perKilo(r, r.modal_price);
      const box = r.unit === 'box' && r.box_kg ? { en: ` of ${r.box_kg} kg`, hi: ` (${r.box_kg} किलो)`, ur: ` (${r.box_kg} کلو)` }[l] : '';
      const perKg = kg === null ? '' : { en: `, about ${rupees(kg)} a kilo`, hi: `, यानी लगभग ${rupees(kg)} प्रति किलो`, ur: `، یعنی تقریباً ${rupees(kg)} فی کلو` }[l];
      const mandi = marketName(r.mandi, l);
      const what = kind ? ` ${kind}` : '';
      return l === 'en'
        ? `${mandi} ${postedDay(r.rate_date, l)}:${what} ${rupees(r.modal_price)} ${UNIT[r.unit].en}${box}${perKg}`
        : l === 'hi'
          ? `${mandi} में ${postedDay(r.rate_date, l)}:${what} ${rupees(r.modal_price)} ${UNIT[r.unit].hi}${box}${perKg}`
          : `${mandi} میں ${postedDay(r.rate_date, l)}:${what} ${rupees(r.modal_price)} ${UNIT[r.unit].ur}${box}${perKg}`;
    });
    const head = {
      en: `${crop.label.en} rates from the mandis${missed ? ` (none posted from ${place!.label.en}; other mandis)` : ''}: `,
      hi: `${crop.label.hi} के मंडी भाव${missed ? ` (${place!.label.hi} से कोई भाव नहीं आया; दूसरी मंडियाँ)` : ''}: `,
      ur: `${crop.label.ur} کے منڈی بھاؤ${missed ? ` (${place!.label.ur} سے کوئی بھاؤ نہیں آیا؛ دوسری منڈیاں)` : ''}: `,
    }[l];
    const tail = {
      en: '. Posted on KashRoot by approved Mandi Helpers.',
      hi: '। ये भाव KashRoot के मंज़ूर मंडी रिपोर्टरों ने भेजे हैं।',
      ur: '۔ یہ بھاؤ KashRoot کے منظور شدہ منڈی رپورٹروں نے بھیجے ہیں۔',
    }[l];
    return head + lines.join(l === 'ur' ? '؛ ' : '; ') + tail;
  });
}

async function priceAnswer(lang: Lang, crop: Crop, place: Place | undefined, deps: BasicDeps): Promise<BasicAnswer> {
  const posted = deps.posted ? await deps.posted(crop.label.en).catch(() => []) : [];
  const fromReporters = postedAnswer(lang, crop, place, posted);
  if (fromReporters) return fromReporters;

  const state = place?.state ?? 'Jammu and Kashmir';
  let rows: MandiRecord[];
  try {
    rows = (await deps.prices({ commodity: crop.name, state, limit: 200 })).records;
  } catch {
    return answer(lang, (l) => ({
      en: `No ${crop.label.en} rate has been posted on KashRoot in the last few days, and the government mandi price service is not answering, so I can't tell you today's rate. Please check again later.`,
      hi: `पिछले कुछ दिनों में KashRoot पर ${crop.label.hi} का कोई भाव नहीं आया, और सरकारी मंडी भाव सेवा जवाब नहीं दे रही, इसलिए आज का भाव नहीं बता सकता। थोड़ी देर बाद फिर पूछें।`,
      ur: `پچھلے کچھ دنوں میں KashRoot پر ${crop.label.ur} کا کوئی بھاؤ نہیں آیا، اور سرکاری منڈی بھاؤ سروس جواب نہیں دے رہی، اس لیے آج کا بھاؤ نہیں بتا سکتا۔ تھوڑی دیر بعد دوبارہ پوچھیں۔`,
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

/** "This week", "next 7 days", "hafte"…: the whole forecast, day by day. */
const WEEK = ['week', 'weekly', '7 days', 'seven days', 'next few days', 'coming days', 'hafta', 'hafte', 'haftay', 'हफ्ते', 'हफ़्ते', 'हफ्ता', 'सप्ताह', 'ہفتے', 'ہفتہ'];

/** A town named in English after "in / at / for / near" ("weather in Mysuru"), unless it is "my area", "this week"… */
function townIn(query: string): string | null {
  const m = query.trim().match(/\b(?:in|at|for|near)\s+([a-z][a-z .'-]{2,40}?)\s*(?:\?|\.|$|\btoday\b|\btomorrow\b|\bthis week\b|\bnow\b)/i);
  const name = m?.[1]?.trim();
  if (!name || /^(my|our|this|the|today|tomorrow|next|here|spraying|spray|apple|apples|rain|week)\b/i.test(name)) return null;
  return name;
}

async function weatherAnswer(lang: Lang, query: string, place: (typeof PLACES)[number] | undefined, sprayAsked: boolean, deps: BasicDeps, here: Here | undefined): Promise<BasicAnswer> {
  const weekAsked = has(` ${norm(query)} `, WEEK);
  let f: Forecast | null = null;
  let label: Text | null = null;
  /** Said after the forecast: how sure we are of the place. */
  let note: Text | null = null;
  const tryGet = async (get: () => Promise<Forecast | null>) => {
    try {
      return await get();
    } catch {
      return null;
    }
  };
  // 1. A place named in the question; 2. a town named in English; 3. where the person is; 4. Srinagar, asking for their town.
  if (place) {
    f = await tryGet(() => deps.weather(place.name));
    label = place.label;
  } else {
    const town = townIn(query);
    if (town) {
      f = await tryGet(() => deps.weather(town));
      if (f) label = { en: town, hi: town, ur: town };
    }
    if (!f && here && deps.weatherAt) {
      f = await tryGet(() => deps.weatherAt!(here));
      if (f) {
        label = { en: here.name, hi: here.name, ur: here.name };
        if (!here.exact) {
          const st = here.state ?? '';
          note = {
            en: `This is for ${here.name}, the main town of ${st}. For your own district, press "Use my location" or tell me your town.`,
            hi: `यह ${st} के मुख्य शहर ${here.name} का मौसम है। अपने ज़िले का मौसम जानने के लिए "Use my location" दबाएँ या अपने शहर का नाम बताएँ।`,
            ur: `یہ ${st} کے بڑے شہر ${here.name} کا موسم ہے۔ اپنے ضلع کا موسم جاننے کے لیے "Use my location" دبائیں یا اپنے شہر کا نام بتائیں۔`,
          };
        }
      }
    }
    if (!f && !label) {
      f = await tryGet(() => deps.weather('Srinagar'));
      label = { en: 'Srinagar', hi: 'श्रीनगर', ur: 'سرینگر' };
      note = {
        en: 'I do not know your area yet: press "Use my location" above, or tell me your town for local weather.',
        hi: 'मुझे अभी आपका इलाक़ा नहीं पता: ऊपर "Use my location" दबाएँ, या अपने शहर का नाम बताएँ।',
        ur: 'مجھے ابھی آپ کا علاقہ معلوم نہیں: اوپر "Use my location" دبائیں، یا اپنے شہر کا نام بتائیں۔',
      };
    }
  }
  if (!f || !label) {
    return answer(lang, (l) => ({
      en: 'The weather service is not answering right now. Please try again in a little while.',
      hi: 'मौसम सेवा अभी जवाब नहीं दे रही। थोड़ी देर बाद फिर पूछें।',
      ur: 'موسم کی سروس ابھی جواب نہیں دے رہی۔ تھوڑی دیر بعد دوبارہ پوچھیں۔',
    })[l]);
  }
  const fc = f;
  const where = label;
  const t = Math.round(fc.current.temperature);
  const today = fc.daily[0];
  const tomorrow = fc.daily[1];
  const dry = dryHours(fc.current.time, fc.hourly);
  const mm1 = today?.precipitation ?? 0;
  const mm2 = tomorrow?.precipitation ?? 0;
  /** "rain 3.2 mm", or "no rain" — in each language. */
  const rain = (mm: number, l: 'en' | 'hi' | 'ur') =>
    mm < 0.1 ? { en: 'no rain', hi: 'बारिश नहीं', ur: 'بارش نہیں' }[l] : { en: `rain ${mm.toFixed(1)} mm`, hi: `बारिश ${mm.toFixed(1)} मिलीमीटर`, ur: `بارش ${mm.toFixed(1)} ملی میٹر` }[l];
  /** The week, one day after another ("Tue 28: 14° to 27°, no rain"). */
  const week = (l: 'en' | 'hi' | 'ur') =>
    fc.daily
      .slice(0, 7)
      .map((d) => {
        const day = new Date(`${d.date}T12:00:00`).toLocaleDateString(l === 'en' ? 'en-IN' : l === 'hi' ? 'hi-IN' : 'ur-IN', { weekday: 'short', day: 'numeric' });
        const range = { en: `${Math.round(d.min)}° to ${Math.round(d.max)}°`, hi: `${Math.round(d.min)} से ${Math.round(d.max)} डिग्री`, ur: `${Math.round(d.min)} سے ${Math.round(d.max)} ڈگری` }[l];
        return `${day}: ${range}, ${rain(d.precipitation, l)}`;
      })
      .join(l === 'en' ? '; ' : l === 'hi' ? '; ' : '؛ ');
  /** Open-Meteo down: said first, so "now" is never taken as this minute. India time (the server runs in UTC). */
  const kept = (l: 'en' | 'hi' | 'ur') => {
    if (!fc.stale) return '';
    const at = new Date(fc.fetchedAt).toLocaleString(l === 'en' ? 'en-IN' : l === 'hi' ? 'hi-IN' : 'ur-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    return {
      en: `The weather service is not answering, so this is the forecast from ${at}.`,
      hi: `मौसम सेवा अभी जवाब नहीं दे रही, इसलिए यह ${at} का पूर्वानुमान है।`,
      ur: `موسم کی سروس ابھی جواب نہیں دے رہی، اس لیے یہ ${at} کی پیش گوئی ہے۔`,
    }[l];
  };
  return answer(lang, (l) => {
    const parts = {
      en: [
        kept('en'),
        `Weather in ${where.en}: now ${t}°C, humidity ${Math.round(fc.current.humidity)}%.`,
        weekAsked ? `This week — ${week('en')}.` : '',
        !weekAsked && today ? `Today ${Math.round(today.min)}° to ${Math.round(today.max)}°, ${rain(mm1, 'en')}.` : '',
        !weekAsked && tomorrow ? `Tomorrow ${Math.round(tomorrow.min)}° to ${Math.round(tomorrow.max)}°, ${rain(mm2, 'en')}.` : '',
        sprayAsked || mm1 >= 0.1 ? (dry ? `Dry hours for spraying today: ${dry}.` : 'Rain is likely for the rest of today, so better not to spray.') : '',
        note?.en ?? '',
      ],
      hi: [
        kept('hi'),
        `${where.hi} का मौसम: अभी ${t} डिग्री, नमी ${Math.round(fc.current.humidity)} प्रतिशत।`,
        weekAsked ? `इस हफ़्ते — ${week('hi')}।` : '',
        !weekAsked && today ? `आज ${Math.round(today.min)} से ${Math.round(today.max)} डिग्री, ${rain(mm1, 'hi')}।` : '',
        !weekAsked && tomorrow ? `कल ${Math.round(tomorrow.min)} से ${Math.round(tomorrow.max)} डिग्री, ${rain(mm2, 'hi')}।` : '',
        sprayAsked || mm1 >= 0.1 ? (dry ? `आज स्प्रे के लिए सूखा समय: ${dry}।` : 'आज बाक़ी दिन बारिश की संभावना है, इसलिए स्प्रे न करें।') : '',
        note?.hi ?? '',
      ],
      ur: [
        kept('ur'),
        `${where.ur} کا موسم: ابھی ${t} ڈگری، نمی ${Math.round(fc.current.humidity)} فیصد۔`,
        weekAsked ? `اس ہفتے — ${week('ur')}۔` : '',
        !weekAsked && today ? `آج ${Math.round(today.min)} سے ${Math.round(today.max)} ڈگری، ${rain(mm1, 'ur')}۔` : '',
        !weekAsked && tomorrow ? `کل ${Math.round(tomorrow.min)} سے ${Math.round(tomorrow.max)} ڈگری، ${rain(mm2, 'ur')}۔` : '',
        sprayAsked || mm1 >= 0.1 ? (dry ? `آج اسپرے کے لیے خشک وقت: ${dry}۔` : 'آج باقی دن بارش کا امکان ہے، اس لیے اسپرے نہ کریں۔') : '',
        note?.ur ?? '',
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
// "How do I …" / "where is …" — a question about using KashRoot, not about the world.
const HOW = ['how', 'where', 'kaise', 'kese', 'kahan', 'kaha', 'book', 'use', 'kya karun', 'कैसे', 'कहाँ', 'कहां', 'किस तरह', 'کیسے', 'کہاں', 'کس طرح', 'کیتھ پاٹھ', 'کتھ'];

/**
 * Should the instant, data-only answer be used instead of the AI? Only for
 * short questions that are clearly and only about a mandi price, the weather,
 * or how to use a KashRoot feature. Everything else — other topics, mixed or
 * long questions — goes to the AI so the reply matches what was asked.
 */
export function quickIntent(query: string): boolean {
  const q = ` ${norm(query)} `;
  const words = query.trim().split(/\s+/).length;
  if (words > 14) return false;
  const weatherAsked = has(q, SPRAY) || has(q, WEATHER);
  const priceAsked = has(q, PRICE);
  if (weatherAsked && !priceAsked) return words <= 10;
  if (priceAsked && COMMODITIES.some((c) => has(q, c.keys))) return true;
  if (!has(q, HOW)) return false;
  const help = HELP.find((h) => has(q, h.keys));
  if (!help || help === HELP[0]) return false; // crop care, disease, pests: the AI answers
  // "Which fertiliser for walnut?" is crop care; "is this batch fake?" is the check.
  if (help.keys.includes('fertiliser') && !has(q, ['check', 'fake', 'nakli', 'batch', 'genuine', 'asli', 'real', 'registration', 'cir', 'truescan', 'नकली', 'जाँच', 'जांच', 'असली', 'بیچ نمبر', 'جانچ', 'نقلی', 'اصلی'])) return false;
  return true;
}

export async function basicAnswer(query: string, lang: Lang, deps: BasicDeps = defaultDeps, here?: Here): Promise<BasicAnswer> {
  const q = ` ${norm(query)} `;
  const crop = COMMODITIES.find((c) => has(q, c.keys));
  const place = PLACES.find((p) => has(q, p.keys));
  const sprayAsked = has(q, SPRAY);
  const weatherAsked = sprayAsked || has(q, WEATHER);
  const priceAsked = has(q, PRICE);

  if (weatherAsked && !priceAsked) return weatherAnswer(lang, query, place, sprayAsked, deps, here);
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
