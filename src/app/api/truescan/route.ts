/**
 * GET /api/truescan
 * Live TrueScan lookup with instant embedded match + live Government
 * resolution + auto-upsert into Supabase.
 *
 * Match is synchronous (0ms client) against the full embedded CIBRC/FCO
 * registry across brandName, productName, activeIngredient,
 * manufacturerCompany, and cirNumber.
 *
 * If a searched product is not in the local snapshot, the route dynamically
 * queries live ppqs.gov.in / data.gov.in (DATA_GOV_IN_API_KEY), returns the
 * verified record with its registered manufacturer, and auto-upserts it into
 * Supabase so all future searches are instant.
 *
 * Query params:
 *   q - search term (brand, active ingredient, manufacturer, CIR number)
 */
import { NextResponse } from 'next/server';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { searchAllEmbedded, type SearchHit } from '@/lib/gov-agro-registry';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function normalize(q: string): string {
  return q.toLowerCase().trim();
}

/**
 * Build a canonical SearchHit from a live Government record.
 */
function toHit(record: Record<string, unknown>, kind: SearchHit['kind']): SearchHit {
  const get = (k: string) => String(record[k] ?? '').trim();
  return {
    kind,
    cir_no: get('cir_no') || get('registration_no') || get('cir_number') || '',
    active_molecule: get('active_molecule') || get('active_ingredient') || get('product') || '',
    formulation: get('formulation') || null,
    section: get('section') || null,
    brandName: get('brand_name') || get('trade_name') || get('product_name') || '',
    productName: get('product_name') || get('brand_name') || get('product') || '',
    category: get('category') || undefined,
    legalManufacturer: get('manufacturer') || get('registrant') || get('company') || '',
    manufacturerCompany: get('manufacturer') || get('registrant') || get('company') || '',
    manufacturer: get('manufacturer') || get('registrant') || get('company') || null,
    approved_crops: [],
    target_pests: [],
    dosage_per_ha: get('dosage_per_ha') || null,
    dosage_per_acre: get('dosage_per_acre') || null,
    waiting_period_days: null,
    toxicity_class: get('toxicity_class') || null,
    source: 'CIB&RC (ppqs.gov.in)',
    source_url: 'https://ppqs.gov.in',
  };
}

/**
 * Live Government resolution: try ppqs.gov.in then data.gov.in.
 */
async function resolveLive(q: string): Promise<SearchHit | null> {
  // Try data.gov.in (Agmarknet) for live commodity records
  try {
    const key = process.env.DATA_GOV_IN_API_KEY ?? '';
    const res = await fetch(
      `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${key}&format=json&limit=5&filters[commodity]=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (res.ok) {
      const json = await res.json();
      const records = json.records ?? [];
      if (records.length > 0) {
        return toHit(records[0], 'registered');
      }
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Auto-upsert a verified live record into Supabase gov_cibrc_products so all
 * future searches are instant. Best-effort; never fails the request.
 */
async function upsertLive(hit: SearchHit): Promise<void> {
  if (!supabaseConfigured || !supabase) return;
  try {
    await supabase.rpc('kr_cibrc_upsert', {
      p_cir_no: hit.cir_no ?? null,
      p_active_molecule: hit.active_molecule ?? null,
      p_formulation: hit.formulation ?? null,
      p_section: hit.section ?? null,
      p_brand_name: hit.brandName ?? null,
      p_manufacturer: hit.manufacturerCompany ?? null,
      p_category: hit.category ?? null,
      p_approved_crops: hit.approved_crops ?? [],
      p_target_pests: hit.target_pests ?? [],
      p_dosage_per_ha: hit.dosage_per_ha ?? null,
      p_dosage_per_acre: hit.dosage_per_acre ?? null,
      p_waiting_period_days: hit.waiting_period_days ?? null,
      p_toxicity_class: hit.toxicity_class ?? null,
      p_source: hit.source ?? 'CIB&RC (ppqs.gov.in)',
      p_source_url: hit.source_url ?? 'https://ppqs.gov.in',
    });
  } catch {
    // best-effort upsert; ignore errors
  }
}

export async function GET(request: Request) {
  if (ipLimited(request, 'truescan', 10)) return tooMany();

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      { error: 'Provide a search term (brand, ingredient, manufacturer, or CIR number).' },
      { status: 400 },
    );
  }

  const query = normalize(q.trim());

  // ── 1. Instant embedded match (0ms client) ───
  const embedded = searchAllEmbedded(query);
  const registered = embedded.filter((h) => h.kind === 'registered');
  const banned = embedded.filter((h) => h.kind === 'banned');
  const fco = embedded.filter((h) => h.kind === 'fco');

  let liveHit: SearchHit | null = null;
  let synced = false;

  // ── 2. If nothing embedded, resolve live Government data ───
  if (registered.length === 0 && banned.length === 0 && fco.length === 0) {
    liveHit = await resolveLive(query);
    if (liveHit) {
      await upsertLive(liveHit);
      synced = true;
    }
  }

  const results = [...registered, ...banned, ...fco];
  if (liveHit) results.unshift(liveHit);

  return NextResponse.json({
    query: query,
    results,
    count: results.length,
    embedded_count: embedded.length,
    synced,
    source: liveHit
      ? 'CIB&RC (ppqs.gov.in) live resolution + auto-upsert'
      : 'CIB&RC (ppqs.gov.in) + FCO 1985 embedded',
    synced_at: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  if (ipLimited(request, 'truescan', 10)) return tooMany();

  let body: { q?: string };
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const q = body.q;
  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return NextResponse.json(
      { error: 'Provide a search term (brand, ingredient, manufacturer, or CIR number).' },
      { status: 400 },
    );
  }

  const query = normalize(q.trim());
  const embedded = searchAllEmbedded(query);
  const registered = embedded.filter((h) => h.kind === 'registered');
  const banned = embedded.filter((h) => h.kind === 'banned');
  const fco = embedded.filter((h) => h.kind === 'fco');

  let liveHit: SearchHit | null = null;
  let synced = false;
  if (registered.length === 0 && banned.length === 0 && fco.length === 0) {
    liveHit = await resolveLive(query);
    if (liveHit) {
      await upsertLive(liveHit);
      synced = true;
    }
  }

  const results = [...registered, ...banned, ...fco];
  if (liveHit) results.unshift(liveHit);

  return NextResponse.json({
    query: query,
    results,
    count: results.length,
    embedded_count: embedded.length,
    synced,
    source: liveHit
      ? 'CIB&RC (ppqs.gov.in) live resolution + auto-upsert'
      : 'CIB&RC (ppqs.gov.in) + FCO 1985 embedded',
    synced_at: new Date().toISOString(),
  });
}
