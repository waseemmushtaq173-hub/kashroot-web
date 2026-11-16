'use client';

/**
 * Browsing a shop: search, filters and the products, cheapest first. Used by
 * Price Comparison (farm inputs or produce) and by the Buyer portal's
 * "Buy apples & produce". The rows are live (useLiveListings): a product a
 * farmer publishes shows up here within 30 seconds, without reloading.
 *
 * Filters: the kind (crop / type) from the fixed list, and variety, grade and
 * district from what is actually listed — so every choice finds something.
 * For produce, the crops of the person's area come first (lib/region.ts),
 * with a one-tap button for each. A link's ?q= fills the search (the voice
 * assistant's "cheapest urea", "buy walnuts").
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, RefreshCw, Search } from 'lucide-react';

import { ClusterTruckBar, type PoolLine } from '@/components/market/shop/ClusterTruckBar';
import { ListingCard } from '@/components/market/shop/ListingCard';
import { useLiveListings, type ShopListing } from '@/components/market/shop/useLiveListings';
import { Btn, EmptyState, INPUT, type PortalTheme, Skeleton } from '@/components/portal/kit';
import { RegionChip } from '@/components/voice/RegionChip';
import { PRODUCE, SUBCATEGORIES, type MarketCategory } from '@/lib/db/market';
import { CLUSTER_RADIUS_KM, TRUCK_CAPACITY_BOXES, computeRealDistanceKm, isValidCoordinate } from '@/lib/clusterConsolidation';
import { searchFromLink } from '@/lib/navIntent';
import { ownFilter, regionFirst, stateLabel, useRegion, type Crop } from '@/lib/region';

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

export function ListingBrowser({ category, theme, accountId, onOrder, empty, toolbar, cluster = false }: {
  category: MarketCategory;
  theme: PortalTheme;
  /** The signed-in person: their own products show "Yours" instead of Order. */
  accountId?: string | null;
  /** `boxes`: how many the buyer put on the truck for this listing (the order form opens with that number). */
  onOrder: (listing: ShopListing, boxes?: number) => void;
  /** The Buyer portal: the 10 km cluster from the 1st order, and the 2,000-box truck (real listing GPS and stock only). */
  cluster?: boolean;
  /** Shown when nothing at all is listed yet (no made-up products). */
  empty: ReactNode;
  /** Extra controls at the top of the filter box (e.g. what to compare). */
  toolbar?: ReactNode;
}) {
  const { listings, verified, error, refresh } = useLiveListings(category);
  const produce = category === 'produce';
  const params = useSearchParams();
  const { region, crops } = useRegion();
  const kinds = useMemo(() => (produce ? regionFirst(PRODUCE, crops, (c) => c) : SUBCATEGORIES), [produce, crops]);
  const [kind, setKind] = useState(ALL);
  const [variety, setVariety] = useState(ALL);
  const [grade, setGrade] = useState(ALL);
  const [district, setDistrict] = useState(ALL);
  // Filled from the link only for the kind of goods it was for.
  const [search, setSearch] = useState(() => (!params.get('category') || params.get('category') === category ? searchFromLink(params) : ''));
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The cluster: the 1st-order anchor, the boxes chosen for the truck (in the order chosen), and the 10 km filter.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [pool, setPool] = useState<{ id: string; boxes: number }[]>([]);
  const [nearOnly, setNearOnly] = useState(false);

  const all = useMemo(() => listings ?? [], [listings]);
  const ofKind = useMemo(() => all.filter((l) => !kind || l.subcategory === kind), [all, kind]);
  const facets = useMemo(
    () => ({ variety: keepChoice(optionsOf(ofKind, 'variety'), variety), grade: keepChoice(optionsOf(ofKind, 'grade'), grade), district: keepChoice(optionsOf(all, 'district'), district) }),
    [all, ofKind, variety, grade, district],
  );

  // Only listings still on sale count: one that sold out or was taken off drops off the truck and stops being the anchor.
  const anchor = useMemo(() => (cluster ? all.find((l) => l.id === anchorId) ?? null : null), [cluster, all, anchorId]);
  const lines = useMemo<PoolLine[]>(
    () => pool.flatMap((p) => {
      const listing = all.find((l) => l.id === p.id);
      return listing ? [{ listing, boxes: Math.min(p.boxes, Number(listing.quantity)) }] : [];
    }),
    [pool, all],
  );
  const onTruck = lines.reduce((n, l) => n + l.boxes, 0);
  const kmFromAnchor = (l: ShopListing) => (anchor && anchor.id !== l.id ? computeRealDistanceKm(anchor.captured_lat, anchor.captured_lng, l.captured_lat, l.captured_lng) : null);
  const makeAnchor = (l: ShopListing) => setAnchorId(l.id);
  const toggleTruck = (l: ShopListing) => {
    if (pool.some((p) => p.id === l.id)) return setPool(pool.filter((p) => p.id !== l.id));
    const room = TRUCK_CAPACITY_BOXES - onTruck;
    if (room <= 0) return;
    // All the listing has, or what still fits on the truck; the buyer changes the number on the truck bar.
    setPool([...pool, { id: l.id, boxes: Math.max(1, Math.min(Math.floor(Number(l.quantity)), room)) }]);
    // The first listing on the truck with GPS is the 1st order, unless the buyer already chose one.
    if (!anchor && isValidCoordinate(l.captured_lat, l.captured_lng)) setAnchorId(l.id);
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ofKind
      .filter((l) => {
        if (!nearOnly || !anchor) return true;
        if (l.id === anchor.id) return true;
        const km = computeRealDistanceKm(anchor.captured_lat, anchor.captured_lng, l.captured_lat, l.captured_lng);
        return km !== null && km <= CLUSTER_RADIUS_KM;
      })
      .filter((l) =>
        (!variety || key(l.variety) === variety) &&
        (!grade || key(l.grade) === grade) &&
        (!district || key(l.district) === district) &&
        (!verifiedOnly || verified.has(l.seller_id)) &&
        (!q || `${l.product} ${l.variety ?? ''} ${l.grade ?? ''} ${l.seller_name} ${l.district} ${l.subcategory ?? ''}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(a.price) - Number(b.price));
  }, [ofKind, variety, grade, district, verifiedOnly, verified, search, nearOnly, anchor]);

  const filtered = Boolean(kind || variety || grade || district || verifiedOnly || search.trim() || (nearOnly && anchor));
  const clear = () => {
    setKind(ALL);
    setVariety(ALL);
    setGrade(ALL);
    setDistrict(ALL);
    setSearch('');
    setVerifiedOnly(false);
    setNearOnly(false);
  };
  const reload = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
  // A crop with its own filter is chosen there; others (cardamom, pepper …) are searched for by name.
  const pickCrop = (c: Crop) => {
    if (ownFilter(c)) {
      setKind(kind === c.category ? ALL : c.category);
      setVariety(ALL);
      setGrade(ALL);
    } else setSearch(key(search) === key(c.name) ? '' : c.name);
  };
  const picked = (c: Crop) => (ownFilter(c) ? kind === c.category : key(search) === key(c.name));

  return (
    <section aria-label="Products" className="space-y-5">
      {cluster && (
        <ClusterTruckBar
          lines={lines}
          anchor={anchor}
          onBoxes={(id, boxes) => setPool(pool.map((p) => (p.id === id ? { ...p, boxes } : p)))}
          onRemove={(id) => setPool(pool.filter((p) => p.id !== id))}
          onOrder={(l, boxes) => onOrder(l, boxes)}
          onClear={() => setPool([])}
        />
      )}
      <div className="grid gap-3 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-900/5">
        {toolbar}
        {produce && (
          <div className="grid gap-2">
            <RegionChip />
            {crops.length > 0 && region && (
              <div role="group" aria-label={`Grown in ${stateLabel(region.state)}`} className="flex flex-wrap gap-2">
                {crops.map((c) => (
                  <button key={c.name} type="button" aria-pressed={picked(c)} onClick={() => pickCrop(c)} className={`min-h-11 cursor-pointer rounded-full px-4 text-sm font-semibold ring-1 transition ${picked(c) ? 'bg-forest text-white ring-forest' : 'bg-white text-forest-deep ring-forest-line hover:bg-forest-soft'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
              {kinds.map((c) => <option key={c} value={c}>{c}</option>)}
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium text-slate-700">
              <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-forest" /> Verified sellers only
            </label>
            {cluster && (
              <button type="button" aria-pressed={nearOnly && Boolean(anchor)} disabled={!anchor} title={anchor ? undefined : 'Choose a 1st order first: “Set as 1st Order Anchor” on a listing with GPS'} onClick={() => setNearOnly(!nearOnly)} className="kr-btn-secondary kr-btn-sm min-h-11">
                Show Only Growers Within {CLUSTER_RADIUS_KM} km of 1st Order
              </button>
            )}
            {cluster && anchor && (
              <button type="button" onClick={() => { setAnchorId(null); setNearOnly(false); }} className="min-h-11 cursor-pointer rounded-xl px-3 text-sm font-semibold text-[#52665E] hover:bg-forest-soft">Clear the 1st order anchor</button>
            )}
          </div>
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
        <Skeleton label="Loading prices…" rows={2} height="h-24" />
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
            <ListingCard
              key={l.id}
              listing={l}
              verified={verified.has(l.seller_id)}
              lowest={i === 0 && Boolean(kind)}
              own={accountId === l.seller_id}
              theme={theme}
              onOrder={() => onOrder(l, pool.find((p) => p.id === l.id)?.boxes)}
              cluster={cluster ? { isAnchor: anchor?.id === l.id, hasAnchor: Boolean(anchor), kmFromAnchor: kmFromAnchor(l), onTruck: lines.find((x) => x.listing.id === l.id)?.boxes ?? 0, truckFull: onTruck >= TRUCK_CAPACITY_BOXES, onAnchor: () => makeAnchor(l), onTruckToggle: () => toggleTruck(l) } : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
