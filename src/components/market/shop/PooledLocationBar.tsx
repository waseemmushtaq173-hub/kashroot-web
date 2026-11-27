'use client';

/**
 * The buyer's pooled locations: each KashRoot hub with the orchards inside its 10 km pickup area (how many farmers and boxes
 * are for sale there, from the GPS saved on the listings), and how far the hub is from the buyer once they share their
 * position. The buyer chooses a hub to see only the produce that hub collects: boxes bought near one hub come together
 * there and travel to the buyer in one go. Every number is real GPS or stock; a listing without GPS is in no hub's area.
 */
import { Building2, LocateFixed, MapPin } from 'lucide-react';

import type { ShopListing } from '@/components/market/shop/useLiveListings';
import { CLUSTER_RADIUS_KM, hubReach, kmFromHub, type Hub } from '@/lib/hubs';

export interface BuyerPosition {
  lat: number;
  lng: number;
  /** Metres the phone says its fix is good to. */
  accuracy: number;
}

export function PooledLocationBar({ listings, chosen, onChoose, buyer, locating, locationProblem, onLocate }: {
  listings: ShopListing[];
  /** The hub chosen (its id), or null for all produce. */
  chosen: string | null;
  onChoose: (id: string | null) => void;
  buyer: BuyerPosition | null;
  locating: boolean;
  locationProblem: string | null;
  onLocate: () => void;
}) {
  const reach = hubReach(listings);
  const picked = reach.find((r) => r.hub.id === chosen) ?? null;
  const fromYou = (h: Hub) => (buyer ? kmFromHub(h, buyer.lat, buyer.lng) : null);
  const withoutGps = listings.filter((l) => !(typeof l.captured_lat === 'number' && typeof l.captured_lng === 'number')).length;

  return (
    <section aria-labelledby="pooled-title" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="pooled-title" className="flex items-center gap-2 font-display text-xl font-semibold text-slate-900"><Building2 className="h-5 w-5 text-forest" aria-hidden /> Pooled locations: KashRoot hubs</h3>
          <p className="mt-1 text-sm text-slate-600">
            A hub collects from every orchard within {CLUSTER_RADIUS_KM} km. Buy near one hub and your boxes travel to you together.
          </p>
        </div>
        <button type="button" onClick={onLocate} disabled={locating} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-forest-deep ring-1 ring-forest-line hover:bg-forest-soft disabled:opacity-60">
          <LocateFixed className="h-4 w-4" aria-hidden /> {buyer ? 'Update my position' : locating ? 'Finding you…' : 'How far is KashRoot from me?'}
        </button>
      </div>
      {locationProblem && <p role="alert" className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">{locationProblem}</p>}

      <ul className="mt-3 grid !list-none grid-cols-1 gap-2 !pl-0 sm:grid-cols-2 lg:grid-cols-4" aria-label="KashRoot hubs">
        {reach.map(({ hub, farmers, boxes, listings: count }) => {
          const on = chosen === hub.id;
          const km = fromYou(hub);
          return (
            <li key={hub.id}>
              <button type="button" aria-pressed={on} onClick={() => onChoose(on ? null : hub.id)} className={`flex h-full min-h-11 w-full cursor-pointer flex-col rounded-xl p-3 text-left ring-2 transition ${on ? 'bg-forest text-white ring-forest' : 'bg-white text-slate-900 ring-forest-line hover:bg-forest-soft'}`}>
                <span className="flex items-center gap-1.5 text-sm font-bold"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {hub.locationName}</span>
                <span className={`text-xs ${on ? 'text-white/85' : 'text-slate-600'}`}>{hub.district} district</span>
                <span className="mt-1 text-sm font-semibold">
                  {count === 0 ? `No produce within ${CLUSTER_RADIUS_KM} km yet` : `${farmers} farmer${farmers === 1 ? '' : 's'} · ${boxes.toLocaleString('en-IN')} boxes`}
                </span>
                {km !== null && <span className={`text-xs font-semibold ${on ? 'text-white' : 'text-forest-deep'}`}>{km} km from you</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {picked && (
        <p className="mt-3 rounded-xl bg-forest-soft p-3 text-sm text-slate-800 ring-1 ring-forest-line">
          Showing orchards within {CLUSTER_RADIUS_KM} km of <strong>{picked.hub.name}</strong>
          {fromYou(picked.hub) !== null ? <>, which is <strong>{fromYou(picked.hub)} km</strong> from you</> : ''}.{' '}
          <button type="button" onClick={() => onChoose(null)} className="min-h-11 cursor-pointer font-semibold text-forest-deep underline underline-offset-2">Show all produce</button>
        </p>
      )}
      {withoutGps > 0 && <p className="mt-2 text-xs text-slate-600">{withoutGps} listing{withoutGps === 1 ? ' has' : 's have'} no orchard GPS, so no hub distance can be worked out for {withoutGps === 1 ? 'it' : 'them'}.</p>}
    </section>
  );
}
