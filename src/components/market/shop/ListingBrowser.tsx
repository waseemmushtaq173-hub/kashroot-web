'use client';

/**
 * Browsing a shop: search, filters and the products, cheapest first. Used by
 * Price Comparison (farm inputs or produce) and by the Buyer portal's
 * "Buy apples & produce". The rows are live (useLiveListings): a product a
 * farmer publishes shows up here within 30 seconds, without reloading.
 *
 * Filters: the kind (crop / type) from the fixed list, and variety, grade and
 * district from what is actually listed — so every choice finds something.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Loader2, Package, RefreshCw, Search } from 'lucide-react';

import { ListingCard } from '@/components/market/shop/ListingCard';
import { useLiveListings, type ShopListing } from '@/components/market/shop/useLiveListings';
import { Btn, EmptyState, INPUT, type PortalTheme } from '@/components/portal/kit';
import { PRODUCE, SUBCATEGORIES, type MarketCategory } from '@/lib/db/market';

const ALL = '';
const SELECT = `${INPUT} min-h-11`;
const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** The different values of one field among the listings, as first written. */
function optionsOf(listings: ShopListing[], field: 'variety' | 'grade' | 'district'): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const l of listings) {
    const label = (l[field] ?? '').trim();
    if (label && !seen.has(key(label))) seen.set(key(label), label);
  }
  return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * A choice whose last product has gone (sold out, taken off sale) stays in
 * its box, marked, so the box never says "All" while it still filters.
 */
function keepChoice(options: { value: string; label: string }[], chosen: string): { value: string; label: string }[] {
  if (!chosen || options.some((o) => o.value === chosen)) return options;
  const label = chosen.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return [...options, { value: chosen, label: `${label} (none on sale now)` }];
}

export function ListingBrowser({ category, theme, accountId, onOrder, empty, toolbar }: {
  category: MarketCategory;
  theme: PortalTheme;
  /** The signed-in person: their own products show "Yours" instead of Order. */
  accountId?: string | null;
  onOrder: (listing: ShopListing) => void;
  /** Shown when nothing at all is listed yet (no made-up products). */
  empty: ReactNode;
  /** Extra controls at the top of the filter box (e.g. what to compare). */
  toolbar?: ReactNode;
}) {
  const { listings, verified, error, refresh } = useLiveListings(category);
  const produce = category === 'produce';
  const [kind, setKind] = useState(ALL);
  const [variety, setVariety] = useState(ALL);
  const [grade, setGrade] = useState(ALL);
  const [district, setDistrict] = useState(ALL);
  const [search, setSearch] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const all = useMemo(() => listings ?? [], [listings]);
  const ofKind = useMemo(() => all.filter((l) => !kind || l.subcategory === kind), [all, kind]);
  const facets = useMemo(
    () => ({ variety: keepChoice(optionsOf(ofKind, 'variety'), variety), grade: keepChoice(optionsOf(ofKind, 'grade'), grade), district: keepChoice(optionsOf(all, 'district'), district) }),
    [all, ofKind, variety, grade, district],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ofKind
      .filter((l) =>
        (!variety || key(l.variety) === variety) &&
        (!grade || key(l.grade) === grade) &&
        (!district || key(l.district) === district) &&
        (!verifiedOnly || verified.has(l.seller_id)) &&
        (!q || `${l.product} ${l.variety ?? ''} ${l.grade ?? ''} ${l.seller_name} ${l.district} ${l.subcategory ?? ''}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(a.price) - Number(b.price));
  }, [ofKind, variety, grade, district, verifiedOnly, verified, search]);

  const filtered = Boolean(kind || variety || grade || district || verifiedOnly || search.trim());
  const clear = () => {
    setKind(ALL);
    setVariety(ALL);
    setGrade(ALL);
    setDistrict(ALL);
    setSearch('');
    setVerifiedOnly(false);
  };
  const reload = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <section aria-label="Products" className="space-y-5">
      <div className="grid gap-3 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-900/5">
        {toolbar}
        <label className="relative block">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={produce ? 'Search apples, variety, seller or district' : 'Search products, sellers or districts'} className={`${INPUT} min-h-11 pl-9`} />
        </label>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-slate-600">
            {produce ? 'Crop' : 'Type'}
            <select value={kind} onChange={(e) => { setKind(e.target.value); setVariety(ALL); setGrade(ALL); }} className={`${SELECT} mt-1`}>
              <option value={ALL}>{produce ? 'All crops' : 'All types'}</option>
              {(produce ? PRODUCE : SUBCATEGORIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            {produce ? 'Variety' : 'Brand / size'}
            <select value={variety} onChange={(e) => setVariety(e.target.value)} disabled={!facets.variety.length} className={`${SELECT} mt-1 disabled:bg-slate-50 disabled:text-slate-400`}>
              <option value={ALL}>{facets.variety.length ? (produce ? 'All varieties' : 'All') : 'None listed'}</option>
              {facets.variety.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Grade
            <select value={grade} onChange={(e) => setGrade(e.target.value)} disabled={!facets.grade.length} className={`${SELECT} mt-1 disabled:bg-slate-50 disabled:text-slate-400`}>
              <option value={ALL}>{facets.grade.length ? 'All grades' : 'None listed'}</option>
              {facets.grade.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            District
            <select value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!facets.district.length} className={`${SELECT} mt-1 disabled:bg-slate-50 disabled:text-slate-400`}>
              <option value={ALL}>{facets.district.length ? 'All districts' : 'None listed'}</option>
              {facets.district.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium text-slate-700">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-sky-700" /> Verified sellers only
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {listings !== null && <span className="text-sm text-slate-600">{shown.length} {shown.length === 1 ? 'product' : 'products'} · cheapest first</span>}
            {filtered && <Btn theme={theme} variant="ghost" className="min-h-11" onClick={clear}>Clear filters</Btn>}
            <Btn theme={theme} variant="ghost" icon={RefreshCw} className="min-h-11" disabled={refreshing} onClick={() => void reload()}>Refresh</Btn>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>
      ) : listings === null ? (
        <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading prices…</p>
      ) : shown.length === 0 ? (
        all.length ? (
          <EmptyState
            theme={theme}
            icon={Package}
            title="Nothing matches"
            text={verifiedOnly && all.some((l) => !verified.has(l.seller_id)) ? 'Some products are from sellers KashRoot has not verified yet. Untick “Verified sellers only” to see them too.' : 'Choose another crop, variety, grade or district, or clear the search.'}
            action={<Btn theme={theme} variant="soft" className="min-h-11" onClick={clear}>Show everything</Btn>}
          />
        ) : (
          empty
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((l, i) => (
            <ListingCard key={l.id} listing={l} verified={verified.has(l.seller_id)} lowest={i === 0 && Boolean(kind)} own={accountId === l.seller_id} theme={theme} onOrder={() => onOrder(l)} />
          ))}
        </ul>
      )}
    </section>
  );
}
