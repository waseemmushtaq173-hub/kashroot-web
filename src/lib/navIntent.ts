/**
 * Spoken or typed commands, recognised on the phone itself (no server):
 *
 *   navigationFor — "take me there": "open cold storage", "मंडी भाव दिखाओ",
 *     "کولڈ اسٹور کھولو", "track", "is this pesticide genuine?" — the
 *     assistant opens the page at once.
 *   voiceAction — "do it for me": "walnut rate in Sopore", "track load
 *     KR-8823", "cheapest urea", "Me chhu 50 dabbe seeb sozun", "book cold
 *     storage for 40 bins", "book a load carrier", "escrow ₹2000 for the
 *     plumber" — a page with its form filled in, on a card the person confirms
 *     with one tap. Where KashRoot cannot do what was asked (it books no
 *     trucks and holds no money) the card says so and offers the right page.
 *
 * A question about how to do something ("how do I book cold storage?") is
 * neither: it is answered. The …FromLink helpers read the filled-in values
 * back on those pages. Safe on the server and in the browser.
 */
import { MARKET_PLACES } from '@/lib/auth/roles';
import type { ListingInput } from '@/lib/db/market';
import { ksText } from '@/lib/kashmiri/phrases';
import { cropIn, cropNamed, hasName, type Crop } from '@/lib/region';
import { has, hasWord, norm } from '@/lib/textMatch';

type Lang = 'en' | 'hi' | 'ur' | 'ks';
type Text = { en: string; hi: string; ur: string };

const VERBS = [
  'open', 'go to', 'goto', 'show', 'take me', 'start', 'launch', 'track my', 'track a',
  'khol', 'kholo', 'dikhao', 'dikha', 'chalo', 'le chalo', 'jao',
  'खोल', 'दिखा', 'चलो', 'ले चल', 'जाओ', 'जाएं',
  'کھول', 'دکھا', 'چلو', 'لے چل', 'جاؤ', 'جائیں', 'ہاو', 'تلو',
];
const QUESTION = [
  'how', 'what', 'when', 'why', 'which', 'kaise', 'kya', 'kab', 'kitna', 'kyun',
  'कैसे', 'क्या', 'कब', 'कितना', 'कितने', 'क्यों', 'کیسے', 'کیا', 'کب', 'کتنا', 'کتنے', 'کیوں', 'کتھ', 'کیاہ', 'کونس', '?', '؟',
];

/** A crop or a town means "tell me", not "open the page": the assistant answers instead. */
const SPECIFIC = [
  ' in ', ' at ', ' में ', ' میں ', ' منز ',
  'apple', 'seb', 'सेब', 'سیب', 'walnut', 'akhrot', 'अखरोट', 'اخروٹ', 'almond', 'badam', 'बादाम', 'بادام', 'cherry', 'चेरी', 'چیری',
  'pear', 'नाशपाती', 'ناشپاتی', 'rice', 'चावल', 'چاول', 'potato', 'आलू', 'آلو', 'onion', 'प्याज', 'پیاز', 'tomato', 'टमाटर', 'ٹماٹر',
  'srinagar', 'श्रीनगर', 'سرینگر', 'sopore', 'सोपोर', 'سوپور', 'shopian', 'शोपियां', 'شوپیان', 'baramulla', 'बारामूला', 'بارہمولہ',
  'pulwama', 'पुलवामा', 'پلوامہ', 'anantnag', 'अनंतनाग', 'اننت ناگ', 'kulgam', 'کولگام', 'budgam', 'بڈگام', 'jammu', 'जम्मू', 'جموں', 'delhi', 'दिल्ली', 'دہلی',
];

const TRUESCAN: Text = { en: 'KashRoot TrueScan', hi: 'KashRoot TrueScan (खाद-दवा की जाँच)', ur: 'KashRoot TrueScan (کھاد دوائی کی جانچ)' };

