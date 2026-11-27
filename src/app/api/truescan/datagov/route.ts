/**
 * GET /api/truescan/datagov?q=…
 * What data.gov.in publishes about pesticides and fertilisers for a word typed in TrueScan (src/lib/dataGovTruescan.ts),
 * looked up with the site's own key. Public, like TrueScan; held to a few searches a minute per network.
 * The answer carries rows as the Government published them, their dataset's name and date, and never the key.
 */
import { NextResponse } from 'next/server';

import { latestDataGov, searchDataGov } from '@/lib/dataGovTruescan';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (ipLimited(request, 'truescan-datagov', 30)) return tooMany();
  const params = new URL(request.url).searchParams;
  // ?latest=1: the most recently updated datasets with their newest rows, for the card on the TrueScan page.
  if (params.get('latest')) {
    const latest = await latestDataGov({ DATA_GOV_IN_API_KEY: process.env.DATA_GOV_IN_API_KEY, TRUESCAN_DATAGOV_RESOURCES: process.env.TRUESCAN_DATAGOV_RESOURCES });
    return NextResponse.json(latest, { status: latest.ok || latest.reason === 'no_datasets' || latest.reason === 'no_key' ? 200 : 502, headers: { 'cache-control': 'no-store' } });
  }
  const q = params.get('q') ?? '';
  const answer = await searchDataGov(q, {
    DATA_GOV_IN_API_KEY: process.env.DATA_GOV_IN_API_KEY,
    TRUESCAN_DATAGOV_RESOURCES: process.env.TRUESCAN_DATAGOV_RESOURCES,
  });
  return NextResponse.json(answer, { status: answer.ok || answer.reason === 'no_datasets' || answer.reason === 'no_key' ? 200 : answer.reason === 'bad_query' ? 400 : 502, headers: { 'cache-control': 'no-store' } });
}
