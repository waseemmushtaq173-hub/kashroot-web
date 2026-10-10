/**
 * POST /api/advisory/ai — an instant first answer to a farmer's advisory
 * request (question, soil test or video call), while an expert is notified.
 * Body: { question, crop?, photo? (data: URL), lang?, speakAs?: 'hi', kind? }
 * → { reply, speech? }
 */
import { NextResponse } from 'next/server';

import { adviseFarmer } from '@/lib/server/agronomist';
import { asLang, claudeFailure, NOT_CONNECTED, throttled } from '@/lib/server/claude';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (throttled(req)) return NextResponse.json({ error: 'Too many questions at once. Please wait a minute.' }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  if (!question) return NextResponse.json({ error: 'Describe the problem first.' }, { status: 400 });
  const kind = body?.kind === 'soil_test' || body?.kind === 'video_call' ? body.kind : 'question';
  try {
    const out = await adviseFarmer({
      question,
      crop: typeof body?.crop === 'string' ? body.crop.slice(0, 60) : undefined,
      photo: typeof body?.photo === 'string' ? body.photo : null,
      lang: asLang(body?.lang),
      speakAs: body?.speakAs === 'hi' ? 'hi' : undefined,
      kind,
    });
    return NextResponse.json({ reply: out.text, ...(out.speech ? { speech: out.speech } : {}) });
  } catch (err) {
    if (err instanceof Error && err.message === 'not-configured') return NextResponse.json({ error: NOT_CONNECTED }, { status: 503 });
    const f = claudeFailure(err);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
}
