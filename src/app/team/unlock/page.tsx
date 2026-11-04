'use client';

/**
 * The way into the Admin pages (proxy.ts sends /admin/… here without the team
 * pass). Reachable on any device: the team pass ("this device is marked") is
 * given at the END of this page, never needed to see it.
 *   - Signed out: sign in first (/login/admin, then back here).
 *   - Signed in, not the Super Admin or a KashRoot team member: "page not
 *     found" — nothing about Admin is shown.
 *   - An admin account while the database lacks the team update: what to run
 *     (components/admin/DatabaseUpdateNeeded), not a misleading "not found".
 *   - The team: two-step sign-in and the admin code (AdminLock), then the
 *     server gives the team pass (/api/team/session, which asks the database
 *     again) and the Admin page opens.
 * If the browser drops the pass (cookies blocked), it says so instead of
 * going round /admin → here → /admin.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { AdminLock } from '@/components/admin/AdminLock';
import { DatabaseUpdateNeeded } from '@/components/admin/DatabaseUpdateNeeded';
import { authFetch } from '@/lib/auth-fetch';
import { safeTeamNext as safeNext, teamStatus, type TeamStatus } from '@/lib/client/teamCheck';
import { supabase } from '@/lib/supabase';

/** When the pass was last given in this tab: back here within this time means the browser did not keep it. */
const PASS_AT = 'kr_team_pass_at';
const LOOP_MS = 20_000;

type Who = 'checking' | 'signed-out' | 'pass-dropped' | TeamStatus;

export default function TeamUnlockPage() {
  const [who, setWho] = useState<Who>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return live && setWho('signed-out');
      const status = await teamStatus();
      if (!live) return;
      let dropped = false;
      try {
        dropped = status === 'member' && Date.now() - Number(sessionStorage.getItem(PASS_AT) ?? 0) < LOOP_MS;
        sessionStorage.removeItem(PASS_AT);
      } catch {
        /* storage blocked */
      }
      setWho(dropped ? 'pass-dropped' : status);
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  if (who === 'checking') return <Centre><Loader2 className="h-6 w-6 animate-spin text-slate-600" aria-label="Loading" /></Centre>;
  if (who === 'outside') return <NotFound />;
  if (who === 'needs-update') return <Centre><DatabaseUpdateNeeded /></Centre>;
  if (who === 'error') {
    return (
      <Centre>
        <p className="text-slate-800">Could not check right now. Please try again.</p>
        <button type="button" onClick={() => { setWho('checking'); setAttempt((n) => n + 1); }} className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-chinar px-5 font-semibold text-white hover:bg-chinar-hover">
          Try again
        </button>
      </Centre>
    );
  }
  if (who === 'pass-dropped') {
    return (
      <Centre>
        <h1 className="font-display text-2xl font-semibold text-slate-900">This browser did not keep the Admin pass</h1>
        <p className="mt-3 text-slate-700">Allow cookies for this site (or leave private browsing that blocks them), then try again.</p>
        <button type="button" onClick={() => { setWho('checking'); setAttempt((n) => n + 1); }} className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-chinar px-5 font-semibold text-white hover:bg-chinar-hover">
          Try again
        </button>
      </Centre>
    );
  }
  if (who === 'signed-out') {
    const next = `/team/unlock${typeof window === 'undefined' ? '' : window.location.search}`;
    return (
      <Centre>
        <p className="text-slate-800">Please sign in first.</p>
        <Link className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-chinar px-5 font-semibold text-white no-underline hover:bg-chinar-hover hover:no-underline" href={`/login/admin?next=${encodeURIComponent(next)}`}>
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

/** Two-step and the code passed: the server gives the team pass (marks this browser), then the Admin page opens. */
function TeamPass() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void authFetch('/api/team/session', { method: 'POST' }).then((r) => {
      if (!r.ok) return setFailed(true);
      try {
        sessionStorage.setItem(PASS_AT, String(Date.now()));
      } catch {
        /* storage blocked */
      }
      window.location.replace(safeNext(new URLSearchParams(window.location.search).get('next')));
    });
  }, []);
  return failed ? <NotFound /> : <Centre><Loader2 className="h-6 w-6 animate-spin text-slate-600" aria-label="Opening" /></Centre>;
}

function NotFound() {
  return (
    <Centre>
      <h1 className="font-display text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-700">This page could not be found.</p>
      <Link className="mt-4 inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-chinar underline" href="/">
        Go to KashRoot home
      </Link>
    </Centre>
  );
}

/** Ivory page, white card, dark text: readable whatever the page behind it (the site's body is dark). */
const Centre = ({ children }: { children: React.ReactNode }) => (
  <main className="kr-light flex min-h-screen items-center justify-center bg-ivory px-4 py-10 text-slate-900" data-team-unlock>
    <div className="flex w-full max-w-lg flex-col items-center rounded-3xl bg-white p-8 text-center shadow-[0_12px_40px_rgba(15,23,42,0.10)] ring-1 ring-[#E8A317]/30">{children}</div>
  </main>
);
