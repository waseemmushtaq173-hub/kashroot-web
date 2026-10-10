/**
 * POST /api/ai — the KashRoot voice/text assistant, powered by Claude.
 * Body: {
 *   query: string,
 *   lang?: 'en' | 'hi' | 'ur',
 *   history?: { role: 'user' | 'assistant', text: string }[],
 *   speakAs?: 'hi'   // Urdu only: the device has a Hindi voice but no Urdu one
 * }
 * → { reply, lang, speech? }  (speech: the reply in Devanagari, for a Hindi voice)
 *
 * Key: ANTHROPIC_API_KEY (console.anthropic.com). Prices and weather are never
 * answered from memory: Claude must call the tools, which read live Agmarknet
 * (data.gov.in) and Open-Meteo data. If a tool has nothing, it says so.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { fetchMandiPrices } from '@/lib/server/mandi';
import { forecast, geocode } from '@/lib/server/weather';

export const maxDuration = 60;

const MODEL = 'claude-opus-5-5';

const LANGUAGE: Record<string, string> = {
  en: 'English',
  hi: 'Hindi, written in Devanagari script',
  ur: 'Urdu, written in Urdu (Nastaliq) script',
};

/** Marks where the Devanagari copy of an Urdu answer starts. */
const SPEECH_MARK = '@@SPEAK@@';

const SYSTEM = `You are KashRoot's voice assistant for growers, traders and buyers of horticulture produce in the hill valleys of North India — apples, pears, cherries, walnuts, almonds, saffron, and vegetables.

Your answers are read aloud by a phone, so write the way a helpful agronomist talks: plain sentences, no markdown, no bullet points, no emojis, at most about 80 words. Lead with the answer. Latency-sensitive; begin your visible answer immediately.

Never make up numbers. For any market price or weather question, call a tool and quote only what it returned, naming the market and the date, or the place. If a tool returns NO_DATA or SERVICE_UNAVAILABLE, say plainly that no report is available right now and suggest the nearest alternative (another market, a nearby town) — never estimate. Mandi prices come in rupees per quintal (100 kg); also give the per-kg figure. When a price question names no state, assume Jammu and Kashmir first, then Himachal Pradesh.

For crop care (pests, diseases, nutrition, spraying), give safe, widely accepted good practice for orchards in the region, including timing by crop stage. When chemicals come up, name the type of product rather than a dose, and tell the person to follow the label or confirm with an agronomist or the local horticulture department.

If a question is outside farming, markets or weather, answer briefly and kindly, then steer back to how KashRoot can help.`;

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

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  try {
    if (name === 'get_mandi_prices') {
      const commodity = str(input.commodity);
      if (!commodity) return { result: 'BAD_INPUT', note: 'commodity is required' };
      const r = await fetchMandiPrices({ commodity, state: str(input.state), district: str(input.district), market: str(input.market), limit: 200 });
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
      const place = (await geocode(placeName))[0];
      if (!place) return { result: 'NO_DATA', note: `No place called ${placeName} was found.` };
      const f = await forecast(place);
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

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();

export async function POST(req: Request) {
  let body: { query?: string; lang?: string; history?: { role: string; text: string }[]; speakAs?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const query = body.query?.trim().slice(0, 600);
  const lang = body.lang && LANGUAGE[body.lang] ? body.lang : 'en';
  const wantDevanagari = lang === 'ur' && body.speakAs === 'hi';
  if (!query) return NextResponse.json({ error: 'Say or type a question.' }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ error: 'The AI assistant is not connected yet. The site owner needs to add ANTHROPIC_API_KEY in the hosting settings.' }, { status: 503 });
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim(), timeout: 45_000, maxRetries: 1 });

  // Per-turn instructions go after the stable system prompt so it stays cacheable.
  let instruction = `Reply in ${LANGUAGE[lang]}.`;
  if (wantDevanagari) {
    instruction += ` After your Urdu answer, write a new line containing only ${SPEECH_MARK}, then the same answer transliterated into Devanagari script (same words, Hindustani pronunciation) so a Hindi voice can read it aloud.`;
  }

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
    for (let round = 0; round < 5; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
        output_config: { effort: 'low' },
        // If a safety check declines, Anthropic re-runs it on its recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });

      if (response.stop_reason === 'refusal') {
        return NextResponse.json({ reply: 'Sorry, I can’t help with that one. Ask me about crops, mandi prices or the weather.', lang });
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
      const [reply, speech] = full.split(SPEECH_MARK).map((s) => s.trim());
      return NextResponse.json({ reply: reply || full, lang, ...(wantDevanagari && speech ? { speech } : {}) });
    }
    return NextResponse.json({ reply: 'Sorry, that took too many steps. Please ask in a simpler way.', lang });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('AI route: ANTHROPIC_API_KEY was rejected');
      return NextResponse.json({ error: 'The AI assistant’s key was rejected. The site owner needs to check ANTHROPIC_API_KEY.' }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'The assistant is busy right now. Please try again in a minute.' }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('AI route: Claude API error', err.status, err.message);
      const credit = err.status === 400 && /credit balance/i.test(err.message);
      return NextResponse.json({ error: credit ? 'The AI assistant has run out of credit. The site owner needs to top up the Anthropic account.' : 'The assistant could not answer just now. Please try again.' }, { status: 502 });
    }
    console.error('AI route error:', err);
    return NextResponse.json({ error: 'The assistant could not reach its AI service. Please try again.' }, { status: 502 });
  }
}
