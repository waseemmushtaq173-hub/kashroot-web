'use client';

/**
 * The Kashmiri Lab (supabase/migrations/20261019000000_kashmiri_lab.sql):
 * words with their vowel marks, example answers, KashRoot's built-in
 * sentences, "not proper Kashmiri" reports and the editors who fix them.
 * Everyone reads words, examples and sentences; editors (admins and native
 * speakers an admin adds) write them — the database enforces it.
 */
import { dbMessage, supabase } from '@/lib/db/client';
import { setKsOverrides } from '@/lib/kashmiri/phrases';

export interface KsWordRow {
  id: number;
  kashmiri: string;
  meaning: string;
  note: string | null;
  updated_at: string;
}
export interface KsExampleRow {
  id: number;
  question: string;
  answer: string;
  updated_at: string;
}
export interface KsReport {
  id: number;
  question: string;
  reply: string;
  suggestion: string | null;
  note: string | null;
  status: 'open' | 'fixed' | 'dismissed';
  created_at: string;
}
export interface KsEditor {
  user_id: string;
  email: string;
  full_name: string;
  granted_at: string;
}

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  // The policy refusals read as "row-level security": say it plainly.
  if (error?.code === '42501' || /row-level security|permission denied/i.test(error?.message ?? '')) throw new Error('Only Kashmiri editors can do this.');
  if (error?.code === '23505') throw new Error('This is saved already.');
  throw new Error(error?.message && !/schema cache|does not exist/i.test(error.message) ? error.message : dbMessage(error, fallback));
};

/** null when the Kashmiri Lab SQL has not been run yet. */
export async function isKsEditor(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('kr_ks_editor');
  if (error) return /could not find the function|does not exist|schema cache/i.test(error.message ?? '') || error.code === 'PGRST202' ? null : false;
  return data === true;
}

/* ── built-in sentences ── */

let phrasesLoaded: Promise<void> | null = null;

/** Loads the editors' corrected sentences once per page (no sign-in needed). */
export function loadKsPhrases(force = false): Promise<void> {
  if (force || !phrasesLoaded) {
    phrasesLoaded = Promise.resolve(supabase.from('ks_phrases').select('key, text'))
      .then(({ data }) => {
        if (data) setKsOverrides(Object.fromEntries((data as { key: string; text: string }[]).map((r) => [r.key, r.text])));
      })
      .catch(() => undefined);
  }
  return phrasesLoaded;
}

export async function ksPhraseRows(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('ks_phrases').select('key, text');
  if (error) fail(error, 'Could not load the sentences.');
  return Object.fromEntries(((data ?? []) as { key: string; text: string }[]).map((r) => [r.key, r.text]));
}

export async function saveKsPhrase(key: string, text: string): Promise<void> {
  const { error } = await supabase.from('ks_phrases').upsert({ key, text: text.trim() }, { onConflict: 'key' }).select('key');
  if (error) fail(error, 'Could not save the sentence.');
  await loadKsPhrases(true);
}

/** Back to KashRoot's first draft. */
export async function resetKsPhrase(key: string): Promise<void> {
  const { error } = await supabase.from('ks_phrases').delete().eq('key', key);
  if (error) fail(error, 'Could not reset the sentence.');
  await loadKsPhrases(true);
}

/* ── words ── */

export async function ksWords(): Promise<KsWordRow[]> {
  const { data, error } = await supabase.from('ks_words').select('id, kashmiri, meaning, note, updated_at').order('updated_at', { ascending: false }).limit(5000);
  if (error) fail(error, 'Could not load the words.');
  return (data ?? []) as KsWordRow[];
}

export async function addKsWord(input: { kashmiri: string; meaning: string; note?: string }): Promise<void> {
  const { error } = await supabase.from('ks_words').insert({ kashmiri: input.kashmiri.trim(), meaning: input.meaning.trim(), note: input.note?.trim() || null }).select('id');
  if (error) fail(error, 'Could not save the word.');
}

