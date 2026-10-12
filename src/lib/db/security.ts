'use client';

/**
 * Admin lock and KYC status (supabase/migrations/20261014000000_trust_and_security.sql).
 *   Admin: after signing in, an admin also enters their own access code; the
 *   database refuses admin actions until then.
 *   KYC: money actions (selling, ordering, bookings, payout details) need a
 *   verified Aadhaar — and PAN when the admin switches that on. Checks are
 *   recorded by the KashRoot server only.
 */
import { dbMessage, supabase } from '@/lib/db/client';

export type AdminStatus = 'not_admin' | 'no_code' | 'blocked' | 'locked' | 'unlocked';
/** 'missing': the security SQL has not been run; 'offline': the check could not be made. */
export type AdminCheck = AdminStatus | 'missing' | 'offline';

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(error?.message && !/schema cache|does not exist/i.test(error.message) ? error.message : dbMessage(error, fallback));
};

/**
 * The Admin portal stays closed unless this answers "unlocked" — a missing
 * function or a failed check never opens it.
 */
export async function adminStatus(): Promise<AdminCheck> {
  const { data, error } = await supabase.rpc('kr_admin_status');
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist|schema cache/i.test(error.message ?? '');
    return missing ? 'missing' : 'offline';
  }
  const s = String(data);
  return (['not_admin', 'no_code', 'blocked', 'locked', 'unlocked'] as const).includes(s as AdminStatus) ? (s as AdminStatus) : 'offline';
}

export async function setAdminCode(code: string, oldCode?: string): Promise<void> {
  const { error } = await supabase.rpc('kr_admin_set_code', { p_new: code, p_old: oldCode ?? null });
  if (error) fail(error, 'Could not save the admin code.');
}

/** 'unlocked' | 'wrong' | 'blocked' | 'no_code' */
export async function unlockAdmin(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('kr_admin_unlock', { p_code: code });
  if (error) fail(error, 'Could not check the code.');
  return String(data);
}

export async function lockAdminNow(): Promise<void> {
  await supabase.rpc('kr_admin_lock_now');
}

export interface KycRules {
  kyc_required: boolean;
  pan_required: boolean;
  /** The server can record checks (KYC_DB_SECRET is set up). */
  recording: boolean;
}

export interface KycStatus {
  aadhaar_last4: string | null;
  aadhaar_name: string | null;
  aadhaar_method: string | null;
  aadhaar_verified_at: string | null;
  pan_last4: string | null;
  pan_verified_at: string | null;
}

/** null when the security SQL has not been run yet. */
export async function kycRules(): Promise<KycRules | null> {
  const { data, error } = await supabase.rpc('kr_kyc_rules');
  if (error || !data) return null;
  return data as KycRules;
}

export async function myKyc(userId: string): Promise<KycStatus | null> {
  const { data, error } = await supabase.from('identity_checks').select('aadhaar_last4, aadhaar_name, aadhaar_method, aadhaar_verified_at, pan_last4, pan_verified_at').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return (data as KycStatus | null) ?? null;
}

/** What is still missing for money actions: null when nothing is. */
export function kycMissing(rules: KycRules | null, status: KycStatus | null): 'aadhaar' | 'pan' | null {
  if (!rules?.kyc_required) return null;
  if (!status?.aadhaar_verified_at) return 'aadhaar';
  if (rules.pan_required && !status.pan_verified_at) return 'pan';
  return null;
}

export async function setKycRules(required: boolean, pan: boolean): Promise<void> {
  const { error } = await supabase.rpc('kr_set_kyc_rules', { p_required: required, p_pan: pan });
  if (error) fail(error, 'Could not save.');
}

/** Report a suspicious fertiliser batch — signed in or not. */
export async function reportBatch(code: string, note: string, phone?: string): Promise<void> {
  const { error } = await supabase.rpc('kr_report_batch', { p_code: code, p_note: note, p_phone: phone ?? null });
  if (error) fail(error, 'Could not send the report.');
}

export interface AdminMember {
  user_id: string;
  email: string;
  full_name: string;
  granted_at: string;
  has_code: boolean;
  is_me: boolean;
  is_owner: boolean;
}

/** The admin team; null when the admin-team SQL has not been run yet. */
export async function adminTeam(): Promise<AdminMember[] | null> {
  const { data, error } = await supabase.rpc('kr_admin_team');
  if (error) return null;
  return (data ?? []) as AdminMember[];
}

/** Owner only: give Admin access to an existing account by its email. */
export async function addAdmin(email: string): Promise<void> {
  const { error } = await supabase.rpc('kr_add_admin', { p_email: email });
  if (error) fail(error, 'Could not add this admin.');
}

/** Owner only: take Admin access away (their admin code is deleted too). */
export async function removeAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc('kr_revoke_role', { p_user: userId, p_role: 'ADMIN' });
  if (error) fail(error, 'Could not remove this admin.');
}
