/**
 * The KashRoot voice/text assistant — KashRoot's own answers only, no AI
 * writing them:
 *   1. the answer bank: answers written or approved by KashRoot's experts
 *      (lib/server/answerBank), in their own words;
 *   2. KashRoot's own rules (lib/server/basicAssistant): today's mandi rates
 *      and weather from live sources, how to use KashRoot, and the guide to
 *      the page the person is on (lib/portalGuide);
 *   3. otherwise an honest "I don't know yet" — and the question goes to the
 *      experts' queue, so the next person asking gets their answer.
 * Kashmiri: the bank's Kashmiri answers; else the Government's translator
 * (Bhashini) when it is set up; else Urdu, Kashmiri's written form.
 *
 * GET  /api/ai → { configured, own: true, kashmiri }   (no secrets returned)
 * POST /api/ai
 *   { query, lang?: 'en'|'hi'|'ur'|'ks', exact?, speakAs?: 'hi',
 *     path?: string   // the page the person is on, e.g. "/farmer/dashboard?tab=orders"
 *     where?: Here }  // their area (lib/region), for "weather here"
 *   → { reply, lang, speech?, from? }  (speech: the reply in Devanagari, for a Hindi voice)
 */
import { NextResponse } from 'next/server';

import { matchAnswer, NOT_ANSWERED, suggestAnswer, type BankAnswer } from '@/lib/server/answerBank';
import { aiLimited, asLang, type Lang } from '@/lib/server/claude';
import { detectReplyLang } from '@/lib/langDetect';
import { basicAnswer, needsLiveData, type Here } from '@/lib/server/basicAssistant';
import { bhashiniConfigured, toKashmiri } from '@/lib/server/bhashini';
import { finishKashmiri } from '@/lib/server/kashmiri';
import { hasHumanPass, needHuman } from '@/lib/server/humanPass';

export const maxDuration = 30;

/** The person's area as the page sent it (lib/region): checked, India only. */
function hereOf(raw: unknown): Here | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const w = raw as Record<string, unknown>;
  const name = typeof w.name === 'string' ? w.name.replace(/[^\p{L}\p{N} .,'()-]/gu, '').trim().slice(0, 60) : '';
  if (!name) return undefined;
  const lat = Number(w.lat);
  const lng = Number(w.lng);
  const at = Number.isFinite(lat) && Number.isFinite(lng) && lat > 6 && lat < 37.7 && lng > 68 && lng < 97.6 ? { lat, lng } : {};
  const state = typeof w.state === 'string' ? w.state.replace(/[^\p{L} &]/gu, '').slice(0, 40) : undefined;
  return { name, ...at, ...(state ? { state } : {}), exact: w.exact === true };
}

/** A same-site path ("/farmer/dashboard?tab=orders"), or undefined. */
function pathOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return undefined;
  return raw.slice(0, 200);
}

export function GET() {
  return NextResponse.json({ configured: true, own: true, kashmiri: bhashiniConfigured() ? 'bhashini' : 'urdu' }, { headers: { 'cache-control': 'no-store' } });
}

/** Kashmiri from English by the Government's translator (Bhashini), checked for Urdu words; null when it is not set up or fails. */
async function kashmiriFrom(english: string, wantDevanagari: boolean): Promise<{ reply: string; speech?: string } | null> {
  if (!bhashiniConfigured()) return null;
  try {
    const [reply, speech] = await Promise.all([toKashmiri(english, 'Arab'), wantDevanagari ? toKashmiri(english, 'Deva').catch(() => undefined) : Promise.resolve(undefined)]);
    const done = await finishKashmiri(reply, { client: null, wantDevanagari, speech });
    return { reply: done.reply, ...(done.speech ? { speech: done.speech } : {}) };
  } catch {
    return null;
  }
}

/**
 * A bank answer for this person: the expert's words in their language; for
 * Kashmiri, an English answer through the translator. Null when the bank has
 * it only in another language (then KashRoot's own rules answer).
 */
async function bankReply(b: BankAnswer, lang: Lang, wantDevanagari: boolean): Promise<{ reply: string; speech?: string } | null> {
  if (b.lang === lang) return { reply: b.answer };
  if (lang === 'ks' && b.lang === 'en') return kashmiriFrom(b.answer, wantDevanagari);
  return null;
}

export async function POST(req: Request) {
  // People, not scripts: the "I am human" pass (when Turnstile is on), then the limits.
  if (!hasHumanPass(req)) return needHuman();
  if (await aiLimited(req, 'assistant', 30, 600)) return NextResponse.json({ error: 'Too many questions at once. Please wait a minute.' }, { status: 429 });
  let body: { query?: string; lang?: string; exact?: boolean; speakAs?: string; path?: string; where?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const query = body.query?.trim().slice(0, 600);
  if (!query) return NextResponse.json({ error: 'Say or type a question.' }, { status: 400 });
  const here = hereOf(body.where);
  const path = pathOf(body.path);
  const lang = body.exact ? asLang(body.lang) : detectReplyLang(query, asLang(body.lang));
  const wantDevanagari = (lang === 'ur' || lang === 'ks') && body.speakAs === 'hi';

  // 1. The experts' answer bank (never for today's prices or weather: they change every day).
  if (!needsLiveData(query)) {
    const bank = await matchAnswer(query, lang);
    const said = bank ? await bankReply(bank, lang, wantDevanagari) : null;
    if (bank && said) return NextResponse.json({ ...said, lang, from: { kind: 'expert', name: bank.authorName, reviewed: bank.origin === 'ai_reviewed' } });
  }

  // 2. KashRoot's own rules. Kashmiri: through the translator when it is set up, else in Urdu.
  if (lang === 'ks') {
    const en = await basicAnswer(query, 'en', undefined, here, path);
    if (en.known === false) suggestAnswer(lang, query, NOT_ANSWERED);
    const ks = await kashmiriFrom(en.reply, wantDevanagari);
    if (ks) return NextResponse.json({ ...ks, lang, own: true });
  }
  const a = await basicAnswer(query, lang, undefined, here, path);
  // 3. Not known: the experts see the question, and their answer joins the bank.
  if (a.known === false && lang !== 'ks') suggestAnswer(lang, query, NOT_ANSWERED);
  return NextResponse.json({ reply: a.reply, lang, own: true, ...(a.known === false ? { unknown: true } : {}), ...(wantDevanagari && a.speech ? { speech: a.speech } : {}) });
}
