'use client';

/**
 * A place for a consignment (From / To): type a village, town or mandi and
 * pick it from the suggestions (the same free place search as the weather and
 * shop: /api/weather?search=…&deep=1, OpenStreetMap / GeoNames), or press
 * "Use my location". The picked point opens the route in Google Maps. Typing
 * a name and not picking one still works: Google Maps searches the name.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, LocateFixed, MapPin } from 'lucide-react';

import { INPUT } from '@/components/portal/kit';
import type { PlacePoint } from '@/lib/db/consignments';

interface Found {
  name: string;
  admin: string;
  lat: number;
  lng: number;
  note?: string;
}

const short = (f: Found) => {
  // "Azadpur" + "Delhi, India" → "Azadpur, Delhi"
  const area = f.admin.split(',').map((s) => s.trim()).filter((s) => s && s !== 'India')[0];
  return area && area !== f.name ? `${f.name}, ${area}` : f.name;
};

export function PlaceInput({
  label,
  value,
  point,
  onChange,
  placeholder,
  gps = false,
}: {
  label: string;
  value: string;
  point: PlacePoint | null;
  onChange: (text: string, point: PlacePoint | null) => void;
  placeholder?: string;
  /** Show "Use my location" (for where the load starts). */
  gps?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [found, setFound] = useState<Found[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'search' | 'gps' | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  // The text that was last searched, so picking a suggestion does not search again.
  const searched = useRef('');

  useEffect(() => {
    const q = value.trim();
    if (point || q.length < 3 || q === searched.current) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(async () => {
      searched.current = q;
      setBusy('search');
      try {
        const res = await fetch(`/api/weather?search=${encodeURIComponent(q)}&deep=1`, { signal: ctl.signal });
        const data = (await res.json()) as { places?: Found[] };
        const places = (data.places ?? []).slice(0, 6);
        setFound(places);
        setOpen(places.length > 0);
        setActive(-1);
        setHint(places.length ? null : 'No place found with that name — add the district (e.g. “Chitragam Shopian”), or keep the name as typed.');
      } catch {
        /* typing on, or offline: the name as typed still works */
      } finally {
        setBusy(null);
      }
    }, 650);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [value, point]);

  const pick = (f: Found) => {
    const name = short(f);
    searched.current = name;
    onChange(name, { name, lat: f.lat, lng: f.lng });
    setOpen(false);
    setFound([]);
    setHint(f.note ?? null);
  };

  const useGps = () => {
    setHint(null);
    if (!navigator.geolocation) return setHint('This phone cannot share its location. Type the place instead.');
    setBusy('gps');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Math.round(pos.coords.latitude * 1e5) / 1e5;
        const lng = Math.round(pos.coords.longitude * 1e5) / 1e5;
        let name = 'My location';
        try {
          const j = (await (await fetch(`/api/place?lat=${lat}&lng=${lng}`)).json()) as { name?: string | null };
          if (j.name) name = j.name;
        } catch {
          /* the point is enough */
        }
        searched.current = name;
        onChange(name, { name, lat, lng });
        setBusy(null);
      },
      (err) => {
        setBusy(null);
        setHint(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in the browser settings, or type the place.' : 'Could not find where you are. Type the place instead.');
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-800">{label}</label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className={`${INPUT} pr-9`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value, null);
            setHint(null);
          }}
          onFocus={() => found.length > 0 && !point && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !found.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % found.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a <= 0 ? found.length - 1 : a - 1));
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              pick(found[active]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : point ? <Check className="h-4 w-4 text-emerald-700" aria-label="Place picked on the map" /> : <MapPin className="h-4 w-4" aria-hidden />}
        </span>
      </div>
      {open && found.length > 0 && (
        <ul id={listId} role="listbox" aria-label={`${label}: places found`} className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-900/10">
          {found.map((f, i) => (
            <li
              key={`${f.lat},${f.lng}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-11 cursor-pointer items-start gap-2 px-3 py-2 text-sm ${i === active ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(f);
              }}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
              <span>
                <span className="font-medium text-slate-900">{f.name}</span> <span className="text-slate-500">{f.admin}</span>
                {f.note && <span className="block text-xs text-amber-800">{f.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {gps && (
        <button type="button" onClick={useGps} disabled={busy !== null} className="mt-1.5 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-emerald-800 hover:underline disabled:opacity-60">
          {busy === 'gps' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LocateFixed className="h-4 w-4" aria-hidden />}
          {busy === 'gps' ? 'Finding where you are…' : 'Use my location'}
        </button>
      )}
      {point && !hint && <p className="mt-1 text-xs text-emerald-800">On the map: {point.name}</p>}
      {hint && <p className="mt-1 text-xs text-amber-800">{hint}</p>}
    </div>
  );
}
