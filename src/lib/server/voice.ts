/**
 * KashRoot's own voice: answers turned into speech on the server (Google
 * Cloud Text-to-Speech, neural voices for Indian English, Hindi and Urdu), so
 * every phone hears the same clear voice — no matter which voices its browser
 * has (many phones have no Hindi or Urdu voice at all).
 *
 *   GOOGLE_TTS_API_KEY   an API key with the Text-to-Speech API enabled
 *                        (server only — never NEXT_PUBLIC_)
 *   GOOGLE_TTS_VOICE_EN / _HI / _UR   optional voice names, else the defaults below
 *
 * Kashmiri has no voice anywhere yet: it is written in the Urdu script, so the
 * Urdu voice reads it. Without the key, voiceConfigured() is false and the
 * phone's own voice reads answers, as before. Server-only.
 */
import 'server-only';

export type VoiceLang = 'en' | 'hi' | 'ur' | 'ks';

/** The longest text one request may turn into speech (the page sends longer answers in parts). */
export const VOICE_MAX_CHARS = 400;

const CODE: Record<VoiceLang, string> = { en: 'en-IN', hi: 'hi-IN', ur: 'ur-IN', ks: 'ur-IN' };
const DEFAULT_VOICE: Record<VoiceLang, string> = { en: 'en-IN-Neural2-A', hi: 'hi-IN-Neural2-A', ur: 'ur-IN-Wavenet-A', ks: 'ur-IN-Wavenet-A' };

const key = () => process.env.GOOGLE_TTS_API_KEY?.trim() || '';
export const voiceConfigured = () => Boolean(key());

function voiceName(lang: VoiceLang): string {
  const own = { en: process.env.GOOGLE_TTS_VOICE_EN, hi: process.env.GOOGLE_TTS_VOICE_HI, ur: process.env.GOOGLE_TTS_VOICE_UR, ks: process.env.GOOGLE_TTS_VOICE_UR }[lang]?.trim();
  return own || DEFAULT_VOICE[lang];
}

export class VoiceError extends Error {}

async function synthesize(text: string, lang: VoiceLang, name: string | null): Promise<Response> {
  return fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key())}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: CODE[lang], ...(name ? { name } : {}) },
      // A little slower than usual: easier to follow for someone listening, not reading.
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.92 },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
}

/** `text` read aloud in `lang`, as MP3 bytes. Throws VoiceError (its message is safe to show). */
export async function speechAudio(text: string, lang: VoiceLang): Promise<Uint8Array> {
  if (!voiceConfigured()) throw new VoiceError('The KashRoot voice is not set up yet.');
  let res = await synthesize(text, lang, voiceName(lang));
  // A voice name Google does not have (any more): its default voice for the language instead.
  if (res.status === 400) res = await synthesize(text, lang, null);
  if (!res.ok) throw new VoiceError('The KashRoot voice is not answering right now.');
  const data = (await res.json().catch(() => null)) as { audioContent?: string } | null;
  if (!data?.audioContent) throw new VoiceError('The KashRoot voice is not answering right now.');
  return new Uint8Array(Buffer.from(data.audioContent, 'base64'));
}
