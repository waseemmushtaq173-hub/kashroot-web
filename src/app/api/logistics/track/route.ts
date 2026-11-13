// src/app/api/logistics/track/route.ts
// Phase 5.1 — Live Logistics & Shipment Tracking API (master-upgrade v2).
//
// Consent-based driver GPS pings with Haversine distance covered /
// remaining, speed, ETA, geofence status, route-deviation alerts, a rolling
// route history for the live map, and automatic SIGNAL_STALE detection when
// no ping arrives within 10 minutes. Trips live in shipment_tracking_trips +
// shipment_telemetry_events; vehicles are verified against authorized_fleet
// (both tables: 20261112000001_kashroot_ecosystem_phases.sql + the
// 20261112000002_kashroot_master_upgrade.sql columns).
//
// Every write fills BOTH column sets (v1 and v2): consent_granted /
// consent_granted_at AND driver_consent_granted / driver_consent_timestamp;
// covered_distance_km AND distance_travelled_km — so older readers and the
// new map both work.
//
// The server routes mediate all access: the tables' rows are open to the
// anon-key server client by policy, and these endpoints are IP rate-limited.
//
//   GET  ?code=KR-TRK-…    → one trip (or the 25 newest), with the effective
//                            status (SIGNAL_STALE when the last ping is old).
//   GET  ?fleet=1          → the authorized_fleet registry (500 newest).
//   GET  ?fleetCheck=REGNO → one vehicle's RTO record (or "not found").
//   POST { action: 'CREATE_TRIP', … }       → create a trip with consent.
//   POST { action: 'DRIVER_GPS_PING', … }   → one live ping from the driver.
//   POST { action: 'DRIVER_CONSENT', … }    → the driver's explicit consent.
//   POST { action: 'FLEET_IMPORT', rows: […] } → RTO fleet CSV upsert.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Great-circle distance in km (the Haversine formula). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Perpendicular distance of a point from the origin→destination line, in km. */
function offRouteKm(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): number {
  // Flat-earth projection around the midpoint is plenty at these distances.
  const mLat = (originLat + destLat) / 2;
  const kx = Math.cos((mLat * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  const ax = originLng * kx, ay = originLat * ky;
  const bx = destLng * kx, by = destLat * ky;
  const px = lng * kx, py = lat * ky;
  const abx = bx - ax, aby = by - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 === 0) return haversineKm(lat, lng, originLat, originLng);
  let t = ((px - ax) * abx + (py - ay) * aby) / abLen2;
  t = Math.max(0, Math.min(1, t)); // clamp: distance to the segment
  const cx = ax + t * abx, cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

/** A number that is truly a finite number (else NaN / null stay out). */
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;

const STALE_MS = 10 * 60 * 1000;
const GEOFENCE_KM = 0.5;
const ARRIVED_KM = 0.15;
const CORRIDOR_KM = 15; // farther than this from the direct line = deviation
const HISTORY_CAP = 500;

/** geofence_status from the remaining distance. */
function geofenceStatus(remainingKm: number): string {
  if (remainingKm <= ARRIVED_KM) return 'ARRIVED';
  if (remainingKm <= GEOFENCE_KM) return 'INSIDE_GEOFENCE';
  if (remainingKm <= 5) return 'APPROACHING_GEOFENCE';
  return 'OUTSIDE_GEOFENCE';
}

interface RoutePoint {
  lat: number;
  lng: number;
  t: string;
  km?: number;
}

/** Append to route_history (capped at HISTORY_CAP points). */
function pushHistory(history: unknown, lat: number, lng: number, kmStep: number | null): RoutePoint[] {
  const list = Array.isArray(history) ? (history as RoutePoint[]) : [];
  const point: RoutePoint = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), t: new Date().toISOString() };
  if (kmStep !== null && Number.isFinite(kmStep)) point.km = Number(kmStep.toFixed(3));
  const next = [...list, point];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

/** The RTO record for a vehicle registration, or null. */
async function fleetLookup(supabase: ReturnType<typeof getSupabase>, reg: string) {
  const { data } = await supabase
    .from('authorized_fleet')
    .select('*')
    .eq('vehicle_registration_no', reg.toUpperCase())
    .maybeSingle();
  return data ?? null;
}

export async function GET(request: Request) {
  if (ipLimited(request, 'logistics-track', 30)) return tooMany();

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const fleet = searchParams.get('fleet');
  const fleetCheck = searchParams.get('fleetCheck');
  const supabase = getSupabase();

  if (fleet) {
    const { data, error } = await supabase
      .from('authorized_fleet')
      .select('*')
      .order('vehicle_registration_no', { ascending: true })
      .limit(500);
    if (error) return NextResponse.json({ ok: false, error: error.message, vehicles: [] }, { status: 500 });
    return NextResponse.json({ ok: true, vehicles: data ?? [] });
  }

  if (fleetCheck) {
    const vehicle = await fleetLookup(supabase, String(fleetCheck));
    return NextResponse.json({ ok: true, found: Boolean(vehicle), vehicle });
  }

  let query = supabase
    .from('shipment_tracking_trips')
    .select('*')
    .order('updated_at', { ascending: false });

  if (code) query = query.eq('shipment_code', code);

  const { data: trips, error } = await query.limit(25);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, trips: [] }, { status: 500 });
  }

  const nowMs = Date.now();
  const enriched = (trips ?? []).map((t) => {
    const lastPingMs = t.last_ping_at ? new Date(t.last_ping_at).getTime() : 0;
    const isStale =
      lastPingMs > 0 && nowMs - lastPingMs > STALE_MS && t.trip_status === 'IN_TRANSIT_LIVE';
    return {
      ...t,
      effective_status: isStale ? 'SIGNAL_STALE' : t.trip_status,
      minutes_since_last_ping: lastPingMs > 0 ? Math.round((nowMs - lastPingMs) / 60000) : null,
    };
  });

  return NextResponse.json({ ok: true, trips: enriched });
}

