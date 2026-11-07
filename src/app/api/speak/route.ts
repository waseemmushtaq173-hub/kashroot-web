/**
 * KashRoot's voice (lib/server/voice): text read aloud on the server.
 *
 * GET /api/speak                  → { configured }  (is the voice set up — no secrets)
 * GET /api/speak?l=hi&t=<text>    → audio/mpeg
 *
 * The same words always give the same sound, so answers are kept by the
 * browser and Vercel's edge for a year: a guide step heard by a thousand
 * people is made once. Limits: per person per minute, and for the whole site
 * per day (TTS_DAILY_LIMIT, 3000 when not set), so the bill stays small.
 */
import { NextResponse } from 'next/server';

import { sharedIpLimited, sharedLimited } from '@/lib/server/sharedLimit';
import { speechAudio, VOICE_MAX_CHARS, voiceConfigured, VoiceError, type VoiceLang } from '@/lib/server/voice';

export const maxDuration = 20;

const LANGS: VoiceLang[] = ['en', 'hi', 'ur', 'ks'];

/** Recently made sounds, while this server stays warm. */
const kept = new Map<string, Uint8Array>();
const KEEP = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('t');
  if (raw === null) return NextResponse.json({ configured: voiceConfigured() }, { headers: { 'cache-control': 'no-store' } });

  const lang = url.searchParams.get('l') as VoiceLang;
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!LANGS.includes(lang) || !text) return NextResponse.json({ error: 'Say what to read, and in which language.' }, { status: 400 });
  if (text.length > VOICE_MAX_CHARS) return NextResponse.json({ error: 'Too long to read at once.' }, { status: 413 });
  if (!voiceConfigured()) return NextResponse.json({ error: 'The KashRoot voice is not set up yet.' }, { status: 503 });

  const id = `${lang}|${text}`;
  let audio = kept.get(id);
  if (!audio) {
    if (await sharedIpLimited(req, 'speak', 60)) return NextResponse.json({ error: 'Too many at once. Please wait a minute.' }, { status: 429 });
    const cap = Math.max(1, Number(process.env.TTS_DAILY_LIMIT) || 3000);
    if (await sharedLimited('speak-day:all', cap, 86_400_000)) return NextResponse.json({ error: 'The voice is resting for today: the answer is shown as text.' }, { status: 503 });
    try {
      audio = await speechAudio(text, lang);
    } catch (err) {
      return NextResponse.json({ error: err instanceof VoiceError ? err.message : 'The KashRoot voice is not answering right now.' }, { status: 502 });
    }
    kept.set(id, audio);
    if (kept.size > KEEP) kept.delete(kept.keys().next().value!);
  }
  return new Response(audio as BodyInit, {
    headers: {
      'content-type': 'audio/mpeg',
      'content-length': String(audio.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
