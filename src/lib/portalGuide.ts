/**
 * "Guide me on this page": what each portal page and tab is for and which
 * buttons to press, in English, Hindi and Urdu (Kashmiri is read from the
 * Urdu, its written form). KashRoot's own words — the floating assistant in
 * every portal shows them at once, with no server and no AI, and reads them
 * aloud; the assistant's answers (lib/server/basicAssistant) use them too when
 * someone asks for help on the page they are on.
 *
 * Buttons and tabs are named exactly as they are written on screen (in
 * English). Keep this in step with the pages when a button is renamed.
 */
import { portalOfPath, type PortalId } from '@/lib/auth/roles';

export type GuideText = { en: string; hi: string; ur: string };
export type GuideLang = 'en' | 'hi' | 'ur' | 'ks';

interface PortalGuide {
  /** The portal's dashboard when no tab (or an unknown one) is open. */
  start: GuideText;
  tabs?: Record<string, GuideText>;
}

const DETAILS: GuideText = {
  en: 'In the menu you also have My details (your name, phone and language), Help & support (for any problem, also signing in), Home, and Sign out.',
  hi: 'मेन्यू में My details (आपका नाम, फ़ोन और भाषा), Help & support (किसी भी दिक़्क़त के लिए, साइन-इन भी), Home और Sign out भी हैं।',
  ur: 'مینیو میں My details (آپ کا نام، فون اور زبان)، Help & support (کسی بھی مسئلے کے لیے، سائن اِن بھی)، Home اور Sign out بھی ہیں۔',
};

