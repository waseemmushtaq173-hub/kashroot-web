'use client';

/**
 * UniversalPriceBoard — the universal agricultural price comparison board
 * (master-upgrade v2). All 14 categories (produce + inputs + machinery +
 * other inputs) on one board: real marketplace listings (market_listings)
 * merged with the universal price rows (universal_price_listings) through
 * /api/price-comparison. Guests can browse, filter by category, district,
 * variety, grade and seller type, sort by price or landed price, follow the
 * price sparklines, order escrow-protected marketplace produce, and submit
 * a verified offer. EQUIPMENT and OTHER_INPUTS are one pool (the API alias).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BarChart3, Loader2, MapPin, Search, ShieldCheck, Store, TriangleAlert } from 'lucide-react';
import { toast } from '@/lib/client/toast';
import { Badge, Btn, EmptyState, Field, INPUT, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import type { Account } from '@/lib/db/client';

interface PricePoint {
  p: string | number;
  t: string;
}

interface PriceListing {
  id: string;
  seller_name: string;
  seller_role: string;
  category: string;
  product_name: string;
  variety: string | null;
  grade: string | null;
  district: string;
  market_or_village: string;
  price_inr: string | number;
  unit_label: string;
  packing_layers?: string | null;
  available_quantity: string | number;
  delivery_cost_inr: string | number;
  source_label: string;
  updated_at: string | null;
  // Master-upgrade v2 columns (20261112000002):
  seller_type?: string | null;
  location_label?: string | null;
  transport_cost_per_unit_inr?: string | number | null;
  source_name?: string | null;
  price_history?: PricePoint[] | null;
  last_updated_at?: string | null;
}

export const UNIVERSAL_CATEGORIES = [
  'APPLES', 'WALNUTS', 'ALMONDS', 'SAFFRON', 'FRUITS', 'VEGETABLES', 'DRY_FRUITS',
  'SEEDS', 'FERTILIZERS', 'PESTICIDES', 'MACHINERY', 'IRRIGATION', 'EQUIPMENT', 'OTHER_INPUTS',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  APPLES: 'Apples', WALNUTS: 'Walnuts', ALMONDS: 'Almonds', SAFFRON: 'Saffron',
  FRUITS: 'Fruits', VEGETABLES: 'Vegetables', DRY_FRUITS: 'Dry fruits', SEEDS: 'Seeds',
  FERTILIZERS: 'Fertilizers', PESTICIDES: 'Pesticides', MACHINERY: 'Machinery',
  IRRIGATION: 'Irrigation', EQUIPMENT: 'Equipment', OTHER_INPUTS: 'Other inputs',
};

/** A pictorial mark per category — the board reads at a glance. */
const CATEGORY_ICON: Record<string, string> = {
  APPLES: '🍎', WALNUTS: '🌰', ALMONDS: '🥜', SAFFRON: '🌺', FRUITS: '🍑',
  VEGETABLES: '🥕', DRY_FRUITS: '🍇', SEEDS: '🌻', FERTILIZERS: '🧪',
  PESTICIDES: '🐛', MACHINERY: '🚜', IRRIGATION: '💦', EQUIPMENT: '🧰', OTHER_INPUTS: '📦',
};

const SELLER_TYPE_LABEL: Record<string, string> = {
  farmer: 'Farmer', dealer: 'Dealer', wholesaler: 'Wholesaler', trader: 'Trader',
  mandi: 'Mandi', commission_agent: 'Commission agent', supplier: 'Supplier',
};

const SOURCE_TONE: Record<string, 'green' | 'blue' | 'amber' | 'slate'> = {
  'Verified Farmer Marketplace Listing': 'green',
  'Verified Seller Submission': 'blue',
  'Agmarknet (Govt. of India)': 'amber',
};

const inr = (v: string | number | null | undefined): string =>
  `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const theme = PORTAL_THEMES.buyer;

/** The price sparkline: the row's own price_history as a tiny SVG line. */
function Sparkline({ history }: { history: PricePoint[] | null | undefined }) {
  const points = (history ?? [])
    .map((h) => Number(h?.p))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(-12);
  if (points.length < 2) return null;
  const w = 84;
  const h = 22;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * w} ${h - 2 - ((p - min) / span) * (h - 4)}`)
    .join(' ');
  const up = points[points.length - 1] >= points[0];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Last ${points.length} recorded prices: ${min.toLocaleString('en-IN')} → ${points[points.length - 1].toLocaleString('en-IN')} ₹`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="rounded bg-slate-50 ring-1 ring-slate-200">
        <path d={path} fill="none" stroke={up ? '#059669' : '#e11d48'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-[10px] font-bold ${up ? 'text-emerald-700' : 'text-rose-700'}`}>
        {up ? '▲' : '▼'} {Math.round(((points[points.length - 1] - points[0]) / points[0]) * 100)}%
      </span>
    </span>
  );
}

