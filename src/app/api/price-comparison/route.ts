// src/app/api/price-comparison/route.ts
// Phase 7.1 — Universal Agricultural Price Comparison API (master-upgrade v2).
//
// Merges the real marketplace listings (market_listings — the actual
// listings table in KashRoot) with the universal price board rows
// (universal_price_listings) across all 14 agricultural & input
// categories. Every marketplace row is classified into one of the board
// categories by product keywords (English + Hindi / Urdu / Kashmiri), so
// Apples, Walnuts, Saffron, Fertilizers, Pesticides, Machinery,
// Irrigation, Equipment and Other inputs all compare on one board.
//
// v2 columns (20261112000002_kashroot_master_upgrade.sql): seller_type,
// location_label, transport_cost_per_unit_inr (the landed price is the
// board's honest price), source_name, price_history (the sparklines) and
// last_updated_at — every POST writes BOTH the v1 and v2 column sets.
// OTHER_INPUTS and EQUIPMENT are aliases: filtering either returns both
// (the marketplace's "supplies" rows are classified EQUIPMENT).
//
//   GET  ?category=&district=&q=&sort=&variety=&grade=&sellerType=
//        → merged, sorted listings.
//   POST { … } → submit a verified seller offer.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'APPLES',
  'WALNUTS',
  'ALMONDS',
  'SAFFRON',
  'FRUITS',
  'VEGETABLES',
  'DRY_FRUITS',
  'SEEDS',
  'FERTILIZERS',
  'PESTICIDES',
  'MACHINERY',
  'IRRIGATION',
  'EQUIPMENT',
  'OTHER_INPUTS',
] as const;
type Category = (typeof CATEGORIES)[number];

/** OTHER_INPUTS and EQUIPMENT are one pool on the board. */
const ALIAS: Partial<Record<Category, Category>> = {
  EQUIPMENT: 'OTHER_INPUTS',
  OTHER_INPUTS: 'EQUIPMENT',
};

/** The offer-submission schema (Phase 8). */
const OfferSchema = z.object({
  sellerId: z.string().uuid().nullish(),
  sellerName: z.string().max(80).optional(),
  sellerRole: z.string().max(40).optional(),
  sellerType: z.string().max(40).optional(),
  productName: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES),
  variety: z.string().max(60).optional(),
  grade: z.string().max(40).optional(),
  district: z.string().max(80).optional(),
  marketOrVillage: z.string().max(80).optional(),
  priceInr: z.coerce.number().positive(),
  unitLabel: z.string().max(40).optional(),
  availableQuantity: z.coerce.number().min(0).optional(),
  transportCostPerUnitInr: z.coerce.number().min(0).optional(),
  deliveryCostInr: z.coerce.number().min(0).optional(),
  sourceLabel: z.string().max(60).optional(),
  sourceName: z.string().max(60).optional(),
});

const badBody = (error: z.ZodError) =>
  NextResponse.json({ ok: false, error: 'Validation failed', issues: error.flatten() }, { status: 400 });

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key, { auth: { persistSession: false } });
}

/** One keyword set per category, first match wins (most specific first). */
const KEYWORDS: ReadonlyArray<readonly [Category, readonly string[]]> = [
  ['APPLES', ['apple', 'seb', 'ambri']],
  ['WALNUTS', ['walnut', 'akhrot', 'akhrod', 'doon']],
  ['ALMONDS', ['almond', 'badam', 'mamra']],
  ['SAFFRON', ['saffron', 'kesar', 'zafran', 'kung']],
  ['FERTILIZERS', ['fertilizer', 'fertiliser', 'urea', 'dap', 'npk', 'mop', 'manure', 'compost', 'micronutrient', 'khad', 'zinc', 'sulphur', 'boron', 'calcium nitrate', 'potash']],
  ['PESTICIDES', ['pesticide', 'insecticide', 'fungicide', 'herbicide', 'weedicide', 'spray', 'imidacloprid', 'mancozeb', 'sulvex', 'captan', 'bordeaux', 'dawa']],
  ['IRRIGATION', ['drip', 'sprinkler', 'irrigation', 'hose', 'raingun', 'rain gun', 'pipe', 'polytunnel line']],
  ['SEEDS', ['seed', 'beej', 'sapling', 'rootstock']],
  ['DRY_FRUITS', ['dry fruit', 'dryfruit', 'raisin', 'kishmish', 'fig', 'anjeer', 'date', 'khajoor', 'pine nut', 'chilgoza']],
  ['VEGETABLES', ['vegetable', 'garlic', 'onion', 'tomato', 'potato', 'peas', 'cabbage', 'cauliflower', 'spinach', 'lady finger', 'coriander', 'turnip', 'radish', 'carrot', 'beet', 'cucumber', 'gourd', 'brinjal', 'capsicum', 'methi', 'saag']],
  ['MACHINERY', ['tractor', 'machine', 'machinery', 'rotavator', 'cultivator', 'tiller', 'pump', 'sprayer', 'grader', 'sorting', 'power tiller']],
  ['EQUIPMENT', ['tool', 'equipment', 'pruner', 'secateur', 'ladder', 'basket', 'crate', 'scissors', 'shears', 'saw', 'gloves', ' picking bag', 'lahei', 'kassi', 'phawda']],
  ['FRUITS', ['fruit', 'pear', 'nashpati', 'plum', 'aloo bukhara', 'peach', 'shalta', 'apricot', 'khubani', 'cherry', 'cherries', 'grape', 'angur', 'strawberry', 'quince', 'blemished']],
];