const GUIDE: Partial<Record<PortalId, PortalGuide>> = {
  farmer: {
    start: {
      en: 'This is your Farmer portal. To sell your harvest press Sell produce; to sell seeds, sprays or tools press Sell farm inputs. What I sell shows everything you have on sale, Orders shows what buyers ordered, and Escrow payment is where you add the UPI ID buyers pay you on.',
      hi: 'यह आपका किसान पोर्टल है। फ़सल बेचनी हो तो Sell produce दबाएँ; बीज, दवा या औज़ार बेचने हों तो Sell farm inputs दबाएँ। What I sell में आपका सारा माल दिखता है, Orders में ख़रीदारों के ऑर्डर, और Escrow payment में वह UPI ID डालें जिस पर ख़रीदार आपको पैसे भेजेंगे।',
      ur: 'یہ آپ کا کسان پورٹل ہے۔ فصل بیچنی ہو تو Sell produce دبائیں؛ بیج، دوائی یا اوزار بیچنے ہوں تو Sell farm inputs دبائیں۔ What I sell میں آپ کا سارا مال دکھتا ہے، Orders میں خریداروں کے آرڈر، اور Escrow payment میں وہ UPI ID ڈالیں جس پر خریدار آپ کو پیسے بھیجیں گے۔',
    },
    tabs: {
      lots: {
        en: 'What I sell: everything you have on sale. Press List produce, choose the crop, write your price and how many boxes, and press Save. Buyers see it within a minute. To change a price or stop selling, open the item here.',
        hi: 'What I sell: आपका सारा बिकने वाला माल। List produce दबाएँ, फ़सल चुनें, अपना दाम और कितनी पेटियाँ लिखें, और Save दबाएँ। एक मिनट में ख़रीदारों को दिखेगा। दाम बदलना या बिक्री रोकनी हो तो यहीं वह चीज़ खोलें।',
        ur: 'What I sell: آپ کا سارا بکنے والا مال۔ List produce دبائیں، فصل چنیں، اپنا دام اور کتنی پیٹیاں لکھیں، اور Save دبائیں۔ ایک منٹ میں خریداروں کو دکھے گا۔ دام بدلنا یا فروخت روکنی ہو تو یہیں وہ چیز کھولیں۔',
      },
      orders: {
        en: 'Orders: what buyers ordered from you. Press Accept, then Mark shipped when the goods leave. When the buyer has paid you by UPI, press Money received.',
        hi: 'Orders: ख़रीदारों के आपको दिए ऑर्डर। Accept दबाएँ, माल भेजने पर Mark shipped दबाएँ। ख़रीदार UPI से पैसे भेज दे तो Money received दबाएँ।',
        ur: 'Orders: خریداروں کے آپ کو دیے آرڈر۔ Accept دبائیں، مال بھیجنے پر Mark shipped دبائیں۔ خریدار UPI سے پیسے بھیج دے تو Money received دبائیں۔',
      },
      payouts: {
        en: 'Escrow payment: check your identity once (Aadhaar; PAN is optional) and add the UPI ID or bank account buyers pay you on. KashRoot never holds your money — buyers pay you directly after the goods reach them.',
        hi: 'Escrow payment: एक बार अपनी पहचान जाँचें (आधार; PAN ज़रूरी नहीं) और वह UPI ID या बैंक खाता डालें जिस पर ख़रीदार पैसे भेजेंगे। KashRoot आपका पैसा अपने पास नहीं रखता — माल पहुँचने के बाद ख़रीदार सीधे आपको देते हैं।',
        ur: 'Escrow payment: ایک بار اپنی پہچان جانچیں (آدھار؛ PAN ضروری نہیں) اور وہ UPI ID یا بینک کھاتہ ڈالیں جس پر خریدار پیسے بھیجیں گے۔ KashRoot آپ کا پیسہ اپنے پاس نہیں رکھتا — مال پہنچنے کے بعد خریدار سیدھے آپ کو دیتے ہیں۔',
      },
    },
  },
  buyer: {
    start: {
      en: 'This is your Buyer portal. Press Buy apples & produce to see what farmers are selling, cheapest first. My orders shows every order and its next step, and Escrow payment is where you pay for goods that have reached you.',
      hi: 'यह आपका Buyer portal है। किसान क्या बेच रहे हैं, सबसे सस्ता पहले, देखने के लिए Buy apples & produce दबाएँ। My orders में हर ऑर्डर और उसका अगला क़दम है, और Escrow payment में पहुँचे हुए माल का भुगतान करें।',
      ur: 'یہ آپ کا Buyer portal ہے۔ کسان کیا بیچ رہے ہیں، سب سے سستا پہلے، دیکھنے کے لیے Buy apples & produce دبائیں۔ My orders میں ہر آرڈر اور اس کا اگلا قدم ہے، اور Escrow payment میں پہنچے ہوئے مال کی ادائیگی کریں۔',
    },
    tabs: {
      shop: {
        en: 'Buy apples & produce: choose the crop, variety, grade or district. Press Order on what you want, write how many and your address. You pay nothing now.',
        hi: 'Buy apples & produce: फ़सल, क़िस्म, ग्रेड या ज़िला चुनें। जो चाहिए उस पर Order दबाएँ, कितना चाहिए और अपना पता लिखें। अभी कुछ नहीं देना है।',
        ur: 'Buy apples & produce: فصل، قسم، گریڈ یا ضلع چنیں۔ جو چاہیے اس پر Order دبائیں، کتنا چاہیے اور اپنا پتہ لکھیں۔ ابھی کچھ نہیں دینا ہے۔',
      },
      orders: {
        en: 'My orders: every order and what happens next. When the goods reach you, press I received the goods, pay the seller from your UPI app, and type the payment number.',
        hi: 'My orders: हर ऑर्डर और आगे क्या होगा। माल पहुँचने पर I received the goods दबाएँ, अपने UPI ऐप से विक्रेता को भुगतान करें और भुगतान नंबर लिखें।',
        ur: 'My orders: ہر آرڈر اور آگے کیا ہوگا۔ مال پہنچنے پر I received the goods دبائیں، اپنے UPI ایپ سے بیچنے والے کو ادائیگی کریں اور ادائیگی نمبر لکھیں۔',
      },
      payment: {
        en: 'Escrow payment: check your identity once, then pay for goods that have reached you — straight to the seller from your UPI app. KashRoot never holds the money.',
        hi: 'Escrow payment: एक बार अपनी पहचान जाँचें, फिर पहुँचे हुए माल का भुगतान करें — अपने UPI ऐप से सीधे विक्रेता को। KashRoot पैसा अपने पास नहीं रखता।',
        ur: 'Escrow payment: ایک بار اپنی پہچان جانچیں، پھر پہنچے ہوئے مال کی ادائیگی کریں — اپنے UPI ایپ سے سیدھے بیچنے والے کو۔ KashRoot پیسہ اپنے پاس نہیں رکھتا۔',
      },
    },
  },
  kissan: {
    start: {
      en: 'This is Kissan Tools. In the Shop choose a type of product — tools, sprays, fertiliser or packaging — and press Add to cart. Open Cart to place the order; My orders shows each order. You pay the seller after they accept.',
      hi: 'यह Kissan Tools है। Shop में सामान की क़िस्म चुनें — औज़ार, दवा, खाद या पैकिंग — और Add to cart दबाएँ। ऑर्डर देने के लिए Cart खोलें; My orders में हर ऑर्डर दिखता है। विक्रेता के मानने के बाद भुगतान करें।',
      ur: 'یہ Kissan Tools ہے۔ Shop میں سامان کی قسم چنیں — اوزار، دوائی، کھاد یا پیکنگ — اور Add to cart دبائیں۔ آرڈر دینے کے لیے Cart کھولیں؛ My orders میں ہر آرڈر دکھتا ہے۔ بیچنے والے کے ماننے کے بعد ادائیگی کریں۔',
    },
    tabs: {
      cart: {
        en: 'Cart: what you chose. Check the quantities, press Checkout and give your address. Remove from cart takes something out.',
        hi: 'Cart: जो आपने चुना। गिनती देखें, Checkout दबाएँ और अपना पता दें। Remove from cart से कोई चीज़ हटाएँ।',
        ur: 'Cart: جو آپ نے چنا۔ گنتی دیکھیں، Checkout دبائیں اور اپنا پتہ دیں۔ Remove from cart سے کوئی چیز ہٹائیں۔',
      },
      orders: {
        en: 'My orders: each order and where it is. Pay the seller from your UPI app once they accept, and type the payment number.',
        hi: 'My orders: हर ऑर्डर और वह कहाँ है। विक्रेता के मानने पर अपने UPI ऐप से भुगतान करें और भुगतान नंबर लिखें।',
        ur: 'My orders: ہر آرڈر اور وہ کہاں ہے۔ بیچنے والے کے ماننے پر اپنے UPI ایپ سے ادائیگی کریں اور ادائیگی نمبر لکھیں۔',
      },
    },
  },
  rental: {
    start: {
      en: 'This is Cold Storage Booking. Find a cold store shows stores with free space: press Choose your place to see the whole store in a drawing, in 3D or by walking inside, and tap the free places you want — or type how many boxes and press Choose places for me. Pay the owner by UPI within 24 hours and type the payment number; the owner then confirms.',
      hi: 'यह Cold Storage Booking है। Find a cold store में ख़ाली जगह वाले स्टोर हैं: Choose your place दबाकर पूरा स्टोर नक़्शे, 3D या अंदर चलकर देखें, और अपनी ख़ाली जगहें छुएँ — या पेटियों की गिनती लिखकर Choose places for me दबाएँ। 24 घंटे में UPI से मालिक को भुगतान करें और भुगतान नंबर लिखें; फिर मालिक पक्का करेगा।',
      ur: 'یہ Cold Storage Booking ہے۔ Find a cold store میں خالی جگہ والے اسٹور ہیں: Choose your place دبا کر پورا اسٹور نقشے، 3D یا اندر چل کر دیکھیں، اور اپنی خالی جگہیں چھوئیں — یا پیٹیوں کی گنتی لکھ کر Choose places for me دبائیں۔ 24 گھنٹے میں UPI سے مالک کو ادائیگی کریں اور ادائیگی نمبر لکھیں؛ پھر مالک پکا کرے گا۔',
    },
    tabs: {
      bookings: {
        en: 'My bookings: each booking and where your boxes are. Press Receipt to see it, with the owner’s UPI QR code to pay from your UPI app.',
        hi: 'My bookings: हर बुकिंग और आपकी पेटियाँ कहाँ हैं। Receipt दबाकर रसीद देखें, उसमें मालिक का UPI QR कोड है जिससे अपने UPI ऐप से भुगतान करें।',
        ur: 'My bookings: ہر بکنگ اور آپ کی پیٹیاں کہاں ہیں۔ Receipt دبا کر رسید دیکھیں، اس میں مالک کا UPI QR کوڈ ہے جس سے اپنے UPI ایپ سے ادائیگی کریں۔',
      },
      stores: {
        en: 'My cold stores (for owners): press Add cold store and type the building and each chamber’s real measurements — the drawing and 3D are made from them, to scale.',
        hi: 'My cold stores (मालिकों के लिए): Add cold store दबाएँ और इमारत और हर चैंबर का असली नाप लिखें — नक़्शा और 3D उसी से, सही पैमाने पर बनते हैं।',
        ur: 'My cold stores (مالکوں کے لیے): Add cold store دبائیں اور عمارت اور ہر چیمبر کا اصلی ناپ لکھیں — نقشہ اور 3D اسی سے، صحیح پیمانے پر بنتے ہیں۔',
      },
      requests: {
        en: 'Bookings to confirm (for owners): when the farmer’s payment has reached you, press Money received; press Decline if you cannot take the booking. A booking not paid within 24 hours frees its places again.',
        hi: 'Bookings to confirm (मालिकों के लिए): किसान का भुगतान मिल जाए तो Money received दबाएँ; बुकिंग न ले सकें तो Decline दबाएँ। 24 घंटे में भुगतान न हो तो जगह फिर ख़ाली हो जाती है।',
        ur: 'Bookings to confirm (مالکوں کے لیے): کسان کی ادائیگی مل جائے تو Money received دبائیں؛ بکنگ نہ لے سکیں تو Decline دبائیں۔ 24 گھنٹے میں ادائیگی نہ ہو تو جگہ پھر خالی ہو جاتی ہے۔',
      },
      payments: {
        en: 'Payment details (for owners): the UPI ID or bank account farmers pay you on. KashRoot never holds the money.',
        hi: 'Payment details (मालिकों के लिए): वह UPI ID या बैंक खाता जिस पर किसान भुगतान करेंगे। KashRoot पैसा अपने पास नहीं रखता।',
        ur: 'Payment details (مالکوں کے لیے): وہ UPI ID یا بینک کھاتہ جس پر کسان ادائیگی کریں گے۔ KashRoot پیسہ اپنے پاس نہیں رکھتا۔',
      },
    },
  },
  tracking: {
    start: {
      en: 'This is Tracking. Under Track by code, type the KashRoot code your transporter sent you (it starts with KR-) and press Track to see the load on the map. KashRoot does not find or book trucks.',
      hi: 'यह Tracking है। Track by code में ट्रांसपोर्टर का भेजा KashRoot कोड लिखें (KR- से शुरू) और Track दबाएँ, माल नक़्शे पर दिखेगा। KashRoot ट्रक नहीं ढूँढता, न बुक करता है।',
      ur: 'یہ Tracking ہے۔ Track by code میں ٹرانسپورٹر کا بھیجا KashRoot کوڈ لکھیں (KR- سے شروع) اور Track دبائیں، مال نقشے پر دکھے گا۔ KashRoot ٹرک نہیں ڈھونڈتا، نہ بک کرتا ہے۔',
    },
    tabs: {
      mine: {
        en: 'My consignments (for transporters): press New consignment, write from where to where and the driver’s name and mobile, then Send driver link. Mark delivered when the load arrives.',
        hi: 'My consignments (ट्रांसपोर्टर के लिए): New consignment दबाएँ, कहाँ से कहाँ और ड्राइवर का नाम और मोबाइल लिखें, फिर Send driver link दबाएँ। माल पहुँचने पर Mark delivered दबाएँ।',
        ur: 'My consignments (ٹرانسپورٹر کے لیے): New consignment دبائیں، کہاں سے کہاں اور ڈرائیور کا نام اور موبائل لکھیں، پھر Send driver link دبائیں۔ مال پہنچنے پر Mark delivered دبائیں۔',
      },
      vehicle: {
        en: 'Vehicle number: type a truck’s number and press Track vehicle to see its registration (VAHAN) and its toll crossings (FASTag), from the Government’s records.',
        hi: 'Vehicle number: ट्रक का नंबर लिखकर Track vehicle दबाएँ, सरकारी रिकॉर्ड से उसका रजिस्ट्रेशन (VAHAN) और टोल पार करना (FASTag) दिखेगा।',
        ur: 'Vehicle number: ٹرک کا نمبر لکھ کر Track vehicle دبائیں، سرکاری ریکارڈ سے اس کا رجسٹریشن (VAHAN) اور ٹول پار کرنا (FASTag) دکھے گا۔',
      },
    },
  },
  dealer: {
    start: {
      en: 'This is the Agro-dealer portal. In Inventory press Add batch for each batch of stock, or Upload batch manifest for many at once. Sell products puts them on Price Comparison, Compliance keeps your licence and checklist, and Payouts shows what buyers paid you.',
      hi: 'यह Agro-dealer portal है। Inventory में हर बैच के लिए Add batch दबाएँ, या कई एक साथ हों तो Upload batch manifest। Sell products से वे Price Comparison पर दिखते हैं, Compliance में आपका लाइसेंस और जाँच-सूची है, और Payouts में ख़रीदारों का भुगतान।',
      ur: 'یہ Agro-dealer portal ہے۔ Inventory میں ہر بیچ کے لیے Add batch دبائیں، یا کئی ایک ساتھ ہوں تو Upload batch manifest۔ Sell products سے وہ Price Comparison پر دکھتے ہیں، Compliance میں آپ کا لائسنس اور جانچ فہرست ہے، اور Payouts میں خریداروں کی ادائیگی۔',
    },
  },
  trader: {
    start: {
      en: 'This is Mandi Helpers, for traders and commission agents. Press Post rates for your mandi to apply; KashRoot phones you to check. Once approved, press Post today’s rate each day — farmers see your rates on the home page.',
      hi: 'यह Mandi Helpers है, व्यापारियों और आढ़तियों के लिए। आवेदन के लिए Post rates for your mandi दबाएँ; KashRoot जाँच के लिए फ़ोन करेगा। मंज़ूरी के बाद रोज़ Post today’s rate दबाएँ — किसान आपके भाव होम पेज पर देखते हैं।',
      ur: 'یہ Mandi Helpers ہے، تاجروں اور آڑھتیوں کے لیے۔ درخواست کے لیے Post rates for your mandi دبائیں؛ KashRoot جانچ کے لیے فون کرے گا۔ منظوری کے بعد روز Post today’s rate دبائیں — کسان آپ کے بھاؤ ہوم پیج پر دیکھتے ہیں۔',
    },
  },
  expert: {
    start: {
      en: 'This is Advisory. Press Ask an expert: speak or type your problem and add a photo, or Book a soil test. The answer comes in My requests, and you can listen to it there. Library has answers to common questions.',
      hi: 'यह Advisory है। Ask an expert दबाएँ: अपनी समस्या बोलें या लिखें और फ़ोटो लगाएँ, या Book a soil test दबाएँ। जवाब My requests में आएगा, वहीं सुन भी सकते हैं। Library में आम सवालों के जवाब हैं।',
      ur: 'یہ Advisory ہے۔ Ask an expert دبائیں: اپنا مسئلہ بولیں یا لکھیں اور تصویر لگائیں، یا Book a soil test دبائیں۔ جواب My requests میں آئے گا، وہیں سن بھی سکتے ہیں۔ Library میں عام سوالوں کے جواب ہیں۔',
    },
    tabs: {
      mine: {
        en: 'My requests: your questions and the experts’ answers. Press the speaker to hear an answer.',
        hi: 'My requests: आपके सवाल और विशेषज्ञों के जवाब। जवाब सुनने के लिए स्पीकर दबाएँ।',
        ur: 'My requests: آپ کے سوال اور ماہروں کے جواب۔ جواب سننے کے لیے اسپیکر دبائیں۔',
      },
      bank: {
        en: 'Answer bank (for experts): write answers to the questions farmers ask most, and check the questions waiting for an answer. The assistant answers from this bank, in your words.',
        hi: 'Answer bank (विशेषज्ञों के लिए): किसानों के सबसे ज़्यादा पूछे सवालों के जवाब लिखें, और जवाब का इंतज़ार कर रहे सवाल देखें। सहायक इसी से, आपके शब्दों में जवाब देता है।',
        ur: 'Answer bank (ماہروں کے لیے): کسانوں کے سب سے زیادہ پوچھے سوالوں کے جواب لکھیں، اور جواب کا انتظار کر رہے سوال دیکھیں۔ معاون اسی سے، آپ کے الفاظ میں جواب دیتا ہے۔',
      },
    },
  },
  admin: {
    start: {
      en: 'This is the Admin portal for KashRoot staff: Approvals, Accounts, Problems, Help desk (customers’ help requests — reply or call them), Cold stores, Official lists, Platform numbers, Security and Setup check.',
      hi: 'यह KashRoot स्टाफ़ का Admin portal है: Approvals, Accounts, Problems, Help desk (ग्राहकों के मदद के अनुरोध), Cold stores, Official lists, Platform numbers, Security और Setup check।',
      ur: 'یہ KashRoot اسٹاف کا Admin portal ہے: Approvals، Accounts، Problems، Help desk (گاہکوں کی مدد کی درخواستیں)، Cold stores، Official lists، Platform numbers، Security اور Setup check۔',
    },
  },
};

