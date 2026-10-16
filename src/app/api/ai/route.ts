/**
 * The KashRoot voice/text assistant, powered by Claude.
 *
 * GET  /api/ai → { configured, basic }   (is ANTHROPIC_API_KEY set — no secrets returned)
 *
 * Without a key the assistant still answers, in basic mode (basicAssistant.ts):
 * mandi prices, weather and how to use KashRoot, matched by keywords.
 * POST /api/ai
 *   { query, lang?: 'en'|'hi'|'ur'|'ks', history?: {role,text}[], speakAs?: 'hi',
 *     page?: string  // where the person is (portal guide), e.g. "Farmer portal: …buttons…" }
 *   → { reply, lang, speech? }  (speech: the reply in Devanagari, for a Hindi voice)
 *
 * Prices and weather are never answered from memory: Claude calls the tools,
 * which read rates posted by KashRoot's approved Mandi Helpers, Agmarknet
 * and Open-Meteo data. It also knows how KashRoot
 * is laid out, so it can walk someone who cannot read through the site.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { asLang, claudeClient, claudeConfigured, claudeFailure, LANGUAGE, MODEL, speechInstruction, splitSpeech, textOf, throttled } from '@/lib/server/claude';
import { detectReplyLang } from '@/lib/langDetect';
import { basicAnswer, quickIntent } from '@/lib/server/basicAssistant';
import { fetchMandiPrices } from '@/lib/server/mandi';
import { bhashiniConfigured, toKashmiri } from '@/lib/server/bhashini';
import { finishKashmiri, kashmiriExamples, kashmiriLexicon, kashmiriSystem, KS_MODEL, ksPhrase, type KsLexicon } from '@/lib/server/kashmiri';
import { postedRates } from '@/lib/server/postedRates';
import { forecast, geocode } from '@/lib/server/weather';

export const maxDuration = 60;

const SYSTEM = `You are KashRoot's voice assistant. KashRoot is a trade and services platform used by growers, traders, buyers and small businesses — many in Jammu and Kashmir and across North India, many who cannot read well: your answer is read aloud by their phone.

Answer exactly what the person asked, whatever the topic — farming, markets and the weather, but equally health, education, money, government schemes, technology, language, maths, history, everyday life or a simple chat. Do not change the subject to mandi prices, weather or KashRoot unless the question is about them, and do not end by suggesting them. If you are unsure what they meant, ask one short question back. You have no internet access beyond the two tools: for news or anything that changes often, say your knowledge may be out of date. For medical, legal or money decisions, give clear general guidance and say when to see a doctor, lawyer or bank.

Write the way a kind, patient expert talks: short plain sentences, no markdown, no lists, no emojis. Usually two to five sentences; go longer only when the person asks for detail or steps. Lead with the answer; do not open with a greeting such as Salaam or Hello. Latency-sensitive; begin your visible answer immediately.

Never make up prices, rates or weather figures. For any market price or weather question, call a tool and quote only what it returned, naming the market and date, or the place. If a tool returns NO_DATA or SERVICE_UNAVAILABLE, say plainly that the report is not available right now and suggest another market or a nearby town — never estimate. Mandi prices are in rupees per quintal (100 kg); also give the per-kg figure. When a price question names no state, assume Jammu and Kashmir first, then Himachal Pradesh.

For crop care, give safe, widely accepted practice for orchards in the region, timed by crop stage. Name the type of chemical, never a dose, and tell the person to follow the label or ask the horticulture department — or to use KashRoot's Advisory portal to ask an agronomist.

You also guide people around the KashRoot website. Name buttons and tabs exactly as written. The site has:
- Home page: voice assistant (this), live mandi rates and weather, Orchard Health, fertiliser check, and a card for every portal. On phones, the Menu button at the top right opens everything.
- Mandi & Weather page: "Today’s rates from the mandis" — daily rates posted by approved Mandi Helpers (traders and commission agents at the mandi), with who posted and when. A trader signs in and presses "Post rates for your mandi" to apply; once KashRoot approves, "Post today’s rate" appears.
- Farmer portal: press List produce, choose the crop, write the price and how many boxes, then Save; buyers see it on Price Comparison. Orders tab: Accept, then Mark shipped, then Money received once the buyer pays. Payouts tab: the farmer's UPI ID or bank account, where buyers pay.
- Price Comparison (also Buyer portal): compare farm inputs or fruit and produce, cheapest first; press Order, give quantity and address. Pay after delivery: nothing is paid up front; when the goods arrive the buyer presses I received the goods in My orders and pays the seller directly from a UPI app, then types the payment number. KashRoot does not hold money. Seller portal: Add product, accept and ship orders, Payouts for UPI or bank details.
- Rental portal: Cold storage tab shows cold stores with free boxes; press Book, choose boxes and months, then pay the owner by UPI and enter the payment number. My cold store tab is for owners to list their store and confirm bookings. Machinery tab for tractors and sprayers.
- Advisory portal: Ask an expert — ask a question with a photo, book a soil test, or ask for a video call; answers appear in My requests and can be listened to.
- Orchard Health: Scab risk for your own blocks from the weather, Photo diagnosis of a leaf or fruit, Spray log that tells when it is safe to harvest.
- Fertiliser check (home page and Agro-dealer portal): photograph the label or type the batch number to see if a registered dealer sold it, and report fakes.
- Tracking portal: track a truck with the KashRoot code your transporter sends; transporters create consignments and send the driver a link.
- Logistics, Kissan Tools, Agro-dealer and Admin portals for their users.
- Every portal has My details at the top, Home, and Sign out. One account can use several portals.

If the person is on a particular page (you will be told) and asks how to do something there, guide them on that page step by step.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_mandi_prices',
    description:
      'Mandi (wholesale market) prices for one commodity, optionally narrowed to an Indian state, district or market. Returns two sources: "posted_on_kashroot" — the latest rates posted on KashRoot in the last 4 days by approved Mandi Helpers (traders and commission agents at the mandi), each with its unit (box, kg or quintal), box weight, min/modal/max price, date and reporter; and "agmarknet" — the Government of India feed in INR per quintal, which is often unavailable. Prefer posted_on_kashroot, say which source and date each rate is from, and never guess a rate. Use for any question about crop rates or market prices.',
    input_schema: {
      type: 'object',
      properties: {
        commodity: { type: 'string', description: 'Agmarknet commodity name in English, e.g. Apple, Walnut, Pear, Cherry, Onion, Potato, Tomato' },
        state: { type: 'string', description: 'Indian state or union territory in English, e.g. Jammu and Kashmir, Himachal Pradesh, Punjab, Delhi' },
        district: { type: 'string', description: 'District name in English' },
        market: { type: 'string', description: 'Mandi (market) name in English' },
      },
      required: ['commodity'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_weather',
    description: 'Current weather and a 4-day forecast (temperature, humidity, rain, wind) for a town, district or village in India. Use for any weather, rain, frost or spraying-window question.',
    input_schema: {
      type: 'object',
      properties: { place: { type: 'string', description: 'Town, district or village name in English' } },
      required: ['place'],
      additionalProperties: false,
    },
    strict: true,
  },
];

/** A tool call may not use more than this, so the whole answer fits the route's time limit. */
const TOOL_BUDGET_MS = 25_000;