const PLACES: { href: string; label: Text; keys: string[] }[] = [
  { href: '/compare-prices?tab=orders', label: { en: 'your orders', hi: 'आपके ऑर्डर', ur: 'آپ کے آرڈر' }, keys: ['my orders', 'my order', 'mere order', 'मेरे ऑर्डर', 'میرے آرڈر'] },
  { href: '/farmer/dashboard?tab=lots&add=1', label: { en: 'List produce', hi: 'फ़सल बेचना', ur: 'فصل بیچنا' }, keys: ['sell', 'list produce', 'bech', 'बेच', 'بیچ', 'فروخت'] },
  { href: '/rental/dashboard', label: { en: 'cold storage booking', hi: 'कोल्ड स्टोरेज बुकिंग', ur: 'کولڈ اسٹوریج بکنگ' }, keys: ['cold', 'storage', 'chamber', 'कोल्ड', 'स्टोर', 'چیمبر', 'کولڈ', 'اسٹور', 'سٹور'] },
  { href: '/tracking/dashboard', label: { en: 'tracking', hi: 'ट्रैकिंग', ur: 'ٹریکنگ' }, keys: ['track', 'truck', 'consignment', 'ट्रक', 'ट्रैक', 'ٹرک', 'ٹریک'] },
  { href: '/supplies/tester', label: TRUESCAN, keys: ['truescan', 'true scan', 'fertiliser', 'fertilizer', 'pesticide', 'khad', 'खाद', 'दवा', 'کھاد', 'دوائی'] },
  { href: '/farmer/orchard-health', label: { en: 'Orchard Health', hi: 'बाग़ की सेहत', ur: 'باغ کی صحت' }, keys: ['orchard', 'scab', 'spray log', 'photo diagnosis', 'बाग', 'स्कैब', 'باغ', 'اسکیب'] },
  { href: '/expert', label: { en: 'Ask an expert', hi: 'विशेषज्ञ से पूछें', ur: 'ماہر سے پوچھیں' }, keys: ['expert', 'agronomist', 'advisory', 'doctor', 'video call', 'soil test', 'विशेषज्ञ', 'सलाह', 'ماہر', 'مشورہ'] },
  { href: '/mandi-weather', label: { en: 'mandi rates and weather', hi: 'मंडी भाव और मौसम', ur: 'منڈی بھاؤ اور موسم' }, keys: ['mandi', 'rates', 'prices', 'bhav', 'weather', 'mausam', 'मंडी', 'भाव', 'मौसम', 'منڈی', 'بھاؤ', 'موسم'] },
  { href: '/compare-prices', label: { en: 'Price Comparison', hi: 'भाव तुलना', ur: 'قیمتوں کا موازنہ' }, keys: ['compare', 'price comparison', 'तुलना', 'موازنہ'] },
  // Farm tools and supplies have their own shop: checked before "buy", so "open kissan tools shop" lands there.
  { href: '/kissan-tools/dashboard', label: { en: 'Kissan Tools', hi: 'किसान टूल्स', ur: 'کسان ٹولز' }, keys: ['kissan', 'kisan', 'farm tools', 'tools', 'किसान टूल', 'کسان ٹول'] },
  // "Open buyer portal" opens the portal itself, not straight into its shop.
  { href: '/buyer/dashboard', label: { en: 'the Buyer portal', hi: 'ख़रीदार पोर्टल', ur: 'خریدار پورٹل' }, keys: ['buyer', 'ख़रीदार', 'खरीदार', 'خریدار'] },
  // Buying produce happens in the Buyer portal (its own sign-in first).
  { href: '/buyer/dashboard?tab=shop', label: { en: 'Buy apples & produce', hi: 'सेब और फ़सल ख़रीदना', ur: 'سیب اور فصل خریدنا' }, keys: ['buy', 'kharid', 'खरीद', 'ख़रीद', 'خرید'] },
  { href: '/farmer/season-planner', label: { en: 'the season planner', hi: 'सीज़न प्लानर', ur: 'سیزن پلانر' }, keys: ['planner', 'season', 'प्लानर', 'پلانر'] },
  { href: '/', label: { en: 'the home page', hi: 'होम पेज', ur: 'ہوم پیج' }, keys: ['home', 'होम', 'ہوم'] },
];

// "Is this pesticide genuine?", "check this fertiliser", "यह खाद असली है?" → KashRoot TrueScan.
const INPUT_WORDS = ['fertiliser', 'fertilizer', 'pesticide', 'fungicide', 'insecticide', 'khad', 'khaad', 'dawai', 'खाद', 'दवा', 'कीटनाशक', 'کھاد', 'دوائی', 'دوا'];
const GENUINE_WORDS = ['genuine', 'real', 'fake', 'check', 'original', 'registered', 'truescan', 'asli', 'nakli', 'jaanch', 'janch', 'असली', 'नकली', 'जाँच', 'जांच', 'اصلی', 'نقلی', 'جانچ'];

export interface NavCommand {
  href: string;
  /** What to say while going there, in the person's language. */
  say: string;
  /** The same in Devanagari, for phones with only a Hindi voice (Urdu/Kashmiri). */
  speech?: string;
}

function going(place: { href: string; label: Text }, lang: Lang): NavCommand {
  if (lang === 'ks') return { href: place.href, say: ksText('nav.opening', { place: place.label.ur }) };
  const say = { en: `Opening ${place.label.en}.`, hi: `${place.label.hi} खोल रहे हैं।`, ur: `${place.label.ur} کھول رہے ہیں۔` }[lang];
  const hi = `${place.label.hi} खोल रहे हैं।`;
  return { href: place.href, say, ...(lang === 'ur' ? { speech: hi } : {}) };
}

export function navigationFor(text: string, lang: Lang): NavCommand | null {
  const q = ` ${norm(text)} `;
  // Asking whether a fertiliser or spray is genuine is a check to run, even as a question.
  if (hasWord(q, INPUT_WORDS) && hasWord(q, GENUINE_WORDS) && !hasWord(q, HOW) && !hasWord(q, PRICE)) return going({ href: '/supplies/tester', label: TRUESCAN }, lang);
  if (has(q, QUESTION)) return null;
  const place = PLACES.find((p) => has(q, p.keys));
  if (!place) return null;
  if (place.href === '/mandi-weather' && has(q, SPECIFIC)) return null;
  const words = text.trim().split(/\s+/).length;
  // "open cold storage" / "mandi dikhao" — or just the place's name, said on its own.
  if (!has(q, VERBS) && words > 2) return null;
  return going(place, lang);
}

/* ── actions ── */

