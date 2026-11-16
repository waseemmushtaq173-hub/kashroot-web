/**
 * GET|POST /api/truescan
 * TrueScan lookup against the reference lists bundled with KashRoot: CIB&RC
 * registered and banned agro-chemicals (Insecticides Act, 1968 — ppqs.gov.in)
 * and the Fertiliser (Control) Order, 1985 standards. They are typed in from
 * those sources and say so in `source`; they are not checked against the
 * official register.
 *
 * Only the lists themselves answer. Nothing is invented and nothing is
 * borrowed from another dataset: the data.gov.in key (DATA_GOV_IN_API_KEY) is
 * for Agmarknet mandi prices, which are crop prices, not pesticide or
 * fertiliser registrations, so it is not used here. A search with no match
 * says so; it never turns a mandi row into a "registered" product.
 *
 * Query params / body:
 *   q - search term (brand, active ingredient, manufacturer, CIR number)
 */
import { NextResponse } from 'next/server';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { REFERENCE_SOURCE, searchAllEmbedded } from '@/lib/gov-agro-registry';

export const dynamic = 'force-dynamic';

/** Said plainly: these lists are typed into KashRoot from the Government sources, not checked against the official register. */
const SOURCE = REFERENCE_SOURCE;

function lookup(raw: string) {
  const query = raw.toLowerCase().trim();
  const embedded = searchAllEmbedded(query);
  const registered = embedded.filter((h) => h.kind === 'registered');
  const banned = embedded.filter((h) => h.kind === 'banned');
  const fco = embedded.filter((h) => h.kind === 'fco');
  const results = [...registered, ...banned, ...fco];
  return NextResponse.json({
    query,
    results,
    count: results.length,
    source: SOURCE,
    synced_at: new Date().toISOString(),
  });
}

const NEED_TERM = { error: 'Provide a search term (brand, ingredient, manufacturer, or CIR number).' };

export async function GET(request: Request) {
  if (ipLimited(request, 'truescan', 10)) return tooMany();
  const q = new URL(request.url).searchParams.get('q');
  if (!q || q.trim().length < 2) return NextResponse.json(NEED_TERM, { status: 400 });
  return lookup(q.trim());
}

export async function POST(request: Request) {
  if (ipLimited(request, 'truescan', 10)) return tooMany();
  let body: { q?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const q = body.q;
  if (typeof q !== 'string' || q.trim().length < 2) return NextResponse.json(NEED_TERM, { status: 400 });
  return lookup(q.trim());
}
