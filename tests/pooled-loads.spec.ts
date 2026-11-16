/**
 * The buyer's pooled location and the farmer's pickups board (lib/pooledLoads), read from orders only. The orders below are
 * made up for these tests; the screens never invent one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import type { MarketOrder } from '@/lib/db/market';
import { letterFor, type Queued } from '@/lib/emailLetters';
import { farmerBoard, headlineOf, latestUpdate, needOf, NO_HUB, pooledLoads, stepOf } from '@/lib/pooledLoads';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
let n = 0;
const order = (o: Partial<MarketOrder>): MarketOrder =>
  ({ id: `o${++n}`, listing_id: null, seller_id: 's', buyer_id: 'b', buyer_name: 'Buyer Co', buyer_phone: '9000000000', delivery_address: 'X', product: 'Apple', unit: 'box', quantity: 100, unit_price: 800, amount: 80000, payment_ref: null, status: 'accepted', seller_note: null, buyer_note: null, created_at: '2026-11-10T08:00:00Z', ...o }) as MarketOrder;

test('each order is at one step, from what its own fields say', () => {
  expect(stepOf({ status: 'placed', pickup_stage: null })).toBe(0);
  expect(stepOf({ status: 'accepted', pickup_stage: null })).toBe(0);
  expect(stepOf({ status: 'accepted', pickup_stage: 'AWAITING_HUB_VEHICLE' })).toBe(1);
  expect(stepOf({ status: 'accepted', pickup_stage: 'PICKUP_VEHICLE_ASSIGNED' })).toBe(2);
  expect(stepOf({ status: 'accepted', pickup_stage: 'PICKED_UP_FROM_ORCHARD_GATE' })).toBe(3);
  expect(stepOf({ status: 'accepted', pickup_stage: 'CONSOLIDATED_AT_KASHROOT_HUB' })).toBe(4);
  expect(stepOf({ status: 'shipped', pickup_stage: 'IN_TRANSIT_TO_BUYER' })).toBe(5);
  expect(stepOf({ status: 'shipped', pickup_stage: null })).toBe(5);
  expect(stepOf({ status: 'delivered', pickup_stage: null })).toBe(6);
  expect(stepOf({ status: 'completed', pickup_stage: 'DELIVERED' })).toBe(6);
});

test('a buyer\'s open orders become one load per hub, the slowest first; finished, cancelled and pay-first orders are not in it', () => {
  const loads = pooledLoads([
    order({ assigned_hub_name: 'Shopian Hub', pickup_stage: 'CONSOLIDATED_AT_KASHROOT_HUB', quantity: 300 }),
    order({ assigned_hub_name: 'Shopian Hub', pickup_stage: 'AWAITING_HUB_VEHICLE', quantity: 500 }),
    order({ assigned_hub_name: 'Shopian Hub', pickup_stage: 'PICKUP_VEHICLE_ASSIGNED', unit: 'kg', quantity: 40 }),
    order({ assigned_hub_name: 'Shopian Hub', status: 'cancelled' }),
    order({ assigned_hub_name: 'Shopian Hub', status: 'completed', pickup_stage: 'DELIVERED' }),
    order({ assigned_hub_name: 'Shopian Hub', pay_first: true }),
    order({ assigned_hub_name: null, status: 'placed', quantity: 50 }),
  ]);
  expect(loads.map((l) => l.hub)).toEqual([NO_HUB, 'Shopian Hub']);
  const [none, shopian] = loads;
  expect(none).toMatchObject({ boxes: 50, slowest: 0 });
  // Boxes are summed (a kilo is not a box), and the slowest order sets where the load is.
  expect(shopian).toMatchObject({ boxes: 800, slowest: 1 });
  // No invented truck size: a load has boxes, not a capacity.
  expect(shopian).not.toHaveProperty('capacity');
  expect(shopian.lines).toHaveLength(3);
  expect(shopian.lines.map(stepOf)).toEqual([1, 2, 4]);
  expect(shopian.counts).toMatchObject({ 1: 1, 2: 1, 4: 1, 0: 0 });
  expect(pooledLoads([])).toEqual([]);
});

test('the headline says where the load is in plain words', () => {
  const c = (o: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, number>>) => ({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, ...o });
  expect(headlineOf(c({ 4: 3 }), 3)).toBe('All your boxes are at the hub: they leave for you next.');
  expect(headlineOf(c({ 5: 3 }), 3)).toBe('Your boxes are on the road to you.');
  expect(headlineOf(c({ 6: 2 }), 2)).toBe('Everything in this load has arrived.');
  expect(headlineOf(c({ 4: 1, 1: 1, 0: 1 }), 3)).toBe('1 of 3 orders at the hub or beyond; 1 order waiting for the farmer, 1 waiting for a vehicle.');
  expect(headlineOf(c({ 4: 2, 3: 1 }), 3)).toBe('2 of 3 orders at the hub or beyond; 1 on the way to the hub.');
  expect(headlineOf(c({}), 0)).toBe('');
});

test('the farmer\'s board: what needs them now, what is moving, what is done', () => {
  const board = farmerBoard([
    order({ status: 'placed' }),
    order({ status: 'accepted', pickup_stage: null, boxes_packed_at: null }),
    order({ status: 'accepted', pickup_stage: 'AWAITING_HUB_VEHICLE', boxes_packed_at: '2026-11-11T08:00:00Z' }),
    order({ status: 'accepted', pickup_stage: 'PICKUP_VEHICLE_ASSIGNED' }),
    order({ status: 'accepted', pickup_stage: 'PICKED_UP_FROM_ORCHARD_GATE' }),
    order({ status: 'shipped', pickup_stage: 'IN_TRANSIT_TO_BUYER' }),
    order({ status: 'completed', pickup_stage: 'DELIVERED' }),
    order({ status: 'cancelled' }),
    order({ status: 'rejected' }),
    order({ status: 'placed', pay_first: true }),
  ]);
  expect(Object.fromEntries(Object.entries(board).map(([k, v]) => [k, v.length]))).toEqual({ accept: 1, pack: 1, handover: 2, moving: 2, done: 1 });
  expect(needOf(order({ status: 'cancelled' }))).toBeNull();
});

test('the latest update is the newest thing the order\'s own times say happened', () => {
  expect(latestUpdate(order({ created_at: '2026-11-10T08:00:00Z' }))).toMatchObject({ text: 'New order from Buyer Co: 100 box' });
  expect(latestUpdate(order({ accepted_at: '2026-11-10T09:00:00Z', boxes_packed_at: '2026-11-11T07:00:00Z' }))).toMatchObject({ text: 'You marked the boxes packed', at: '2026-11-11T07:00:00Z' });
  expect(latestUpdate(order({ shipped_at: '2026-11-12T07:00:00Z', escrow_released_at: '2026-11-14T07:00:00Z' }))?.text).toBe('The escrow was released to you');
  expect(latestUpdate(order({ created_at: 'not a date' }))).toBeNull();
  // The newest order update first inside a group.
  const b = farmerBoard([order({ status: 'placed', created_at: '2026-11-10T08:00:00Z' }), order({ status: 'placed', created_at: '2026-11-13T08:00:00Z' })]);
  expect(b.accept.map((o) => o.created_at)).toEqual(['2026-11-13T08:00:00Z', '2026-11-10T08:00:00Z']);
});

test('the screens: a Pooled location tab for the buyer, a Pickups & updates tab for the farmer, nothing invented', () => {
  const buyer = read('src/app/(dashboards)/buyer/dashboard/page.tsx');
  expect(buyer).toContain("{ id: 'pooled', label: 'Pooled location', icon: Truck, count: poolLines || undefined }");
  expect(buyer).toContain("{tab === 'pooled' && <PooledLocation orders={orders}");
  // The truck idea is gone: no file, no word on the buyer's screens.
  for (const f of ['src/components/market/PooledTruck.tsx', 'src/components/market/shop/ClusterTruckBar.tsx']) expect(existsSync(join(process.cwd(), f)), f).toBe(false);
  expect(buyer).not.toMatch(/Pooled truck|PooledTruck/);
  const farmer = read('src/app/(dashboards)/farmer/dashboard/page.tsx');
  expect(farmer).toContain("{ id: 'pickups', label: 'Pickups & updates', icon: Truck, count: needsYouCount(orders) || undefined }");
  expect(farmer).toContain("{tab === 'pickups' && <FarmerUpdates");
  expect(farmer).toContain('products={products}');
  for (const f of ['src/components/market/PooledLocation.tsx', 'src/components/market/FarmerUpdates.tsx', 'src/lib/pooledLoads.ts', 'src/lib/hubs.ts', 'src/lib/hubIncoming.ts']) expect(read(f), f).not.toMatch(/Math\.random|faker|lorem/i);
  // The vehicle's map is shown only when an order on the road has reported a position.
  expect(read('src/components/market/PooledLocation.tsx')).toContain('truck ? (');
});

test('the order emails go to the right page and name only the order code and what moved', () => {
  const q = (kind: Queued['kind'], detail: string): Queued => ({ id: 1, kind, ref: '11111111', detail, created_at: '2026-11-20T04:30:00Z', to: 'someone@example.test', help: null });
  const site = 'https://kashroot.example';
  const farmer = letterFor(q('order_new', '100 box Apple'), site, 'inbox@example.test');
  expect(farmer?.subject).toBe('New order 11111111: 100 box Apple');
  expect(farmer?.action?.href).toBe(`${site}/farmer/dashboard?tab=pickups`);
  expect(letterFor(q('order_farmer_update', 'A pickup vehicle is assigned: 100 box Apple'), site, 'i@e.test')?.lines.join(' ')).toContain('6-digit handover code');
  const buyer = letterFor(q('order_buyer_update', 'On the road to you: 100 box Apple'), site, 'i@e.test');
  expect(buyer?.subject).toBe('Your order 11111111: On the road to you: 100 box Apple');
  expect(buyer?.action?.href).toBe(`${site}/buyer/dashboard?tab=pooled`);
  expect(letterFor({ ...q('order_new', 'x'), to: null }, site, 'i@e.test')).toBeNull();
});

test('the order triggers never block an order, send only the steps a person acts on, and name no one', () => {
  const sql = read('supabase/migrations/20261129000000_order_notifications.sql');
  // Each trigger catches its own errors.
  expect(sql.match(/exception when others then/g)?.length).toBe(2);
  // No name, phone, address or amount is read into the queue.
  expect(sql).not.toMatch(/new\.(buyer_name|buyer_phone|delivery_address|amount|seller_phone)/);
  // The farmer: a new order, and the pickup vehicle. The buyer: the farmer's answer, the hub, the road, delivery. "Packed" and "picked up" send nothing.
  expect(sql).toContain("'order_new'");
  expect(sql).toContain("new.pickup_stage = 'PICKUP_VEHICLE_ASSIGNED'");
  expect(sql).toContain("new.pickup_stage in ('CONSOLIDATED_AT_KASHROOT_HUB', 'IN_TRANSIT_TO_BUYER', 'DELIVERED')");
  expect(sql).not.toMatch(/'AWAITING_HUB_VEHICLE'|'PICKED_UP_FROM_ORCHARD_GATE'/);
  expect(read('supabase/RUN_THIS_ONCE.sql')).toContain("(53, 'Order emails: new order, pickup vehicle, hub, on the road, delivered'");
});
