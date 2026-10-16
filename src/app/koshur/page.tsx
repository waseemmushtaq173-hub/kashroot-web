'use client';

/**
 * /koshur — the Kashmiri Lab for Kashmiri editors (native speakers an admin
 * added in Admin → Kashmiri → Editors). Admins have it in Admin too.
 */
import { useEffect, useState } from 'react';
import { Home, Languages, Loader2, Wallet } from 'lucide-react';

import { KoshurLab } from '@/components/kashmiri/KoshurLab';
import { PortalShell } from '@/components/layout/PortalShell';
import { Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { loginHref } from '@/lib/auth/roles';
import { loadAccount, type Account } from '@/lib/db/client';
import { isKsEditor } from '@/lib/db/kashmiri';

const theme = PORTAL_THEMES.kissan;

export default function KoshurPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [editor, setEditor] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadAccount()
      .then(async (a) => {
        if (!live) return;
        setAccount(a);
        if (a) {
          const yes = await isKsEditor();
          if (live) setEditor(yes);
        }
      })
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);

  return (
    <PortalShell
      title="Kashmiri Lab"
      description="Teach KashRoot’s assistant proper Kashmiri: correct reported answers, add words with every vowel mark and check KashRoot’s own sentences."
      eyebrow="کٲشُر · Koshur"
      theme="kissan"
      navItems={[{ label: 'Home', href: '/', icon: Home }, { label: 'My work & pay', href: '/contributions', icon: Wallet }]}
    >
      {account === undefined || (account && editor === undefined) ? (
        <p className="flex items-center gap-2 p-6 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : account === null ? (
        <Panel theme={theme}>
          <EmptyState theme={theme} icon={Languages} title="Sign in to the Kashmiri Lab" text="Kashmiri editors sign in with their KashRoot account." action={<Btn theme={theme} href={loginHref('farmer', '/koshur')}>Sign in</Btn>} />
        </Panel>
      ) : editor === null ? (
        <Panel theme={theme}>
          <EmptyState theme={theme} icon={Languages} title="The Kashmiri Lab is not set up yet" text="The site owner needs to run the Kashmiri Lab SQL (20261019000000_kashmiri_lab.sql) in Supabase." />
        </Panel>
      ) : !editor ? (
        <Panel theme={theme}>
          <EmptyState
            theme={theme}
            icon={Languages}
            title="You are not a Kashmiri editor yet"
            text={`Native Kashmiri speakers can help KashRoot speak proper Kashmiri. Ask KashRoot to add ${account.email} as a Kashmiri editor, then open this page again.`}
          />
        </Panel>
      ) : (
        <KoshurLab />
      )}
    </PortalShell>
  );
}
