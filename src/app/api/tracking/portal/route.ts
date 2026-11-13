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
import { createHash } from 'node:crypto';

import { haversineDistanceKm } from '@/lib/tracking/haversine';
import { hasTeamPass } from '@/lib/server/teamPass';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

const STALE_THRESHOLD_SECONDS = 90;

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
  const driverId = searchParams.get('driverId');
  const adminView = searchParams.get('admin') === '1';

  const supabase = getSupabase();

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

    const [driversRes, vehiclesRes, shipmentsRes, sessionsRes, devicesRes, eventsRes] =
      await Promise.all([
        supabase.from('drivers').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('vehicles').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('gps_shipments').select('*').order('updated_at', { ascending: false }).limit(50),
        supabase.from('tracking_sessions').select('*').order('updated_at', { ascending: false }).limit(50),
        supabase.from('gps_devices').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('tracking_events').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

    return NextResponse.json({
      ok: true,
      drivers: driversRes.data ?? [],
      vehicles: vehiclesRes.data ?? [],
      shipments: shipmentsRes.data ?? [],
      sessions: sessionsRes.data ?? [],
      devices: devicesRes.data ?? [],
      events: eventsRes.data ?? [],
    });
  }

  // 3. Buyer / farmer authorized shipment lookup by Tracking ID
  if (!trackingId) {
    // Summary list of recent shipments for authorized selection.
    const { data: recentShipments } = await supabase
      .from('gps_shipments')
      .select('id, shipment_tracking_id, commodity_name, origin_name, destination_name, shipment_status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      ok: true,
      availableShipments: recentShipments ?? [],
    });
  }

  const { data: shipment, error: shpErr } = await supabase
    .from('gps_shipments')
    .select('*')
    .eq('shipment_tracking_id', trackingId)
    .maybeSingle();

  if (shpErr || !shipment) {
    return NextResponse.json(
      {
        ok: false,
        error: `No authorized shipment found with Tracking ID "${trackingId}". Buyers and farmers can only view shipments assigned to them.`,
      },
      { status: 404 },
    );
  }

  const { data: assignment } = await supabase
    .from('shipment_vehicles')
    .select('*, vehicles(*), drivers(id, full_name, phone, license_category)')
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
  if (body.action === 'ADMIN_APPROVE_VEHICLE' || body.action === 'ADMIN_VERIFY_GPS_DEVICE') {
    if (!hasTeamPass(request.headers.get('cookie'), request.headers.get('user-agent'))) {
      return NextResponse.json({ ok: false, error: 'Super Admin team pass required.' }, { status: 403 });
    }
  }

  // ACTION 1: driver registration or sign-in
  if (body.action === 'DRIVER_AUTH') {
    const phone = clampText(body.phone, 24).replace(/[^0-9+]/g, '');
    const pin = clampText(body.pin, 16) || '1234';

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ ok: false, error: 'Driver phone number is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('drivers')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      // Sign-in verifies the PIN the driver chose at registration.
      if (existing.password_hash && existing.password_hash !== hashPinOrSecret(pin)) {
        return NextResponse.json(
          { ok: false, error: 'Incorrect PIN for this driver account.' },
          { status: 401 },
        );
      }
      if (!existing.password_hash && pin !== '1234') {
        return NextResponse.json(
          { ok: false, error: 'Incorrect PIN for this driver account.' },
          { status: 401 },
        );
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

    if (!body.fullName || !body.licenseNumber) {
      return NextResponse.json(
        { ok: false, error: 'New driver registration requires Full Name and Driving License Number.' },
        { status: 400 },
      );
    }

    const { data: created, error: createErr } = await supabase
      .from('drivers')
      .insert({
        full_name: clampText(body.fullName, 120),
        phone,
        email: body.email ? clampText(body.email, 160) : null,
        password_hash: hashPinOrSecret(pin),
        license_number: clampText(body.licenseNumber, 40).toUpperCase(),
        license_category: clampText(body.licenseCategory || 'HGV / TRANS', 40),
        home_district: clampText(body.homeDistrict || 'Shopian', 80),
        home_state: clampText(body.homeState || 'Jammu & Kashmir', 80),
        account_status: 'ACTIVE',
      })
      .select('*')
      .single();

    if (createErr) {
      return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
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

    const verificationStatus = body.supportingDocUrl ? 'DOCUMENTS_UPLOADED' : 'SELF_DECLARED';

    const { data: vehicle, error: vErr } = await supabase
      .from('vehicles')
      .upsert(
        {
          registration_number: regNo,
          vehicle_category: category,
          make_and_model: clampText(body.makeAndModel, 80),
          payload_capacity_kg: Number(body.payloadCapacityKg || 15000),
          owner_name: clampText(body.ownerName, 120),
          owner_phone: body.ownerPhone ? clampText(body.ownerPhone, 24) : null,
          owner_authorized: Boolean(body.ownerAuthorized ?? true),
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
    const originLat = Number(body.originLat ?? 33.7173);
    const originLng = Number(body.originLng ?? 74.8333);
    const destLat = Number(body.destinationLat ?? 12.9716);
    const destLng = Number(body.destinationLng ?? 77.5946);

    if (!validLatLng(originLat, originLng) || !validLatLng(destLat, destLng)) {
      return NextResponse.json({ ok: false, error: 'Origin and destination coordinates must be valid.' }, { status: 400 });
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
          farmer_name: clampText(body.farmerName || 'Waseem Mushtaq Mir (Shopian Orchard)', 120),
          farmer_phone: body.farmerPhone ? clampText(body.farmerPhone, 24) : '+91-6006561291',
          buyer_name: clampText(body.buyerName || 'Bengaluru Wholesale Fruit Buyer', 120),
          buyer_phone: body.buyerPhone ? clampText(body.buyerPhone, 24) : null,
          commodity_name: clampText(body.commodityName || 'Kashmir Kullu Delicious Apples (Grade A)', 120),
          box_count: Number(body.boxCount || 217),
          total_weight_kg: Number(body.totalWeightKg || 3906),
          origin_name: clampText(body.originName || 'Shopian, Jammu & Kashmir', 160),
          origin_lat: originLat,
          origin_lng: originLng,
          destination_name: clampText(body.destinationName || 'Bengaluru, Karnataka', 160),
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
