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
import { z } from 'zod';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { dbFor, verifiedCaller } from '@/lib/server/callerAuth';

export const dynamic = 'force-dynamic';

/** Request schemas (Phase 8): bodies are validated before anything runs. */
const RecordSchema = z.object({
  action: z.literal('RECORD'),
  farmerId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional(),
  deviceLat: z.coerce.number().min(-90).max(90),
  deviceLng: z.coerce.number().min(-180).max(180),
  accuracyM: z.coerce.number().min(0).max(100_000),
  publicLocalityLabel: z.string().max(200).optional(),
  capturedAt: z.string().optional(),
  photoDataUrl: z.string().max(1_200_000).optional(),
  photoUrl: z.string().url().optional(),
  privacyMasked: z.boolean().optional(),
  originalPhotoUrl: z.string().max(500).optional(),
});

const AttachSchema = z.object({
  action: z.literal('ATTACH_PHOTO'),
  verificationId: z.string().uuid(),
  originalPhotoUrl: z.string().min(1).max(500),
});

const badBody = (error: z.ZodError) =>
  NextResponse.json({ ok: false, error: 'Validation failed', issues: error.flatten() }, { status: 400 });


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
    // Only a public name: never an address, "localhost" or an internal host.
    const host = new URL(url).hostname.toLowerCase();
    if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)(localhost|local|internal|lan)$/.test(host)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
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

  // A photo is recorded for the signed-in farmer and for a listing of theirs: neither is taken from the request.
  const caller = await verifiedCaller(request);
  if (!caller) return NextResponse.json({ ok: false, error: 'Please sign in to verify a photo.' }, { status: 401 });
  const supabase = dbFor(caller);

  if (body.action === 'RECORD') {
    const parsed = RecordSchema.safeParse(body);
    if (!parsed.success) return badBody(parsed.error);
    const q = parsed.data;
    if (q.farmerId && q.farmerId !== caller.id) {
      return NextResponse.json({ ok: false, error: 'Signed-in account does not match the farmer on this request.' }, { status: 403 });
    }
    const farmerId = caller.id;
    const listingId = q.listingId ?? null;
    if (listingId) {
      const { data: own } = await supabase.from('market_listings').select('id').eq('id', listingId).eq('seller_id', caller.id).maybeSingle();
      if (!own) return NextResponse.json({ ok: false, error: 'This listing is not yours.' }, { status: 403 });
    }
    const deviceLat = q.deviceLat;
    const deviceLng = q.deviceLng;
    const accuracyM = q.accuracyM;
    const locality = (q.publicLocalityLabel ?? '').trim().slice(0, 200);
    const capturedAt =
      q.capturedAt && !Number.isNaN(new Date(q.capturedAt).getTime())
        ? new Date(q.capturedAt).toISOString()
        : new Date().toISOString();

    // The hash over the real bytes — data URL or an https photo URL.
    const bytes = q.photoDataUrl ? dataUrlBytes(q.photoDataUrl) : q.photoUrl ? await urlBytes(q.photoUrl) : null;
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
    else if (q.privacyMasked === true) state = 'PRIVACY_MASKED';
    else if (accuracyM > LOW_ACCURACY_M) state = 'GPS_ACCURACY_LOW';
    else {
      // Verified-at-orchard: a good fix that matches the listing's own farm location.
      if (listingId && accuracyM <= GOOD_ACCURACY_M) {
        const { data: listing } = await supabase
          .from('market_listings')
          .select('captured_lat,captured_lng')
          .eq('id', listingId)
          .maybeSingle();
        const farmLat = Number(listing?.captured_lat);
        const farmLng = Number(listing?.captured_lng);
        if (Number.isFinite(farmLat) && Number.isFinite(farmLng) && haversineKm(deviceLat, deviceLng, farmLat, farmLng) <= ORCHARD_KM) {
          state = 'GPS_VERIFIED_ORCHARD';
        }
      }
    }

    // Raw location stays private; the public twin is the masked one.
    const publicMaskedLat = masked(deviceLat);
    const publicMaskedLng = masked(deviceLng);
    const originalPhotoUrl = q.originalPhotoUrl ?? null;

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
        private_raw_lat: q.privacyMasked === true ? null : deviceLat,
        private_raw_lng: q.privacyMasked === true ? null : deviceLng,
        public_masked_lat: publicMaskedLat,
        public_masked_lng: publicMaskedLng,
        gps_accuracy_m: accuracyM,
        original_photo_url: originalPhotoUrl,
      })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) return NextResponse.json({ ok: false, error: 'Could not record this photo just now.' }, { status: 500 });
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
    const parsed = AttachSchema.safeParse(body);
    if (!parsed.success) return badBody(parsed.error);
    const q = parsed.data;
    const { error } = await supabase
      .from('product_photo_verifications')
      .update({ original_photo_url: q.originalPhotoUrl })
      .eq('id', q.verificationId)
      .eq('farmer_id', caller.id);
    if (error) return NextResponse.json({ ok: false, error: 'Could not attach this photo just now.' }, { status: 500 });
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

  const supabase = dbFor(await verifiedCaller(request));
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
  if (error) return NextResponse.json({ ok: false, error: 'Could not read the photo checks just now.', verifications: [] }, { status: 500 });
  return NextResponse.json({ ok: true, verifications: data ?? [] });
}