export function UniversalPriceBoard({ account }: { account?: Account | null }) {
  const [category, setCategory] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [variety, setVariety] = useState('');
  const [grade, setGrade] = useState('');
  const [sellerType, setSellerType] = useState('');
  const [sort, setSort] = useState<'price_asc' | 'price_desc' | 'landed_asc' | 'newest'>('price_asc');
  const [rows, setRows] = useState<PriceListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (category !== 'ALL') params.set('category', category);
    if (q.trim()) params.set('q', q.trim());
    if (district.trim()) params.set('district', district.trim());
    if (variety.trim()) params.set('variety', variety.trim());
    if (grade.trim()) params.set('grade', grade.trim());
    if (sellerType) params.set('sellerType', sellerType);
    params.set('sort', sort);
    try {
      const res = await fetch(`/api/price-comparison?${params.toString()}`);
      const data = (await res.json()) as { ok: boolean; listings?: PriceListing[]; error?: string };
      if (data.ok) setRows(data.listings ?? []);
      else {
        setRows([]);
        setError(data.error ?? 'The price service could not be reached.');
      }
    } catch {
      setRows([]);
      setError('The price service could not be reached. Check your connection.');
    }
  }, [category, district, q, variety, grade, sellerType, sort]);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      if (live) void load();
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  return (
    <div className="space-y-5">
      <Panel theme={theme} title="Universal price board — all 14 categories" icon={BarChart3}>
        <p className="text-sm text-slate-600">
          Every agricultural price on one board: apples, walnuts, almonds, saffron, fruits, vegetables, dry fruits, seeds,
          fertilizers, pesticides, machinery, irrigation, equipment and other inputs — real marketplace listings and verified
          seller offers, cheapest first, with the honest landed price (price + transport per unit). Guests welcome, no account
          needed.
        </p>

        {/* Category chips (pictorial) */}
        <div role="group" aria-label="Category" className="mt-4 flex flex-wrap gap-1.5">
          {(['ALL', ...UNIVERSAL_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`min-h-9 cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition ${
                category === c ? 'bg-sky-700 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {c === 'ALL' ? '🌐 All 14 categories' : `${CATEGORY_ICON[c]} ${CATEGORY_LABEL[c]}`}
            </button>
          ))}
        </div>

        {/* Search / district / sort */}
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="relative block">
            <span className="sr-only">Search product, variety or district</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apple, walnut, urea, sprayer…" className={`${INPUT} pl-9`} />
          </label>
          <label className="relative block">
            <span className="sr-only">Filter by district</span>
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="District, e.g. Shopian" className={`${INPUT} pl-9`} />
          </label>
          <label className="block">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={INPUT}>
              <option value="price_asc">Cheapest first</option>
              <option value="landed_asc">Cheapest landed first</option>
              <option value="price_desc">Dearest first</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
        </div>

        {/* Variety / grade / seller-type filters (v2) */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="sr-only">Filter by variety</span>
            <input value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="Variety, e.g. Ambri / Delicious" className={INPUT} />
          </label>
          <label className="block">
            <span className="sr-only">Filter by grade</span>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade, e.g. Grade A" className={INPUT} />
          </label>
          <label className="block">
            <span className="sr-only">Filter by seller type</span>
            <select value={sellerType} onChange={(e) => setSellerType(e.target.value)} className={INPUT}>
              <option value="">Any seller type</option>
              {Object.entries(SELLER_TYPE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading prices…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          theme={theme}
          icon={BarChart3}
          title="No prices match yet"
          text="Try another category, clear the search, or submit the first verified offer for this category below — it appears on the board at once."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const transport = Number(r.transport_cost_per_unit_inr ?? 0);
            const landed = Number(r.price_inr ?? 0) + (Number.isFinite(transport) ? transport : 0);
            const marketplace = r.source_label === 'Verified Farmer Marketplace Listing';
            return (
              <article key={`${r.source_label}-${r.id}`} className="flex flex-col gap-1.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/10">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={SOURCE_TONE[r.source_label] ?? 'slate'}>{r.source_name ?? r.source_label}</Badge>
                  <Badge tone="slate">{CATEGORY_ICON[r.category]} {CATEGORY_LABEL[r.category] ?? r.category}</Badge>
                </div>
                <p className="mt-1 text-sm font-bold text-slate-900">{r.product_name}</p>
                <p className="text-xs text-slate-500">
                  {[r.variety && r.variety !== 'Standard' ? r.variety : null, r.grade].filter(Boolean).join(' · ') || '—'}
                  {r.packing_layers ? ` · ${r.packing_layers}` : ''}
                </p>
                <p className="text-lg font-extrabold text-emerald-700">
                  {inr(r.price_inr)} <span className="text-xs font-semibold text-slate-500">/ {r.unit_label}</span>
                </p>
                {(Number.isFinite(transport) && transport > 0) && (
                  <p className="text-xs font-semibold text-slate-700">
                    + {inr(transport)} transport per unit → <span className="text-emerald-800">landed {inr(landed)}</span>
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-600">
                    {r.seller_name}
                    {r.seller_type && r.seller_type !== 'farmer' ? ` · ${SELLER_TYPE_LABEL[r.seller_type.toLowerCase()] ?? r.seller_type}` : ''}
                    {' · '}{r.location_label ?? r.district}
                  </p>
                  <Sparkline history={r.price_history} />
                </div>
                <p className="text-xs text-slate-500">
                  {Number(r.available_quantity) > 0 ? `${Number(r.available_quantity).toLocaleString('en-IN')} available` : 'Ask for availability'}
                  {Number(r.delivery_cost_inr) > 0 && transport <= 0 ? ` · delivery ${inr(r.delivery_cost_inr)}` : ''}
                </p>
                {marketplace ? (
                  <a
                    href="/buyer/dashboard?tab=shop"
                    className="mt-1 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-800 no-underline ring-1 ring-emerald-200 hover:bg-emerald-100"
                  >
                    🛒 Order with escrow protection ↗
                  </a>
                ) : (
                  <p className="mt-1 text-[10px] text-slate-400">Price reference — order the same produce from the marketplace with escrow.</p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <OfferSubmit account={account} open={submitting} onOpenChange={setSubmitting} onDone={() => void load()} />
    </div>
  );
}

/** Submit a verified offer — it lands on the board at once. */
function OfferSubmit({ account, open, onOpenChange, onDone }: { account?: Account | null; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [f, setF] = useState({
    productName: '',
    category: 'APPLES',
    variety: '',
    grade: 'Grade A',
    district: 'Shopian',
    marketOrVillage: '',
    priceInr: '',
    unitLabel: '18 kg Box',
    availableQuantity: '1',
    transportCostPerUnitInr: '0',
    sellerType: 'farmer',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.productName.trim() || !f.priceInr) return setError('Product name and price are required.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/price-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: account?.id ?? null,
          sellerName: account?.name ?? 'Verified Seller',
          sellerRole: f.sellerType,
          sellerType: f.sellerType,
          productName: f.productName.trim(),
          category: f.category,
          variety: f.variety.trim() || undefined,
          grade: f.grade,
          district: f.district.trim(),
          marketOrVillage: f.marketOrVillage.trim() || f.district.trim(),
          priceInr: Number(f.priceInr),
          unitLabel: f.unitLabel.trim() || '18 kg Box',
          availableQuantity: Number(f.availableQuantity || 1),
          transportCostPerUnitInr: Number(f.transportCostPerUnitInr || 0),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        toast.success('Offer submitted — it is on the board now');
        onOpenChange(false);
        onDone();
      } else setError(data.error ?? 'The offer was not accepted.');
    } catch {
      setError('Could not reach the price service. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex justify-center">
        <Btn theme={theme} icon={Store} onClick={() => onOpenChange(true)}>
          Submit a verified offer
        </Btn>
      </div>
    );
  }

  return (
    <Panel theme={theme} title="Submit a verified offer" icon={ShieldCheck}>
      <p className="text-xs text-slate-500">
        {account ? `Submitting as ${account.name}.` : 'Not signed in — the offer is marked "Verified Seller Submission".'} Prices must be real
        offers; KashRoot hides nothing and fakes nothing.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Product name">
          <input value={f.productName} onChange={set('productName')} required className={INPUT} placeholder="e.g. Apple Royal Delicious" />
        </Field>
        <Field label="Category">
          <select value={f.category} onChange={set('category')} className={INPUT}>
            {UNIVERSAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </Field>
        <Field label="Variety (optional)">
          <input value={f.variety} onChange={set('variety')} className={INPUT} placeholder="e.g. Ambri / Quince" />
        </Field>
        <Field label="Grade">
          <input value={f.grade} onChange={set('grade')} className={INPUT} placeholder="Grade A" />
        </Field>
        <Field label="District">
          <input value={f.district} onChange={set('district')} required className={INPUT} placeholder="e.g. Shopian" />
        </Field>
        <Field label="Market / village">
          <input value={f.marketOrVillage} onChange={set('marketOrVillage')} className={INPUT} placeholder="e.g. Chitragam" />
        </Field>
        <Field label="Price (₹)">
          <input value={f.priceInr} onChange={set('priceInr')} required type="number" min="1" step="0.01" className={INPUT} placeholder="e.g. 1250" />
        </Field>
        <Field label="Unit">
          <input value={f.unitLabel} onChange={set('unitLabel')} className={INPUT} placeholder="e.g. 18 kg Box / quintal / bag" />
        </Field>
        <Field label="Available quantity">
          <input value={f.availableQuantity} onChange={set('availableQuantity')} type="number" min="0" step="0.01" className={INPUT} />
        </Field>
        <Field label="Transport cost per unit (₹, optional)">
          <input value={f.transportCostPerUnitInr} onChange={set('transportCostPerUnitInr')} type="number" min="0" step="0.01" className={INPUT} />
        </Field>
        <Field label="Seller type">
          <select value={f.sellerType} onChange={set('sellerType')} className={INPUT}>
            {Object.entries(SELLER_TYPE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>
        {error && (
          <p role="alert" className="sm:col-span-2 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
        <div className="sm:col-span-2 flex gap-2">
          <Btn theme={theme} type="submit" icon={busy ? Loader2 : ShieldCheck} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit offer'}
          </Btn>
          <Btn theme={theme} variant="soft" onClick={() => onOpenChange(false)}>
            Cancel
          </Btn>
        </div>
      </form>
    </Panel>
  );
}
