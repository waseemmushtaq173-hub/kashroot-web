'use client';

/**
 * Contributors' work and pay (supabase/migrations/20261013000000_contributors.sql):
 * every mandi rate posted and every farmer request an expert answers is one
 * contribution — waiting, accepted or not accepted. Accepted ones are paid
 * at the rate the admin sets per kind (0 = not decided yet).
 */
import { dbMessage, supabase } from '@/lib/db/client';
import type { MandiRate } from '@/lib/db/mandiRates';

export type WorkKind = 'mandi_rate' | 'answer' | 'soil_test' | 'video_call';
export type WorkStatus = 'pending' | 'accepted' | 'rejected';

export const WORK_LABEL: Record<WorkKind, string> = { mandi_rate: 'Mandi rate', answer: 'Answer to a farmer', soil_test: 'Soil test', video_call: 'Video call' };
export const STATUS_WORDS: Record<WorkStatus, string> = { pending: 'Waiting for a check', accepted: 'Accepted', rejected: 'Not accepted' };

export interface Contribution {
  id: number;
  user_id: string;
  kind: WorkKind;
  ref_id: string;
  title: string | null;
  status: WorkStatus;
  final: boolean;
  decided_at: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  paid_ref: string | null;
  created_at: string;
}

export interface PayRate {
  kind: WorkKind;
  amount: number;
}

export interface Contributor {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: string[] | null;
  accepted: number;
  pending: number;
  rejected: number;
  unpaid: number;
  due: number;
  paid: number;
  upi_id: string | null;
  account_number: string | null;
  ifsc: string | null;
  last_at: string;
}

export interface RateCheck {
  rate_id: string;
  user_id: string;
  verdict: 'correct' | 'wrong';
  note: string | null;
  created_at: string;
}

export interface AnswerToCheck {
  contribution: Contribution;
  request: { id: string; kind: string; crop: string | null; message: string; farmer_name: string; district: string | null; farmer_rating: 'helpful' | 'not_helpful' | null; expert_name: string | null } | null;
}

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