/** "How do I …": answered, never acted on. */
const HOW = ['how', 'kaise', 'kese', 'kaisay', 'कैसे', 'کیسے', 'کتھ'];
const PRICE = ['price', 'rate', 'bhav', 'bhaav', 'bhao', 'daam', 'qeemat', 'keemat', 'kimat', 'mandi', 'market', 'भाव', 'दाम', 'मंडी', 'कीमत', 'क़ीमत', 'रेट', 'قیمت', 'بھاؤ', 'بھاو', 'منڈی', 'ریٹ', 'دام'];
const BOOK = ['book', 'booking', 'hire', 'reserve', 'need', 'want', 'chahiye', 'chaiye', 'buk', 'बुक', 'बुकिंग', 'चाहिए', 'بک کر', 'بکنگ', 'چاہیے', 'چاہئے'];
const COLD = ['cold storage', 'cold store', 'cold room', 'ca store', 'storage', 'कोल्ड', 'स्टोरेज', 'کولڈ', 'اسٹوریج', 'سٹوریج'];
const TRANSPORT = ['load carrier', 'carrier', 'transport', 'transporter', 'truck', 'lorry', 'tempo', 'pickup', 'gaadi', 'gadi', 'ट्रक', 'गाड़ी', 'गाडी', 'ट्रांसपोर्ट', 'टेम्पो', 'ٹرک', 'گاڑی', 'ٹرانسپورٹ', 'ٹیمپو'];
const SELL = ['sell', 'send', 'list', 'bech', 'bechna', 'bechni', 'bechne', 'sozun', 'soozun', 'sozan', 'kinun', 'बेच', 'भेज', 'بیچ', 'فروخت', 'بھیج', 'سوزن', 'کنن'];
const BUY = ['buy', 'purchase', 'kharid', 'kharidna', 'khareed', 'khareedna', 'mangwa', 'mangwana', 'खरीद', 'ख़रीद', 'मंगवा', 'خرید', 'منگوا', 'ہیون'];
const CHEAP = ['cheapest', 'cheap', 'lowest', 'best price', 'sasta', 'sasti', 'saste', 'sabse kam', 'सस्ता', 'सस्ती', 'सस्ते', 'सबसे कम', 'سستا', 'سستی', 'سستے', 'سب سے کم'];
const FIND = ['find', 'search', 'dhoondo', 'dhundo', 'where can i', 'kahan milega', 'kahan milegi', 'ढूंढ', 'ढूँढ', 'कहाँ मिल', 'कहां मिल', 'ڈھونڈ', 'کہاں مل'];
const ESCROW = ['escrow', 'pay after delivery', 'एस्क्रो', 'ایسکرو'];
const PAY = ['pay', 'payment', 'bhugtan', 'paisa', 'paise', 'भुगतान', 'पैसे', 'पेमेंट', 'ادائیگی', 'پیسے', 'پیمنٹ'];

/** Supplies people ask for by name, and what to search for. */
const SUPPLIES: { q: string; keys: string[] }[] = [
  { q: 'Urea', keys: ['urea', 'यूरिया', 'یوریا'] },
  { q: 'DAP', keys: ['dap', 'डीएपी', 'ڈی اے پی'] },
  { q: 'Fungicide', keys: ['fungicide', 'फफूंदनाशक'] },
  { q: 'Pesticide', keys: ['pesticide', 'insecticide', 'dawai', 'dawa', 'कीटनाशक', 'दवाई', 'दवा', 'دوائی', 'دوا'] },
  { q: 'Fertiliser', keys: ['fertiliser', 'fertilizer', 'khad', 'khaad', 'खाद', 'کھاد'] },
  { q: 'Sprayer', keys: ['sprayer', 'spray pump', 'स्प्रेयर', 'اسپریئر'] },
  { q: 'Carton', keys: ['carton', 'corrugated box', 'कार्टन', 'کارٹن'] },
  { q: 'Anti-hail net', keys: ['hail net', 'anti hail', 'jaal', 'जाल', 'جال'] },
  { q: 'Ladder', keys: ['ladder', 'सीढ़ी', 'سیڑھی'] },
  { q: 'Seeds', keys: ['seed', 'beej', 'बीज', 'بیج'] },
  { q: 'Saplings', keys: ['sapling', 'paudh', 'पौध', 'پودے'] },
];

