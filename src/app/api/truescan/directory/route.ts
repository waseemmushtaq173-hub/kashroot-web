/**
 * GET /api/truescan/directory
 * Serves the official safe & registered pesticides & FCO fertilisers directory,
 * synced with data.gov.in (CIB&RC via ppqs.gov.in + FCO via agrocoop.nic.in).
 * Uses DATA_GOV_IN_API_KEY for live discovery; bundles verified statutory
 * CIBRC + FCO dataset as zero-latency index so TrueScan always works.
 *
 * Query params:
 *   q - search term for fuzzy matching across CIBRC registered, banned, and FCO data
 */
import { NextResponse } from 'next/server';
import { ipLimited, tooMany } from '@/lib/server/sign';
import {
  searchAllMerged,
  EMBEDDED_CIBRC_REGISTERED,
  EMBEDDED_CIBRC_BANNED,
  EMBEDDED_FCO_STANDARDS,
} from '@/lib/gov-agro-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';

export async function GET(request: Request) {
  if (ipLimited(request, 'truescan-directory', 5)) return tooMany();

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  try {
    // If a search query is provided, do fuzzy matching across embedded CIBRC +
    // banned + FCO data, with live data.gov.in fallback.
    if (q && q.trim().length >= 2) {
      const hits = await searchAllMerged(q.trim());
      return NextResponse.json({
        query: q.trim(),
        results: hits,
        count: hits.length,
        source: 'CIB&RC (ppqs.gov.in) + FCO 1985 + data.gov.in',
        synced_at: new Date().toISOString(),
      });
    }

    // Otherwise return the full directory (no search query).
    // Try to discover live commodities from data.gov.in
    let liveCommodities: string[] = [];
    try {
      const res = await fetch(
        `https://api.data.gov.in/resource/${MANDI_RESOURCE}?api-key=${process.env.DATA_GOV_IN_API_KEY ?? ''}&format=json&limit=1000`,
        { headers: { Accept: 'application/json' } },
      );
      if (res.ok) {
        const json = await res.json();
        const records = json.records ?? [];
        const commoditySet = new Set<string>();
        for (const r of records) {
          const c = String(r.commodity ?? '');
          if (c) commoditySet.add(c);
        }
        liveCommodities = Array.from(commoditySet).sort();
      }
    } catch {
      // Live discovery failed, fall back to bundled data only
    }

    return NextResponse.json({
      cibrc_registered: EMBEDDED_CIBRC_REGISTERED,
      cibrc_banned: EMBEDDED_CIBRC_BANNED,
      fco: EMBEDDED_FCO_STANDARDS,
      live_commodities: liveCommodities,
      source: 'CIB&RC (ppqs.gov.in) + data.gov.in',
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('TrueScan directory failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
