// src/app/api/products/verify-photo/route.ts
// Phase 6 — GPS-verified product photo audit, v2 (master upgrade).
//
// The farmer's live capture flow (ProductForm) reports every GPS-stamped
// photo here the moment it is taken. The server — not the client — computes
// the image's SHA-256 over the received bytes, keeps the RAW capture
// location in the private columns only, and answers with the masked public
// twin (2 decimal places ≈ 1.1 km) so no buyer-facing surface ever sees the
// orchard's exact coordinates. The 5-state verification lifecycle:
//
//   GPS_VERIFIED_ORCHARD  good fix (≤ 500 m) and within 2 km of the
//                         listing's stored farm location
//   DEVICE_GPS_RECORDED   a fix was recorded (the default)
//   GPS_ACCURACY_LOW      the fix is coarser than 1 km — recorded, flagged
//   DUPLICATE_SUSPECTED   this exact image (same SHA-256) was already
//                         verified for a different farmer / listing
//   PRIVACY_MASKED        the farmer asked to keep even the private raw
//                         copy out of the audit (only the masked twin)
//
// Rows are written with BOTH column sets (v1 device_lat/lng/accuracy_m +
// verification_status, and the v2 private/public twins + verification_state)
// so older readers keep working. Every write fills the v1 status with the
// closest of its three values (DEVICE_GPS_RECORDED / DUPLICATE_SUSPECTED /
// PRIVACY_MASKED).
//
//   POST { action: 'RECORD', … }        → one audit row (public fields back).
//   POST { action: 'ATTACH_PHOTO', … }  → fill original_photo_url afterwards.
//   GET  ?listingId=… | ?farmerId=…     → recent rows, PUBLIC fields only.
//
// The raw device coordinates are never part of any response.
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

const STATES = [
  'GPS_VERIFIED_ORCHARD',
  'DEVICE_GPS_RECORDED',
  'GPS_ACCURACY_LOW',
  'DUPLICATE_SUSPECTED',
  'PRIVACY_MASKED',
] as const;
type State = (typeof STATES)[number];

/** The v1 status each v2 state maps to (old readers see a familiar value). */
const V1_STATUS: Record<State, string> = {
  GPS_VERIFIED_ORCHARD: 'DEVICE_GPS_RECORDED',
  DEVICE_GPS_RECORDED: 'DEVICE_GPS_RECORDED',
  GPS_ACCURACY_LOW: 'DEVICE_GPS_RECORDED',
  DUPLICATE_SUSPECTED: 'DUPLICATE_SUSPECTED',
  PRIVACY_MASKED: 'PRIVACY_MASKED',
};

const GOOD_ACCURACY_M = 500;
const LOW_ACCURACY_M = 1000;
const ORCHARD_KM = 2;

/** Great-circle distance in km (the Haversine formula). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The masked public twin of a coordinate: 2 decimals ≈ 1.1 km. */
const masked = (v: number) => Math.round(v * 100) / 100;

/** The image's SHA-256, computed here over the actual bytes. */
async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** The bytes behind a data URL (base64), capped at 8 MB. */
function dataUrlBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:image/') || comma < 0) return null;
  const b64 = dataUrl.slice(comma + 1);
  if (b64.length > 11_000_000) return null; // ≈ 8 MB decoded
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** The bytes behind an http(s) image URL, capped at 8 MB. */
async function urlBytes(url: string): Promise<Uint8Array | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > 8_388_608) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8_388_608) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** The columns of one verification row this API may ever answer with (public only). */
const PUBLIC_COLUMNS =
  'id,listing_id,farmer_id,public_masked_lat,public_masked_lng,public_locality_label,gps_accuracy_m,captured_at,uploaded_at,verification_state,verification_status,image_sha256,original_photo_url';

