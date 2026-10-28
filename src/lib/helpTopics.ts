/**
 * Help & Support (app/support): the problems people have most, each with the
 * steps that solve it, in English, Hindi and Urdu (Kashmiri reads the Urdu).
 * Each is shown in big words and can be read aloud; if the steps do not help,
 * "Still stuck? Ask KashRoot" opens a request with the topic filled in.
 * Buttons are named as they are written on screen; keep in step with the
 * sign-in pages (components/auth) when they change.
 */
import type { GuideText } from '@/lib/portalGuide';

/** The topics a request can be about (support_requests.topic). */
export type SupportTopic = 'login' | 'payment' | 'order' | 'cold_storage' | 'selling' | 'other';

export const TOPIC_LABEL: Record<SupportTopic, string> = {
  login: 'Signing in',
  payment: 'Payment',
  order: 'An order',
  cold_storage: 'Cold storage booking',
  selling: 'Selling on KashRoot',
  other: 'Something else',
};

export interface HelpTopic {
  id: string;
  topic: SupportTopic;
  title: GuideText;
  steps: GuideText;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'otp',
    topic: 'login',
    title: { en: 'The code (OTP) does not come', hi: 'कोड (OTP) नहीं आ रहा', ur: 'کوڈ (OTP) نہیں آ رہا' },
    steps: {
      en: 'The 6-digit code goes to the mobile number on your account, by SMS or WhatsApp, as the screen says. Wait one minute and check both. Make sure your phone has signal. Then press Resend once the timer ends. If it still does not come, ask KashRoot below and say which number you used.',
      hi: '6 अंकों का कोड आपके खाते के मोबाइल नंबर पर SMS या WhatsApp से आता है, जैसा स्क्रीन पर लिखा है। एक मिनट रुकें और दोनों देखें। फ़ोन में नेटवर्क हो। टाइमर ख़त्म होने पर Resend दबाएँ। फिर भी न आए तो नीचे KashRoot से पूछें और बताएँ कौन सा नंबर डाला था।',
      ur: '6 ہندسوں کا کوڈ آپ کے کھاتے کے موبائل نمبر پر SMS یا WhatsApp سے آتا ہے، جیسا اسکرین پر لکھا ہے۔ ایک منٹ رکیں اور دونوں دیکھیں۔ فون میں نیٹ ورک ہو۔ ٹائمر ختم ہونے پر Resend دبائیں۔ پھر بھی نہ آئے تو نیچے KashRoot سے پوچھیں اور بتائیں کون سا نمبر ڈالا تھا۔',
    },
  },
  {
    id: 'password',
    topic: 'login',
    title: { en: 'I forgot my password', hi: 'पासवर्ड भूल गया', ur: 'پاس ورڈ بھول گیا' },
    steps: {
      en: 'On the sign-in page press Forgot password?, type the email of your account and press the button. Open the email from KashRoot and its link, and set a new password. The link works once; if it has expired, ask for a new one the same way.',
      hi: 'साइन-इन पेज पर Forgot password? दबाएँ, अपने खाते का ईमेल लिखें और बटन दबाएँ। KashRoot का ईमेल खोलें, उसका लिंक दबाएँ और नया पासवर्ड बनाएँ। लिंक एक बार चलता है; पुराना हो जाए तो इसी तरह नया माँगें।',
      ur: 'سائن اِن پیج پر Forgot password? دبائیں، اپنے کھاتے کا ای میل لکھیں اور بٹن دبائیں۔ KashRoot کا ای میل کھولیں، اس کا لنک دبائیں اور نیا پاس ورڈ بنائیں۔ لنک ایک بار چلتا ہے؛ پرانا ہو جائے تو اسی طرح نیا مانگیں۔',
    },
  },
  {
    id: 'ended',
    topic: 'login',
    title: { en: '“Your sign-in on this device has ended”', hi: '“Your sign-in on this device has ended” लिखा आता है', ur: '“Your sign-in on this device has ended” لکھا آتا ہے' },
    steps: {
      en: 'For your safety a portal you have not used for 12 hours locks on this phone. Your account is fine. On the sign-in page press Continue as with your name, and type your password.',
      hi: 'आपकी हिफ़ाज़त के लिए, 12 घंटे इस्तेमाल न हुआ पोर्टल इस फ़ोन पर बंद हो जाता है। आपका खाता ठीक है। साइन-इन पेज पर अपने नाम वाला Continue as दबाएँ और पासवर्ड लिखें।',
      ur: 'آپ کی حفاظت کے لیے، 12 گھنٹے استعمال نہ ہوا پورٹل اس فون پر بند ہو جاتا ہے۔ آپ کا کھاتہ ٹھیک ہے۔ سائن اِن پیج پر اپنے نام والا Continue as دبائیں اور پاس ورڈ لکھیں۔',
    },
  },
  {
    id: 'portal',
    topic: 'login',
    title: { en: 'It says I have no account for this portal', hi: 'लिखा आता है कि इस पोर्टल का खाता नहीं है', ur: 'لکھا آتا ہے کہ اس پورٹل کا کھاتہ نہیں ہے' },
    steps: {
      en: 'One KashRoot account can use several portals. Sign in with the same email and password, and when the page asks, press Create my … account for that portal (for example Create my Buyer account). Your details in each portal are kept separately.',
      hi: 'एक KashRoot खाते से कई पोर्टल चलते हैं। उसी ईमेल और पासवर्ड से साइन इन करें, और पेज पूछे तो उस पोर्टल के लिए Create my … account दबाएँ (जैसे Create my Buyer account)। हर पोर्टल की जानकारी अलग रखी जाती है।',
      ur: 'ایک KashRoot کھاتے سے کئی پورٹل چلتے ہیں۔ اسی ای میل اور پاس ورڈ سے سائن اِن کریں، اور پیج پوچھے تو اس پورٹل کے لیے Create my … account دبائیں (جیسے Create my Buyer account)۔ ہر پورٹل کی معلومات الگ رکھی جاتی ہیں۔',
    },
  },
  {
    id: 'browser',
    topic: 'login',
    title: { en: 'Opened from WhatsApp or Facebook and it does not work', hi: 'WhatsApp या Facebook से खोला और नहीं चल रहा', ur: 'WhatsApp یا Facebook سے کھولا اور نہیں چل رہا' },
    steps: {
      en: 'Links opened inside WhatsApp, Facebook or Instagram use their own small browser, where signing in and the microphone often fail. KashRoot shows an Open in Chrome button there — press it; or tap ⋮ or ··· at the top and choose Open in browser. Then sign in there.',
      hi: 'WhatsApp, Facebook या Instagram के अंदर खुले लिंक उनके छोटे ब्राउज़र में चलते हैं, जहाँ साइन-इन और माइक अक्सर नहीं चलते। वहाँ KashRoot का Open in Chrome बटन दबाएँ; या ऊपर ⋮ या ··· दबाकर Open in browser चुनें। फिर वहाँ साइन इन करें।',
      ur: 'WhatsApp، Facebook یا Instagram کے اندر کھلے لنک ان کے چھوٹے براؤزر میں چلتے ہیں، جہاں سائن اِن اور مائک اکثر نہیں چلتے۔ وہاں KashRoot کا Open in Chrome بٹن دبائیں؛ یا اوپر ⋮ یا ··· دبا کر Open in browser چنیں۔ پھر وہاں سائن اِن کریں۔',
    },
  },
  {
    id: 'pay',
    topic: 'payment',
    title: { en: 'How do I pay, and is my money safe?', hi: 'भुगतान कैसे करूँ, पैसा सुरक्षित है?', ur: 'ادائیگی کیسے کروں، پیسہ محفوظ ہے؟' },
    steps: {
      en: 'KashRoot never holds money. For an order you pay nothing in advance: when the goods reach you, press I received the goods and pay the seller from your UPI app, then type the payment number. For cold storage, pay the owner by UPI within 24 hours of booking and type the payment number.',
      hi: 'KashRoot पैसा अपने पास नहीं रखता। ऑर्डर में पहले कुछ नहीं देना: माल पहुँचने पर I received the goods दबाएँ, अपने UPI ऐप से विक्रेता को भुगतान करें और भुगतान नंबर लिखें। कोल्ड स्टोरेज में बुकिंग के 24 घंटे के अंदर मालिक को UPI से भुगतान करें और भुगतान नंबर लिखें।',
      ur: 'KashRoot پیسہ اپنے پاس نہیں رکھتا۔ آرڈر میں پہلے کچھ نہیں دینا: مال پہنچنے پر I received the goods دبائیں، اپنے UPI ایپ سے بیچنے والے کو ادائیگی کریں اور ادائیگی نمبر لکھیں۔ کولڈ اسٹوریج میں بکنگ کے 24 گھنٹے کے اندر مالک کو UPI سے ادائیگی کریں اور ادائیگی نمبر لکھیں۔',
    },
  },
  {
    id: 'order',
    topic: 'order',
    title: { en: 'A problem with an order', hi: 'ऑर्डर में दिक़्क़त', ur: 'آرڈر میں مسئلہ' },
    steps: {
      en: 'Open the order in My orders and press Report a problem before you pay. The seller and KashRoot’s team see your note and can call you. If you cannot open it, ask KashRoot below with the order details.',
      hi: 'My orders में ऑर्डर खोलें और भुगतान से पहले Report a problem दबाएँ। विक्रेता और KashRoot की टीम आपकी बात देखेगी और फ़ोन कर सकती है। न खुले तो नीचे ऑर्डर की जानकारी के साथ KashRoot से पूछें।',
      ur: 'My orders میں آرڈر کھولیں اور ادائیگی سے پہلے Report a problem دبائیں۔ بیچنے والا اور KashRoot کی ٹیم آپ کی بات دیکھے گی اور فون کر سکتی ہے۔ نہ کھلے تو نیچے آرڈر کی معلومات کے ساتھ KashRoot سے پوچھیں۔',
    },
  },
  {
    id: 'cold',
    topic: 'cold_storage',
    title: { en: 'Cold storage booking', hi: 'कोल्ड स्टोरेज बुकिंग', ur: 'کولڈ اسٹوریج بکنگ' },
    steps: {
      en: 'Your places are held for 24 hours. Pay the owner by UPI in that time and type the payment number in My bookings; the owner then confirms. Press Receipt there to see the receipt and the owner’s UPI QR code.',
      hi: 'आपकी जगह 24 घंटे रोकी जाती है। इसी समय में मालिक को UPI से भुगतान करें और My bookings में भुगतान नंबर लिखें; फिर मालिक पक्का करेगा। वहीं Receipt दबाकर रसीद और मालिक का UPI QR कोड देखें।',
      ur: 'آپ کی جگہ 24 گھنٹے روکی جاتی ہے۔ اسی وقت میں مالک کو UPI سے ادائیگی کریں اور My bookings میں ادائیگی نمبر لکھیں؛ پھر مالک پکا کرے گا۔ وہیں Receipt دبا کر رسید اور مالک کا UPI QR کوڈ دیکھیں۔',
    },
  },
];
