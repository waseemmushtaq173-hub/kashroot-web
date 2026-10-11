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
 * which read live Agmarknet and Open-Meteo data. It also knows how KashRoot
 * is laid out, so it can walk someone who cannot read through the site.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { asLang, claudeClient, claudeConfigured, claudeFailure, LANGUAGE, MODEL, speechInstruction, splitSpeech, textOf, throttled } from '@/lib/server/claude';
import { basicAnswer } from '@/lib/server/basicAssistant';
import { fetchMandiPrices } from '@/lib/server/mandi';
import { forecast, geocode } from '@/lib/server/weather';

export const maxDuration = 60;

const SYSTEM = `You are KashRoot's voice assistant for growers, traders and buyers of horticulture produce in the hill valleys of North India — apples, pears, cherries, walnuts, almonds, saffron, rice and vegetables. Many people using you cannot read well: your answer is read aloud by their phone.

Write the way a kind, patient agronomist talks: short plain sentences, no markdown, no lists, no emojis, at most about 80 words. Lead with the answer. Latency-sensitive; begin your visible answer immediately.

Never make up numbers. For any market price or weather question, call a tool and quote only what it returned, naming the market and date, or the place. If a tool returns NO_DATA or SERVICE_UNAVAILABLE, say plainly that the report is not available right now and suggest another market or a nearby town — never estimate. Mandi prices are in rupees per quintal (100 kg); also give the per-kg figure. When a price question names no state, assume Jammu and Kashmir first, then Himachal Pradesh.

For crop care, give safe, widely accepted practice for orchards in the region, timed by crop stage. Name the type of chemical, never a dose, and tell the person to follow the label or ask the horticulture department — or to use KashRoot's Advisory portal to ask an agronomist.

You also guide people around the KashRoot website. Name buttons and tabs exactly as written. The site has:
- Home page: voice assistant (this), live mandi rates and weather, Orchard Health, fertiliser check, and a card for every portal. On phones, the Menu button at the top right opens everything.
- Farmer portal: press List produce, choose the crop, write the price and how many boxes, then Save; buyers see it on Price Comparison. Orders tab: Accept, then Mark shipped, then Money received once the buyer pays. Payouts tab: the farmer's UPI ID or bank account, where buyers pay.
- Price Comparison (also Buyer portal): compare farm inputs or fruit and produce, cheapest first; press Order, give quantity and address. Pay after delivery: nothing is paid up front; when the goods arrive the buyer presses I received the goods in My orders and pays the seller directly from a UPI app, then types the payment number. KashRoot does not hold money. Seller portal: Add product, accept and ship orders, Payouts for UPI or bank details.
- Rental portal: Cold storage tab shows cold stores with free boxes; press Book, choose boxes and months, then pay the owner by UPI and enter the payment number. My cold store tab is for owners to list their store and confirm bookings. Machinery tab for tractors and sprayers.
- Advisory portal: Ask an expert — ask a question with a photo, book a soil test, or ask for a video call; answers appear in My requests and can be listened to.
- Orchard Health: Scab risk for your own blocks from the weather, Photo diagnosis of a leaf or fruit, Spray log that tells when it is safe to harvest.
- Fertiliser check (home page and Agro-dealer portal): photograph the label or type the batch number to see if a registered dealer sold it, and report fakes.
- Tracking portal: track a truck with the KashRoot code your transporter sends; transporters create consignments and send the driver a link.
- Logistics, Kissan Tools, Agro-dealer and Admin portals for their users.
- Every portal has My details at the top, Home, and Sign out. One account can use several portals.

If the person is on a particular page (you will be told), guide them on that page step by step. If a question is outside farming, markets, weather or the site, answer briefly and kindly, then steer back.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_mandi_prices',
    description:
      'Live wholesale mandi prices from Agmarknet (Government of India) for one commodity, optionally narrowed to an Indian state, district or market. Returns up to 12 recent rows with min, max and modal price in INR per quintal and the arrival date. Use for any question about crop rates or market prices.',
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
      const r = await withBudget(fetchMandiPrices({ commodity, state: str(input.state), district: str(input.district), market: str(input.market), limit: 200 }));
      if (r.records.length === 0) return { result: 'NO_DATA', note: 'No market reported this commodity for that area in the current feed.' };
      return {
        unit: 'INR per quintal',
        source: r.source,
        rows: r.records.slice(0, 12).map((x) => ({ market: x.market, district: x.district, state: x.state, variety: x.variety, date: x.arrivalDate, min: x.minPrice, max: x.maxPrice, modal: x.modalPrice })),
      };
    }
    if (name === 'get_weather') {
      const placeName = str(input.place);
      if (!placeName) return { result: 'BAD_INPUT', note: 'place is required' };
      const place = (await withBudget(geocode(placeName)))[0];
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
  return NextResponse.json({ configured, basic: !configured }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  if (throttled(req, 20)) return NextResponse.json({ error: 'Too many questions at once. Please wait a minute.' }, { status: 429 });
  let body: { query?: string; lang?: string; history?: { role: string; text: string }[]; speakAs?: string; page?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const query = body.query?.trim().slice(0, 600);
  const lang = asLang(body.lang);
  const wantDevanagari = (lang === 'ur' || lang === 'ks') && body.speakAs === 'hi';
  if (!query) return NextResponse.json({ error: 'Say or type a question.' }, { status: 400 });

  const client = claudeClient();
  if (!client) {
    // No AI key: answer what can be answered from live data and fixed help.
    const a = await basicAnswer(query, lang);
    return NextResponse.json({ reply: a.reply, lang, basic: true, ...(a.speech ? { speech: a.speech } : {}) });
  }

  // Per-turn instructions go after the stable system prompt so it stays cacheable.
  let instruction = `Reply in ${LANGUAGE[lang]}.`;
  if (lang === 'ks') instruction += ' The question may have come through Urdu speech recognition; understand it as Kashmiri or Urdu.';
  if (wantDevanagari) instruction += ` ${speechInstruction(lang)}`;
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

  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: 'user', content: `${query}\n\n(${instruction})` }];

  try {
    for (let round = 0; round < 4; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
        output_config: { effort: 'low' },
      });

      if (response.stop_reason === 'refusal') {
        return NextResponse.json({ reply: 'Sorry, I can’t help with that one. Ask me about crops, mandi prices, the weather or how to use KashRoot.', lang });
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
      if (!full) return NextResponse.json({ reply: 'Sorry, I could not form an answer. Please ask again.', lang });
      const { text, speech } = splitSpeech(full);
      return NextResponse.json({ reply: text, lang, ...(wantDevanagari && speech ? { speech } : {}) });
    }
    return NextResponse.json({ reply: 'Sorry, that took too many steps. Please ask in a simpler way.', lang });
  } catch (err) {
    // The AI could not answer: still answer what basic mode can (prices,
    // weather, how-to), so the farmer is never left with an error.
    const f = claudeFailure(err);
    const a = await basicAnswer(query, lang);
    return NextResponse.json({ reply: a.reply, lang, basic: true, aiError: f.error, ...(a.speech ? { speech: a.speech } : {}) });
  }
}