export async function POST(request: Request) {
  if (ipLimited(request, 'products-verify-photo', 20)) return tooMany();

  const body = await request.json().catch(() => null);
  if (!body || !body.action) return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });

  const supabase = getSupabase();

  if (body.action === 'RECORD') {
    const farmerId = typeof body.farmerId === 'string' && /^[0-9a-f-]{36}$/i.test(body.farmerId) ? body.farmerId : null;
    const listingId = typeof body.listingId === 'string' && /^[0-9a-f-]{36}$/i.test(body.listingId) ? body.listingId : null;
    if (!farmerId && !listingId) {
      return NextResponse.json({ ok: false, error: 'Pass farmerId or listingId' }, { status: 400 });
    }
    const deviceLat = Number(body.deviceLat);
    const deviceLng = Number(body.deviceLng);
    const accuracyM = Number(body.accuracyM);
    if (!Number.isFinite(deviceLat) || deviceLat < -90 || deviceLat > 90 || !Number.isFinite(deviceLng) || deviceLng < -180 || deviceLng > 180) {
      return NextResponse.json({ ok: false, error: 'Bad device GPS coordinates' }, { status: 400 });
    }
    if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100_000) {
      return NextResponse.json({ ok: false, error: 'Bad GPS accuracy' }, { status: 400 });
    }
    const locality = typeof body.publicLocalityLabel === 'string' ? body.publicLocalityLabel.trim().slice(0, 200) : '';
    const capturedAt = typeof body.capturedAt === 'string' && !Number.isNaN(new Date(body.capturedAt).getTime()) ? new Date(body.capturedAt).toISOString() : new Date().toISOString();

    // The hash over the real bytes — data URL or an https photo URL.
    const bytes =
      typeof body.photoDataUrl === 'string' ? dataUrlBytes(body.photoDataUrl) : typeof body.photoUrl === 'string' ? await urlBytes(body.photoUrl) : null;
    const imageSha = bytes ? await sha256Hex(bytes) : null;

    // Duplicate check: the same image verified before under a different farmer / listing.
    let duplicateOf: string | null = null;
    if (imageSha) {
      let dup = supabase.from('product_photo_verifications').select('id,farmer_id,listing_id').eq('image_sha256', imageSha).limit(1);
      if (farmerId) dup = dup.neq('farmer_id', farmerId);
      if (listingId) dup = dup.neq('listing_id', listingId);
      const { data: twin } = await dup.maybeSingle();
      if (twin) duplicateOf = twin.id;
    }

    // The state, in precedence order.
    let state: State = 'DEVICE_GPS_RECORDED';
    if (duplicateOf) state = 'DUPLICATE_SUSPECTED';
    else if (body.privacyMasked === true) state = 'PRIVACY_MASKED';
    else if (accuracyM > LOW_ACCURACY_M) state = 'GPS_ACCURACY_LOW';
    else {
      // Verified-at-orchard: a good fix that matches the listing's own farm location.
      if (listingId && accuracyM <= GOOD_ACCURACY_M) {
        const { data: listing } = await supabase
          .from('market_listings')
          .select('seller_lat,seller_lng')
          .eq('id', listingId)
          .maybeSingle();
        const farmLat = Number(listing?.seller_lat);
        const farmLng = Number(listing?.seller_lng);
        if (Number.isFinite(farmLat) && Number.isFinite(farmLng) && haversineKm(deviceLat, deviceLng, farmLat, farmLng) <= ORCHARD_KM) {
          state = 'GPS_VERIFIED_ORCHARD';
        }
      }
    }

    // Raw location stays private; the public twin is the masked one.
    const publicMaskedLat = masked(deviceLat);
    const publicMaskedLng = masked(deviceLng);
    const originalPhotoUrl = typeof body.originalPhotoUrl === 'string' && body.originalPhotoUrl.length <= 500 ? body.originalPhotoUrl : null;

    const { data, error } = await supabase
      .from('product_photo_verifications')
      .insert({
        // v1 columns (kept for older readers):
        listing_id: listingId,
        farmer_id: farmerId,
        photo_hash_sha256: imageSha,
        device_lat: deviceLat,
        device_lng: deviceLng,
        accuracy_m: accuracyM,
        public_locality_label: locality || null,
        captured_at: capturedAt,
        verification_status: V1_STATUS[state],
        // v2 columns:
        image_sha256: imageSha,
        verification_state: state,
        private_raw_lat: body.privacyMasked === true ? null : deviceLat,
        private_raw_lng: body.privacyMasked === true ? null : deviceLng,
        public_masked_lat: publicMaskedLat,
        public_masked_lng: publicMaskedLng,
        gps_accuracy_m: accuracyM,
        original_photo_url: originalPhotoUrl,
      })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      verification: data,
      duplicate_of: duplicateOf,
      note:
        state === 'DUPLICATE_SUSPECTED'
          ? 'This exact photo was verified before for a different listing.'
          : state === 'PRIVACY_MASKED'
            ? 'Only the masked location was kept.'
            : undefined,
    });
  }

  if (body.action === 'ATTACH_PHOTO') {
    const verificationId = typeof body.verificationId === 'string' && /^[0-9a-f-]{36}$/i.test(body.verificationId) ? body.verificationId : null;
    const photoUrl = typeof body.originalPhotoUrl === 'string' && body.originalPhotoUrl.length > 0 && body.originalPhotoUrl.length <= 500 ? body.originalPhotoUrl : null;
    if (!verificationId || !photoUrl) return NextResponse.json({ ok: false, error: 'Pass verificationId and originalPhotoUrl' }, { status: 400 });
    const { error } = await supabase
      .from('product_photo_verifications')
      .update({ original_photo_url: photoUrl })
      .eq('id', verificationId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
}

export async function GET(request: Request) {
  if (ipLimited(request, 'products-verify-photo-get', 30)) return tooMany();

  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get('listingId');
  const farmerId = searchParams.get('farmerId');
  if (!listingId && !farmerId) {
    return NextResponse.json({ ok: false, error: 'Pass listingId or farmerId' }, { status: 400 });
  }

  const supabase = getSupabase();
  // PUBLIC columns only — the raw device coordinates and the private raw
  // twins are never part of any response of this API.
  let query = supabase
    .from('product_photo_verifications')
    .select(PUBLIC_COLUMNS)
    .order('uploaded_at', { ascending: false })
    .limit(20);
  if (listingId) query = query.eq('listing_id', listingId);
  if (farmerId) query = query.eq('farmer_id', farmerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message, verifications: [] }, { status: 500 });
  return NextResponse.json({ ok: true, verifications: data ?? [] });
}
