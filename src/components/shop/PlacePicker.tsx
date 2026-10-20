'use client';

/**
 * Where to deliver, as a pin on the map: "Use my location", or type the
 * village and pick it from the list (the same place search as the weather
 * and orchard tools: /api/weather?search=…&deep=1). Tapping the map moves
 * the pin to the exact house or shop.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { LocateFixed, MapPin, Search } from 'lucide-react';

import { Btn, INPUT, type PortalTheme } from '@/components/portal/kit';
import type { Point } from '@/lib/db/shop';

const ShopMap = dynamic(() => import('@/components/shop/ShopMap'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />,
});

interface Place {
  name: string;
  admin: string;
  lat: number;
  lng: number;
  note?: string;
}

export interface DeliveryPin extends Point {
  /** How the pin was chosen, in words ("My location", "Chitragam, Shopian"). */
  label: string;
}

export function PlacePicker({ value, onChange, theme }: { value: DeliveryPin | null; onChange: (p: DeliveryPin) => void; theme: PortalTheme }) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState<'gps' | 'search' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const useGps = () => {
    setProblem(null);
    if (!navigator.geolocation) return setProblem('This phone cannot share its location. Type your village below instead.');
    setBusy('gps');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        onChange({ lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lng: Math.round(pos.coords.longitude * 1e5) / 1e5, label: 'My location' });
      },
      (err) => {
        setBusy(null);
        setProblem(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in the browser settings, or type your village below.' : 'Could not find your location. Go outside or turn on location, or type your village below.');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  };

  const search = async () => {
    setProblem(null);
    if (query.trim().length < 2) return setProblem('Type the name of your village or town first.');
    setBusy('search');
    try {
      const res = await fetch(`/api/weather?search=${encodeURIComponent(query.trim())}&deep=1`);
      const data = (await res.json()) as { places?: Place[] };
      if (!res.ok) throw new Error('down');
      setPlaces(data.places ?? []);
      if (!data.places?.length) setProblem('No place found with that name. Add the district after the village (for example “Chitragam Shopian”), or press “Use my location”.');
    } catch {
      setProblem('The map search did not answer. Check your internet, or press “Use my location”.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <Btn theme={theme} variant="soft" icon={LocateFixed} className="min-h-11 w-full sm:w-auto" disabled={busy !== null} onClick={useGps}>
        {busy === 'gps' ? 'Finding where you are…' : 'Use my location'}
      </Btn>
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Village or town</span>
          <input
            className={`${INPUT} min-h-11`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="…or type your village / town"
          />
        </label>
        <Btn theme={theme} variant="soft" icon={Search} className="min-h-11" disabled={busy !== null} onClick={() => void search()}>
          {busy === 'search' ? 'Finding…' : 'Find'}
        </Btn>
      </div>
      {places && places.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-xl bg-white ring-1 ring-slate-200" aria-label="Places found">
          {places.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button
                type="button"
                className="min-h-11 w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-orange-50"
                onClick={() => {
                  onChange({ lat: p.lat, lng: p.lng, label: p.note ? `${query.trim()} (near ${p.name})` : `${p.name}${p.admin ? `, ${p.admin}` : ''}` });
                  setPlaces(null);
                }}
              >
                {p.name} <span className="text-slate-500">{p.admin}</span>
                {p.note && <span className="mt-0.5 block text-xs text-amber-800">{p.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{problem}</p>}
      {value ? (
        <>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
            <MapPin className="h-4 w-4" aria-hidden /> Pin set: {value.label}
          </p>
          <ShopMap target={value} onPick={(p) => onChange({ ...p, label: 'Pin moved on the map' })} />
          <p className="text-xs text-slate-500">Tap the map to move the pin to your house or shop. Map © OpenStreetMap contributors.</p>
        </>
      ) : (
        <p className="text-sm text-slate-600">The pin shows the driver exactly where to bring your order.</p>
      )}
    </div>
  );
}
