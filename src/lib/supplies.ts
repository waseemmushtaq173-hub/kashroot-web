/**
 * Horticulture & agriculture supplies catalogue.
 *
 * ⚠️  PLACEHOLDER DATA — NOT LIVE VENDOR PRICING.  ⚠️
 *
 * Every row below is a template, not a quote. The supplier names are
 * deliberately neutral ("Supplier A", "Supplier B") and the page renders a
 * visible "sample catalogue" notice, for the same reason the fabricated
 * "2,400+ farmers / 48 export regions" figures were removed from the landing
 * page: numbers that look like measurements but are invented are worse than no
 * numbers, because people act on them. A buyer comparing saffron margins will
 * read a price table as real unless something stops them.
 *
 * The *shape* here is the deliverable — categories, the offers-per-item
 * relationship, and the fields a real price comparison needs (unit price, pack
 * size, minimum order, stock, lead time). When the supplies API exists, replace
 * `SUPPLY_ITEMS` with a fetch and this whole module collapses to a type
 * definition plus a mapper.
 *
 * WHY OFFERS ARE NESTED
 * ---------------------
 * The point of this vertical is comparing suppliers for one item, so the unit
 * of the catalogue is the item and the unit of comparison is the offer. Keeping
 * offers nested under their item means "cheapest supplier for jute sacks" is a
 * local computation over one object rather than a join across a flat list, and
 * it cannot drift into showing an item with no offers.
 */

export const SUPPLY_CATEGORIES = ['Packaging', 'Machinery', 'Inputs'] as const;

export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

/** One supplier's terms for one item. */
export interface SupplyOffer {
  /** Placeholder label until real vendor records exist. */
  supplier: string;
  /** Price for one `unit` of the item, in the minor-unit-free form the API returns. */
  unitPrice: number;
  currency: string;
  /** Smallest order the supplier will accept, in `unit`s. */
  minOrder: number;
  unit: string;
  inStock: boolean;
  /** Working days from order to dispatch. */
  leadTimeDays: number;
}

export interface SupplyItem {
  id: string;
  name: string;
  category: SupplyCategory;
  /** Short technical descriptor — grade, size, capacity, pack. */
  spec: string;
  unit: string;
  offers: SupplyOffer[];
}

/** Cheapest and dearest offer for an item, plus the spread. */
export function priceRange(item: SupplyItem) {
  const prices = item.offers.map((o) => o.unitPrice);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return { low, high, spread: high - low };
}

/** Offers cheapest-first — the ordering the comparison view renders in. */
export function offersByPrice(item: SupplyItem): SupplyOffer[] {
  return [...item.offers].sort((a, b) => a.unitPrice - b.unitPrice);
}