export async function POST(request: Request) {
  if (ipLimited(request, 'logistics-track-post', 60)) return tooMany();

  const body = await request.json().catch(() => null);
  if (!body || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });
  }

  const supabase = getSupabase();

  if (body.action === 'CREATE_TRIP') {
    const required = ['driverName', 'driverPhone', 'vehicleRegistrationNo', 'originName', 'destinationName'];
    for (const f of required) {
      if (!String(body[f] ?? '').trim()) {
        return NextResponse.json({ ok: false, error: `Missing ${f}` }, { status: 400 });
      }
    }
    const originLat = num(body.originLat);
    const originLng = num(body.originLng);
    const destLat = num(body.destinationLat);
    const destLng = num(body.destinationLng);
    if (originLat === null || originLng === null || destLat === null || destLng === null) {
      return NextResponse.json({ ok: false, error: 'Missing origin / destination coordinates' }, { status: 400 });
    }

    // RTO verification against the authorized_fleet registry.
    const regNo = String(body.vehicleRegistrationNo || '').toUpperCase().trim();
    const fleetRow = await fleetLookup(supabase, regNo);
    const rtoMetadata = fleetRow
      ? {
          vehicle_type: fleetRow.vehicle_type ?? null,
          owner_name: fleetRow.owner_name ?? null,
          rto_office: fleetRow.rto_office ?? null,
          rto_code: fleetRow.rto_code ?? null,
          fitness_valid_upto: fleetRow.fitness_valid_upto ?? null,
          permit_type: fleetRow.permit_type ?? null,
          permit_valid_upto: fleetRow.permit_valid_upto ?? null,
          insurance_valid_upto: fleetRow.insurance_valid_upto ?? null,
          fuel_type: fleetRow.fuel_type ?? null,
          source: fleetRow.source ?? null,
          checked_at: new Date().toISOString(),
        }
      : null;

    const totalKm = haversineKm(originLat, originLng, destLat, destLng);
    const shipmentCode = body.shipmentCode || `KR-TRK-${Date.now().toString().slice(-6)}`;
    const consent = Boolean(body.consentGranted) || Boolean(body.driverConsentGranted);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('shipment_tracking_trips')
      .insert({
        order_id: body.orderId ?? null,
        shipment_code: shipmentCode,
        seller_id: body.sellerId ?? null,
        buyer_id: body.buyerId ?? null,
        driver_name: body.driverName,
        driver_phone: body.driverPhone,
        driver_id: body.driverId ?? null,
        vehicle_registration_no: regNo,
        tracking_source: body.trackingSource || 'DRIVER_APP_GPS',
        consent_granted: consent,
        consent_granted_at: consent ? nowIso : null,
        // v2 columns (both column sets are always written):
        driver_consent_granted: consent,
        driver_consent_timestamp: consent ? nowIso : null,
        rto_metadata: rtoMetadata,
        route_deviation_alert: false,
        geofence_status: geofenceStatus(totalKm),
        route_history: pushHistory([], originLat, originLng, null),
        distance_travelled_km: 0,
        vehicle_type: body.vehicleType || 'REFRIGERATED_TRUCK',
        rto_verified_status: fleetRow ? 'VERIFIED_RTO_RECORD' : body.rtoVerifiedStatus || 'UNVERIFIED',
        origin_name: body.originName,
        origin_lat: originLat,
        origin_lng: originLng,
        destination_name: body.destinationName,
        destination_lat: destLat,
        destination_lng: destLng,
        current_lat: originLat,
        current_lng: originLng,
        total_distance_km: Number(totalKm.toFixed(2)),
        covered_distance_km: 0,
        remaining_distance_km: Number(totalKm.toFixed(2)),
        eta_minutes: Math.round((totalKm / 45) * 60),
        trip_status: consent ? 'IN_TRANSIT_LIVE' : 'ASSIGNED',
        last_ping_at: consent ? nowIso : null,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // The consent moment is the trip's first telemetry event.
    if (consent) {
      await supabase.from('shipment_telemetry_events').insert({
        trip_id: data.id,
        event_type: 'CONSENT_GRANTED',
        lat: originLat,
        lng: originLng,
        notes: 'Driver agreed to share live GPS at trip start.',
      });
    }

    return NextResponse.json({ ok: true, trip: data, rto_verified: Boolean(fleetRow) });
  }

  if (body.action === 'DRIVER_CONSENT') {
    // The driver's explicit consent, recorded on its own (the consent screen
    // calls this before the first ping when the trip was created without it).
    const { data: trip, error: findErr } = await supabase
      .from('shipment_tracking_trips')
      .select('*')
      .eq('id', body.tripId)
      .single();
    if (findErr || !trip) {
      return NextResponse.json({ ok: false, error: 'Shipment trip not found' }, { status: 404 });
    }
    if (!body.consentGranted) {
      return NextResponse.json({ ok: false, error: 'Consent must be explicitly granted' }, { status: 400 });
    }
    const nowIso = new Date().toISOString();
    const { data: updated, error: upErr } = await supabase
      .from('shipment_tracking_trips')
      .update({
        consent_granted: true,
        consent_granted_at: trip.consent_granted_at ?? nowIso,
        driver_consent_granted: true,
        driver_consent_timestamp: nowIso,
        trip_status: trip.trip_status === 'ASSIGNED' ? 'IN_TRANSIT_LIVE' : trip.trip_status,
        updated_at: nowIso,
      })
      .eq('id', trip.id)
      .select('*')
      .single();
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    await supabase.from('shipment_telemetry_events').insert({
      trip_id: trip.id,
      event_type: 'CONSENT_GRANTED',
      notes: 'Driver granted live GPS consent (consent screen).',
    });
    return NextResponse.json({ ok: true, trip: updated });
  }

  if (body.action === 'DRIVER_GPS_PING') {
    const { data: trip, error: findErr } = await supabase
      .from('shipment_tracking_trips')
      .select('*')
      .eq('id', body.tripId)
      .single();

    if (findErr || !trip) {
      return NextResponse.json({ ok: false, error: 'Shipment trip not found' }, { status: 404 });
    }
    if (trip.trip_status === 'DELIVERED' || trip.trip_status === 'CANCELLED' || trip.trip_status === 'ARRIVED') {
      return NextResponse.json({ ok: false, error: 'This trip is closed' }, { status: 409 });
    }
    const consentNow = Boolean(trip.consent_granted) || Boolean(body.consentGranted);
    if (!consentNow) {
      return NextResponse.json(
        { ok: false, error: 'Driver location consent is required before sharing live GPS.' },
        { status: 403 }
      );
    }

    const lat = num(body.lat);
    const lng = num(body.lng);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ ok: false, error: 'Bad GPS coordinates' }, { status: 400 });
    }
    const speedKmh = Math.max(0, Math.min(160, Number(body.speedKmh ?? 45)));
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const lastPingMs = trip.last_ping_at ? new Date(trip.last_ping_at).getTime() : 0;
    const staleGap = lastPingMs > 0 && nowMs - lastPingMs > STALE_MS;

    // Distance travelled: the step from the last route point to this one,
    // accumulated into distance_travelled_km (v2) as well as the v1
    // origin→current covered distance.
    const history = Array.isArray(trip.route_history) ? (trip.route_history as RoutePoint[]) : [];
    const lastPoint = history.length ? history[history.length - 1] : null;
    const kmStep = lastPoint
      ? Math.max(0, haversineKm(lastPoint.lat, lastPoint.lng, lat, lng))
      : haversineKm(trip.origin_lat, trip.origin_lng, lat, lng);
    const newHistory = pushHistory(history, lat, lng, kmStep);

    const coveredKm = haversineKm(trip.origin_lat, trip.origin_lng, lat, lng);
    const travelledKm = Number(trip.distance_travelled_km ?? trip.covered_distance_km ?? 0) + kmStep;
    const remainingKm = haversineKm(lat, lng, trip.destination_lat, trip.destination_lng);
    const etaMinutes = Math.max(1, Math.round((remainingKm / Math.max(15, speedKmh)) * 60));
    const geo = geofenceStatus(remainingKm);
    const arrived = remainingKm <= ARRIVED_KM;
    const inGeofence = remainingKm <= GEOFENCE_KM;

    // Route deviation: far from the direct origin→destination line.
    const offRoute = offRouteKm(lat, lng, trip.origin_lat, trip.origin_lng, trip.destination_lat, trip.destination_lng) > CORRIDOR_KM;
    const deviationAlert = offRoute && !arrived;

    const { data: updated, error: upErr } = await supabase
      .from('shipment_tracking_trips')
      .update({
        consent_granted: true,
        consent_granted_at: trip.consent_granted_at ?? nowIso,
        // v2 columns (both column sets are always written):
        driver_consent_granted: true,
        driver_consent_timestamp: trip.driver_consent_timestamp ?? nowIso,
        current_lat: lat,
        current_lng: lng,
        current_speed_kmh: speedKmh,
        current_accuracy_m: num(body.accuracyM) ?? 25,
        covered_distance_km: Number(coveredKm.toFixed(2)),
        distance_travelled_km: Number(travelledKm.toFixed(2)),
        remaining_distance_km: Number(remainingKm.toFixed(2)),
        eta_minutes: etaMinutes,
        geofence_status: geo,
        route_history: newHistory,
        route_deviation_alert: deviationAlert,
        trip_status: arrived ? 'ARRIVED' : inGeofence ? 'ARRIVED_GEOFENCE' : 'IN_TRANSIT_LIVE',
        last_ping_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', trip.id)
      .select('*')
      .single();

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    // Telemetry: the ping itself; GEOFENCE_ARRIVAL when the geofence is newly
    // entered; SIGNAL_STALE when this ping revives a stale trip;
    // ROUTE_DEVIATION when the alert first fires (and again on re-entry after
    // being back on route).
    const wasInGeofence = trip.geofence_status === 'INSIDE_GEOFENCE' || trip.geofence_status === 'ARRIVED';
    const events: { event_type: string; notes: string | null }[] = [
      { event_type: 'GPS_PING', notes: body.notes ?? null },
    ];
    if (inGeofence && !wasInGeofence) {
      events.push({ event_type: 'GEOFENCE_ARRIVAL', notes: `Inside the ${GEOFENCE_KM} km geofence of ${trip.destination_name}.` });
    }
    if (staleGap) {
      events.push({ event_type: 'SIGNAL_STALE', notes: `Signal returned after ${Math.round((nowMs - lastPingMs) / 60000)} minutes.` });
    }
    if (deviationAlert && !trip.route_deviation_alert) {
      events.push({ event_type: 'ROUTE_DEVIATION', notes: `More than ${CORRIDOR_KM} km from the direct route.` });
    }
    for (const ev of events) {
      await supabase.from('shipment_telemetry_events').insert({
        trip_id: trip.id,
        event_type: ev.event_type,
        lat,
        lng,
        speed_kmh: speedKmh,
        accuracy_m: num(body.accuracyM) ?? 25,
        notes: ev.notes,
      });
    }

    return NextResponse.json({ ok: true, trip: updated });
  }

  if (body.action === 'FLEET_IMPORT') {
    // RTO fleet CSV import: rows come from the tracking dashboard's CSV
    // parser. Upsert on the registration number, capped at 500 rows a call.
    const rows: unknown[] = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ ok: false, error: 'No rows to import' }, { status: 400 });
    if (rows.length > 500) return NextResponse.json({ ok: false, error: 'Import at most 500 rows per call' }, { status: 400 });

    const seen = new Set<string>();
    const payload: Record<string, unknown>[] = [];
    for (const raw of rows) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const reg = String(r.vehicleRegistrationNo ?? '').toUpperCase().trim();
      if (!reg || seen.has(reg)) continue;
      seen.add(reg);
      payload.push({
        vehicle_registration_no: reg,
        vehicle_type: String(r.vehicleType ?? '').trim() || null,
        owner_name: String(r.ownerName ?? '').trim() || null,
        rto_office: String(r.rtoOffice ?? '').trim() || null,
        rto_code: String(r.rtoCode ?? '').trim() || null,
        fitness_valid_upto: String(r.fitnessValidUpto ?? '').trim() || null,
        permit_type: String(r.permitType ?? '').trim() || null,
        permit_valid_upto: String(r.permitValidUpto ?? '').trim() || null,
        insurance_valid_upto: String(r.insuranceValidUpto ?? '').trim() || null,
        fuel_type: String(r.fuelType ?? '').trim() || null,
        source: 'RTO_CSV_IMPORT',
        imported_by: body.importedBy ?? null,
        updated_at: new Date().toISOString(),
      });
    }
    if (!payload.length) return NextResponse.json({ ok: false, error: 'No valid rows (registration number is required)' }, { status: 400 });

    const { error } = await supabase
      .from('authorized_fleet')
      .upsert(payload, { onConflict: 'vehicle_registration_no' });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, imported: payload.length });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
}
