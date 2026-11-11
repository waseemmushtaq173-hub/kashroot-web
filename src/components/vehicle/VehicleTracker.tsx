'use client';

/**
 * VehicleTracker — real-time tracking for a user's linked vehicle.
 * Shows FASTag toll crossings and driver GPS pings only.
 * Never draws simulated routes. Only shows "Planned route" if explicitly labelled.
 */
import { useEffect, useState } from 'react';
import { MapPin, Truck, Loader2, Navigation, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

import { Btn, PORTAL_THEMES } from '@/components/portal/kit';
import { googlePoint, googleRoute } from '@/lib/maps';

const theme = PORTAL_THEMES.dealer;

interface VehicleEvent {
  type: 'fastag' | 'gps' | 'planned';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string;
  details: string;
  speedKmph?: number;
  headingDeg?: number;
  isPlanned?: boolean;
}

interface VehicleTrackerProps {
  registration: string;
  orderId?: string;
  consignmentCode?: string;
  /** If true, show a "planned route" from origin to destination (labelled as planned). */
  showPlannedRoute?: boolean;
  plannedOrigin?: { name: string; lat: number; lng: number };
  plannedDestination?: { name: string; lat: number; lng: number };
}

export function VehicleTracker({
  registration,
  orderId,
  consignmentCode,
  showPlannedRoute = false,
  plannedOrigin,
  plannedDestination,
}: VehicleTrackerProps) {
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<VehicleEvent | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({ registration });
        if (orderId) params.set('orderId', orderId);
        if (consignmentCode) params.set('consignmentCode', consignmentCode);

        const res = await fetch(`/api/vehicle/events?${params}`);
        if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
        const data = await res.json();
        if (!live) return;
        if (data.ok) {
          setEvents(data.events);
          setLastEvent(data.events[0] ?? null);
          setError(null);
        } else {
          setError(data.message ?? 'No tracking data available.');
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not load tracking data.');
      } finally {
        if (live) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60_000); // Refresh every minute
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [registration, orderId, consignmentCode]);

  // Filter planned route events (only show if explicitly enabled)
  const displayEvents = showPlannedRoute ? events : events.filter((e) => !e.isPlanned);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-200 rounded w-full" />
        <div className="h-[200px] bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200 text-center">
        <Truck className="mx-auto h-12 w-12 text-amber-600" aria-hidden />
        <p className="mt-3 text-sm text-amber-800">{error}</p>
        <p className="mt-1 text-xs text-amber-700">FASTag crossings appear automatically. Driver GPS appears when they share location on a consignment.</p>
      </div>
    );
  }

  // Current position card
  const current = lastEvent;
  const currentLat = current?.latitude ?? null;
  const currentLng = current?.longitude ?? null;
  const hasPosition = current !== null && currentLat != null && currentLng != null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6 text-emerald-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-slate-900">Vehicle {registration}</p>
            <p className="text-xs text-slate-500">{events.length} real event{events.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {hasPosition && (
          <a
            href={googlePoint(currentLat!, currentLng!)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"
          >
            <MapPin className="h-4 w-4" aria-hidden /> In Google Maps
          </a>
        )}
      </div>

      {/* Current Position */}
      {hasPosition && current && (
        <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Current position
          </p>
          <p className="mt-1 text-base font-mono text-slate-900">
            {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
          </p>
          <p className="mt-1 text-sm text-emerald-800">{current.locationName}</p>
          <p className="text-xs text-emerald-700">
            Last update: {new Date(current.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {current.speedKmph ? ` · ${current.speedKmph} km/h` : ''}
          </p>
        </div>
      )}

      {/* Events Timeline */}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Clock className="h-4 w-4" aria-hidden /> Tracking events (newest first)
        </p>
        {displayEvents.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-500 py-8">
            No real tracking data yet.<br />
            FASTag crossings appear automatically when the vehicle passes a toll plaza.<br />
            Driver GPS appears when they share location on a consignment.
          </p>
        ) : (
          <ul className="mt-3 space-y-3 max-h-[400px] overflow-y-auto" role="list">
            {displayEvents.map((event, idx) => (
              <li
                key={`${event.type}-${event.timestamp}-${idx}`}
                className={`flex items-start gap-3 rounded-xl p-3 ${event.type === 'fastag' ? 'bg-sky-50' : event.type === 'gps' ? 'bg-emerald-50' : 'bg-amber-50'} ring-1 ${event.type === 'fastag' ? 'ring-sky-200' : event.type === 'gps' ? 'ring-emerald-200' : 'ring-amber-200'}`}
              >
                <span className={`flex-shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center ${event.type === 'fastag' ? 'bg-sky-100 text-sky-700' : event.type === 'gps' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {event.type === 'fastag' && <MapPin className="h-5 w-5" aria-hidden />}
                  {event.type === 'gps' && <Truck className="h-5 w-5" aria-hidden />}
                  {event.type === 'planned' && <Clock className="h-5 w-5" aria-hidden />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1 font-medium text-slate-900">
                    {event.locationName}
                    {event.isPlanned && (
                      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        <AlertCircle className="h-2.5 w-2.5" aria-hidden /> Planned route
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{event.details}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {new Date(event.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {event.speedKmph ? ` · {event.speedKmph} km/h` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Planned Route Notice */}
        {showPlannedRoute && plannedOrigin && plannedDestination && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertCircle className="h-5 w-5" aria-hidden /> Planned route (not real-time)
            </p>
            <p className="mt-1 text-sm text-amber-800">
              {plannedOrigin.name} → {plannedDestination.name}
              {hasPosition && ` (vehicle currently near ${current?.locationName})`}
            </p>
            <p className="mt-2 text-xs text-amber-700">
              This is the expected route based on the order. The vehicle's real position is shown above.
              Only FASTag crossings and driver GPS are real tracking data.
            </p>
            {hasPosition && (
              <a
                href={googleRoute(plannedOrigin, plannedDestination)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-50"
              >
                <Navigation className="h-4 w-4" aria-hidden /> View planned route in Google Maps
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}