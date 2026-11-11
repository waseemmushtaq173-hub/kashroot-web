/**
 * POST /api/bhashini/asr
 * 
 * Speech-to-text via Bhashini ASR.
 * Body: { audio: base64, lang?: 'hi'|'en'|'ur'|'ks' }
 * Returns: { text: string }
 */
import { NextResponse } from 'next/server';

import { ipLimited, tooMany } from '@/lib/server/sign';
import { bhashiniAsr, bhashiniAsrConfigured } from '@/lib/server/bhashiniAsr';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  if (ipLimited(request, 'bhashini-asr', 10)) return tooMany();

  if (!bhashiniAsrConfigured()) {
    return NextResponse.json({ error: 'Bhashini ASR not configured' }, { status: 503 });
  }

  let body: { audio: string; lang?: 'hi' | 'en' | 'ur' | 'ks' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { audio, lang = 'hi' } = body;

  if (!audio || typeof audio !== 'string') {
    return NextResponse.json({ error: 'Audio data (base64) required' }, { status: 400 });
  }

  try {
    const text = await bhashiniAsr(audio, lang);
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ASR failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}