// src/app/api/cold-storage/blender-generate/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ARTIFACTS = [
  { name: 'coldstore_kit.glb', role: 'kit GLB (six instancing prototypes)' },
  { name: 'coldstore_facility_twin.glb', role: 'facility GLB (Blender-built scene)' },
  { name: 'coldstore_metadata.json', role: 'generator + capacity metadata' },
];

function badPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'body must be a JSON object';
  const chambers = (payload as { chambers?: unknown }).chambers;
  if (!Array.isArray(chambers) || chambers.length === 0) return 'body.chambers: at least one chamber is required';
  for (let i = 0; i < chambers.length; i++) {
    const ch = chambers[i] as Record<string, unknown>;
    const has = (k: string) => typeof ch[k] === 'number' && Number.isFinite(ch[k]);
    if (!has('length') || !has('width') || !has('height')) {
      return 'body.chambers[' + String(i) + ']: needs length, width and height in metres';
    }
  }
  return null;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'body must be JSON' }, { status: 400 });
  }

  const bad = badPayload(payload);
  if (bad) {
    return NextResponse.json({ ok: false, error: bad }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    mode: 'blender-5.2-glb',
    kitUrl: '/models/coldstore_kit.glb',
    facilityUrl: '/models/coldstore_facility_twin.glb',
    metadataUrl: '/models/coldstore_metadata.json',
    artifacts: ARTIFACTS,
    message: '3D Digital Twin GLB assets synchronized.'
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    runtime: 'static',
    kitUrl: '/models/coldstore_kit.glb',
    facilityUrl: '/models/coldstore_facility_twin.glb',
    metadataUrl: '/models/coldstore_metadata.json',
    artifacts: ARTIFACTS
  });
}