export const SUPPLY_ITEMS: SupplyItem[] = [
  // ── Packaging ──────────────────────────────────────────────────────────────
  {
    id: 'jute-sacks-50kg',
    name: 'Jute sacks',
    category: 'Packaging',
    spec: '50 kg · 40 × 70 cm · food grade',
    unit: 'sack',
    offers: [
      { supplier: 'Supplier A', unitPrice: 42, currency: 'INR', minOrder: 500, unit: 'sack', inStock: true, leadTimeDays: 3 },
      { supplier: 'Supplier B', unitPrice: 38.5, currency: 'INR', minOrder: 1000, unit: 'sack', inStock: true, leadTimeDays: 5 },
      { supplier: 'Supplier C', unitPrice: 45, currency: 'INR', minOrder: 250, unit: 'sack', inStock: false, leadTimeDays: 8 },
    ],
  },
  {
    id: 'apple-cartons-20kg',
    name: 'Corrugated apple cartons',
    category: 'Packaging',
    spec: '20 kg · 5-ply CFB · vented',
    unit: 'carton',
    offers: [
      { supplier: 'Supplier A', unitPrice: 96, currency: 'INR', minOrder: 200, unit: 'carton', inStock: true, leadTimeDays: 4 },
      { supplier: 'Supplier C', unitPrice: 88, currency: 'INR', minOrder: 500, unit: 'carton', inStock: true, leadTimeDays: 6 },
    ],
  },
  {
    id: 'stretch-wrap-500',
    name: 'Stretch wrap film',
    category: 'Packaging',
    spec: '500 mm × 23 µm · pallet wrap',
    unit: 'roll',
    offers: [
      { supplier: 'Supplier B', unitPrice: 310, currency: 'INR', minOrder: 24, unit: 'roll', inStock: true, leadTimeDays: 2 },
      { supplier: 'Supplier A', unitPrice: 334, currency: 'INR', minOrder: 12, unit: 'roll', inStock: true, leadTimeDays: 3 },
    ],
  },

  // ── Machinery ──────────────────────────────────────────────────────────────
  {
    id: 'battery-secateurs',
    name: 'Battery secateurs',
    category: 'Machinery',
    spec: '21 V · 25 mm cut · 2 batteries',
    unit: 'unit',
    offers: [
      { supplier: 'Supplier D', unitPrice: 7450, currency: 'INR', minOrder: 1, unit: 'unit', inStock: true, leadTimeDays: 7 },
      { supplier: 'Supplier A', unitPrice: 8200, currency: 'INR', minOrder: 1, unit: 'unit', inStock: true, leadTimeDays: 4 },
      { supplier: 'Supplier C', unitPrice: 6990, currency: 'INR', minOrder: 5, unit: 'unit', inStock: false, leadTimeDays: 12 },
    ],
  },
  {
    id: 'knapsack-sprayer-16l',
    name: 'Knapsack sprayer',
    category: 'Machinery',
    spec: '16 L · lever pump · 4-nozzle set',
    unit: 'unit',
    offers: [
      { supplier: 'Supplier A', unitPrice: 2350, currency: 'INR', minOrder: 1, unit: 'unit', inStock: true, leadTimeDays: 3 },
      { supplier: 'Supplier D', unitPrice: 2180, currency: 'INR', minOrder: 1, unit: 'unit', inStock: true, leadTimeDays: 6 },
    ],
  },
  {
    id: 'grading-table',
    name: 'Fruit grading table',
    category: 'Machinery',
    spec: '3 m · 4 size grades · mild steel',
    unit: 'unit',
    offers: [
      { supplier: 'Supplier C', unitPrice: 42500, currency: 'INR', minOrder: 1, unit: 'unit', inStock: true, leadTimeDays: 14 },
      { supplier: 'Supplier D', unitPrice: 47800, currency: 'INR', minOrder: 1, unit: 'unit', inStock: false, leadTimeDays: 21 },
    ],
  },

  // ── Inputs ─────────────────────────────────────────────────────────────────
  {
    id: 'neem-oil-1l',
    name: 'Neem oil concentrate',
    category: 'Inputs',
    spec: '1 L · azadirachtin 1500 ppm',
    unit: 'bottle',
    offers: [
      { supplier: 'Supplier B', unitPrice: 480, currency: 'INR', minOrder: 12, unit: 'bottle', inStock: true, leadTimeDays: 2 },
      { supplier: 'Supplier A', unitPrice: 545, currency: 'INR', minOrder: 6, unit: 'bottle', inStock: true, leadTimeDays: 3 },
      { supplier: 'Supplier D', unitPrice: 462, currency: 'INR', minOrder: 24, unit: 'bottle', inStock: true, leadTimeDays: 5 },
    ],
  },
  {
    id: 'boron-zinc-foliar',
    name: 'Boron + zinc foliar',
    category: 'Inputs',
    spec: '1 L · chelated micronutrient',
    unit: 'bottle',
    offers: [
      { supplier: 'Supplier C', unitPrice: 615, currency: 'INR', minOrder: 10, unit: 'bottle', inStock: true, leadTimeDays: 4 },
      { supplier: 'Supplier B', unitPrice: 588, currency: 'INR', minOrder: 20, unit: 'bottle', inStock: false, leadTimeDays: 9 },
    ],
  },
  {
    id: 'vermicompost-50kg',
    name: 'Vermicompost',
    category: 'Inputs',
    spec: '50 kg · sieved · 1.2% N',
    unit: 'bag',
    offers: [
      { supplier: 'Supplier D', unitPrice: 390, currency: 'INR', minOrder: 40, unit: 'bag', inStock: true, leadTimeDays: 5 },
      { supplier: 'Supplier A', unitPrice: 365, currency: 'INR', minOrder: 100, unit: 'bag', inStock: true, leadTimeDays: 7 },
      { supplier: 'Supplier C', unitPrice: 410, currency: 'INR', minOrder: 20, unit: 'bag', inStock: true, leadTimeDays: 3 },
    ],
  },
];
