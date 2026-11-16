/**
 * GET /api/truescan/directory
 * The registered / banned pesticide list (CIB&RC, ppqs.gov.in) and the
 * Fertiliser (Control) Order, 1985 standards, as bundled with KashRoot. They
 * are typed in from those sources and say so in `source`; they are not checked
 * against the official register.
 *
 * The data.gov.in key (DATA_GOV_IN_API_KEY) is for Agmarknet mandi prices only.
 * Mandi data is crop prices, not a pesticide or fertiliser registry, so this
 * route never calls it.
 *
 * Query params:
 *   q - search term for matching across CIB&RC registered, banned, and FCO data
 */
import { NextResponse } from 'next/server';
import { ipLimited, tooMany } from '@/lib/server/sign';
import {
  REFERENCE_SOURCE,
  searchAllEmbedded,
  EMBEDDED_CIBRC_REGISTERED,
  EMBEDDED_CIBRC_BANNED,
  EMBEDDED_FCO_STANDARDS,
} from '@/lib/gov-agro-registry';

export const dynamic = 'force-dynamic';

/** Said plainly: these lists are typed into KashRoot from the Government sources, not checked against the official register. */
const SOURCE = REFERENCE_SOURCE;

export async function GET(request: Request) {
  if (ipLimited(request, 'truescan-directory', 5)) return tooMany();

  const q = new URL(request.url).searchParams.get('q');

  if (q && q.trim().length >= 2) {
    const hits = searchAllEmbedded(q.trim());
    return NextResponse.json({
      query: q.trim(),
      results: hits,
      count: hits.length,
      source: SOURCE,
      synced_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    cibrc_registered: EMBEDDED_CIBRC_REGISTERED,
    cibrc_banned: EMBEDDED_CIBRC_BANNED,
    fco: EMBEDDED_FCO_STANDARDS,
    source: SOURCE,
    synced_at: new Date().toISOString(),
  });
}
