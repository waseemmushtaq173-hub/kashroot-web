// src/app/api/photos/geo-verify/route.ts
// Phase 6 — GPS-Verified Farmer Product Photography audit log.
//
// The farmer's device captures its own GPS fix at the moment the orchard
// photo/video is taken (engraved into the media pixels by the live
// capture flow) and reports it here: product_photo_verifications keeps
// the auditable trail (device fix, accuracy, a public locality label —
// never the exact private address — and the capture time). The table is
// revoked from the API roles; this endpoint is the only writer and is
// IP rate-limited.
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

const STATUSES = ['DEVICE_GPS_RECORDED', 'DUPLICATE_SUSPECTED', 'PRIVACY_MASKED'] as const;

export async function POST(request: Request) {
  if (ipLimited(request, 'photos-geo-verify', 20)) return tooMany();

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'Bad request body' }, { status: 400 });

  const farmerId = typeof body.farmerId === 'string' ? body.farmerId : '';
  const deviceLat = Number(body.deviceLat);
  const deviceLng = Number(body.deviceLng);
  const accuracyM = Number(body.accuracyM);
  const locality = typeof body.publicLocalityLabel === 'string' ? body.publicLocalityLabel.trim() : '';
  const capturedAt = typeof body.capturedAt === 'string' ? body.capturedAt : '';

  if (!farmerId || !/^[0-9a-f-]{36}$/i.test(farmerId)) {
    return NextResponse.json({ ok: false, error: 'Missing farmerId' }, { status: 400 });
  }
  if (!Number.isFinite(deviceLat) || deviceLat < -90 || deviceLat > 90 || !Number.isFinite(deviceLng) || deviceLng < -180 || deviceLng > 180) {
    return NextResponse.json({ ok: false, error: 'Bad device GPS coordinates' }, { status: 400 });
  }
  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100000) {
    return NextResponse.json({ ok: false, error: 'Bad GPS accuracy' }, { status: 400 });
  }
  if (!locality || locality.length > 200) {
    return NextResponse.json({ ok: false, error: 'Missing publicLocalityLabel' }, { status: 400 });
  }
  if (Number.isNaN(new Date(capturedAt).getTime())) {
    return NextResponse.json({ ok: false, error: 'Bad capturedAt timestamp' }, { status: 400 });
  }

  const photoHash = typeof body.photoHashSha256 === 'string' && /^[0-9a-f]{64}$/i.test(body.photoHashSha256)
    ? body.photoHashSha256.toLowerCase()
    : null;
  const listingId = typeof body.listingId === 'string' && /^[0-9a-f-]{36}$/i.test(body.listingId) ? body.listingId : null;
  const status = STATUSES.includes(body.verificationStatus) ? body.verificationStatus : 'DEVICE_GPS_RECORDED';

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('product_photo_verifications')
    .insert({
      listing_id: listingId,
      farmer_id: farmerId,
      photo_hash_sha256: photoHash,
      device_lat: deviceLat,
      device_lng: deviceLng,
      accuracy_m: accuracyM,
      public_locality_label: locality.slice(0, 200),
      captured_at: new Date(capturedAt).toISOString(),
      verification_status: status,
    })
    .select('id,uploaded_at,verification_status')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, verification: data });
}

export async function GET(request: Request) {
  if (ipLimited(request, 'photos-geo-verify-get', 30)) return tooMany();

  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get('listingId');
  const farmerId = searchParams.get('farmerId');
  if (!listingId && !farmerId) {
    return NextResponse.json({ ok: false, error: 'Pass listingId or farmerId' }, { status: 400 });
  }

  const supabase = getSupabase();
  let query = supabase
    .from('product_photo_verifications')
    .select('id,listing_id,farmer_id,device_lat,device_lng,accuracy_m,public_locality_label,captured_at,uploaded_at,verification_status')
    .order('uploaded_at', { ascending: false })
    .limit(20);
  if (listingId) query = query.eq('listing_id', listingId);
  if (farmerId) query = query.eq('farmer_id', farmerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message, verifications: [] }, { status: 500 });
  return NextResponse.json({ ok: true, verifications: data ?? [] });
}
