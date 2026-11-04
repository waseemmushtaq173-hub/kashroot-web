'use client';

/**
 * The Admin card and menu item show ONLY to the Super Admin and KashRoot team
 * members with something ticked (20261117000000_kashroot_team.sql,
 * kr_team_member) — asked of the database for the account signed in now,
 * never remembered in the browser. Dealers, businesses, farmers and buyers
 * never see them, whoever used the phone before. Showing them unlocks
 * nothing: the Admin pages need the team pass, two-step sign-in and the
 * admin code, and the database checks every section again.
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';

import { teamStatus } from '@/lib/client/teamCheck';
import { supabase } from '@/lib/supabase';

/** Before this, opening the Admin sign-in once showed the card on that device for every account; that note is removed. */
const OLD_KEY = 'kr_admin_device';

let asked: { user: string; answer: Promise<boolean> } | null = null;

async function isTeamMember(): Promise<boolean> {
  try {
    localStorage.removeItem(OLD_KEY);
  } catch {
    /* storage blocked */
  }
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user.id;
  if (!user) return false;
  if (asked?.user !== user) {
    asked = {
      user,
      // An admin while the database lacks the team update sees the way in too (it explains what to run).
      answer: teamStatus().then((s) => s === 'member' || s === 'needs-update'),
    };
  }
  return asked.answer;
}

export function useShowAdmin(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    const run = async () => {
      const yes = await isTeamMember();
      if (live) setShow(yes);
    };
    void run();
    // Signing in or out on this page: ask again for the new account.
    const { data } = supabase.auth.onAuthStateChange(() => {
      asked = null;
      void run();
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return show;
}

/**
 * The owner's private way in on a new laptop or phone: tap the KashRoot logo
 * in the top bar 5 times within 3 seconds. It only opens the Admin sign-in;
 * nothing is shown or remembered, and everything after it still needs a
 * KashRoot team account, two-step sign-in and the admin code.
 */
export function useSecretAdminTap() {
  const taps = useRef<number[]>([]);
  const router = useRouter();
  return (e: MouseEvent) => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      e.preventDefault();
      taps.current = [];
      router.push('/login/admin');
    }
  };
}
