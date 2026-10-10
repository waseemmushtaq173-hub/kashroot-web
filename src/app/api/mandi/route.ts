/**
 * GET /api/mandi?state=&district=&market=&commodity=&limit=
 * Live Agmarknet prices (Rs/quintal) from agmarknet.gov.in, with data.gov.in
 * as the backup. Never fabricates: an empty board is returned as an empty list.
 */
import { NextResponse } from 'next/server';

import { fetchMandiPrices, MandiError } from '@/lib/server/mandi';

// data.gov.in can take a while; allow for one slow attempt plus a retry.
export const maxDuration = 60;

const WHY: Record<MandiError['kind'], string> = {
  timeout: 'The government mandi price services (Agmarknet and data.gov.in) are very slow right now and did not answer in time. Try again in a minute.',
  network: 'Could not connect to the government mandi price services (Agmarknet and data.gov.in). Try again in a minute.',
  key: 'The government data service refused this site’s API key. The site owner needs to check DATA_GOV_IN_API_KEY.',
  upstream: 'The government mandi price services (Agmarknet and data.gov.in) are having trouble right now. Try again in a minute.',
};

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const pick = (k: string) => q.get(k)?.slice(0, 80) || undefined;
  try {
    const result = await fetchMandiPrices({
      state: pick('state'),
      district: pick('district'),
      market: pick('market'),
      commodity: pick('commodity'),
      limit: Math.min(Number(q.get('limit')) || 150, 500),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof MandiError ? WHY[err.kind] : WHY.upstream, detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
