/**
 * The KashRoot team pass (lib/server/teamPass) for the Admin pages.
 * POST   (Authorization: Bearer <the person's Supabase token>) → { sections } and
 *        the kr_team cookie, when the database says this person is the Super
 *        Admin ({'*'}) or a team member with sections ticked, now past two-step
 *        sign-in and their admin code; otherwise 403 and the cookie is cleared.
 *        30 a minute per network.
 * DELETE → clears the cookie (signing out, the Admin lock).
 */
import { NextResponse } from 'next/server';

import { sharedIpLimited } from '@/lib/server/sharedLimit';
import { clearTeamCookie, teamCookie } from '@/lib/server/teamPass';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export const dynamic = 'force-dynamic';

const refused = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { 'set-cookie': clearTeamCookie, 'cache-control': 'no-store' } });

export async function POST(request: Request) {
  if (await sharedIpLimited(request, 'team-session', 30)) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!token || token.length > 4096) return refused(401, 'Sign in first.');
  if (!origin || !anon) return refused(503, 'Not available.');
  const ask = (fn: string) =>
    fetch(`${origin}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
  try {
    // Who is asking (Supabase checks the token), and what the database lets them open.
    const [user, sections] = await Promise.all([
      fetch(`${origin}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5_000) }),
      ask('kr_team_sections'),
    ]);
    if (!user.ok || !sections.ok) return refused(403, 'Not available.');
    const id = String(((await user.json()) as { id?: string }).id ?? '');
    const list = (await sections.json()) as unknown;
    if (!id || !Array.isArray(list) || list.length === 0) return refused(403, 'Not available.');
    return NextResponse.json({ sections: list }, { headers: { 'set-cookie': teamCookie(request, id), 'cache-control': 'no-store' } });
  } catch {
    return refused(503, 'Not available. Please try again.');
  }
}

export function DELETE() {
  return NextResponse.json({ ok: true }, { headers: { 'set-cookie': clearTeamCookie, 'cache-control': 'no-store' } });
}
