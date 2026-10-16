/**
 * Kashmiri answers that native speakers can trust. Every Kashmiri reply from
 * the assistant goes through here:
 *
 *   1. What editors taught in the Kashmiri Lab — words with their vowel marks
 *      and example answers — goes into the AI's instructions.
 *   2. The reply is checked for Urdu-only words (ہے، نہیں، آپ …); if it reads
 *      as Urdu it is rewritten once in Kashmiri.
 *   3. Vowel marks are put back on known words written without them.
 *
 * KASHMIRI_MODEL (optional, Vercel) makes Kashmiri answers use a stronger
 * model than the everyday one. Server-only.
 */
import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';

import { ksText, type KsPhraseKey } from '@/lib/kashmiri/phrases';
import { keyWords, markMap, restoreMarks, similarity, urduSigns, type MarkMap } from '@/lib/kashmiri/text';
import { LANGUAGE, MODEL, speechInstruction, splitSpeech, textOf } from '@/lib/server/claude';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export interface KsWord {
  kashmiri: string;
  meaning: string;
  note: string | null;
}
export interface KsExample {
  question: string;
  answer: string;
}
export interface KsLexicon {
  words: KsWord[];
  examples: KsExample[];
  phrases: Record<string, string>;
  marks: MarkMap;
}

/** The model for Kashmiri answers: KASHMIRI_MODEL when set (e.g. claude-sonnet-5-5), else the everyday one. */
export const KS_MODEL = (() => {
  const m = process.env.KASHMIRI_MODEL?.trim();
  return m && /^claude-[a-z0-9.-]+$/.test(m) ? m : MODEL;
})();

const EMPTY: KsLexicon = { words: [], examples: [], phrases: {}, marks: markMap([]) };
/** Editors' changes reach the assistant within this time. */
const FRESH_MS = 5 * 60_000;
let cache: { at: number; lex: KsLexicon } | null = null;
let loading: Promise<KsLexicon> | null = null;

