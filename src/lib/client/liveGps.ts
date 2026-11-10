'use client';

/**
 * Live GPS for orders: one high-accuracy fix on demand, and a
 * watchPosition stream that pushes every fix to a callback (throttled to
 * match the database's own 10-second throttle). Used by the order card on
 * both sides — the seller streams the shipment, the buyer their destination.
 * The address is reverse-geocoded with the same Nominatim lookup the listing
 * camera uses (geoStampMedia), at most once every two minutes.
 */
import { useEffect, useRef, useState } from 'react';
import type { GpsFix } from '@/lib/db/market';
import { getLiveGPS, reverseGeocode } from '@/lib/geoStampMedia';

export type { GpsFix };

/** One live GPS fix with the time it was taken. */
export interface LiveFix extends GpsFix {
  accuracy: number | null;
  address: string;
  at: number;
}

/** One-shot: the phone's current position with high accuracy, reverse-geocoded. */
export async function capturePoint(): Promise<LiveFix> {
  const pos = await getLiveGPS();
  const fix: LiveFix = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    address: `${pos.coords.latitude.toFixed(5)}° N, ${pos.coords.longitude.toFixed(5)}° E`,
    at: Date.now(),
  };
  try {
    fix.address = await reverseGeocode(fix.lat, fix.lng);
  } catch {
    // Coordinates still pin the place when the lookup fails.
  }
  return fix;
}

/**
 * Streams this phone's live GPS while `enabled`: a first fix at once, then
 * every movement, pushed through `onFix` at most once every `gapMs` (the
 * database throttles at 10 seconds too). Falls back to the last address:
 * the reverse lookup happens only when the receiver moves a few hundred
 * metres — on a moving shipment that is roughly once a minute.
 */
export function useLiveGps(
  enabled: boolean,
  onFix: (fix: GpsFix) => void,
  gapMs = 10_000,
): { live: ({ lat: number; lng: number; accuracy: number | null } & { at: number }) | null; error: string | null } {
  const [live, setLive] = useState<{ lat: number; lng: number; accuracy: number | null; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onFix);
  // The newest callback — kept outside render (react-hooks/refs), read by the watcher below.
  useEffect(() => {
    cb.current = onFix;
  }, [onFix]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let dead = false;
    let lastSent = 0;
    let lastAddr = 0;
    let addr = '';

    const push = (pos: GeolocationPosition) => {
      if (dead) return;
      const now = Date.now();
      const fix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        address: null as string | null,
      };
      setLive({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, at: now });
      // The address follows at most twice a minute — it rides along on the
      // next throttled push, so the map always shows something readable.
      if (now - lastAddr > 120_000) {
        lastAddr = now;
        reverseGeocode(fix.lat, fix.lng).then((a) => {
          addr = a;
        }).catch(() => undefined);
      }
      if (now - lastSent < gapMs) return;
      lastSent = now;
      fix.address = addr || null;
      cb.current(fix);
    };
    const fail = (e: GeolocationPositionError) => {
      if (!dead) setError(e.message || 'Location unavailable');
    };

    navigator.geolocation.getCurrentPosition(push, fail, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    const id = navigator.geolocation.watchPosition(push, fail, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    return () => {
      dead = true;
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled, gapMs]);

  return { live, error };
}