const withBudget = <T,>(work: Promise<T>): Promise<T> =>
  Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), TOOL_BUDGET_MS))]);

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  try {
    if (name === 'get_mandi_prices') {
      const commodity = str(input.commodity);
      if (!commodity) return { result: 'BAD_INPUT', note: 'commodity is required' };
      const [state, district, market] = [str(input.state), str(input.district), str(input.market)];
      const [posted, gov] = await Promise.allSettled([
        withBudget(postedRates(commodity)),
        withBudget(fetchMandiPrices({ commodity, state, district, market, limit: 200 })),
      ]);
      // "Parimpora (Srinagar)" matches "Parimpora", "Srinagar" and "Parimpora mandi".
      const near = (v: string | null, want?: string) => {
        if (!want) return true;
        const [a, b] = [(v ?? '').toLowerCase(), want.toLowerCase()];
        return Boolean(a) && (a.includes(b) || b.includes(a.replace(/\s*\(.*\)/, '')));
      };
      const ours = posted.status === 'fulfilled' ? posted.value.filter((r) => near(r.state, state) && (near(r.mandi, market) || near(r.district, market)) && (near(r.district, district) || near(r.mandi, district))) : [];
      const all = posted.status === 'fulfilled' ? posted.value : [];
      const rows = gov.status === 'fulfilled' ? gov.value.records : [];
      if (!all.length && !rows.length) {
        return gov.status === 'rejected'
          ? { result: 'SERVICE_UNAVAILABLE', note: `No rate for this crop was posted on KashRoot in the last 4 days, and Agmarknet did not answer (${gov.reason instanceof Error ? gov.reason.message : String(gov.reason)}).` }
          : { result: 'NO_DATA', note: 'No rate for this crop was posted on KashRoot in the last 4 days, and no market reported it for that area in the Agmarknet feed.' };
      }
      return {
        posted_on_kashroot: (ours.length ? ours : all).slice(0, 12).map((r) => ({
          mandi: r.mandi,
          district: r.district,
          state: r.state,
          crop: r.commodity,
          variety: r.variety,
          grade: r.grade,
          unit: r.unit === 'box' ? `INR per box${r.box_kg ? ` of ${r.box_kg} kg` : ''}` : `INR per ${r.unit}`,
          min: r.min_price,
          modal: r.modal_price,
          max: r.max_price,
          date: r.rate_date,
          reporter: r.reporter_name,
          checked: r.status === 'verified' ? 'confirmed by another trader, a farmer or KashRoot' : 'not yet confirmed',
          note: r.note,
        })),
        posted_note: all.length && !ours.length ? 'Nothing posted for the exact area asked; these are other mandis.' : undefined,
        agmarknet: rows.length
          ? { unit: 'INR per quintal', source: gov.status === 'fulfilled' ? gov.value.source : undefined, rows: rows.slice(0, 12).map((x) => ({ market: x.market, district: x.district, state: x.state, variety: x.variety, date: x.arrivalDate, min: x.minPrice, max: x.maxPrice, modal: x.modalPrice })) }
          : { result: gov.status === 'rejected' ? 'SERVICE_UNAVAILABLE' : 'NO_DATA' },
      };
    }
    if (name === 'get_weather') {
      const placeName = str(input.place);
      if (!placeName) return { result: 'BAD_INPUT', note: 'place is required' };
      const place = (await withBudget(geocode(placeName, { deep: true })))[0];
      if (!place) return { result: 'NO_DATA', note: `No place called ${placeName} was found.` };
      const f = await withBudget(forecast(place));
      return {
        place: `${place.name}${place.admin ? `, ${place.admin}` : ''}`,
        now: { temperatureC: f.current.temperature, humidity: f.current.humidity, precipitationMm: f.current.precipitation, windKmh: f.current.wind, observedAt: f.current.time },
        nextDays: f.daily.slice(0, 4).map((d) => ({ date: d.date, maxC: d.max, minC: d.min, rainMm: d.precipitation })),
        source: f.source,
      };
    }
    return { result: 'UNKNOWN_TOOL' };
  } catch (err) {
    return { result: 'SERVICE_UNAVAILABLE', note: err instanceof Error ? err.message : String(err) };
  }
}

