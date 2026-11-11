/**
 * POST /api/bhashini/tts
 * 
 * Text-to-speech via Bhashini TTS.
 * Body: { text: string, lang?: 'hi'|'en'|'ur'|'ks', speaker?: string }
 * Returns: MP3 audio (binary) with Content-Type: audio/mpeg
 */
import { NextResponse } from 'next/server';

import { ipLimited, tooMany } from '@/lib/server/sign';
import { bhashiniTts, bhashiniTtsConfigured } from '@/lib/server/bhashiniTts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  if (ipLimited(request, 'bhashini-tts', 20)) return tooMany();

  if (!bhashiniTtsConfigured()) {
    return NextResponse.json({ error: 'Bhashini TTS not configured' }, { status: 503 });
  }

  let body: { text: string; lang?: 'hi' | 'en' | 'ur' | 'ks'; speaker?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { text, lang = 'hi', speaker } = body;

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Text required' }, { status: 400 });
  }

  if (text.length > 500) {
    return NextResponse.json({ error: 'Text too long (max 500 chars)' }, { status: 400 });
  }

  try {
    const audio = await bhashiniTts(text, lang, speaker);
    return new Response(audio.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}