// src/app/api/logistics/track/route.ts
// Phase 5.1 — Live Logistics & Shipment Tracking API.
//
// Consent-based driver GPS pings with Haversine distance covered /
// remaining, speed, ETA and automatic SIGNAL_STALE detection when no ping
// arrives within 10 minutes. Trips live in shipment_tracking_trips +
// shipment_telemetry_events (20261112000001_kashroot_ecosystem_phases.sql).
// The server routes mediate all access: the tables are revoked from the
// API roles and these endpoints are IP rate-limited.
//
//   GET  ?code=KR-TRK-… → one trip (or the 25 newest), with the effective
//                        status (SIGNAL_STALE when the last ping is old).
//   POST { action: 'CREATE_TRIP', … }       → create a trip with consent.
//   POST { action: 'DRIVER_GPS_PING', … }   → one live ping from the driver.
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

/** A number that is truly a finite number (else NaN / null stay out). */
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export async function GET(request: Request) {
  if (ipLimited(request, 'logistics-track', 30)) return tooMany();

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const supabase = getSupabase();

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
      lastPingMs > 0 && nowMs - lastPingMs > 10 * 60 * 1000 && t.trip_status === 'IN_TRANSIT_LIVE';
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

    const totalKm = haversineKm(originLat, originLng, destLat, destLng);
    const shipmentCode = body.shipmentCode || `KR-TRK-${Date.now().toString().slice(-6)}`;
    const { data, error } = await supabase
      .from('shipment_tracking_trips')
      .insert({
        order_id: body.orderId ?? null,
        shipment_code: shipmentCode,
        seller_id: body.sellerId ?? null,
        buyer_id: body.buyerId ?? null,
        driver_name: body.driverName,
        driver_phone: body.driverPhone,
        vehicle_registration_no: String(body.vehicleRegistrationNo || '').toUpperCase(),
        tracking_source: body.trackingSource || 'DRIVER_APP_GPS',
        consent_granted: Boolean(body.consentGranted),
        consent_granted_at: body.consentGranted ? new Date().toISOString() : null,
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
        trip_status: body.consentGranted ? 'IN_TRANSIT_LIVE' : 'ASSIGNED',
        last_ping_at: body.consentGranted ? new Date().toISOString() : null,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // The consent moment is the trip's first telemetry event.
    if (body.consentGranted) {
      await supabase.from('shipment_telemetry_events').insert({
        trip_id: data.id,
        event_type: 'CONSENT_GRANTED',
        lat: originLat,
        lng: originLng,
        notes: 'Driver agreed to share live GPS at trip start.',
      });
    }

    return NextResponse.json({ ok: true, trip: data });
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
    if (trip.trip_status === 'DELIVERED' || trip.trip_status === 'CANCELLED') {
      return NextResponse.json({ ok: false, error: 'This trip is closed' }, { status: 409 });
    }
    if (!trip.consent_granted && !body.consentGranted) {
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
    const coveredKm = haversineKm(trip.origin_lat, trip.origin_lng, lat, lng);
    const remainingKm = haversineKm(lat, lng, trip.destination_lat, trip.destination_lng);
    const etaMinutes = Math.max(1, Math.round((remainingKm / Math.max(15, speedKmh)) * 60));
    const arrived = remainingKm <= 0.5;

    const { data: updated, error: upErr } = await supabase
      .from('shipment_tracking_trips')
      .update({
        consent_granted: true,
        consent_granted_at: trip.consent_granted_at ?? new Date().toISOString(),
        current_lat: lat,
        current_lng: lng,
        current_speed_kmh: speedKmh,
        current_accuracy_m: num(body.accuracyM) ?? 25,
        covered_distance_km: Number(coveredKm.toFixed(2)),
        remaining_distance_km: Number(remainingKm.toFixed(2)),
        eta_minutes: etaMinutes,
        trip_status: arrived ? 'ARRIVED_GEOFENCE' : 'IN_TRANSIT_LIVE',
        last_ping_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip.id)
      .select('*')
      .single();

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    await supabase.from('shipment_telemetry_events').insert({
      trip_id: trip.id,
      event_type: arrived ? 'GEOFENCE_ARRIVAL' : 'GPS_PING',
      lat,
      lng,
      speed_kmh: speedKmh,
      accuracy_m: num(body.accuracyM) ?? 25,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ ok: true, trip: updated });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
}