/** Classify a marketplace row into one of the board categories. */
function classify(product: string, subcategory: string | null, category: string): Category {
  const hay = `${subcategory ?? ''} ${product}`.toLowerCase();
  for (const [cat, words] of KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return cat;
  }
  return category === 'supplies' ? 'EQUIPMENT' : 'FRUITS';
}

/** Landed price: what one unit really costs the buyer at the farm gate. */
const landed = (row: Record<string, unknown>): number =>
  Number(row.price_inr ?? 0) + Number(row.transport_cost_per_unit_inr ?? row.delivery_cost_inr ?? 0);

export async function GET(request: Request) {
  if (ipLimited(request, 'price-comparison', 60)) return tooMany();

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const district = searchParams.get('district');
  const sort = searchParams.get('sort') || 'price_asc';
  const search = (searchParams.get('q') || '').trim().toLowerCase();
  const variety = (searchParams.get('variety') || '').trim();
  const grade = (searchParams.get('grade') || '').trim();
  const sellerType = (searchParams.get('sellerType') || '').trim();

  const supabase = getSupabase();

  // OTHER_INPUTS and EQUIPMENT always come back together (the alias).
  const cats: string[] | null = category && category !== 'ALL' ? [category, ALIAS[category as Category] ?? category] : null;

  const universalQuery = supabase
    .from('universal_price_listings')
    .select('*')
    .eq('is_active', true)
    .order('price_inr', { ascending: sort !== 'price_desc' })
    .limit(150);

  if (cats) universalQuery.in('category', cats);
  if (district && district !== 'ALL') universalQuery.ilike('district', `%${district}%`);
  if (variety) universalQuery.ilike('variety', `%${variety}%`);
  if (grade) universalQuery.ilike('grade', `%${grade}%`);
  if (sellerType) universalQuery.eq('seller_type', sellerType);

  const { data: universalRows, error: uErr } = await universalQuery;
  if (uErr) {
    return NextResponse.json({ ok: false, error: uErr.message, listings: [] }, { status: 500 });
  }

  // Real active marketplace listings: only safe, public columns (never the
  // seller's phone) — the same rows the shop itself shows.
  const marketQuery = supabase
    .from('market_listings')
    .select(
      'id,seller_name,district,category,subcategory,product,variety,grade,unit,price,quantity,box_capacity_kg,packing_layers,active,updated_at'
    )
    .eq('active', true)
    .order('price', { ascending: sort !== 'price_desc' })
    .limit(200);

  if (district && district !== 'ALL') marketQuery.ilike('district', `%${district}%`);

  const { data: produceRows, error: mErr } = await marketQuery;
  if (mErr) {
    return NextResponse.json({ ok: false, error: mErr.message, listings: [] }, { status: 500 });
  }

  const mappedProduce = (produceRows ?? []).map((p: Record<string, unknown>) => {
    const unit = String(p.unit ?? 'box');
    const boxKg = p.box_capacity_kg ? Number(p.box_capacity_kg) : null;
    const unitLabel =
      unit === 'box'
        ? `${boxKg && boxKg > 0 ? boxKg : 18} kg Box`
        : unit === 'quintal'
          ? '1 Quintal'
          : unit === 'bag'
            ? '1 Bag'
            : unit === 'litre'
              ? '1 Litre'
              : unit === 'piece'
                ? '1 Piece'
                : '1 kg';
    const village = p.district || 'Kashmir';
    return {
      // v1 columns:
      id: p.id,
      seller_name: p.seller_name || 'Verified Grower',
      seller_role: 'farmer',
      category: classify(String(p.product ?? ''), (p.subcategory as string) ?? null, String(p.category ?? 'produce')),
      product_name: p.product || 'Kashmir Produce',
      variety: p.variety || 'Standard',
      grade: p.grade || 'Grade A',
      district: p.district || 'Shopian',
      market_or_village: village,
      price_inr: Number(p.price ?? 0),
      unit_label: unitLabel,
      packing_layers: p.packing_layers ?? null,
      available_quantity: Number(p.quantity ?? 0),
      delivery_cost_inr: 0,
      source_label: 'Verified Farmer Marketplace Listing',
      updated_at: p.updated_at ?? null,
      // v2 columns (the marketplace has no per-unit transport row of its own):
      seller_type: 'farmer',
      location_label: village,
      transport_cost_per_unit_inr: null,
      source_name: 'Verified Farmer Marketplace Listing',
      price_history: null,
      last_updated_at: p.updated_at ?? null,
    };
  });

  const combined = [...(universalRows ?? []), ...mappedProduce].filter((item) => {
    if (cats && !cats.includes(item.category)) return false;
    if (variety && !String(item.variety ?? '').toLowerCase().includes(variety.toLowerCase())) return false;
    if (grade && !String(item.grade ?? '').toLowerCase().includes(grade.toLowerCase())) return false;
    if (sellerType && String(item.seller_type ?? item.seller_role ?? '').toLowerCase() !== sellerType.toLowerCase()) return false;
    if (!search) return true;
    return (
      String(item.product_name ?? '').toLowerCase().includes(search) ||
      String(item.variety ?? '').toLowerCase().includes(search) ||
      String(item.district ?? '').toLowerCase().includes(search)
    );
  });

  if (sort === 'price_desc') combined.sort((a, b) => Number(b.price_inr) - Number(a.price_inr));
  else if (sort === 'landed_asc') combined.sort((a, b) => landed(a as Record<string, unknown>) - landed(b as Record<string, unknown>));
  else if (sort === 'newest')
    combined.sort(
      (a, b) =>
        new Date(String(b.last_updated_at ?? b.updated_at ?? 0)).getTime() -
        new Date(String(a.last_updated_at ?? a.updated_at ?? 0)).getTime()
    );
  else combined.sort((a, b) => Number(a.price_inr) - Number(b.price_inr));

  return NextResponse.json({
    ok: true,
    count: combined.length,
    categories: CATEGORIES,
    listings: combined.slice(0, 250),
  });
}

