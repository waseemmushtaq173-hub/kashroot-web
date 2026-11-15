/**
 * Orchard pickup jobs: the driver's half of the hub pickup workflow, on real marketplace orders
 * (market_orders, 20261123000000_hub_pickup_workflow.sql). Server only, with the service role:
 * a pickup driver has no KashRoot account, so nothing here is a database function a stranger could
 * call. The stages go one way and each step checks the one before it:
 *
 *   AWAITING_HUB_VEHICLE          the grower marked the boxes packed (kr_order_mark_packed)
 *   → PICKUP_VEHICLE_ASSIGNED     a driver accepted the job with their vehicle, name and phone
 *   → PICKED_UP_FROM_ORCHARD_GATE the driver entered the grower's 6-digit handover code at the gate
 *   → CONSOLIDATED_AT_KASHROOT_HUB the driver reached the assigned hub
 *   → IN_TRANSIT_TO_BUYER         the driver left for the buyer (the order becomes "shipped")
 *
 * After accepting, every step must come from the same driver phone. The handover code is the real
 * lock: without the code the grower reads out, the boxes cannot be marked picked up.
 */
import 'server-only';
import { timingSafeEqual } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

type Result = { status: number; body: Record<string, unknown> };
const bad = (status: number, error: string): Result => ({ status, body: { ok: false, error } });
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const phone10 = (v: unknown) => {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};
const NOT_SET_UP = 'The hub pickup update has not been run on the database yet (supabase/RUN_THIS_ONCE.sql).';
const missingColumn = (message?: string) => /pickup_stage|order_handover_codes|schema cache|does not exist/i.test(message ?? '');

/** What a driver may see of a job before accepting it: where, what and how much. Never the buyer or the grower's phone. */
const OPEN_COLUMNS = 'id, product, quantity, unit, seller_district, seller_live_lat, seller_live_lng, seller_live_address, assigned_hub_name, boxes_packed_at, pickup_stage';
/** Their own accepted job: also who to meet and where the load goes. */
const MINE_COLUMNS = `${OPEN_COLUMNS}, seller_name, seller_phone, buyer_name, buyer_phone, delivery_address, buyer_live_address, delivery_lat, delivery_lon, pickup_vehicle_number, pickup_driver_name, status`;

/** Jobs waiting for a vehicle, and (with a phone) the jobs that driver has accepted and not finished. */
export async function listPickupJobs(supabase: SupabaseClient, driverPhone: string | null): Promise<Result> {
  const open = await supabase.from('market_orders').select(OPEN_COLUMNS).eq('pickup_stage', 'AWAITING_HUB_VEHICLE').eq('status', 'accepted').order('boxes_packed_at', { ascending: true }).limit(50);
  if (open.error) return missingColumn(open.error.message) ? { status: 200, body: { ok: true, notSetUp: true, open: [], mine: [] } } : bad(500, 'Could not read the pickup jobs.');
  let mine: unknown[] = [];
  const phone = phone10(driverPhone);
  if (phone) {
    const m = await supabase.from('market_orders').select(MINE_COLUMNS).eq('pickup_driver_phone', phone).in('pickup_stage', ['PICKUP_VEHICLE_ASSIGNED', 'PICKED_UP_FROM_ORCHARD_GATE', 'CONSOLIDATED_AT_KASHROOT_HUB', 'IN_TRANSIT_TO_BUYER']).in('status', ['accepted', 'shipped']).order('boxes_packed_at', { ascending: true }).limit(20);
    mine = m.data ?? [];
  }
  return { status: 200, body: { ok: true, open: open.data ?? [], mine } };
}

