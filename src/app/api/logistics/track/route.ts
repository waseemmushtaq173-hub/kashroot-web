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
// The server routes mediate all access, so each call needs a signed-in account:
// a person sees the trips they made, drive, send or receive (the Super Admin
// and the Orders team see all), a ping or consent can only come from the trip's
// own driver account, and the RTO fleet list and its CSV import are for the
// Super Admin and the Orders team. Request bodies are validated with zod.
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
import { z } from 'zod';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { dbFor, verifiedCaller, type Caller } from '@/lib/server/callerAuth';
import { isSuperAdminCaller, teamCanCaller } from '@/lib/server/callerRole';

export const dynamic = 'force-dynamic';

/** GPS coordinates, accepted as numbers or numeric strings. */
const LatSchema = z.coerce.number().min(-90).max(90);
const LngSchema = z.coerce.number().min(-180).max(180);

const CreateTripSchema = z.object({
  action: z.literal('CREATE_TRIP'),
  driverName: z.string().trim().min(1).max(80),
  driverPhone: z.string().trim().min(3).max(20),
  vehicleRegistrationNo: z.string().trim().min(4).max(20),
  originName: z.string().trim().min(1).max(160),
  destinationName: z.string().trim().min(1).max(160),
  originLat: LatSchema,
  originLng: LngSchema,
  destinationLat: LatSchema,
  destinationLng: LngSchema,
  consentGranted: z.boolean().optional(),
  driverConsentGranted: z.boolean().optional(),
  shipmentCode: z.string().trim().max(40).optional(),
  orderId: z.string().uuid().nullish(),
  sellerId: z.string().uuid().nullish(),
  buyerId: z.string().uuid().nullish(),
  driverId: z.string().uuid().nullish(),
  vehicleType: z.string().trim().max(40).optional(),
  trackingSource: z.string().trim().max(40).optional(),
  rtoVerifiedStatus: z.string().trim().max(40).optional(),
});

const DriverConsentSchema = z.object({
  action: z.literal('DRIVER_CONSENT'),
  tripId: z.string().uuid(),
  consentGranted: z.boolean(),
});

const DriverPingSchema = z.object({
  action: z.literal('DRIVER_GPS_PING'),
  tripId: z.string().uuid(),
  lat: LatSchema,
  lng: LngSchema,
  accuracyM: z.coerce.number().min(0).max(100_000).optional(),
  speedKmh: z.coerce.number().min(0).max(160).optional(),
  consentGranted: z.boolean().optional(),
  notes: z.string().trim().max(300).nullish(),
});

const FleetRowSchema = z.object({
  vehicleRegistrationNo: z.string().trim().min(1).max(20),
  vehicleType: z.string().trim().max(60).optional(),
  ownerName: z.string().trim().max(120).optional(),
  rtoOffice: z.string().trim().max(120).optional(),
  rtoCode: z.string().trim().max(20).optional(),
  fitnessValidUpto: z.string().trim().max(40).optional(),
  permitType: z.string().trim().max(60).optional(),
  permitValidUpto: z.string().trim().max(40).optional(),
  insuranceValidUpto: z.string().trim().max(40).optional(),
  fuelType: z.string().trim().max(40).optional(),
});

const FleetImportSchema = z.object({
  action: z.literal('FLEET_IMPORT'),
  rows: z.array(FleetRowSchema).min(1).max(500),
  importedBy: z.string().uuid().nullish(),
});

const badBody = (error: z.ZodError) =>
  NextResponse.json({ ok: false, error: 'Check the details: one is missing or wrong.' }, { status: 400 });

type Db = ReturnType<typeof dbFor>;

const SIGN_IN = () => NextResponse.json({ ok: false, error: 'Please sign in to use tracking.' }, { status: 401 });
const NOT_ALLOWED = (what: string) => NextResponse.json({ ok: false, error: what }, { status: 403 });
const FAILED = (what: string) => NextResponse.json({ ok: false, error: what }, { status: 500 });

/** The Super Admin and the Orders team see every trip and the fleet registry; everyone else, only their own. */
async function isStaff(request: Request): Promise<boolean> {
  return (await isSuperAdminCaller(request)) || (await teamCanCaller(request, 'orders'));
}

