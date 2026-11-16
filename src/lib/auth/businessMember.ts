'use client';

/**
 * Is the signed-in person part of a business (owner, manager or staff of a cold store, dealership, shop or helper
 * team)? Only they are shown anything of the Business admin: customers never see it. Asked of the database as the
 * person (their own org_members row, which only they can read), kept for ten minutes in this tab so it is asked once.
 * null while it is not known (or nobody is signed in): nothing of the Business admin shows until it is true.
 */
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

const KEY = 'kr_business_member';
const TTL = 10 * 60_000;

export async function isBusinessMember(): Promise<boolean | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (!id) return null;
    try {
      const kept = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { id: string; member: boolean; at: number } | null;
      if (kept && kept.id === id && Date.now() - kept.at < TTL) return kept.member;
    } catch {
      /* private mode: ask the database */
    }
    const { data: rows, error } = await supabase.from('org_members').select('org_id').eq('user_id', id).limit(1);
    if (error) return null;
    const member = (rows ?? []).length > 0;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ id, member, at: Date.now() }));
    } catch {
      /* nothing kept */
    }
    return member;
  } catch {
    return null;
  }
}

/** true for a member of a business, false for anyone else signed in, null while unknown or signed out. */
export function useBusinessMember(): boolean | null {
  const [member, setMember] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void isBusinessMember().then((m) => {
      if (live) setMember(m);
    });
    return () => {
      live = false;
    };
  }, []);
  return member;
}
