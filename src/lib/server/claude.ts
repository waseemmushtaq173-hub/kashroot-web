/**
 * Shared Claude client and language handling for the AI features (voice
 * assistant, advisory first answers, photo diagnosis, label reading).
 * Server-only. Key: ANTHROPIC_API_KEY (console.anthropic.com).
 */
import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

/** Claude Haiku 5.5: the low-cost model, so a small credit covers thousands of farmer questions. */
export const MODEL = 'claude-haiku-5-5';

export type Lang = 'en' | 'hi' | 'ur' | 'ks';
export const LANGS: Lang[] = ['en', 'hi', 'ur', 'ks'];
export const asLang = (v: unknown): Lang => (LANGS.includes(v as Lang) ? (v as Lang) : 'en');

export const LANGUAGE: Record<Lang, string> = {
  en: 'simple English',
  hi: 'simple Hindi, written in Devanagari script',
  ur: 'simple Urdu, written in Urdu (Nastaliq) script',
  ks: 'Kashmiri (Koshur), written in the Perso-Arabic script used for Kashmiri, with everyday village words',
};

/** Marks where the Devanagari copy of an answer starts (for a Hindi voice). */
export const SPEECH_MARK = '@@SPEAK@@';

/** Instruction for a Devanagari copy when the device has no voice for the language. */
export const speechInstruction = (lang: Lang) =>
  `After your answer, write a new line containing only ${SPEECH_MARK}, then the same answer transliterated into Devanagari script (same ${lang === 'ks' ? 'Kashmiri' : 'Urdu'} words, written as they are pronounced) so a Hindi voice can read it aloud.`;

/** Splits "answer @@SPEAK@@ devanagari" into its two parts. */
export function splitSpeech(full: string): { text: string; speech?: string } {
  const [text, speech] = full.split(SPEECH_MARK).map((s) => s.trim());
  return { text: text || full.trim(), ...(speech ? { speech } : {}) };
}

export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export function claudeClient(timeout = 45_000): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? new Anthropic({ apiKey: key, timeout, maxRetries: 1 }) : null;
}

/** Shown to farmers when no ANTHROPIC_API_KEY is set (the owner sets it in Vercel). */
export const NOT_CONNECTED = 'Automatic photo checks are not switched on yet. Press Ask an expert instead — an agronomist will look at your photo and answer.';

/** Plain words and an HTTP status for a failed Claude call. */
export function claudeFailure(err: unknown): { status: number; error: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('Claude: ANTHROPIC_API_KEY was rejected');
    return { status: 503, error: 'The AI helper’s key was rejected. The site owner needs to check ANTHROPIC_API_KEY in Vercel.' };
  }
  if (err instanceof Anthropic.RateLimitError) return { status: 429, error: 'The AI helper is busy right now. Please try again in a minute.' };
  if (err instanceof Anthropic.APIError) {
    console.error('Claude API error', err.status, err.message);
    if (err.status === 400 && /credit balance/i.test(err.message)) return { status: 502, error: 'The AI helper has run out of credit. The site owner needs to top up the Anthropic account.' };
    return { status: 502, error: 'The AI helper could not answer just now. Please try again.' };
  }
  console.error('Claude call failed:', err);
  return { status: 502, error: 'The AI helper could not be reached. Please try again.' };
}

/** All text blocks of a response, joined. */
export const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim();

/** A data: URL image → a Claude image block (JPEG, PNG, WebP or GIF, at most ~4.5 MB). */
export function imageBlock(dataUrl: unknown): Anthropic.Beta.BetaImageBlockParam | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || m[2].length > 6_000_000) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: m[2] } };
}

/**
 * Very small per-instance throttle for the paid AI routes: at most `limit`
 * calls per IP per minute. Serverless instances don't share it, so it only
 * stops runaway loops, not a determined abuser.
 */
const hits = new Map<string, number[]>();
export function throttled(req: Request, limit = 12): boolean {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}
