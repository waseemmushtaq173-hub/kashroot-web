/**
 * Offline Intent Matcher — deterministic, no LLM, works without internet.
 * 
 * Matches user queries to known intents using keyword patterns.
 * Returns the action to take or a helpful fallback response.
 * 
 * All responses are pre-written and come from the answer bank / basic assistant.
 * No AI generation happens offline.
 */

import type { SpeechLang } from '@/lib/client/speech';

export interface OfflineIntent {
  name: string;
  patterns: RegExp[];
  handler: (params: { lang: SpeechLang; query: string }) => { text: string; speech?: string; action?: string };
  priority: number; // Higher = checked first
}

export interface OfflineMatchResult {
  matched: boolean;
  intent?: string;
  response: { text: string; speech?: string; action?: string };
  confidence: number;
}

/** Normalize query for matching: lowercase, trim, remove punctuation */
function normalize(query: string): string {
  return query.toLowerCase().trim().replace(/[।.,?!؟ʻ'""''`]/g, ' ').replace(/\s+/g, ' ');
}

/** Extract numbers from query */
function extractNumbers(query: string): number[] {
  return query.match(/\d+/g)?.map(Number) ?? [];
}

/** Extract crop names from query (Kashmir-focused) */
function extractCrops(query: string): string[] {
  const crops = ['apple', 'seb', 'walnut', 'akhrot', 'saffron', 'kesar', 'cherry', 'pear', 'nashpati'];
  const found: string[] = [];
  const q = query.toLowerCase();
  for (const crop of crops) {
    if (q.includes(crop)) found.push(crop);
  }
  return found;
}

/** Offline intents - ordered by priority */
const OFFLINE_INTENTS: OfflineIntent[] = [
  // 1. Mandi prices
  {
    name: 'mandi_price',
    priority: 100,
    patterns: [
      /(rate|bhav|price|भाव|بھاؤ).*(apple|seb|walnut|akhrot|saffron|kesar|cherry|pear|nashpati)/i,
      /(apple|seb|walnut|akhrot|saffron|kesar).*(rate|bhav|price|भाव|بھاؤ)/i,
      /(mandi|mandi|منڈی).*(rate|bhav|price|भाव|بھاؤ)/i,
      /(today|aaj|اَج).*(rate|bhav|price|भाव|بھاؤ)/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi' 
        ? 'आज के मंडी भाव देखने के लिए इंटरनेट चाहिए। जब सिग्नल आए, कशरूट अपने आप लेटेस्ट रेट दिखा देगा।'
        : lang === 'ur'
        ? 'آج کے منڈی بھاؤ دیکھنے کے لئے انٹرنیٹ چاہیے۔ جب سگنل آئے، ک셔وٹ خود لئیسٹ رٹ دکھا دے گا۔'
        : lang === 'ks'
        ? 'آجہٕ منڈی بھاؤ دٲکھن لہٕ انٛٹٕرنیٖٹ چہیہ۔ جٕب سگنل آو، کٲشروٹ خۆد لئیسٹ رٕٹ دٲکھا دیوو۔'
        : 'Today\'s mandi prices need internet. When signal returns, KashRoot will show latest rates automatically.',
      speech: lang === 'hi' ? 'आज के मंडी भाव देखने के लिए इंटरनेट चाहिए। जब सिग्नल आए, कशरूट अपने आप लेटेस्ट रेट दिखा देगा।' : undefined,
      action: 'open-mandi',
    }),
  },
  
  // 2. Weather
  {
    name: 'weather',
    priority: 100,
    patterns: [
      /(weather|mausam|mausam|موسم|howa|हवा).*(today|aaj|kal|tomorrow|कल|اَج|کل)/i,
      /(rain|barish|بارش|बारिश).*(today|aaj|kal|कल|اَج|کل)/i,
      /(temperature|tapman|तापमान|گرمی|سردی).*(today|aaj|kal|कल|اَج|کل)/i,
      /(forecast|peshgoi|پیشگوئی| پیشگوئی).*(week|hafta|हफ्ता|ہفتہ)/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'मौसम की जानकारी के लिए इंटरनेट चाहिए। सेव किया हुआ डेटा देखें या सिग्नल आने पर ताज़ा अपडेट मिलेगा।'
        : lang === 'ur'
        ? 'موسم کی معلومات کے لئے انٹرنیٹ چاہیے۔ محفوظ ڈیٹا دیکھیں یا سگنل آنے پر تازہ اپڈیٹ ملے گا۔'
        : lang === 'ks'
        ? 'موسم خٕبر لہٕ انٛٹٕرنیٖٹ چہیہ۔ محفوظ ڈیٖٹا دٲکھیو یا سگنل آوؤں تازہ اپڈیٹ ملیو۔'
        : 'Weather needs internet. Check saved data or wait for signal for fresh update.',
      speech: lang === 'hi' ? 'मौसम की जानकारी के लिए इंटरनेट चाहिए। सेव किया हुआ डेटा देखें या सिग्नल आने पर ताज़ा अपडेट मिलेगा।' : undefined,
      action: 'open-weather',
    }),
  },

  // 3. Crop advice / spray schedule
  {
    name: 'crop_advice',
    priority: 90,
    patterns: [
      /(spray|chidkao|छिड़काव|چھڑکاؤ|spraying).*(when|kab|कब|کب)/i,
      /(fungicide|fungus|scab|scab|स्कैब|skáب).*(apple|seb|सेब|سیب)/i,
      /(pesticide|davai|दवाई|دواء).*(dose|kitna|कितना|کتنا)/i,
      /(disease|bimari|बिमारी|بیماری).*(apple|seb|सेब|سیب)/i,
      /(spray|schedule|calendar|कैलेंडर|کیلنڈر).*(apple|seb|सेब|سیب)/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'फसल सलाह और स्प्रे शेड्यूल के लिए "किसान टूल्स" खोलें। सेव की हुई गाइड वहां है।'
        : lang === 'ur'
        ? 'فصل کی مشورہ اور سپرے شیڈول کے لئے "کسان ٹولز" کھولیں۔ محفوظ گائیڈ وہاں ہے۔'
        : lang === 'ks'
        ? 'فصل مشوorah تے سپرے شیڈول لہٕ "کسان ٹولز" کہولنٛ۔ محفوظ گائیڈ تَہٕ چھی۔'
        : 'Open "Farmer Tools" for crop advice and spray schedules. Saved guides are there.',
      action: 'open-farmer-tools',
    }),
  },

  // 4. Cold storage
  {
    name: 'cold_storage',
    priority: 90,
    patterns: [
      /(cold.storage|cold.store|कोल्ड.स्टोरेज|कोल्ड.स्टोर|کولڈ.سٹوریج|کولڈ.سٹور)/i,
      /(booking|book|बुकिंग|बुक|بکنگ|بک).*(cold|कोल्ड|کولڈ)/i,
      /(chamber|chamber|चैम्बर|چیمبر).*(cold|कोल्ड|کولڈ)/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'कोल्ड स्टोरेज बुकिंग के लिए इंटरनेट चाहिए। सेव की हुई सूची देखें या सिग्नल आने पर बुक करें।'
        : lang === 'ur'
        ? 'کولڈ اسٹوریج بکنگ کے لئے انٹرنیٹ چاہیے۔ محفوظ فہرست دیکھیں یا سگنل آنے پر بک کریں۔'
        : lang === 'ks'
        ? 'کولڈ اسٹوریج بکنگ لہٕ انٛٹٕرنیٖٹ چہیہ۔ محفوظ فہرست دٲکھیو یا سگنل آوؤں بک کرو۔'
        : 'Cold storage booking needs internet. Check saved list or book when signal returns.',
      action: 'open-rental',
    }),
  },

  // 5. Sell produce / listing
  {
    name: 'sell_produce',
    priority: 90,
    patterns: [
      /(sell|becho|बेचो|بیچو|selling|बेचना|بیچنا).*(apple|seb|walnut|akhrot|सैब|अखरोट|سیب|اخروٹ)/i,
      /(list|list|लिस्ट|فہرست).*(apple|seb|walnut|akhrot|सेब|अखरोट|سیب|اخروٹ)/i,
      /(buyer|khareedar|खरीददार|خریدار).*(find|dhoondo|ढूंढो|ڈھونڈو)/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'अपनी फसल बेचने के लिए "मेरी उपज" टैब खोलें। वहां लिस्टिंग बनाएं।'
        : lang === 'ur'
        ? 'اپنی فصل بیچنے کے لئے "میری پیداوار" ٹیب کھولیں۔ وہاں لسٹنگ بنائیں۔'
        : lang === 'ks'
        ? 'تُہؠ فصل بیچن لہٕ "میری پیداوار" ٹیب کہولنٛ। تَہٕ لسٹنگ بنانٛ۔'
        : 'Open "My Produce" tab to sell your crop. Create a listing there.',
      action: 'open-my-produce',
    }),
  },

  // 6. Track order / vehicle
  {
    name: 'track_order',
    priority: 90,
    patterns: [
      /(track|tracking|पता|पत्ता|پتہ).*(order|order|आर्डर|آرڈر)/i,
      /(where|kahan|कहाँ|کہاں).*(truck|truck|ट्रक|ٹрак|vehicle|गाड़ी|گاڑی)/i,
      /(consignment|consignment|कंसाइनमेंट|کانسائنمینڈ).*(code|code|कोड|کوڈ)/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'ऑर्डर ट्रैक करने के लिए "ट्रैकिंग" पेज खोलें। कंसाइनमेंट कोड डालें।'
        : lang === 'ur'
        ? 'آرڈر ٹریک کرنے کے لئے "ٹریکنگ" پیج کھولیں۔ کانسائنمینڈ کوڈ ڈالیں۔'
        : lang === 'ks'
        ? 'آرڈر ٹریک کرن لہٕ "ٹریکنگ" پیج کہولنٛ۔ کانسائنمینڈ کوڈ ڈالنٛ۔'
        : 'Open "Tracking" page to track your order. Enter consignment code.',
      action: 'open-tracking',
    }),
  },

  // 7. Help / how to use
  {
    name: 'help',
    priority: 50,
    patterns: [
      /(help|madad|मदद|مدد|how|kaise|कैसे|کیسے).*(use|use|इस्तेमाल|استعمال|kashroot|कशरूट|کشروٹ)/i,
      /(what|kya|क्या|کیا).*(can|kar sakte|कर सकते|کر سکتے).*(you|tum|तुम|تم)/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'आप मुझसे पूछ सकते हैं: "आज सेब का भाव क्या है?", "कल बारिश होगी?", "स्प्रे कब करें?", "कोल्ड स्टोर कैसे बुक करें?" — मैं जवाब दूंगा या सही पेज खोल दूंगा।'
        : lang === 'ur'
        ? 'آپ مجھ سے پوچھ سکتے ہیں: "آج سیب کا بھاؤ کیا ہے؟", "کل بارش ہوگی؟", "سپرے کب کریں؟", "کولڈ اسٹوریج کیسے بک کریں؟" — میں جواب دوں گا یا صحیح پیج کھول دوں گا۔'
        : lang === 'ks'
        ? 'تُہِ میہ پучہنٛ لہٕ: "آج سیبہٕ بھاؤ کٔہ چھی؟", "وٕu برشہٕ ہووو؟", "سپرے کٔہے کرو؟", "کولڈ اسٹوریج کیسے بک کرو؟" — میہ جواب دیوُن یٔہ صحیح پیج کہول دیوُن۔'
        : 'You can ask me: "What\'s today\'s apple rate?", "Will it rain tomorrow?", "When to spray?", "How to book cold storage?" — I\'ll answer or open the right page.',
      action: 'open-help',
    }),
  },

  // 8. Greeting
  {
    name: 'greeting',
    priority: 40,
    patterns: [
      /^(hi|hello|namaste|salaam|assalam|السلام|नमस्ते|सलाम|ہیلو|ہائے)$/i,
    ],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'नमस्ते! मैं कशरूट हूँ। आज मंडी भाव, मौसम, या फसल सलाह के लिए पूछें।'
        : lang === 'ur'
        ? 'السلام علیکم! میں کشروٹ ہوں۔ آج منڈی بھاؤ، موسم، یا فصل کی مشورہ کے لئے پوچھیں۔'
        : lang === 'ks'
        ? 'السلام علیکم! میہ کٲشروٹ چھُس۔ آجہٕ منڈی بھاؤ، موسم، یٔہ فصل مشوorah دےپوچھٕنٛ۔'
        : 'Hello! I\'m KashRoot. Ask me about today\'s mandi rates, weather, or crop advice.',
      speech: lang === 'hi' ? 'नमस्ते! मैं कशरूट हूँ। आज मंडी भाव, मौसम, या फसल सलाह के लिए पूछें।' : undefined,
    }),
  },

  // 9. Unknown / fallback
  {
    name: 'unknown',
    priority: 1,
    patterns: [/.*/],
    handler: ({ lang }) => ({
      text: lang === 'hi'
        ? 'माफ़ कीजिए, मैं अभी इसका जवाब नहीं दे सकता। इंटरनेट आने पर पूरा जवाब मिलेगा। आप "मदद" कहकर देख सकते हैं मैं क्या कर सकता हूँ।'
        : lang === 'ur'
        ? 'معاف کیجیے، میں ابھی اس کا جواب نہیں دے سکتا۔ انٹرنیٹ آنے پر پورہ جواب ملے گا۔ آپ "مدد" کہ کر دیکھ سکتے ہیں کہ میں کیا کر سکتا ہوں۔'
        : lang === 'ks'
        ? 'معاف کیجے، میہ ابھی أس چھِ جواب نی دیہ پïtہ۔ انٛٹٕرنیٖٹ آوؤں پورہ جواب ملیو। تُہِ "مدد" سٔتھ دٲکھیو کٔہ میہ کٔہ یٔہن کر سکتہ چھُس۔'
        : 'Sorry, I can\'t answer that right now. Full answer when internet returns. Say "help" to see what I can do.',
      speech: lang === 'hi' ? 'माफ़ कीजिए, मैं अभी इसका जवाब नहीं दे सकता। इंटरनेट आने पर पूरा जवाब मिलेगा।' : undefined,
    }),
  },
];

/** Match a query to the best offline intent */
export function matchOfflineIntent(query: string, lang: SpeechLang = 'en'): OfflineMatchResult {
  const normalized = normalize(query);
  
  for (const intent of OFFLINE_INTENTS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(normalized)) {
        const response = intent.handler({ lang, query });
        return {
          matched: intent.name !== 'unknown',
          intent: intent.name,
          response,
          confidence: intent.priority / 100,
        };
      }
    }
  }
  
  // Should never reach here (unknown catches all)
  return {
    matched: false,
    response: { text: 'Sorry, I cannot help with that right now.' },
    confidence: 0,
  };
}

/** Get offline response for a query (main entry point) */
export function getOfflineResponse(query: string, lang: SpeechLang = 'en'): { text: string; speech?: string; action?: string } {
  const result = matchOfflineIntent(query, lang);
  return result.response;
}

/** Check if we're in offline mode (for UI) */
export function isOfflineMode(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

/** Register a callback for online/offline changes */
export function onOfflineChange(callback: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  
  const handler = () => callback(navigator.onLine);
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}