export async function POST(request: Request) {
  if (ipLimited(request, 'price-comparison-post', 20)) return tooMany();

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'Bad request body' }, { status: 400 });

  const parsed = OfferSchema.safeParse(body);
  if (!parsed.success) return badBody(parsed.error);
  const q = parsed.data;

  const priceInr = q.priceInr;
  const transport = q.transportCostPerUnitInr ?? q.deliveryCostInr ?? 0;
  const sellerRole = (q.sellerRole || q.sellerType || 'farmer').toLowerCase();
  const sellerType = (q.sellerType || sellerRole).toLowerCase();
  const districtLabel = (q.district || 'Shopian').slice(0, 80);
  const villageLabel = (q.marketOrVillage || q.district || 'Shopian').slice(0, 80);
  const nowIso = new Date().toISOString();

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('universal_price_listings')
    .insert({
      // v1 columns (kept for older readers):
      seller_id: q.sellerId ?? null,
      seller_name: String(q.sellerName || 'Verified Seller').slice(0, 80),
      seller_role: sellerRole,
      category: q.category,
      product_name: q.productName.slice(0, 80),
      variety: q.variety ? q.variety.slice(0, 60) : null,
      grade: q.grade || 'Grade A',
      district: districtLabel,
      market_or_village: villageLabel,
      price_inr: priceInr,
      unit_label: String(q.unitLabel || '18 kg Box').slice(0, 40),
      available_quantity: q.availableQuantity ?? 1,
      delivery_cost_inr: transport,
      source_label: String(q.sourceLabel || 'Verified Seller Submission').slice(0, 60),
      // v2 columns (both column sets are always written):
      seller_type: sellerType,
      location_label: villageLabel,
      transport_cost_per_unit_inr: Number.isFinite(transport) && transport >= 0 ? transport : 0,
      source_name: String(q.sourceName || q.sourceLabel || 'Verified Seller Submission').slice(0, 60),
      price_history: [{ p: priceInr, t: nowIso }],
      last_updated_at: nowIso,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, listing: data });
}