/** Mandis and towns people name, with their state. */
const MARKETS: { name: string; state: string; label: Text; keys: string[] }[] = [
  { name: 'Srinagar', state: 'Jammu and Kashmir', label: { en: 'Srinagar', hi: 'श्रीनगर', ur: 'سرینگر' }, keys: ['srinagar', 'parimpora', 'श्रीनगर', 'سرینگر', 'سری نگر', 'پارمپورہ'] },
  { name: 'Sopore', state: 'Jammu and Kashmir', label: { en: 'Sopore', hi: 'सोपोर', ur: 'سوپور' }, keys: ['sopore', 'सोपोर', 'سوپور'] },
  { name: 'Shopian', state: 'Jammu and Kashmir', label: { en: 'Shopian', hi: 'शोपियां', ur: 'شوپیان' }, keys: ['shopian', 'शोपियां', 'शोपियन', 'شوپیان', 'شوپیاں'] },
  { name: 'Baramulla', state: 'Jammu and Kashmir', label: { en: 'Baramulla', hi: 'बारामूला', ur: 'بارہمولہ' }, keys: ['baramulla', 'baramula', 'बारामूला', 'बारामुला', 'بارہمولہ', 'بارامولہ'] },
  { name: 'Pulwama', state: 'Jammu and Kashmir', label: { en: 'Pulwama', hi: 'पुलवामा', ur: 'پلوامہ' }, keys: ['pulwama', 'पुलवामा', 'پلوامہ'] },
  { name: 'Anantnag', state: 'Jammu and Kashmir', label: { en: 'Anantnag', hi: 'अनंतनाग', ur: 'اننت ناگ' }, keys: ['anantnag', 'अनंतनाग', 'اننت ناگ', 'اننتناگ'] },
  { name: 'Kulgam', state: 'Jammu and Kashmir', label: { en: 'Kulgam', hi: 'कुलगाम', ur: 'کولگام' }, keys: ['kulgam', 'कुलगाम', 'کولگام'] },
  { name: 'Budgam', state: 'Jammu and Kashmir', label: { en: 'Budgam', hi: 'बडगाम', ur: 'بڈگام' }, keys: ['budgam', 'बडगाम', 'بڈگام'] },
  { name: 'Ganderbal', state: 'Jammu and Kashmir', label: { en: 'Ganderbal', hi: 'गांदरबल', ur: 'گاندربل' }, keys: ['ganderbal', 'गांदरबल', 'گاندربل'] },
  { name: 'Kupwara', state: 'Jammu and Kashmir', label: { en: 'Kupwara', hi: 'कुपवाड़ा', ur: 'کپواڑہ' }, keys: ['kupwara', 'handwara', 'कुपवाड़ा', 'کپواڑہ', 'ہندواڑہ'] },
  { name: 'Bandipora', state: 'Jammu and Kashmir', label: { en: 'Bandipora', hi: 'बांदीपोरा', ur: 'بانڈی پورہ' }, keys: ['bandipora', 'बांदीपोरा', 'بانڈی پورہ', 'بانڈیپورہ'] },
  { name: 'Jammu', state: 'Jammu and Kashmir', label: { en: 'Jammu', hi: 'जम्मू', ur: 'جموں' }, keys: ['jammu', 'narwal', 'जम्मू', 'جموں'] },
  { name: 'Kathua', state: 'Jammu and Kashmir', label: { en: 'Kathua', hi: 'कठुआ', ur: 'کٹھوعہ' }, keys: ['kathua', 'कठुआ', 'کٹھوعہ'] },
  { name: 'Delhi', state: 'Delhi', label: { en: 'Delhi', hi: 'दिल्ली', ur: 'دہلی' }, keys: ['delhi', 'dilli', 'azadpur', 'दिल्ली', 'आज़ादपुर', 'دہلی', 'دلی', 'آزادپور'] },
  { name: 'Shimla', state: 'Himachal Pradesh', label: { en: 'Shimla', hi: 'शिमला', ur: 'شملہ' }, keys: ['shimla', 'शिमला', 'شملہ'] },
];

// ── numbers and amounts ──

/** Devanagari and Urdu digits as 0-9. */
const asciiDigits = (s: string) =>
  s
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** Numbers said in words: English, Hindi / Urdu (romanised and in their scripts) and Kashmiri. */
const NUMBER_WORDS: Record<string, number> = Object.fromEntries(
  ([
    [1, 'one ek एक ایک akh اکھ'], [2, 'two do दो دو zah'], [3, 'three teen तीन تین'], [4, 'four char chaar चार چار tsor ژور'],
    [5, 'five panch paanch पांच पाँच پانچ pantsh پانژھ'], [6, 'six chhe chhah छह छः چھ چھے'], [7, 'seven saat सात سات'], [8, 'eight aath आठ آٹھ'],
    [9, 'nine nau नौ نو'], [10, 'ten das दस دس dah داہ'], [11, 'eleven gyarah ग्यारह گیارہ'], [12, 'twelve barah बारह بارہ'], [15, 'fifteen pandrah पंद्रह پندرہ'],
    [20, 'twenty bees बीस بیس wuh'], [25, 'twentyfive pachchis pachis पच्चीस پچیس'], [30, 'thirty tees तीस تیس'], [40, 'forty chalis chalees chaalis चालीस چالیس'],
    [50, 'fifty pachas pachaas पचास پچاس pantsah پانژاہ'], [60, 'sixty saath साठ ساٹھ'], [70, 'seventy sattar सत्तर ستر'], [80, 'eighty assi अस्सी اسی'],
    [90, 'ninety nabbe नब्बे نوے'], [100, 'hundred sau सौ سو hath ہتھ'], [1000, 'thousand hazar hazaar hajar हज़ार हजार ہزار saas ساس'],
  ] as const).flatMap(([n, words]) => words.split(' ').map((w) => [norm(w), n] as const)),
);

type Unit = 'box' | 'bin' | 'crate' | 'kg' | 'quintal' | 'bag' | 'tonne';
const UNIT_WORDS: Record<Unit, string> = {
  box: 'box boxes peti petti petiyan pettiyan dabba dabbe dabbay dabbey carton cartons पेटी पेटियां पेटियाँ पेटियों डिब्बा डिब्बे डिब्बों پیٹی پیٹیاں پیٹیوں ڈبہ ڈبے ڈبوں دبہ دبے',
  bin: 'bin bins बिन بن بنز',
  crate: 'crate crates क्रेट کریٹ کریٹس',
  kg: 'kg kgs kilo kilos kilogram kilograms किलो کلو کلوگرام',
  quintal: 'quintal quintals qtl क्विंटल کوئنٹل کونٹل',
  bag: 'bag bags bori boriyan बोरी बोरियां بوری بوریاں',
  tonne: 'ton tons tonne tonnes टन ٹن',
};
const UNIT_OF = new Map<string, Unit>(Object.entries(UNIT_WORDS).flatMap(([unit, words]) => words.split(' ').map((w) => [norm(w), unit as Unit] as const)));

const tokensOf = (text: string) =>
  norm(asciiDigits(text))
    .replace(/(\d),(?=\d{2,3}\b)/g, '$1')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .split(/[^\p{L}\p{M}\p{N}₹]+/u)
    .filter(Boolean);

