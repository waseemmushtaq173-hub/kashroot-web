/**
 * The assistant's own answer bank (20261102000000_assistant_answers.sql):
 * answers written or approved by KashRoot's experts, asked first so most
 * questions are answered at once, without the AI, and in an expert's words.
 *   matchAnswer    the best approved answer for a question (kr_answer_match)
 *   suggestAnswer  a question the assistant could not answer (NOT_ANSWERED),
 *                  queued for an expert to write the answer — or an older
 *                  AI answer to approve or discard (kr_suggest_answer, needs
 *                  KYC_DB_SECRET); no account is sent with it. Written after
 *                  the reply has gone (after()).
 * Before that SQL is run, matchAnswer finds nothing and suggestAnswer does
 * nothing: the assistant works as before. Server-only.
 */
import 'server-only';

import { after } from 'next/server';

import type { Lang } from '@/lib/server/claude';
export { NOT_ANSWERED } from '@/lib/notAnswered';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export interface BankAnswer {
  answer: string;
  /** The language it is written in: the person's, or English to be translated. */
  lang: Lang;
  /** The expert who wrote or approved it. */
  authorName: string;
  /** Written by the expert, or an AI answer the expert checked and approved. */
  origin: 'expert' | 'ai_reviewed';
}

async function rpc(fn: 'kr_answer_match' | 'kr_suggest_answer', args: Record<string, unknown>, timeout: number): Promise<unknown> {
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!origin || !anon) return null;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** The bank's answer, or null (none close enough, the SQL not run yet, or the database slow). */
export async function matchAnswer(query: string, lang: Lang): Promise<BankAnswer | null> {
  // Short: when the database is slow the AI answers instead of keeping the person waiting.
  const rows = (await rpc('kr_answer_match', { p_query: query, p_lang: lang }, 2_500)) as { answer?: string; lang?: string; author_name?: string | null; origin?: string }[] | null;
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r?.answer || !r.lang) return null;
  return {
    answer: r.answer,
    lang: r.lang as Lang,
    authorName: r.author_name?.trim() || 'KashRoot expert',
    origin: r.origin === 'ai_reviewed' ? 'ai_reviewed' : 'expert',
  };
}

/** Queue a question (and its reply, or NOT_ANSWERED) for an expert (after the reply is sent). Never throws. */
export function suggestAnswer(lang: Lang, question: string, reply: string): void {
  const secret = process.env.KYC_DB_SECRET?.trim();
  if (!secret) return;
  const send = () => rpc('kr_suggest_answer', { p_secret: secret, p_lang: lang, p_question: question, p_reply: reply }, 4_000);
  try {
    after(send);
  } catch {
    void send();
  }
}
