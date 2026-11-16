/**
 * Unified live GPS tracking portal API (web now, Android/iOS app later).
 *
 * GET  modes:
 *   SHIPMENT_LOOKUP (default) - buyer/farmer authorized lookup by Tracking ID
 *                               with live freshness computation (LIVE vs STALE).
 *   DRIVER_DASHBOARD          - one driver's profile, vehicles, assignments.
 *   SUPER_ADMIN_OVERVIEW      - fleet oversight, only with a genuine team pass
 *                               (admin=1 + the kr_team cookie).
 *
 * POST actions: DRIVER_AUTH (register or sign in with PIN), REGISTER_VEHICLE
 * (honest SELF_DECLARED / DOCUMENTS_UPLOADED status), CREATE_OR_ASSIGN_SHIPMENT,
 * REGISTER_GPS_DEVICE (team pass only), ADMIN_APPROVE_VEHICLE (team pass only).
 *
 * Deviations from the master directive (documented in
 * KASHROOT_GPS_TRACKING_AUDIT.md): PIN verified on existing-driver sign-in;
 * admin approval actions gated behind the team pass and device registration
 * proven by vehicle ownership; per-IP rate limits; LOCATION_STALE_DETECTED
 * logged once per staleness period.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { haversineDistanceKm } from '@/lib/tracking/haversine';
import { isSuperAdminCaller } from '@/lib/server/callerRole';
import { checkProof, normalise } from '@/lib/server/otp';
import { hasTeamPass } from '@/lib/server/teamPass';
import { listPickupJobs, pickupAction } from '@/lib/server/pickupJobs';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

const STALE_THRESHOLD_SECONDS = 90;
/** A shipment counts as active in the public list while it was updated within this long. */
const ACTIVE_WINDOW_MS = 24 * 3600 * 1000;

const VEHICLE_CATEGORIES = [
  'TRUCK_REEFER',
  'HEAVY_COMMERCIAL_VEHICLE',
  'LIGHT_COMMERCIAL_VEHICLE',
  'VAN',
  'CAR',
  'BUS',
  'OTHER_SUPPORTED_VEHICLE',
] as const;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key, { auth: { persistSession: false } });
}

function hashPinOrSecret(raw: string): string {
  return createHash('sha256').update(String(raw)).digest('hex');
}

const clampText = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

const validLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