/** The number said just before position `end` ("50", "fifty five", "do sau"), or null. */
function numberBefore(tokens: string[], end: number): number | null {
  const words: string[] = [];
  for (let i = end - 1; i >= 0 && words.length < 5; i--) {
    if (/^\d+$/.test(tokens[i]) || NUMBER_WORDS[tokens[i]] !== undefined) words.unshift(tokens[i]);
    else break;
  }
  if (!words.length) return null;
  let total = 0;
  let current = 0;
  for (const w of words) {
    const v = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w];
    if (v === 100) current = (current || 1) * 100;
    else if (v === 1000) {
      total += (current || 1) * 1000;
      current = 0;
    } else current += v;
  }
  const n = total + current;
  return n > 0 && n <= 10_000_000 ? n : null;
}

interface Quantity {
  n: number;
  /** null: a bare number, nothing said after it. */
  unit: Exclude<Unit, 'tonne'> | null;
}

/** "50 boxes", "pachaas peti", "40 bins", "2 tonnes" (as 20 quintals) — or a bare number. */
function quantityIn(text: string): Quantity | null {
  const tokens = tokensOf(text);
  for (let i = 0; i < tokens.length; i++) {
    const unit = UNIT_OF.get(tokens[i]);
    if (!unit) continue;
    const n = numberBefore(tokens, i);
    if (n) return unit === 'tonne' ? { n: n * 10, unit: 'quintal' } : { n, unit };
  }
  const bare = tokens.find((t) => /^\d+$/.test(t));
  return bare && Number(bare) > 0 ? { n: Number(bare), unit: null } : null;
}

const RUPEE_WORDS = new Set(['rupees', 'rupee', 'rupaye', 'rupay', 'rupaiye', 'rs', 'inr', 'रुपये', 'रुपए', 'रुपया', 'روپے', 'روپیہ', 'روپئے'].map(norm));

/** "₹2000", "Rs 2,000", "2000 rupees", "do hazaar rupaye". */
function amountIn(text: string): number | null {
  const tokens = tokensOf(text.replace(/₹\s*/g, '₹ '));
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '₹' || tokens[i] === 'rs' || tokens[i] === 'inr') {
      const after = tokens[i + 1];
      if (after && /^\d+$/.test(after)) return Number(after);
    }
    if (RUPEE_WORDS.has(tokens[i])) {
      const n = numberBefore(tokens, i);
      if (n) return n;
    }
  }
  return null;
}

/** "KR-8823", "kr 88 23", "केआर 8823" → "KR-8823". A KashRoot code always has a digit. */
function trackCodeIn(text: string): string | null {
  const t = asciiDigits(text);
  const m = t.toUpperCase().match(/(?:^|[^A-Z0-9])K\s?R[\s-]*([A-Z0-9]{2,10}(?:\s\d{2,})*)(?![A-Z0-9])/) ?? t.match(/(?:के\s?आर|کے\s?آر)[\s-]*([0-9A-Za-z]{2,10}(?:\s\d{2,})*)/);
  // "book kr do 500 boxes" is Hinglish "kar", not a code: the code's first part has a digit.
  const head = m?.[1]?.split(/\s/)[0] ?? '';
  const code = m?.[1]?.replace(/\s/g, '').toUpperCase();
  return code && code.length >= 4 && /\d/.test(head) ? `KR-${code}` : null;
}

/** "tomorrow morning", "kal subah", "کل صبح", "pagah" — said with a booking. */
function whenIn(q: string): Text | null {
  const day = hasName(q, ['tomorrow', 'kal', 'pagah', 'कल', 'کل', 'پگاہ']) ? { en: 'tomorrow', hi: 'कल', ur: 'کل' } : hasName(q, ['today', 'aaj', 'az', 'आज', 'آج', 'اَز']) ? { en: 'today', hi: 'आज', ur: 'آج' } : null;
  const part = hasName(q, ['morning', 'subah', 'subha', 'सुबह', 'صبح']) ? { en: 'morning', hi: 'सुबह', ur: 'صبح' } : hasName(q, ['evening', 'shaam', 'sham', 'शाम', 'شام']) ? { en: 'evening', hi: 'शाम', ur: 'شام' } : null;
  if (!day && !part) return null;
  const join = (a?: string, b?: string) => [a, b].filter(Boolean).join(' ');
  return { en: join(day?.en, part?.en), hi: join(day?.hi, part?.hi), ur: join(day?.ur, part?.ur) };
}

// ── what the card shows ──

const FIELD: Record<'crop' | 'market' | 'code' | 'search' | 'quantity' | 'from' | 'to' | 'load', Text> = {
  crop: { en: 'crop', hi: 'फ़सल', ur: 'فصل' },
  market: { en: 'market', hi: 'मंडी', ur: 'منڈی' },
  code: { en: 'code', hi: 'कोड', ur: 'کوڈ' },
  search: { en: 'search', hi: 'खोज', ur: 'تلاش' },
  quantity: { en: 'quantity', hi: 'मात्रा', ur: 'مقدار' },
  from: { en: 'from', hi: 'कहाँ से', ur: 'کہاں سے' },
  to: { en: 'to', hi: 'कहाँ तक', ur: 'کہاں تک' },
  load: { en: 'load', hi: 'माल', ur: 'مال' },
};

