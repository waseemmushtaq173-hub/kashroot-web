/**
 * Links that open Google Maps (the app on a phone, the website on a computer).
 * Plain Maps URLs (developers.google.com/maps/documentation/urls): free, no API
 * key, nothing sent to Google until the person taps the link. A point is used
 * when we have one; otherwise the place name, which Google searches.
 */
export interface MapSpot {
  name: string;
  lat?: number | null;
  lng?: number | null;
}

const has = (s: MapSpot) => typeof s.lat === 'number' && typeof s.lng === 'number' && Number.isFinite(s.lat) && Number.isFinite(s.lng);
const where = (s: MapSpot) => (has(s) ? `${s.lat!.toFixed(5)},${s.lng!.toFixed(5)}` : s.name.trim());

/** The driving route from one place to another. */
export function googleRoute(from: MapSpot, to: MapSpot): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(where(from))}&destination=${encodeURIComponent(where(to))}&travelmode=driving`;
}

/** Driving directions from where the phone is now (Google Maps starts navigation from the current location). */
export function googleNavigate(to: MapSpot): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where(to))}&travelmode=driving`;
}

/** One point (e.g. the truck's last position) on the map. */
export function googlePoint(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Straight-line distance in km. */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * A rough road distance and driving time from a straight line: roads in the
 * hills and plains run about 1.3× the straight line, at about 35 km/h on
 * average for a loaded truck with stops. Shown as an estimate only.
 */
export function roadEstimate(a: { lat: number; lng: number }, b: { lat: number; lng: number }): { km: number; hours: number } {
  const km = Math.max(1, Math.round(kmBetween(a, b) * 1.3));
  return { km, hours: Math.max(0.5, Math.round((km / 35) * 2) / 2) };
}
