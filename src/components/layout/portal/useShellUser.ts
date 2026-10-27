'use client';

/**
 * Who the portal frame shows in its top bar: the person signed in on this
 * device (name from their account) and whether they are signed in to this
 * portal (each portal has its own sign-in). Both null while checking, so
 * nothing flashes "Sign in" for someone who is signed in.
 */
import { useEffect, useState } from 'react';

import { useSignedIn } from '@/lib/auth/session';
import type { PortalId } from '@/lib/auth/roles';
import { supabase, supabaseConfigured } from '@/lib/supabase';

export function useShellUser(portal: PortalId | null): { signedIn: boolean | null; name: string | null } {
  const signedIn = useSignedIn(portal ?? undefined);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let live = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        if (!live || !user) return;
        setName(String(user.user_metadata?.full_name ?? '').trim() || (user.email ?? '').split('@')[0] || null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return { signedIn, name: signedIn ? name : null };
}