const UNIT_TEXT: Record<Exclude<Unit, 'tonne'>, { one: string; many: string; hi: string; ur: string }> = {
  box: { one: 'box', many: 'boxes', hi: 'पेटी', ur: 'پیٹی' },
  bin: { one: 'bin', many: 'bins', hi: 'बिन', ur: 'بِن' },
  crate: { one: 'crate', many: 'crates', hi: 'क्रेट', ur: 'کریٹ' },
  kg: { one: 'kg', many: 'kg', hi: 'किलो', ur: 'کلو' },
  quintal: { one: 'quintal', many: 'quintals', hi: 'क्विंटल', ur: 'کوئنٹل' },
  bag: { one: 'bag', many: 'bags', hi: 'बोरी', ur: 'بوری' },
};

const amountText = (q: Quantity): Text => {
  const n = q.n.toLocaleString('en-IN');
  if (!q.unit) return { en: n, hi: n, ur: n };
  const u = UNIT_TEXT[q.unit];
  return { en: `${n} ${q.n === 1 ? u.one : u.many}`, hi: `${n} ${u.hi}`, ur: `${n} ${u.ur}` };
};
const same = (s: string): Text => ({ en: s, hi: s, ur: s });

const PAGE: Record<'mandi' | 'track' | 'compare' | 'buyer' | 'supplies' | 'sell' | 'cold' | 'consignment' | 'escrow', Text> = {
  mandi: { en: 'mandi rates & weather', hi: 'मंडी भाव और मौसम', ur: 'منڈی بھاؤ اور موسم' },
  track: { en: 'Tracking', hi: 'ट्रैकिंग', ur: 'ٹریکنگ' },
  compare: { en: 'Price Comparison (cheapest first)', hi: 'भाव तुलना (सबसे सस्ता पहले)', ur: 'قیمتوں کا موازنہ (سب سے سستا پہلے)' },
  buyer: { en: 'Buy apples & produce (Buyer portal)', hi: 'Buy apples & produce (ख़रीदार पोर्टल)', ur: 'Buy apples & produce (خریدار پورٹل)' },
  supplies: { en: 'the Shop (Kissan Tools)', hi: 'Shop (किसान टूल्स)', ur: 'Shop (کسان ٹولز)' },
  sell: { en: 'List produce (Farmer portal)', hi: 'List produce (किसान पोर्टल)', ur: 'List produce (کسان پورٹل)' },
  cold: { en: 'Cold Storage booking', hi: 'कोल्ड स्टोरेज बुकिंग', ur: 'کولڈ اسٹوریج بکنگ' },
  consignment: { en: 'New consignment (Tracking portal)', hi: 'New consignment (ट्रैकिंग पोर्टल)', ur: 'New consignment (ٹریکنگ پورٹل)' },
  escrow: { en: 'the escrow payment page', hi: 'एस्क्रो भुगतान वाला पेज', ur: 'ایسکرو ادائیگی والا صفحہ' },
};

export interface VoiceAction {
  kind: 'mandi' | 'track' | 'shop' | 'sell' | 'cold' | 'transport' | 'escrow';
  href: string;
  /** The page it opens, as people know it. */
  page: Text;
  /** What is filled in there. */
  fields: { field: Text; value: Text }[];
  /** Said first when KashRoot cannot do exactly what was asked. */
  note?: Text;
  /** A price question: the assistant answers it too, and the card follows. */
  answer?: boolean;
}