export async function myContributions(userId: string): Promise<Contribution[]> {
  const { data, error } = await supabase.from('contributions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(500);
  if (error) fail(error, 'Could not load your contributions.');
  return (data ?? []) as Contribution[];
}

export async function payRates(): Promise<PayRate[]> {
  const { data, error } = await supabase.from('pay_rates').select('kind, amount');
  if (error) fail(error, 'Could not load the pay rates.');
  return ((data ?? []) as PayRate[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function setPayRate(kind: WorkKind, amount: number): Promise<void> {
  const { data, error } = await supabase.from('pay_rates').update({ amount }).eq('kind', kind).select('kind');
  if (error) fail(error, 'Could not save the pay rate.');
  if (!data?.length) throw new Error('Only an admin can change pay.');
}

export async function contributors(): Promise<Contributor[]> {
  const { data, error } = await supabase.rpc('kr_contributors');
  if (error) fail(error, 'Could not load the contributors.');
  return ((data ?? []) as Contributor[]).map((c) => ({ ...c, accepted: Number(c.accepted), pending: Number(c.pending), rejected: Number(c.rejected), unpaid: Number(c.unpaid), due: Number(c.due), paid: Number(c.paid) }));
}

export async function markPaid(userId: string, ref: string): Promise<number> {
  const { data, error } = await supabase.rpc('kr_mark_paid', { p_user: userId, p_ref: ref });
  if (error) fail(error, 'Could not record the payment.');
  return Number(data ?? 0);
}

/** Admin: rates someone reported wrong, then recent ones nobody has checked. */
export async function ratesToCheck(): Promise<{ rates: MandiRate[]; checks: RateCheck[] }> {
  const since = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('mandi_rates').select('*').in('status', ['disputed', 'pending']).gte('rate_date', since).order('rate_date', { ascending: false }).limit(200);
  if (error) fail(error, 'Could not load the rates.');
  const rates = ((data ?? []) as MandiRate[]).sort((a, b) => Number(b.status === 'disputed') - Number(a.status === 'disputed'));
  if (!rates.length) return { rates, checks: [] };
  const c = await supabase.from('mandi_rate_checks').select('*').in('rate_id', rates.map((r) => r.id));
  if (c.error) fail(c.error, 'Could not load the checks.');
  return { rates, checks: (c.data ?? []) as RateCheck[] };
}

/** Admin: experts' answers still waiting, the ones a farmer said did not help first. */
export async function answersToCheck(): Promise<AnswerToCheck[]> {
  const { data, error } = await supabase.from('contributions').select('*').neq('kind', 'mandi_rate').eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
  if (error) fail(error, 'Could not load the answers.');
  const list = (data ?? []) as Contribution[];
  if (!list.length) return [];
  const r = await supabase.from('advisory_requests').select('id, kind, crop, message, farmer_name, district, farmer_rating, expert_name').in('id', [...new Set(list.map((c) => c.ref_id))]);
  if (r.error) fail(r.error, 'Could not load the requests.');
  const byId = new Map(((r.data ?? []) as NonNullable<AnswerToCheck['request']>[]).map((q) => [q.id, q]));
  return list
    .map((contribution) => ({ contribution, request: byId.get(contribution.ref_id) ?? null }))
    .sort((a, b) => Number(b.request?.farmer_rating === 'not_helpful') - Number(a.request?.farmer_rating === 'not_helpful'));
}

export async function decideRate(rateId: string, ok: boolean): Promise<void> {
  const { error } = await supabase.rpc('kr_decide_rate', { p_rate: rateId, p_ok: ok });
  if (error) fail(error, 'Could not save the decision.');
}

export async function decideWork(id: number, ok: boolean): Promise<void> {
  const { error } = await supabase.rpc('kr_decide_work', { p_id: id, p_ok: ok });
  if (error) fail(error, 'Could not save the decision.');
}

/** Anyone signed in: is this rate right? Returns the rate's new status. */
export async function checkRate(rateId: string, correct: boolean, note?: string): Promise<string> {
  const { data, error } = await supabase.rpc('kr_check_rate', { p_rate: rateId, p_correct: correct, p_note: note?.trim() || null });
  if (error) fail(error, 'Could not save your check.');
  return String(data ?? '');
}

export async function myRateChecks(userId: string): Promise<Map<string, 'correct' | 'wrong'>> {
  const { data } = await supabase.from('mandi_rate_checks').select('rate_id, verdict').eq('user_id', userId).limit(1000);
  return new Map(((data ?? []) as Pick<RateCheck, 'rate_id' | 'verdict'>[]).map((c) => [c.rate_id, c.verdict]));
}

/** What the farmer said about the answers; undefined when it cannot be read (rating not set up yet). */
export async function adviceRating(requestId: string): Promise<'helpful' | 'not_helpful' | null | undefined> {
  const { data, error } = await supabase.from('advisory_requests').select('farmer_rating').eq('id', requestId).maybeSingle();
  if (error) return undefined;
  return ((data as { farmer_rating: 'helpful' | 'not_helpful' | null } | null)?.farmer_rating ?? null);
}

/** The farmer who asked says whether the expert's answer helped. */
export async function rateAdvice(requestId: string, helpful: boolean): Promise<void> {
  const { error } = await supabase.rpc('kr_rate_advice', { p_request: requestId, p_helpful: helpful });
  if (error) fail(error, 'Could not save your answer.');
}

/** Proof sent with an application: mandi / workplace, licence number, ID photo. */
export async function sendRoleProof(role: 'EXPERT' | 'DEALER' | 'REPORTER', input: { place: string; licence: string; photo: string | null }): Promise<void> {
  const { error } = await supabase.rpc('kr_role_proof', { p_role: role, p_place: input.place, p_licence: input.licence, p_photo: input.photo });
  if (error) fail(error, 'Could not send your documents.');
}