/** Pages inside the Farmer portal other than its dashboard. */
const FARMER_PAGES: Record<string, GuideText> = {
  '/farmer/orchard-health': {
    en: 'Orchard Health: Scab risk shows the risk for your own blocks from the weather; Photo diagnosis checks a photo of a leaf or fruit; Spray log records each spray and tells you when it is safe to harvest.',
    hi: 'Orchard Health: Scab risk मौसम से आपके बाग़ के हिस्सों में ख़तरा दिखाता है; Photo diagnosis पत्ते या फल की फ़ोटो जाँचता है; Spray log हर स्प्रे लिखता है और बताता है कि तुड़ाई कब सुरक्षित है।',
    ur: 'Orchard Health: Scab risk موسم سے آپ کے باغ کے حصوں میں خطرہ دکھاتا ہے؛ Photo diagnosis پتے یا پھل کی تصویر جانچتا ہے؛ Spray log ہر اسپرے لکھتا ہے اور بتاتا ہے کہ توڑائی کب محفوظ ہے۔',
  },
  '/farmer/season-planner': {
    en: 'Season Planner: Calendar shows the orchard jobs month by month; ROI calculator adds up the season’s costs and what the harvest may bring.',
    hi: 'Season Planner: Calendar में महीने-दर-महीने बाग़ के काम हैं; ROI calculator मौसम का ख़र्च और फ़सल से आमदनी जोड़ता है।',
    ur: 'Season Planner: Calendar میں مہینہ بہ مہینہ باغ کے کام ہیں؛ ROI calculator موسم کا خرچ اور فصل سے آمدنی جوڑتا ہے۔',
  },
};

/** Where the guide speaks of: "/farmer/dashboard?tab=orders" → the Orders tab of the Farmer portal. */
export function guideFor(path: string, tab?: string | null): GuideText | null {
  const bare = path.split(/[?#]/)[0];
  if (FARMER_PAGES[bare]) return FARMER_PAGES[bare];
  const portal = portalOfPath(bare);
  const g = portal ? GUIDE[portal] : undefined;
  if (!g) return null;
  const t = tab ?? new URLSearchParams(path.split('?')[1] ?? '').get('tab');
  const body = (t && g.tabs?.[t]) || g.start;
  return { en: `${body.en} ${DETAILS.en}`, hi: `${body.hi} ${DETAILS.hi}`, ur: `${body.ur} ${DETAILS.ur}` };
}

/** The guide in one language (Kashmiri: its written form, Urdu). */
export const guideIn = (g: GuideText, lang: GuideLang): string => g[lang === 'ks' ? 'ur' : lang];
