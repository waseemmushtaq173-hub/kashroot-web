/**
 * The KashRoot hub is told about an order, and the vehicle gets the orchard's location (lib/hubIncoming, the hub inbox,
 * the driver's navigation, the farmer's "hub nearby" card, the hub alert emails). The orders below are made up for these
 * tests; the screens never invent one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { letterFor, type Queued } from '@/lib/emailLetters';
import { incomingOrders, needsVehicleCount, orderCode, phaseOf, type IncomingOrder } from '@/lib/hubIncoming';
import { VERIFIED_JK_HUBS } from '@/lib/hubs';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const SHOPIAN = VERIFIED_JK_HUBS.find((h) => h.id.includes('shopian') || h.locationName.toLowerCase().includes('shopian')) ?? VERIFIED_JK_HUBS[0];
let n = 0;
const order = (o: Partial<IncomingOrder>): IncomingOrder => ({ id: `0000000${++n}-aaaa-bbbb-cccc-dddddddddddd`, created_at: '2026-11-10T08:00:00Z', status: 'placed', product: 'Apple', quantity: 100, unit: 'box', ...o });

test('which orders are the hub\'s concern, and where each one stands', () => {
  expect(phaseOf(order({ status: 'placed' }))).toBe('new');
  expect(phaseOf(order({ status: 'accepted' }))).toBe('packing');
  expect(phaseOf(order({ status: 'accepted', boxes_packed_at: '2026-11-11T08:00:00Z' }))).toBe('needs_vehicle');
  expect(phaseOf(order({ status: 'accepted', pickup_stage: 'AWAITING_HUB_VEHICLE' }))).toBe('needs_vehicle');
  expect(phaseOf(order({ status: 'accepted', pickup_stage: 'PICKUP_VEHICLE_ASSIGNED' }))).toBe('vehicle_coming');
  // Picked up, at the hub, on the road, finished, cancelled, declined, disputed and pay-first orders are not in the inbox.
  for (const o of [
    order({ pickup_stage: 'PICKED_UP_FROM_ORCHARD_GATE' }),
    order({ pickup_stage: 'CONSOLIDATED_AT_KASHROOT_HUB' }),
    order({ pickup_stage: 'IN_TRANSIT_TO_BUYER' }),
    order({ status: 'completed' }),
    order({ status: 'cancelled' }),
    order({ status: 'rejected' }),
    order({ status: 'disputed' }),
    order({ pay_first: true }),
  ]) expect(phaseOf(o), JSON.stringify(o)).toBeNull();
});

test('the inbox: packed orders first, the orchard\'s real distance from the hub, a route only with GPS', () => {
  const near = { lat: SHOPIAN.lat + 0.03, lng: SHOPIAN.lng }; // about 3.3 km north of the hub
  const rows = incomingOrders([
    order({ status: 'placed', created_at: '2026-11-12T08:00:00Z' }),
    order({ status: 'accepted', boxes_packed_at: '2026-11-11T08:00:00Z', assigned_hub_name: SHOPIAN.name, seller_live_lat: near.lat, seller_live_lng: near.lng, seller_live_address: 'Orchard road' }),
    order({ status: 'accepted', pickup_stage: 'PICKUP_VEHICLE_ASSIGNED', assigned_hub_name: SHOPIAN.name, seller_live_lat: String(near.lat), seller_live_lng: String(near.lng), pickup_vehicle_number: 'JK01AB1234' }),
    order({ status: 'completed' }),
  ]);
  expect(rows.map((r) => r.phase)).toEqual(['needs_vehicle', 'new', 'vehicle_coming']);
  const [packed, fresh, coming] = rows;
  expect(packed.hub?.id).toBe(SHOPIAN.id);
  expect(packed.hubGuessed).toBe(false);
  expect(packed.km).toBeGreaterThan(3);
  expect(packed.km).toBeLessThan(3.7);
  expect(packed.navigate).toBe(`https://www.google.com/maps/dir/?api=1&destination=${near.lat},${near.lng}`);
  // Coordinates that arrive as text are read as numbers.
  expect(coming.km).toBe(packed.km);
  // No GPS: no hub guessed, no distance, no route.
  expect(fresh).toMatchObject({ hub: null, km: null, navigate: null, hubGuessed: false });
  expect(needsVehicleCount([order({ boxes_packed_at: '2026-11-11T08:00:00Z', status: 'accepted' }), order({}), order({ status: 'cancelled', boxes_packed_at: '2026-11-11T08:00:00Z' })])).toBe(1);
});

test('an order with no hub recorded is matched to the nearest hub by the orchard\'s GPS, and says so', () => {
  const [r] = incomingOrders([order({ status: 'placed', assigned_hub_name: null, seller_live_lat: SHOPIAN.lat + 0.02, seller_live_lng: SHOPIAN.lng })]);
  expect(r.hub?.id).toBe(SHOPIAN.id);
  expect(r.hubGuessed).toBe(true);
  expect(r.km).toBeGreaterThan(2);
  expect(orderCode('abcd1234-0000-0000-0000-000000000000')).toBe('ABCD1234');
});

test('the hub inbox, the driver\'s route and the farmer\'s card are on the screens, with no invented numbers', () => {
  const panel = read('src/components/admin/AdminOrdersPanel.tsx');
  expect(panel).toContain('<HubIncoming orders={orders} />');
  expect(panel).toContain('Incoming for the hub');
  expect(panel).toContain('Route to the orchard');
  const driver = read('src/components/tracking/OrchardPickupJobs.tsx');
  expect(driver).toContain('Navigate to the orchard');
  expect(driver).toContain('Route to the hub');
  expect(driver).toContain('km from you');
  expect(driver).toContain('Show how far each orchard is from me');
  const farmer = read('src/components/market/FarmerUpdates.tsx');
  expect(farmer).toContain('KashRoot hub near your orchard');
  expect(farmer).toContain('hubOfListing(p)');
  // The farmer is told on the overview too, not only on the Pickups tab.
  expect(read('src/app/(dashboards)/farmer/dashboard/page.tsx')).toContain('<HubNearby products={products} limit={2}');
  for (const f of ['src/components/admin/AdminOrdersPanel.tsx', 'src/components/tracking/OrchardPickupJobs.tsx', 'src/components/market/FarmerUpdates.tsx', 'src/lib/hubIncoming.ts']) expect(read(f), f).not.toMatch(/Math\.random|faker|lorem/i);
});

test('the hub emails go to the hub page and name only the order code, what was ordered and the hub', () => {
  const q = (kind: Queued['kind']): Queued => ({ id: 1, kind, ref: 'ABCD1234', detail: '100 box Apple · Aglar Shopian Hub', created_at: '2026-11-20T04:30:00Z', to: 'staff@example.test', help: null });
  const site = 'https://kashroot.example';
  const fresh = letterFor(q('hub_order_new'), site, 'inbox@example.test');
  expect(fresh?.subject).toBe('Order ABCD1234 coming to the hub: 100 box Apple · Aglar Shopian Hub');
  expect(fresh?.action?.href).toBe(`${site}/hub/dashboard`);
  const packed = letterFor(q('hub_order_packed'), site, 'inbox@example.test');
  expect(packed?.subject).toBe('Packed: send a vehicle for order ABCD1234');
  expect(packed?.action?.href).toBe(`${site}/hub/dashboard`);
  expect(letterFor({ ...q('hub_order_new'), to: null }, site, 'inbox@example.test')).toBeNull();
});

test('the hub alert triggers never block an order, go only to hub staff, name no one, and are the newest kind list', () => {
  const sql = read('supabase/migrations/20261130000000_hub_order_alerts.sql');
  expect(sql.match(/exception when others then/g)?.length).toBe(2);
  expect(sql).not.toMatch(/new\.(buyer_name|buyer_phone|delivery_address|amount|seller_phone|seller_name)/);
  // The Super Admin and the team members ticked for Orders: nobody else, and no more than six.
  expect(sql).toContain("t.section = 'orders'");
  expect(sql).toContain("'super_admin'");
  expect(sql).toMatch(/limit 6/);
  expect(sql).toContain("'hub_order_new', 'hub_order_packed'");
  // Only once per step: a new order, and the moment the boxes are packed (not again for later steps).
  expect(sql).toContain("new.pickup_stage = 'AWAITING_HUB_VEHICLE' and new.pickup_stage is distinct from old.pickup_stage");
  expect(sql).toContain('coalesce(new.pay_first, false) = false');
  // The staff list is not callable from the app.
  expect(sql).toContain('revoke all on function public.kr_hub_staff() from public, anon, authenticated;');
  const once = read('supabase/RUN_THIS_ONCE.sql');
  expect(once).toContain("(54, 'Hub alerts: the KashRoot hub is told when an order comes and when boxes are packed', '20261130000000_hub_order_alerts.sql'");
  expect(once).toContain('-- ════════ 20261130000000_hub_order_alerts.sql ════════');
  // The email-kind rule is re-added by each migration that adds a kind: only the last is strict, so a re-run still loads.
  const adds = [...once.matchAll(/alter table public\.email_outbox add constraint email_outbox_kind_check check \(kind in \([\s\S]*?\)\)( not valid)?;/g)];
  adds.slice(0, -1).forEach((a) => expect(a[0], 'an older email-kind rule must skip rows already there').toContain('not valid;'));
  expect(adds[adds.length - 1][0]).not.toContain('not valid');
  expect(adds[adds.length - 1][0]).toContain("'hub_order_packed'");
});
