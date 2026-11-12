'use client';

/**
 * UniversalPriceBoard — Phase 9: the universal agricultural price
 * comparison board. All 13 categories (produce + inputs + machinery) on
 * one board: real marketplace listings (market_listings) merged with the
 * universal price rows (universal_price_listings) through
 * /api/price-comparison. Guests can browse, filter by category, district
 * and search, sort by price, and submit a verified offer.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BarChart3, Loader2, MapPin, Search, ShieldCheck, Store, TriangleAlert } from 'lucide-react';
import { toast } from '@/lib/client/toast';
import { Badge, Btn, EmptyState, Field, INPUT, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import type { Account } from '@/lib/db/client';

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
}

export const UNIVERSAL_CATEGORIES = [
  'APPLES', 'WALNUTS', 'ALMONDS', 'SAFFRON', 'FRUITS', 'VEGETABLES', 'DRY_FRUITS',
  'SEEDS', 'FERTILIZERS', 'PESTICIDES', 'MACHINERY', 'IRRIGATION', 'EQUIPMENT',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  APPLES: 'Apples', WALNUTS: 'Walnuts', ALMONDS: 'Almonds', SAFFRON: 'Saffron',
  FRUITS: 'Fruits', VEGETABLES: 'Vegetables', DRY_FRUITS: 'Dry fruits', SEEDS: 'Seeds',
  FERTILIZERS: 'Fertilizers', PESTICIDES: 'Pesticides', MACHINERY: 'Machinery',
  IRRIGATION: 'Irrigation', EQUIPMENT: 'Equipment',
};

const SOURCE_TONE: Record<string, 'green' | 'blue' | 'amber' | 'slate'> = {
  'Verified Farmer Marketplace Listing': 'green',
  'Verified Seller Submission': 'blue',
  'Agmarknet (Govt. of India)': 'amber',
};

const inr = (v: string | number | null | undefined): string =>
  `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const theme = PORTAL_THEMES.buyer;

export function UniversalPriceBoard({ account }: { account?: Account | null }) {
  const [category, setCategory] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [sort, setSort] = useState<'price_asc' | 'price_desc' | 'newest'>('price_asc');
  const [rows, setRows] = useState<PriceListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (category !== 'ALL') params.set('category', category);
    if (q.trim()) params.set('q', q.trim());
    if (district.trim()) params.set('district', district.trim());
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
  }, [category, district, q, sort]);

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
      <Panel theme={theme} title="Universal price board — all 13 categories" icon={BarChart3}>
        <p className="text-sm text-slate-600">
          Every agricultural price on one board: apples, walnuts, almonds, saffron, fruits, vegetables, dry fruits, seeds,
          fertilizers, pesticides, machinery, irrigation and equipment — real marketplace listings and verified seller offers,
          cheapest first. Guests welcome, no account needed.
        </p>

        {/* Category chips */}
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
              {c === 'ALL' ? 'All 13 categories' : CATEGORY_LABEL[c]}
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
              <option value="price_desc">Dearest first</option>
              <option value="newest">Newest first</option>
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
          {rows.map((r) => (
            <article key={`${r.source_label}-${r.id}`} className="flex flex-col gap-1.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/10">
              <div className="flex items-start justify-between gap-2">
                <Badge tone={SOURCE_TONE[r.source_label] ?? 'slate'}>{r.source_label}</Badge>
                <Badge tone="slate">{CATEGORY_LABEL[r.category] ?? r.category}</Badge>
              </div>
              <p className="mt-1 text-sm font-bold text-slate-900">{r.product_name}</p>
              <p className="text-xs text-slate-500">
                {[r.variety && r.variety !== 'Standard' ? r.variety : null, r.grade].filter(Boolean).join(' · ') || '—'}
                {r.packing_layers ? ` · ${r.packing_layers}` : ''}
              </p>
              <p className="text-lg font-extrabold text-emerald-700">
                {inr(r.price_inr)} <span className="text-xs font-semibold text-slate-500">/ {r.unit_label}</span>
              </p>
              <p className="text-xs text-slate-600">
                {r.seller_name} · {r.district}
                {r.market_or_village && r.market_or_village !== r.district ? ` (${r.market_or_village})` : ''}
              </p>
              <p className="text-xs text-slate-500">
                {Number(r.available_quantity) > 0 ? `${Number(r.available_quantity).toLocaleString('en-IN')} available` : 'Ask for availability'}
                {Number(r.delivery_cost_inr) > 0 ? ` · delivery ${inr(r.delivery_cost_inr)}` : ''}
              </p>
            </article>
          ))}
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
    deliveryCostInr: '0',
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
          sellerRole: 'farmer',
          productName: f.productName.trim(),
          category: f.category,
          variety: f.variety.trim() || undefined,
          grade: f.grade,
          district: f.district.trim(),
          marketOrVillage: f.marketOrVillage.trim() || f.district.trim(),
          priceInr: Number(f.priceInr),
          unitLabel: f.unitLabel.trim() || '18 kg Box',
          availableQuantity: Number(f.availableQuantity || 1),
          deliveryCostInr: Number(f.deliveryCostInr || 0),
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
        <Field label="Delivery cost (₹, optional)">
          <input value={f.deliveryCostInr} onChange={set('deliveryCostInr')} type="number" min="0" step="0.01" className={INPUT} />
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
