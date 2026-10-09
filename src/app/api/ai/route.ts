/**
 * POST /api/ai — the KashRoot voice/text assistant.
 * Body: { query: string, lang?: 'en' | 'hi' | 'ur', history?: { role: 'user' | 'assistant', text: string }[] }
 *
 * Model: Google Gemini (GEMINI_API_KEY; GEMINI_MODEL optional). Prices and
 * weather are never answered from memory: the model must call the tools,
 * which read live Agmarknet (data.gov.in) and Open-Meteo data. If a tool has
 * nothing, the assistant says so instead of guessing.
 */
import { NextResponse } from 'next/server';

import { fetchMandiPrices } from '@/lib/server/mandi';
import { forecast, geocode } from '@/lib/server/weather';

const LANGUAGE: Record<string, string> = {
  en: 'English',
  hi: 'Hindi, written in Devanagari script',
  ur: 'Urdu, written in Urdu (Nastaliq) script',
};

const SYSTEM = (lang: string) => `You are KashRoot's voice assistant for growers, traders and buyers of horticulture produce (apples, walnuts, almonds, cherries, saffron, vegetables).
Your answers are read aloud, so: plain sentences, no markdown, no lists, at most about 70 words.
Always reply in ${LANGUAGE[lang] ?? LANGUAGE.en}.
ZERO FABRICATION: for any market price or weather question you MUST call a tool. Quote only numbers the tool returned, with the market and date they came from. If a tool returns no data, say plainly that no report is available — never estimate.
Mandi prices from the tool are in rupees per quintal (100 kg); you may also convert to per kg.
For crop advice, give safe, general good practice and suggest confirming doses with an agronomist or the product label.`;

const TOOLS = [
  {
    function_declarations: [
      {
        name: 'get_mandi_prices',
        description: 'Live wholesale mandi prices (Agmarknet, Government of India) for a commodity, optionally narrowed by Indian state, district or market.',
        parameters: {
          type: 'OBJECT',
          properties: {
            commodity: { type: 'STRING', description: 'Agmarknet commodity name in English, e.g. Apple, Walnut, Onion, Potato, Tomato' },
            state: { type: 'STRING', description: 'Indian state name in English, e.g. Jammu and Kashmir, Himachal Pradesh, Punjab' },
            district: { type: 'STRING', description: 'District name in English' },
            market: { type: 'STRING', description: 'Mandi (market) name in English' },
          },
          required: ['commodity'],
        },
      },
      {
        name: 'get_weather',
        description: 'Current weather and the next days forecast for a place in India.',
        parameters: {
          type: 'OBJECT',
          properties: { place: { type: 'STRING', description: 'Town, district or village name in English' } },
          required: ['place'],
        },
      },
    ],
  },
];

type Part = { text?: string; functionCall?: { name: string; args: Record<string, string> }; functionResponse?: unknown };
type Content = { role: 'user' | 'model'; parts: Part[] };

async function runTool(name: string, args: Record<string, string>) {
  try {
    if (name === 'get_mandi_prices') {
      const r = await fetchMandiPrices({ commodity: args.commodity, state: args.state, district: args.district, market: args.market, limit: 200 });
      if (r.records.length === 0) return { result: 'NO_DATA', note: 'No market reported this commodity for that area in the current feed.' };
      return {
        unit: 'INR per quintal',
        source: r.source,
        rows: r.records.slice(0, 12).map((x) => ({ market: x.market, district: x.district, state: x.state, variety: x.variety, date: x.arrivalDate, min: x.minPrice, max: x.maxPrice, modal: x.modalPrice })),
      };
    }
    if (name === 'get_weather') {
      const place = (await geocode(args.place))[0];
      if (!place) return { result: 'NO_DATA', note: `No place called ${args.place} was found.` };
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

export async function POST(req: Request) {
  let body: { query?: string; lang?: string; history?: { role: string; text: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const query = body.query?.trim().slice(0, 600);
  const lang = body.lang && LANGUAGE[body.lang] ? body.lang : 'en';
  if (!query) return NextResponse.json({ error: 'Say or type a question.' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'The AI assistant is not connected yet. The site owner needs to add GEMINI_API_KEY in the hosting settings.' },
      { status: 503 },
    );
  }
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  const contents: Content[] = [
    ...(body.history ?? []).slice(-6).map((h): Content => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(h.text).slice(0, 600) }] })),
    { role: 'user', parts: [{ text: query }] },
  ];

  try {
    for (let round = 0; round < 4; round++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM(lang) }] }, contents, tools: TOOLS }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`Gemini answered ${res.status}`);
      const data = await res.json();
      const parts: Part[] = data.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);
      if (calls.length === 0) {
        const reply = parts.map((p) => p.text ?? '').join(' ').trim();
        return NextResponse.json({ reply: reply || 'Sorry, I could not form an answer. Please ask again.', lang });
      }
      contents.push({ role: 'model', parts });
      const responses = await Promise.all(
        calls.map(async (c) => ({ functionResponse: { name: c.functionCall!.name, response: await runTool(c.functionCall!.name, c.functionCall!.args ?? {}) } })),
      );
      contents.push({ role: 'user', parts: responses });
    }
    return NextResponse.json({ reply: 'Sorry, that took too many steps. Please ask in a simpler way.', lang });
  } catch (err) {
    console.error('AI route error:', err);
    return NextResponse.json({ error: 'The assistant could not reach its AI service. Please try again.' }, { status: 502 });
  }
}