async function rows<T>(origin: string, key: string, path: string): Promise<T[]> {
  const res = await fetch(`${origin}/rest/v1/${path}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T[];
}

/** What native speakers have taught KashRoot. Never throws: before the SQL is run, or if the database is down, it is empty (or the last good copy). */
export async function kashmiriLexicon(): Promise<KsLexicon> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.lex;
  loading ??= (async () => {
    const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (!origin || !key) return EMPTY;
    const [w, e, p] = await Promise.allSettled([
      rows<KsWord>(origin, key, 'ks_words?select=kashmiri,meaning,note&order=id&limit=5000'),
      rows<KsExample>(origin, key, 'ks_examples?select=question,answer&order=id.desc&limit=2000'),
      rows<{ key: string; text: string }>(origin, key, 'ks_phrases?select=key,text&limit=500'),
    ]);
    const prev = cache?.lex ?? EMPTY;
    const words = w.status === 'fulfilled' ? w.value : prev.words;
    const lex: KsLexicon = {
      words,
      examples: e.status === 'fulfilled' ? e.value : prev.examples,
      phrases: p.status === 'fulfilled' ? Object.fromEntries(p.value.map((r) => [r.key, r.text])) : prev.phrases,
      marks: w.status === 'fulfilled' ? markMap(words.map((x) => x.kashmiri)) : prev.marks,
    };
    cache = { at: Date.now(), lex };
    return lex;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/** A built-in Kashmiri sentence, as corrected by editors. */
export const ksPhrase = (lex: KsLexicon, key: KsPhraseKey, vars?: Record<string, string>) => ksText(key, vars, lex.phrases);

const MAX_WORDS = 300;

/** The editors' word list for the AI: all of it while it is small, else the words this question is about. */
function glossary(lex: KsLexicon, query: string): string {
  let words = lex.words;
  if (!words.length) return '';
  if (words.length > MAX_WORDS) {
    const q = keyWords(query);
    words = words
      .map((w) => ({ w, s: similarity(q, keyWords(`${w.meaning} ${w.kashmiri}`)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_WORDS)
      .map((x) => x.w);
    if (!words.length) return '';
  }
  return `Kashmiri words written by native speakers. Whenever you need one of these meanings, use exactly this Kashmiri word and spelling, with every vowel mark:\n${words.map((w) => `${w.kashmiri} = ${w.meaning}${w.note ? ` (${w.note})` : ''}`).join('\n')}`;
}

/** Up to three answers native speakers wrote for questions like this one. */
function examples(lex: KsLexicon, query: string): string {
  const q = keyWords(query);
  const best = lex.examples
    .map((e) => ({ e, s: similarity(q, keyWords(e.question)) }))
    .filter((x) => x.s >= 0.2)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);
  if (!best.length) return '';
  return `How native Kashmiri speakers answered similar questions — follow their words, spelling and style (but use today's facts, not theirs):\n${best.map((x) => `Question: ${x.e.question}\nKashmiri answer: ${x.e.answer}`).join('\n\n')}`;
}

/**
 * Standing instructions for Kashmiri replies (rules + the editors' words).
 * The same for every question while the word list is small, so it can be cached.
 */
export function kashmiriSystem(lex: KsLexicon, query: string): string {
  return [
    `Kashmiri replies: the person chose Kashmiri. Answer only in ${LANGUAGE.ks} — whatever language they asked in, and also when you quote prices, weather or KashRoot's buttons (keep only the button names, numbers and units as they are). Never answer in Urdu, Hindi or English, and never mix them in.`,
    glossary(lex, lex.words.length > MAX_WORDS ? query : ''),
  ].filter(Boolean).join('\n\n');
}

/** Per-question help: example answers by native speakers for similar questions. */
export const kashmiriExamples = (lex: KsLexicon, query: string) => examples(lex, query);

/** Rewrites text that came out as Urdu into Kashmiri. */
async function rewrite(client: Anthropic, text: string, lex: KsLexicon, query: string, wantDevanagari: boolean): Promise<{ text: string; speech?: string } | null> {
  const response = await client.beta.messages.create({
    model: KS_MODEL,
    max_tokens: 3000,
    system: [
      `You correct text that should be Kashmiri (Koshur) but has Urdu words or Urdu grammar in it. Rewrite all of it in ${LANGUAGE.ks}. Keep the meaning, numbers, prices, units, place names and English button names exactly as they are. Output only the corrected Kashmiri.${wantDevanagari ? ` ${speechInstruction('ks')}` : ''}`,
      glossary(lex, query),
      examples(lex, query),
    ].filter(Boolean).join('\n\n'),
    messages: [{ role: 'user', content: text }],
    output_config: { effort: 'medium' },
  });
  const full = textOf(response.content);
  return full ? splitSpeech(full) : null;
}

/**
 * The last step for every Kashmiri reply: rewritten once if it reads as Urdu,
 * then vowel marks restored on words the editors have taught.
 */
export async function finishKashmiri(
  text: string,
  opts: { client: Anthropic | null; lex: KsLexicon; query: string; wantDevanagari?: boolean; speech?: string },
): Promise<{ reply: string; speech?: string; rewritten: boolean; marksRestored: number }> {
  let reply = text;
  let speech = opts.speech;
  let rewritten = false;
  const before = urduSigns(reply);
  if (before.leaks && opts.client) {
    const fixed = await rewrite(opts.client, reply, opts.lex, opts.query, Boolean(opts.wantDevanagari)).catch(() => null);
    if (fixed?.text) {
      const after = urduSigns(fixed.text);
      if (!after.leaks || after.found.length < before.found.length) {
        reply = fixed.text;
        // The old Devanagari copy belongs to the old wording.
        speech = fixed.speech;
        rewritten = true;
      }
    }
  }
  const restored = restoreMarks(reply, opts.lex.marks);
  return { reply: restored.text, ...(speech ? { speech } : {}), rewritten, marksRestored: restored.changed };
}
