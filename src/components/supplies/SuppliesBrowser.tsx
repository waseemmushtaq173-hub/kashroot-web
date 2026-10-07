'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, Check, Package } from 'lucide-react';
import {
  SUPPLY_CATEGORIES,
  SUPPLY_ITEMS,
  offersByPrice,
  priceRange,
  type SupplyCategory,
  type SupplyItem,
} from '@/lib/supplies';

type Filter = SupplyCategory | 'All';

const FILTERS: Filter[] = ['All', ...SUPPLY_CATEGORIES];

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const money = (value: number, currency: string) =>
  currency === 'INR'
    ? inr.format(value)
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);

/**
 * SuppliesBrowser — the horticulture supplies catalogue.
 *
 * The whole point of this vertical is comparing suppliers for the same item, so
 * the layout is built around that comparison rather than around a product grid:
 * every item shows *all* its offers at once, cheapest first, with the cheapest
 * flagged and each other row's premium over it stated in rupees. A buyer can
 * answer "who is cheapest for jute sacks, and what does the alternative cost
 * me?" without a click.
 *
 * Rendered as a real <table> because that is what it is — tabular data with
 * column headers that a screen reader needs to associate with each cell. A div
 * grid would look identical and read as an unlabelled pile of numbers.
 *
 * Client-side because the category filter is local UI state; the catalogue
 * itself is imported, not fetched, so there is nothing here worth a request yet.
 */