export function GET() {
  const configured = claudeConfigured();
  return NextResponse.json({ configured, basic: !configured, kashmiri: bhashiniConfigured() ? 'bhashini' : configured ? 'ai' : 'urdu' }, { headers: { 'cache-control': 'no-store' } });
}

/**
 * Kashmiri from English: Bhashini (the government's translator) when it is
 * set up, else the AI itself — with the words and answers native speakers
 * taught in the Kashmiri Lab, then checked for Urdu and given back its vowel
 * marks (finishKashmiri). Returns null when neither can do it.
 */
async function kashmiriFrom(english: string, wantDevanagari: boolean, client: Anthropic | null, lex: KsLexicon, query: string): Promise<{ reply: string; speech?: string } | null> {
  const finish = async (text: string, speech?: string) => {
    const done = await finishKashmiri(text, { client, lex, query, wantDevanagari, speech });
    return { reply: done.reply, ...(done.speech ? { speech: done.speech } : {}) };
  };
  if (bhashiniConfigured()) {
    try {
      const [reply, speech] = await Promise.all([toKashmiri(english, 'Arab'), wantDevanagari ? toKashmiri(english, 'Deva').catch(() => undefined) : Promise.resolve(undefined)]);
      return await finish(reply, speech);
    } catch {
      /* fall through to the AI */
    }
  }
  if (!client) return null;
  try {
    const response = await client.beta.messages.create({
      model: KS_MODEL,
      max_tokens: 3000,
      system: [
        `You translate an assistant's answer for someone in Kashmir. Write it in ${LANGUAGE.ks}. Translate the meaning naturally, the way a Kashmiri speaker would say it — not word for word, and never as Urdu. Keep numbers, prices, units, place names and button names (in English) exactly as they are. Output only the translation.${wantDevanagari ? ` ${speechInstruction('ks')}` : ''}`,
        kashmiriSystem(lex, query),
        kashmiriExamples(lex, query),
      ].filter(Boolean).join('\n\n'),
      messages: [{ role: 'user', content: english }],
      // Good Kashmiri needs more care than the other languages.
      output_config: { effort: 'medium' },
    });
    const full = textOf(response.content);
    if (!full) return null;
    const { text, speech } = splitSpeech(full);
    return await finish(text, wantDevanagari ? speech : undefined);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (throttled(req, 20)) return NextResponse.json({ error: 'Too many questions at once. Please wait a minute.' }, { status: 429 });
  let body: { query?: string; lang?: string; exact?: boolean; history?: { role: string; text: string }[]; speakAs?: string; page?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const query = body.query?.trim().slice(0, 600);
  const lang = body.exact ? asLang(body.lang) : detectReplyLang(body.query ?? '', asLang(body.lang));
  const wantDevanagari = (lang === 'ur' || lang === 'ks') && body.speakAs === 'hi';
  if (!query) return NextResponse.json({ error: 'Say or type a question.' }, { status: 400 });

  const client = claudeClient();
  const kashmiriTranslator = lang === 'ks' && bhashiniConfigured();
  // Kashmiri: what native speakers taught in the Kashmiri Lab (cached).
  const lex = lang === 'ks' ? await kashmiriLexicon() : null;
  /** "Sorry, try again" in the person's language — never Urdu for a Kashmiri speaker. */
  const sorry = () =>
    lex
      ? ksPhrase(lex, 'assistant.sorry')
      : {
          en: 'Sorry, I could not answer that just now. Please try again in a minute.',
          hi: 'माफ़ कीजिए, अभी जवाब नहीं दे सका। कृपया एक मिनट बाद फिर पूछें।',
          ur: 'معاف کیجیے، ابھی جواب نہیں دے سکا۔ براہِ کرم ایک منٹ بعد پھر پوچھیں۔',
          ks: 'Sorry, I could not answer that just now. Please try again in a minute.',
        }[lang];
  // Prices, weather and how-to questions: answered at once from live data,
  // without waiting for (or paying for) the AI. Crop problems still go to it.
  // Built-in answers exist in English, Hindi and Urdu only — for Kashmiri they
  // are translated (Bhashini), or the AI answers in Kashmiri itself.
  if ((client && quickIntent(query)) || !client) {
    if (lang === 'ks' && lex && (kashmiriTranslator || client)) {
      const en = await basicAnswer(query, 'en');
      const ks = await kashmiriFrom(en.reply, wantDevanagari, client, lex, query);
      if (ks) return NextResponse.json({ ...ks, lang, quick: true });
    } else {
      const a = await basicAnswer(query, lang);
      return NextResponse.json({ reply: a.reply, lang, ...(client ? { quick: true } : { basic: true }), ...(a.speech ? { speech: a.speech } : {}) });
    }
    if (!client) {
      // No AI and no translator: the closest written language (Urdu).
      const a = await basicAnswer(query, lang);
      return NextResponse.json({ reply: a.reply, lang, basic: true, ...(a.speech ? { speech: a.speech } : {}) });
    }
  }

  // Per-turn instructions go after the stable system prompt so it stays cacheable.
  // With Bhashini, the AI answers in English and Bhashini writes the Kashmiri.
  let instruction = kashmiriTranslator ? 'Reply in simple English; it will be translated into Kashmiri.' : `Reply in ${LANGUAGE[lang]}.`;
  if (lang === 'ks') instruction += ' The question may have come through Urdu speech recognition; understand it as Kashmiri or Urdu.';
  if (lang === 'ks' && !kashmiriTranslator) instruction += ' Reply only in Kashmiri, even if the question is in English, Hindi or Urdu.';
  const kashmiriAi = lang === 'ks' && !kashmiriTranslator && lex;
  const nativeExamples = kashmiriAi ? kashmiriExamples(lex, query) : '';
  if (wantDevanagari && !kashmiriTranslator) instruction += ` ${speechInstruction(lang)}`;
  const page = body.page?.trim().slice(0, 1200);
  if (page) instruction += ` The person is on this KashRoot page right now: ${page}`;

  const history: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of (body.history ?? []).slice(-8)) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const text = String(h.text ?? '').slice(0, 800).trim();
    if (!text) continue;
    // Keep strict user/assistant alternation, starting with a user turn.
    if (history.length === 0 && role === 'assistant') continue;
    if (history.at(-1)?.role === role) history.pop();
    history.push({ role, content: text });
  }
  if (history.at(-1)?.role === 'user') history.pop();

  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: 'user', content: `${query}\n\n(${instruction})${nativeExamples ? `\n\n${nativeExamples}` : ''}` }];
  // Kashmiri: standing rules and the editors' words, after the main prompt (both cacheable).
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }];
  if (kashmiriAi) system.push({ type: 'text', text: kashmiriSystem(lex, query), cache_control: { type: 'ephemeral' } });

  try {
    for (let round = 0; round < 4; round++) {
      const response = await client.beta.messages.create({
        model: kashmiriAi ? KS_MODEL : MODEL,
        max_tokens: 4000,
        system,
        tools: TOOLS,
        messages,
        output_config: { effort: lang === 'ks' && !kashmiriTranslator ? 'medium' : 'low' },
      });

      if (response.stop_reason === 'refusal') {
        return NextResponse.json({ reply: lang === 'en' ? 'Sorry, I can’t help with that one. Ask me about crops, mandi prices, the weather or how to use KashRoot.' : sorry(), lang });
      }
      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
        const results = await Promise.all(
          calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => ({
            type: 'tool_result',
            tool_use_id: c.id,
            content: JSON.stringify(await runTool(c.name, (c.input ?? {}) as Record<string, unknown>)),
          })),
        );
        messages.push({ role: 'user', content: results });
        continue;
      }
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }

      const full = textOf(response.content);
      if (!full) return NextResponse.json({ reply: sorry(), lang });
      if (kashmiriTranslator && lex) {
        // The answer was written in English for the translator: never show it untranslated.
        const ks = await kashmiriFrom(full, wantDevanagari, client, lex, query);
        return NextResponse.json(ks ? { ...ks, lang } : { reply: sorry(), lang });
      }
      const { text, speech } = splitSpeech(full);
      if (lex) {
        const done = await finishKashmiri(text, { client, lex, query, wantDevanagari, speech: wantDevanagari ? speech : undefined });
        return NextResponse.json({ reply: done.reply, lang, ...(done.speech ? { speech: done.speech } : {}) });
      }
      return NextResponse.json({ reply: text, lang, ...(wantDevanagari && speech ? { speech } : {}) });
    }
    return NextResponse.json({ reply: sorry(), lang });
  } catch (err) {
    // The AI could not answer: still answer what basic mode can (prices,
    // weather, how-to), so the farmer is never left with an error.
    const f = claudeFailure(err);
    // Not a price / weather / how-to question: don't answer with the menu of
    // what basic mode can do — say plainly that the answer failed.
    // Kashmiri: basic answers exist only in Urdu, so say sorry in Kashmiri instead.
    if (!quickIntent(query) || lex) return NextResponse.json({ reply: sorry(), lang, basic: true, aiError: f.error });
    const a = await basicAnswer(query, lang);
    return NextResponse.json({ reply: a.reply, lang, basic: true, aiError: f.error, ...(a.speech ? { speech: a.speech } : {}) });
  }
}