const link = (path: string, params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}${path.includes('?') ? '&' : '?'}${s}` : path;
};

/** Leftover words of an English request, as a search ("find the cheapest captan near me" → "captan"). */
const FILLER = new Set('find search the a an any cheapest cheap lowest best price prices rate shop shops store stores near me my selling sells sell buy purchase order to for of i want need where can get some please show from in at is who which what and with online good dukan sabse sasta sasti kahan milega milegi ke ka ki liye hai chahiye kharidna khareedna mujhe'.split(' '));
function leftover(text: string): string | null {
  if (/[^\x00-\x7F₹]/.test(text)) return null;
  const words = text.toLowerCase().replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w));
  return words.length >= 1 && words.length <= 4 ? words.join(' ') : null;
}

/**
 * What a spoken or typed request asks KashRoot to do, if it is one of the
 * actions it can prepare; null for anything else (the assistant answers it).
 */
export function voiceAction(text: string): VoiceAction | null {
  const said = text.trim();
  if (!said || said.length > 300) return null;
  const q = ` ${norm(asciiDigits(said))} `;
  const howTo = hasWord(q, HOW);
  const crop = cropIn(q);
  const market = MARKETS.find((m) => hasName(q, m.keys));
  const qty = quantityIn(said);

  // Track a load by its code — a question ("where is KR-8823?") too.
  const code = trackCodeIn(said);
  if (code) return { kind: 'track', href: link('/tracking/dashboard', { code }), page: PAGE.track, fields: [{ field: FIELD.code, value: same(code) }] };

  // Escrow / paying an amount: KashRoot holds no money, so say what escrow payment is.
  const amount = amountIn(said);
  if (amount && (hasWord(q, ESCROW) || hasWord(q, PAY)) && !howTo) {
    const rs = `₹${amount.toLocaleString('en-IN')}`;
    const who = said.match(/\bfor (?:the |my |a |our )?([a-z]+)\b/i)?.[1]?.toLowerCase();
    const person = who && !['order', 'goods', 'apples', 'produce', 'it', 'this', 'that'].includes(who) ? who : null;
    return {
      kind: 'escrow',
      href: '/escrow',
      page: PAGE.escrow,
      fields: [],
      note: {
        en: `KashRoot does not hold money. Escrow payment on KashRoot only means pay-after-delivery for orders placed on KashRoot: you pay the seller directly by UPI after the goods arrive. ${person ? `To pay ${rs} to the ${person}, pay them directly from your UPI app.` : `To pay ${rs} to someone outside KashRoot, pay them directly from your UPI app.`}`,
        hi: `KashRoot पैसा अपने पास नहीं रखता। KashRoot पर एस्क्रो भुगतान का मतलब बस इतना है कि KashRoot पर दिए गए ऑर्डर का पैसा सामान पहुँचने के बाद दिया जाता है: आप विक्रेता को सीधे UPI से भुगतान करते हैं। KashRoot के बाहर किसी को ${rs} देने हैं तो अपने UPI ऐप से सीधे भुगतान करें।`,
        ur: `KashRoot پیسہ اپنے پاس نہیں رکھتا۔ KashRoot پر ایسکرو ادائیگی کا مطلب بس یہ ہے کہ KashRoot پر دیے گئے آرڈر کی ادائیگی سامان پہنچنے کے بعد ہوتی ہے: آپ بیچنے والے کو سیدھے UPI سے ادائیگی کرتے ہیں۔ KashRoot کے باہر کسی کو ${rs} دینے ہیں تو اپنے UPI ایپ سے سیدھے ادائیگی کریں۔`,
      },
    };
  }
  if (howTo) return null;

  // "Book a load carrier for tomorrow morning": KashRoot books no trucks — it records and tracks the load.
  if (hasWord(q, TRANSPORT) && (hasWord(q, BOOK) || hasWord(q, SELL) || hasWord(q, FIND) || hasWord(q, CHEAP))) {
    const places = MARKETS.filter((m) => hasName(q, m.keys)).sort((a, b) => firstAt(q, a.keys) - firstAt(q, b.keys));
    const [from, to] = places.length >= 2 ? places : [undefined, places.length === 1 && hasWord(q, ['to', 'tak', 'तक', 'تک']) ? places[0] : undefined];
    const load = qty?.unit ? `${amountText(qty).en}${crop ? ` ${crop.name}` : ''}` : crop?.name;
    const when = whenIn(q);
    const fields = [
      ...(from ? [{ field: FIELD.from, value: from.label }] : []),
      ...(to ? [{ field: FIELD.to, value: to.label }] : []),
      ...(load ? [{ field: FIELD.load, value: same(load) }] : []),
    ];
    return {
      kind: 'transport',
      href: link('/tracking/dashboard?tab=mine', { from: from?.name, to: to?.name, cargo: load }),
      page: PAGE.consignment,
      fields,
      note: {
        en: `KashRoot does not find or book trucks. It records your load and shows it live once you have a truck: arrange the truck with your transporter${when ? ` for ${when.en}` : ''}, then create the consignment and send the driver the link.`,
        hi: `KashRoot ट्रक नहीं ढूँढता और बुक भी नहीं करता। ट्रक मिलने के बाद यह आपका माल दर्ज करता है और रास्ते में दिखाता है: ट्रक अपने ट्रांसपोर्टर से तय करें${when ? ` (${when.hi})` : ''}, फिर consignment बनाएँ और ड्राइवर को लिंक भेजें।`,
        ur: `KashRoot ٹرک نہیں ڈھونڈتا اور بک بھی نہیں کرتا۔ ٹرک ملنے کے بعد یہ آپ کا مال درج کرتا ہے اور راستے میں دکھاتا ہے: ٹرک اپنے ٹرانسپورٹر سے طے کریں${when ? ` (${when.ur})` : ''}، پھر consignment بنائیں اور ڈرائیور کو لنک بھیجیں۔`,
      },
    };
  }

  // "Book cold storage for 40 bins".
  if (hasWord(q, COLD) && (hasWord(q, BOOK) || hasWord(q, FIND) || hasWord(q, CHEAP) || qty)) {
    const want = qty && (qty.unit === null || qty.unit === 'bin' || qty.unit === 'crate' || qty.unit === 'box') ? qty : null;
    return {
      kind: 'cold',
      href: link('/rental/dashboard?tab=cold', { want: want?.n, unit: want?.unit }),
      page: PAGE.cold,
      fields: want ? [{ field: FIELD.quantity, value: amountText(want) }] : [],
    };
  }

  // "Find the cheapest shop near me selling urea", "buy walnuts", "सबसे कम दाम में इलायची".
  const supply = SUPPLIES.find((s) => hasName(q, s.keys));
  const cheap = hasWord(q, CHEAP);
  if (cheap || hasWord(q, BUY) || (hasWord(q, FIND) && !hasWord(q, PRICE))) {
    const what = crop ? { q: crop.name, value: crop.label } : supply ? { q: supply.q, value: same(supply.q) } : (() => {
      // Anything else they name, in English: "where can I buy captan".
      const free = cheap || hasWord(q, BUY) ? leftover(said) : null;
      return free ? { q: free, value: same(free) } : null;
    })();
    if (what) {
      const produce = Boolean(crop);
      // Produce is bought in the Buyer portal's shop, farm supplies in the Kissan Tools shop; "cheapest" anything on Price Comparison.
      const buyer = produce && !cheap;
      const shop = !produce && !cheap;
      return {
        kind: 'shop',
        href: buyer ? link(MARKET_PLACES.buyProduce.href, { q: what.q }) : shop ? MARKET_PLACES.farmSupplies.href : link('/compare-prices', { category: produce ? 'produce' : 'supplies', q: what.q }),
        page: buyer ? PAGE.buyer : shop ? PAGE.supplies : PAGE.compare,
        fields: [{ field: FIELD.search, value: what.value }],
      };
    }
  }

  // "Sell 50 boxes of apples", "Me chhu 50 dabbe seeb sozun".
  if (hasWord(q, SELL) && (crop || qty?.unit)) {
    const listable = qty && (qty.unit === null || qty.unit === 'box' || qty.unit === 'kg' || qty.unit === 'quintal' || qty.unit === 'bag') ? qty : null;
    return {
      kind: 'sell',
      href: link('/farmer/dashboard?tab=lots&add=1', { crop: crop?.name, qty: listable?.n, unit: listable?.unit }),
      page: PAGE.sell,
      fields: [...(crop ? [{ field: FIELD.crop, value: crop.label }] : []), ...(listable ? [{ field: FIELD.quantity, value: amountText(listable) }] : [])],
    };
  }

  // "Walnut rate in Sopore", "Sopore mandi manz kya bhaav chhu az?" — answered, and the rates page offered.
  if (hasWord(q, PRICE) && (crop || market)) {
    return {
      kind: 'mandi',
      href: link('/mandi-weather', { crop: crop?.name, market: market?.name, state: market?.state }),
      page: PAGE.mandi,
      fields: [...(crop ? [{ field: FIELD.crop, value: crop.label }] : []), ...(market ? [{ field: FIELD.market, value: market.label }] : [])],
      answer: true,
    };
  }
  return null;
}

/** Where in the text a place is first named (for "from … to …"). */
function firstAt(q: string, keys: string[]): number {
  const at = keys.map((k) => q.indexOf(norm(k))).filter((i) => i >= 0);
  return at.length ? Math.min(...at) : Number.MAX_SAFE_INTEGER;
}

/** The card's sentence in English, Hindi or Urdu: what will open, filled with what. */
export function actionSentence(a: VoiceAction, l: 'en' | 'hi' | 'ur'): string {
  const list = a.fields.map((f) => `${f.field[l]}: ${f.value[l]}`).join(l === 'ur' ? '، ' : ', ');
  const offer = {
    en: a.fields.length ? `I'll open ${a.page.en} with ${list} filled in.` : `I can open ${a.page.en}.`,
    hi: a.fields.length ? `मैं ${a.page.hi} खोलूँगा, ${list} भरकर।` : `मैं ${a.page.hi} खोल सकता हूँ।`,
    ur: a.fields.length ? `میں ${a.page.ur} کھولوں گا، ${list} بھر کر۔` : `میں ${a.page.ur} کھول سکتا ہوں۔`,
  }[l];
  const tap = { en: 'Tap Open, or Cancel.', hi: '"Open" दबाएँ, या "Cancel"।', ur: '"Open" دبائیں، یا "Cancel"۔' }[l];
  return [a.note?.[l], offer, tap].filter(Boolean).join(' ');
}

