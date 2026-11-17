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
import { ipLimited, tooMany } from '@/lib/server/sign';
import { dbFor, verifiedCaller } from '@/lib/server/callerAuth';

export const dynamic = 'force-dynamic';


const STATUSES = ['DEVICE_GPS_RECORDED', 'DUPLICATE_SUSPECTED', 'PRIVACY_MASKED'] as const;

export async function POST(request: Request) {
  if (ipLimited(request, 'photos-geo-verify', 20)) return tooMany();

  const caller = await verifiedCaller(request);
  if (!caller) return NextResponse.json({ ok: false, error: 'Please sign in to record a photo location.' }, { status: 401 });

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
  if (farmerId !== caller.id) {
    return NextResponse.json({ ok: false, error: 'Signed-in account does not match the farmer on this request.' }, { status: 403 });
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

  const supabase = dbFor(caller);
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

  if (error) return NextResponse.json({ ok: false, error: 'Could not record this photo location just now.' }, { status: 500 });
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

  // Anyone may read that a photo was checked and where in general; the exact device point stays with the farmer.
  const reader = await verifiedCaller(request);
  const supabase = dbFor(reader);
  let query = supabase
    .from('product_photo_verifications')
    .select('id,listing_id,public_locality_label,captured_at,uploaded_at,verification_status')
    .order('uploaded_at', { ascending: false })
    .limit(20);
  if (listingId) query = query.eq('listing_id', listingId);
  if (farmerId) query = query.eq('farmer_id', farmerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: 'Could not read the photo checks just now.', verifications: [] }, { status: 500 });
  return NextResponse.json({ ok: true, verifications: data ?? [] });
}
