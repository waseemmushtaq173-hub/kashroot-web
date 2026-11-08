/**
 * GET /api/mandi/commodities
 * Discovers every unique commodity, variety, state, district and market
 * currently reporting on data.gov.in's Agmarknet feed.
 * Uses the live DATA_GOV_IN_API_KEY so nothing is ever hardcoded.
 */
import { NextResponse } from 'next/server';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
const API_KEY = process.env.DATA_GOV_IN_API_KEY ?? '';

export async function GET(request: Request) {
  if (ipLimited(request, 'mandi-commodities', 5)) return tooMany();

  try {
    const res = await fetch(
      `https://api.data.gov.in/resource/${MANDI_RESOURCE}?api-key=${API_KEY}&format=json&limit=1000`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`data.gov.in answered ${res.status}`);

    const json = await res.json();
    const records = json.records ?? [];

    // Extract unique values from live records
    const commodities = new Set<string>();
    const varieties = new Map<string, Set<string>>();
    const states = new Set<string>();
    const districts = new Set<string>();
    const markets = new Set<string>();

    for (const r of records) {
      const c = String(r.commodity ?? '');
      if (c) commodities.add(c);
      if (c) {
        const v = String(r.variety ?? '');
        if (v) {
          if (!varieties.has(c)) varieties.set(c, new Set());
          varieties.get(c)!.add(v);
        }
      }
      if (String(r.state ?? '')) states.add(String(r.state));
      if (String(r.district ?? '')) districts.add(String(r.district));
      if (String(r.market ?? '')) markets.add(String(r.market));
    }

    return NextResponse.json({
      commodities: Array.from(commodities).sort(),
      varieties: Object.fromEntries([...varieties.entries()].map(([c, vs]) => [c, Array.from(vs).sort()])),
      states: Array.from(states).sort(),
      districts: Array.from(districts).sort(),
      markets: Array.from(markets).sort(),
      count: records.length,
    });
  } catch (err) {
    console.error('Mandi commodities failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
