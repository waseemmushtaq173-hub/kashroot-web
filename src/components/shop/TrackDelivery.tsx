'use client';

/**
 * Where the buyer's order is: the vehicle's last position (from the seller's
 * phone or the driver's link), the delivery pin, how far is left and about
 * when it arrives (straight line × 1.3 for hill roads, at about 30 km/h),
 * when the position was last updated, and a button to call the driver.
 * The order list around it refreshes every 30 seconds.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Clock, MapPinned, Phone, Truck } from 'lucide-react';

import { ago } from '@/lib/db/client';
import type { MarketOrder } from '@/lib/db/market';
import { etaOf, kmText, minutesText, type Point } from '@/lib/db/shop';

const ShopMap = dynamic(() => import('@/components/shop/ShopMap'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />,
});

/** After this long without a new position, say the phone may be off. */
const QUIET_MS = 15 * 60_000;

export function TrackDelivery({ order: o }: { order: MarketOrder }) {
  // The clock for "updated 2 min ago", ticking while the card is open.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 15_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const target: Point | null = o.delivery_lat != null && o.delivery_lon != null ? { lat: o.delivery_lat, lng: o.delivery_lon } : null;
  const vehicle: Point | null = o.last_lat != null && o.last_lon != null ? { lat: o.last_lat, lng: o.last_lon } : null;
  const eta = vehicle && target ? etaOf(vehicle, target) : null;
  const quiet = o.last_at && now > 0 && now - Date.parse(o.last_at) > QUIET_MS;
  const phone = (o.driver_phone ?? '').replace(/\D/g, '').slice(-10);
  const vehicleName = o.ship_vehicle ?? 'Vehicle';

  return (
    <div className="space-y-3 rounded-2xl bg-sky-50/60 p-4 ring-1 ring-sky-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Truck className="h-5 w-5 text-sky-700" aria-hidden /> {o.ship_vehicle ?? 'On the way'}
            {o.driver_name && <span className="font-normal text-slate-600">· Driver {o.driver_name}</span>}
          </p>
          {eta ? (
            <>
              <p className="text-lg font-bold text-slate-900" data-testid="eta">About {kmText(eta.km)} to go · arrives in about {minutesText(eta.minutes)}</p>
              <p className="text-xs text-slate-600">Worked out from the map: the straight line × 1.3 for hill roads, at about 30 km an hour. Stops and traffic make it later.</p>
            </>
          ) : vehicle ? (
            <p className="text-sm text-slate-700">The vehicle is on the map. You did not set a delivery pin, so the time to arrive is not known.</p>
          ) : (
            <p className="text-sm text-slate-700">The map shows the vehicle as soon as the seller or the driver starts sharing the location.</p>
          )}
          {o.last_at && (
            <p className="flex items-center gap-1.5 text-sm text-slate-700">
              <Clock className="h-4 w-4" aria-hidden /> Position updated {ago(o.last_at)}
              {o.last_accuracy ? ` (within ${Math.round(o.last_accuracy)} m)` : ''}
            </p>
          )}
          {quiet && <p className="text-sm font-medium text-amber-800">No new position for over 15 minutes. The phone may be off or out of network. Call the driver.</p>}
        </div>
        {/^[6-9]\d{9}$/.test(phone) && (
          <a href={`tel:+91${phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-sky-800 hover:no-underline">
            <Phone className="h-4 w-4" aria-hidden /> Call the driver{o.driver_name ? ` (${o.driver_name})` : ''}
          </a>
        )}
      </div>
      {vehicle || target ? (
        <>
          <ShopMap target={target} vehicle={vehicle} vehicleLabel={vehicleName} targetLabel="Your delivery point" />
          <p className="text-xs text-slate-500">Map © OpenStreetMap contributors.</p>
        </>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-white/80 p-4 text-sm text-slate-600 ring-1 ring-slate-900/5">
          <MapPinned className="h-5 w-5 text-sky-700" aria-hidden /> No map yet: the seller has not shared the vehicle’s location.
        </p>
      )}
    </div>
  );
}
