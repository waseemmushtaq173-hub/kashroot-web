/**
 * Shared Claude client and language handling for the AI features (voice
 * assistant, advisory first answers, photo diagnosis, label reading).
 * Server-only. Key: ANTHROPIC_API_KEY (console.anthropic.com).
 */
import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

import { sharedIpLimited, sharedLimited } from '@/lib/server/sharedLimit';

/** Claude Haiku 5.5: the low-cost model, so a small credit covers thousands of farmer questions. */
export const MODEL = 'claude-haiku-5-5';
/**
 * Photo checks (leaf/fruit diagnosis, fertiliser label reading) must be as
 * accurate as possible, so they use Claude Opus 5.5 — the most accurate at
 * reading images — at a few rupees per photo.
 */
export const VISION_MODEL = 'claude-opus-5-5';
/** Opus 5.5: if a safety check declines, Anthropic re-runs it on its recommended fallback model. */
export const VISION_FALLBACKS = { betas: ['server-side-fallback-2026-07-01'] as Anthropic.AnthropicBeta[], fallbacks: 'default' as const };

export type Lang = 'en' | 'hi' | 'ur' | 'ks';
export const LANGS: Lang[] = ['en', 'hi', 'ur', 'ks'];
export const asLang = (v: unknown): Lang => (LANGS.includes(v as Lang) ? (v as Lang) : 'en');

export const LANGUAGE: Record<Lang, string> = {
  en: 'simple English',
  hi: 'simple Hindi, written in Devanagari script',
  ur: 'simple Urdu, written in Urdu (Nastaliq) script',
  ks:
    'Kashmiri (Koshur) as people speak it in the Kashmir valley — real Kashmiri sentences, not Urdu. Write in the standard Kashmiri Perso-Arabic script with the Kashmiri vowel letters and marks (such as ٲ ٳ ۆ ۄ ێ ؠ ٕ ُ ِ). Use Kashmiri grammar and everyday words: the helping verb چھُ / چھِ / چھےٚ, never Urdu ہے / ہیں / ہوں; Kashmiri question words such as کیاہ; Kashmiri postpositions such as منٛز. Use an English or Urdu word only where Kashmiri speakers commonly do (UPI, mobile, mandi)',
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
  if (!key) return null;
  // A key not tied to a workspace must name one on every request
  // (ANTHROPIC_WORKSPACE_ID, "wrkspc_…" from the Claude Console).
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({ apiKey: key, timeout, maxRetries: 1, ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}) });
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
    // Anthropic's own reason (never the key), so a screenshot shows what to fix.
    const body = (err as { error?: { error?: { type?: string; message?: string } } }).error?.error;
    const why = `${err.status ?? ''} ${body?.type ?? ''}: ${body?.message ?? err.message}`.replace(/\s+/g, ' ').trim().slice(0, 220);
    return { status: 502, error: `The AI helper could not answer just now. Please try again. (Technical: ${why})` };
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

/** The first bytes each image type starts with (its "magic number"). */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/gif': (b) => /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')),
};

/**
 * A data: URL image → a Claude image block (JPEG, PNG, WebP or GIF, at most
 * ~4.5 MB). The bytes must really be that kind of picture — a script or a
 * program renamed image/png is refused, not passed on.
 */
export function imageBlock(dataUrl: unknown): Anthropic.Beta.BetaImageBlockParam | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || m[2].length > 6_000_000 || m[2].length < 64) return null;
  if (!MAGIC[m[1]](Buffer.from(m[2].slice(0, 32), 'base64'))) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: m[2] } };
}

/**
 * The paid AI routes' limit: at most `perMinute` calls a minute and
 * `perDay` a day from one network, counted across every server instance
 * (lib/server/sharedLimit), so the Anthropic credit cannot be drained by
 * spreading calls out.
 */
export async function aiLimited(req: Request, name: string, perMinute = 12, perDay = 300): Promise<boolean> {
  return (await sharedIpLimited(req, `ai-${name}`, perMinute, 60_000)) || (await sharedIpLimited(req, `ai-${name}-day`, perDay, 86_400_000));
}

/**
 * The photo checks (Claude Opus, a few rupees each) for the whole site in a
 * day: at most AI_PHOTO_DAILY_LIMIT (500 when not set). Past it, people are
 * sent to an expert instead, so a flood cannot run up the bill.
 */
export async function photoBudgetSpent(): Promise<boolean> {
  const cap = Math.max(1, Number(process.env.AI_PHOTO_DAILY_LIMIT) || 500);
  return sharedLimited('ai-photo-day:all', cap, 86_400_000);
}
/** Said when the day's photo checks are used up. */
export const PHOTO_BUDGET_SPENT = 'Automatic photo checks are used up for today. Press Ask an expert — an agronomist will look at your photo and answer.';