export async function updateKsWord(id: number, input: { kashmiri: string; meaning: string; note?: string | null }): Promise<void> {
  const { data, error } = await supabase.from('ks_words').update({ kashmiri: input.kashmiri.trim(), meaning: input.meaning.trim(), note: input.note?.trim() || null }).eq('id', id).select('id');
  if (error) fail(error, 'Could not save the word.');
  if (!data?.length) throw new Error('Only Kashmiri editors can do this.');
}

export async function deleteKsWord(id: number): Promise<void> {
  const { data, error } = await supabase.from('ks_words').delete().eq('id', id).select('id');
  if (error) fail(error, 'Could not delete the word.');
  if (!data?.length) throw new Error('Only an admin, or the editor who added it, can delete this word.');
}

/* ── example answers ── */

export async function ksExamples(): Promise<KsExampleRow[]> {
  const { data, error } = await supabase.from('ks_examples').select('id, question, answer, updated_at').order('updated_at', { ascending: false }).limit(2000);
  if (error) fail(error, 'Could not load the answers.');
  return (data ?? []) as KsExampleRow[];
}

export async function addKsExample(question: string, answer: string): Promise<void> {
  const { error } = await supabase.from('ks_examples').insert({ question: question.trim() || '—', answer: answer.trim() }).select('id');
  if (error) fail(error, 'Could not save the answer.');
}

export async function updateKsExample(id: number, question: string, answer: string): Promise<void> {
  const { data, error } = await supabase.from('ks_examples').update({ question: question.trim() || '—', answer: answer.trim() }).eq('id', id).select('id');
  if (error) fail(error, 'Could not save the answer.');
  if (!data?.length) throw new Error('Only Kashmiri editors can do this.');
}

export async function deleteKsExample(id: number): Promise<void> {
  const { data, error } = await supabase.from('ks_examples').delete().eq('id', id).select('id');
  if (error) fail(error, 'Could not delete the answer.');
  if (!data?.length) throw new Error('Only an admin, or the editor who added it, can delete this answer.');
}

/* ── reports ── */

/** "Not proper Kashmiri": anyone using the assistant, signed in or not. */
export async function reportKashmiri(input: { question: string; reply: string; suggestion?: string; note?: string }): Promise<void> {
  const { error } = await supabase.rpc('kr_ks_report', { p_question: input.question, p_reply: input.reply, p_suggestion: input.suggestion ?? null, p_note: input.note ?? null });
  if (error) fail(error, 'Could not send the report.');
}

export async function ksReports(status: KsReport['status'] = 'open'): Promise<KsReport[]> {
  const { data, error } = await supabase.from('ks_reports').select('id, question, reply, suggestion, note, status, created_at').eq('status', status).order('created_at', { ascending: false }).limit(200);
  if (error) fail(error, 'Could not load the reports.');
  return (data ?? []) as KsReport[];
}

export async function closeKsReport(id: number, status: 'fixed' | 'dismissed'): Promise<void> {
  const { data, error } = await supabase.from('ks_reports').update({ status }).eq('id', id).select('id');
  if (error) fail(error, 'Could not update the report.');
  if (!data?.length) throw new Error('Only Kashmiri editors can do this.');
}

/** A reported answer, corrected: saved as an example the assistant follows, and the report closed. */
export async function fixKsReport(report: KsReport, corrected: string): Promise<void> {
  await addKsExample(report.question, corrected);
  await closeKsReport(report.id, 'fixed');
}

/* ── editors (admins only) ── */

export async function ksEditors(): Promise<KsEditor[]> {
  const { data, error } = await supabase.rpc('kr_ks_editors');
  if (error) fail(error, 'Could not load the editors.');
  return (data ?? []) as KsEditor[];
}

export async function addKsEditor(email: string): Promise<void> {
  const { error } = await supabase.rpc('kr_ks_add_editor', { p_email: email.trim() });
  if (error) fail(error, 'Could not add the editor.');
}

export async function removeKsEditor(userId: string): Promise<void> {
  const { error } = await supabase.rpc('kr_ks_remove_editor', { p_user: userId });
  if (error) fail(error, 'Could not remove the editor.');
}