export async function GET(request: Request) {
  // Buyyers/farmers, drivers and the admin console all poll this endpoint; keep
  // the read limit generous but bounded.
  if (ipLimited(request, 'tracking-portal-read', 90, 60_000)) return tooMany(30);

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'SHIPMENT_LOOKUP';
  const trackingId = (searchParams.get('trackingId') || '').trim().toUpperCase();
  const pin = (searchParams.get('pin') || '').trim();
  const driverId = searchParams.get('driverId');
  const adminView = searchParams.get('admin') === '1';

  const supabase = getSupabase();

  // 0. Orchard pickup jobs on real marketplace orders (lib/server/pickupJobs).
  if (mode === 'PICKUP_JOBS') {
    const jobs = await listPickupJobs(supabase, searchParams.get('driverPhone'));
    return NextResponse.json(jobs.body, { status: jobs.status });
  }

  // 1. Driver profile, registered vehicles and assigned shipments
  if (mode === 'DRIVER_DASHBOARD' && driverId) {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, full_name, phone, email, license_number, license_category, home_district, home_state, account_status')
      .eq('id', driverId)
      .maybeSingle();

    const { data: links } = await supabase
      .from('driver_vehicles')
      .select('relationship_role, is_primary, vehicles(*)')
      .eq('driver_id', driverId);

    const { data: assignments } = await supabase
      .from('shipment_vehicles')
      .select('*, gps_shipments(*), vehicles(*)')
      .eq('driver_id', driverId)
      .order('assigned_at', { ascending: false });

    return NextResponse.json({
      ok: true,
      driver,
      vehicles: (links ?? []).map((l: Record<string, unknown>) => l.vehicles).filter(Boolean),
      assignments: assignments ?? [],
    });
  }

  // 2. Super Admin fleet and session oversight - team pass required, so the
  // database-backed kr_team cookie is checked again here on the server.
  if (mode === 'SUPER_ADMIN_OVERVIEW' && adminView) {
    if (!hasTeamPass(request.headers.get('cookie'), request.headers.get('user-agent'))) {
      return NextResponse.json({ ok: false, error: 'Super Admin team pass required.' }, { status: 403 });
    }

    // Asked of the database as the person: only the Super Admin manages the fleet and sees full licence numbers.
    // Everyone else with a team pass (Hub staff) gets a read-only view. Columns are named, never "*": a driver's
    // password hash, a device's secret hash and a buyer's tracking PIN never leave the server.
    const canManage = await isSuperAdminCaller(request);
    const [driversRes, vehiclesRes, shipmentsRes, sessionsRes, devicesRes, eventsRes] =
      await Promise.all([
        supabase.from('drivers').select('id, full_name, phone, license_number, license_category, home_district, account_status, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('vehicles').select('id, registration_number, vehicle_category, make_and_model, owner_name, verification_status, is_active, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('gps_shipments').select('id, shipment_tracking_id, commodity_name, origin_name, destination_name, shipment_status, distance_travelled_km, remaining_distance_km, updated_at').order('updated_at', { ascending: false }).limit(50),
        supabase.from('tracking_sessions').select('id, shipment_id, vehicle_id, tracking_status, last_latitude, last_longitude, last_speed_kmh, last_location_update_at, source_type, updated_at').order('updated_at', { ascending: false }).limit(50),
        supabase.from('gps_devices').select('id, device_imei_or_serial, vehicle_id, provider_name, device_protocol, ais140_certification_status, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('tracking_events').select('id, event_type, event_message, created_at').order('created_at', { ascending: false }).limit(100),
      ]);

    // Licence numbers: whole for the Super Admin, the last three characters for the rest.
    const maskTail = (v: unknown) => { const t = String(v ?? ''); return t.length <= 3 ? '••••' : `••••${t.slice(-3)}`; };
    return NextResponse.json({
      ok: true,
      canManage,
      drivers: (driversRes.data ?? []).map((d) => (canManage ? d : { ...d, license_number: maskTail(d.license_number) })),
      vehicles: vehiclesRes.data ?? [],
      shipments: shipmentsRes.data ?? [],
      sessions: sessionsRes.data ?? [],
      devices: devicesRes.data ?? [],
      events: eventsRes.data ?? [],
    });
  }

  // 3. Buyer / farmer authorized shipment lookup by Tracking ID and PIN: the 6-digit PIN the sender was given when the trip was made.
  // There is no public list of trips: a position, a name or a phone number is shown only to someone holding both.
  if (!trackingId) {
    return NextResponse.json({ ok: true, availableShipments: [] });
  }
  if (ipLimited(request, 'tracking-pin-guess', 12, 60_000)) return tooMany(60);
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ ok: false, error: 'Enter the Tracking ID and the 6-digit PIN that the sender or the driver gave you.' }, { status: 400 });
  }

  const { data: found, error: shpErr } = await supabase
    .from('gps_shipments')
    .select('*')
    .eq('shipment_tracking_id', trackingId)
    .maybeSingle();

  const pinOk = (() => {
    const have = Buffer.from(String(found?.buyer_access_pin ?? ''));
    const want = Buffer.from(pin);
    return have.length === want.length && timingSafeEqual(have, want);
  })();
  if (shpErr || !found || !pinOk) {
    return NextResponse.json(
      { ok: false, error: 'No shipment matches that Tracking ID and PIN. Check both with the sender or the driver.' },
      { status: 404 },
    );
  }
  // What the PIN holder sees: the trip, not the people's ids, phones or the PIN itself.
  const { buyer_access_pin: _pin, farmer_id: _f, buyer_id: _b, order_id: _o, farmer_phone: _fp, buyer_phone: _bp, ...shipment } = found;
  void _pin; void _f; void _b; void _o; void _fp; void _bp;

  const { data: assignment } = await supabase
    .from('shipment_vehicles')
    .select('vehicles(id, registration_number, vehicle_category, make_and_model, payload_capacity_kg, verification_status), drivers(full_name, phone, license_category)')
    .eq('shipment_id', shipment.id)
    .eq('is_active_assignment', true)
    .maybeSingle();

  const { data: session } = await supabase
    .from('tracking_sessions')
    .select('*')
    .eq('shipment_id', shipment.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: routeHistory } = await supabase
    .from('gps_location_updates')
    .select('id, latitude, longitude, accuracy_m, speed_kmh, heading_deg, recorded_at, source_type')
    .eq('shipment_id', shipment.id)
    .order('recorded_at', { ascending: true })
    .limit(300);

  const { data: events } = await supabase
    .from('tracking_events')
    .select('*')
    .eq('shipment_id', shipment.id)
    .order('created_at', { ascending: false })
    .limit(40);

  // Compute accurate freshness status (LIVE vs STALE vs TRACKING_STOPPED) and
  // log LOCATION_STALE_DETECTED once per staleness period, never once per poll.
  let effectiveStatus = session?.tracking_status || 'TRACKING_STOPPED';
  let secondsSinceLastUpdate: number | null = null;

  if (session?.last_location_update_at) {
    secondsSinceLastUpdate = Math.max(
      0,
      Math.round((Date.now() - new Date(session.last_location_update_at).getTime()) / 1000),
    );
    if (
      (effectiveStatus === 'LIVE' || effectiveStatus === 'UPDATING') &&
      secondsSinceLastUpdate > STALE_THRESHOLD_SECONDS
    ) {
      effectiveStatus = 'STALE';
      const lastUpdate = new Date(session.last_location_update_at).toISOString();
      const alreadyLogged = (events ?? []).some(
        (ev: { event_type: string; created_at: string | null }) =>
          ev.event_type === 'LOCATION_STALE_DETECTED' &&
          ev.created_at !== null &&
          new Date(ev.created_at).toISOString() > lastUpdate,
      );
      if (!alreadyLogged) {
        const { data: staleEvent } = await supabase
          .from('tracking_events')
          .insert({
            shipment_id: shipment.id,
            session_id: session.id,
            vehicle_id: session.vehicle_id,
            driver_id: session.driver_id,
            event_type: 'LOCATION_STALE_DETECTED',
            event_message: `No GPS ping for ${secondsSinceLastUpdate} seconds. Last known position preserved.`,
          })
          .select('*')
          .single();
        // The events list was fetched before this insert; include the new
        // event in this same response so buyers see it on the poll that
        // first reports STALE.
        if (staleEvent && Array.isArray(events)) {
          events.unshift(staleEvent);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    shipment,
    vehicle: assignment?.vehicles ?? null,
    driver: assignment?.drivers ?? null,
    session: session
      ? {
          ...session,
          effective_status: effectiveStatus,
          seconds_since_last_update: secondsSinceLastUpdate,
        }
      : null,
    routeHistory: routeHistory ?? [],
    events: events ?? [],
  });
}

export async function POST(request: Request) {
  if (ipLimited(request, 'tracking-portal-write', 30, 60_000)) return tooMany(60);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing action parameter' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Admin-gated actions first: the team pass protects fleet approval.
  // Orchard pickup jobs: accept, the gate handover code, the hub, the trip to the buyer (lib/server/pickupJobs).
  if (['CLAIM_PICKUP', 'VERIFY_HANDOVER', 'MARK_AT_HUB', 'MARK_IN_TRANSIT', 'PICKUP_GPS_PING'].includes(String(body.action))) {
    // Guessing a 6-digit code is held to a few tries a minute per network.
    if (body.action === 'VERIFY_HANDOVER' && ipLimited(request, 'pickup-handover', 6, 60_000)) return tooMany(60);
    const done = await pickupAction(getSupabase(), body);
    return NextResponse.json(done.body, { status: done.status });
  }

  if (body.action === 'ADMIN_APPROVE_VEHICLE' || body.action === 'ADMIN_VERIFY_GPS_DEVICE') {
    if (!hasTeamPass(request.headers.get('cookie'), request.headers.get('user-agent'))) {
      return NextResponse.json({ ok: false, error: 'Super Admin team pass required.' }, { status: 403 });
    }
    // The pass only opens pages: approving a vehicle or certifying a device is the Super Admin's alone, asked of the database.
    if (!(await isSuperAdminCaller(request))) {
      return NextResponse.json({ ok: false, error: 'Only the Super Admin can approve vehicles or certify devices.' }, { status: 403 });
    }
  }

  // ACTION 1: driver registration or sign-in
  if (body.action === 'DRIVER_AUTH') {
    // One mobile number, one account: the number is kept as its 10 digits, and an older account saved as
    // "+91-…" or "91…" is found too.
    const mobile = normalise('sms', clampText(body.phone, 24));
    if (!mobile) {
      return NextResponse.json({ ok: false, error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });
    }
    // A PIN is always the driver's own: none is assumed for anyone.
    const pin = clampText(body.pin, 16);
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: 'Enter your PIN: 4 to 8 digits.' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('drivers')
      .select('*')
      .in('phone', [mobile, `+91${mobile}`, `+91-${mobile}`, `91${mobile}`, `0${mobile}`])
      .maybeSingle();

    if (existing) {
      // Sign-in verifies the PIN the driver chose at registration.
      if (!existing.password_hash) {
        return NextResponse.json(
          { ok: false, error: 'This driver account has no PIN set, so it cannot be opened. Ask KashRoot support to reset it.' },
          { status: 403 },
        );
      }
      if (existing.password_hash !== hashPinOrSecret(pin)) {
        return NextResponse.json({ ok: false, error: 'Incorrect PIN for this driver account.' }, { status: 401 });
      }
      return NextResponse.json({
        ok: true,
        isNewDriver: false,
        driver: {
          id: existing.id,
          full_name: existing.full_name,
          phone: existing.phone,
          license_number: existing.license_number,
          license_category: existing.license_category,
          home_district: existing.home_district,
          home_state: existing.home_state,
          account_status: existing.account_status,
        },
      });
    }

    // A new driver: the mobile number is proved with a one-time code first (the screen asks for it when it gets this answer).
    if (!checkProof(body.otpProof, 'sms', mobile)) {
      return NextResponse.json(
        { ok: false, needsVerification: true, error: 'This mobile number is not registered yet. Verify it with a one-time code to register.' },
        { status: 409 },
      );
    }
    const weak = /^(\d)\1+$/.test(pin) || ['1234', '4321', '0123', '12345', '123456', '1234567', '12345678'].includes(pin);
    if (weak) {
      return NextResponse.json({ ok: false, error: 'Choose a PIN that is not easy to guess (not 1234, 0000, 1111…).' }, { status: 400 });
    }
    if (!clampText(body.fullName, 120) || !clampText(body.licenseNumber, 40)) {
      return NextResponse.json({ ok: false, error: 'New driver registration requires your full name and driving licence number.' }, { status: 400 });
    }
    if (!clampText(body.licenseCategory, 40)) {
      return NextResponse.json({ ok: false, error: 'Choose the class on your driving licence.' }, { status: 400 });
    }
    if (!clampText(body.homeDistrict, 80) || !clampText(body.homeState, 80)) {
      return NextResponse.json({ ok: false, error: 'Add your home district and state.' }, { status: 400 });
    }
    const emergency = body.emergencyContact ? normalise('sms', clampText(body.emergencyContact, 24)) : null;
    if (body.emergencyContact && !emergency) {
      return NextResponse.json({ ok: false, error: 'The emergency contact must be a valid 10-digit mobile number.' }, { status: 400 });
    }

    const { data: created, error: createErr } = await supabase
      .from('drivers')
      .insert({
        full_name: clampText(body.fullName, 120),
        phone: mobile,
        email: body.email ? clampText(body.email, 160) : null,
        password_hash: hashPinOrSecret(pin),
        license_number: clampText(body.licenseNumber, 40).toUpperCase(),
        license_category: clampText(body.licenseCategory, 40),
        emergency_contact: emergency,
        home_district: clampText(body.homeDistrict, 80),
        home_state: clampText(body.homeState, 80),
        account_status: 'ACTIVE',
      })
      .select('id, full_name, phone, license_number, license_category, home_district, home_state, account_status')
      .single();

    if (createErr) {
      return NextResponse.json({ ok: false, error: 'Could not register the driver. Try again.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, isNewDriver: true, driver: created });
  }

  // ACTION 2: register vehicle and link it to the driver (honest status)
  if (body.action === 'REGISTER_VEHICLE') {
    const regNo = clampText(body.registrationNumber, 15).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!body.driverId || regNo.length < 6 || !body.makeAndModel || !body.ownerName) {
      return NextResponse.json(
        { ok: false, error: 'Driver ID, valid Registration Number, Make/Model, and Owner Name are required.' },
        { status: 400 },
      );
    }

    const category = String(body.vehicleCategory || 'TRUCK_REEFER');
    if (!(VEHICLE_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ ok: false, error: 'Unsupported vehicle category.' }, { status: 400 });
    }

    if (body.ownerAuthorized !== true) {
      return NextResponse.json({ ok: false, error: 'Confirm that the owner has authorised this vehicle to be tracked.' }, { status: 400 });
    }
    const payload = Number(body.payloadCapacityKg);
    if (!Number.isFinite(payload) || payload < 100 || payload > 100_000) {
      return NextResponse.json({ ok: false, error: 'Enter the payload capacity in kg (100 to 100,000).' }, { status: 400 });
    }
    const ownerPhone = body.ownerPhone ? normalise('sms', clampText(body.ownerPhone, 24)) : null;
    if (body.ownerPhone && !ownerPhone) {
      return NextResponse.json({ ok: false, error: 'The owner’s mobile number must be a valid 10-digit number.' }, { status: 400 });
    }

    // A vehicle already on KashRoot belongs to the driver who registered it: nobody else takes it over, and a vehicle
    // an admin approved never falls back to "self declared" because someone saved it again.
    const { data: already } = await supabase.from('vehicles').select('id, verification_status').eq('registration_number', regNo).maybeSingle();
    if (already) {
      const { data: link } = await supabase.from('driver_vehicles').select('driver_id').eq('vehicle_id', already.id);
      if ((link ?? []).some((l) => l.driver_id !== body.driverId)) {
        return NextResponse.json({ ok: false, error: 'This vehicle is already registered by another driver. Contact KashRoot support if it is yours.' }, { status: 409 });
      }
    }
    const verificationStatus =
      already && (already.verification_status === 'ADMIN_APPROVED' || already.verification_status === 'DOCUMENTS_UPLOADED')
        ? already.verification_status
        : body.supportingDocUrl
          ? 'DOCUMENTS_UPLOADED'
          : 'SELF_DECLARED';

    const { data: vehicle, error: vErr } = await supabase
      .from('vehicles')
      .upsert(
        {
          registration_number: regNo,
          vehicle_category: category,
          make_and_model: clampText(body.makeAndModel, 80),
          payload_capacity_kg: payload,
          owner_name: clampText(body.ownerName, 120),
          owner_phone: ownerPhone,
          owner_authorized: true,
          supporting_doc_url: body.supportingDocUrl ? clampText(body.supportingDocUrl, 500) : null,
          supporting_doc_notes: body.supportingDocNotes ? clampText(body.supportingDocNotes, 300) : null,
          verification_status: verificationStatus,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'registration_number' },
      )
      .select('*')
      .single();

    if (vErr || !vehicle) {
      return NextResponse.json({ ok: false, error: vErr?.message || 'Failed to save vehicle' }, { status: 500 });
    }

    await supabase.from('driver_vehicles').upsert(
      {
        driver_id: body.driverId,
        vehicle_id: vehicle.id,
        relationship_role: clampText(body.relationshipRole || 'OWNER_CUM_DRIVER', 40),
        is_primary: true,
      },
      { onConflict: 'driver_id,vehicle_id' },
    );

    return NextResponse.json({ ok: true, vehicle });
  }

  // ACTION 3: create or assign a shipment trip to an authorized vehicle and driver
  if (body.action === 'CREATE_OR_ASSIGN_SHIPMENT') {
    // Nothing is filled in for the caller: a shipment is only what a real person entered. (Number(null) is 0, a
    // valid coordinate in the Gulf of Guinea, so missing values are refused before they are read as numbers.)
    const given = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
    if (![body.originLat, body.originLng, body.destinationLat, body.destinationLng].every(given)) {
      return NextResponse.json({ ok: false, error: 'Choose the origin and the destination from the place suggestions (or use your GPS position), so their real coordinates are saved.' }, { status: 400 });
    }
    const originLat = Number(body.originLat);
    const originLng = Number(body.originLng);
    const destLat = Number(body.destinationLat);
    const destLng = Number(body.destinationLng);

    if (!validLatLng(originLat, originLng) || !validLatLng(destLat, destLng)) {
      return NextResponse.json({ ok: false, error: 'Origin and destination coordinates must be valid.' }, { status: 400 });
    }
    const boxCount = Math.floor(Number(body.boxCount));
    const totalWeightKg = Number(body.totalWeightKg);
    const missing = [
      !clampText(body.originName, 160) && 'origin',
      !clampText(body.destinationName, 160) && 'destination',
      !clampText(body.commodityName, 120) && 'commodity',
      !clampText(body.farmerName, 120) && 'consignor (farmer or sender) name',
      !clampText(body.buyerName, 120) && 'buyer (receiver) name',
      !(boxCount > 0) && 'number of boxes',
      !(totalWeightKg > 0) && 'weight in kg',
      !(body.vehicleId && body.driverId) && 'registered vehicle and driver',
    ].filter(Boolean);
    if (missing.length) {
      return NextResponse.json({ ok: false, error: `Fill in: ${missing.join(', ')}.` }, { status: 400 });
    }

    // The driver must already be an authorized operator of this vehicle.
    if (body.vehicleId && body.driverId) {
      const { data: link } = await supabase
        .from('driver_vehicles')
        .select('id')
        .eq('driver_id', body.driverId)
        .eq('vehicle_id', body.vehicleId)
        .maybeSingle();
      if (!link) {
        return NextResponse.json(
          { ok: false, error: 'This driver is not registered as an operator of the selected vehicle.' },
          { status: 400 },
        );
      }
    }

    const straightKm = haversineDistanceKm(originLat, originLng, destLat, destLng);
    const highwayDistanceKm = Number((straightKm * 1.24).toFixed(1));

    // Tracking IDs are unique; retry a couple of times on the rare collision.
    let shipment: Record<string, unknown> | null = null;
    let sErr: { message: string } | null = null;
    for (let attempt = 0; attempt < 3 && !shipment; attempt++) {
      const trackingId =
        clampText(body.shipmentTrackingId, 40) ||
        `KR-SHP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const res = await supabase
        .from('gps_shipments')
        .insert({
          shipment_tracking_id: trackingId,
          buyer_access_pin: String(randomInt(100000, 1000000)),
          farmer_name: clampText(body.farmerName, 120),
          farmer_phone: body.farmerPhone ? clampText(body.farmerPhone, 24) : null,
          buyer_name: clampText(body.buyerName, 120),
          buyer_phone: body.buyerPhone ? clampText(body.buyerPhone, 24) : null,
          commodity_name: clampText(body.commodityName, 120),
          box_count: boxCount,
          total_weight_kg: totalWeightKg,
          origin_name: clampText(body.originName, 160),
          origin_lat: originLat,
          origin_lng: originLng,
          destination_name: clampText(body.destinationName, 160),
          destination_lat: destLat,
          destination_lng: destLng,
          total_route_distance_km: highwayDistanceKm,
          distance_travelled_km: 0,
          remaining_distance_km: highwayDistanceKm,
          estimated_arrival_at: new Date(Date.now() + (highwayDistanceKm / 48) * 3600 * 1000).toISOString(),
          shipment_status: 'ASSIGNED',
        })
        .select('*')
        .single();
      if (res.data) shipment = res.data;
      else {
        sErr = res.error;
        // A caller-provided duplicate ID should stop immediately.
        if (body.shipmentTrackingId) break;
      }
    }

    if (!shipment) {
      return NextResponse.json(
        { ok: false, error: sErr?.message || 'Could not create shipment' },
        { status: 500 },
      );
    }

    if (body.vehicleId && body.driverId) {
      await supabase.from('shipment_vehicles').upsert(
        {
          shipment_id: shipment.id,
          vehicle_id: body.vehicleId,
          driver_id: body.driverId,
          is_active_assignment: true,
        },
        { onConflict: 'shipment_id,vehicle_id' },
      );

      await supabase.from('tracking_events').insert({
        shipment_id: shipment.id,
        vehicle_id: body.vehicleId,
        driver_id: body.driverId,
        event_type: 'SHIPMENT_ASSIGNED',
        event_message: `Shipment ${shipment.shipment_tracking_id} assigned to vehicle and driver.`,
      });
    }

    return NextResponse.json({ ok: true, shipment });
  }

  // ACTION 4: register an AIS-140 / external GPS device. The driver must be a
  // registered operator of the vehicle they pair it to (ownership proof).
  if (body.action === 'REGISTER_GPS_DEVICE') {
    const imei = clampText(body.deviceImei, 32);
    const rawSecret = String(body.apiSecretToken || `ais140_${Date.now()}`).slice(0, 64);
    if (!imei || !body.vehicleId || !body.driverId) {
      return NextResponse.json(
        { ok: false, error: 'Device IMEI/Serial, Vehicle ID and Driver ID are required' },
        { status: 400 },
      );
    }

    const { data: link } = await supabase
      .from('driver_vehicles')
      .select('id')
      .eq('driver_id', body.driverId)
      .eq('vehicle_id', body.vehicleId)
      .maybeSingle();
    if (!link) {
      return NextResponse.json(
        { ok: false, error: 'Only a registered operator of this vehicle can pair a device to it.' },
        { status: 403 },
      );
    }

    const protocol = String(body.deviceProtocol || 'HTTP_WEBHOOK_JSON');
    if (!['HTTP_WEBHOOK_JSON', 'AIS_140_GATEWAY', 'COMMERCIAL_TELEMATICS_API'].includes(protocol)) {
      return NextResponse.json({ ok: false, error: 'Unsupported device protocol.' }, { status: 400 });
    }

    const { data: device, error: dErr } = await supabase
      .from('gps_devices')
      .upsert(
        {
          device_imei_or_serial: imei,
          vehicle_id: body.vehicleId,
          provider_name: clampText(body.providerName || 'AIS-140 / Telematics Gateway', 80),
          device_protocol: protocol,
          ais140_certification_status: 'UNVERIFIED',
          api_secret_token_hash: hashPinOrSecret(rawSecret),
          is_active: true,
        },
        { onConflict: 'device_imei_or_serial' },
      )
      .select('*')
      .single();

    if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, device, webhookSecretOnce: rawSecret });
  }

  // ACTION 5: Super Admin vehicle approval (team pass checked above)
  if (body.action === 'ADMIN_APPROVE_VEHICLE' && body.vehicleId) {
    const status = String(body.status || 'ADMIN_APPROVED');
    if (!['ADMIN_APPROVED', 'REJECTED', 'SELF_DECLARED'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'Unsupported approval status.' }, { status: 400 });
    }
    const { data: updated, error } = await supabase
      .from('vehicles')
      .update({ verification_status: status, updated_at: new Date().toISOString() })
      .eq('id', body.vehicleId)
      .select('*')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, vehicle: updated });
  }

  // ACTION 6: Super Admin AIS-140 device certification (team pass checked above)
  if (body.action === 'ADMIN_VERIFY_GPS_DEVICE' && body.deviceId) {
    const status = String(body.status || 'AIS140_VERIFIED_BY_ADMIN');
    if (!['AIS140_VERIFIED_BY_ADMIN', 'UNVERIFIED'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'Unsupported device certification status.' }, { status: 400 });
    }
    const { data: updated, error } = await supabase
      .from('gps_devices')
      .update({ ais140_certification_status: status })
      .eq('id', body.deviceId)
      .select('*')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, device: updated });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
}
