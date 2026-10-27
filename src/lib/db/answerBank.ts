'use client';

/**
 * Advisory → Answer bank (experts and admins only, by row-level security):
 * the assistant's own answers, and the AI answers waiting for an expert to
 * approve or discard (20261102000000_assistant_answers.sql). Who wrote an
 * answer is set by the database from the signed-in expert.
 */
import { dbMessage, supabase } from '@/lib/db/client';

export type AnswerLang = 'en' | 'hi' | 'ur' | 'ks';
export const ANSWER_LANGS: { id: AnswerLang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ur', label: 'Urdu' },
  { id: 'ks', label: 'Kashmiri' },
];

export interface BankEntry {
  id: string;
  lang: AnswerLang;
  /** The ways people ask it. */
  questions: string[];
  answer: string;
  topic: string | null;
  origin: 'expert' | 'ai_reviewed';
  author_name: string | null;
  status: 'approved' | 'hidden';
  uses: number;
  updated_at: string;
}

export interface Suggestion {
  id: number;
  lang: AnswerLang;
  question: string;
  /** The AI's answer, as the person heard it. */
  reply: string;
  /** How many times this question was asked while waiting. */
  asked: number;
  updated_at: string;
}

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

/** One way of asking per line (or comma-free list), tidied: empty lines dropped, at most 20. */
export function phrasings(text: string): string[] {
  return [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, 20);
}

export async function listAnswers(): Promise<BankEntry[]> {
  const { data, error } = await supabase
    .from('assistant_answers')
    .select('id, lang, questions, answer, topic, origin, author_name, status, uses, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) fail(error, 'Could not load the answer bank.');
  return (data ?? []) as BankEntry[];
}

export async function listSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .select('id, lang, question, reply, asked, updated_at')
    .eq('status', 'pending')
    .order('asked', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) fail(error, 'Could not load the answers waiting for review.');
  return (data ?? []) as Suggestion[];
}

export type AnswerInput = Pick<BankEntry, 'lang' | 'questions' | 'answer' | 'topic'>;

export async function addAnswer(input: AnswerInput, origin: BankEntry['origin'] = 'expert'): Promise<void> {
  const { error } = await supabase.from('assistant_answers').insert({ ...input, origin });
  if (error) fail(error, 'Could not save the answer.');
}

export async function updateAnswer(id: string, change: Partial<AnswerInput> & { status?: BankEntry['status'] }): Promise<void> {
  const { error } = await supabase.from('assistant_answers').update(change).eq('id', id);
  if (error) fail(error, 'Could not save the answer.');
}

export async function removeAnswer(id: string): Promise<void> {
  const { error } = await supabase.from('assistant_answers').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the answer.');
}

/** The expert's checked version of an AI answer goes into the bank; the suggestion is closed. */
export async function approveSuggestion(s: Suggestion, input: AnswerInput): Promise<void> {
  await addAnswer(input, 'ai_reviewed');
  const { error } = await supabase.from('assistant_suggestions').update({ status: 'approved' }).eq('id', s.id);
  if (error) fail(error, 'The answer was saved, but the suggestion could not be closed. Discard it.');
}

export async function discardSuggestion(id: number): Promise<void> {
  const { error } = await supabase.from('assistant_suggestions').update({ status: 'discarded' }).eq('id', id);
  if (error) fail(error, 'Could not discard it.');
}
