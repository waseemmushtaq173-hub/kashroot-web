/**
 * POST /api/diagnose — what a leaf, fruit or bark photo most likely shows.
 * Body: { photo: data: URL (JPEG/PNG/WebP), crop?, notes?, lang? } → Diagnosis
 */
import { NextResponse } from 'next/server';

import { diagnosePhoto } from '@/lib/server/agronomist';
import { asLang, claudeFailure, NOT_CONNECTED, throttled } from '@/lib/server/claude';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (throttled(req, 8)) return NextResponse.json({ error: 'Too many photos at once. Please wait a minute.' }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.photo !== 'string') return NextResponse.json({ error: 'Add a photo first.' }, { status: 400 });
  try {
    const diagnosis = await diagnosePhoto({
      photo: body.photo,
      crop: typeof body.crop === 'string' ? body.crop.slice(0, 60) : undefined,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : undefined,
      lang: asLang(body.lang),
    });
    return NextResponse.json(diagnosis);
  } catch (err) {
    if (err instanceof Error && err.message === 'not-configured') return NextResponse.json({ error: NOT_CONNECTED }, { status: 503 });
    if (err instanceof Error && err.message === 'bad-image') return NextResponse.json({ error: 'That photo could not be read. Take a JPEG or PNG photo and try again.' }, { status: 400 });
    if (err instanceof Error && err.message === 'refused') return NextResponse.json({ error: 'This photo could not be checked. Please send it to an agronomist.' }, { status: 422 });
    const f = claudeFailure(err);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
}
