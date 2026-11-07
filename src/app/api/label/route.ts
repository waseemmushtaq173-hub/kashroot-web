/**
 * POST /api/label — reads a fertiliser / pesticide / seed label photo.
 * Body: { photo: data: URL, lang? } → LabelReading
 */
import { NextResponse } from 'next/server';

import { readLabel } from '@/lib/server/agronomist';
import { aiLimited, asLang, claudeFailure, imageBlock, NOT_CONNECTED, PHOTO_BUDGET_SPENT, photoBudgetSpent } from '@/lib/server/claude';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (await aiLimited(req, 'photo', 8, 60)) return NextResponse.json({ error: 'Too many photos at once. Please wait a minute.' }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.photo !== 'string') return NextResponse.json({ error: 'Add a photo of the label first.' }, { status: 400 });
  // A real JPEG / PNG / WebP / GIF only (checked by its bytes), before it counts towards the day's photo checks.
  if (!imageBlock(body.photo)) return NextResponse.json({ error: 'That photo could not be read. Take a clear JPEG or PNG photo of the label.' }, { status: 400 });
  if (await photoBudgetSpent()) return NextResponse.json({ error: PHOTO_BUDGET_SPENT }, { status: 429 });
  try {
    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' });
    return NextResponse.json(await readLabel({ photo: body.photo, lang: asLang(body.lang), today }));
  } catch (err) {
    if (err instanceof Error && err.message === 'not-configured') return NextResponse.json({ error: NOT_CONNECTED }, { status: 503 });
    if (err instanceof Error && err.message === 'bad-image') return NextResponse.json({ error: 'That photo could not be read. Take a clear JPEG or PNG photo of the label.' }, { status: 400 });
    if (err instanceof Error && err.message === 'refused') return NextResponse.json({ error: 'This label could not be read. Please try another photo.' }, { status: 422 });
    const f = claudeFailure(err);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
}
