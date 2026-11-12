// src/app/api/price-comparison/route.ts
// Phase 7.1 — Universal Agricultural Price Comparison API.
//
// Merges the real marketplace listings (market_listings — the actual
// listings table in KashRoot) with the universal price board rows
// (universal_price_listings) across all 13 agricultural & input
// categories. Every marketplace row is classified into one of the 13
// categories by product keywords (English + Hindi / Urdu / Kashmiri),
// so Apples, Walnuts, Saffron, Fertilizers, Pesticides, Machinery,
// Irrigation and Equipment all compare on one board.
//
//   GET  ?category=&district=&q=&sort= → merged, sorted listings.
//   POST { … }                          → submit a verified seller offer.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
] as const;
type Category = (typeof CATEGORIES)[number];

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

/** Classify a marketplace row into one of the 13 board categories. */
function classify(product: string, subcategory: string | null, category: string): Category {
  const hay = `${subcategory ?? ''} ${product}`.toLowerCase();
  for (const [cat, words] of KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return cat;
  }
  return category === 'supplies' ? 'EQUIPMENT' : 'FRUITS';
}

export async function GET(request: Request) {
  if (ipLimited(request, 'price-comparison', 60)) return tooMany();

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const district = searchParams.get('district');
  const sort = searchParams.get('sort') || 'price_asc';
  const search = (searchParams.get('q') || '').trim().toLowerCase();

  const supabase = getSupabase();

  const universalQuery = supabase
    .from('universal_price_listings')
    .select('*')
    .eq('is_active', true)
    .order('price_inr', { ascending: sort !== 'price_desc' })
    .limit(150);

  if (category && category !== 'ALL') universalQuery.eq('category', category);
  if (district && district !== 'ALL') universalQuery.ilike('district', `%${district}%`);

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
    return {
      id: p.id,
      seller_name: p.seller_name || 'Verified Grower',
      seller_role: 'farmer',
      category: classify(String(p.product ?? ''), (p.subcategory as string) ?? null, String(p.category ?? 'produce')),
      product_name: p.product || 'Kashmir Produce',
      variety: p.variety || 'Standard',
      grade: p.grade || 'Grade A',
      district: p.district || 'Shopian',
      market_or_village: p.district || 'Kashmir',
      price_inr: Number(p.price ?? 0),
      unit_label: unitLabel,
      packing_layers: p.packing_layers ?? null,
      available_quantity: Number(p.quantity ?? 0),
      delivery_cost_inr: 0,
      source_label: 'Verified Farmer Marketplace Listing',
      updated_at: p.updated_at ?? null,
    };
  });

  const combined = [...(universalRows ?? []), ...mappedProduce].filter((item) => {
    if (category && category !== 'ALL' && item.category !== category) return false;
    if (!search) return true;
    return (
      String(item.product_name ?? '').toLowerCase().includes(search) ||
      String(item.variety ?? '').toLowerCase().includes(search) ||
      String(item.district ?? '').toLowerCase().includes(search)
    );
  });

  if (sort === 'price_desc') combined.sort((a, b) => Number(b.price_inr) - Number(a.price_inr));
  else if (sort === 'newest')
    combined.sort(
      (a, b) => new Date(String(b.updated_at ?? 0)).getTime() - new Date(String(a.updated_at ?? 0)).getTime()
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
  if (!body || !body.productName || !body.priceInr || !body.category) {
    return NextResponse.json({ ok: false, error: 'Missing required price listing fields' }, { status: 400 });
  }
  if (!CATEGORIES.includes(body.category)) {
    return NextResponse.json({ ok: false, error: 'Unknown category' }, { status: 400 });
  }
  const priceInr = Number(body.priceInr);
  if (!Number.isFinite(priceInr) || priceInr <= 0) {
    return NextResponse.json({ ok: false, error: 'Price must be a positive number' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('universal_price_listings')
    .insert({
      seller_id: body.sellerId ?? null,
      seller_name: String(body.sellerName || 'Verified Seller').slice(0, 80),
      seller_role: body.sellerRole || 'farmer',
      category: body.category,
      product_name: String(body.productName).slice(0, 80),
      variety: body.variety ? String(body.variety).slice(0, 60) : null,
      grade: body.grade || 'Grade A',
      district: String(body.district || 'Shopian').slice(0, 80),
      market_or_village: String(body.marketOrVillage || body.district || 'Shopian').slice(0, 80),
      price_inr: priceInr,
      unit_label: String(body.unitLabel || '18 kg Box').slice(0, 40),
      available_quantity: Number(body.availableQuantity || 1),
      delivery_cost_inr: Number(body.deliveryCostInr || 0),
      source_label: String(body.sourceLabel || 'Verified Seller Submission').slice(0, 60),
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, listing: data });
}