export function SuppliesBrowser() {
  const [filter, setFilter] = useState<Filter>('All');
  const [inStockOnly, setInStockOnly] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([['All', SUPPLY_ITEMS.length]]);
    for (const c of SUPPLY_CATEGORIES) {
      map.set(c, SUPPLY_ITEMS.filter((i) => i.category === c).length);
    }
    return map;
  }, []);

  const items = useMemo(() => {
    const byCategory =
      filter === 'All' ? SUPPLY_ITEMS : SUPPLY_ITEMS.filter((i) => i.category === filter);

    if (!inStockOnly) return byCategory;

    // Keep the item if *any* supplier has it — an item where the cheapest offer
    // is out of stock is still useful, because the next-cheapest is not.
    return byCategory.filter((i) => i.offers.some((o) => o.inStock));
  }, [filter, inStockOnly]);

  const liveItems = useMemo(
    () => (inStockOnly ? items.map((i) => ({ ...i, offers: i.offers.filter((o) => o.inStock) })) : items),
    [items, inStockOnly],
  );

  const supplierCount = useMemo(
    () => new Set(SUPPLY_ITEMS.flatMap((i) => i.offers.map((o) => o.supplier))).size,
    [],
  );

  return (
    <div className="kr-container py-10 md:py-14">
      {/* ── Sample-data notice ─────────────────────────────────────────────── */}
      <div
        role="note"
        className="mb-8 flex items-start gap-3 border border-kr-warning-300 bg-kr-badge-pending-bg p-4"
      >
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-kr-warning-700"
          aria-hidden="true"
        />
        <div>
          <p className="text-label font-semibold text-kr-badge-pending-text">
            Sample catalogue — not live vendor pricing
          </p>
          <p className="mt-0.5 text-body-sm text-kr-badge-pending-text">
            Suppliers and prices below are placeholders that demonstrate the
            comparison layout. Do not trade against them.
          </p>
        </div>
      </div>

      {/* ── Heading + stats ────────────────────────────────────────────────── */}
      <div className="border-b border-kr-border-default pb-6">
        <p className="text-overline uppercase text-kr-text-brand">
          Horticulture &amp; agriculture
        </p>
        <h1 className="mt-2 font-heading text-h1 text-kr-text-primary">
          Supplies
        </h1>
        <p className="mt-3 max-w-2xl text-body-lg text-kr-text-secondary">
          Packaging, machinery and inputs from multiple suppliers, priced side
          by side so you can see what the alternative actually costs.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-px border border-kr-border-default bg-kr-border-default sm:grid-cols-3">
          {[
            { label: 'Catalogue items', value: String(SUPPLY_ITEMS.length) },
            { label: 'Suppliers compared', value: String(supplierCount) },
            { label: 'Categories', value: String(SUPPLY_CATEGORIES.length) },
          ].map((s) => (
            <div key={s.label} className="bg-kr-bg-surface p-4">
              <dd className="font-heading text-h3 text-kr-text-primary">{s.value}</dd>
              <dt className="mt-1 text-caption text-kr-text-secondary">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={active}
                className={`border px-3 py-2 text-label transition-colors ${
                  active
                    ? 'border-kr-primary-600 bg-kr-primary-500 text-white'
                    : 'border-kr-border-default bg-kr-bg-surface text-kr-text-secondary hover:border-kr-primary-500 hover:text-kr-text-primary'
                }`}
              >
                {f}
                <span className={active ? 'ml-2 text-white/70' : 'ml-2 text-kr-text-disabled'}>
                  {counts.get(f) ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2 text-label text-kr-text-secondary">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-kr-primary-500"
          />
          In stock only
        </label>
      </div>

      {/* ── Items ──────────────────────────────────────────────────────────── */}
      {liveItems.length === 0 ? (
        <div className="kr-empty-state mt-8 border border-kr-border-default">
          <Package className="h-6 w-6 text-kr-text-disabled" aria-hidden="true" />
          <p className="text-body text-kr-text-secondary">
            Nothing in this category is in stock right now.
          </p>
          <button
            type="button"
            onClick={() => setInStockOnly(false)}
            className="kr-btn-secondary kr-btn-sm"
          >
            Show out-of-stock suppliers
          </button>
        </div>
      ) : (
        <ul className="mt-6 space-y-6">
          {liveItems.map((item) => (
            <li key={item.id}>
              <ItemCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One catalogue item with every supplier offer, cheapest first.
 *
 * The cheapest row is marked with a brand rule and a "Best unit price" tag; the
 * other rows state their premium, which is the number a buyer is actually
 * weighing when they decide whether a cheaper supplier's higher minimum order
 * is worth it.
 */
function ItemCard({ item }: { item: SupplyItem }) {
  const sorted = offersByPrice(item);
  const { low, high, spread } = priceRange(item);
  const best = sorted[0];

  return (
    <article className="border border-kr-border-default bg-kr-bg-surface">
      {/* Item header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kr-border-default p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-h4 text-kr-text-primary">{item.name}</h2>
            <span className="border border-kr-border-default bg-kr-bg-sunken px-2 py-0.5 text-caption text-kr-text-secondary">
              {item.category}
            </span>
          </div>
          <p className="mt-1 text-body-sm text-kr-text-secondary">{item.spec}</p>
        </div>

        <div className="text-right">
          <p className="text-caption text-kr-text-secondary">Lowest unit price</p>
          <p className="kr-amount-lg text-kr-text-primary">
            {money(low, best.currency)}
          </p>
          <p className="text-caption text-kr-text-secondary">per {item.unit}</p>
        </div>
      </header>

      {/* Offer comparison */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-left">
          <caption className="kr-sr-only">
            Supplier offers for {item.name}, ordered by unit price
          </caption>
          <thead>
            <tr className="border-b border-kr-border-default bg-kr-bg-sunken">
              <th scope="col" className="px-5 py-2.5 text-caption font-semibold uppercase tracking-wide text-kr-text-secondary">
                Supplier
              </th>
              <th scope="col" className="px-5 py-2.5 text-right text-caption font-semibold uppercase tracking-wide text-kr-text-secondary">
                Unit price
              </th>
              <th scope="col" className="px-5 py-2.5 text-right text-caption font-semibold uppercase tracking-wide text-kr-text-secondary">
                vs. lowest
              </th>
              <th scope="col" className="px-5 py-2.5 text-right text-caption font-semibold uppercase tracking-wide text-kr-text-secondary">
                Min. order
              </th>
              <th scope="col" className="px-5 py-2.5 text-right text-caption font-semibold uppercase tracking-wide text-kr-text-secondary">
                Lead time
              </th>
              <th scope="col" className="px-5 py-2.5 text-right text-caption font-semibold uppercase tracking-wide text-kr-text-secondary">
                Stock
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((offer, index) => {
              const isBest = index === 0;
              const delta = offer.unitPrice - low;

              return (
                <tr
                  key={offer.supplier}
                  className={`border-b border-kr-border-default last:border-b-0 ${
                    isBest ? 'bg-kr-badge-published-bg' : ''
                  }`}
                >
                  <th
                    scope="row"
                    className={`px-5 py-3 text-label font-medium ${
                      isBest
                        ? 'border-l-2 border-l-kr-success-500 text-kr-text-primary'
                        : 'text-kr-text-primary'
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {offer.supplier}
                      {isBest && (
                        <span className="inline-flex items-center gap-1 border border-kr-border-default bg-kr-bg-surface px-1.5 py-0.5 text-caption font-semibold text-kr-success-700">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Best unit price
                        </span>
                      )}
                    </span>
                  </th>

                  <td className="kr-amount px-5 py-3 text-right text-kr-text-primary">
                    {money(offer.unitPrice, offer.currency)}
                  </td>

                  <td className="kr-amount px-5 py-3 text-right">
                    {isBest ? (
                      <span className="text-kr-text-secondary">&mdash;</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-kr-badge-pending-text">
                        <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                        {money(delta, offer.currency)}
                      </span>
                    )}
                  </td>

                  <td className="kr-amount px-5 py-3 text-right text-kr-text-secondary">
                    {offer.minOrder.toLocaleString('en-IN')} {offer.unit}
                    {offer.minOrder === 1 ? '' : 's'}
                  </td>

                  <td className="kr-amount px-5 py-3 text-right text-kr-text-secondary">
                    {offer.leadTimeDays} d
                  </td>

                  <td className="px-5 py-3 text-right">
                    <span
                      className={`inline-block border px-2 py-0.5 text-caption ${
                        offer.inStock
                          ? 'border-kr-border-default bg-kr-badge-published-bg text-kr-success-700'
                          : 'border-kr-neutral-300 bg-kr-bg-sunken text-kr-text-secondary'
                      }`}
                    >
                      {offer.inStock ? 'In stock' : 'Out of stock'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Spread summary */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-kr-border-default px-5 py-3">
        <p className="text-body-sm text-kr-text-secondary">
          {sorted.length} supplier{sorted.length === 1 ? '' : 's'} compared
        </p>
        <p className="text-body-sm text-kr-text-secondary">
          Spread{' '}
          <span className="kr-amount font-semibold text-kr-text-primary">
            {money(spread, best.currency)}
          </span>{' '}
          per {item.unit} between cheapest and dearest ({money(low, best.currency)} &ndash;{' '}
          {money(high, best.currency)})
        </p>
      </footer>
    </article>
  );
}
