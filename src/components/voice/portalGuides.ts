/**
 * What each portal's spoken guide says, naming buttons and tabs exactly as
 * they appear. English, Hindi and Urdu are written here; Kashmiri is spoken
 * by the AI assistant from the English (see PortalGuide).
 */
import type { PortalId } from '@/lib/auth/roles';

export interface Guide {
  en: string;
  hi: string;
  ur: string;
}

export const PORTAL_GUIDES: Partial<Record<PortalId, Guide>> = {
  farmer: {
    en: 'This is your Farmer portal. To sell your harvest, press List produce. Your orders, and money kept safe until delivery, are shown below. For today’s mandi rates, press Home and open Mandi rates. To ask an expert or send a photo of a sick leaf, open the Advisory portal. Press My details at the top to save your village, crops and language.',
    hi: 'यह आपका किसान पोर्टल है। अपनी फ़सल बेचने के लिए "List produce" दबाएँ। आपके ऑर्डर और डिलीवरी तक सुरक्षित रखा पैसा नीचे दिखता है। आज के मंडी भाव के लिए Home दबाकर Mandi rates खोलें। किसी विशेषज्ञ से पूछने या बीमार पत्ते की फ़ोटो भेजने के लिए Advisory पोर्टल खोलें। ऊपर "My details" दबाकर अपना गाँव, फ़सल और भाषा सेव करें।',
    ur: 'یہ آپ کا کسان پورٹل ہے۔ اپنی فصل بیچنے کے لیے "List produce" دبائیں۔ آپ کے آرڈر اور ڈلیوری تک محفوظ رکھا پیسہ نیچے نظر آتا ہے۔ آج کے منڈی بھاؤ کے لیے Home دبا کر Mandi rates کھولیں۔ کسی ماہر سے پوچھنے یا بیمار پتے کی تصویر بھیجنے کے لیے Advisory پورٹل کھولیں۔ اوپر "My details" دبا کر اپنا گاؤں، فصل اور زبان محفوظ کریں۔',
  },
  buyer: {
    en: 'This is the Buyer portal. To buy, open Price Comparison, choose a product and press Order. You pay nothing now. When the goods reach you and you have checked them, open My orders, press I received the goods, and pay the seller from your UPI app. To follow a truck, use Track consignment.',
    hi: 'यह ख़रीदार पोर्टल है। ख़रीदने के लिए Price Comparison खोलें, सामान चुनें और Order दबाएँ। अभी कुछ नहीं देना है। सामान पहुँचने और जाँचने के बाद My orders खोलें, "I received the goods" दबाएँ और अपने UPI ऐप से विक्रेता को भुगतान करें। ट्रक देखने के लिए Track consignment दबाएँ।',
    ur: 'یہ خریدار پورٹل ہے۔ خریدنے کے لیے Price Comparison کھولیں، سامان چنیں اور Order دبائیں۔ ابھی کچھ نہیں دینا ہے۔ سامان پہنچنے اور جانچنے کے بعد My orders کھولیں، "I received the goods" دبائیں اور اپنے UPI ایپ سے بیچنے والے کو ادائیگی کریں۔ ٹرک دیکھنے کے لیے Track consignment دبائیں۔',
  },
  seller: {
    en: 'This is the Seller portal. Open My products and press Add product, with its price and stock, so farmers can compare and order it. In Orders, press Accept, then Mark shipped. Add your UPI or bank details under Payouts; the buyer pays you there after the goods arrive, and you press Money received.',
    hi: 'यह विक्रेता पोर्टल है। My products खोलकर "Add product" दबाएँ और दाम व स्टॉक लिखें, ताकि किसान भाव मिलाकर ऑर्डर कर सकें। Orders में Accept दबाएँ, फिर "Mark shipped"। Payouts में अपना UPI या बैंक खाता जोड़ें; सामान पहुँचने के बाद ख़रीदार वहीं भुगतान करेगा, फिर आप "Money received" दबाएँ।',
    ur: 'یہ بیچنے والوں کا پورٹل ہے۔ My products کھول کر "Add product" دبائیں اور دام اور اسٹاک لکھیں، تاکہ کسان بھاؤ ملا کر آرڈر کر سکیں۔ Orders میں Accept دبائیں، پھر "Mark shipped"۔ Payouts میں اپنا UPI یا بینک کھاتہ شامل کریں؛ سامان پہنچنے کے بعد خریدار وہیں ادائیگی کرے گا، پھر آپ "Money received" دبائیں۔',
  },
  rental: {
    en: 'This is Cold storage and machinery. In the Cold storage tab, find a store with free boxes and press Book. Choose how many boxes and for how many months, then pay the owner from your UPI app and type the payment number. If you own a cold store, open My cold store to list it, keep the free boxes up to date, and confirm bookings.',
    hi: 'यह कोल्ड स्टोरेज और मशीनरी पोर्टल है। Cold storage टैब में ख़ाली जगह वाला स्टोर ढूँढें और Book दबाएँ। कितनी पेटियाँ और कितने महीने चुनें, फिर अपने UPI ऐप से मालिक को भुगतान करें और भुगतान नंबर लिखें। अगर आपका अपना कोल्ड स्टोर है तो My cold store खोलें, उसे जोड़ें, ख़ाली पेटियाँ अपडेट रखें और बुकिंग पक्की करें।',
    ur: 'یہ کولڈ اسٹوریج اور مشینری پورٹل ہے۔ Cold storage ٹیب میں خالی جگہ والا اسٹور ڈھونڈیں اور Book دبائیں۔ کتنی پیٹیاں اور کتنے مہینے چنیں، پھر اپنے UPI ایپ سے مالک کو ادائیگی کریں اور ادائیگی نمبر لکھیں۔ اگر آپ کا اپنا کولڈ اسٹور ہے تو My cold store کھولیں، اسے شامل کریں، خالی پیٹیاں اپڈیٹ رکھیں اور بکنگ پکی کریں۔',
  },
  expert: {
    en: 'This is Advisory. Press Ask an expert, choose a question, a soil test or a video call, tap Speak to tell the problem, add a photo, and send. You get a first answer straight away, and the expert’s answer appears in My requests, where you can press Listen.',
    hi: 'यह सलाह पोर्टल है। "Ask an expert" दबाएँ, सवाल, मिट्टी की जाँच या वीडियो कॉल चुनें, Speak दबाकर अपनी समस्या बोलें, फ़ोटो लगाएँ और भेजें। आपको तुरंत पहला जवाब मिलेगा, और विशेषज्ञ का जवाब "My requests" में आएगा, जहाँ Listen दबाकर सुन सकते हैं।',
    ur: 'یہ مشاورت پورٹل ہے۔ "Ask an expert" دبائیں، سوال، مٹی کی جانچ یا ویڈیو کال چنیں، Speak دبا کر اپنا مسئلہ بولیں، تصویر لگائیں اور بھیجیں۔ آپ کو فوراً پہلا جواب ملے گا، اور ماہر کا جواب "My requests" میں آئے گا، جہاں Listen دبا کر سن سکتے ہیں۔',
  },
  tracking: {
    en: 'This is Tracking. Type the code your transporter sent you and press Track to see the truck on the map. Transporters can create a consignment in My consignments and send the driver link on WhatsApp.',
    hi: 'यह ट्रैकिंग पोर्टल है। ट्रांसपोर्टर का भेजा कोड लिखें और Track दबाएँ, ट्रक नक़्शे पर दिखेगा। ट्रांसपोर्टर My consignments में खेप बनाकर ड्राइवर को WhatsApp पर लिंक भेज सकते हैं।',
    ur: 'یہ ٹریکنگ پورٹل ہے۔ ٹرانسپورٹر کا بھیجا کوڈ لکھیں اور Track دبائیں، ٹرک نقشے پر نظر آئے گا۔ ٹرانسپورٹر My consignments میں کھیپ بنا کر ڈرائیور کو WhatsApp پر لنک بھیج سکتے ہیں۔',
  },
  logistics: {
    en: 'This is the Logistics portal. Find transport jobs and manage your trucks. Use Tracking to give buyers and farmers the live location of each load.',
    hi: 'यह लॉजिस्टिक्स पोर्टल है। माल ढुलाई के काम देखें और अपने ट्रक संभालें। ख़रीदारों और किसानों को हर खेप की लाइव जगह दिखाने के लिए Tracking का इस्तेमाल करें।',
    ur: 'یہ لاجسٹکس پورٹل ہے۔ مال ڈھلائی کے کام دیکھیں اور اپنے ٹرک سنبھالیں۔ خریداروں اور کسانوں کو ہر کھیپ کی لائیو جگہ دکھانے کے لیے Tracking استعمال کریں۔',
  },
  kissan: {
    en: 'This is Kissan Tools. Find equipment and horticulture supplies near you, and compare prices before you buy.',
    hi: 'यह किसान टूल्स पोर्टल है। अपने पास के औज़ार और बाग़वानी का सामान ढूँढें और ख़रीदने से पहले भाव मिलाएँ।',
    ur: 'یہ کسان ٹولز پورٹل ہے۔ اپنے قریب کے اوزار اور باغبانی کا سامان ڈھونڈیں اور خریدنے سے پہلے بھاؤ ملائیں۔',
  },
  dealer: {
    en: 'This is the Agro-dealer portal. Add each batch you sell with its batch code and registration number, then press Register all, so farmers can check it. In Compliance, ask KashRoot to verify you. Add your payment details in Payouts.',
    hi: 'यह खाद-दवा विक्रेता पोर्टल है। हर बैच को उसके बैच कोड और रजिस्ट्रेशन नंबर के साथ जोड़ें, फिर "Register all" दबाएँ ताकि किसान जाँच सकें। Compliance में KashRoot से सत्यापन माँगें। Payouts में अपने भुगतान का विवरण जोड़ें।',
    ur: 'یہ کھاد اور دوا بیچنے والوں کا پورٹل ہے۔ ہر بیچ کو اس کے بیچ کوڈ اور رجسٹریشن نمبر کے ساتھ شامل کریں، پھر "Register all" دبائیں تاکہ کسان جانچ سکیں۔ Compliance میں KashRoot سے تصدیق مانگیں۔ Payouts میں اپنی ادائیگی کی تفصیل شامل کریں۔',
  },
  admin: {
    en: 'This is the Admin portal. Approve agronomists and dealers under Approvals, look at reported fake batches there too, and review KYC and disputes.',
    hi: 'यह एडमिन पोर्टल है। Approvals में विशेषज्ञों और विक्रेताओं को मंज़ूरी दें, वहीं नक़ली बैच की शिकायतें देखें, और KYC व विवाद देखें।',
    ur: 'یہ ایڈمن پورٹل ہے۔ Approvals میں ماہرین اور بیچنے والوں کو منظوری دیں، وہیں نقلی بیچ کی شکایتیں دیکھیں، اور KYC اور تنازعات دیکھیں۔',
  },
};

/** Devanagari copy of the Urdu guide, for phones that only have a Hindi voice. */
export const urduAsHindi = (g: Guide) => g.hi;