const mine = (t: Record<string, unknown>, caller: Caller, withBuyerSeller: boolean) =>
  [t.created_by, t.driver_id, ...(withBuyerSeller ? [t.seller_id, t.buyer_id] : [])].some((v) => v && String(v) === caller.id);

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
async function fleetLookup(supabase: Db, reg: string) {
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
  const caller = await verifiedCaller(request);
  if (!caller) return SIGN_IN();
  const supabase = dbFor(caller);

  if (fleet) {
    if (!(await isStaff(request))) return NOT_ALLOWED('The fleet registry is for the KashRoot team.');
    const { data, error } = await supabase
      .from('authorized_fleet')
      .select('*')
      .order('vehicle_registration_no', { ascending: true })
      .limit(500);
    if (error) return NextResponse.json({ ok: false, error: 'Could not read the fleet registry just now.', vehicles: [] }, { status: 500 });
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

  const staff = await isStaff(request);
  if (!staff) {
    // Someone's own trips: the ones they made, drive, send or receive.
    let own = query.or(`created_by.eq.${caller.id},driver_id.eq.${caller.id},seller_id.eq.${caller.id},buyer_id.eq.${caller.id}`);
    own = own.limit(25);
    let res = await own;
    if (res.error && /created_by/i.test(res.error.message)) {
      // The column that records who made a trip is added by the latest SQL step; until then, the three other links.
      let q2 = supabase.from('shipment_tracking_trips').select('*').order('updated_at', { ascending: false });
      if (code) q2 = q2.eq('shipment_code', code);
      res = await q2.or(`driver_id.eq.${caller.id},seller_id.eq.${caller.id},buyer_id.eq.${caller.id}`).limit(25);
    }
    if (res.error) return NextResponse.json({ ok: false, error: 'Could not read your trips just now.', trips: [] }, { status: 500 });
    return respondTrips(res.data ?? []);
  }

  const { data: trips, error } = await query.limit(25);
  if (error) {
    return NextResponse.json({ ok: false, error: 'Could not read the trips just now.', trips: [] }, { status: 500 });
  }
  return respondTrips(trips ?? []);
}

function respondTrips(trips: Record<string, unknown>[]) {

  const nowMs = Date.now();
  const enriched = trips.map((t) => {
    const lastPingMs = t.last_ping_at ? new Date(String(t.last_ping_at)).getTime() : 0;
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

  const caller = await verifiedCaller(request);
  if (!caller) return SIGN_IN();
  const supabase = dbFor(caller);

  if (body.action === 'CREATE_TRIP') {
    const parsed = CreateTripSchema.safeParse(body);
    if (!parsed.success) return badBody(parsed.error);
    const q = parsed.data;

    // RTO verification against the authorized_fleet registry.
    const regNo = q.vehicleRegistrationNo.toUpperCase();
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

    const totalKm = haversineKm(q.originLat, q.originLng, q.destinationLat, q.destinationLng);
    const shipmentCode = q.shipmentCode || `KR-TRK-${Date.now().toString().slice(-6)}`;
    const consent = Boolean(q.consentGranted) || Boolean(q.driverConsentGranted);
    const nowIso = new Date().toISOString();
    const tripRow = {
        order_id: q.orderId ?? null,
        shipment_code: shipmentCode,
        seller_id: q.sellerId ?? null,
        buyer_id: q.buyerId ?? null,
        driver_name: q.driverName,
        driver_phone: q.driverPhone,
        driver_id: q.driverId ?? null,
        vehicle_registration_no: regNo,
        tracking_source: q.trackingSource || 'DRIVER_APP_GPS',
        consent_granted: consent,
        consent_granted_at: consent ? nowIso : null,
        // v2 columns (both column sets are always written):
        driver_consent_granted: consent,
        driver_consent_timestamp: consent ? nowIso : null,
        rto_metadata: rtoMetadata,
        route_deviation_alert: false,
        geofence_status: geofenceStatus(totalKm),
        route_history: pushHistory([], q.originLat, q.originLng, null),
        distance_travelled_km: 0,
        vehicle_type: q.vehicleType || 'REFRIGERATED_TRUCK',
        rto_verified_status: fleetRow ? 'VERIFIED_RTO_RECORD' : q.rtoVerifiedStatus || 'UNVERIFIED',
        origin_name: q.originName,
        origin_lat: q.originLat,
        origin_lng: q.originLng,
        destination_name: q.destinationName,
        destination_lat: q.destinationLat,
        destination_lng: q.destinationLng,
        current_lat: q.originLat,
        current_lng: q.originLng,
        total_distance_km: Number(totalKm.toFixed(2)),
        covered_distance_km: 0,
        remaining_distance_km: Number(totalKm.toFixed(2)),
        eta_minutes: Math.round((totalKm / 45) * 60),
        trip_status: consent ? 'IN_TRANSIT_LIVE' : 'ASSIGNED',
        last_ping_at: consent ? nowIso : null,
    };
    // The account that made the trip is the only one (besides the team) that can send its pings: it is the driver's phone.
    let made = await supabase.from('shipment_tracking_trips').insert({ ...tripRow, created_by: caller.id }).select('*').single();
    if (made.error && /created_by/i.test(made.error.message)) {
      // Before the latest SQL step: the trip is still saved, tied to the driver account instead.
      made = await supabase.from('shipment_tracking_trips').insert({ ...tripRow, driver_id: q.driverId ?? caller.id }).select('*').single();
    }
    const { data, error } = made;

    if (error || !data) return FAILED('Could not start this trip just now. Please try again.');

    // The consent moment is the trip's first telemetry event.
    if (consent) {
      await supabase.from('shipment_telemetry_events').insert({
        trip_id: data.id,
        event_type: 'CONSENT_GRANTED',
        lat: q.originLat,
        lng: q.originLng,
        notes: 'Driver agreed to share live GPS at trip start.',
      });
    }

    return NextResponse.json({ ok: true, trip: data, rto_verified: Boolean(fleetRow) });
  }

  if (body.action === 'DRIVER_CONSENT') {
    const parsed = DriverConsentSchema.safeParse(body);
    if (!parsed.success) return badBody(parsed.error);
    const q = parsed.data;
    if (!q.consentGranted) {
      return NextResponse.json({ ok: false, error: 'Consent must be explicitly granted' }, { status: 400 });
    }

    // The driver's explicit consent, recorded on its own (the consent screen
    // calls this before the first ping when the trip was created without it).
    const { data: trip, error: findErr } = await supabase
      .from('shipment_tracking_trips')
      .select('*')
      .eq('id', q.tripId)
      .single();
    if (findErr || !trip) {
      return NextResponse.json({ ok: false, error: 'Shipment trip not found' }, { status: 404 });
    }
    if (!mine(trip, caller, false) && !(await isStaff(request))) return NOT_ALLOWED('Only the driver of this trip can do that.');
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
    if (upErr) return FAILED('Could not save your consent just now. Please try again.');

    await supabase.from('shipment_telemetry_events').insert({
      trip_id: trip.id,
      event_type: 'CONSENT_GRANTED',
      notes: 'Driver granted live GPS consent (consent screen).',
    });
    return NextResponse.json({ ok: true, trip: updated });
  }

  if (body.action === 'DRIVER_GPS_PING') {
    const parsed = DriverPingSchema.safeParse(body);
    if (!parsed.success) return badBody(parsed.error);
    const q = parsed.data;

    const { data: trip, error: findErr } = await supabase
      .from('shipment_tracking_trips')
      .select('*')
      .eq('id', q.tripId)
      .single();

    if (findErr || !trip) {
      return NextResponse.json({ ok: false, error: 'Shipment trip not found' }, { status: 404 });
    }
    if (!mine(trip, caller, false) && !(await isStaff(request))) return NOT_ALLOWED('Only the driver of this trip can send its location.');
    if (trip.trip_status === 'DELIVERED' || trip.trip_status === 'CANCELLED' || trip.trip_status === 'ARRIVED') {
      return NextResponse.json({ ok: false, error: 'This trip is closed' }, { status: 409 });
    }
    const consentNow = Boolean(trip.consent_granted) || Boolean(q.consentGranted);
    if (!consentNow) {
      return NextResponse.json(
        { ok: false, error: 'Driver location consent is required before sharing live GPS.' },
        { status: 403 }
      );
    }

    const lat = q.lat;
    const lng = q.lng;
    const speedKmh = q.speedKmh ?? 45;
    const accuracyM = q.accuracyM ?? 25;
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
        current_accuracy_m: accuracyM,
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

    if (upErr) return FAILED('Could not save this location just now. Please try again.');

    // Telemetry: the ping itself; GEOFENCE_ARRIVAL when the geofence is newly
    // entered; SIGNAL_STALE when this ping revives a stale trip;
    // ROUTE_DEVIATION when the alert first fires (and again on re-entry after
    // being back on route).
    const wasInGeofence = trip.geofence_status === 'INSIDE_GEOFENCE' || trip.geofence_status === 'ARRIVED';
    const events: { event_type: string; notes: string | null }[] = [
      { event_type: 'GPS_PING', notes: q.notes ?? null },
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
        accuracy_m: accuracyM,
        notes: ev.notes,
      });
    }

    return NextResponse.json({ ok: true, trip: updated });
  }

  if (body.action === 'FLEET_IMPORT') {
    // RTO fleet CSV import: rows come from the tracking dashboard's CSV
    // parser. Upsert on the registration number, capped at 500 rows a call.
    if (!(await isStaff(request))) return NOT_ALLOWED('Only the KashRoot team can import the fleet registry.');
    const parsed = FleetImportSchema.safeParse(body);
    if (!parsed.success) return badBody(parsed.error);
    const q = parsed.data;

    const seen = new Set<string>();
    const payload: Record<string, unknown>[] = [];
    for (const r of q.rows) {
      const reg = r.vehicleRegistrationNo.toUpperCase();
      if (!reg || seen.has(reg)) continue;
      seen.add(reg);
      payload.push({
        vehicle_registration_no: reg,
        vehicle_type: r.vehicleType || null,
        owner_name: r.ownerName || null,
        rto_office: r.rtoOffice || null,
        rto_code: r.rtoCode || null,
        fitness_valid_upto: r.fitnessValidUpto || null,
        permit_type: r.permitType || null,
        permit_valid_upto: r.permitValidUpto || null,
        insurance_valid_upto: r.insuranceValidUpto || null,
        fuel_type: r.fuelType || null,
        source: 'RTO_CSV_IMPORT',
        imported_by: caller.id,
        updated_at: new Date().toISOString(),
      });
    }
    if (!payload.length) return NextResponse.json({ ok: false, error: 'No valid rows (registration number is required)' }, { status: 400 });

    const { error } = await supabase
      .from('authorized_fleet')
      .upsert(payload, { onConflict: 'vehicle_registration_no' });
    if (error) return FAILED('Could not import the fleet just now. Please try again.');
    return NextResponse.json({ ok: true, imported: payload.length });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
}
