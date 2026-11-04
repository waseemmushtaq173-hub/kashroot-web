'use client';

/**
 * Is the account signed in now the Super Admin or a KashRoot team member?
 * Asked of the database (kr_team_member, 20261117000000_kashroot_team.sql).
 *
 * The answers keep apart what used to look the same ("Page not found"):
 *   - 'member'        the database says yes;
 *   - 'outside'       the database says no (nothing about Admin is shown);
 *   - 'needs-update'  the database does not have the team update yet, and the
 *                     account is an admin there (kr_is_admin_account, from the
 *                     earlier admin lock): Admin explains what to run instead of
 *                     hiding itself from its own owner;
 *   - 'error'         no answer (signal, the database busy): try again.
 * Saying 'needs-update' opens nothing: every Admin page still needs the team
 * pass, which the server gives only when the database says yes.
 */
import { supabase } from '@/lib/supabase';

export type TeamStatus = 'member' | 'outside' | 'needs-update' | 'error';

/** PostgREST: the function is not in the database (not run yet). */
export const functionMissing = (error: { code?: string } | null | undefined) => error?.code === 'PGRST202' || error?.code === '42883';

export async function teamStatus(): Promise<TeamStatus> {
  try {
    const member = await supabase.rpc('kr_team_member');
    if (!member.error) return member.data === true ? 'member' : 'outside';
    if (!functionMissing(member.error)) return 'error';
    const admin = await supabase.rpc('kr_is_admin_account');
    if (admin.error) return functionMissing(admin.error) ? 'outside' : 'error';
    return admin.data === true ? 'needs-update' : 'outside';
  } catch {
    return 'error';
  }
}

export { safeTeamNext } from '@/lib/teamNext';
