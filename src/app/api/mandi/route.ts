/**
 * GET /api/mandi?state=&district=&market=&commodity=&limit=
 * Live Agmarknet prices (Rs/quintal) via data.gov.in. Never fabricates: an
 * empty board is returned as an empty list.
 */
import { NextResponse } from 'next/server';

import { fetchMandiPrices } from '@/lib/server/mandi';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const pick = (k: string) => q.get(k)?.slice(0, 80) || undefined;
  try {
    const result = await fetchMandiPrices({
      state: pick('state'),
      district: pick('district'),
      market: pick('market'),
      commodity: pick('commodity'),
      limit: Number(q.get('limit')) || 300,
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } });
  } catch (err) {
    return NextResponse.json(
      { error: 'The government mandi price service did not respond. Try again in a minute.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
