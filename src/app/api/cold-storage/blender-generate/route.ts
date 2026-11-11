import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({
    ok: true,
    mode: 'blender-5.2-glb',
    kitUrl: '/models/coldstore_kit.glb',
    facilityUrl: '/models/coldstore_facility_twin.glb',
    metadataUrl: '/models/coldstore_metadata.json',
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    runtime: 'static',
    kitUrl: '/models/coldstore_kit.glb',
    facilityUrl: '/models/coldstore_facility_twin.glb',
    metadataUrl: '/models/coldstore_metadata.json',
  });
}