/** Said when the person taps Open — Kashmiri as the editors wrote it. */
export function openingLine(a: VoiceAction, lang: Lang): NavCommand {
  return going({ href: a.href, label: a.page }, lang);
}

// ── reading the filled-in values on the pages ──

const clean = (v: string | null | undefined, max = 60) => (v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

/** Mandi rates: ?crop=Walnut&market=Sopore&state=… → the search to show. */
export function mandiFromLink(p: URLSearchParams): { commodity?: string; market?: string; state?: string } | null {
  const crop: Crop | undefined = cropNamed(p.get('crop'));
  const commodity = crop?.mandi ?? clean(p.get('crop'));
  const market = clean(p.get('market'));
  const state = clean(p.get('state'));
  if (!commodity && !market && !state) return null;
  return { ...(commodity ? { commodity } : {}), ...(market ? { market } : {}), ...(state ? { state } : {}) };
}

/** List produce: ?crop=Apple&qty=50&unit=box → the form's crop, name and how many. */
export function listingDraftFromLink(p: URLSearchParams): Partial<ListingInput> | undefined {
  const crop = cropNamed(p.get('crop'));
  const qty = Number(p.get('qty'));
  const unit = p.get('unit');
  const draft: Partial<ListingInput> = {
    ...(crop ? { category: 'produce' as const, subcategory: crop.category, product: crop.name } : {}),
    ...(Number.isInteger(qty) && qty > 0 && qty <= 10_000_000 ? { quantity: qty } : {}),
    ...(unit === 'box' || unit === 'kg' || unit === 'quintal' || unit === 'bag' ? { unit } : {}),
  };
  return Object.keys(draft).length ? draft : undefined;
}

/** Cold storage: ?want=40&unit=bins → "Just give me 40 bins". */
export function coldWantFromLink(p: URLSearchParams): { n: number; storage: 'bins' | 'crates' | 'boxes' | null } | null {
  const n = Number(p.get('want'));
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) return null;
  const unit = p.get('unit');
  return { n, storage: unit === 'bin' ? 'bins' : unit === 'crate' ? 'crates' : unit === 'box' ? 'boxes' : null };
}

/** New consignment: ?from=Shopian&to=Delhi&cargo=… */
export function consignmentDraftFromLink(p: URLSearchParams): { origin: string; destination: string; cargo: string } {
  return { origin: clean(p.get('from'), 80), destination: clean(p.get('to'), 80), cargo: clean(p.get('cargo'), 120) };
}

/** A shop's search box: ?q=urea */
export const searchFromLink = (p: URLSearchParams) => clean(p.get('q'));
