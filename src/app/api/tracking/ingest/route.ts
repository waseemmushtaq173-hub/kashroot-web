/**
 * Secure live GPS ingestion endpoint for the KashRoot tracking system.
 *
 * Accepts START_TRACKING, GPS_PING, GPS_PERMISSION_DENIED, STOP_TRACKING and
 * COMPLETE_DELIVERY from the tracking portal driver console (real
 * navigator.geolocation hardware) and from AIS-140 / telematics webhooks.
 *
 * Hardening over the master directive (KASHROOT_GPS_TRACKING_AUDIT.md D5):
 * numeric lat/lng range validation, confirmation that the vehicle is the
 * shipment's active authorized carrier, clamped telemetry values and a per-IP
 * rate limit so rapid watchPosition callbacks cannot flood the database.
 * Adaptive breadcrumb throttling keeps Supabase writes light while the live
 * vehicle position itself stays instantaneous.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { haversineDistanceKm } from '@/lib/tracking/haversine';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key, { auth: { persistSession: false } });
}

const validLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export async function POST(request: Request) {
  // GPS pings arrive every few seconds per active trip (driver console or
  // device gateway); 120/min per network is well above any honest stream.
  if (ipLimited(request, 'tracking-ingest', 120, 60_000)) return tooMany(30);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !body.eventAction || !body.shipmentId || !body.vehicleId) {
    return NextResponse.json(
      { ok: false, error: 'eventAction, shipmentId, and vehicleId are required' },
      { status: 400 },
    );
  }

  const eventAction = String(body.eventAction);
  if (
    !['START_TRACKING', 'GPS_PING', 'GPS_PERMISSION_DENIED', 'STOP_TRACKING', 'COMPLETE_DELIVERY'].includes(
      eventAction,
    )
  ) {
    return NextResponse.json({ ok: false, error: 'Unsupported eventAction' }, { status: 400 });
  }

  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  // The vehicle must be the shipment's active authorized carrier.
  const { data: pairing } = await supabase
    .from('shipment_vehicles')
    .select('id')
    .eq('shipment_id', body.shipmentId)
    .eq('vehicle_id', body.vehicleId)
    .eq('is_active_assignment', true)
    .maybeSingle();

  if (!pairing) {
    return NextResponse.json(
      { ok: false, error: 'This vehicle is not the authorized active carrier for this shipment.' },
      { status: 403 },
    );
  }

  // Fetch shipment to compute accurate distance travelled, remaining distance and ETA
  const { data: shipment } = await supabase
    .from('gps_shipments')
    .select('*')
    .eq('id', body.shipmentId)
    .maybeSingle();

  if (!shipment) {
    return NextResponse.json({ ok: false, error: 'Shipment not found' }, { status: 404 });
  }

  // Find the most recent tracking session for this shipment + vehicle
  const { data: existingSession } = await supabase
    .from('tracking_sessions')
    .select('*')
    .eq('shipment_id', body.shipmentId)
    .eq('vehicle_id', body.vehicleId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 1. GPS permission denied
  if (eventAction === 'GPS_PERMISSION_DENIED') {
    const sessionPayload = {
      shipment_id: body.shipmentId,
      vehicle_id: body.vehicleId,
      driver_id: body.driverId || null,
      gps_permission_granted: false,
      tracking_status: 'GPS_PERMISSION_DENIED',
      updated_at: nowIso,
    };

    const { data: sess } = existingSession
      ? await supabase
          .from('tracking_sessions')
          .update(sessionPayload)
          .eq('id', existingSession.id)
          .select('*')
          .single()
      : await supabase.from('tracking_sessions').insert(sessionPayload).select('*').single();

    await supabase.from('tracking_events').insert({
      shipment_id: body.shipmentId,
      session_id: sess?.id ?? null,
      vehicle_id: body.vehicleId,
      driver_id: body.driverId || null,
      event_type: 'GPS_PERMISSION_DENIED',
      event_message: 'Driver device reported GPS location permission denied.',
    });

    return NextResponse.json({ ok: true, session: sess });
  }

  // 2. Stop tracking or complete delivery
  if (eventAction === 'STOP_TRACKING' || eventAction === 'COMPLETE_DELIVERY') {
    const isDelivered = eventAction === 'COMPLETE_DELIVERY';
    const nextStatus = isDelivered ? 'DELIVERED' : 'TRACKING_STOPPED';

    let sess = existingSession;
    if (existingSession) {
      const { data: updatedSess } = await supabase
        .from('tracking_sessions')
        .update({
          tracking_status: nextStatus,
          ended_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existingSession.id)
        .select('*')
        .single();
      sess = updatedSess;
    }

    await supabase
      .from('gps_shipments')
      .update({
        shipment_status: isDelivered ? 'DELIVERED' : 'TRACKING_PAUSED',
        remaining_distance_km: isDelivered ? 0 : shipment.remaining_distance_km,
        updated_at: nowIso,
      })
      .eq('id', shipment.id);

    await supabase.from('tracking_events').insert({
      shipment_id: shipment.id,
      session_id: sess?.id ?? null,
      vehicle_id: body.vehicleId,
      driver_id: body.driverId || null,
      event_type: isDelivered ? 'DELIVERY_COMPLETED' : 'TRACKING_STOPPED',
      event_message: isDelivered
        ? 'Shipment marked DELIVERED and live GPS tracking session closed.'
        : 'Driver pressed STOP TRACKING. Live location sharing halted; last known position preserved.',
      latitude: sess?.last_latitude ?? null,
      longitude: sess?.last_longitude ?? null,
    });

    return NextResponse.json({ ok: true, session: sess, stopped: true });
  }

  // 3. Start tracking or live GPS ping
  const lat = Number(body.latitude);
  const lng = Number(body.longitude);

  if (!validLatLng(lat, lng)) {
    return NextResponse.json(
      { ok: false, error: 'Valid numeric latitude and longitude are required' },
      { status: 400 },
    );
  }

  const accuracyM = clamp(Number(body.accuracyM ?? 15), 0, 100_000);
  const speedKmh =
    body.speedKmh !== null && body.speedKmh !== undefined && Number.isFinite(Number(body.speedKmh))
      ? clamp(Number(body.speedKmh), 0, 250)
      : null;
  const headingDeg =
    body.headingDeg !== null && body.headingDeg !== undefined && Number.isFinite(Number(body.headingDeg))
      ? clamp(Number(body.headingDeg), 0, 360)
      : null;

  // Real distance from origin and remaining distance to destination
  const straightFromOriginKm = haversineDistanceKm(shipment.origin_lat, shipment.origin_lng, lat, lng);
  const straightToDestKm = haversineDistanceKm(lat, lng, shipment.destination_lat, shipment.destination_lng);

  const travelledKm = Number((straightFromOriginKm * 1.18).toFixed(2));
  const remainingKm = Number((straightToDestKm * 1.18).toFixed(2));
  const effectiveSpeedForEta = speedKmh && speedKmh > 8 ? speedKmh : 48;
  const etaHours = remainingKm / effectiveSpeedForEta;
  const estimatedArrivalIso = new Date(Date.now() + etaHours * 3600 * 1000).toISOString();

  // Upsert tracking session
  const sessionData = {
    shipment_id: shipment.id,
    vehicle_id: body.vehicleId,
    driver_id: body.driverId || null,
    source_type:
      body.sourceType === 'AIS140_EXTERNAL_DEVICE' || body.sourceType === 'TELEMATICS_WEBHOOK'
        ? body.sourceType
        : 'DRIVER_PORTAL_GPS',
    gps_permission_granted: true,
    consent_timestamp: existingSession?.consent_timestamp || nowIso,
    tracking_status: 'LIVE',
    last_latitude: lat,
    last_longitude: lng,
    last_accuracy_m: accuracyM,
    last_speed_kmh: speedKmh,
    last_heading_deg: headingDeg,
    device_connectivity: body.deviceConnectivity ? String(body.deviceConnectivity).slice(0, 40) : 'ONLINE',
    last_location_update_at: nowIso,
    ended_at: null,
    updated_at: nowIso,
  };

  const { data: activeSession, error: sessErr } = existingSession
    ? await supabase
        .from('tracking_sessions')
        .update(sessionData)
        .eq('id', existingSession.id)
        .select('*')
        .single()
    : await supabase.from('tracking_sessions').insert(sessionData).select('*').single();

  if (sessErr || !activeSession) {
    return NextResponse.json(
      { ok: false, error: sessErr?.message || 'Failed to update tracking session' },
      { status: 500 },
    );
  }

  // Adaptive breadcrumb throttling: insert into gps_location_updates only on
  // START_TRACKING, when at least 8 seconds elapsed, or the vehicle moved at
  // least 15 meters.
  let shouldInsertBreadcrumb = eventAction === 'START_TRACKING' || !existingSession?.last_latitude;
  if (!shouldInsertBreadcrumb && existingSession?.last_latitude && existingSession?.last_longitude) {
    const movedKm = haversineDistanceKm(
      existingSession.last_latitude,
      existingSession.last_longitude,
      lat,
      lng,
    );
    const elapsedSec = existingSession.last_location_update_at
      ? (Date.now() - new Date(existingSession.last_location_update_at).getTime()) / 1000
      : 999;
    if (movedKm >= 0.015 || elapsedSec >= 8) {
      shouldInsertBreadcrumb = true;
    }
  }

  if (shouldInsertBreadcrumb) {
    await supabase.from('gps_location_updates').insert({
      session_id: activeSession.id,
      shipment_id: shipment.id,
      vehicle_id: body.vehicleId,
      latitude: lat,
      longitude: lng,
      accuracy_m: accuracyM,
      speed_kmh: speedKmh,
      heading_deg: headingDeg,
      device_connectivity: body.deviceConnectivity ? String(body.deviceConnectivity).slice(0, 40) : 'ONLINE',
      source_type: sessionData.source_type,
      recorded_at: nowIso,
    });
  }

  await supabase
    .from('gps_shipments')
    .update({
      distance_travelled_km: travelledKm,
      remaining_distance_km: remainingKm,
      estimated_arrival_at: estimatedArrivalIso,
      shipment_status: 'IN_TRANSIT',
      updated_at: nowIso,
    })
    .eq('id', shipment.id);

  if (eventAction === 'START_TRACKING') {
    await supabase.from('tracking_events').insert({
      shipment_id: shipment.id,
      session_id: activeSession.id,
      vehicle_id: body.vehicleId,
      driver_id: body.driverId || null,
      event_type: 'TRACKING_STARTED',
      event_message: `Driver granted GPS permission and pressed START TRACKING (±${Math.round(accuracyM)}m accuracy).`,
      latitude: lat,
      longitude: lng,
      accuracy_m: accuracyM,
    });
  }

  return NextResponse.json({
    ok: true,
    session: activeSession,
    metrics: {
      distanceTravelledKm: travelledKm,
      remainingDistanceKm: remainingKm,
      estimatedArrivalAt: estimatedArrivalIso,
    },
  });
}