export async function pickupAction(supabase: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const orderId = text(body.orderId, 40);
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return bad(400, 'Choose a pickup job.');
  const phone = phone10(body.driverPhone);
  if (!phone) return bad(400, 'Write the driver’s 10-digit mobile number.');
  const { data: o, error } = await supabase.from('market_orders').select('id, status, pickup_stage, pickup_driver_phone').eq('id', orderId).maybeSingle();
  if (error) return bad(missingColumn(error.message) ? 503 : 500, missingColumn(error.message) ? NOT_SET_UP : 'Could not read the order.');
  if (!o) return bad(404, 'That pickup job was not found.');
  const mine = o.pickup_driver_phone === phone;

  if (body.action === 'CLAIM_PICKUP') {
    const vehicle = text(body.vehicleNumber, 20).toUpperCase().replace(/\s+/g, ' ');
    const name = text(body.driverName, 80);
    if (!/^[A-Z0-9][A-Z0-9 -]{3,19}$/.test(vehicle)) return bad(400, 'Write the vehicle’s registration number as on its plate, for example JK22A 1234.');
    if (name.length < 2) return bad(400, 'Write the driver’s name.');
    if (o.pickup_stage !== 'AWAITING_HUB_VEHICLE' || o.status !== 'accepted') return bad(409, 'This job is no longer waiting for a vehicle. Refresh the list.');
    // The stage is part of the update's own condition, so two drivers pressing at once cannot both get the job.
    const upd = await supabase
      .from('market_orders')
      .update({ pickup_stage: 'PICKUP_VEHICLE_ASSIGNED', pickup_vehicle_number: vehicle, pickup_driver_name: name, pickup_driver_phone: phone, ship_vehicle: vehicle, driver_name: name, driver_phone: phone })
      .eq('id', orderId)
      .eq('pickup_stage', 'AWAITING_HUB_VEHICLE')
      .select('id');
    if (upd.error) return bad(500, 'Could not accept the job.');
    if (!upd.data?.length) return bad(409, 'Another driver accepted this job a moment ago.');
    return { status: 200, body: { ok: true, stage: 'PICKUP_VEHICLE_ASSIGNED' } };
  }

  if (!mine) return bad(403, 'Only the driver who accepted this job can do this.');

  if (body.action === 'VERIFY_HANDOVER') {
    if (o.pickup_stage !== 'PICKUP_VEHICLE_ASSIGNED') return bad(409, 'This job is not waiting for the orchard-gate handover.');
    const typed = text(body.code, 6);
    if (!/^\d{6}$/.test(typed)) return bad(400, 'Enter the grower’s 6-digit handover code.');
    const { data: secret } = await supabase.from('order_handover_codes').select('code').eq('order_id', orderId).maybeSingle();
    const real = String(secret?.code ?? '');
    if (real.length !== 6 || !timingSafeEqual(Buffer.from(real), Buffer.from(typed))) return bad(403, 'That handover code is not correct. Ask the grower to read it again.');
    const upd = await supabase.from('market_orders').update({ pickup_stage: 'PICKED_UP_FROM_ORCHARD_GATE' }).eq('id', orderId).eq('pickup_stage', 'PICKUP_VEHICLE_ASSIGNED').select('id');
    if (upd.error || !upd.data?.length) return bad(500, 'Could not record the pickup.');
    return { status: 200, body: { ok: true, stage: 'PICKED_UP_FROM_ORCHARD_GATE' } };
  }

  if (body.action === 'MARK_AT_HUB') {
    if (o.pickup_stage !== 'PICKED_UP_FROM_ORCHARD_GATE') return bad(409, 'Confirm the orchard-gate pickup with the grower’s code first.');
    const upd = await supabase.from('market_orders').update({ pickup_stage: 'CONSOLIDATED_AT_KASHROOT_HUB' }).eq('id', orderId).eq('pickup_stage', 'PICKED_UP_FROM_ORCHARD_GATE').select('id');
    if (upd.error || !upd.data?.length) return bad(500, 'Could not record the hub arrival.');
    return { status: 200, body: { ok: true, stage: 'CONSOLIDATED_AT_KASHROOT_HUB' } };
  }

  if (body.action === 'MARK_IN_TRANSIT') {
    if (o.pickup_stage !== 'CONSOLIDATED_AT_KASHROOT_HUB') return bad(409, 'Mark the arrival at the KashRoot Hub first.');
    // The order itself becomes "shipped": the buyer's own steps (follow it, confirm delivery, release the escrow) go on as before.
    const upd = await supabase.from('market_orders').update({ pickup_stage: 'IN_TRANSIT_TO_BUYER', status: 'shipped', shipped_at: new Date().toISOString() }).eq('id', orderId).eq('pickup_stage', 'CONSOLIDATED_AT_KASHROOT_HUB').select('id');
    if (upd.error || !upd.data?.length) return bad(500, 'Could not start the trip.');
    return { status: 200, body: { ok: true, stage: 'IN_TRANSIT_TO_BUYER' } };
  }

  if (body.action === 'PICKUP_GPS_PING') {
    if (o.pickup_stage !== 'IN_TRANSIT_TO_BUYER' || o.status !== 'shipped') return bad(409, 'This load is not on the way to the buyer.');
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (body.latitude == null || body.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return bad(400, 'No real position was sent.');
    const acc = Number(body.accuracyM);
    const now = new Date().toISOString();
    const upd = await supabase
      .from('market_orders')
      .update({ last_lat: lat, last_lon: lng, last_accuracy: Number.isFinite(acc) ? acc : null, last_at: now, shipment_live_lat: lat, shipment_live_lng: lng, shipment_gps_updated_at: now })
      .eq('id', orderId)
      .eq('pickup_stage', 'IN_TRANSIT_TO_BUYER');
    if (upd.error) return bad(500, 'Could not save the position.');
    return { status: 200, body: { ok: true, at: now } };
  }

  return bad(400, 'Unknown pickup step.');
}
