/**
 * Pooled locations (lib/hubs.ts): a KashRoot hub and the orchards within 10 km of it, from real GPS only. No server needed.
 */
import { expect, test } from '@playwright/test';

import { VERIFIED_JK_HUBS, directionsTo, hubByName, hubById, hubDistanceText, hubOfListing, hubReach, kmFromHub, kmIfInArea } from '@/lib/hubs';

const shopian = VERIFIED_JK_HUBS[0];
const listing = (o: { seller_id?: string; quantity?: number; unit?: string; captured_lat?: number | null; captured_lng?: number | null }) => ({ seller_id: 's1', quantity: 100, unit: 'box', captured_lat: shopian.lat + 0.02, captured_lng: shopian.lng, ...o });

test('a listing\'s hub and the real distance to it; no GPS means no number', () => {
  const l = listing({});
  const h = hubOfListing(l)!;
  expect(h.hub.id).toBe(shopian.id);
  expect(h.km).toBeGreaterThan(1.5);
  expect(h.km).toBeLessThan(3);
  expect(h.within).toBe(true);
  expect(hubOfListing(listing({ captured_lat: null, captured_lng: null }))).toBeNull();
  expect(hubOfListing(listing({ captured_lat: 0, captured_lng: 0 }))).toBeNull();
  expect(kmFromHub(shopian, null, null)).toBeNull();
  expect(hubDistanceText(l)).toMatch(/Aglar, Shopian hub is \d+(\.\d)? km from this orchard: inside its 10 km pickup area\./);
  expect(hubDistanceText(listing({ captured_lat: 34.0, captured_lng: 76.0 }))).toMatch(/outside its 10 km pickup area/);
  expect(hubDistanceText(listing({ captured_lat: null, captured_lng: null }))).toBeNull();
});

test('every hub says how many farmers and boxes it can collect from within 10 km', () => {
  const reach = hubReach([
    listing({ seller_id: 'a', quantity: 300 }),
    listing({ seller_id: 'a', quantity: 200 }),
    listing({ seller_id: 'b', quantity: 50, unit: 'kg' }),
    listing({ seller_id: 'c', captured_lat: shopian.lat + 0.5 }),
    listing({ seller_id: 'd', captured_lat: null, captured_lng: null }),
  ]);
  const s = reach.find((r) => r.hub.id === shopian.id)!;
  expect(s).toMatchObject({ farmers: 2, listings: 3, boxes: 500 });
  expect(reach).toHaveLength(VERIFIED_JK_HUBS.length);
  expect(reach.filter((r) => r.hub.id !== shopian.id).every((r) => r.listings === 0 || r.hub.id !== shopian.id)).toBe(true);
  // An orchard 50 km out is in no hub's area.
  expect(reach.reduce((n, r) => n + r.listings, 0)).toBe(3);
  expect(kmIfInArea(shopian, listing({}))).not.toBeNull();
  expect(kmIfInArea(shopian, listing({ captured_lat: shopian.lat + 0.5 }))).toBeNull();
});

test('hubs are found by id or name, and the driver\'s directions need a real point', () => {
  expect(hubById(shopian.id)?.name).toBe(shopian.name);
  expect(hubByName(shopian.name)?.id).toBe(shopian.id);
  expect(hubByName('Somewhere else')).toBeNull();
  expect(hubByName(null)).toBeNull();
  expect(directionsTo(33.7431, 74.8722)).toBe('https://www.google.com/maps/dir/?api=1&destination=33.7431,74.8722');
  expect(directionsTo(null, 74)).toBeNull();
  expect(directionsTo(0, 0)).toBeNull();
});
