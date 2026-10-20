'use client';

/**
 * Live marketplace listings for a shop: the real rows of market_listings —
 * what farmers publish from the Farmer portal and sellers and dealers from
 * their own desks — kept fresh without reloading the page: every 30 seconds
 * while the page is on screen, and as soon as the person comes back to it.
 *
 * Photos are the heavy part (a data URL each), so a refresh reads the rows
 * without them and fetches a photo only for a listing that is new or has
 * changed. On a village network a refresh then costs a few kilobytes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { dbMessage, supabase } from '@/lib/db/client';
import type { MarketCategory, MarketListing, MarketUnit } from '@/lib/db/market';

/** A listing as a shop shows it. `photo` is undefined while it is still coming. */
export interface ShopListing extends Omit<MarketListing, 'photo'> {
  photo?: string | null;
  created_at: string;
}

const COLUMNS = 'id, seller_id, seller_name, phone, district, category, subcategory, product, variety, grade, unit, price, quantity, details, active, created_at, updated_at';
const REFRESH_MS = 30_000;
/** Listings per photo request (keeps the request address short). */
const PHOTO_BATCH = 40;
const LOAD_FAILED = 'Could not load the products. Check your internet and try again.';
/** Fired when a listing is found changed or gone (e.g. while ordering): shops refresh at once. */
export const LISTINGS_CHANGED = 'kr:listings-changed';

export interface LiveListings {
  /** null until the first load. */
  listings: ShopListing[] | null;
  /** Sellers KashRoot has verified: Aadhaar checked, or a dealer (kr_verified_sellers). */
  verified: Set<string>;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLiveListings(category: MarketCategory): LiveListings {
  const [listings, setListings] = useState<ShopListing[] | null>(null);
  const [verified, setVerified] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  // Photos already fetched, with the version of the listing they belong to.
  const photos = useRef(new Map<string, { at: string; photo: string | null }>());
  const sellersChecked = useRef('');
  // The category whose load is running, so refreshes do not pile up.
  const running = useRef<MarketCategory | null>(null);
  const current = useRef(category);
  const shown = useRef(false);

  const load = useCallback(async () => {
    if (running.current === category) return;
    running.current = category;
    const stale = () => current.current !== category;
    try {
      const { data, error: err } = await supabase.from('market_listings').select(COLUMNS).eq('category', category).eq('active', true).gt('quantity', 0).order('updated_at', { ascending: false }).limit(300);
      if (err) throw new Error(dbMessage(err, LOAD_FAILED));
      if (stale()) return;
      const rows = (data ?? []) as Omit<ShopListing, 'photo'>[];
      const cache = photos.current;
      const withPhotos = () => rows.map((r) => ({ ...r, photo: cache.get(r.id)?.at === r.updated_at ? cache.get(r.id)?.photo : undefined }));
      setListings(withPhotos());
      setError(null);
      shown.current = true;

      const sellers = [...new Set(rows.map((r) => r.seller_id))].sort().join(',');
      if (sellers && sellers !== sellersChecked.current) {
        const v = await supabase.rpc('kr_verified_sellers', { p_ids: sellers.split(',') });
        if (!v.error && !stale()) {
          sellersChecked.current = sellers;
          setVerified(new Set(((v.data ?? []) as string[]).map(String)));
        }
      }

      const byId = new Map(rows.map((r) => [r.id, r]));
      const missing = rows.filter((r) => cache.get(r.id)?.at !== r.updated_at).map((r) => r.id);
      for (let i = 0; i < missing.length; i += PHOTO_BATCH) {
        const ids = missing.slice(i, i + PHOTO_BATCH);
        const p = await supabase.from('market_listings').select('id, photo, updated_at').in('id', ids);
        if (p.error || stale()) break;
        const got = new Map(((p.data ?? []) as { id: string; photo: string | null; updated_at: string }[]).map((x) => [x.id, x]));
        for (const id of ids) {
          const x = got.get(id);
          cache.set(id, { at: x?.updated_at ?? byId.get(id)?.updated_at ?? '', photo: x?.photo ?? null });
        }
        setListings(withPhotos());
      }
    } catch (err) {
      // A refresh that fails (no signal for a moment) keeps what is on screen.
      if (!shown.current && !stale()) {
        setError(err instanceof Error ? err.message : LOAD_FAILED);
        setListings([]);
      }
    } finally {
      if (running.current === category) running.current = null;
    }
  }, [category]);

  // A shop shows one category at a time; it is keyed by the category, so a
  // new category starts from a fresh, loading state.
  useEffect(() => {
    current.current = category;
    shown.current = false;
    let live = true;
    const run = () => {
      if (live && document.visibilityState === 'visible') void load();
    };
    void load();
    const id = window.setInterval(run, REFRESH_MS);
    window.addEventListener('focus', run);
    window.addEventListener(LISTINGS_CHANGED, run);
    document.addEventListener('visibilitychange', run);
    return () => {
      live = false;
      window.clearInterval(id);
      window.removeEventListener('focus', run);
      window.removeEventListener(LISTINGS_CHANGED, run);
      document.removeEventListener('visibilitychange', run);
    };
  }, [category, load]);

  return { listings, verified, error, refresh: load };
}

/** Listed today (on this phone's calendar). */
export function isNewToday(l: Pick<ShopListing, 'created_at'>): boolean {
  return new Date(l.created_at).toDateString() === new Date().toDateString();
}

/** Units in words for more than one: 200 boxes, 3 quintals. */
export const UNIT_PLURAL: Record<MarketUnit, string> = { kg: 'kg', box: 'boxes', quintal: 'quintals', bag: 'bags', litre: 'litres', piece: 'pieces' };

/** How many, in words: "1 box", "200 boxes". */
export const amountOf = (n: number, unit: MarketUnit) => `${n.toLocaleString('en-IN')} ${n === 1 ? unit : UNIT_PLURAL[unit]}`;
