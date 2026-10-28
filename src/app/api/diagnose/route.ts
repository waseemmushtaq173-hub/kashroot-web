/**
 * POST /api/diagnose — what a leaf, fruit or bark photo most likely shows.
 * Body: { photo: data: URL (JPEG/PNG/WebP), crop?, notes?, lang? } → Diagnosis
 * Signed-in only (Farmer portal → Orchard Health): each check costs money, so
 * it is limited per account and per network, and by the day's budget.
 */
import { NextResponse } from 'next/server';

import { diagnosePhoto } from '@/lib/server/agronomist';
import { requireUser } from '@/lib/server/auth';
import { sharedLimited } from '@/lib/server/sharedLimit';
import { aiLimited, asLang, claudeFailure, imageBlock, NOT_CONNECTED, PHOTO_BUDGET_SPENT, photoBudgetSpent } from '@/lib/server/claude';
import { hasHumanPass, needHuman } from '@/lib/server/humanPass';

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in to the Farmer portal to check a photo.' }, { status: 401 });
  if (!hasHumanPass(req)) return needHuman();
  if (await sharedLimited(`ai-photo:user:${user.id}`, 30, 86_400_000)) return NextResponse.json({ error: 'You have checked many photos today. Press Ask an expert — an agronomist will look at it.' }, { status: 429 });
  if (await aiLimited(req, 'photo', 8, 60)) return NextResponse.json({ error: 'Too many photos at once. Please wait a minute.' }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.photo !== 'string') return NextResponse.json({ error: 'Add a photo first.' }, { status: 400 });
  // A real JPEG / PNG / WebP / GIF only (checked by its bytes), before it counts towards the day's photo checks.
  if (!imageBlock(body.photo)) return NextResponse.json({ error: 'That photo could not be read. Take a JPEG or PNG photo and try again.' }, { status: 400 });
  if (await photoBudgetSpent()) return NextResponse.json({ error: PHOTO_BUDGET_SPENT }, { status: 429 });
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
