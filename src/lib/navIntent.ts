/**
 * Spoken or typed commands that just mean "take me there" — "open cold
 * storage", "मंडी भाव दिखाओ", "کولڈ اسٹور کھولو", "track" — recognised on the
 * phone itself so the assistant acts instantly, without asking the server.
 * A question ("how do I book cold storage?") is not a command: it is answered.
 */
import { has, norm } from '@/lib/textMatch';

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

const PLACES: { href: string; label: Text; keys: string[] }[] = [
  { href: '/compare-prices?tab=orders', label: { en: 'your orders', hi: 'आपके ऑर्डर', ur: 'آپ کے آرڈر' }, keys: ['my orders', 'my order', 'mere order', 'मेरे ऑर्डर', 'میرے آرڈر'] },
  { href: '/farmer/dashboard?tab=lots&add=1', label: { en: 'List produce', hi: 'फ़सल बेचना', ur: 'فصل بیچنا' }, keys: ['sell', 'list produce', 'bech', 'बेच', 'بیچ', 'فروخت'] },
  { href: '/rental/dashboard', label: { en: 'cold storage', hi: 'कोल्ड स्टोरेज', ur: 'کولڈ اسٹوریج' }, keys: ['cold', 'storage', 'machinery', 'tractor', 'कोल्ड', 'स्टोर', 'मशीन', 'ट्रैक्टर', 'کولڈ', 'اسٹور', 'سٹور', 'مشین', 'ٹریکٹر'] },
  { href: '/tracking/dashboard', label: { en: 'tracking', hi: 'ट्रैकिंग', ur: 'ٹریکنگ' }, keys: ['track', 'truck', 'consignment', 'ट्रक', 'ट्रैक', 'ٹرک', 'ٹریک'] },
  { href: '/supplies/tester', label: { en: 'the fertiliser check', hi: 'खाद जाँच', ur: 'کھاد کی جانچ' }, keys: ['fertiliser', 'fertilizer', 'pesticide', 'khad', 'खाद', 'दवा', 'کھاد', 'دوائی'] },
  { href: '/orchard-health', label: { en: 'Orchard Health', hi: 'बाग़ की सेहत', ur: 'باغ کی صحت' }, keys: ['orchard', 'scab', 'spray log', 'photo diagnosis', 'बाग', 'स्कैब', 'باغ', 'اسکیب'] },
  { href: '/expert', label: { en: 'Ask an expert', hi: 'विशेषज्ञ से पूछें', ur: 'ماہر سے پوچھیں' }, keys: ['expert', 'agronomist', 'advisory', 'doctor', 'video call', 'soil test', 'विशेषज्ञ', 'सलाह', 'ماہر', 'مشورہ'] },
  { href: '/mandi-weather', label: { en: 'mandi rates and weather', hi: 'मंडी भाव और मौसम', ur: 'منڈی بھاؤ اور موسم' }, keys: ['mandi', 'rates', 'prices', 'bhav', 'weather', 'mausam', 'मंडी', 'भाव', 'मौसम', 'منڈی', 'بھاؤ', 'موسم'] },
  { href: '/compare-prices', label: { en: 'Price Comparison', hi: 'भाव तुलना', ur: 'قیمتوں کا موازنہ' }, keys: ['compare', 'price comparison', 'buy', 'shop', 'kharid', 'खरीद', 'ख़रीद', 'خرید'] },
  { href: '/season-planner', label: { en: 'the season planner', hi: 'सीज़न प्लानर', ur: 'سیزن پلانر' }, keys: ['planner', 'season', 'प्लानर', 'پلانر'] },
  { href: '/', label: { en: 'the home page', hi: 'होम पेज', ur: 'ہوم پیج' }, keys: ['home', 'होम', 'ہوم'] },
];

export interface NavCommand {
  href: string;
  /** What to say while going there, in the person's language. */
  say: string;
  /** The same in Devanagari, for phones with only a Hindi voice (Urdu/Kashmiri). */
  speech?: string;
}

export function navigationFor(text: string, lang: Lang): NavCommand | null {
  const q = ` ${norm(text)} `;
  if (has(q, QUESTION)) return null;
  const place = PLACES.find((p) => has(q, p.keys));
  if (!place) return null;
  if (place.href === '/mandi-weather' && has(q, SPECIFIC)) return null;
  const words = text.trim().split(/\s+/).length;
  // "open cold storage" / "mandi dikhao" — or just the place's name, said on its own.
  if (!has(q, VERBS) && words > 2) return null;
  const l = lang === 'ks' ? 'ur' : lang;
  const say = { en: `Opening ${place.label.en}.`, hi: `${place.label.hi} खोल रहे हैं।`, ur: `${place.label.ur} کھول رہے ہیں۔` }[l];
  const hi = `${place.label.hi} खोल रहे हैं।`;
  return { href: place.href, say, ...(l === 'ur' ? { speech: hi } : {}) };
}
