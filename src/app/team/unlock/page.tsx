'use client';

/**
 * The way into the Admin pages (proxy.ts sends /admin/… here without the team
 * pass). Signed out: sign in first. Signed in but not the Super Admin or a
 * KashRoot team member with something ticked (kr_team_member): "page not
 * found" — nothing about Admin is shown. The team: two-step sign-in and the
 * admin code (AdminLock), then the server gives the team pass
 * (/api/team/session, which asks the database again) and the Admin page opens.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { AdminLock } from '@/components/admin/AdminLock';
import { authFetch } from '@/lib/auth-fetch';
import { supabase } from '@/lib/supabase';

/** Only an Admin page of this site (never another address). */
const safeNext = (raw: string | null) => (raw && /^\/admin(\/|\?|$)/.test(raw) && !raw.startsWith('//') ? raw : '/admin/dashboard');

type Who = 'checking' | 'signed-out' | 'outside' | 'team';

export default function TeamUnlockPage() {
  const [who, setWho] = useState<Who>('checking');
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return live && setWho('signed-out');
      const member = await supabase.rpc('kr_team_member');
      if (live) setWho(member.data === true ? 'team' : 'outside');
    })();
    return () => {
      live = false;
    };
  }, []);

  if (who === 'checking') return <Centre><Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Loading" /></Centre>;
  if (who === 'outside') return <NotFound />;
  if (who === 'signed-out') {
    return (
      <Centre>
        <p className="text-slate-700">Please sign in first.</p>
        <Link className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-5 font-semibold text-white" href={`/login/admin?next=${encodeURIComponent('/team/unlock')}`}>
          Sign in
        </Link>
      </Centre>
    );
  }
  return (
    <AdminLock>
      <TeamPass />
    </AdminLock>
  );
}

/** Two-step and the code passed: the server gives the team pass, then the Admin page opens. */
function TeamPass() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void authFetch('/api/team/session', { method: 'POST' }).then((r) => {
      if (r.ok) window.location.replace(safeNext(new URLSearchParams(window.location.search).get('next')));
      else setFailed(true);
    });
  }, []);
  return failed ? <NotFound /> : <Centre><Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Opening" /></Centre>;
}

function NotFound() {
  return (
    <Centre>
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">This page could not be found.</p>
      <Link className="mt-4 inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-emerald-800 underline" href="/">
        Go to KashRoot home
      </Link>
    </Centre>
  );
}

const Centre = ({ children }: { children: React.ReactNode }) => (
  <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center" data-team-unlock>
    {children}
  </main>
);
